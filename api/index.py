#!/usr/bin/env python3
"""
Vercel Serverless Compatible API for ebook-to-audiobook
Uses synchronous processing with streaming responses
"""

import base64
import io
import json
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path

# Try importing optional dependencies
try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False

try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False

try:
    from pypdf import PdfReader
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

try:
    from ebooklib import epub
    from bs4 import BeautifulSoup
    EPUB_AVAILABLE = True
except ImportError:
    EPUB_AVAILABLE = False

# Configuration
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
MAX_SEGMENT_CHARS = 2500
ALLOWED_EXTENSIONS = {".pdf", ".epub", ".txt"}

# In-memory job storage (ephemeral in serverless)
JOBS = {}

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


def normalize_signed_percent(value: str) -> str:
    """Normalize percentage values like +0%"""
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


def extract_text_from_txt(content: bytes) -> str:
    """Extract text from TXT file"""
    for encoding in ("utf-8", "utf-8-sig", "cp950", "big5", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def extract_text_from_pdf(content: bytes) -> str:
    """Extract text from PDF"""
    if not PDF_AVAILABLE:
        raise RuntimeError("pypdf not available")
    
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(content)
        temp_path = f.name
    
    try:
        reader = PdfReader(temp_path)
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def extract_text_from_epub(content: bytes) -> tuple[str, str, str]:
    """Extract text from EPUB - returns (title, author, text)"""
    if not EPUB_AVAILABLE:
        raise RuntimeError("ebooklib not available")
    
    with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as f:
        f.write(content)
        temp_path = f.name
    
    try:
        book = epub.read_epub(temp_path)
        
        # Get metadata
        title_meta = book.get_metadata("DC", "title")
        author_meta = book.get_metadata("DC", "creator")
        
        title = str(title_meta[0][0]) if title_meta else "Unknown"
        author = str(author_meta[0][0]) if author_meta else "Unknown Author"
        
        # Extract text from documents
        from ebooklib import ITEM_DOCUMENT
        parts = []
        
        for item in book.get_items_of_type(ITEM_DOCUMENT):
            soup = BeautifulSoup(item.get_content(), "html.parser")
            text = soup.get_text(" ", strip=True)
            if text:
                parts.append(text)
        
        return title, author, "\n\n".join(parts)
    finally:
        Path(temp_path).unlink(missing_ok=True)


def normalize_text(text: str) -> str:
    """Clean and normalize text"""
    text = text.replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ ]+\n", "\n", text)
    return text.strip()


def split_into_segments(text: str, max_chars: int = MAX_SEGMENT_CHARS) -> list[str]:
    """Split text into TTS-friendly segments"""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return []
    
    segments = []
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
        
        # Split long paragraphs by sentences
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
                    # Split very long sentences
                    for i in range(0, len(sentence), max_chars):
                        segments.append(sentence[i:i + max_chars])
                    sentence_buffer = ""
        
        if sentence_buffer:
            buffer = sentence_buffer
    
    if buffer:
        segments.append(buffer)
    
    return segments


async def synthesize_segment(text: str, voice: str, rate: str, volume: str) -> bytes:
    """Synthesize a single segment to audio"""
    if EDGE_TTS_AVAILABLE:
        try:
            communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, volume=volume)
            audio_buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])
            return audio_buffer.getvalue()
        except Exception:
            pass
    
    # Fallback to gTTS
    if GTTS_AVAILABLE:
        voice_lower = voice.lower()
        if "ja-" in voice_lower:
            lang = "ja"
        elif "en-" in voice_lower:
            lang = "en"
        else:
            lang = "zh-TW"
        
        tts = gTTS(text=text, lang=lang)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        return audio_buffer.getvalue()
    
    raise RuntimeError("No TTS engine available")


async def synthesize_book(job_id: str, title: str, author: str, text: str, voice: str, rate: str, volume: str) -> dict:
    """Main synthesis pipeline"""
    cleaned_text = normalize_text(text)
    
    if not cleaned_text:
        raise ValueError("No text content found")
    
    # Update job status
    JOBS[job_id].update({
        "status": "processing",
        "stage": "parsing",
        "progress": 10,
        "message": "Parsing book content..."
    })
    
    # Split into segments
    segments = split_into_segments(cleaned_text)
    
    JOBS[job_id].update({
        "status": "processing",
        "stage": "synthesizing",
        "progress": 30,
        "message": f"Converting {len(segments)} segments to audio..."
    })
    
    # Synthesize each segment
    audio_data = []
    for i, segment in enumerate(segments):
        try:
            audio = await synthesize_segment(segment, voice, rate, volume)
            audio_data.append(audio)
        except Exception as e:
            # Skip failed segments but continue
            print(f"Segment {i+1} failed: {e}")
        
        progress = 30 + int((i + 1) / len(segments) * 50)
        JOBS[job_id].update({
            "progress": min(progress, 80),
            "message": f"Converting segment {i+1}/{len(segments)}..."
        })
    
    if not audio_data:
        raise ValueError("No audio was generated")
    
    # Merge all audio segments
    JOBS[job_id].update({
        "status": "processing",
        "stage": "merging",
        "progress": 90,
        "message": "Merging audio segments..."
    })
    
    merged_audio = b"".join(audio_data)
    
    # Build manifest
    manifest = {
        "job_id": job_id,
        "title": title,
        "author": author,
        "voice": voice,
        "rate": rate,
        "volume": volume,
        "segment_count": len(segments),
        "text_chars": len(cleaned_text),
        "merged_audio_size": len(merged_audio),
    }
    
    JOBS[job_id].update({
        "status": "completed",
        "stage": "completed",
        "progress": 100,
        "message": "Conversion completed!",
        "segment_count": len(segments),
        "text_chars": len(cleaned_text),
        "audio_size": len(merged_audio),
        "manifest": manifest,
    })
    
    return {
        "audio": merged_audio,
        "manifest": manifest,
    }


def create_zip_package(job_id: str, audio_data: bytes, manifest: dict) -> bytes:
    """Create ZIP package with audio and manifest"""
    buffer = io.BytesIO()
    
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("audiobook.mp3", audio_data)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    
    return buffer.getvalue()


# Vercel handler
def handler(event, context):
    """Vercel serverless function handler"""
    import asyncio
    
    path = event.get("path", "/")
    method = event.get("httpMethod", "GET")
    headers = event.get("headers", {})
    
    # Set up response headers
    response_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    
    # Handle CORS preflight
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": response_headers,
            "body": ""
        }
    
    # Health check
    if path == "/health" or path == "/api/health":
        return {
            "statusCode": 200,
            "headers": response_headers,
            "body": json.dumps({
                "ok": True,
                "services": {
                    "edge_tts": EDGE_TTS_AVAILABLE,
                    "gtts": GTTS_AVAILABLE,
                    "pdf": PDF_AVAILABLE,
                    "epub": EPUB_AVAILABLE,
                },
                "jobs": len(JOBS)
            })
        }
    
    # Convert endpoint
    if path == "/api/convert" and method == "POST":
        try:
            # Parse multipart form data
            content_type = headers.get("Content-Type", "")
            
            if "multipart/form-data" in content_type:
                # Handle file upload
                body = event.get("body", "")
                if event.get("isBase64Encoded", False):
                    body = base64.b64decode(body)
                
                # Simple form parsing (for Vercel)
                # In production, use a proper multipart parser
                return {
                    "statusCode": 400,
                    "headers": response_headers,
                    "body": json.dumps({
                        "error": "Please use JSON API for now. POST to /api/convert with JSON body containing base64 encoded file."
                    })
                }
            else:
                # JSON body
                body = event.get("body", "")
                if event.get("isBase64Encoded", False):
                    body = base64.b64decode(body)
                
                data = json.loads(body)
                
                # Extract parameters
                file_content = data.get("file_content", "")
                file_name = data.get("file_name", "book.txt")
                voice = data.get("voice", DEFAULT_VOICE)
                rate = data.get("rate", "+0%")
                volume = data.get("volume", "+0%")
                
                if not file_content:
                    return {
                        "statusCode": 400,
                        "headers": response_headers,
                        "body": json.dumps({"error": "file_content is required"})
                    }
                
                # Decode file
                try:
                    file_bytes = base64.b64decode(file_content)
                except Exception:
                    return {
                        "statusCode": 400,
                        "headers": response_headers,
                        "body": json.dumps({"error": "Invalid base64 file_content"})
                    }
                
                # Determine file type
                ext = Path(file_name).suffix.lower()
                if ext not in ALLOWED_EXTENSIONS:
                    return {
                        "statusCode": 400,
                        "headers": response_headers,
                        "body": json.dumps({"error": f"Unsupported file type: {ext}"})
                    }
                
                # Create job
                job_id = uuid.uuid4().hex[:12]
                resolved_voice = VOICE_ALIASES.get(voice, voice or DEFAULT_VOICE)
                normalized_rate = normalize_signed_percent(rate)
                normalized_volume = normalize_signed_percent(volume)
                
                JOBS[job_id] = {
                    "job_id": job_id,
                    "status": "queued",
                    "stage": "queued",
                    "progress": 0,
                    "message": "Job created, processing...",
                    "title": Path(file_name).stem,
                    "author": "Unknown Author",
                    "file_type": ext.lstrip(".").upper(),
                    "voice": resolved_voice,
                    "rate": normalized_rate,
                    "volume": normalized_volume,
                }
                
                # Process based on file type
                try:
                    if ext == ".txt":
                        title = Path(file_name).stem
                        author = "Unknown Author"
                        text = extract_text_from_txt(file_bytes)
                    elif ext == ".pdf":
                        title = Path(file_name).stem
                        author = "Unknown Author"
                        text = extract_text_from_pdf(file_bytes)
                    elif ext == ".epub":
                        title, author, text = extract_text_from_epub(file_bytes)
                    else:
                        raise ValueError(f"Unsupported: {ext}")
                    
                    # Run synthesis
                    result = asyncio.run(synthesize_book(
                        job_id=job_id,
                        title=title,
                        author=author,
                        text=text,
                        voice=resolved_voice,
                        rate=normalized_rate,
                        volume=normalized_volume,
                    ))
                    
                    # Create ZIP package
                    zip_data = create_zip_package(job_id, result["audio"], result["manifest"])
                    
                    # Return job info (in production, store audio to cloud storage)
                    return {
                        "statusCode": 200,
                        "headers": {**response_headers, "Content-Type": "application/json"},
                        "body": json.dumps({
                            "job_id": job_id,
                            "status": "completed",
                            "stage": "completed",
                            "progress": 100,
                            "title": title,
                            "author": author,
                            "segment_count": result["manifest"]["segment_count"],
                            "text_chars": result["manifest"]["text_chars"],
                            "audio_size": result["manifest"]["merged_audio_size"],
                            # For demo, return base64 audio (production should use cloud storage)
                            "audio_base64": base64.b64encode(result["audio"]).decode(),
                            "zip_base64": base64.b64encode(zip_data).decode(),
                        })
                    }
                    
                except Exception as e:
                    JOBS[job_id].update({
                        "status": "failed",
                        "error": str(e)
                    })
                    return {
                        "statusCode": 500,
                        "headers": response_headers,
                        "body": json.dumps({"error": str(e)})
                    }
    
    # Job status endpoint
    if path.startswith("/api/jobs/") and method == "GET":
        job_id = path.split("/")[-1]
        
        if job_id not in JOBS:
            return {
                "statusCode": 404,
                "headers": response_headers,
                "body": json.dumps({"error": "Job not found"})
            }
        
        return {
            "statusCode": 200,
            "headers": response_headers,
            "body": json.dumps(JOBS[job_id])
        }
    
    # Root endpoint
    if path == "/" or path == "":
        return {
            "statusCode": 200,
            "headers": {**response_headers, "Content-Type": "text/html"},
            "body": """<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ebook-to-audiobook</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; line-height: 1.6; }
        h1 { color: #4f46e5; }
        .card { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .btn { background: #4f46e5; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
        .btn:hover { background: #4338ca; }
        input, select { padding: 10px; margin: 5px 0; border: 1px solid #d1d5db; border-radius: 4px; width: 100%; }
        .result { background: #d1fae5; padding: 15px; border-radius: 6px; margin-top: 20px; display: none; }
    </style>
</head>
<body>
    <h1>📚 ebook-to-audiobook</h1>
    <p>將電子書轉換為有聲書</p>
    
    <div class="card">
        <h3>上傳電子書</h3>
        <input type="file" id="fileInput" accept=".txt,.pdf,.epub">
        <select id="voiceSelect">
            <option value="zh-CN-XiaoxiaoNeural">中文 - 曉曉</option>
            <option value="zh-CN-YunxiNeural">中文 - 雲希</option>
            <option value="en-US-JennyNeural">English - Jenny</option>
            <option value="ja-JP-NanamiNeural">日本語 - ななみ</option>
        </select>
        <button class="btn" onclick="convertBook()">開始轉換</button>
    </div>
    
    <div id="result" class="result"></div>
    
    <script>
    async function convertBook() {
        const fileInput = document.getElementById('fileInput');
        const voiceSelect = document.getElementById('voiceSelect');
        const resultDiv = document.getElementById('result');
        
        if (!fileInput.files[0]) {
            alert('請選擇檔案');
            return;
        }
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            const base64 = e.target.result.split(',')[1];
            
            resultDiv.innerHTML = '轉換中...';
            resultDiv.style.display = 'block';
            
            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        file_content: base64,
                        file_name: file.name,
                        voice: voiceSelect.value
                    })
                });
                
                const data = await response.json();
                
                if (data.audio_base64) {
                    const audio = new Audio('data:audio/mpeg;base64,' + data.audio_base64);
                    audio.controls = true;
                    resultDiv.innerHTML = '<h4>✅ 轉換完成！</h4>' +
                        '<p>標題: ' + data.title + '</p>' +
                        '<p>作者: ' + data.author + '</p>' +
                        '<p>段落數: ' + data.segment_count + '</p>' +
                        '<p>字元數: ' + data.text_chars + '</p>' +
                        '<p>音訊大小: ' + Math.round(data.audio_size/1024) + ' KB</p>' +
                        '<h4>預覽:</h4>';
                    resultDiv.appendChild(audio);
                } else {
                    resultDiv.innerHTML = '<p>錯誤: ' + (data.error || 'Unknown error') + '</p>';
                }
            } catch (err) {
                resultDiv.innerHTML = '<p>錯誤: ' + err.message + '</p>';
            }
        };
        
        reader.readAsDataURL(file);
    }
    </script>
</body>
</html>"""
        }
    
    # Default 404
    return {
        "statusCode": 404,
        "headers": response_headers,
        "body": json.dumps({"error": "Not found"})
    }
