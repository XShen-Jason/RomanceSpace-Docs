# RomanceSpace 全栈 VPS 部署指南（终极新手版）

本指南从零开始，教你在同一台 VPS 上部署和托管 **RomanceSpace** 的后端（Node.js）和前端（React），并实现最高性能的“Nginx 动静分离”和“相对路径 0 延迟调用”。

---

## 阶段一：环境准备
如果你的 VPS 是一台纯净的 Ubuntu 系统，你需要先安装三个核心软件：Node.js, PM2, Nginx。

```bash
# 1. 更新系统并安装 Nginx 和 Git
sudo apt update
sudo apt install -y nginx git curl certbot python3-certbot-nginx

# 2. 安装 Node.js (推荐 20.x 长期支持版)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. 安装 PM2 (管理后端进程的神器)
sudo npm install -g pm2
```

---

## 阶段二：部署后端 (Node.js API)

我们要把后端代码放在 `/opt/RomanceSpace-Backend`。

### 1. 克隆代码与安装依赖
```bash
cd /opt
sudo git clone https://github.com/XShen-Jason/RomanceSpace-Backend.git
cd RomanceSpace-Backend

# 安装后端依赖
sudo npm install
```

### 2. 配置环境变量
如果你还没有配置环境变量，需要去 `.env` 里填入密钥。
```bash
nano .env

# 在文件里填入以下必需项：
# PORT=3000
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY= (注意：后端必须使用 Service Role Key 以跳过 RLS 检查用户资产)
# CF_ACCOUNT_ID=...
# CF_API_TOKEN=...
# CF_KV_NAMESPACE_ID=...
# CF_R2_BUCKET=...
# (等等)
```

### 3. 启动并守护后端进程
```bash
# 启动应用，命名为 romancespace-api
pm2 start src/app.js --name "romancespace-api"

# 设置开机自启
pm2 save
pm2 startup
```
此时，运行 `pm2 list` 应该能看到 `romancespace-api` 是 **online** 状态。后端已在 `:3000` 端口监听。

---

## 阶段三：部署前端 (React)

我们要让前端和后端放在同一个 `/opt` 目录下做邻居，并且**完全不需要配置 API 域名**，因为我们要通过 Nginx 实现纯物理局域网转发。

### 1. 克隆代码与安装依赖
```bash
cd /opt
sudo git clone https://github.com/XShen-Jason/RomanceSpace-Frontend.git
cd RomanceSpace-Frontend

# 安装前端依赖
sudo npm install
```

### 2. 配置环境变量 (关键：Auth 登录必备)
由于前端集成了 Supabase Auth，构建时必须注入公共 Key。
```bash
nano .env

# 在文件里填入以下内容：
# VITE_SUPABASE_URL=https://djcfqtrbfjaykdyperpf.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY2ZxdHJiZmpheWtkeXBlcnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTUwNDgsImV4cCI6MjA4ODM3MTA0OH0.vDOsEsVjZI_M6HRG_6kc4qhR4Wed90UcHBJV-6Bec0o
```

### 3. 构建静态资源
```bash
sudo npm run build
```
打包成功后，静态文件会安静地躺在 `/opt/RomanceSpace-Frontend/dist` 里。

---

## 阶段四：Nginx 终极网关配置（最关键的一步）

现在你的机器上有：
1. 跑在 3000 端口的后端 API
2. 放在 `dist/` 里的前端静态网页文件

我们要配置 Nginx 统管大局，做到：
- 收发 `www.885201314.xyz` 流量：发网页。
- 收发 `www.885201314.xyz/api/...` 请求：转发给 3000 端口（这解决了跨域，而且省去 DNS 查 IP 的时间）。
- 收发 `api.885201314.xyz` 流量：转发给 3000 端口（为了兼容旧调用，或者其他直接走 API 的脚本）。

```bash
sudo nano /etc/nginx/conf.d/romancespace.conf
```
把里面内容**全部删除**，严格粘贴以下内容：

```nginx
# 1. 前端主站与 API 同域转发网关
server {
    listen 80;
    server_name 885201314.xyz www.885201314.xyz;

    # 静态文件响应 (神速)
    location / {
        root /opt/RomanceSpace-Frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 巧妙内网转发前端来的相对 API 路径
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # 预留 /preview/ 路径直连后端渲染引擎 (解决预览空白问题)
    location /preview/ {
        proxy_pass         http://127.0.0.1:3000/api/template/preview/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
    
    # 模板静态资产（CSS/JS/图片）由后端从 R2 读取并服务
    # 关键：必须使用 ^~ 修饰符，防止请求被下方的 ~* 正则块截获
    location ^~ /assets/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
    
    # 静态资源长期硬缓存（前端 React bundle JS/CSS）
    location ~* \.(js|css|png|jpg|svg|woff2)$ {
        root /opt/RomanceSpace-Frontend/dist;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# 2. 独立 API 域名转发 (兼容层)
server {
    listen 80;
    server_name api.885201314.xyz;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

保存退出后，执行以下命令使之生效，并挂上小绿锁 (HTTPS)：
```bash
# 测试语法是不是 OK
sudo nginx -t

# 重新加载
sudo systemctl reload nginx

# 获取正式 HTTPS 证书
sudo certbot --nginx -d 885201314.xyz -d www.885201314.xyz -d api.885201314.xyz
```
*(如果提示让你选择，选 `1: Attempt to reinstall this existing certificate`)*

---

## 阶段五：Cloudflare DNS 收尾

在 Cloudflare 面板 -> DNS 设置里：
- `A` 记录：`www` 指向 `你的VPS_IP` （**必须灰色云朵，DNS Only**）
- `A` 记录：`@` (885201314.xyz) 指向 `你的VPS_IP` （**必须灰色云朵，DNS Only**）
- `A` 记录：`api` 指向 `你的VPS_IP` （**必须灰色云朵，DNS Only**）

---

## 阶段六：日后更新代码的极简指南

以后当你在本地电脑写完代码提交并 Push 到 GitHub 后，在 VPS 上怎么更新？

### 💡 更新后端：
```bash
cd /opt/RomanceSpace-Backend
git pull origin main
npm install
pm2 restart romancespace-api
```

### 💡 更新前端：
```bash
cd /opt/RomanceSpace-Frontend
git pull origin main
npm install
npm run build
# 结束！Nginx 会自动去读最新的 dist 里的文件，什么都不用重启！
```
