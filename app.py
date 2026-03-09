from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import uuid
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, List

import edge_tts
from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, epub
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from gtts import gTTS
from pypdf import PdfReader

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_SEGMENT_CHARS = 2800
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

JOBS: dict[str, dict[str, Any]] = {}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/convert")
async def create_convert_job(
    file: UploadFile = File(...),
    voice: str = DEFAULT_VOICE,
    rate: str = "+0%",
    volume: str = "+0%",
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="僅支援 PDF / EPUB / TXT")

    job_id = uuid.uuid4().hex[:12]
    upload_path = UPLOAD_DIR / f"{job_id}{ext}"
    with upload_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 3,
        "message": "任務已建立，等待開始",
        "title": Path(file.filename or "book").stem,
        "author": "未知作者",
        "file_type": ext.lstrip(".").upper(),
        "text_chars": 0,
        "segment_count": 0,
        "bundle_type": None,
        "download_url": None,
        "merged_download_url": None,
        "segments": [],
        "error": None,
    }

    asyncio.create_task(
        run_conversion_job(
            job_id=job_id,
            upload_path=upload_path,
            voice=VOICE_ALIASES.get(voice, voice or DEFAULT_VOICE),
            rate=normalize_signed_percent(rate),
            volume=normalize_signed_percent(volume),
        )
    )
    return JSONResponse({"job_id": job_id, "status": "queued", "progress": 3})


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="找不到任務")
    return JSONResponse(job)


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
    elif file_path.suffix.lower() == ".json":
        media_type = "application/json"
    return FileResponse(file_path, media_type=media_type, filename=file_path.name)


async def run_conversion_job(job_id: str, upload_path: Path, voice: str, rate: str, volume: str):
    job = JOBS[job_id]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        update_job(job_id, status="processing", progress=8, message="正在解析電子書")
        book = extract_book(upload_path)
        cleaned_text = normalize_text(book.text)
        if not cleaned_text:
            raise ValueError("無法從電子書抽取文字")

        update_job(
            job_id,
            title=book.title,
            author=book.author,
            file_type=book.file_type,
            text_chars=len(cleaned_text),
            progress=20,
            message="文字抽取完成，正在切分段落",
        )

        segments = split_into_segments(cleaned_text, MAX_SEGMENT_CHARS)
        if not segments:
            raise ValueError("沒有可轉換的文字段落")
        update_job(job_id, segment_count=len(segments), progress=28, message=f"已切成 {len(segments)} 段，開始產生 MP3")

        audio_files = await synthesize_segments(job_id, job_dir, segments, voice, rate, volume)

        update_job(job_id, progress=92, message="正在合併整本 MP3")
        merged_path = merge_mp3_files(job_dir, audio_files)

        manifest = build_manifest(job_id, book, cleaned_text, segments, audio_files, merged_path)
        zip_path = build_zip_bundle(job_dir, audio_files, manifest, merged_path)
        manifest["download_url"] = f"/downloads/{job_id}/{zip_path.name}" if len(audio_files) > 1 else f"/downloads/{job_id}/{merged_path.name}"
        manifest["bundle_type"] = "segmented_zip" if len(audio_files) > 1 else "single_mp3"
        manifest["merged_download_url"] = f"/downloads/{job_id}/{merged_path.name}"

        (job_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        completed_manifest = dict(manifest)
        completed_manifest.pop("job_id", None)
        update_job(
            job_id,
            **completed_manifest,
            status="completed",
            progress=100,
            message=("大型電子書已自動分段，並額外提供整本 MP3。" if len(audio_files) > 1 else "音檔已完成。"),
        )
    except Exception as exc:
        update_job(job_id, status="failed", progress=100, message="轉檔失敗", error=str(exc))
    finally:
        upload_path.unlink(missing_ok=True)


def update_job(job_id: str, **kwargs):
    JOBS[job_id].update(kwargs)


def build_manifest(job_id: str, book: BookData, cleaned_text: str, segments: List[str], audio_files: List[Path], merged_path: Path) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "title": book.title,
        "author": book.author,
        "file_type": book.file_type,
        "voice": JOBS[job_id].get("voice", DEFAULT_VOICE),
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
        "merged_filename": merged_path.name,
    }


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
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)


def read_epub(path: Path) -> tuple[str, str, str]:
    book = epub.read_epub(str(path))
    title_meta = book.get_metadata("DC", "title")
    author_meta = book.get_metadata("DC", "creator")
    title = str(title_meta[0][0]) if title_meta else ""
    author = str(author_meta[0][0]) if author_meta else ""
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


async def synthesize_segments(job_id: str, job_dir: Path, segments: List[str], voice: str, rate: str, volume: str) -> List[Path]:
    audio_files: List[Path] = []
    total = len(segments)
    for index, segment in enumerate(segments, start=1):
        target = job_dir / f"segment-{index:03d}.mp3"
        try:
            communicate = edge_tts.Communicate(text=segment, voice=voice, rate=rate, volume=volume)
            await communicate.save(str(target))
        except Exception:
            language = guess_gtts_lang(voice, segment)
            tts = gTTS(text=segment, lang=language)
            tts.save(str(target))
        audio_files.append(target)
        progress = 28 + int((index / total) * 60)
        update_job(job_id, progress=min(progress, 90), message=f"正在產生第 {index}/{total} 段 MP3")
    return audio_files


def merge_mp3_files(job_dir: Path, audio_files: List[Path]) -> Path:
    merged_path = job_dir / "audiobook-full.mp3"
    with merged_path.open("wb") as out:
        for audio in audio_files:
            out.write(audio.read_bytes())
    return merged_path


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
    return f"{sign}{int(float(number))}%"


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


def build_zip_bundle(job_dir: Path, audio_files: List[Path], manifest: dict[str, Any], merged_path: Path) -> Path:
    zip_path = job_dir / "audiobook-package.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(merged_path, arcname=merged_path.name)
        for audio in audio_files:
            zf.write(audio, arcname=audio.name)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return zip_path


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
