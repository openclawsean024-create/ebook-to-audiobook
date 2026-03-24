from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
DATA_DIR = BASE_DIR / ".data"
JOBS_FILE = DATA_DIR / "jobs.json"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_SEGMENT_CHARS = 2800
MAX_CHAPTER_CHARS = 12000
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
class ChapterData:
    title: str
    text: str


@dataclass
class BookData:
    title: str
    author: str
    file_type: str
    text: str
    chapters: list[ChapterData]


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


def load_jobs() -> dict[str, dict[str, Any]]:
    if not JOBS_FILE.exists():
        return {}
    try:
        return json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def persist_jobs() -> None:
    JOBS_FILE.write_text(json.dumps(JOBS, ensure_ascii=False, indent=2), encoding="utf-8")


JOBS.update(load_jobs())


@app.get("/health")
def health():
    return {"ok": True, "jobs": len(JOBS)}


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

    resolved_voice = VOICE_ALIASES.get(voice, voice or DEFAULT_VOICE)
    normalized_rate = normalize_signed_percent(rate)
    normalized_volume = normalize_signed_percent(volume)

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "stage": "queued",
        "progress": 3,
        "message": "任務已建立，等待開始",
        "title": Path(file.filename or "book").stem,
        "author": "未知作者",
        "file_type": ext.lstrip(".").upper(),
        "voice": resolved_voice,
        "rate": normalized_rate,
        "volume": normalized_volume,
        "text_chars": 0,
        "chapter_count": 0,
        "segment_count": 0,
        "bundle_type": None,
        "merge_strategy": None,
        "download_url": None,
        "merged_download_url": None,
        "zip_download_url": None,
        "manifest_download_url": None,
        "chapter_files": [],
        "chapters": [],
        "segments": [],
        "error": None,
    }

    persist_jobs()

    asyncio.create_task(
        run_conversion_job(
            job_id=job_id,
            upload_path=upload_path,
            voice=resolved_voice,
            rate=normalized_rate,
            volume=normalized_volume,
        )
    )
    return JSONResponse({"job_id": job_id, "status": "queued", "stage": "queued", "progress": 3})


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="找不到任務")
    return JSONResponse(job)


@app.get("/downloads/{job_id}/{filename}")
def download_file(job_id: str, filename: str):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="無效的檔名")

    file_path = OUTPUT_DIR / job_id / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="找不到檔案")

    media_type = "application/octet-stream"
    suffix = file_path.suffix.lower()
    if suffix == ".mp3":
        media_type = "audio/mpeg"
    elif suffix == ".zip":
        media_type = "application/zip"
    elif suffix == ".json":
        media_type = "application/json"
    return FileResponse(file_path, media_type=media_type, filename=file_path.name)


async def run_conversion_job(job_id: str, upload_path: Path, voice: str, rate: str, volume: str):
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        update_job(job_id, status="processing", stage="parsing", progress=8, message="正在解析電子書", error=None)
        book = extract_book(upload_path)
        cleaned_text = normalize_text(book.text)
        if not cleaned_text:
            raise ValueError("無法從電子書抽取文字")

        chapter_plan = build_chapter_plan(book, cleaned_text)

        update_job(
            job_id,
            title=book.title,
            author=book.author,
            file_type=book.file_type,
            text_chars=len(cleaned_text),
            chapter_count=len(chapter_plan),
            stage="chunking",
            progress=20,
            message="文字抽取完成，正在切分章節與段落",
        )

        chapter_outputs = []
        all_segments: list[tuple[int, str, Path]] = []
        global_segment_index = 1
        total_chapters = len(chapter_plan)

        for chapter_index, chapter in enumerate(chapter_plan, start=1):
            chapter_dir = job_dir / f"chapter-{chapter_index:03d}"
            chapter_dir.mkdir(exist_ok=True)
            chapter_segments = split_into_segments(chapter.text, MAX_SEGMENT_CHARS)
            if not chapter_segments:
                continue

            update_job(
                job_id,
                stage="synthesizing",
                progress=min(25 + int((chapter_index / max(total_chapters, 1)) * 40), 70),
                message=f"正在產生第 {chapter_index}/{total_chapters} 章音訊",
            )

            audio_files = await synthesize_segments(job_id, chapter_dir, chapter_segments, voice, rate, volume, chapter_index, total_chapters)
            chapter_merged = merge_mp3_files(job_id, chapter_dir, audio_files, output_name=f"chapter-{chapter_index:03d}.mp3")

            chapter_outputs.append({
                "index": chapter_index,
                "title": chapter.title,
                "text": chapter.text,
                "segments": chapter_segments,
                "audio_files": audio_files,
                "merged_path": chapter_merged,
            })

            for segment, path in zip(chapter_segments, audio_files):
                all_segments.append((global_segment_index, segment, path))
                global_segment_index += 1

        if not chapter_outputs:
            raise ValueError("沒有可轉換的章節內容")

        merged_path = merge_mp3_files(job_id, job_dir, [chapter["merged_path"] for chapter in chapter_outputs], output_name="audiobook-full.mp3")

        update_job(job_id, stage="packaging", progress=92, message="正在整理章節輸出與 manifest")
        manifest = build_manifest(job_id, book, cleaned_text, chapter_outputs, all_segments, merged_path)
        manifest["merge_strategy"] = JOBS[job_id].get("merge_strategy")
        manifest_path = job_dir / "manifest.json"
        manifest["manifest_download_url"] = f"/downloads/{job_id}/{manifest_path.name}"

        zip_path = build_zip_bundle(job_dir, chapter_outputs, manifest, merged_path)
        manifest["bundle_type"] = "chapter_bundle"
        manifest["download_url"] = f"/downloads/{job_id}/{zip_path.name}"
        manifest["zip_download_url"] = f"/downloads/{job_id}/{zip_path.name}"
        manifest["merged_download_url"] = f"/downloads/{job_id}/{merged_path.name}"
        manifest["message"] = "已完成章節級輸出、整本 MP3 與完整 manifest。"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        rebuild_zip_manifest(zip_path, manifest)

        completed = dict(manifest)
        completed.pop("job_id", None)
        completed.pop("message", None)
        update_job(job_id, **completed, status="completed", stage="completed", progress=100, message=manifest["message"], error=None)
    except Exception as exc:
        update_job(
            job_id,
            status="failed",
            stage="failed",
            progress=100,
            message="轉檔失敗",
            bundle_type=None,
            merge_strategy=None,
            download_url=None,
            merged_download_url=None,
            zip_download_url=None,
            manifest_download_url=None,
            chapter_files=[],
            chapters=[],
            segments=[],
            error=str(exc),
        )
    finally:
        upload_path.unlink(missing_ok=True)


def update_job(job_id: str, **kwargs):
    JOBS[job_id].update(kwargs)
    persist_jobs()


def build_manifest(
    job_id: str,
    book: BookData,
    cleaned_text: str,
    chapter_outputs: list[dict[str, Any]],
    all_segments: list[tuple[int, str, Path]],
    merged_path: Path,
) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "title": book.title,
        "author": book.author,
        "file_type": book.file_type,
        "voice": JOBS[job_id].get("voice", DEFAULT_VOICE),
        "rate": JOBS[job_id].get("rate", "+0%"),
        "volume": JOBS[job_id].get("volume", "+0%"),
        "chapter_count": len(chapter_outputs),
        "segment_count": len(all_segments),
        "text_chars": len(cleaned_text),
        "merged_filename": merged_path.name,
        "chapter_files": [
            {
                "index": chapter["index"],
                "title": chapter["title"],
                "filename": chapter["merged_path"].name,
                "download_url": f"/downloads/{job_id}/{chapter['merged_path'].name}",
                "segment_count": len(chapter["audio_files"]),
                "chars": len(chapter["text"]),
                "preview": chapter["text"][:160],
            }
            for chapter in chapter_outputs
        ],
        "chapters": [
            {
                "index": chapter["index"],
                "title": chapter["title"],
                "chars": len(chapter["text"]),
                "segment_count": len(chapter["audio_files"]),
                "audio_file": chapter["merged_path"].name,
                "audio_download_url": f"/downloads/{job_id}/{chapter['merged_path'].name}",
                "segments": [
                    {
                        "index": segment_index + 1,
                        "chars": len(segment),
                        "filename": path.name,
                        "download_url": f"/downloads/{job_id}/{path.name}",
                        "preview": segment[:120],
                    }
                    for segment_index, (segment, path) in enumerate(zip(chapter["segments"], chapter["audio_files"]))
                ],
            }
            for chapter in chapter_outputs
        ],
        "segments": [
            {
                "index": index,
                "chars": len(segment),
                "filename": path.name,
                "download_url": f"/downloads/{job_id}/{path.name}",
                "preview": segment[:120],
            }
            for index, segment, path in all_segments
        ],
    }


def extract_book(path: Path) -> BookData:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        text = read_txt(path)
        return BookData(title=path.stem, author="未知作者", file_type="TXT", text=text, chapters=[])
    if suffix == ".pdf":
        text = read_pdf(path)
        return BookData(title=path.stem, author="未知作者", file_type="PDF", text=text, chapters=[])
    if suffix == ".epub":
        title, author, text, chapters = read_epub(path)
        return BookData(title=title or path.stem, author=author or "未知作者", file_type="EPUB", text=text, chapters=chapters)
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


def read_epub(path: Path) -> tuple[str, str, str, list[ChapterData]]:
    book = epub.read_epub(str(path))
    title_meta = book.get_metadata("DC", "title")
    author_meta = book.get_metadata("DC", "creator")
    title = str(title_meta[0][0]) if title_meta else ""
    author = str(author_meta[0][0]) if author_meta else ""
    parts: list[str] = []
    chapters: list[ChapterData] = []
    chapter_counter = 1
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text(" ", strip=True)
        if text:
            parts.append(text)
            heading = soup.find(["h1", "h2", "h3"])
            chapter_title = heading.get_text(" ", strip=True) if heading else f"Chapter {chapter_counter}"
            chapters.append(ChapterData(title=chapter_title, text=text))
            chapter_counter += 1
    return title, author, "\n\n".join(parts), chapters


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ ]+\n", "\n", text)
    return text.strip()


def build_chapter_plan(book: BookData, cleaned_text: str) -> list[ChapterData]:
    if book.chapters:
        normalized = [ChapterData(title=chapter.title, text=normalize_text(chapter.text)) for chapter in book.chapters if normalize_text(chapter.text)]
        if normalized:
            return normalized

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", cleaned_text) if p.strip()]
    if not paragraphs:
        return []

    chapters: list[ChapterData] = []
    buffer = ""
    chapter_index = 1
    for para in paragraphs:
        candidate = f"{buffer}\n\n{para}".strip() if buffer else para
        if len(candidate) <= MAX_CHAPTER_CHARS:
            buffer = candidate
        else:
            if buffer:
                chapters.append(ChapterData(title=f"Chapter {chapter_index}", text=buffer))
                chapter_index += 1
            buffer = para
    if buffer:
        chapters.append(ChapterData(title=f"Chapter {chapter_index}", text=buffer))
    return chapters


def split_into_segments(text: str, max_chars: int) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return []

    segments: list[str] = []
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


async def synthesize_segments(
    job_id: str,
    job_dir: Path,
    segments: list[str],
    voice: str,
    rate: str,
    volume: str,
    chapter_index: int,
    total_chapters: int,
) -> list[Path]:
    audio_files: list[Path] = []
    total = len(segments)
    for index, segment in enumerate(segments, start=1):
        target = job_dir / f"segment-{index:03d}.mp3"
        try:
            communicate = edge_tts.Communicate(text=segment, voice=voice, rate=rate, volume=volume)
            await communicate.save(str(target))
        except Exception:
            language = guess_gtts_lang(voice, segment)
            gTTS(text=segment, lang=language).save(str(target))
        audio_files.append(target)
        progress = 28 + int(((chapter_index - 1) + (index / total)) / max(total_chapters, 1) * 55)
        update_job(job_id, stage="synthesizing", progress=min(progress, 88), message=f"正在產生第 {chapter_index}/{total_chapters} 章，第 {index}/{total} 段 MP3")
    return audio_files


def merge_mp3_files(job_id: str, job_dir: Path, audio_files: list[Path], output_name: str) -> Path:
    merged_path = job_dir / output_name
    ffmpeg_path = shutil.which("ffmpeg")

    if ffmpeg_path and try_ffmpeg_concat(ffmpeg_path, job_dir, audio_files, merged_path):
        update_job(job_id, merge_strategy="ffmpeg_concat")
        return merged_path

    with merged_path.open("wb") as out:
        for audio in audio_files:
            out.write(audio.read_bytes())

    update_job(job_id, merge_strategy="byte_concat_fallback")
    return merged_path


def try_ffmpeg_concat(ffmpeg_path: str, job_dir: Path, audio_files: list[Path], merged_path: Path) -> bool:
    concat_list_path = job_dir / "ffmpeg-concat.txt"
    lines = []
    for audio in audio_files:
        safe_path = audio.resolve().as_posix().replace("'", "'\\''")
        lines.append(f"file '{safe_path}'")
    concat_list_path.write_text("\n".join(lines), encoding="utf-8")

    command = [
        ffmpeg_path,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_list_path),
        "-c",
        "copy",
        str(merged_path),
    ]

    try:
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        return completed.returncode == 0 and merged_path.exists() and merged_path.stat().st_size > 0
    finally:
        concat_list_path.unlink(missing_ok=True)


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


def build_zip_bundle(job_dir: Path, chapter_outputs: list[dict[str, Any]], manifest: dict[str, Any], merged_path: Path) -> Path:
    zip_path = job_dir / "audiobook-package.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(merged_path, arcname=merged_path.name)
        for chapter in chapter_outputs:
            zf.write(chapter["merged_path"], arcname=chapter["merged_path"].name)
            for audio in chapter["audio_files"]:
                zf.write(audio, arcname=f"chapter-{chapter['index']:03d}/{audio.name}")
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return zip_path


def rebuild_zip_manifest(zip_path: Path, manifest: dict[str, Any]) -> None:
    temp_zip = zip_path.with_suffix(".tmp")
    with zipfile.ZipFile(zip_path, "r") as source, zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            if item.filename == "manifest.json":
                continue
            target.writestr(item, source.read(item.filename))
        target.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    temp_zip.replace(zip_path)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
