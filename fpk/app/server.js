#!/usr/bin/env node
/**
 * Docsify 静态文档服务器（零依赖，仅 Node 内置模块）
 *
 * 由 cmd/main 以环境变量启动：
 *   DOCSIFY_PORT              服务端口（默认 8666，来自应用配置）
 *   DOCSIFY_DOCS_PATH         主文档目录（来自应用配置）
 *   DOCSIFY_ADDITIONAL_DOCS   附加文档目录（冒号分隔；如应用共享目录）
 *   DOCSIFY_SEED_DIR          内置模板目录（虚拟补全引擎文件）
 *   DOCSIFY_ACCESSIBLE_PATHS  用户已授权目录（冒号分隔，启动校验用）
 *
 * 多目录：
 *  - 主目录文件在根路径 / 下
 *  - 附加目录（如应用共享目录）文件在 /shared/ 前缀下，侧边栏自动分组展示
 *  - 两边拖 .md 都会自动出现在侧边栏
 *
 * 特性：
 *  - 静态文件伺服（docsify 是纯前端，hash 路由无需 history 回退）
 *  - 目录穿越防护
 *  - 引擎文件虚拟补全：目录里只放 .md 也能跑（index.html/assets/README.md 从模板补全）
 *  - 端口 ≠ 8666 时，若 8666 空闲则额外监听并 302 跳转到实际端口，
 *    保证桌面图标（固定指向 8666）仍然可用；8666 被占用则跳过。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.DOCSIFY_PORT || '8666', 10);
const DOCS_PATH = process.env.DOCSIFY_DOCS_PATH || path.join(__dirname, 'seed-docs');
// 内置模板：应用安装目录 seed-docs（引擎文件虚拟补全的来源，随包升级自动更新）
const SEED_DIR = process.env.DOCSIFY_SEED_DIR || path.join(__dirname, 'seed-docs');
const ICON_PORT = 8666;
// 附加文档目录（如应用共享目录），与主目录物理相同的会被过滤
const SHARED_PREFIX = '/shared/';
const ADDITIONAL = (process.env.DOCSIFY_ADDITIONAL_DOCS || '')
  .split(':').map((p) => p.trim()).filter(Boolean)
  .map((p) => path.resolve(p));
// 附加目录的侧边栏显示名（与 ADDITIONAL 一一对应；缺省用目录 basename）
const ADDITIONAL_LABELS = (process.env.DOCSIFY_ADDITIONAL_LABELS || '')
  .split(':').map((s) => s.trim()).filter(Boolean);
// 主文档目录的侧边栏显示名（缺省「主文档目录」）
const DOCS_LABEL = (process.env.DOCSIFY_DOCS_LABEL || '').trim() || '主文档目录';
// 用户在「应用设置 → 目录授权」中授权的目录（冒号分隔，由 cmd/main 透传）
const ACCESSIBLE_PATHS = (process.env.DOCSIFY_ACCESSIBLE_PATHS || '')
  .split(':').map((p) => p.trim()).filter(Boolean);

function realpathOf(p) {
  try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); }
}
const DOCS_REAL = realpathOf(DOCS_PATH);
const ADDITIONAL_DOCS = ADDITIONAL.filter((p) => realpathOf(p) !== DOCS_REAL);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

function log(msg) {
  console.log(`${new Date().toISOString()} [docsify] ${msg}`);
}

/** 路径是否可读 */
function isReadable(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 文档目录状态（供页面「当前支持的文档目录」角标展示）：
 *  - serving  当前伺服的所有文档目录（主目录 + 附加目录）
 *  - authorized  已授权目录清单（应用设置→目录授权）
 */
function serveStatus(res) {
  const docsResolved = path.resolve(DOCS_PATH);
  const serving = [{ path: docsResolved, readable: isReadable(DOCS_PATH), isDocs: true }];
  ADDITIONAL_DOCS.forEach((p) => {
    serving.push({ path: p, readable: isReadable(p), isDocs: false });
  });

  const seen = new Set();
  const authorized = [];
  ACCESSIBLE_PATHS.forEach((p) => {
    const r = path.resolve(p);
    if (seen.has(r)) return;
    seen.add(r);
    authorized.push({ path: r, readable: isReadable(r), isDocs: r === docsResolved });
  });
  if (!seen.has(docsResolved)) {
    authorized.unshift({ path: docsResolved, readable: isReadable(DOCS_PATH), isDocs: true });
  }

  const body = JSON.stringify({
    port: PORT,
    docsPath: docsResolved,
    docsReadable: isReadable(DOCS_PATH),
    serving,
    authorized,
  });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

/** 启动前校验主文档目录可读；不可读则写日志/系统错误文件并退出（应用状态会显示失败） */
function ensureDocsAccessible() {
  const ok = isReadable(DOCS_PATH);
  if (ok) return;

  const isAuthorized = ACCESSIBLE_PATHS.some((p) => path.resolve(p) === path.resolve(DOCS_PATH));
  const hint = isAuthorized
    ? `目录 ${DOCS_PATH} 已授权但当前不可读（权限异常），请到应用设置重新授权。`
    : `目录 ${DOCS_PATH} 不可访问。请到「应用中心 → 应用 → 设置 → 目录授权」添加该目录后，再在配置中重新选择；或改回应用共享目录。`;
  const msg = `[docsify] 文档目录不可读: ${hint}`;
  console.error(msg);
  try {
    if (process.env.TRIM_TEMP_LOGFILE) {
      fs.writeFileSync(process.env.TRIM_TEMP_LOGFILE, `文档目录不可读: ${hint}`);
    }
  } catch (e) { /* 忽略写日志失败 */ }
  process.exit(1);
}

ensureDocsAccessible();

/**
 * 解析请求路径 → 目标 { fp, root, shared }
 *  - 主目录：/xxx  → DOCS_PATH/xxx
 *  - 附加目录：/shared/xxx → ADDITIONAL_DOCS[0]/xxx
 * 目录穿越/非法路径返回 null
 */
function resolveTarget(urlPath) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    return null;
  }
  if (p === '/shared' || p.startsWith(SHARED_PREFIX)) {
    const root = ADDITIONAL_DOCS[0];
    if (!root) return null;
    const rel = p.slice(SHARED_PREFIX.length);
    const resolved = path.normalize(path.join(root, rel));
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
    return { fp: resolved, root, shared: true };
  }
  const resolved = path.normalize(path.join(DOCS_PATH, p));
  if (resolved !== DOCS_PATH && !resolved.startsWith(DOCS_PATH + path.sep)) {
    return null;
  }
  return { fp: resolved, root: DOCS_PATH, shared: false };
}

/**
 * 发送文件内容（按扩展名定 MIME / 缓存策略）
 */
function sendFile(fp, data, res) {
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' || ext === '.md' ? 'no-cache' : 'max-age=3600',
  });
  res.end(data);
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

/**
 * 内置模板虚拟补全：文档目录只放 .md 也能跑。
 * 缺失以下文件时自动从内置 seed 伺服（不写盘）：
 *  - index.html（docsify 壳，目录入口）
 *  - README.md（欢迎/首页）
 *  - assets/*（docsify 运行时库：js/css 等）
 */
function seedFallback(root, fp) {
  const rel = path.relative(root, fp);
  if (!rel) return null;
  const base = path.basename(rel);
  const allowed = base === 'index.html'
    || base === 'README.md'
    || rel.startsWith('assets' + path.sep);
  if (!allowed) return null;
  const seed = path.resolve(path.join(SEED_DIR, rel));
  const seedResolved = path.resolve(SEED_DIR);
  // 防穿越：补全目标必须落在 SEED_DIR 内
  if (seed === seedResolved || seed.startsWith(seedResolved + path.sep)) {
    return seed;
  }
  return null;
}

/** 伺服文件；文档目录缺失时尝试从内置模板补全 */
function serveFileWithFallback(root, fp, res) {
  fs.readFile(fp, (err, data) => {
    if (!err) {
      sendFile(fp, data, res);
      return;
    }
    const seed = seedFallback(root, fp);
    if (seed) {
      fs.readFile(seed, (err2, data2) => {
        if (!err2) {
          sendFile(seed, data2, res);
          return;
        }
        send404(res);
      });
      return;
    }
    send404(res);
  });
}

/**
 * 自动侧边栏：合并主目录 + 附加目录，返回 _sidebar.md 内容。
 *  - 主目录：磁盘上有 _sidebar.md 则保留用户内容，并自动追加目录中尚未列出的 .md
 *  - 附加目录（如应用共享目录）：作为分组自动追加，链接指向 /shared/xxx.md
 * 这样往任一文档目录拖一个 md，刷新页面侧边栏就会自动出现。
 */
const SIDEBAR_SKIP = new Set(['README.md', '_sidebar.md', '_coverpage.md', '_navbar.md', '_footer.md', '_404.md']);
// 服务器自动写盘的标记：文档目录里的 _sidebar.md 若含此标记，说明是自动生成的快照
// （下次动态生成时忽略它作为底稿，避免累积/重复；用户手写的版本则不受影响）
const SIDEBAR_GEN_MARK = '<!-- generated by docsify-fpk -->';

/** 递归收集目录下所有 .md，返回相对路径（如 sub/deep.md），按名称排序 */
function listMarkdownFiles(root) {
  const out = [];
  (function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    entries.forEach((ent) => {
      const name = ent.name;
      if (name.startsWith('.')) return;
      const relPath = rel ? `${rel}/${name}` : name;
      if (ent.isDirectory()) {
        walk(path.join(dir, name), relPath);
      } else if (name.endsWith('.md') && !SIDEBAR_SKIP.has(name)) {
        out.push(relPath);
      }
    });
  })(root, '');
  return out;
}

/**
 * 合并侧边栏：server 只拼接各文档目录自己的 _sidebar.md（不扫描目录）。
 *  - 主目录 _sidebar.md 的相对链接 → 根路径 /xxx.md
 *  - 附加目录 _sidebar.md 的相对链接 → /shared/xxx.md
 *  - 各目录内容由「目录变更监听」负责保持最新（见 watchDocDir）
 */
function mergedSidebar() {
  const parts = [];
  const pushDir = (root, prefix) => {
    try {
      const sp = path.join(root, '_sidebar.md');
      if (!fs.existsSync(sp)) return;
      const body = fs.readFileSync(sp, 'utf8').replace(SIDEBAR_GEN_MARK, '').trim();
      if (body) parts.push(prefixLinks(body, prefix));
    } catch (e) { /* 单个目录读取失败不影响整体 */ }
  };
  pushDir(DOCS_PATH, '/');
  ADDITIONAL_DOCS.forEach((root) => pushDir(root, SHARED_PREFIX));
  return parts.join('\n\n---\n\n');
}

/** 把 _sidebar.md 里的相对链接加上站点前缀；已是绝对路径/锚点/外部协议的保持不变 */
function prefixLinks(content, prefix) {
  return content.replace(/\]\(([^)]*)\)/g, (m, target) => {
    const t = target.trim();
    if (!t || t.startsWith('/') || t.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(t)) return m;
    return `](${prefix}${t})`;
  });
}

/**
 * 给单个文档目录落盘一份"该目录自己的" _sidebar.md：
 *  - 内容 = 📁 标题 + 该目录下所有 .md（相对链接，搬出去在纯静态 docsify 可直接用）
 *  - 已存在且内容相同 → 不写（避免每次访问都落盘）
 *  - 用户手写（无自动标记）→ 不覆盖
 *  - 写失败（只读目录等）→ 静默
 */
function writeDirSidebar(root, label) {
  const sp = path.join(root, '_sidebar.md');
  let prev = null;
  try {
    if (fs.existsSync(sp)) {
      const existing = fs.readFileSync(sp, 'utf8');
      if (!existing.includes(SIDEBAR_GEN_MARK)) return; // 用户手写，不覆盖
      prev = existing;
    }
  } catch (e) { return; }

  const files = listMarkdownFiles(root);
  const items = files.map((f) => {
    const title = f.replace(/\.md$/, '');
    const link = f.split('/').map(encodeURIComponent).join('/');
    return `  - [${title}](${link})`;
  }).join('\n');
  // 分组标题用纯文字 + 标题后空行（docsify 5 官方分组写法）：
  // docsify 5 会把 `- 标题\n\n  - 子项` 渲染成 .group-title（<p>），
  // 从而应用 sidebar-group-underline/box 样式（index.html 的 body class 触发）
  const body = items ? `- ${label}\n\n${items}\n` : '';
  const next = `${SIDEBAR_GEN_MARK}\n${body}`;
  if (prev === next) return; // 内容没变，不写盘

  try {
    fs.writeFileSync(sp, next);
  } catch (e) { /* 忽略写盘失败 */ }
}

/**
 * 目录变更监听：目录里增删 .md（或 _sidebar.md 被用户改）时，防抖后重新生成该目录的 _sidebar.md。
 *  - fs.watch（inotify）递归监听目录树，500ms 防抖合并连续事件
 *  - 60s 兜底轮询：inotify 对网络挂载/深层变更可能漏事件，定期强制检查（内容没变不会写盘）
 *  - 生成端与写盘端的循环由「内容相同不写」天然收敛
 * 返回停止函数
 */
function watchDocDir(root, label) {
  const watchers = new Map(); // dir → fs.FSWatcher
  let timer = null;

  const regenerate = () => {
    clearTimeout(timer);
    timer = setTimeout(() => writeDirSidebar(root, label), 500);
  };

  // 重建监听树：遍历 root 下所有子目录，关闭消失的 watcher，为新目录建 watcher
  function rescan() {
    const dirs = [];
    (function walk(d) {
      dirs.push(d);
      try {
        fs.readdirSync(d, { withFileTypes: true }).forEach((ent) => {
          if (ent.isDirectory() && !ent.name.startsWith('.')) walk(path.join(d, ent.name));
        });
      } catch (e) { /* 目录不可读（未授权等）时跳过 */ }
    })(root);

    const live = new Set(dirs);
    for (const [d, w] of watchers) {
      if (!live.has(d)) {
        try { w.close(); } catch (e) { /* 忽略 */ }
        watchers.delete(d);
      }
    }
    for (const d of dirs) {
      if (!watchers.has(d)) {
        try {
          watchers.set(d, fs.watch(d, { persistent: false }, regenerate));
        } catch (e) { /* 单目录监听失败忽略 */ }
      }
    }
  }

  rescan();
  regenerate(); // 启动时先生成一次（目录不可读时 writeDirSidebar 静默跳过）

  const interval = setInterval(() => {
    rescan();
    regenerate();
  }, 60 * 1000);

  return () => {
    clearInterval(interval);
    clearTimeout(timer);
    for (const w of watchers.values()) {
      try { w.close(); } catch (e) { /* 忽略 */ }
    }
    watchers.clear();
  };
}

const server = http.createServer((req, res) => {
  // 状态接口：先于文件解析处理（它不是文档目录里的真实文件）
  const rawUrl = String(req.url || '/').split('?')[0].split('#')[0];
  if (rawUrl === '/__docsify__/status.json') {
    serveStatus(res);
    return;
  }
  const target = resolveTarget(req.url);
  if (!target) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  // 侧边栏：合并各文档目录自己的 _sidebar.md（各目录内容由目录监听保持最新）
  if (path.basename(target.fp) === '_sidebar.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(mergedSidebar());
    return;
  }
  fs.stat(target.fp, (err, st) => {
    if (!err && st.isDirectory()) {
      // 目录：优先伺服目录内 index.html；没有则用内置模板（目录只需放 .md）
      const idx = path.join(target.fp, 'index.html');
      fs.stat(idx, (err2) => {
        if (err2) {
          serveFileWithFallback(target.root, path.join(SEED_DIR, 'index.html'), res);
        } else {
          serveFileWithFallback(target.root, idx, res);
        }
      });
      return;
    }
    serveFileWithFallback(target.root, target.fp, res);
  });
});

server.on('error', (e) => {
  console.error(`${new Date().toISOString()} [docsify] listen ${PORT} failed: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const roots = [DOCS_PATH].concat(ADDITIONAL_DOCS).join(', ');
  log(`serving [${roots}] on port ${PORT}`);

  // 每个文档目录独立监听：目录变更时才重新生成该目录自己的 _sidebar.md
  const stopWatching = watchDocDir(DOCS_PATH, DOCS_LABEL);
  ADDITIONAL_DOCS.forEach((root, i) => {
    watchDocDir(root, ADDITIONAL_LABELS[i] || path.basename(root));
  });
  process.on('exit', () => stopWatching());
  process.on('SIGTERM', () => { stopWatching(); process.exit(0); });

  // 桌面图标固定指向 8666：端口不同且 8666 空闲时，额外监听并 302 跳转
  if (PORT !== ICON_PORT) {
    const redirect = http.createServer((req, res) => {
      const host = (req.headers.host || 'localhost').split(':')[0];
      res.writeHead(302, { Location: `http://${host}:${PORT}${req.url || '/'}` });
      res.end();
    });
    redirect.on('error', (e) => {
      log(`port ${ICON_PORT} unavailable (${e.code}), icon redirect disabled`);
    });
    redirect.listen(ICON_PORT, '0.0.0.0', () => {
      log(`redirect ${ICON_PORT} -> ${PORT} (desktop icon support)`);
    });
  }
});
