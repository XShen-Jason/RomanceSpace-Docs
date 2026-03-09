# API 接口集成文档

本文档详细定义了当前 RomanceSpace Node.js **后端 (VPS)** 暴露给外部通信的 RESTful API。所有的网络请求基准地址 (Base URL) 默认为你的线上 VPS 代理地址：`https://api.885201314.xyz`。

> ⚠️ 所有改变平台系统状态的特权管理接口，目前一律需要在请求头(Headers)附带管理员明文密钥 `X-Admin-Key` 鉴权。

---

## 🚀 公开服务接口 (Public API — 面向系统使用者)

无需 `X-Admin-Key` 凭证验证，通常由部署在 Pages 的 SPA 前端项目（`www`）向公网暴露并代理调用。

### 1. 列表获取 — 获取系统中所有可配置模板
* **Endpoint:** `GET /api/template/list`
* **功能:** 从 KV 拉取全量注册生效的静态模板清单字典，供创建画廊展示。
* **Header / 鉴权:** None
* **返回成功 (200 OK):**
  ```json
  {
    "success": true,
    "templates": [
      {
        "name": "letter-love",
        "description": "复古信纸风格爱情模板",
        "version": "v3k",
        "static": false,
        "fields": ["title", "name", "content"]
      }
    ]
  }
  ```

### 2. 即时生成项目 — (核心业务 C 端接口)
* **Endpoint:** `POST /api/project/render`
* **功能:** 根据客户端传来的 JSON 对象，后端模板引擎根据 `{{}}` 语法合并模板中的占位符，写回 R2 生成静态物理 HTML 页面。
* **应用场景限制:** 目前接口不设防。未来业务壮大后，防滥刷需引入 Cloudflare Turnstile 等防 Bot 拦截工具，但禁止使用重度登录逻辑阻碍第一波用户的引流病毒式体验。
* **请求体 (Content-Type: application/json):**
  ```json
  {
      "subdomain": "loveyou10000",
      "type": "letter-love",
      "data": {
          "title": "遇见你真好",
          "name": "李雷",
          "content": "你是我这一世最浪漫的心动"
      }
  }
  ```
* **返回成功 (200 OK):**
  ```json
  {
      "success": true, 
      "url": "https://loveyou10000.885201314.xyz",
      "previewUrl": "https://loveyou10000.885201314.xyz?preview=true",
      "isUpdate": false
  }
  ```

### 3. 热预览 — 查看原生模板的 Demo 结构
* **Endpoint:** `GET /api/template/preview/:name`
* **功能:** 不需传递业务信息，VPS 后端从 R2 下载对应模板的 `schema.json` 规则树，强行注入默认字典 (`default: xxx`) 并渲染成网页回传给调用方。
* **使用范例:** 浏览器直接访问 `https://api.885201314.xyz/api/template/preview/letter-love`，可直接看到拥有预配 Demo 数据的模板展现。 

---

## 🔒 独立鉴权接口 (Admin API — 原创者控制面)

所有此类敏感接口调用方必须附加 Header: `X-Admin-Key: <ADMIN_KEY_VALUE>`。

### 1. 模板分发与上线 (`/api/template/upload`)
* **Endpoint:** `POST /api/template/upload`
* **Content-Type:** `multipart/form-data`
* **功能概览:** 将全新的 HTML 以及相关的 `.css / .js` 模板材料封装抛入后端，后端将以唯一时间戳/哈希将其作为新版打入 R2 桶。同时会解构随行上传的 `schema.json` 文件注册入网桥 KV。若遇到 KV 中存在老业务版，新上传会被视为 "迭代版本升级"。
* **提交主体 (Form-Data 键值映射):**
  * `templateName` (Text): 【必选】定义的模板全局引用名字，例 `snow-falling`
  * `index.html` (File): 【必选】入口 HTML 源码主控端文件
  * `schema.json` (File): 【可选】定义此模板支持何等数据插槽以及展现信息的元数据定义书
  * `assets/[任意内部路径文件]` (File): 【可选】随 HTML 工程一同存在的配套切图/CSS，后端程序支持递归解压存放到 R2

### 2. 探针 — 单体项目 KV 查询 (`/api/project/:subdomain`)
* **Endpoint:** `GET /api/project/:subdomain`
* **功能:** 对于运维调试查障非常重要，此接口会强查对应子域名背后的底层 KV 模型绑定。可以诊断这个站点是不是路由错了或者没绑定上正确类型。
* **返回范本:**
  ```json
  {
      "success": true,
      "subdomain": "jason",
      "config": {
          "type": "romantic-firework",
          "data": { "to": "Amy", "music": "on" },
          "timestamp": "2026-03-09T08:12:00Z"
      }
  }
  ```
