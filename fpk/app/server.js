#!/usr/bin/env node
/**
 * Docsify 静态文档服务器（零依赖，仅 Node 内置模块）
 *
 * 由 cmd/main 以环境变量启动：
 *   DOCSIFY_PORT      服务端口（默认 6666，来自应用配置）
 *   DOCSIFY_DOCS_PATH 文档目录（来自应用配置）
 *
 * 特性：
 *  - 静态文件伺服（docsify 是纯前端，hash 路由无需 history 回退）
 *  - 目录穿越防护
 *  - 端口 ≠ 6666 时，若 6666 空闲则额外监听并 302 跳转到实际端口，
 *    保证桌面图标（固定指向 6666）仍然可用；6666 被占用则跳过。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.DOCSIFY_PORT || '6666', 10);
const DOCS_PATH = process.env.DOCSIFY_DOCS_PATH || path.join(__dirname, 'seed-docs');
const ICON_PORT = 6666;

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

/** 解析请求路径 → 磁盘绝对路径；目录穿越/非法路径返回 null */
function safeResolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    return null;
  }
  const resolved = path.normalize(path.join(DOCS_PATH, p));
  if (resolved !== DOCS_PATH && !resolved.startsWith(DOCS_PATH + path.sep)) {
    return null;
  }
  return resolved;
}

function serveFile(fp, res) {
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.md' ? 'no-cache' : 'max-age=3600',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const fp = safeResolve(req.url);
  if (!fp) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(fp, (err, st) => {
    if (!err && st.isDirectory()) {
      serveFile(path.join(fp, 'index.html'), res);
      return;
    }
    serveFile(fp, res);
  });
});

server.on('error', (e) => {
  console.error(`${new Date().toISOString()} [docsify] listen ${PORT} failed: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  log(`serving ${DOCS_PATH} on port ${PORT}`);

  // 桌面图标固定指向 6666：端口不同且 6666 空闲时，额外监听并 302 跳转
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
