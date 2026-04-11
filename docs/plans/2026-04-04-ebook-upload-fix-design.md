# 設計文件：ebook-to-audiobook 拖曳上傳問題修復

**日期：** 2026-04-04  
**階段：** Phase 1 — Brainstorming  
**提出者：** Alan (CTO)  
**檔案：** `docs/plans/2026-04-04-ebook-upload-fix-design.md`

---

## 1. 問題現況

### 1.1 背景
- 使用者回報：將電子書檔案拖曳至上傳區域時，無法正常上傳。
- 專案：`ebook-to-audiobook`，部署於 Vercel，靜態 HTML 頁面 + Python API (`/api/convert`)
- 上傳方式：`FormData` + `fetch POST /api/convert`

### 1.2 已確認的程式碼現況

**前端上傳邏輯（`app.html`）：**

```javascript
zone.addEventListener('drop', e => {
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  zone.classList.remove('dragover');
  const files = e.dataTransfer && e.dataTransfer.files
    ? Array.from(e.dataTransfer.files) : [];
  const f = files.find(file => file && file.name) || null;
  if (f) handleFile(f);
});
```

**發現的問題（根因分析）：**

| 編號 | 問題 | 說明 |
|------|------|------|
| **P1** | `handleFile` 副檔名取法有 `split('.').pop()` 陷阱 | 檔名如 `my.book.epub` 會取出 `book.epub` 而非 `epub`，導致副檔名檢查失敗 |
| **P2** | `fetch('/api/convert')` 路徑假設絕對路徑 | 在 Vercel 靜態託管下若 `/api/convert` 未正確映射，會 404 |
| **P3** | `dragenter` 只遞增 `dragCounter`，但 `drop` 未做完整復原 | 若拖曳中 dragover 事件被阻擋，counter 可能不同步 |
| **P4** | Vercel 部署後無錯誤日誌可查 | 需實際驗證是哪一層（前端 JS 失敗、後端 4xx/5xx）|

### 1.3 尚未驗證的疑點（需進一步確認）
- [ ] Vercel Static + Python Functions 的路由是否正常（`vercel.json` 確認）
- [ ] 瀏覽器 console 是否有 JS 錯誤（需實際重現）
- [ ] 是否為跨域問題（CORS headers 已設定 `*`，但 `credentials: true` 可能衝突）
- [ ] 點擊上傳（`fileInput.click()`）是否正常運作，僅 drag 失敗？

---

## 2. 修復方案提案

### 2.1 方案 A：「最小修補 + 強化偵錯」

**核心理念：** 優先修補已確認的 bug，並加入 console 錯誤輸出方便日後更快確診。

**修改點：**
1. 修補 `handleFile` 的副檔名取法，用 `lastIndexOf('.')` 或 `extname` 工具函式
2. `fetch` URL 改為 `window.location.origin + '/api/convert'`（絕對路徑，避免相對路徑問題）
3. 在 `handleFile`、`startConvert`、drop handler 加入 `console.log` 敘述
4. 在 `drop` 事件中，若 `files.length === 0`，輸出明確的警告訊息

**優點：** 最小變動、風險低、快速修復
**缺點：** 未解決深層路由問題，若根因是 Vercel 路由映射，則無效

---

### 2.2 方案 B：「前端加嚴驗證 + API 改用 JSON + 錯誤處理」

**核心理念：** 將上傳方式從 `multipart/form-data` 改為 base64 + JSON，避開 Vercel Python Functions 的 multipart 處理問題。

**修改點：**
1. 前端：將檔案用 `FileReader` 轉為 base64，連同 `fileName` 一起以 JSON POST 送到 `/api/convert`
2. 後端：新增 `/api/convert-json` 端點接受 JSON body（`{ file_content: base64, file_name: str, ... }`）
3. 前端加更完整的錯誤 catch：顯示具體 HTTP status + error message
4. 副檔名檢查用正規化工具函式
5. 加入上傳大小限制提示（Vercel limit ~4.5MB）

**優點：** 
- 避開 multipart/form-data 在 Vercel Serverless 的潛在問題
- 錯誤處理更完善，前端可顯示具體失敗原因
- JSON body 更容易偵錯（可直接在 Network tab 看到 payload）

**缺點：** 
- 需要修改後端 API（新增端點）
- base64 編碼有效能開銷（大檔案變大 33%）
- 需要變更後端處理邏輯

---

### 2.3 方案 C：「完整重構上傳流程 + 支援大檔案分塊上傳」

**核心理念：** 將上傳系統正規化：先用 presigned URL 或直接上傳到 R2/S3，再通知 API 處理。

**修改點：**
1. 前端先 `POST /api/upload-url` 取得一個 Vercel Function 的暫存上傳 URL
2. 前端直接上傳檔案到該 URL（繞過 API Gateway 的大小限制）
3. API 收到通知後開始處理
4. 前端輪詢 `GET /api/jobs/{id}` 查進度

**優點：** 
- 可支援超大檔案
- 符合現代 Serverless 上傳模式
- 上傳和處理分離，架構更乾淨

**缺點：** 
- 需新增 R2/S3 帳號或 Vercel Blob
- 過度工程化（小問題大作為）
- 實作時間最長

---

## 3. 推薦方案

**推薦：方案 A（最小修補）+ 方案 B 的部分精神（改用 fetch 絕對路徑 + 強化錯誤處理）。**

理由：
1. 問題尚未完全確認根因為 Vercel 路由 or 前端 bug，先修補可見 bug 再觀察
2. `split('.').pop()` 是明確的 bug，修復風險為零
3. 強化錯誤處理對日後維運有長期價值
4. 若方案 A 修復後仍失敗，再實作方案 B 的 JSON 改版

---

## 4. 下一步行動

### Phase 2（Plan Writing）待確認項目：
1. 確認 Vercel 部署後 `/app` 路由是否正確映射（`vercel.json` 檢查）
2. 實際用瀏覽器 DevTools 重現 drag-drop 失敗的 scenario
3. 撰寫 `docs/plans/2026-04-04-ebook-upload-fix-plan.md`（Phase 2 產出）

### Phase 3 實作檢查清單：
- [ ] `handleFile` 副檔名修補
- [ ] fetch URL 改為絕對路徑
- [ ] 錯誤訊息顯示優化
- [ ] 驗證：drag-drop 測試（本地 + Vercel）
- [ ] 驗證：點擊上傳仍正常（迴歸測試）

---

## 5. 開放問題

1. **Q: 為何只有 drag-drop 失敗，點擊上傳是否也有問題？**  
   → 需實際測試確認。目前程式碼結構上 click 和 drag 最終都走同一個 `handleFile`，差異在 `e.dataTransfer.files` 的取值。若 drag 失敗但 click 正常，則根因在 `e.dataTransfer` 的取值。

2. **Q: Vercel 的 Python Functions 是否支援 `multipart/form-data`？**  
   → Vercel Python SDK 理論上支援，但實務上有些版本差異。需驗證 `UploadFile` 在 Vercel 環境是否正常接收。

3. **Q: `python-multipart` 是否已列在 `requirements.txt`？**  
   → **確認：是的**，已列在 `requirements.txt`。
