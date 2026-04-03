# 【eBook to Audiobook】規格計劃書

## 1. 專案概述

### 1.1 專案背景與目的

現代人時間破碎，通勤、運動、做家事的時間通常無法閱讀，卻適合「聽書」。然而市面上的有聲書多為英文，中文書籍的有聲版本嚴重不足。本工具讓使用者上傳 PDF/epub 文件，AI 自動識別章節結構、生成章節摘要，並以自然的 AI 語音朗讀為有聲書。我們支援多角色配音（不同章節或旁白/正文切換不同聲音），並提供 MP3 音檔下載，讓使用者能在任何播放器收聽。
### 1.2 目標受眾（TA）

- 通勤族 / 駕駛：需要解放雙手，用耳朵吸收資訊
- 視障/閱讀障礙者：有聲書是剛性需求，但中文內容匱乏
- 自媒體創作者：將書籍內容轉為 Podcast 素材
- 語言學習者：透過有聲書邊聽邊學，同時吸收知識
### 1.3 專案範圍

In Scope：PDF / epub 上傳與解析、章節結構識別、章節摘要生成（可跳過閱讀直接聽重點）、AI 語音朗讀（ElevenLabs / Azure TTS）、MP3 音檔下載、深色/淺色主題、章節進度管理
Out of Scope：即時串流播放（先完成下載再播放）、自定義配音員聲音、商業有聲書出版
### 1.4 參考網站分析

- Google Read Aloud（Google Document AI）：免費但只有英文、機器音色明顯
- ElevenLabs：我們語音品質標的，但無文件解析功能（需自建）
- Audible：內容豐富但無自製功能，中文書籍少
## 2. 資訊架構與動線

### 2.1 網站地圖（Sitemap）

我的書籍庫（書架/上傳/處理狀態）→ 書籍詳情（章節列表/摘要預覽/播放器/下載）→ 處理記錄（佇列進度/歷史）→ 設定（預設語速/配音員/輸出格式）
### 2.2 使用者動線（Mermaid）

 flowchart TD
    A([使用者進入我的書籍庫]) --> B{意圖}
    B -->|上傳新書| C[拖放 PDF 或 epub]
    B -->|繼續處理| D[選擇已有書籍]
    C --> E[檔案上傳中]
    E --> F{解析成功?}
    F -->|失敗| G[顯示錯誤提示]
    F -->|成功| H[自動進入書籍詳情]
    H --> I[顯示章節結構]
    D --> I
    I --> J{操作}
    J -->|聽摘要| K[播放 AI 摘要]
    J -->|完整朗讀| L[開始處理]
    J -->|下載| M[選擇格式下載 MP3]
    L --> N[處理佇列顯示進度]
    N --> O[處理完成通知]
    O --> P[播放或下載]
    K --> Q([完成])
    M --> Q
    P --> Q
### 2.3 使用者旅程圖（Mermaid）

 journey
    title eBook to Audiobook 旅程
    section 上傳階段
      下載書籍 PDF: 5: 通勤族
      拖放到網站上傳: 4: 視障者家屬
    section 處理階段
      看到章節結構確認: 4: 所有人
      選擇語音風格: 5: 自媒體創作者
      等待 AI 處理: 3: 所有人
    section 收聽階段
      先聽摘要快速瀏覽: 5: 通勤族
      通勤時段完整收聽: 5: 駕駛
      下載離線收聽: 4: 語言學習者
    section 複習階段
      標記章節待下次收聽: 4: 視障者
      用摘要做讀書筆記: 5: 自媒體創作者
## 3. 視覺與 UI

### 3.1 品牌設計指南

- Primary #6366F1：主要按鈕、品牌元素、播放控制項
- Secondary #0F172A：深色背景、主要容器底色
- Accent #10B981：處理完成、成功下載 / Progress #F59E0B：處理中
### 3.2 跨裝置支援

Desktop ≥1024px：雙欄佈局（書籍列表 + 詳情側邊播放器） / Tablet 768-1023px：單欄，播放器固定底部 / Mobile <768px：全功能支援（上傳/處理進度/播放器/下載）
## 4. 前端功能規格

- PDF / epub 拖放上傳：支援 PDF 和 epub，最大 50MB
- 自動章節識別：解析目錄結構，顯示章節列表
- 章節摘要生成：AI 自動生成每章摘要（可跳過直接聽）
- 處理進度追蹤：即時顯示處理階段（解析/摘要/TTS/合成）
- 內建播放器：播放/暫停、進度條、語速調整（0.75x/1x/1.25x/1.5x/2x）
- 章節跳轉：點擊章節直接跳轉播放
- MP3 單章/全書下載：支援單章或完整書籍打包 ZIP
- 閱讀進度同步：localStorage 記錄當前播放位置
- 深色/淺色主題
## 5. 後端與技術規格

### 5.1 技術棧

- 前端：Next.js 14（App Router）+ Tailwind CSS + React Player（音訊播放）
- 文件解析：PyMuPDF（PDF）/ epub Library（epub）
- AI 摘要：Claude API / GPT-4o
- 語音合成：ElevenLabs API 或 Azure Cognitive Services TTS
- 後端：FastAPI + Celery（任務佇列） + Redis
- 音檔儲存：Cloudflare R2 / AWS S3（MP3 檔案）
- 資料庫：PostgreSQL + Redis 快取
## 6. 專案時程與驗收標準

### 6.1 里程碑時程

 timeline
    title eBook to Audiobook 開發時程
    phase 1: 文件解析引擎 (Week 1-2)
        UI/UX 設計稿確認 : 4 days
        PDF 解析模組 : 3 days
        epub 解析模組 : 3 days
    phase 2: AI 處理流水線 (Week 3-5)
        Claude/GPT 摘要生成 API : 4 days
        ElevenLabs TTS 串接 : 3 days
        進度追蹤系統 : 3 days
        MP3 合成與拼接 : 4 days
    phase 3: 前端播放器 (Week 6-7)
        書籍詳情頁 : 3 days
        內建播放器 UI : 4 days
        進度同步功能 : 3 days
    phase 4: 測試與交付 (Week 8-9)
        端到端測試（完整流程） : 4 days
        處理穩定性測試 : 3 days
        Bug 修復與文件 : 3 days
### 6.2 驗收標準

- 支援瀏覽器：Chrome 120+、Safari 17+
- PDF 解析成功率 > 95%（標準格式）
- 語音自然度：MOS Score > 4.0（ElevenLabs）
- 完整朗讀處理時間：< 10 分鐘（10 萬字書籍）
- MP3 音檔品質：128kbps AAC
### 6.3 保固與維護

上線後 30 天：免費 Bug 修復 / AI API 費用監控：每月追蹤 Claude + ElevenLabs 用量與成本 / 資料保留：R2 儲存 180 天後自動清除
## 7. 功能勾選清單

### 前端

### 後端

### DevOps

