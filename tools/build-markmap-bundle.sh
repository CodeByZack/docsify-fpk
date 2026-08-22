#!/bin/bash
# 重新生成 docs/assets/markmap.bundle.min.js（markmap 本地化 bundle）
#
# 产物暴露 window.markmapDocsify = { Transformer, Markmap, deriveOptions }，
# 由 docs/assets/docsify-markmap.js 消费。当前 bundle 由以下版本构建：
#   markmap-lib@0.18.12 + markmap-view@0.18.12 + d3@7.9.0 (esbuild@0.28.2)
#
# 用法：./tools/build-markmap-bundle.sh   （需要网络 + node/npm）
set -euo pipefail

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
OUT="${REPO_ROOT}/docs/assets/markmap.bundle.min.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "${TMP}/entry.js" <<'EOF'
import { Transformer } from 'markmap-lib';
import { Markmap, deriveOptions } from 'markmap-view';

const g = window.markmapDocsify || (window.markmapDocsify = {});
g.Transformer = Transformer;
g.Markmap = Markmap;
g.deriveOptions = deriveOptions;
EOF

cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund \
  markmap-lib@0.18.12 markmap-view@0.18.12 d3@7.9.0 esbuild@0.28.2
npx esbuild entry.js --bundle --format=iife --minify --target=es2018 \
  --outfile=markmap.bundle.min.js

mkdir -p "$(dirname "$OUT")"
cp markmap.bundle.min.js "$OUT"
chmod 644 "$OUT"
echo "==> 已生成 $(du -h "$OUT" | cut -f1)  ${OUT}"
