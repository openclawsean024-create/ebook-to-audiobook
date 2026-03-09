# 電子書轉有聲書 - 專案規格 / 目前進度

## 專案目標
把電子書內容轉成可朗讀、可分段控制、最終可匯出音檔的有聲書流程。

---

## 目前版本
目前專案已進入 **前後端混合 MVP**：
- 前端：靜態 `index.html` demo
- 後端：`FastAPI` 轉檔 API

---

## 已完成能力

### 1. 電子書解析
- 支援格式：PDF / EPUB / TXT
- PDF：`pypdf` / 前端 `pdf.js`
- EPUB：前端 JSZip + 後端 `ebooklib`
- TXT：前後端皆可直接讀取

### 2. 前端 Demo 能力
- 書籍上傳
- 文字預覽
- 語音選擇
- 分段朗讀
- 播放 / 暫停 / 繼續 / 停止 / 上下段切換
- 預估閱讀時間

### 3. 後端真轉檔能力
- 上傳電子書到 `/api/convert`
- 後端抽取全文
- 自動清理文字
- 當內容太大時，自動切成多段
- 每段優先呼叫 Edge TTS 產生 MP3
- 若 Edge TTS 失敗，自動 fallback 到 gTTS
- 小檔：可回傳單一 MP3
- 大檔：自動打包多段 MP3 為 ZIP
- 提供 `/downloads/{job_id}/{filename}` 下載

---

## 後端 API 設計

### `POST /api/convert`
表單欄位：
- `file`: 電子書檔案
- `voice`: 語音（例如 `zh-CN-XiaoxiaoNeural`）
- `rate`: 語速（如 `+0%`, `+10%`, `-10%`）
- `volume`: 音量（如 `+0%`）

### 回傳內容
- `job_id`
- `title`
- `author`
- `segment_count`
- `segments[]`
- `download_url`
- `bundle_type` (`single_mp3` / `segmented_zip`)

### `GET /downloads/{job_id}/{filename}`
- 下載 MP3 或 ZIP

### `GET /health`
- 健康檢查

---

## 目前限制
1. 前端還沒正式串接後端 API
2. 大型書籍目前優先輸出「多段 MP3 + ZIP」，還沒做真正單檔合併
3. 尚未加入背景任務佇列 / 進度查詢
4. 尚未加入使用者帳號、雲端保存、分享連結
5. 尚未做 M4B / metadata 寫入

---

## 建議下一步
1. 把前端 `index.html` 改成直接呼叫 `/api/convert`
2. 顯示後端轉檔進度與下載按鈕
3. 加入長任務 queue / background worker
4. 支援章節級輸出
5. 支援 MP3 合併 / M4B

---

## 本階段目標
你提供一本電子書 → 系統自動判斷大小 → 太大就自動分段 → 產出語音檔給你下載。
