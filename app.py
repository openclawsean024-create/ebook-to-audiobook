from __future__ import annotations

import json
import os
import re
import shutil
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import List

import edge_tts
from bs4 import BeautifulSoup
from gtts import gTTS
from ebooklib import epub, ITEM_DOCUMENT
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_SEGMENT_CHARS = 2800
SINGLE_FILE_THRESHOLD = 1
ALLOWED_EXTENSIONS = {".pdf", ".epub", ".txt"}
VOICE_ALIASES = {
    "zh-CN-Xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "zh-CN-XiaoxiaoNeural": "zh-CN-XiaoxiaoNeural",
    "zh-CN-Yunxi": "zh-CN-YunxiNeural",
    "zh-CN-YunxiNeural": "zh-CN-YunxiNeural",
    "en-US-Jenny": "en-US-JennyNeural",
    "en-US-JennyNeural": "en-US-JennyNeural",
    "ja-JP-Nanami": "ja-JP-NanamiNeural",
    "ja-JP-NanamiNeural": "ja-JP-NanamiNeural",
}


@dataclass
class BookData:
    title: str
    author: str
    file_type: str
    text: str


app = FastAPI(title="ebook-to-audiobook")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if (BASE_DIR / "index.html").exists():
    app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/convert")
async def convert_ebook(
    file: UploadFile = File(...),
    voice: str = DEFAULT_VOICE,
    rate: str = "+0%",
    volume: str = "+0%",
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="僅支援 PDF / EPUB / TXT")

    job_id = uuid.uuid4().hex[:12]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    upload_path = UPLOAD_DIR / f"{job_id}{ext}"

    try:
        with upload_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        resolved_voice = VOICE_ALIASES.get(voice, voice or DEFAULT_VOICE)
        book = extract_book(upload_path)
        cleaned_text = normalize_text(book.text)
        if not cleaned_text:
            raise HTTPException(status_code=400, detail="無法從電子書抽取文字")

        segments = split_into_segments(cleaned_text, MAX_SEGMENT_CHARS)
        audio_files = await synthesize_segments(
            job_dir=job_dir,
            segments=segments,
            voice=resolved_voice,
            rate=normalize_signed_percent(rate),
            volume=normalize_signed_percent(volume),
        )

        manifest = {
            "job_id": job_id,
            "title": book.title,
            "author": book.author,
            "file_type": book.file_type,
            "voice": resolved_voice,
            "segment_count": len(audio_files),
            "text_chars": len(cleaned_text),
            "segments": [
                {
                    "index": i + 1,
                    "chars": len(segment),
                    "filename": path.name,
                    "download_url": f"/downloads/{job_id}/{path.name}",
                    "preview": segment[:120],
                }
                for i, (segment, path) in enumerate(zip(segments, audio_files))
            ],
        }

        if len(audio_files) <= SINGLE_FILE_THRESHOLD:
            manifest["bundle_type"] = "single_mp3"
            manifest["download_url"] = f"/downloads/{job_id}/{audio_files[0].name}"
        else:
            zip_path = build_zip_bundle(job_dir=job_dir, audio_files=audio_files, manifest=manifest)
            manifest["bundle_type"] = "segmented_zip"
            manifest["download_url"] = f"/downloads/{job_id}/{zip_path.name}"
            manifest["note"] = "檔案較大，已自動分段並打包成 ZIP。"

        manifest_path = job_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return JSONResponse(manifest)
    finally:
        if upload_path.exists():
            upload_path.unlink(missing_ok=True)


@app.get("/downloads/{job_id}/{filename}")
def download_file(job_id: str, filename: str):
    file_path = OUTPUT_DIR / job_id / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="找不到檔案")
    media_type = "application/octet-stream"
    if file_path.suffix.lower() == ".mp3":
        media_type = "audio/mpeg"
    elif file_path.suffix.lower() == ".zip":
        media_type = "application/zip"
    return FileResponse(file_path, media_type=media_type, filename=file_path.name)


def extract_book(path: Path) -> BookData:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return BookData(title=path.stem, author="未知作者", file_type="TXT", text=read_txt(path))
    if suffix == ".pdf":
        return BookData(title=path.stem, author="未知作者", file_type="PDF", text=read_pdf(path))
    if suffix == ".epub":
        title, author, text = read_epub(path)
        return BookData(title=title or path.stem, author=author or "未知作者", file_type="EPUB", text=text)
    raise HTTPException(status_code=400, detail="不支援的格式")


def read_txt(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "cp950", "big5", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def read_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    texts = []
    for page in reader.pages:
        texts.append(page.extract_text() or "")
    return "\n\n".join(texts)


def read_epub(path: Path) -> tuple[str, str, str]:
    book = epub.read_epub(str(path))
    title = ""
    author = ""
    title_meta = book.get_metadata("DC", "title")
    author_meta = book.get_metadata("DC", "creator")
    if title_meta:
        title = str(title_meta[0][0])
    if author_meta:
        author = str(author_meta[0][0])

    parts: List[str] = []
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text(" ", strip=True)
        if text:
            parts.append(text)
    return title, author, "\n\n".join(parts)


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ ]+\n", "\n", text)
    return text.strip()


def split_into_segments(text: str, max_chars: int) -> List[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return []

    segments: List[str] = []
    buffer = ""
    for para in paragraphs:
        candidate = f"{buffer}\n\n{para}".strip() if buffer else para
        if len(candidate) <= max_chars:
            buffer = candidate
            continue

        if buffer:
            segments.append(buffer)
            buffer = ""

        if len(para) <= max_chars:
            buffer = para
            continue

        sentences = [s.strip() for s in re.split(r"(?<=[。！？.!?])", para) if s.strip()]
        sentence_buffer = ""
        for sentence in sentences:
            candidate = f"{sentence_buffer} {sentence}".strip() if sentence_buffer else sentence
            if len(candidate) <= max_chars:
                sentence_buffer = candidate
            else:
                if sentence_buffer:
                    segments.append(sentence_buffer)
                if len(sentence) <= max_chars:
                    sentence_buffer = sentence
                else:
                    for i in range(0, len(sentence), max_chars):
                        segments.append(sentence[i : i + max_chars])
                    sentence_buffer = ""
        if sentence_buffer:
            buffer = sentence_buffer

    if buffer:
        segments.append(buffer)

    return segments


async def synthesize_segments(job_dir: Path, segments: List[str], voice: str, rate: str, volume: str) -> List[Path]:
    audio_files: List[Path] = []
    if not segments:
        raise HTTPException(status_code=400, detail="沒有可轉換的文字段落")

    last_error: Exception | None = None
    for index, segment in enumerate(segments, start=1):
        target = job_dir / f"segment-{index:03d}.mp3"
        try:
            communicate = edge_tts.Communicate(text=segment, voice=voice, rate=rate, volume=volume)
            await communicate.save(str(target))
        except Exception as exc:
            last_error = exc
            language = guess_gtts_lang(voice, segment)
            try:
                tts = gTTS(text=segment, lang=language)
                tts.save(str(target))
            except Exception as gtts_exc:
                last_error = gtts_exc
                raise HTTPException(status_code=502, detail=f"TTS 轉檔失敗：{gtts_exc}") from gtts_exc
        audio_files.append(target)

    if not audio_files and last_error:
        raise HTTPException(status_code=502, detail=f"TTS 轉檔失敗：{last_error}")
    return audio_files


def normalize_signed_percent(value: str) -> str:
    raw = (value or "0").strip().replace("%", "")
    if not raw:
        raw = "0"
    if raw.startswith(("+", "-")):
        sign = raw[0]
        number = raw[1:] or "0"
    else:
        sign = "+"
        number = raw
    try:
        int(float(number))
    except ValueError:
        return "+0%"
    number = str(int(float(number)))
    return f"{sign}{number}%"


def guess_gtts_lang(voice: str, text: str) -> str:
    voice_lower = (voice or "").lower()
    if "ja-" in voice_lower:
        return "ja"
    if "en-" in voice_lower:
        return "en"
    if "zh-" in voice_lower:
        return "zh-TW"
    if re.search(r"[ぁ-んァ-ヶ]", text):
        return "ja"
    if re.search(r"[a-zA-Z]", text) and not re.search(r"[\u4e00-\u9fff]", text):
        return "en"
    return "zh-TW"


def build_zip_bundle(job_dir: Path, audio_files: List[Path], manifest: dict) -> Path:
    zip_path = job_dir / "audiobook-segments.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for audio in audio_files:
            zf.write(audio, arcname=audio.name)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return zip_path


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
