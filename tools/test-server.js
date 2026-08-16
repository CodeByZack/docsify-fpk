#!/usr/bin/env node
/**
 * server.js 本地集成测试（回归用）
 * 用法：node tools/test-server.js [docs路径] [端口]
 * 说明：spawn 一个 server.js 子进程，验证主页/md/404/目录穿越/8666跳转后自动清理。
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

/** http.get 包装（node fetch 对 302 manual 处理不可靠，统一用 http.get） */
function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      })
      .on('error', reject);
  });
}

const appDir = path.join(__dirname, '..', 'fpk', 'app');
const docsPath = process.argv[2] || path.join(__dirname, '..', 'docs');
const port = parseInt(process.argv[3] || '18080', 10);
const iconPort = 8666;

const child = spawn(process.execPath, ['server.js'], {
  cwd: appDir,
  env: { ...process.env, DOCSIFY_PORT: String(port), DOCSIFY_DOCS_PATH: docsPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => console.log('[server]', d.toString().trim()));
child.stderr.on('data', (d) => console.log('[server:err]', d.toString().trim()));

let failed = 0;
function check(name, ok, extra = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`);
}

async function main() {
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const home = await httpGet(port, '/');
    check('主页 200', home.status === 200);

    const md = await httpGet(port, '/README.md');
    check('md 200 + text/markdown', md.status === 200 && (md.headers['content-type'] || '').includes('markdown'));

    const nf = await httpGet(port, '/nope.md');
    check('不存在文件 404', nf.status === 404);

    const traversal = await httpGet(port, '/../../etc/passwd');
    check('目录穿越被拒', traversal.status === 403 || traversal.status === 404);

    const redir = await httpGet(iconPort, '/');
    const loc = redir.headers.location || '';
    check('8666 302 跳转', redir.status === 302 && loc.includes(`:${port}`), loc);
  } catch (e) {
    check('请求异常: ' + e.message, false);
  } finally {
    child.kill();
    process.exit(failed ? 1 : 0);
  }
}

main();
