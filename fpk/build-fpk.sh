#!/bin/bash
# Docsify 文档站 — fnOS fpk 一键打包脚本（本地 / CI 共用）
#
# 用法：
#   ./fpk/build-fpk.sh               # 打包，ARCH 默认按 uname 探测，版本默认 1.0.0
#   VERSION=1.1.0 ./fpk/build-fpk.sh # 指定版本号
#   ARCH=arm ./fpk/build-fpk.sh      # 指定架构（arm|x86）
#   FNPACK_BIN=/path/to/fnpack ./fpk/build-fpk.sh
#
# 产物：
#   fpk/dist/docsify-fpk-<VERSION>-<ARCH>.fpk
#
# 前置条件：
#   - fnpack 1.2.0（/usr/local/bin/fnpack；CI 从 static2.fnnas.com 下载并校验 sha256）
#   - 源文档在项目 docs/ 目录（打包时复制为 app/seed-docs，安装时种入文档目录）
#
# 注意：
#   - 官方 fnpack 的 manifest platform 仅支持 x86|arm|loongarch|risc-v（无 all），
#     本应用纯静态 + node 内置模块，无原生依赖、无符号链接，arm/x86 各打一份即可。
#   - 官方 fnpack（1.2.0/1.2.1 均如此）会把符号链接改写为指向自身的死链，导致 fnOS
#     安装器报 10234 装不上；本项目无符号链接，若未来引入符号链接请先消除再打包。
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
FPK_DIR="${SCRIPT_DIR}"
DIST_DIR="${FPK_DIR}/dist"

# ---- 0. 架构：ARCH 环境变量 > uname 探测（arm | x86）----
if [ -z "${ARCH:-}" ]; then
    case "$(uname -m)" in
        x86_64|amd64) ARCH=x86 ;;
        aarch64|arm64) ARCH=arm ;;
        *) echo "无法识别的构建架构: $(uname -m)（请显式设置 ARCH=arm 或 ARCH=x86）" >&2; exit 1 ;;
    esac
fi
case "${ARCH}" in
    arm|x86) ;;
    *) echo "ARCH 必须是 arm 或 x86，收到: ${ARCH}" >&2; exit 1 ;;
esac
echo "==> fpk arch: ${ARCH}"

# ---- 0.5 版本号：VERSION 环境变量 > 默认 1.0.0 ----
VERSION="${VERSION:-1.0.0}"
echo "==> fpk version: ${VERSION}"

# ---- 0.6 fnpack：FNPACK_BIN 环境变量 > PATH ----
FNPACK_BIN="${FNPACK_BIN:-fnpack}"
command -v "${FNPACK_BIN}" >/dev/null 2>&1 || { echo "fnpack 不存在: ${FNPACK_BIN}" >&2; exit 1; }
echo "==> fnpack: ${FNPACK_BIN}"

# ---- 1. 填充 app/seed-docs（项目 docs/ → seed）----
echo "==> [1/4] 填充 app/seed-docs ..."
rm -rf "${FPK_DIR}/app/seed-docs"
mkdir -p "${FPK_DIR}/app/seed-docs"
if [ ! -d "${REPO_ROOT}/docs" ]; then
    echo "缺少源文档目录: ${REPO_ROOT}/docs" >&2
    exit 1
fi
cp -a "${REPO_ROOT}/docs/." "${FPK_DIR}/app/seed-docs/"
echo "    seed-docs 大小: $(du -sh "${FPK_DIR}/app/seed-docs" | cut -f1)"

# ---- 2. 写入版本号/platform + 确保脚本可执行 ----
echo "==> [2/4] 写入版本号/platform + 脚本执行位 ..."
sed -i.bak "s/^version[[:space:]]*=.*/version                    = ${VERSION}/" "${FPK_DIR}/manifest"
sed -i.bak "s/^platform[[:space:]]*=.*/platform                   = ${ARCH}/" "${FPK_DIR}/manifest"
rm -f "${FPK_DIR}/manifest.bak"
chmod +x "${FPK_DIR}"/cmd/* "${FPK_DIR}"/wizard/*

# 防御：app/ 下不应有符号链接（fnpack 会改写成死链）
EXTRA_LINKS="$(find "${FPK_DIR}/app" -type l 2>/dev/null | head -5 || true)"
if [ -n "${EXTRA_LINKS}" ]; then
    echo "    ⚠️ 警告：app/ 下存在符号链接（fnpack 会改写成死链）："
    echo "${EXTRA_LINKS}" | sed "s#${FPK_DIR}/app/##" | sed 's/^/        /'
fi

# ---- 3. fnpack 打包 ----
echo "==> [3/4] fnpack build ..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

cd "${FPK_DIR}"
# fnpack 输出名固定为 manifest 的 appname（docsify-fpk.fpk）
"${FNPACK_BIN}" build -d .
mv docsify-fpk.fpk "${DIST_DIR}/docsify-fpk-${VERSION}-${ARCH}.fpk"

echo
echo "======================================================"
echo " fpk 产物: ${DIST_DIR}/docsify-fpk-${VERSION}-${ARCH}.fpk"
ls -lh "${DIST_DIR}/docsify-fpk-${VERSION}-${ARCH}.fpk"
echo "======================================================"
