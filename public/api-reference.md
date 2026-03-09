# API Reference

本指南详细说明了 RomanceSpace 的 VPS 核心后端 (Node.js/Express) 提供的 REST API 接口。

所有写入操作均不在边缘节点执行，由部署在 VPS 上的后端集中处理。以下接口按功能分为两类：**公共接口 (Public)** 和 **管理接口 (Admin)**。

---

## 基础 URL
如果在本地开发，默认地址可能为 `http://localhost:3000`。
生产环境中，后端部署在独立 VPS 上并绑定了子域名，基地址通常为 `https://api.yourdomain.com`。

---

## 公共接口 (Public Endpoints)

这些接口面向终端用户开放（前端无需传递特殊密钥即可调用）。
> [!TIP] 防滥用建议
> 生产环境中，对于公开渲染或修改数据的接口，强烈建议加入 [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) 验证码。

### 1. `GET /api/template/list`

获取所有可用的模板元数据。

*   **Authentication**: None
*   **Request URL**: `/api/template/list`
*   **Response**: `200 OK`
    ```json
    {
      "templates": [
        {
          "name": "love-letter",
          "version": "v_1741528392131_f8a9",
          "static": false,
          "fields": ["title", "name", "date", "message"],
          "updatedAt": 1741528392131
        }
      ]
    }
    ```

### 2. `POST /api/project/render`

根据用户填写的表单，结合选定的模板，渲染生成最终的个性化页面。如果项目不存在则新建；如果存在则覆盖更新。

*   **Authentication**: None (对于 C 端用户，建议接入 Turnstile 以防请求滥炸)
*   **Request Headers**:
    *   `Content-Type: application/json`
*   **Request Body**:
    ```json
    {
      "subdomain": "sweeties",
      "type": "love-letter",
      "data": {
        "title": "给最爱的宝宝",
        "name": "Jason",
        "date": "2026-03-09",
        "message": "这是我为你亲手制作的礼物"
      }
    }
    ```
*   **Response**: `200 OK`
    `isUpdate` 标志着这是否是对一个已存在域名的修改操作。
    ```json
    {
      "success": true,
      "message": "Project sweeties has been created/updated.",
      "url": "https://sweeties.885201314.xyz",
      "previewUrl": "https://sweeties.885201314.xyz/?preview=1",
      "isUpdate": false
    }
    ```

### 3. `GET /api/template/preview/:name`

生成包含默认值的模板预览页面。主要用于前端画廊的预览挂载。

*   **Authentication**: None
*   **Path Variable**: `name` (模板名称，例如 `love-letter`)
*   **Response**: `200 OK` (返回包含默认参数值的 `text/html`)

---

## 管理接口 (Admin Endpoints)

这些接口涉及内容录入与敏感查询。调用时必须携带环境变量中设定的 `ADMIN_KEY`。

*   **Authentication**: Required Header
    ```http
    X-Admin-Key: <your_secret_admin_key>
    ```

### 1. `POST /api/template/upload`

上传一个新的模板或更新现有模板。以 `multipart/form-data` 格式发送文件。

*   **Authentication**: Required
*   **Content-Type**: `multipart/form-data`
*   **Form Data Fields**:
    *   `templateName` (string, 必需) - 新模板的唯一标识名称（例如：`star-sky`）。
    *   `index.html` (file, 必需) - 模板的核心 HTML 文件（其中使用 `{{field_name}}` 占位符）。
    *   `schema.json` (file, 必需) - 定义前端应向用户展示哪些表单项的配置。
    *   `assets/*` (files, 可选) - 多文件上传。支持所有的图片、CSS、JS 等静态资源。所有相对路径都会被完美保留并存储在 R2 中。
*   **Response**: `200 OK`
    ```json
    {
      "success": true,
      "message": "Template star-sky uploaded successfully.",
      "version": "v_1741530182405_b21c",
      "previewUrl": "https://api.yourdomain.com/api/template/preview/star-sky"
    }
    ```

### 2. `GET /api/project/:subdomain`

检查一个指定用户子域名的原始底层配置数据（此数据由 Cloudflare KV 直接读取而来）。

*   **Authentication**: Required
*   **Path Variable**: `subdomain` (子域名前缀，无点)
*   **Response**: `200 OK`
    ```json
    {
      "type": "love-letter",
      "data": {
        "title": "给最爱的宝宝",
        "name": "Jason",
        ...
      },
      "updatedAt": 1741528621455
    }
    ```
