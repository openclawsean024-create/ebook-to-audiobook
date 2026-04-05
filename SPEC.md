# 電子書轉有聲書 — 產品規格書 v4 (Final)

> **版本**：v4.0  
> **更新日期**：2026-04-04  
> **狀態**：✅ READY FOR IMPLEMENTATION  
> **Sean 原始反饋**：「我把電子書拖進上傳區的時候，都沒有辦法正常地上傳，這應該如何解決？」  
> **前版狀態**：v3（ebook-to-audiobook-final.md）

---

## 一、願景與產品定位

**一句話價值主張**：將 EPUB / PDF 電子書拖入頁面，自動轉換為有聲書，隨時隨地聆聽。

**目標受眾**：通勤族、視障/閱讀障礙者、數位閱讀愛好者

---

## 二、Sean's Feedback — 上傳問題修復區 🔧

> 「我把電子書拖進上傳區的時候，都沒有辦法正常地上傳，這應該如何解決？」

### 2.1 問題根本原因分析

上傳失敗可能來自以下幾個環節：

| 環節 | 可能原因 | 解決方案 |
|------|----------|----------|
| **前端上傳元件** | 拖放事件未正確監聽、阻止了預設行為 | 檢查 `onDrop` / `onDragOver` 是否正確綁定；加入 `e.preventDefault()` |
| **檔案大小限制** | 前端或後端設定了 50MB 限制但未提示用戶 | 加入檔案大小預檢，超過時顯示友好提示 |
| **檔案格式驗證** | EPUB/PDF/MOBI 副檔名未完整覆蓋 | 擴展 MIME type 白名單 |
| **CORS 問題** | 跨域上傳至 API 失敗 | 確認 Vercel Blob 或 API Route 允許跨域 |
| **網路連線** | 上傳過程中斷 | 加入上傳進度條 + 斷點續傳機制 |
| **瀏覽器相容性** | 特定瀏覽器不支援 File API | 加入 feature detection，針對 Safari/Firefox 特殊處理 |
| **後端檔案處理** | `jszip` 解壓 EPUB 或 `pdf-parse` 失敗時無錯誤回傳 | 加入 try-catch + 結構化錯誤訊息 |

### 2.2 Alan 的 Debug Checklist（上傳失敗必檢）

```javascript
// 1. 確認拖放事件監聽
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();  // 必須！否則瀏覽器會當作連結開啟
  e.stopPropagation();
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = [...e.dataTransfer.files];
  handleFiles(files);
});

// 2. 檔案格式白名單（MIME types）
const ALLOWED_TYPES = [
  'application/epub+zip',        // EPUB
  'application/pdf',             // PDF
  'text/plain',                  // TXT
  'application/x-mobipocket-ebook', // MOBI
  'application/octet-stream',   // 某些系統輸出的 EPUB
];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(epub|pdf|txt|mobi)$/i)) {
    throw new Error('UNSUPPORTED_FORMAT');
  }
  if (file.size > MAX_SIZE) {
    throw new Error('FILE_TOO_LARGE');
  }
  return true;
}

// 3. 前端上傳 API 呼叫
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/book/upload', {
    method: 'POST',
    body: formData,
    // 不要設 Content-Type，讓瀏覽器自動設定 boundary
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.code || 'UPLOAD_FAILED');
  }
  
  return response.json();
}
```

### 2.3 後端上傳處理（API Route）

```javascript
// pages/api/book/upload.js
export const config = {
  api: {
    bodyParser: false,  // 必須！否則無法處理 FormData
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const data = await parseFormData(req);
    const file = data.get('file');
    
    if (!file) {
      return res.status(400).json({ code: 'NO_FILE', message: '未檢測到檔案' });
    }

    // 格式驗證
    const allowedExtensions = ['.epub', '.pdf', '.txt', '.mobi'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ 
        code: 'UNSUPPORTED_FORMAT',
        message: `不支援的格式，目前支援：${allowedExtensions.join(', ')}`
      });
    }

    // 大小驗證
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ 
        code: 'FILE_TOO_LARGE',
        message: '檔案大小超過 50MB 限制'
      });
    }

    // 上傳到 Vercel Blob
    const { put } = await import('@vercel/blob');
    const blob = await put(`books/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    return res.status(200).json({ 
      bookId: blob.url, 
      status: 'uploaded',
      fileUrl: blob.url 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      code: 'UPLOAD_ERROR',
      message: error.message 
    });
  }
}
```

### 2.4 常見錯誤代碼與用戶訊息

| 錯誤代碼 | 翻譯 | 顯示給用戶的訊息 |
|----------|------|-----------------|
| `NO_FILE` | 未上傳檔案 | 請選擇要上傳的電子書檔案 |
| `UNSUPPORTED_FORMAT` | 格式不支援 | 抱歉，目前不支援這個檔案格式，請上傳 EPUB、PDF 或 TXT |
| `FILE_TOO_LARGE` | 檔案太大 | 檔案大小不能超過 50MB |
| `UPLOAD_FAILED` | 上傳失敗 | 上傳失敗，請稍後重試 |
| `API_RATE_LIMITED` | 流量限制 | 伺服器忙碌中，請 30 秒後重試 |
| `PARSE_ERROR` | 檔案解析失敗 | 無法讀取這個檔案的內容，請確認檔案未加密或損壞 |

### 2.5 友善的上傳失敗 UI

```
┌─────────────────────────────────────┐
│  📚 將電子書變成有聲書                │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  ⚠️ 上傳失敗                  │   │
│  │                             │   │
│  │  錯誤：FILE_TOO_LARGE        │   │
│  │  檔案大小不能超過 50MB       │   │
│  │                             │   │
│  │  [重新選擇檔案]              │   │
│  └─────────────────────────────┘   │
│                                     │
│  支援：EPUB, PDF, TXT（最大 50MB）  │
└─────────────────────────────────────┘
```

---

## 三、其餘功能規格（摘要）

> 其餘功能規格詳見 v3（ebook-to-audiobook-final.md），本版本僅新增上傳問題修復區。

### 三、A. 用戶流程（摘要）
```
上傳書籍 → 格式偵測 → 解析內容 → 選擇朗讀設定 → 開始轉換 → 完成通知 → 線上聆聽/下載
```

### 三、B. 技術棧（摘要）
- 前端：Next.js 14 + Tailwind CSS + epub.js / pdf.js
- 後端：Node.js API Routes + Edge TTS / ElevenLabs
- 儲存：Vercel Blob + Supabase
- 認證：Clerk

### 三、C. 優先順序（修復為最高優先）
1. 🔴 **P0**：上傳失敗問題修復（本次更新核心）
2. P1：PDF 解析增強
3. P2：離線播放（PWA）
4. P3：批量轉換

---

## 四、Alan 驗收標準

- [ ] 拖放 EPUB 檔案後，正確觸發上傳（網路請求發出）
- [ ] 上傳失敗時，顯示具體錯誤代碼與友善訊息（非空白畫面）
- [ ] 檔案大小超過 50MB 時，預先阻擋不上傳
- [ ] 副檔名為 `.epub` 但 MIME type 是 `application/octet-stream` 的檔案也能上傳
- [ ] 上傳進度條正確顯示
- [ ] 失敗後重試按鈕可正常運作

---

*規格書版本：v4*
*更新時間：2026-04-04*
*更新內容：上傳失敗問題修復（Alan implementation checklist）*
*負責人：Sophia（CEO/產品負責人）*
