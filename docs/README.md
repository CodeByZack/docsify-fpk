# 📚 Docsify 文档站

基于 [docsify](https://docsify.js.org/) 的轻量静态文档站，打包为飞牛 fnOS 原生应用（FPK）。

文档就是 Markdown 文件——丢进文档目录即发布，刷新浏览器立即生效。

## 快速开始

1. 在飞牛应用中心安装本应用
2. 安装向导中指定文档目录（留空使用应用共享目录）
3. 点开桌面图标，或浏览器访问 `http://NAS:端口`
4. 往文档目录放 `.md` 文件即可发布

## 目录结构

- `index.html` — docsify 配置（主题、插件、搜索等）
- `_sidebar.md` — 侧边栏导航
- `README.md` — 首页
- `assets/` — docsify 核心库与主题（本地化，不依赖外网）

## 功能特性

- 支持 docsify 全部主题：vue / buble / dark / pure / dolphin
- 全文搜索、封面、导航栏、emoji、代码复制、图片缩放等插件开箱即用
- 纯静态伺服，零依赖、低内存，适合 NAS 长期运行
