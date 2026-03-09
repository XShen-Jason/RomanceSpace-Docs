# RomanceSpace 核心架构指南
> 本文档面向开发者及运维人员，详细阐述本项目前后端彻底分离的微服务架构。

## 🎯 系统生态

RomanceSpace 是一个基于 Serverless (Cloudflare) + VPS (Node.js) 混合云架构构建的极速网页生成平台。

为了获得最佳的性能体验和最小化成本，系统由 **四个独立的代码仓库** 分工协作：

### 1. `RomanceSpace-Frontend` (前端 React SPA)
* **职责**：面向普通用户的交互界面（落地页、模板画廊、建站生成器）。
* **技术栈**：Vite + React 18 + React Router v6 + Vanilla CSS。
* **部署节点**：Cloudflare Pages 全球 CDN 网络。
* **访问域名**：`www.885201314.xyz` (直连，无 Worker 拦截)。
* **特点**：纯静态，0 敏感数据。所有的写操作与后端 API 通信。

### 2. `RomanceSpace-Backend` (VPS 后端 API)
* **职责**：处理所有重逻辑与写操作（模板文件上传解析、HTML 模板引擎注入渲染、与 Cloudflare 生态强绑定的 R2 读写及 KV 配置更新）。
* **技术栈**：Node.js + Express + AWS-S3-SDK (针对 R2) + CF REST API。
* **部署节点**：你的专属云服务器 (VPS) 实例。
* **访问域名**：`api.885201314.xyz` (需通过 Nginx 反向代理绑定域名，配合 CF 橙色云朵加密)。
* **特点**：单点故障敏感。需保管好 `.env` 中的大量 CF 管理员 Token 令牌。所有核心写操作均须由 `X-Admin-Key` 校验控制。

### 3. `RomanceSpace-Worker` (边缘网关与读缓存)
* **职责**：全球用户的超高速项目分发通道。
* **技术栈**：Cloudflare Workers (V8 JavaScript Edge Runtime)。
* **部署节点**：运行在离用户的手机真实物理距离最近的 Cloudflare 数据中心。
* **访问域名**：泛域名 `*.885201314.xyz`。
* **特点**：只读操作。无任何写逻辑的 200 行极简代码。负责智能多级缓存策略：先读 `Cache API` -> 再读 KV (获取映射) -> 再读 R2 (获取 HTML)。顺带拦截处理所有 404 死胡同，重定向到前端官网。

### 4. `RomanceSpace-Docs` (项目文档库)
* **职责**：就是你现在正在看的这套文档库。
* **部署节点**：Cloudflare Pages。
* **访问域名**：`docs.885201314.xyz` 和 `document.885201314.xyz`。

---

## 🚦 流量路由图 (Cloudflare DNS 编排)

为了防止 Worker 本身的泛解析拦截引发无限死循环，Cloudflare 的 **Workers 路由 (Worker Routes)** 必须严密配置：

| 客户端请求目标地址 | HTTP 动作 | 承接容器 | 是否经过 Worker | 描述说明 |
| :------- | :---: | :------- | :---: | :------- |
| `www.885201314.xyz` | GET | Pages (前端) | ❌ 不经过 (Bypass) | 面向 C端 用户的构建页面体验 |
| `api.885201314.xyz` | POST / GET | VPS (Nginx) | ❌ 不经过 (Bypass) | 承接所有纯数据写入/业务接口 |
| `docs.885201314.xyz` | GET | Pages (文档) | ❌ 不经过 (Bypass) | 研发人员查阅的纯静态 MD 文档 |
| `*.885201314.xyz` | GET | CF Worker | ✅ Edge 拦截 | 通过 KV 读取该域名配置并从 R2 返回用户生成的 HTML 站点，渲染零延迟 |

---

## 🔄 CQRS 读写分离流 (以“创建一个页面”为例)

1. **(前台交互)** 普通用户在 `www` (前端) 填写表单数据，并起名 `love`。
2. **(数据发往重镇)** 前端通过 `apiClient.js` 向 VPS `api.885201314.xyz/api/project/render` 接口提交 JSON 表单。
3. **(VPS 组装加工)** VPS 开始疯狂工作：校验表单 -> 读取原版 HTML -> 替换 `{{标题}}` -> **生成最终静态物理文件**。
4. **(VPS 发出号令)** VPS 将生成好的物理 HTML 上传到原厂 CF R2 存储桶；再把此路由字典挂载到 KV 存储；最后如果之前系统有旧缓存，VPS 还会顺手请求 CF Purge API 把以前旧版的网页清出缓存节点。
5. **(任务完结)** VPS 回复给前端“渲染就绪”。前端弹框显示：“生成成功！请点击 `love.885201314.xyz` 欣赏您的浪漫网页”。
6. **(消费者访问)** 接收到网页的小红收到链接 `love.885201314.xyz`，手机点击立即点亮最近的 Edge Worker。Worker 毫秒级从 KV/R2 里获取网页吐出页面并再次缓存。

这就是 RomanceSpace 强大的工程骨架！
