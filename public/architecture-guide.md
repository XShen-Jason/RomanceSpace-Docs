# RomanceSpace 架构指南

本文档面向开发者和维护人员，详细解释 RomanceSpace 的技术架构、请求流转过程以及各组件的职责。

## 整体架构 (CQRS + 边缘计算)

RomanceSpace 旨在提供毫秒级的极致访问体验，同时保持灵活的动态能力。我们采用了 **CQRS (命令查询职责分离)** 模式：

*   **读取 (Query) 是海量的**：由 Cloudflare Worker 在全球边缘节点纯静态处理，命中率高达 99%。
*   **写入 (Command) 是偶发的**：由位于核心 VPS 上的 Node.js 后端集中处理，进行鉴权、渲染并分发到全球。

整个系统由四个代码仓库组成：

1.  **Frontend (前端 SPA)**：React + Vite，无状态，部署在 Cloudflare Pages。
2.  **Backend (核心 API)**：Node.js + Express，处理重逻辑，部署在独立 VPS。
3.  **Worker (边缘网关)**：Cloudflare Worker，处理数百个边缘节点的路由和缓存。
4.  **Docs (文档站)**：您正在查看的站点，部署在 Cloudflare Pages。

---

## 流量流转图 (Traffic Flow)

当用户在浏览器中输入不同域名时，Cloudflare 网络层（DNS / Worker Routes）会进行精准的分发：

```mermaid
graph TD
    User([普通用户 / 访客])
    
    %% Domains
    D_WWW[www.885201314.xyz\n主站]
    D_API[api.885201314.xyz\n接口请求]
    D_SUB[*.885201314.xyz\n用户生成项目]
    D_DOCS[docs.885201314.xyz\n开发文档]
    
    %% Routing
    User --> D_WWW
    User -->|API Fetch| D_API
    User --> D_SUB
    User --> D_DOCS

    %% Destinations
    CF_Pages_Frontend[Cloudflare Pages\nFrontend SPA]
    CF_Pages_Docs[Cloudflare Pages\nDocs Site]
    VPS[VPS Server\nNode.js Backend]
    Worker[Cloudflare Worker\nEdge Gateway]

    %% Network links
    D_WWW -->|DNS CNAME (Bypass Worker)| CF_Pages_Frontend
    D_DOCS -->|DNS CNAME (Bypass Worker)| CF_Pages_Docs
    D_API -->|DNS A Record (Proxied)| VPS
    D_SUB -->|Wildcard Route| Worker

    %% Worker internal flow
    KV[(Cloudflare KV\n路由表)]
    R2[(Cloudflare R2\n静态页面存储)]
    EdgeCache[(Cloudflare Cache\nCDN 缓存)]

    Worker -.->|1. Lookup| EdgeCache
    EdgeCache -.->|Miss| KV
    KV -.->|Resolve ID| R2
    R2 -.->|Return HTML| Worker
```

---

## 组件详解

### 1. Cloudflare Pages (Frontend & Docs)

**职责**：提供对外的图形交互界面。
**特点**：
*   **零服务器成本**：享受 Cloudflare 的免费静态托管。
*   **无需 Worker 计算**：我们在域名路由层**禁用了** `www` 和 `docs` 域名的 Worker（即“旁路 Bypassed”），流量直达 Pages 节点，既保证了最高速度，也不消耗每日 10 万次的 Worker 免费额度。
*   **环境变量隔离**：Frontend 源码中无任何密钥。与后端通信的地址通过 Pages 的环境变量 `VITE_API_BASE_URL` 动态注入。

### 2. VPS Node.js Backend (写操作核心)

**职责**：所有会改变系统状态的操作（如：上传模板、生成新页面）。
**部署**：一台独立的 Linux VPS，前置 Nginx 反向代理。通过 Cloudflare DNS 代理（橙色云朵）保护真实 IP 免遭 DDoS 攻击。

**工作流 (以渲染页面为例 `POST /api/project/render`)**：
1.  **接收数据**：Frontend 发送 JSON（子域名、模板名、自定义文字）。
2.  **获取模板**：后端通过 `aws-sdk` (S3 兼容 API) 从 R2 获取模板的 `index.html`。
3.  **渲染 (SSR)**：使用后端的 `injectData()` 将用户的文字注入到 HTML 中。
4.  **强覆盖存储**：将处理好的成品 `[subdomain].html` 上传到 R2 `pages/` 目录。
5.  **更新路由**：通过 REST API 将 `[subdomain] -> { type, data }` 写入 Cloudflare KV。
6.  **清除缓存**：通过 CF Zone API 强制清除 CDN 节点上该页面的旧缓存，确保用户立即看到最新版。

### 3. Cloudflare Worker (边缘只读网关)

**职责**：接管所有的泛解析子域名流量（如 `amy.885201314.xyz`），并以毫秒级返回内容。目前代码精简到了不到 200 行，**没有任何 POST 写逻辑**。

**工作流**：
1.  **缓存优先**：检查 `caches.default`（本边缘节点的内存缓存）。命中则直接返回，0 延迟，0 API 消耗。
2.  **查路由表**：未命中时，查询 KV，确认这个子域名是否存在。
3.  **取页面**：从 R2 抓取已经由 VPS 预渲染好的 `[subdomain].html`。
4.  **动态注入**：在 `</body>` 前动态插入病毒营销的 Footer（"点击创建你的专属页面"），引导回流。
5.  **回填缓存**：将带有 Footer 的完整内容存入边缘缓存（1小时），并返回给用户。

### 4. 数据存储 (R2 & KV)

系统不使用传统关系型数据库存储页面，而是利用键值和对象存储的完美配合：
*   **R2 (对象存储)**：存储大体积文件。包含 `templates/`（模板的 HTML/CSS/JS/图片）和 `pages/`（VPS 预渲染好的用户成品 HTML）。
*   **KV (键值存储)**：用作毫秒级路由表和元数据源。
    *   键 `__tmpl__{模板名}`：存储模板的当前版本号。
    *   键 `{subdomain}`：存储项目的配置信息，告知 Worker 这是一个有效的项目。
