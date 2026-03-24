# ebook-to-audiobook

把電子書（EPUB/PDF/TXT）轉換成有聲書的服務，使用 Edge TTS 文字轉語音。

## 功能

- 📖 支援格式：EPUB、PDF、TXT
- 🔊 語音：Microsoft Edge TTS（中文、英文、日文）
- 📦 輸出：章節MP3 + 完整有聲書 + ZIP打包
- 🚀 部署：Vercel Serverless

## 本地開發

```bash
pip install -r requirements.txt
python app.py
```

## Vercel 部署

```bash
vercel deploy
```

## API

- `POST /api/convert` - 建立轉換任務
- `GET /api/jobs/{job_id}` - 查詢任務狀態
- `GET /downloads/{job_id}/{filename}` - 下載輸出檔案
- `GET /health` - 健康檢查