# Docsify 文档站 (docsify-fpk)

基于 [docsify](https://docsify.js.org/) 的轻量静态文档站，打包为飞牛 fnOS 原生应用（FPK）。
文档就是 md 文件，丢进文档目录即发布；支持 docsify 全部主题 / 插件 / 配置能力。

## 特性

- **飞牛应用中心安装**，开机自启，应用中心统一管理
  - 桌面双图标：「Docsify 文档站」在飞牛系统内打开（iframe），「Docsify 文档站（新标签页）」用浏览器新标签页打开
- **文档目录可配置**：安装向导填写，装完可在应用中心「配置」随时修改
  - 留空 → 应用共享目录（`shares/docs`，飞牛文件管理器可见，权限无忧）
  - 填路径 → 伺服你指定的目录（如 `/vol1/1000/docs`；需保证应用账号可读）
- **端口可配置**：默认 8666，安装/配置时随意改
  - 改了端口，桌面图标仍指向 8666：8666 空闲时自动 302 跳转到新端口（图标依旧可用）；
    8666 被占用时请用浏览器访问 `http://NAS:新端口`
- **升级不丢数据**：应用升级只替换程序文件，文档目录与端口配置全部保留
- **docsify 全能力**：主题（vue/buble/dark/pure/dolphin）、搜索、封面、导航栏、emoji、
  代码复制、翻页、图片缩放……全部通过文档目录里的 `index.html` 配置，改完刷新即生效

## 项目结构

```
├── docs/                        # 源文档（安装时作为初始文档种入文档目录）
│   ├── index.html               # docsify 配置全在这（主题/插件/$docsify）
│   ├── _sidebar.md              # 侧边栏
│   ├── README.md
│   └── assets/                  # docsify 库 + 主题 + 插件
├── fpk/                         # FPK 应用包
│   ├── manifest                 # 应用元信息
│   ├── cmd/                     # 生命周期脚本（启停/安装/配置回调）
│   ├── config/                  # 权限 + 共享目录声明
│   ├── wizard/                  # 安装/配置向导（端口 + 文档目录）
│   ├── app/
│   │   ├── server.js            # node 静态服务器（零依赖）
│   │   ├── seed-docs/           # 打包时由 docs/ 生成
│   │   └── ui/                  # 桌面图标
│   ├── ICON*.PNG
│   └── build-fpk.sh             # 打包脚本（本地/CI 共用）
└── .github/workflows/build-fpk.yml  # CI：tag v* 自动打包发 Release
```

## 构建 / 发布

### 本地打包

```bash
./fpk/build-fpk.sh               # 产物: fpk/dist/docsify-fpk-1.0.0.fpk
VERSION=1.1.0 ./fpk/build-fpk.sh # 指定版本
```

前置：`fnpack 1.2.0`（本机 `/usr/local/bin/fnpack`）。

### GitHub Actions 自动打包

- 推 `main` → 自动打包，产物见 Actions artifact
- 打 tag `v1.0.0` → 自动打包并发 GitHub Release（应用中心直接下载安装）

## 使用

1. 在飞牛应用中心安装 `docsify-fpk-*.fpk`（自动安装依赖 nodejs_v24）
2. 安装向导：填端口（默认 8666）、文档目录（留空用共享目录）
3. 桌面出现「Docsify 文档站」图标，点开即用；或浏览器访问 `http://NAS:8666`
4. 更新文档：往文档目录丢 md 文件即可，刷新浏览器立即生效
5. 改端口/目录：应用中心 → 应用 → 配置，保存后自动重启

## 维护 / 升级

- 改文档内容：编辑 `docs/` 下文件 → 推 main（或直接改文档目录，本地即时生效）
- 升 docsify 版本 / 调整应用：改 `docs/index.html` 或应用代码 → 打 tag → CI 发新 Release → 应用中心一键升级，文档与配置不丢

## 许可

MIT
