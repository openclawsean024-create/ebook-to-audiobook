#!/usr/bin/env python3
"""
Vercel Serverless Compatible API for ebook-to-audiobook
"""

import base64
import io
import json
import re
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

# In-memory job storage
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


def normalize_text(text: str) -> str:
    text = text.replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ ]+\n", "\n", text)
    return text.strip()


def split_into_segments(text: str, max_chars: int = MAX_SEGMENT_CHARS) -> list[str]:
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
                        segments.append(sentence[i:i + max_chars])
                    sentence_buffer = ""
        
        if sentence_buffer:
            buffer = sentence_buffer
    
    if buffer:
        segments.append(buffer)
    
    return segments


async def synthesize_segment(text: str, voice: str, rate: str, volume: str) -> bytes:
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


def json_response(data, status=200):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(data, ensure_ascii=False)
    }


def html_response(html, status=200):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
        },
        "body": html
    }


HTML_PAGE = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ebook-to-audiobook</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root { --primary: #4f46e5; --primary-dark: #4338ca; --bg: #f9fafb; --card: #fff; --text: #111827; --sub: #6b7280; }
        body { font-family: 'Noto Sans TC', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 20px; }
        .container { max-width: 540px; margin: 0 auto; }
        .header { text-align: center; padding: 30px 20px; background: linear-gradient(135deg, var(--primary), #7c3aed); color: white; border-radius: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 26px; font-weight: 800; }
        .header p { margin-top: 8px; opacity: 0.9; }
        .card { background: var(--card); border-radius: 14px; padding: 20px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .card-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; }
        .step-num { background: var(--primary); color: white; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px; }
        .upload-box { border: 2px dashed #c7d2fe; border-radius: 12px; padding: 30px; text-align: center; background: #eef2ff; cursor: pointer; transition: all 0.2s; }
        .upload-box:hover { border-color: var(--primary); }
        .upload-box p { color: var(--sub); margin-top: 10px; font-size: 14px; }
        input[type="file"] { display: none; }
        select, button { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 15px; margin-top: 12px; font-family: inherit; }
        button { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: white; border: none; font-weight: 700; cursor: pointer; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .file-info { margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 14px; }
        .status { margin-top: 16px; padding: 16px; border-radius: 10px; display: none; }
        .status.show { display: block; }
        .status.processing { background: #fef3c7; }
        .status.success { background: #d1fae5; }
        .status.error { background: #fee2e2; }
        .progress-bar { height: 8px; background: #e5e7eb; border-radius: 4px; margin-top: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: var(--primary); transition: width 0.3s; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
        .stat { background: #f3f4f6; padding: 10px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 18px; font-weight: 700; color: var(--primary); }
        .stat-label { font-size: 12px; color: var(--sub); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 ebook-to-audiobook</h1>
            <p>將 EPUB、PDF、TXT 轉換為有聲書</p>
        </div>
        <div class="card">
            <div class="card-title"><span class="step-num">1</span>選擇檔案</div>
            <div class="upload-box" onclick="document.getElementById('fileInput').click()">
                <p>點擊上傳電子書</p>
                <p style="font-size:12px;color:var(--sub)">支援 EPUB、PDF、TXT</p>
            </div>
            <input type="file" id="fileInput" accept=".txt,.pdf,.epub">
            <div id="fileInfo" class="file-info" style="display:none"></div>
        </div>
        <div class="card">
            <div class="card-title"><span class="step-num">2</span>選擇語音</div>
            <select id="voiceSelect">
                <option value="zh-CN-XiaoxiaoNeural">中文 - 曉曉</option>
                <option value="zh-CN-YunxiNeural">中文 - 雲希</option>
                <option value="en-US-JennyNeural">English - Jenny</option>
                <option value="ja-JP-NanamiNeural">日本語 - ななみ</option>
            </select>
            <button id="convertBtn" onclick="convertBook()" disabled>開始轉換</button>
        </div>
        <div id="status" class="status"></div>
    </div>
    <script>
        const fileInput = document.getElementById('fileInput');
        const fileInfo = document.getElementById('fileInfo');
        const convertBtn = document.getElementById('convertBtn');
        const status = document.getElementById('status');
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const size = file.size > 1024 * 1024 ? (file.size/1024/1024).toFixed(2)+' MB' : (file.size/1024).toFixed(1)+' KB';
                fileInfo.innerHTML = '<strong>'+file.name+'</strong><br>'+size;
                fileInfo.style.display = 'block';
                convertBtn.disabled = false;
            }
        });
        
        async function convertBook() {
            const file = fileInput.files[0];
            const voice = document.getElementById('voiceSelect').value;
            if (!file) return;
            convertBtn.disabled = true;
            status.className = 'status show processing';
            status.innerHTML = '<p>📤 上傳中...</p><div class="progress-bar"><div class="progress-fill" style="width:10%"></div></div>';
            try {
                const arrayBuffer = await file.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                status.innerHTML = '<p>🔄 處理中...</p><div class="progress-bar"><div class="progress-fill" style="width:30%"></div></div>';
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_content: base64, file_name: file.name, voice: voice })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                status.className = 'status show success';
                status.innerHTML = '<p style="font-weight:700;font-size:16px">✅ 轉換完成！</p>' +
                    '<div class="stats"><div class="stat"><div class="stat-value">'+data.segment_count+'</div><div class="stat-label">段落</div></div>' +
                    '<div class="stat"><div class="stat-value">'+data.text_chars+'</div><div class="stat-label">字元</div></div>' +
                    '<div class="stat"><div class="stat-value">'+Math.round(data.audio_size/1024)+'</div><div class="stat-label">KB</div></div></div>' +
                    '<div style="margin-top:16px"><p style="margin:8px 0;font-weight:500">👂 預覽：</p><audio controls src="data:audio/mpeg;base64,'+data.audio_base64+'"></audio></div>';
            } catch (err) {
                status.className = 'status show error';
                status.innerHTML = '<p>❌ 錯誤: '+err.message+'</p>';
                convertBtn.disabled = false;
            }
        }
    </script>
</body>
</html>"""


async def process_conversion(job_id: str, content: bytes, file_name: str, voice: str, rate: str, volume: str):
    """Process the book conversion"""
    import asyncio
    
    ext = Path(file_name).suffix.lower()
    title = Path(file_name).stem
    author = "Unknown Author"
    
    if ext == ".txt":
        for enc in ("utf-8", "utf-8-sig", "cp950", "big5", "gb18030"):
            try:
                text = content.decode(enc)
                break
            except:
                text = content.decode("utf-8", errors="ignore")
    elif ext == ".pdf":
        if not PDF_AVAILABLE:
            raise RuntimeError("PDF not supported")
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(content)
            temp = f.name
        try:
            reader = PdfReader(temp)
            text = "\n\n".join((p.extract_text() or "") for p in reader.pages)
        finally:
            Path(temp).unlink(missing_ok=True)
    elif ext == ".epub":
        if not EPUB_AVAILABLE:
            raise RuntimeError("EPUB not supported")
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as f:
            f.write(content)
            temp = f.name
        try:
            book = epub.read_epub(temp)
            title_meta = book.get_metadata("DC", "title")
            author_meta = book.get_metadata("DC", "creator")
            title = str(title_meta[0][0]) if title_meta else title
            author = str(author_meta[0][0]) if author_meta else author
            
            parts = []
            for item in book.get_items_of_type(ITEM_DOCUMENT):
                soup = BeautifulSoup(item.get_content(), "html.parser")
                t = soup.get_text(" ", strip=True)
                if t:
                    parts.append(t)
            text = "\n\n".join(parts)
        finally:
            Path(temp).unlink(missing_ok=True)
    else:
        raise ValueError(f"Unsupported: {ext}")
    
    text = normalize_text(text)
    if not text:
        raise ValueError("No text found")
    
    segments = split_into_segments(text)
    
    audio_data = []
    for i, seg in enumerate(segments):
        try:
            audio = await synthesize_segment(seg, voice, rate, volume)
            audio_data.append(audio)
        except Exception as e:
            print(f"Segment {i+1} error: {e}")
    
    if not audio_data:
        raise ValueError("No audio generated")
    
    merged_audio = b"".join(audio_data)
    
    return {
        "title": title,
        "author": author,
        "audio": merged_audio,
        "segment_count": len(segments),
        "text_chars": len(text),
        "audio_size": len(merged_audio)
    }


# Import for epub
try:
    from ebooklib import ITEM_DOCUMENT
except:
    ITEM_DOCUMENT = None


def handler(event, context):
    """Vercel serverless function handler"""
    import asyncio
    
    path = event.get("path", "/")
    method = event.get("httpMethod", "GET")
    headers = event.get("headers", {})
    
    # CORS headers
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}
    
    # Health check
    if path == "/health":
        return json_response({
            "ok": True,
            "services": {
                "edge_tts": EDGE_TTS_AVAILABLE,
                "gtts": GTTS_AVAILABLE,
                "pdf": PDF_AVAILABLE,
                "epub": EPUB_AVAILABLE,
            },
            "jobs": len(JOBS)
        })
    
    # Convert API
    if path == "/api/convert" and method == "POST":
        try:
            body = event.get("body", "")
            if event.get("isBase64Encoded"):
                body = base64.b64decode(body)
            
            data = json.loads(body)
            file_content = data.get("file_content", "")
            file_name = data.get("file_name", "book.txt")
            voice = data.get("voice", DEFAULT_VOICE)
            rate = data.get("rate", "+0%")
            volume = data.get("volume", "+0%")
            
            if not file_content:
                return json_response({"error": "file_content required"}, 400)
            
            try:
                file_bytes = base64.b64decode(file_content)
            except Exception:
                return json_response({"error": "Invalid base64"}, 400)
            
            ext = Path(file_name).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                return json_response({"error": f"Unsupported: {ext}"}, 400)
            
            job_id = uuid.uuid4().hex[:12]
            resolved_voice = VOICE_ALIASES.get(voice, voice)
            
            JOBS[job_id] = {
                "job_id": job_id,
                "status": "processing",
                "title": Path(file_name).stem,
            }
            
            try:
                result = asyncio.run(process_conversion(job_id, file_bytes, file_name, resolved_voice, rate, volume))
                
                zip_buffer = io.BytesIO()
                manifest = {
                    "job_id": job_id,
                    "title": result["title"],
                    "author": result["author"],
                    "segment_count": result["segment_count"],
                    "text_chars": result["text_chars"],
                }
                with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr("audiobook.mp3", result["audio"])
                    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
                
                JOBS[job_id].update({
                    "status": "completed",
                    "segment_count": result["segment_count"],
                    "text_chars": result["text_chars"],
                    "audio_size": result["audio_size"],
                })
                
                return json_response({
                    "job_id": job_id,
                    "status": "completed",
                    "title": result["title"],
                    "author": result["author"],
                    "segment_count": result["segment_count"],
                    "text_chars": result["text_chars"],
                    "audio_size": result["audio_size"],
                    "audio_base64": base64.b64encode(result["audio"]).decode(),
                    "zip_base64": base64.b64encode(zip_buffer.getvalue()).decode(),
                })
                
            except Exception as e:
                JOBS[job_id].update({"status": "failed", "error": str(e)})
                return json_response({"error": str(e)}, 500)
        
        except json.JSONDecodeError:
            return json_response({"error": "Invalid JSON"}, 400)
        except Exception as e:
            return json_response({"error": str(e)}, 500)
    
    # Job status
    if path.startswith("/api/jobs/") and method == "GET":
        job_id = path.split("/")[-1]
        if job_id in JOBS:
            return json_response(JOBS[job_id])
        return json_response({"error": "Not found"}, 404)
    
    # Root - serve HTML
    if path == "/" or path == "":
        return html_response(HTML_PAGE)
    
    return json_response({"error": "Not found"}, 404)
