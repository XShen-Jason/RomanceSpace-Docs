# RomanceSpace 配额优化与架构调整方案

## 🚩 核心瓶颈排查 (Free Tier Constraints)

| 资源项目 | 免费配额 | 风险等级 | 逻辑漏洞 |
| :--- | :--- | :--- | :--- |
| **Worker 请求数** | 10万次/天 | **高** | 模板所有的 CSS/JS/图片都走 Worker 代理 (`/assets/`)，一次访问消耗几十个请求。 |
| **KV 写入次数** | 1,000次/天 | **极高** | 1. 每次 `render` 必定写 KV (即使是内容微调)；2. `__users__template` 索引在 KV 里高频重写。 |
| **KV 读取次数** | 10万次/天 | 中 | 每次访问都要读 KV 路由配置；`/assets/` 请求也要读模板元数据。 |
| **R2 Class A (写)** | 100万次/月 | 低 | 对比 KV 极其宽松，应尽可能把逻辑压在 R2。 |

---

## 🛠️ 优化方案 (Implementation Plan)

### 1. KV 写入“脱水” (Reduce KV Writes)
*   **优化点 A**：在 `project.js` 的 `render` 逻辑中，增加 KV 状态检查。
    *   **逻辑**：只有当 `isCreate` (新域名) 或用户的 `type` (模板切换) 发生变化时，才执行 `kvPut`。普通的内容修改只更新 R2，不写 KV。
*   **优化点 B**：**彻底切除 KV 用户索引**。
    *   **重构**：删除 `addToUserIndex` 逻辑（即 `__users__templateName`）。
    *   **理由**：Supabase 里已经有了 `projects` 表，查询“谁用了我的模板”通过 SQL `SELECT subdomain FROM projects WHERE template_type = '...'` 只要几毫秒，且没有写入配额限制。别在 KV 里做这种事。

### 2. Worker 流量“瘦身” (Reduce Worker Requests)
*   **优化点 C**：资产请求去 Worker 化。
    *   **方案**：在模板生成的 HTML 中，将 `<base>` 标签或资源路径指向 R2 的公共预览链接或 CDN 域名，绕过 Worker。
    *   **短期折中**：在 Worker 的 `handleRequest` 中，针对 `/assets/` 增加更高效的内存缓存 `cachedMetas`，减少 KV 读取压力。

### 3. Worker 内部内存缓存 (Memoization)
*   **优化点 D**：在 Worker 全局作用域声明 `let templateCache = {}`。
    *   **理由**：Worker 进程在活跃期间会复用。缓存 `__tmpl__` 的元数据可以避免同一用户访问时反复消耗 KV 读取配额。

---

## 📅 执行路线图 (Milestones)

### 第一阶段：后端热修复 (降低 KV 写入风险)
1.  修改 `RomanceSpace-Backend/src/routes/project.js`：
    *   删除 `addToUserIndex` 调用。
    *   在 `kvPut(subdomain, ...)` 前增加比对逻辑。
2.  修改 `RomanceSpace-Backend/src/routes/template.js`：
    *   删除上传时的 `kvGet("__users__")` 相关日志逻辑。

### 第二阶段：Worker 性能加固 (降低读取与请求风险)
1.  在 Worker 中引入 `Map` 对象缓存模板元数据。
2.  增加 `Cache-Control` 到 24 小时以上，由 VPS 负责主动 Purge。

---

## ✅ 预期结果
*   **KV 写入**：从“每次修改都写”降为“只有换域名/模板才写”，写入寿命延长 10 倍。
*   **系统稳定性**：即使 KV 写入爆了，已生成的页面由于在 R2 且有 CDN 缓存，依然能正常访问。
