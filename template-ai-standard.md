# 浪漫空间 (RomanceSpace) 网页模板开发规范 (AI 专用版)

本规范定义了为“浪漫空间”平台开发新模板的标准流程与技术要求。请严格遵守以下规则，确保模板能够被系统正确解析、自适应多端设备，并提供完美的视觉体验。

---

## 1. 核心原则：自适应与极简
- **全屏响应式**：模板必须完美适配 **移动端（竖屏）** 和 **电脑端（横屏）**。建议使用 `100vw` / `100vh` 布局，确保内容水平垂直居中或按比例缩放。
- **无构建工具**：直接编写原始的 `index.html`、`style.css`、`script.js`。严禁使用打包工具（Webpack/Vite等），后端需要直接解析原始文本。
- **单文件优先**：如果 CSS/JS 较少，建议直接内联在 HTML 中，减少请求，提升极速预览体验。

---

## 2. 目录结构
每个模板必须存放于独立文件夹中，包含以下核心文件：
```text
template_folder_name/
├── index.html   (必填) 网页内容主体
├── config.json  (必填) 字段定义说明书
└── assets/      (可选) 存图片、音乐等素材
```

---

## 3. 配置文件规范 (`config.json`)
这是模板的“大脑”，定义了用户可以修改哪些内容。

```json
{
  "name": "模板英文ID",
  "version": "1.0.0",
  "static": false,
  "fields": [
    {
      "id": "title",
      "label": "网页标题",
      "placeholder": "展示在浏览器标签上的文字",
      "default": "致我最爱的人",
      "type": "text"
    },
    {
      "id": "paragraphs",
      "label": "浪漫留言",
      "placeholder": "输入你想对TA说的话...",
      "default": "在这个特别的日子里，我想对你说...",
      "type": "textarea"
    }
  ]
}
```

---

## 4. 变量注入语法
在 `index.html` 中，使用双大括号语法 `{{ id }}` 标记需要动态替换的位置。

```html
<title>{{ title }}</title>
<div class="message">
    {{ paragraphs }}
</div>
```

---

## 5. 样式与视觉要求 (AI 重点关注)
- **Viewport 设置**：必须包含 `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`。
- **背景适配**：背景图建议使用 `background-size: cover; background-position: center;`。
- **动效库**：推荐使用内联 CSS Keyframes 或轻量级库（如 Animate.css 内容），确保动画流畅且无需大量外部依赖。

---

## 6. 一键复制指南 (给其他 AI 的 Prompt)

如果你正在作为开发助理生成模板，请直接复制下方的指令：

> **[复制指令]**
> 请为“浪漫空间” (RomanceSpace) 平台生成一套完整的网页模板代码：
> 1. 生成一个 `index.html`，必须是响应式设计 (Mobile-First)，适配手机与电脑。
> 2. 使用双大括号 `{{ variable_id }}` 注入动态内容。
> 3. 配套生成一个 `config.json`，遵循 schema：`{"name": "模板ID", "fields": [{"id": "...", "label": "...", "default": "...", "type": "text|textarea"}]}`。
> 4. 设计风格：要求极度美满、浪漫、Premium感。使用毛玻璃特效（Glassmorphism）、平滑渐变和细腻的 CSS 动画。
> 5. 兼容性：严禁使用外部 JS 框架，允许使用原生 JavaScript。

---

## 7. 发布流程
- 将文件夹推送到 `RomanceSpace-Templates` 仓库。
- 或通过 `/admin/upload` 后端入口直接上传文件夹内容。
