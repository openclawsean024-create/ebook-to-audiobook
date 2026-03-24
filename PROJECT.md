# 電子書轉有聲書 - 專案規格

## 專案目標
把電子書內容轉成可下載、可背景處理、可逐步升級成正式產品的有聲書轉檔流程。

---

## 目前版本
**Vercel Serverless 版本** - 專為 Vercel 部署優化

---

## 功能

### 支援格式
- **EPUB** - 透過 ebooklib 解析
- **PDF** - 透過 pypdf 解析
- **TXT** - 直接文字讀取（支援多種編碼）

### 語音合成
- **Microsoft Edge TTS** - 主要引擎
- **gTTS** - 備用引擎
- 支援語音：中文（曉曉、雲希）、英文（Jenny、Guy）、日語（Nanami）

### API 端點
- `POST /api/convert` - 建立轉換任務（JSON body with base64 file）
- `GET /api/jobs/{job_id}` - 查詢任務狀態
- `GET /health` - 健康檢查

---

## 部署

### Vercel 部署
```bash
# 安裝 Vercel CLI
npm i -g vercel

# 登入
vercel login

# 部署
vercel

# 或推送 GitHub 後自動部署
git add .
git commit -m "Update for Vercel deployment"
git push origin main
```

### 環境變數
- 無需額外環境變數

---

## 使用方式

### API 呼叫
```bash
# 轉換書籍
curl -X POST https://your-project.vercel.app/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "file_content": "<base64-encoded-file>",
    "file_name": "book.txt",
    "voice": "zh-CN-XiaoxiaoNeural"
  }'
```

---

## 目前限制
1. 單次轉換有 Vercel function timeout 限制（預設 10 秒，可設至 60 秒）
2. 大量文字可能需要分段處理
3. 輸出暫時以 base64 內嵌於 response 中

---

## 下一階段
1. 接入物件儲存（R2/S3）儲存輸出檔案
2. 改善大檔案處理流程
3. 加入背景任務隊列
