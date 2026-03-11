# RomanceSpace 平台前后端分离与 CQRS 读写架构详案

文档版本：v2.0
更新时间：2026-03-11

## 🌟 1. 架构核心思想：读写彻底分离 (CQRS)

为了在 Cloudflare 免费配额下支撑亿级并发"吃瓜"访问，同时支持后台模板编辑与创作者的复杂交互，本架构确立了一条铁律：

> **"让独立的 VPS 后端承担所有耗时的渲染、校验与写操作（体位重），让边缘的 Cloudflare Worker 退化成纯粹的高速的只读分发器（体位轻）。"**

### 为什么必须这样做？
1. **绕过 Worker 的"死刑"限制**：免费版 Worker 存在 10ms CPU 时间、限制 50 个子请求的硬约束。如果把"生成 HTML"、"渲染模板"和"遍历更新老用户"放在 Worker，只要并发量稍微提升或者模板更新涉及的老用户达到几十个，进程就会被 Cloudflare 强制掐断（Force Terminate），导致大规模数据损坏或丢失。
2. **极小化成本泄漏**：读写不分离的话，用户的每次访问都可能触发复杂的模板逻辑与重复查询，极大消耗 Worker 和 KV 读取次数。通过边缘缓存和提前预渲染（SSG），能够做到 90% 以上的访客访问达到 **0 Server 消耗**。
3. **消除耦合故障**：平台的管理界面、创作者编辑区如果挂了，完全不影响最终用户对生成好的个人主页的阅读与传播。

---

## 🏛 2. 核心架构与物理目录拆分

为了环境隔离防泄漏、统一团队心智开发负担，项目结构被**物理拆分**为 5 个完全独立的仓库结构：

### 目录 1：`RomanceSpace-Frontend` (平台前台与管理后台 UI)
*   **形态**：纯静态 SPA (React / Vue + Vite 或 Next.js 打包 static export)。
*   **部署位置**：Cloudflare Pages。
*   **职责**：提供可视化界面给创作者挑选模板、填写情话文本、上传音乐背景。它不处理任何逻辑，**只负责发送 AJAX (Fetch) 请求给 VPS API**。
*   **安全**：**切忌**在此项目包含任何数据库密码、R2 或 KV 的操作密钥 (Keys)。

### 目录 2：`RomanceSpace-Backend` (系统中央承重墙)
*   **形态**：Node.js API 服务 (Express、NestJS 或单起一个 Next.js API-Only 工程)。
*   **部署位置**：专有 VPS 服务器（配置 PM2 守护或 Docker 部署）。
*   **职责**：
    *   **唯一写权限持有者**：拥有操作数据库 (Supabase)、R2 存储、KV 和清理缓存的特权。
    *   **计算渲染核心**：执行 `injectData`，把模板与用户数据编织成最终生成的静态 `index.html`。
    *   **生命周期控制**：调用 Cloudflare 官方的 Zone Cache API 踢除废弃的边缘缓存。

### 目录 3：`RomanceSpace-Worker` (边缘分发网关)
*   **形态**：Cloudflare Worker。
*   **部署位置**：绑定泛域名（如 `*.885201314.xyz`）。
*   **职责**：
    *   **防御验证**：严格校验 `subdomain` 格式，拒绝非法请求。
    *   **截获拦截**：检查 URL 中的主机名。去 KV 中查询其关联路由。
    *   **穿透抓取**：根据映射去 R2 提取 `*.html` 内容。
    *   **打标签**：向 Response 头追加 `Cache-Control: public, max-age=3600` 等缓存指令及安全头，丢回 CDN。

### 目录 4：`RomanceSpace-Docs`
*   **形态**：静态文档站点。专注维护开发对接文档，与业务流解耦。

### 目录 5：`RomanceSpace-Templates` (模板资产中心)
*   **形态**：纯静态资源包 (HTML + CSS + 图片)。
*   **部署位置**：由独立 CI/CD 流水线推送覆盖至 CF R2 的 `/templates` 目录。
*   **职责**：为所有创建的情话页面提供主题骨架，它是独立于主系统的"切图大军生产基地"。
---

## 🗺 3. 架构运行流转图 (Mermaid)

```mermaid
sequenceDiagram
    participant AD as 管理员 (Admin)
    participant PF as 创作者前端 (Pages)
    participant VPS as 平台后端 (VPS API)
    participant DB as Supabase (数据真理)
    participant R2 as CF R2 (静储)
    participant KV as CF KV (路由)
    participant CDN as CF CDN (边缘缓存)
    participant WK as CF Worker (网关)
    participant US as 最终吃瓜群众

    %% --------------- 核心业务 1：模板体系 -------------------
    rect rgb(230, 240, 255)
        Note over AD, R2: 业务 1：模板发布与批量重生 (VPS 独家负责)
        AD->>VPS: [上传] 新模板 / 升级旧模板(v2)
        VPS->>DB: 注册模板 Schema 并记录版本
        VPS->>R2: [写] 存入公共资产 /templates/theme_A/v2/style.css
        
        alt 如果是"更新级模板"触发
            VPS-->>VPS: 后台异步查出所有使用了该模板的老用户项目
            VPS-->>DB: 提取这批人的个性化配置数据
            VPS->>R2: 并发向 R2 覆盖他们生成的 index.html (无版本叠加)
            VPS->>CDN: 调 CF OpenAPI 批量清除这批域名的旧缓存
        end
    end

    %% --------------- 核心业务 2：用户建站 -------------------
    rect rgb(240, 255, 240)
        Note over PF, CDN: 业务 2：创作者发帖/更新 (零垃圾覆盖模式)
        PF->>VPS: [API] 提交用户情话、配图与选定的模板
        VPS->>DB: 1. 持久化储存该项目所有配置
        Note over VPS: VPS 进行重计算：将数据注入模板产生最终 HTML
        VPS->>R2: 2. [强覆盖 Write] 存储到 /pages/{subdomain}/index.html
        VPS->>KV: 3. [写路由] project1.885201314.xyz -> subdomain
        VPS->>CDN: 4. (如果为更新) 调 API 清除旧缓存
        VPS-->>PF: 返回成功，跳转带 ?preview=时间戳 的实时预览视图
    end

    %% --------------- 核心业务 3：高并发看客 -------------------
    rect rgb(255, 240, 240)
        Note over US, WK: 业务 3：C端高防极速阅读引擎 (只读不过载)
        US->>CDN: 访问 https://project1.885201314.xyz
        alt CDN 节点恰好有缓存
            CDN-->>US: 瞬间直接返回 HTML (耗时 <5ms，无任何系统读取费)
        else 缓存过期 或 带有 ?preview=xxx 的强制刷新请求
            CDN->>WK: 穿透到 Worker
            WK->>WK: [防御] 验证 subdomain 格式合法性
            WK->>KV: [读] 判断 Host 有无绑定 R2 页面路由？
            WK->>R2: [读] 根据 KV 记录抓取 /pages/{subdomain}/index.html
            WK->>WK: [标记] 贴上 Cache-Control: max-age=3600 + 安全响应头 (若非预览)
            WK-->>CDN: 返回并由 CDN 拦截缓存副本
            CDN-->>US: 呈现页面
        end
    end
```

---

## 💣 4. 关键避坑与业务处理细节（防止后续层出不穷的 Bug）

### 避坑一：R2 存储垃圾堆积与过期连带错位
*   **错误做法**：每次生成/修改页面都创建新名字（如 `page_v1.html`, `page_v2.html`），同时手动调用 Delete 删除旧版。
*   **正确做法（0 垃圾法则）**：
    *   **针对管理端模板资产**：必须保留旧版本层级（存入 `/templates/{主题}/v1/`）。这样能保证老用户页面引用的骨架 CSS 永远不变形。
    *   **针对创作者的页面 HTML**：**永远采用同一个路径直接写入覆盖**（即 `/pages/{subdomain}/index.html`）。既不产生垃圾占用容量，又节省一次 Delete 次数的钱，且极大简化运维逻辑。KV 在更新项目内容时也不需要改动。

### 避坑二：Worker 兜底更新的 50 请求极限（雪崩点）
*   **错误做法**：像现有代码一样，将管理员更新模板后的逻辑：查找老用户 -> 生成几百个页面 -> 写入 R2 全部用 `ctx.waitUntil` 挂载在 Worker 身上。
*   **正确做法（异步渲染解耦）**：VPS 接收到管理员的更新请求，仅更新新内容至 R2 的 assets。然后给管理后台返回成功，告知"模板已更新，正在后台升级老客户网页..."。随后在 VPS 内部启动 Job（如 BullMQ / cron / setInterval）分批次处理旧版本页面覆盖。从而把长达 1 分钟甚至 10 分钟的工作剥离出用户直连主流程流。

### 避坑三：作者频繁点击"缓存未刷新"，导致刷爆系统
*   **错误做法**：指望单节点的 `caches.default.delete()` 起作用。
*   **正确做法（Purge API + 防刷预览策略）**：
    *   **后台刷新**：后端更新 R2 完毕后，向 CF Global API (`/client/v4/zones/{your_zone_id}/purge_cache`) 投递精确到 URL 的 Purge 请求，全网剔除此缓存。
    *   **前端即时预览**：创作者点击预览时，追加 URL Query `?preview=时间戳`。
    *   **Worker 特殊配合**：若 Worker 发现存在 `?preview`，则直接从 R2 硬拉取新档，回包同时要求浏览器不要缓存这个地址（`Cache-Control: no-cache, no-store`），确保实时性而不会污染 CDN 常规缓存。

---

## 🚧 5. 部署与重构优先级大纲 (Actionable Roadmap)

请严格按照以下从 P0 到底的优先级渐进式开发，确保不翻车：

### [P0 战役]：后端（VPS）基建搭建与接口对接 ✅ 已完成
1.  **架构初始化**：初始化 `RomanceSpace-Backend` 项目（Node.js + Express），连上 Supabase。
2.  **提取核心函数**：`injectData()`, `escapeHtml()` 已迁移到 VPS 的 `utils/html.js`。
3.  **核心接口**：
    *   `POST /api/project/render` — 含 R2 强覆盖、Supabase 记录、CDN Purge ✅
    *   `POST /api/template/upload` — 自动分发到 R2 /templates 目录 ✅
    *   `GET /api/template/raw/:name` — 供前端 BSR 使用 ✅
    *   `GET /api/template/preview/:name` — 重定向到 Worker ✅
    *   `POST /api/project/config/refresh-blocklist` — 刷新内存拦截名单 ✅

### [P1 战役]：Worker 边缘层重构与防御加固 ✅ 已完成
Worker v4 (Defense Hardened) 已实现所有防御机制（详见第 6 节）。

### [P2 战役]：前端 BSR 实时预览引擎 ✅ 已完成
Builder.jsx 已实现 iframe-based BSR 实时预览（详见第 6 节）。

---

## 🌐 6. 前台界面 BSR 实时预览引擎

对创作者而言，「所见即所得」是核心体验。本架构在创建页面（Builder）中实现了 **Browser-Side Rendering（BSR）**——浏览器端实时预览：

1. **前端加载原始模板**：Builder 选中模板后，向 VPS 调用 `GET /api/template/raw/:name` 拉取**未渲染的原始 HTML 源文件**（`text/plain`，不含注入数据）。
2. **注入 `<base>` 标签**：动态注入 `<base href="https://romancespace.885201314.xyz/assets/{模板名}/">` 使模板相对路径 CSS/图片全部指向 Worker 分发的 CDN 静态资产。
3. **实时占位符替换**：用户输入时，将 `{{key}}` 替换为对应值，并将生成的 HTML 注入 iframe 的 `srcDoc` 属性——**整个过程不触发任何网络请求，延迟为 0**。
4. **发布后 URL**：成功发布后返回带 `?preview=时间戳` 的 URL，供创作者即时绕过 CDN 缓存查看最新效果。

---

## 🛡 7. Worker 层高可用与防御计划（v4 Defense Hardened）

> Worker v4 建立起**边缘防御体系**，以四道防线应对恶意攻击与基础设施故障。

### 7.1 严格的 `subdomain` 输入验证（零资源消耗拒绝）

在任何 KV/R2 读取之前，通过严格正则校验 `subdomain`，直接拒绝非法请求：

```js
if (!/^[a-zA-Z0-9-]{1,64}$/.test(subdomain)) {
  return Response.redirect('https://www.885201314.xyz', 302); // 0 KV/R2 消耗
}
```

防范：路径穿越攻击、null-byte 注入、超长主机名、非 ASCII 编码攻击。

### 7.2 `?preview` 参数防穿透保护（防缓存爆破）

攻击者可通过无限变化的 `?preview=随机字符串` 绕过 CDN 缓存，消耗 R2 读取配额：

```js
if (previewVal.length > 64) {
  url.searchParams.delete('preview');
  return Response.redirect(url.toString(), 302); // 剥离参数，转为正常路由走 CDN 缓存
}
```

### 7.3 全局 `try/catch` 优雅降级（防裸奔 500）

将整个 `handleRequest` 包裹在顶层 `try/catch` 中。KV/R2 故障时返回自定义中文 500 页面，而非空白 Worker Error：

```js
async fetch(request, env, ctx) {
  try {
    return await handleRequest(request, env, ctx);
  } catch (err) {
    console.error('[Worker Fatal]', err?.message ?? err);
    return serverErrorResponse(); // 自定义友好 500 页面
  }
}
```

### 7.4 安全响应头注入（防 XSS / Clickjacking / MIME 嗅探）

所有 HTML 响应统一注入安全头：

```js
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',                   // 防 MIME 嗅探
  'X-XSS-Protection': '1; mode=block',                   // 老旧浏览器 XSS 过滤
  'X-Frame-Options': 'SAMEORIGIN',                       // 防 Clickjacking（允许同源 iframe）
  'Referrer-Policy': 'strict-origin-when-cross-origin',  // 控制 Referer 头泄露
};
```

通过 `...SEC_HEADERS` 展开合并到每个 `Response` 中，确保无遗漏。

### 7.5 R2 路径升级（含向下兼容）

新标准使用目录结构 `pages/{subdomain}/index.html` 支持干净 URL；保留旧格式 `pages/{subdomain}.html` 的兜底读取：

```js
async function fetchPageHtml(r2, projectId) {
  let obj = await r2.get(`pages/${projectId}/index.html`); // 新格式（优先）
  if (!obj) obj = await r2.get(`pages/${projectId}.html`); // 旧格式（兜底）
  return obj;
}
```

---

***

### 💡 结论
这一份方案的底层支撑在于 **对成本敏感和组件极简主义的坚守**。只要遵循"一地写（VPS），一地读（Worker），重读覆盖不留痕"的 CQRS 原理，这个架构可以轻松横向拓展，面对流量海啸岿然不动。

Worker v4 在此基础上建立起**边缘防御体系**：以正则阻断、参数守卫、全局兜底和安全响应头为四道防线，确保无论面对恶意攻击还是基础设施故障，系统都能以可控、友好的方式响应——而非裸奔崩溃。
