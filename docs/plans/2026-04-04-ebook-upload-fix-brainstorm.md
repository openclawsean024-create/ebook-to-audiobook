# 头脑风暴：ebook-to-audiobook 拖曳上传问题修复

**日期：** 2026-04-04
**阶段：** Phase 1 — Brainstorming
**负责人：** Alan (CTO)
**产出文件：** `docs/plans/2026-04-04-ebook-upload-fix-brainstorm.md`

---

## 1. 探索发现

### 1.1 项目结构

```
ebook-to-audiobook/
├── app.html          # 静态前端页面（部署于 Vercel Static）
├── api/index.py      # FastAPI 后端（Vercel Python Function）
├── vercel.json       # 路由配置
├── docs/plans/       # 设计文档目录
└── requirements.txt  # Python 依赖
```

### 1.2 前端上传逻辑（app.html）

上传区域使用两种触发方式：
- **点击上传**：`fileInput.click()` → `fileInput` change 事件 → `handleFile()`
- **拖曳上传**：`drop` 事件 → `e.dataTransfer.files` → `handleFile()`

两种方式最终都走同一个 `handleFile(file)` 函数，理论上行为应一致。

### 1.3 已识别的潜在问题

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| **B1** | `file.name.split('.').pop()` 对多级扩展名（如 `my.book.epub`）会返回 `book.epub` 而非 `epub`，导致扩展名验证失败 | `app.html` `handleFile()` | **高** |
| **B2** | `fetch('/api/convert')` 使用相对路径，在 Vercel 部署到子路径时（如 `/ebook-to-audiobook/`），URL 解析错误导致 404 | `app.html` `startConvert()` | **高** |
| **B3** | `fileInput` 绑定了 `accept=".epub,.pdf,.txt"`，但拖曳不经过 fileInput，不受此限制 | `app.html` | 低 |
| **B4** | `dragCounter` 计数方案在某些浏览器/场景下可能不同步，导致 dragover/dragleave 状态错误 | `app.html` | 中 |
| **B5** | `drop` 事件的 `e.preventDefault()` 与 `e.stopPropagation()` 顺序正确 | `app.html` | 无 |
| **B6** | 后端 CORS 已配置 `allow_origins=["*"]`，跨域应无问题 | `api/index.py` | 无 |
| **B7** | Vercel Static 页面调用同域 API，理论上是 same-origin，不存在 CORS | 架构分析 | 无 |

### 1.4 尚未确认的问题（需进一步调查）

- [ ] **Q1**：用户是在本地开发环境还是 Vercel 部署环境遇到问题？
  - 如果是本地，可能是相对路径问题（`/api/convert` 在本地 FastAPI 直接跑没问题，但 Vercel 静态部署时 URL 不同）
  - 如果是 Vercel，同样的相对路径问题
- [ ] **Q2**：点击上传是否也失败？若是，则问题在 `handleFile` 本身；若否，则问题在 drag 特有的 `e.dataTransfer.files` 取值
- [ ] **Q3**：Vercel 部署的 API 路由是否正确映射？需检查 `vercel.json`
- [ ] **Q4**：浏览器 Console 是否有 JS 错误抛出？

---

## 2. 根因假设

### 最可能根因（假设 A）：相对路径 fetch URL 错误

当 `app.html` 部署在 `https://xxx.vercel.app/` 时：
- `fetch('/api/convert')` → `https://xxx.vercel.app/api/convert` ✅ 正确
- 当部署在子路径时（如果有） → 可能 404

### 最可能根因（假设 B）：扩展名检测 bug（B1）

用户上传 `my.book.epub`：
- `file.name.split('.').pop()` → `"book.epub"`
- `['.epub','.pdf','.txt'].includes('.book.epub')` → `false`
- `showStatus('不支持的格式...', 'error')` 被触发
- 文件不会被附到 `selectedFile`，`convertBtn` 保持 disabled

### 最可能根因（假设 C）：浏览器 dataTransfer 限制

某些浏览器或隐私模式下，`e.dataTransfer.files` 可能为空数组。但代码已有 `Array.from(e.dataTransfer.files)` 的防御性编码，较不可能。

---

## 3. 修复方案提案

### 方案 A：最小修补 + 相对路径修复（推荐）

**核心理念**：修补已确认的 bug，不做架构改动，风险最低。

**修改点：**

1. **扩展名修复**（B1）：用 `lastIndexOf('.')` 替代 `split('.').pop()`
   ```javascript
   // 修复前
   const ext = '.' + file.name.split('.').pop().toLowerCase();
   // 修复后
   const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
   ```

2. **Fetch URL 改为绝对路径**（B2）：用 `window.location.origin` 构建完整 URL
   ```javascript
   // 修复前
   const res = await fetch('/api/convert', { method: 'POST', body: formData });
   // 修复后
   const res = await fetch(window.location.origin + '/api/convert', { method: 'POST', body: formData });
   ```

3. **轮询 URL 同理修复**
   ```javascript
   const res = await fetch(window.location.origin + '/api/jobs/' + currentJobId);
   ```

**优点**：最小变动、无副作用、风险接近零
**缺点**：未解决分块上传、大文件等长期问题

---

### 方案 B：JSON Body 上传（绕过 multipart/form-data）

**核心理念**：将文件转为 base64，通过 JSON body 上传，避免 Vercel Python Functions 的 multipart 处理问题。

**修改点：**
1. 前端：新增 `uploadFileAsBase64()` 函数
2. 前端：`POST /api/convert-json`（新端点）发送 JSON body
3. 后端：新增 `convert_json` 端点处理 base64 解码
4. 保留原有的 multipart 端点作为向后兼容

**优点**：JSON 更易调试、可控性更高
**缺点**：base64 编码有 33% 大小开销、大文件可能超 Vercel payload 上限

---

### 方案 C：引入 R2/Blob 存储（完整架构升级）

**核心理念**：文件先上传到对象存储，再触发后端处理。

**修改点：**
1. 接入 Vercel Blob 或 R2
2. 前端直接上传到 blob URL
3. API 接收 blob URL 后开始处理

**优点**：无文件大小限制、架构更健壮
**缺点**：需要额外云服务、过度工程化

---

## 4. 推荐决策

**推荐方案 A（最小修补）**，理由：
1. B1 是明确的、可重现的 bug，修复零风险
2. B2 是合理的防御性改进
3. 问题尚未完全确认根因，先修已知 bug 再观察
4. 方案 B/C 改动过大，在未确认根因前不应优先采用

---

## 5. 下一步（Phase 2）

1. **验证阶段**：用浏览器 DevTools 确认是 B1（扩展名）还是 B2（相对路径）
2. **创建计划文档**：`docs/plans/2026-04-04-ebook-upload-fix-plan.md`
3. **实施**：按方案 A 修改代码
4. **测试**：本地 + Vercel 环境验证 drag-drop 和 click-upload 均正常
5. **部署**：推送 GitHub → 自动部署到 Vercel
6. **更新 Notion**：将 Vercel URL 更新到 Notion 数据库

---

## 6. 开放问题

| 问题 | 优先级 | 状态 |
|------|--------|------|
| 确认用户遇到问题的环境（本地 vs Vercel） | 高 | 待确认 |
| 确认点击上传是否正常 | 高 | 待确认 |
| 浏览器 Console 是否有 JS 错误 | 中 | 待确认 |
| vercel.json 路由配置是否正确 | 中 | 待确认 |
