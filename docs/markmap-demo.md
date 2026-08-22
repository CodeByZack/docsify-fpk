# markmap 脑图演示

> 本页演示 docsify-fpk 内置的 markmap 脑图渲染（全本地化，无 CDN 依赖）。

## 基本用法（推荐）

直接写裸 `<script type="text/template">` 块，里面放普通 markdown 层级。
**这种写法内容里可以随便用空行**：

<script type="text/template" data-height="420">
# docsify-fpk

## 引擎
- docsify v5
- 全文搜索
- 亮暗主题

## 渲染扩展

### markmap 脑图

- 本页 ✅
- markdown 直接变导图

### 代码高亮
- Prism

## 部署形态
- fnOS FPK 应用
- 纯静态 + node 内置模块
- 文档目录丢 .md 即发布
</script>

## 带 frontmatter 配置

`<script>` 开头可以放 YAML frontmatter，控制展开层级、颜色冻结等：

<script type="text/template" data-height="360">
---
markmap:
  initialExpandLevel: -1
  colorFreezeLevel: 2
---

## 项目 A
- 需求
- 开发
- 测试

## 项目 B
- 调研中

## 项目 C
</script>

## 说明

- **写法**：推荐裸 `<script type="text/template">`（markdown 原样保留、空行安全）；
  也支持外层包 `<div class="markmap">`，但该写法模板内**不能有空行**（markdown-it 的
  HTML 块遇到空行会截断）
- 高度：默认 320px，可用 `data-height="480"`（px）覆盖，写在 script 或外层 div 上均可
- 配置：支持 markmap 的 frontmatter 参数（`initialExpandLevel`、`colorFreezeLevel`、
  `maxWidth` 等）
- 渲染失败时会在原位置显示错误提示，不影响页面其他内容
