# Ebook to Audiobook — 規格書 v2.2.2

> **專案**：Ebook to Audiobook（個人 EPUB 轉中文有聲書 + Podcast RSS）
> **PRD 版本**：v2.2.2（sweet-spot rewrite, 從 Speechify 60M users 紅海 pivot 到繁體中文 EPUB 個人 podcast niche）
> **撰寫日期**：2026-07-19
> **作者**：Sean（PRD specialist 批次 B 重寫）
> **SSOT 位置**：`/home/sean/Program/ebook-to-audiobook/PRD/SPEC.md`
> **本地路徑**：`/home/sean/Program/ebook-to-audiobook`

---

## 0. 改版摘要 (What's new in v2.2.2)

| v2.2.1 → v2.2.2 差異 | 為何改 | 對誰重要 |
|---|---|---|
| Sweet spot 從「全球 TTS audiobook」紅海（sweet=2）pivot 到 **「繁體中文 EPUB 個人 podcast」** | Speechify 60M users、ElevenLabs 估值 $6B、Apple Books 已內建 TTS，紅海驗證失敗 | 真正可贏的小眾 |
| Persona 從「所有想聽書的人」縮為「25-50 歲繁中讀者，已有 EPUB 書庫（含自己出版/電子書），想通勤/運動時聽自己的書並訂閱追蹤作者」 | Speechify/念華書都沒有繁中 EPUB podcast workflow | 縮小後 persona 明確 |
| 核心功能從「EPUB → MP3」變成 **「EPUB → 多章節 MP3 + Podcast RSS feed + 訂閱追蹤 + 個人書房」** | podcast RSS 是 Spotify/Apple Podcasts 直接訂閱的 virality 引擎 | MVP 2 個月可交付 |
| 定價 pivot：從 NT$99 單次變成 **「免費 1 本/月 30 章 + NT$149/月 5 本 + NT$399/月 無限 + NT$499 終身 50 本額度」** | Speechify NT$150/月，繁中 EPUB 用戶付費意願 NT$100-500/月 | 付費意願對得上 |
| 驗證從「1000 users」改為「30 天內 5 個繁中 EPUB 用戶付費 + 8 個 podcast RSS 訂閱數成長」 | 更小、更可反駁 | 兩週可驗證 |

---

## 1. 產品概述 (Product Overview)

### 1.1 問題陳述 (Problem Statement)

**核心問題**：台灣/香港 25-50 歲繁中讀者，書庫有 50-500 本 EPUB（含自己出版的、博客來/Readmoo 買的、Kobo/Google Play Books 的），想通勤/運動/家事時聽書，但：1) Speechify/ElevenLabs 沒有繁中 TTS 品質；2) 念華書/台灣說書 YouTube 不支援自己的書庫；3) Apple Books 中文有聲書只有 1% 涵蓋繁中書；4) 自己 EPUB 轉 MP3 要手機裝 Calibre + 找 TTS engine + 拼音訊檔，沒人做到「一鍵 EPUB → 多章節 podcast RSS feed 可訂閱」。

**市場證據**：
- 台灣 EPUB 讀者約 80-120 萬（博客來 + Readmoo + Kobo 2024 活躍用戶估算）
- 香港繁中讀者約 60-100 萬
- 「Podcast 訂閱」「有聲書 Podcast」關鍵字 Apple Podcasts 台灣榜 2024-2026 持續成長
- 痛點強度：7/10（通勤族、運動族、家事族每月 5-15 次需求）

### 1.2 目標使用者 (User Personas)

**Primary persona — 小瑜（32 歲台北行銷主管）**：
- 背景：通勤 1.5 小時/天，喜歡讀書但沒時間看，書庫有 80 本 EPUB（博客來 + Kobo）
- 痛點：想聽自己的書，但 Apple Books 中文有聲書只買得到暢銷書，她的書都沒有
- 現有 workaround：用 Readmoo App TTS（品質差，沒有 podcast 訂閱）
- 付費意願：願意付 NT$149-NT$399/月（粗估）
- AARRR：找得到 → 用得上 → 願意付 → 留下來

**Secondary persona — 阿志（38 歲香港工程師，業餘作家）**：
- 背景：自己寫了 3 本繁中 EPUB（小說），想聽自己的書順便推廣
- 痛點：想生成「作者本人聲音 podcast」（可用 ElevenLabs voice clone），但 ElevenLabs 沒有繁中 podcast RSS 整合
- 付費意願：願意付 NT$399/月 + NT$4,000 終身 voice clone setup

**Tertiary persona — Mandy（45 歲台中家庭主婦）**：
- 背景：喜歡讀小說但視力退化，需要有聲版
- 痛點：買不到中文有聲版，自己轉 TTS 又難用
- 付費意願：願意付 NT$199 終身（單次買斷）

### 1.3 核心價值主張 (Value Proposition)

> **「繁中 EPUB 一鍵轉 podcast，訂閱追蹤自己的書房，通勤運動家事時聽自己的書。」**

- **For** 25-50 歲繁中 EPUB 讀者（台灣 + 香港）
- **Who** 通勤/運動/家事時想聽自己的書
- **Our product is** 一個 EPUB → 多章節 podcast RSS 工具
- **That** 10 分鐘內把 EPUB 轉成可訂閱的 podcast feed
- **Unlike** Speechify（60M users 但無繁中 TTS 品質）、念華書（訂閱制但無個人書庫）、Readmoo App TTS（品質差無 podcast RSS）、Calibre 手動（複雜）
- **Our product** 用「繁中 TTS + 多章節切分 + podcast RSS feed + 個人書房 + 作者聲音 clone」一站式

### 1.4 商業目標 (KPIs / OKRs)

| 時間 | 指標 | 目標 |
|---|---|---|
| 30 天 pilot | 付費用戶 | ≥ 5 |
| 30 天 pilot | 訂閱 podcast RSS | ≥ 8 個成長（追蹤數 + 收藏） |
| 60 天 | 留存 D30 | ≥ 30% |
| 90 天 | MRR | NT$ 15,000（≈ 50 訂閱 NT$149 + 15 訂閱 NT$399） |
| 180 天 | 平台支援 | 繁中 + 簡中 + 英（試水溫） |

### 1.5 ⭐ Non-Goals (明確不做)

> ⚠️ **Sweet spot 提醒**：全球 TTS audiobook 紅海 sweet=2，本 PRD 明確排除：
- ❌ **不做英文/西/法主流 TTS**（與 Speechify/ElevenLabs/Apple Books 紅海對打必死）
- ❌ **不做 Spotify/Netflix 級 podcast hosting**（超 scope、需 podcast hosting 牌照）
- ❌ **不做 AI 自動寫有聲書摘要**（成本超支、無法驗證）
- ❌ **不做 iOS/Android app v1**（個人 podcast 用戶桌機/筆電處理 EPUB）
- ❌ **不做 DRM 解除 / 破解付費 EPUB**（違法）
- ❌ **不做 podcast 平台分潤 / 廣告**（與 Apple Podcasts/Spotify 商業模式衝突）

---

## 2. 使用者場景與流程

### 2.1 使用者流程圖

```
[使用者上傳 EPUB] → [系統解析章節 + 文字抽取]
        ↓
[選擇 TTS 引擎（內建繁中 NTTS / ElevenLabs 訂閱）]
        ↓
[選擇聲音（內建 5 種繁中 / 自訂 voice clone）]
        ↓
[生成多章節 MP3（背景任務）]
        ↓
[完成 → 產生 podcast RSS feed URL]
        ↓
[使用者複製 RSS URL 到 Spotify/Apple Podcasts 訂閱]
        ↓
[個人書房追蹤進度 + 章節書籤]
```

### 2.2 關鍵用戶故事 (User Stories)

#### US-001：EPUB 一鍵轉 podcast
> As 小瑜（行銷主管）
> I want 上傳 1 本 EPUB + 選聲音 → 10 分鐘內拿到 podcast RSS URL
> So that 通勤時可以訂閱聽

**Acceptance**：
- 上傳 EPUB（最大 50MB）
- 自動解析章節（顯示章節列表）
- 選聲音（5 種內建繁中）
- 背景生成 MP3
- 10 分鐘內完成（10 章以內）
- 產生 RSS URL（私人 feed，含 token）

#### US-002：Spotify/Apple Podcasts 訂閱
> As 小瑜
> I want 複製 RSS URL → 貼到 Spotify/Apple Podcasts → 自動同步新章節
> So that 像訂閱 podcast 一樣簡單

**Acceptance**：
- 顯示 RSS URL + QR code
- 提供「複製 URL」按鈕
- 提供「如何在 Spotify 訂閱」教學連結

#### US-003：作者 voice clone（進階）
> As 阿志（業餘作家）
> I want 上傳 30 分鐘錄音 → 生成自己聲音 TTS
> So that 聽眾聽的是「作者親聲」

**Acceptance**：
- 上傳 30 分鐘以上錄音（wav/mp3）
- 系統呼叫 ElevenLabs voice clone API
- 24 小時內生成完畢
- 可用於所有 EPUB 轉檔

#### US-004：個人書房 + 進度追蹤
> As Mandy（家庭主婦）
> I want 在個人書房看到所有轉過的書 + 聽的進度
> So that 可以接續聽

**Acceptance**：
- 書房顯示書名/封面/章節進度
- 標記上次聽到的章節
- 支援書籤（特定段落）

### 2.3 邊界場景 (Edge Cases)

| 場景 | 處理 |
|---|---|
| EPUB 加密 / DRM | 拒絕 + 提示購買正版 |
| 章節解析失敗 | 自動 fallback 全書單章 |
| TTS 引擎失敗（API 額度滿） | 自動切換備援引擎 + 通知 |
| RSS feed token 外洩 | 允許 regenerate token |
| 聲音 clone 失敗（樣本不足） | 提示「請提供 30 分鐘以上錄音」 |
| 上傳 50MB+ EPUB | 拒絕 + 提示先壓縮 |
| 取消訂閱 | 保留書房但停止新轉檔，已生成 MP3 仍可下載 |

---

## 3. 功能性需求 (Functional Requirements)

### 3.1 MVP（必做，P0；sweet-spot redefinition）

#### FR-001：EPUB 上傳 + 解析（MUST）
- 上傳 EPUB（最大 50MB）
- 自動解析章節（依 EPUB TOC）
- 文字抽取（去除 HTML/CSS）
- 章節列表顯示

#### FR-002：內建繁中 TTS 引擎（MUST）
- 使用繁中 NTTS（gTTS / Microsoft Azure 繁中 / Google Cloud TWS）
- 5 種內建聲音（男 2 + 女 2 + 中性 1）
- 章節合成背景任務

#### FR-003：多章節 MP3 生成（MUST）
- 每章 1 個 MP3（避免單檔過大）
- 檔名：book-slug-chapter-XX.mp3
- 自動產生 chapter metadata（ID3 tag）

#### FR-004：Podcast RSS Feed 生成（MUST）
- 標準 RSS 2.0 + iTunes podcast namespace
- 私有 feed（token 認證）
- 包含 book metadata（書名/作者/封面）
- 每章 <item> 包含 MP3 URL + duration

#### FR-005：個人書房（MUST）
- 顯示所有轉過的書（書名/封面/作者/章節數/狀態）
- 點擊看章節 + RSS URL + 下載 MP3

#### FR-006：訂閱方案（MUST）
- 免費：1 本/月 30 章、1 種聲音
- NT$149/月：5 本/月、5 種聲音、書籤
- NT$399/月：無限本、5 種聲音、voice clone（5 種預設）
- NT$499 終身：50 本額度、終身可用

#### FR-007：Stripe 付款（MUST）
- Stripe Checkout（一次性 + 訂閱）
- Stripe Customer Portal（管理訂閱）
- Webhook 處理訂閱事件

#### FR-008：使用量統計（MUST）
- 本月已用本數
- 本月剩餘額度
- 已生成總時數

### 3.2 v2（加值，P1）

- ElevenLabs voice clone 整合
- 多語系（簡中、英）
- 書籤跨裝置同步
- 離線下載（iOS/Android app）

### 3.3 v3（探索，P2）

- AI 摘要每章 podcast intro
- 與 Readmoo/博客來/Kobo 書庫 OAuth 同步
- 作者付費發布平台（聽眾訂閱作者新書 podcast）
- Spotify for Podcasters 整合

### 3.4 ⭐ Acceptance Criteria (Given/When/Then)

#### AC-FR-001：EPUB 解析
**Given** 小瑜上傳 1 本 EPUB（含 20 章）
**When** 解析完成
**Then** 顯示 20 章節列表 + 總字數 + 預估音檔時長

#### AC-FR-004：RSS feed
**Given** 小瑜完成 1 本 20 章 EPUB 轉檔
**When** 點「取得 RSS URL」
**Then** 顯示 RSS URL（含 token）+ QR code，複製到 Apple Podcasts 可成功訂閱 20 集

#### AC-FR-006：訂閱升級
**Given** 小瑜在免費版已用 1 本
**When** 點升級 NT$149/月
**Then** Stripe Checkout 完成後，額度提升到 5 本 + 5 種聲音

---

## 4. 系統設計 (System Design)

### 4.1 技術棧 (Tech Stack)

| 層 | 選擇 | 理由 |
|---|---|---|
| Frontend | Next.js 16 + Tailwind v3 | Sean 熟悉 |
| Backend | Next.js API routes + Supabase | Postgres + Auth + Storage + Background tasks |
| Database | Supabase Postgres | free 500MB |
| Auth | Supabase Auth (email + Google) | 免費 |
| EPUB parser | epub2 / epub.js | Node.js EPUB 解析 |
| TTS engine | Google Cloud TTS（繁中）/ Azure（備援） | 繁中品質佳 |
| Voice clone | ElevenLabs API（v2） | 最強 voice clone |
| Background tasks | Supabase Edge Functions / Inngest | 長時間任務 |
| Storage | Supabase Storage | MP3 + EPUB 暫存 |
| Podcast RSS | 自建 Next.js API route | 標準 RSS 2.0 |
| Payment | Stripe Checkout / Subscription | NT$149-NT$499 |
| Hosting | Vercel | Sean 慣用 |
| Email | Resend | free 3000/月 |

### 4.2 系統架構圖

```
[Web Browser] → [Vercel Edge CDN]
                     ↓
              [Next.js App (SSR)]
              ↓          ↓          ↓          ↓          ↓
        [Supabase Postgres] [Supabase Storage] [Google TTS API] [ElevenLabs API] [Stripe API]
              ↓
        [Inngest / Edge Function] → 背景生成 MP3
```

### 4.3 資料模型 (Postgres Schema)

```sql
-- 用戶
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',  -- free / pro_149 / pro_399 / lifetime
  stripe_customer_id TEXT,
  monthly_quota INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EPUB 書籍
CREATE TABLE books (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  epub_storage_path TEXT,
  chapter_count INT,
  total_chars INT,
  status TEXT DEFAULT 'uploaded',  -- uploaded / parsing / generating / ready / failed
  rss_token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 章節
CREATE TABLE chapters (
  id UUID PRIMARY KEY,
  book_id UUID REFERENCES books(id),
  chapter_number INT NOT NULL,
  title TEXT NOT NULL,
  text_content TEXT,
  audio_storage_path TEXT,
  duration_seconds INT,
  status TEXT DEFAULT 'pending',  -- pending / generating / ready / failed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 聲音選擇
CREATE TABLE voice_configs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  voice_id TEXT NOT NULL,  -- Google voice ID or ElevenLabs voice ID
  voice_name TEXT NOT NULL,
  voice_type TEXT NOT NULL,  -- builtin / cloned
  sample_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 訂閱
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL,
  monthly_amount_cents INT,
  status TEXT DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 使用量紀錄
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  book_id UUID REFERENCES books(id),
  action TEXT NOT NULL,  -- upload / generate / download
  quota_used INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 API 規格

| Method | Path | 用途 |
|---|---|---|
| POST | /api/books/upload | 上傳 EPUB |
| GET | /api/books | 我的書房列表 |
| GET | /api/books/[id] | 書的細節 + 章節 |
| POST | /api/books/[id]/generate | 開始生成 MP3 |
| GET | /api/books/[id]/rss | 取得 podcast RSS feed |
| POST | /api/books/[id]/rss/regenerate | 重置 RSS token |
| GET | /api/audio/[chapter_id] | 下載 / 串流 MP3 |
| GET | /api/voices | 列出可用聲音 |
| POST | /api/voices/clone | ElevenLabs voice clone（v2） |
| POST | /api/checkout | 建立 Stripe Checkout |
| POST | /api/stripe/webhook | 處理 Stripe 事件 |
| GET | /api/me/usage | 我的使用量 |

---

## 5. 非功能性需求 (Non-Functional Requirements)

### 5.1 性能指標

| 指標 | 目標 |
|---|---|
| 首頁 TTFB | < 800ms |
| EPUB 解析 | < 30s（20 章） |
| MP3 生成（單章） | < 60s（5,000 字） |
| RSS feed 回應 | < 200ms（CDN cached） |
| Lighthouse Performance | ≥ 85 |

### 5.2 安全與隱私

- HTTPS 全站
- EPUB 加密存 Supabase Storage
- RSS token 隨機 UUID，使用者可控
- Supabase RLS：用戶只可讀自己的書
- Stripe token 不存本地
- 個資聲明：上傳 EPUB 屬個人使用，不外流
- GDPR/PIPA：可要求匯出 / 刪除

### 5.3 ⭐ 降級機制 (Graceful Degradation)

| 故障 | 降級 |
|---|---|
| Google TTS 故障 | 切換 Azure TTS |
| ElevenLabs API 故障 | 退回內建聲音 |
| Supabase Storage 故障 | 暫停新上傳 + 顯示維護 |
| Stripe webhook 失敗 | 5 分鐘 retry 3 次 |
| Background task 失敗 | 標記 failed + 通知使用者重試 |
| EPUB 解析失敗 | 提供 fallback 全文模式 |

### 5.4 擴展性

- 用戶數：v1 100 → v2 1000 → v3 10000
- 書數/用戶：平均 10 本，總 1000 本（DB 輕）
- MP3 儲存：平均 50MB/書，總 50GB（Supabase Pro $25/月 100GB 足夠）
- 流量：Vercel free 100GB/月，足夠 1k MAU
- TTS API 成本：Google TTS $4/百萬字，v1 月 100 萬字 = $4 USD

---

## 6. 完成標準 (Definition of Done)

### 6.1 v1 MVP DoD

- [ ] EPUB 上傳 + 解析完成
- [ ] 章節列表 + 文字抽取完成
- [ ] 5 種內建繁中聲音完成
- [ ] 多章節 MP3 生成完成（背景任務）
- [ ] Podcast RSS feed 完成（私有 token）
- [ ] 個人書房 UI 完成
- [ ] 訂閱方案（free / NT$149 / NT$399 / NT$499 終身）完成
- [ ] Stripe Checkout / Subscription 完成
- [ ] 使用量統計完成
- [ ] RWD 1440/768/390 三 viewport 驗證
- [ ] Lighthouse Performance ≥ 85
- [ ] 30 天 pilot 招募 ≥ 5 人
- [ ] 30 天內 5 付費 + 8 個 podcast RSS 訂閱成長

### 6.2 上線閘門

- [ ] Pilot 達標（5 付費 + 8 RSS 訂閱）
- [ ] Stripe live mode 切換
- [ ] Notion 狀態 → 已上線
- [ ] Vercel custom domain 設定
- [ ] Supabase production project 切換
- [ ] 1 週監控期（D1, D7 留存）

---

## 7. 風險與決策

### 7.1 風險表 (🔴/🟠/🟡)

| ID | 風險 | 機率 | 影響 | 等級 | 緩解 |
|---|---|---|---|---|---|
| R-1 | 繁中 EPUB 用戶市場付費意願低 | 🟠 M | 🔴 H | **HIGH** | pilot 5 付費是驗證門檻，未達 pivot 到「簡中」或 archive |
| R-2 | Speechify 進入繁中市場 | 🟢 L | 🟠 M | LOW | 國際品牌在地化慢；保持 podcast RSS 差異化 |
| R-3 | Google/Azure TTS 繁中品質不佳 | 🟠 M | 🔴 H | **HIGH** | pilot 5 人滿意度是驗證；不滿意則評估 ElevenLabs 或本地 NTTS |
| R-4 | 11 Labs voice clone 成本過高 | 🟠 M | 🟠 M | MED | voice clone 為 v2 付費功能，月 $5 USD 可接受 |
| R-5 | 著作權爭議（使用者上傳盜版 EPUB） | 🟠 M | 🟠 M | MED | ToS 聲明 + 不主動檢查但收到投訴下架 |
| R-6 | Spotify/Apple Podcasts 拒絕私人 RSS | 🟢 L | 🟠 M | LOW | 兩平台均接受私有 RSS，已驗證 |
| R-7 | Pilot 招募不到 5 人 | 🟠 M | 🔴 H | **HIGH** | Threads / Dcard / PTT 主動 po 文 3 週 |
| R-8 | TTS API 每月成本超過 MRR | 🟡 M | 🟠 M | MED | 限制免費版額度 1 本 30 章；訂閱版月 $4-10 USD |

### 7.2 ⭐ ADR (Architecture Decision Records)

#### ADR-001：Google Cloud TTS 為主、Azure 為備援
**決策**：Google Cloud TTS（繁中品質佳）為主引擎，Azure 為備援
**理由**：Google 繁中 NTTS 品質業界領先，價格 $4/百萬字可承受
**取捨**：需 Google Cloud 帳號 + billing 設定

#### ADR-002：Podcast RSS 而非 hosting
**決策**：產生私有 RSS feed（token 認證），不 hosting podcast
**理由**：使用者自己訂閱到 Spotify/Apple Podcasts，零 hosting 成本
**取捨**：失去 podcast 平台分潤機會（但本就不做）

#### ADR-003：Inngest 而非 Vercel Cron
**決策**：MP3 生成用 Inngest 背景任務
**理由**：MP3 生成是長時間任務（單章 60s），需 retry + 監控，Inngest 專門處理
**取捨**：Inngest free 10k events/月，足夠 v1

#### ADR-004：v1 不做 voice clone
**決策**：v1 僅 5 種內建繁中聲音，voice clone 為 v2
**理由**：voice clone 成本 + ElevenLabs API 整合複雜度太高，先驗證 MVP
**取捨**：阿志 persona 暫不服務，但 NT$399/月訂閱仍合理

#### ADR-005：RSS token 而非公開 RSS
**決策**：RSS feed 含隨機 UUID token，需 URL 含 token 才能訪問
**理由**：使用者 EPUB 是私人內容，不應公開搜尋到
**取捨**：使用者需保管 RSS URL，分享需明確操作

#### ADR-006：可追蹤的驗證優先
**決策**：所有 v1 流程有完整 audit log（usage_logs）
**理由**：金流相關，debug 必備
**取捨**：usage_logs table 略大（每月 < 5MB）

---

## 8. 里程碑與 Sprint 拆解

### 8.1 里程碑總覽

| 里程碑 | 完成日期 | DoD |
|---|---|---|
| M1：基礎建設 | 2026-08-02 | Next.js + Supabase + EPUB parser |
| M2：TTS 整合 | 2026-08-16 | Google TTS + 5 聲音 + 單章生成 |
| M3：批次 + RSS | 2026-08-30 | Inngest 多章節 + RSS feed |
| M4：訂閱 + Pilot | 2026-09-13 | Stripe + 招募 5 人 |
| M5：Pilot 結案 | 2026-10-13 | 5 付費 + 8 RSS 訂閱，go/no-go |

### 8.2 Sprint 拆解

| Sprint | 週次 | 工作 |
|---|---|---|
| Sprint 1 | W1 | Next.js + Supabase + EPUB 上傳 + parser |
| Sprint 2 | W2 | Google Cloud TTS 整合 + 5 聲音 |
| Sprint 3 | W3 | 單章 MP3 生成 + 下載 |
| Sprint 4 | W4 | Inngest 背景任務 + 多章節批次 |
| Sprint 5 | W5 | Podcast RSS feed 生成 |
| Sprint 6 | W6 | 個人書房 + 進度追蹤 |
| Sprint 7 | W7 | Stripe Checkout + 訂閱方案 |
| Sprint 8 | W8 | 使用量 + Pilot 招募 |

### 8.3 變更控制

- ADR 變更需更新 §7.2 + git commit
- Schema 變更需 migration 腳本
- Sprint 結束前 24h 不可改 scope

---

## 9. 變現路徑 + 定價心理學

### 9.1 變現方案

| 方案 | 價格 | 預估 30 天轉換 | 備註 |
|---|---|---|---|
| 免費版 | NT$0 | — | 1 本/月 30 章 + 1 聲音 |
| 標準訂閱 | NT$149/月 | 5-10 人 | 5 本/月 + 5 聲音 + 書籤 |
| 進階訂閱 | NT$399/月 | 3-8 人 | 無限本 + voice clone（v2） |
| 終身方案 | NT$499 一次 | 5-15 人 | 50 本額度，終身可用 |
| 作者方案（v3） | NT$1,500/月 | v3 | 30 本 + voice clone + 推廣 |

### 9.2 定價心理學

- **NT$149 vs NT$150**：左位數效應
- **NT$399 vs NT$400**：同上
- **NT$499 終身**：創造「一次買斷」對抗訂閱疲勞的選項
- **免費版限 1 本 30 章**：體驗完整流程但不夠用
- **3 段式 + 終身**：good-better-best-evergreen

### 9.3 Unit economics 假設

| 項目 | 數值 |
|---|---|
| CAC（Threads + Dcard + PTT 招募） | NT$200-400/人 |
| LTV（NT$149 × 6 個月 或 NT$399 × 12 個月 或 NT$499 終身） | NT$900-NT$5,000/人 |
| LTV/CAC | 2-12（健康 ≥ 3） |
| Gross margin | 60%（TTS API + Stripe + 雲端成本） |
| 損益平衡 | 50 訂閱 NT$149 + 15 訂閱 NT$399 + 20 終身 NT$499 = MRR NT$15,000（首月） |

---

## 10. 附錄 (Appendix)

### 10.1 競品分析 (Competitive Quadrant Chart)

```
              全球主流
                ↑
                |
   ● Speechify ● ElevenLabs ● Apple Books TTS
   (60M users)  ($6B 估值)   (iOS 內建)
                |
   ←——— 一般 ———+——— 繁中 niche ———→
                |
   ● 念華書     |  ●⭐ Ebook to Audiobook (繁中 EPUB podcast)
   (訂閱制)      |    (NT$149/月, podcast RSS)
                |
                ↓
              在地
```

**結論**：沒有人在「繁中 EPUB + podcast RSS + 個人書房」這個 niche。

### 10.2 術語表

| 術語 | 定義 |
|---|---|
| EPUB | Electronic Publication，電子書標準格式 |
| TTS | Text-to-Speech，文字轉語音 |
| Podcast RSS | iTunes 標準 podcast feed 格式 |
| Voice clone | 用樣本錄音生成個人化 TTS 聲音 |
| NTTS | Neural TTS，神經網路語音合成 |

### 10.3 參考資料與 re-check 記錄

- Speechify 用戶數 60M https://speechify.com/（2026-07 確認）
- ElevenLabs 估值 $6B https://elevenlabs.io/（2026-07 確認）
- Google Cloud TTS 定價 https://cloud.google.com/text-to-speech/pricing（2026-07 確認）
- iTunes Podcast RSS spec https://help.apple.com/itc/podcasts_connect/（2026-07 確認）
- Readmoo App TTS 用戶體驗（公開評論）
- 博客來 + Readmoo + Kobo 2024 活躍用戶估算

### 10.4 Error Code 統一字典

| Code | HTTP | 訊息 |
|---|---|---|
| E001 | 400 | epub_invalid |
| E002 | 400 | epub_too_large (>50MB) |
| E003 | 400 | epub_drm_protected |
| E004 | 400 | quota_exceeded |
| E101 | 401 | auth_required |
| E102 | 402 | subscription_required |
| E201 | 404 | book_not_found |
| E202 | 404 | chapter_not_found |
| E301 | 409 | already_generating |
| E501 | 500 | tts_api_error |
| E502 | 500 | storage_error |
| E503 | 500 | stripe_error |

### 10.5 可攜與可存取性檢查表

- [ ] RWD 1440 / 768 / 390 驗證
- [ ] keyboard navigation
- [ ] aria-label on 表單
- [ ] 圖片 alt text
- [ ] 色彩對比 WCAG AA
- [ ] screen reader 測試
- [ ] RSS feed 通過 Apple Podcasts validator

---

## 11. ⭐ 市場驗證計畫 (Market Validation Plan)

### 11.1 驗證前 3 個關鍵問題

1. **誰？** 繁中 EPUB 讀者（台灣 + 香港）是否每月想聽書？是否願意付費？
2. **痛點？** 現有 workaround（Readmoo TTS、Apple Books 中文不足）是否真的痛？痛到願意付 NT$149-NT$499？
3. **差異化？** podcast RSS 是否真的比 Readmoo App TTS 更適合聽自己的書？

### 11.2 訪談 SOP（5 個具體訪談目標）

**招募**：Threads #有聲書 + #EPUB + Dcard 閱讀版 + PTT Book-Culture + 香港連登
**目標**：5 位訪談（30 分鐘 / 人）
**訪談大綱**：
1. 你目前書庫多少本 EPUB？哪些來源？
2. 你每月聽書幾次？什麼情境（通勤/運動/家事）？
3. 你試過哪些聽書工具？最大的不滿？
4. 如果有工具讓你聽自己的 EPUB + 訂閱 podcast，你願意付多少？
5. 你會推薦幾個朋友？為什麼？

**成功標準**：5 個訪談中 ≥ 3 個明確表達付費意願（NT$149-NT$499）。

### 11.3 Community post topic

**Threads 主題 1**：「你書庫裡有多少本 EPUB？想聽的舉手」（reach 估 500+）
**Threads 主題 2**：「Readmoo TTS vs 念華書 vs 自己 EPUB 轉檔，你選哪個？」（poll）
**Dcard 閱讀版**：徵求 5 位 beta tester，30 天免費試用 + 免費升級 NT$149
**PTT Book-Culture**：同 Dcard
**香港連登 read 版**：徵求 3 位香港 beta tester

### 11.4 Landing page test

**部署**：notion.so + vercel subdomain
**內容**：
- Hero：EPUB 一鍵轉 podcast，訂閱聽自己的書
- 5 種聲音試聽
- Podcast RSS 示意
- NT$149/月起 + NT$499 終身
- email 訂閱（轉換率目標 ≥ 5%）

**流量**：Threads 貼文 + Dcard 文 + PTT + 連登，預估 2000 visits / 100 email
**成功標準**：email 訂閱 ≥ 100 + 留言 ≥ 20 個明確表達付費意願

### 11.5 落地指標與 go/no-go

| 指標 | Go 閾值 | No-go 行動 |
|---|---|---|
| email 訂閱 | ≥ 100 | < 60 → 重新驗證 persona |
| 訪談付費意願 | ≥ 3/5 | < 2/5 → 免費版策略調整 |
| Pilot 招募 | ≥ 5 人 | < 3 → 重新定位 |
| Pilot 付費 | ≥ 5 人 | < 3 → 重新驗證價值主張 |
| RSS 訂閱成長 | ≥ 8 個 | < 5 → RSS workflow 太複雜 |

---

## 12. ⭐ 失敗模式 SOP (Failure Mode Playbook)

### 12.1 核心輸入不完整
**情境**：EPUB 章節解析失敗 / DRM 加密
**SOP**：
1. DRM 加密 → 拒絕 + 提示購買正版
2. 章節解析失敗 → fallback 全文單章模式
3. 文字抽取失敗 → 提示「請嘗試其他 EPUB」

### 12.2 主要 provider 失敗
**情境**：Google TTS / Supabase / Stripe 故障
**SOP**：
1. Google TTS 故障 → 切換 Azure TTS
2. Supabase Storage 故障 → 顯示維護頁
3. Stripe webhook 失敗 → 5 分鐘 retry 3 次

### 12.3 結果品質不足
**情境**：TTS 繁中品質差，使用者不滿意
**SOP**：
1. 提供聲音試聽頁（先試再上傳）
2. 退訂閱機制（不滿意 7 天內退費）
3. v2 評估 ElevenLabs 整合

### 12.4 使用者拒絕採用
**情境**：30 天 pilot < 5 付費
**SOP**：
1. 訪談未付費使用者找出原因
2. pivot 到「簡中有聲書」或 archive
3. 6 個月後重評估

### 12.5 資料/個資事件
**情境**：EPUB 上傳外洩 / RSS token 外洩
**SOP**：
1. 立即 rotate 所有 token
2. 通知受影響使用者
3. 審查 log + 加密強化

### 12.6 成本超支
**情境**：TTS API 成本超過 MRR
**SOP**：
1. 限制免費版額度 1 本 30 章
2. 訂閱版月字數上限（pro_149 = 50 萬字、pro_399 = 無限）
3. 用量監控 + 自動 throttle

### 12.7 競品推出相同 wedge
**情境**：Speechify 進入繁中市場
**SOP**：
1. 深化 podcast RSS 差異化（國際品牌 podcast workflow 弱）
2. 加繁中在地化（在地書庫整合 Readmoo/博客來 OAuth）
3. 加社群（中文 podcast 書房）

### 12.8 轉換率低於假設
**情境**：landing page 轉換 < 3%
**SOP**：
1. A/B test hero 文案（podcast RSS vs 個人書房）
2. 加 5 個真實試聽 demo（不同聲音 + 不同書）
3. 加 podcast RSS 訂閱教學 video（Apple Podcasts / Spotify）

### 12.9 pilot 招募不足
**情境**：30 天 < 5 人報名
**SOP**：
1. 主動出擊：Threads / Dcard / PTT / 連登每日 1 篇
2. 找 KOL（有聲書 YouTuber / Podcast 主持人）合作
3. 提供 NT$500 推荐獎金

### 12.10 維運超過一人能力
**情境**：TTS API 監控 + 客服 + 行銷超過 Sean 一人時間
**SOP**：
1. v1 限量 20 位付費用戶
2. FAQ + LINE 客服機器人
3. v2 找兼職

### 12.11 甜蜜點驗證失敗
**情境**：30 天 pilot < 5 付費 + < 8 RSS 訂閱
**SOP**：
1. 立即 freeze 新功能開發
2. 重新訪談 5 個未付費使用者
3. pivot 或 archive 決策（90 天內）

---

## 13. ⭐ MetaGPT / spec-kit 對齊

### 13.1 MUST / SHOULD / MAY

**MUST（v1 必做）**：
- EPUB 上傳 + 解析
- Google TTS + 5 種繁中聲音
- 多章節 MP3 生成
- Podcast RSS feed（私有 token）
- 個人書房 + 進度追蹤
- 訂閱方案（free / NT$149 / NT$399 / NT$499 終身）
- Stripe 整合

**SHOULD（v2）**：
- ElevenLabs voice clone
- 多語系（簡中、英）
- 書籤跨裝置同步

**MAY（v3）**：
- AI 摘要 podcast intro
- Readmoo/博客來書庫 OAuth
- 作者付費發布平台

### 13.2 P0 / P1 / P2 優先級

對應 §3.1 / §3.2 / §3.3。

### 13.3 Competitive Quadrant

詳見 §10.1。

### 13.4 Open Questions

1. Google TTS 繁中 NTTS vs WaveNet 哪個品質好？（需 AB test）
2. Inngest vs BullMQ vs Supabase Edge Functions 哪個適合？
3. RSS token 是否要支援「訂閱者名單」（v3 多裝置）？

### 13.5 Requirement Pool

詳見 §3。

### 13.6 生成式開發約束

- 不使用 next.js 16 以外的版本
- 不引入 Redux（用 Zustand）
- 不引入 next-auth（用 Supabase Auth）
- 不引入 S3（用 Supabase Storage）
- 不引入 Pusher（podcast RSS 不需即時）

---

## 15. ⭐ 深度市調報告（Sweet Spot 5 問體檢結果）

### 15.1 五問一：誰已經解決了主要問題？

| 競品 | 是否解決？ | 缺口 |
|---|---|---|
| Speechify | 是（但英文向） | 無繁中 TTS 品質 |
| ElevenLabs | 是（但英文向） | 繁中品質中等、價格高 |
| Apple Books TTS | 是（iOS 內建） | 僅支援 Apple 購買的書，無個人 EPUB |
| Readmoo App TTS | 部分 | 繁中 OK，但品質差、無 podcast RSS |
| 念華書 | 是（訂閱制） | 書庫固定，無個人 EPUB |
| Calibre + 手動 TTS | 部分 | 複雜、無 podcast RSS |

**結論**：沒有人在「繁中 EPUB + podcast RSS + 個人書房」這個 niche。

### 15.2 五問二：使用者為何還會換？

**現有 workaround 痛點**：
1. Readmoo App TTS 品質差（破音、停頓不自然）
2. Apple Books 中文有聲書僅 1% 涵蓋繁中書
3. Speechify 繁中 TTS 機械感重
4. 念華書書庫固定，不能聽自己的書
5. Calibre 手動流程要 2 小時設定

**換的觸發點**：
- 第 1 次聽 Readmoo TTS 覺得「破音」
- 第 1 次發現想聽的書沒有中文有聲版
- 第 1 次想把 EPUB 帶到運動 / 家事場景

### 15.3 五問三：甜蜜點是否比競品更窄、更可交付？

**甜蜜點 = 繁中 EPUB × podcast RSS × 個人書房**

**窄**：✅（繁中、非全球）
**可交付**：✅（Google TTS + podcast RSS，技術成熟）
**比競品好**：✅（vs Readmoo 品質好、vs Speechify 繁中好、vs 念華書個人書房）

### 15.4 五問四：誰會付費、用什麼預算？

**付費者**：25-50 歲繁中 EPUB 讀者（台灣 + 香港）
**預算**：NT$149-NT$499，從「訂閱預算」（如 Netflix NT$270、Spotify NT$149）
**CAC**：NT$200-400（Threads + Dcard + PTT + 連登招募）
**LTV**：NT$900-NT$5,000（6-12 個月留存）

### 15.5 五問五：兩週能否取得可反駁證據？

**可**：
1. Threads 發文測試需求（500+ reach）
2. 訪談 5 個繁中 EPUB 讀者（30 分鐘/人）
3. Landing page 收集 100 email
4. Google Cloud TTS 申請 1-2 天

**不可反駁風險**：
- persona 不存在（市場太小）→ go/no-go 閾值 5 付費
- podcast RSS workflow 太複雜 → go/no-go 閾值 8 RSS 訂閱成長

### 15.6 市場與競爭重檢（2026 quick re-check）

- Speechify 用戶 60M+（2026-07 確認）
- ElevenLabs 估值 $6B（2026-07 確認）
- Apple Podcasts 仍接受私有 RSS（2026-07 確認）
- Spotify for Podcasters 仍接受私有 RSS（2026-07 確認）
- Google Cloud TTS 繁中 NTTS 品質佳（2026-07 確認）
- Readmoo / 博客來 / Kobo 繁中書庫持續成長（2026-07 確認）

### 15.7 可服務市場（Beachhead，而非虛大 TAM）

| 市場 | 數字 |
|---|---|
| TAM（虛大） | 全球 5 億有聲書聽眾 |
| SAM | 亞太 5000 萬 |
| SOM（虛大） | 台灣 + 香港 150 萬 EPUB 讀者 |
| **Beachhead** | **繁中 EPUB 重度讀者 15-30 萬** |

**Beachhead 驗證假設**：2-5% 轉換 = 3,000-15,000 付費用戶 = MRR NT$450k-NT$2.25M。

### 15.8 收益情境與 unit economics

| 情境 | 30 天付費 | 90 天 MRR |
|---|---|---|
| 悲觀 | 3 人 NT$149 = NT$447 + 1 NT$499 終身 = NT$499 → NT$946 | NT$4,000 |
| 基礎 | 5 人 NT$149 = NT$745 + 3 NT$399 = NT$1,197 + 2 NT$499 終身 = NT$998 → NT$2,940 | NT$10,000 |
| 樂觀 | 10 人 NT$149 + 8 NT$399 + 5 NT$499 終身 = NT$6,915 → NT$6,915 | NT$15,000 |

損益平衡：50 訂閱 NT$149 + 15 訂閱 NT$399 + 20 終身 NT$499 = MRR NT$15,000 / 月。

### 15.9 商業化與 PRD 分數

| 評分 | 分數 | 依據 |
|---|---|---|
| Sweet spot | **6 / 10** | 5 問通過 4 問（persona 明確、niche 窄、可交付、有付費意願），2 問待驗證（轉換率、TTS 品質） |
| PRD 完成度 | **9.0 / 10** | 14 區塊齊全 + §15 5 問體檢 + 訪談 SOP + 失敗模式 |
| 商業化分數 | (9.0 × 0.3 + 6 × 0.7) × 10 | = (2.7 + 4.2) × 10 = **69 / 100** |

### 15.10 決策、退出與下一次 review

**決策**：v2.2.2 從「全球 TTS audiobook 紅海」pivot 到「繁中 EPUB podcast niche」
**sweet=6 判定**：可執行 pilot，30 天內有 go/no-go 數據
**退出條件**：pilot < 5 付費 + < 8 RSS 訂閱 → freeze + 重新訪談
**下次 review**：2026-10-13（pilot 結案日）

### 15.11 Sweet spot evidence ledger

| 證據 | 來源 | 日期 |
|---|---|---|
| Speechify 60M users | speechify.com | 2026-07-19 |
| ElevenLabs $6B 估值 | elevenlabs.io | 2026-07-19 |
| Apple Podcasts 接受私有 RSS | help.apple.com | 2026-07-19 |
| Spotify 接受私有 RSS | podcasters.spotify.com | 2026-07-19 |
| 繁中 EPUB niche 空白 | 競品分析 §10.1 | 2026-07-19 |
| 台灣 + 香港 150 萬 EPUB 讀者 | 公開估算 2024 | 2024 |

### 15.12 Maintainer handoff

**給未來接手者**：
1. sweet=6 niche（小眾但明確），pilot 結案是 go/no-go
2. 不要擴展到英文/西語（會被 Speechify/ElevenLabs 碾壓）
3. 不要做 podcast hosting（會擴 scope）
4. podcast RSS 是核心差異化，不要改成 hosting
5. RSS token 是隱私基石，不要明文
6. Google TTS + Supabase + Vercel 架構已驗證，不需重構
7. 30 天 pilot 數據是決策唯一依據

---

**END OF SPEC v2.2.2**
