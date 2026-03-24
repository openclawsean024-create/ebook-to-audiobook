# Vercel-compatible FastAPI app for ebook-to-audiobook
import base64
import io
import json
import re
import tempfile
import uuid
import zipfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

# Try importing optional dependencies
EDGE_TTS_AVAILABLE = False
GTTS_AVAILABLE = False
PDF_AVAILABLE = False
EPUB_AVAILABLE = False

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    pass

try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    pass

try:
    from pypdf import PdfReader
    PDF_AVAILABLE = True
except ImportError:
    pass

try:
    from ebooklib import epub
    from ebooklib import ITEM_DOCUMENT
    from bs4 import BeautifulSoup
    EPUB_AVAILABLE = True
except ImportError:
    ITEM_DOCUMENT = None

app = FastAPI(title="ebook-to-audiobook")

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_SEGMENT_CHARS = 2500
ALLOWED_EXTENSIONS = {".pdf", ".epub", ".txt"}


class ConvertRequest(BaseModel):
    file_content: str
    file_name: str
    voice: str = DEFAULT_VOICE
    rate: str = "+0%"
    volume: str = "+0%"


@app.get("/health")
def health():
    return JSONResponse({
        "ok": True,
        "services": {
            "edge_tts": EDGE_TTS_AVAILABLE,
            "gtts": GTTS_AVAILABLE,
            "pdf": PDF_AVAILABLE,
            "epub": EPUB_AVAILABLE,
        }
    })


@app.get("/")
def root():
    return HTMLResponse("""
    <html><head><title>ebook-to-audiobook</title></head>
    <body>
        <h1>📚 ebook-to-audiobook API</h1>
        <p>POST /api/convert with JSON body</p>
        <pre>
{
    "file_content": "base64-encoded-file",
    "file_name": "book.txt",
    "voice": "zh-CN-XiaoxiaoNeural"
}
        </pre>
    </body>
    </html>
    """)


@app.post("/api/convert")
async def convert(request: ConvertRequest):
    try:
        file_bytes = base64.b64decode(request.file_content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")
    
    ext = "." + request.file_name.split(".")[-1].lower() if "." in request.file_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported: {ext}")
    
    title = request.file_name.rsplit(".", 1)[0] if "." in request.file_name else request.file_name
    author = "Unknown Author"
    
    # Extract text based on file type
    if ext == ".txt":
        for enc in ("utf-8", "utf-8-sig", "cp950", "big5", "gb18030"):
            try:
                text = file_bytes.decode(enc)
                break
            except:
                text = file_bytes.decode("utf-8", errors="ignore")
    elif ext == ".pdf":
        if not PDF_AVAILABLE:
            raise HTTPException(status_code=400, detail="PDF not supported")
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(file_bytes)
            temp = f.name
        try:
            reader = PdfReader(temp)
            text = "\n\n".join((p.extract_text() or "") for p in reader.pages)
        finally:
            Path(temp).unlink(missing_ok=True)
    elif ext == ".epub":
        if not EPUB_AVAILABLE:
            raise HTTPException(status_code=400, detail="EPUB not supported")
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as f:
            f.write(file_bytes)
            temp = f.name
        try:
            book = epub.read_epub(temp)
            tm = book.get_metadata("DC", "title")
            am = book.get_metadata("DC", "creator")
            title = str(tm[0][0]) if tm else title
            author = str(am[0][0]) if am else author
            parts = []
            for item in book.get_items_of_type(ITEM_DOCUMENT):
                soup = BeautifulSoup(item.get_content(), "html.parser")
                t = soup.get_text(" ", strip=True)
                if t:
                    parts.append(t)
            text = "\n\n".join(parts)
        finally:
            Path(temp).unlink(missing_ok=True)
    
    # Normalize text
    text = text.replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ ]+\n", "\n", text).strip()
    
    if not text:
        raise HTTPException(status_code=400, detail="No text found")
    
    # Split into segments
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    segments = []
    buffer = ""
    
    for para in paragraphs:
        candidate = f"{buffer}\n\n{para}".strip() if buffer else para
        if len(candidate) <= MAX_SEGMENT_CHARS:
            buffer = candidate
            continue
        if buffer:
            segments.append(buffer)
            buffer = ""
        if len(para) <= MAX_SEGMENT_CHARS:
            buffer = para
            continue
        sentences = [s.strip() for s in re.split(r"(?<=[。！？.!?])", para) if s.strip()]
        sb = ""
        for sent in sentences:
            c = f"{sb} {sent}".strip() if sb else sent
            if len(c) <= MAX_SEGMENT_CHARS:
                sb = c
            else:
                if sb:
                    segments.append(sb)
                if len(sent) <= MAX_SEGMENT_CHARS:
                    sb = sent
                else:
                    for i in range(0, len(sent), MAX_SEGMENT_CHARS):
                        segments.append(sent[i:i+MAX_SEGMENT_CHARS])
                    sb = ""
        if sb:
            buffer = sb
    if buffer:
        segments.append(buffer)
    
    # Synthesize audio
    audio_chunks = []
    for i, seg in enumerate(segments):
        try:
            if EDGE_TTS_AVAILABLE:
                comm = edge_tts.Communicate(text=seg, voice=request.voice, rate=request.rate, volume=request.volume)
                buf = io.BytesIO()
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        buf.write(chunk["data"])
                audio_chunks.append(buf.getvalue())
            elif GTTS_AVAILABLE:
                vl = request.voice.lower()
                lang = "zh-TW"
                if "ja-" in vl:
                    lang = "ja"
                elif "en-" in vl:
                    lang = "en"
                tts = gTTS(text=seg, lang=lang)
                buf = io.BytesIO()
                tts.write_to_fp(buf)
                audio_chunks.append(buf.getvalue())
        except Exception as e:
            print(f"Segment {i+1} error: {e}")
    
    if not audio_chunks:
        raise HTTPException(status_code=500, detail="No audio generated")
    
    merged = b"".join(audio_chunks)
    
    # Create zip package
    zip_buf = io.BytesIO()
    manifest = {"title": title, "author": author, "segments": len(segments), "chars": len(text)}
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("audiobook.mp3", merged)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    
    return JSONResponse({
        "job_id": uuid.uuid4().hex[:12],
        "status": "completed",
        "title": title,
        "author": author,
        "segment_count": len(segments),
        "text_chars": len(text),
        "audio_size": len(merged),
        "audio_base64": base64.b64encode(merged).decode(),
        "zip_base64": base64.b64encode(zip_buf.getvalue()).decode(),
    })


# Vercel ASGI handler
def handler(event, context):
    """ASGI handler for Vercel"""
    return app(event, context)
