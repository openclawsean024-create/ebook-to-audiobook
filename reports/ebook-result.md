# 電子書轉有聲書 — 退回修正報告（第3次）

## 任務資訊
- **Notion Page ID**：329449ca-65d8-811e-9f70-cd60dffa296a
- **Vercel**：https://ebook-to-audiobook-seans-projects-7dc76219.vercel.app
- **部署時間**：2026-04-12

---

## 修正內容

### ① accept 屬性缺少 .pdf
- **位置**：`src/app/converter/page.tsx`
- **修正前**：`accept=".epub,.pdf,.txt,.PDF,application/pdf"`
- **修正後**：`accept=".pdf,.epub,.txt,application/pdf"`
- 統一格式，並將 `.pdf` 放在首位提高識別率

### ② hidden input 無 label/onclick
- **位置**：`src/app/converter/page.tsx`
- **修正前**：`<label>` 沒有 `onClick`，且結構上 label 包含 input 後又關閉
- **修正後**：將 `<label onClick={(e) => e.stopPropagation()} />` 自閉合作為視覺觸發區，input 獨立在外，`onClick` 同時存在於 parent div 和 label 上，防止點擊冒泡

---

## Git 資訊
- **Commit**：`3cdfa6a`
- **Branch**：`master`
- **Message**：`fix: add .pdf to accept, add onclick to label for hidden input`

---

## Vercel 部署
- **生產網址**：https://ebook-to-audiobook-seans-projects-7dc76219.vercel.app
- **狀態**：✅ 部署成功
