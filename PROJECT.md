# 電子書轉有聲書 - 專案規格 / 目前進度

## 專案目標
把電子書內容轉成可下載、可背景處理、可逐步升級成正式產品的有聲書轉檔流程。

---

## 目前版本
目前專案是 **前後端混合 MVP**：
- 前端：靜態 `index.html` 工作台
- 後端：`FastAPI` 背景轉檔 API

---

## 已完成能力

### 1. 電子書解析
- 支援格式：PDF / EPUB / TXT
- PDF：`pypdf` / 前端 `pdf.js`
- EPUB：前端 `JSZip` + 後端 `ebooklib`
- TXT：前後端皆可直接讀取

### 2. 背景轉檔工作流
- `POST /api/convert` 建立背景任務
- `GET /api/jobs/{job_id}` 查詢狀態
- job state 已整理為：`queued / processing / completed / failed`
- 附帶 `stage` 欄位（例如 parsing / chunking / synthesizing / merging）
- 前端可輪詢進度並顯示轉檔狀態

### 3. 音訊產出
- 優先使用 Edge TTS
- Edge TTS 失敗時自動 fallback 到 gTTS
- 小檔：輸出整本 MP3
- 大檔：輸出整本 MP3 + 分段 MP3 + ZIP 打包
- 產出 `manifest.json`

### 4. Artifact / 下載一致性
- job payload 會記錄 `voice / rate / volume`
- 回傳 `download_url / merged_download_url / zip_download_url / manifest_download_url`
- 失敗時會清理 artifact 欄位，避免殘留舊資料
- 下載路徑已加基本檔名安全檢查

---

## API

### `POST /api/convert`
表單欄位：
- `file`
- `voice`
- `rate`
- `volume`

### `GET /api/jobs/{job_id}`
回傳：
- `status`
- `stage`
- `progress`
- `message`
- `title`
- `author`
- `segment_count`
- `download_url`
- `merged_download_url`
- `zip_download_url`
- `manifest_download_url`

### `GET /downloads/{job_id}/{filename}`
- 下載 MP3 / ZIP / manifest

### `GET /health`
- 基本健康檢查

---

## 目前限制
1. 前端 UI 仍是 MVP，尚未完成真正的產品化重設計
2. 整本 MP3 已支援 ffmpeg 正式合併（host 有 ffmpeg 時啟用），否則會自動 fallback 為 byte concat 並在 manifest / job 狀態中標記 merge_strategy
3. job 狀態已補上本機 durable JSON store（重啟後可保留狀態），但尚未導入正式 queue / database
4. 輸出檔仍在本機磁碟，尚未接 object storage
5. 已補上 chapter-level output 與 richer manifest，但尚未支援 M4B 與正式 chapter metadata container
6. 正式部署路線仍需重建（Railway 曾遇到平台 incident）

---

## 下一階段
### P0
1. 前端重做成產品級 landing + workspace
2. 導入 ffmpeg 正式合併整本 MP3
3. 完成 Render / Fly / VPS 的穩定部署
4. 補齊正式 smoke test

### P1
1. object storage（R2 / S3 / Supabase Storage）
2. durable job queue / database（目前僅本機 durable JSON）
3. 章節級輸出與更好的 manifest ✅（已完成第一版）
4. 下載保留期限與清理策略

### P2
1. calibre / ebook-convert
2. Piper 本地 TTS
3. M4B / chapter metadata

---

## 當前判定
- 前端：MVP，未完成產品化
- 後端：核心流程可跑，但未達正式商用等級
- 部署：未完成穩定正式上線
- 可正式使用：**尚未達標**
