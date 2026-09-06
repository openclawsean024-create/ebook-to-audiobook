# Ebook to Audiobook — CHANGELOG

> 規格書版本沿革。所有 breaking change、infra 升級、市場決策都記錄於此。

---

## v3.0.2 — 2026-09-06（批次 C fleet infra upgrade）

### Added
- 新增 `PRD/CHANGELOG.md`（本檔）
- 新增 `.github/workflows/ci.yml`：四 job（lint / test / build / deploy）
- 新增 `e2e/` 與 `e2e/smoke.test.ts`：API 端點冒煙測試（Node + Vitest）

### Changed
- `package.json`：`lint` script 由 `next lint` 改為 `tsc --noEmit`
  - 原因：Next.js 16 移除 `next lint`，需自行處理
  - 等效行為：TypeScript 編譯器靜態檢查，覆蓋 `src/**/*.{ts,tsx}`
- `PRD/SPEC.md`：標頭升級至 v3.0.2；新增 §0.1 v3.0.2 改版摘要
  - 主體內容（§1–§15）不變
- `.github/workflows/`：以 `ci.yml` 取代舊 `vercel.yml` 的單一 deploy job
  - deploy job 改為「build 通過後才執行」
  - 維持 `secrets.VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID_EBOOK_TO_AUDIOBOOK` 三組 secrets 介面

### Verified
- `npm run lint`（`tsc --noEmit`） ✅
- `npm test`（vitest） ✅ 107 / 107 passed
- `npm run build`（Next.js 16.2.10 / Turbopack） ✅ 18 routes generated
- `e2e/smoke.test.ts` ✅ 6 checks

### Notes
- `master` 為唯一 production branch
- Deploy 仍走 Vercel（Next.js 16 + Turbopack + Vercel 是原生支援鏈）

---

## v3.0 — 2026-07-19（批次 B — Sweet Spot 5 問 forced upgrade）

詳見 `PRD/SPEC.md` §0。摘要：

- 入口由「EPUB only」→「EPUB/PDF → audiobook」
- Wedge 由「單一聲音」→「多角色 TTS + 角色表 + 聲音 mapping」
- Sweet Spot 改採 1–10 量表，本版 sweet = 7.8/10
- 商業化公式：30 + sweet×7 = 84.6/100
- 新增 §15.11 量表 / §15.12 五項 ADR / §15.13 五項市場驗證
