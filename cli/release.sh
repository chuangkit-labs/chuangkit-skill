#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PACKAGE_JSON="$SCRIPT_DIR/package.json"
CONNECTOR_JSON="$REPO_ROOT/workbuddy/chuangkit-cli-connector/cli.json"
REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 npm。" >&2
  exit 1
fi

if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo "错误：找不到 $PACKAGE_JSON。" >&2
  exit 1
fi

if [[ ! -f "$CONNECTOR_JSON" ]]; then
  echo "错误：找不到 $CONNECTOR_JSON。" >&2
  exit 1
fi

cd "$SCRIPT_DIR"

PACKAGE_NAME="$(node -p "require('./package.json').name")"
if [[ "$PACKAGE_NAME" != "@chuangkit-labs/agent-cli" ]]; then
  echo "错误：package.json 中的包名是 $PACKAGE_NAME，不是 @chuangkit-labs/agent-cli。" >&2
  exit 1
fi

echo "检查 npm 登录状态：$REGISTRY"
npm whoami --registry="$REGISTRY" >/dev/null

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/chuangkit-agent-release.XXXXXX")"
RELEASE_SUCCEEDED=0
HAD_LOCKFILE=0

cp "$PACKAGE_JSON" "$TEMP_DIR/package.json"
cp "$CONNECTOR_JSON" "$TEMP_DIR/cli.json"

if [[ -f "$SCRIPT_DIR/package-lock.json" ]]; then
  HAD_LOCKFILE=1
  cp "$SCRIPT_DIR/package-lock.json" "$TEMP_DIR/package-lock.json"
fi

restore_on_failure() {
  local exit_code=$?

  if [[ "$RELEASE_SUCCEEDED" -eq 0 ]]; then
    cp "$TEMP_DIR/package.json" "$PACKAGE_JSON"
    cp "$TEMP_DIR/cli.json" "$CONNECTOR_JSON"
    if [[ "$HAD_LOCKFILE" -eq 1 ]]; then
      cp "$TEMP_DIR/package-lock.json" "$SCRIPT_DIR/package-lock.json"
    elif [[ -f "$SCRIPT_DIR/package-lock.json" ]]; then
      rm -f "$SCRIPT_DIR/package-lock.json"
    fi
    echo "发布失败，已恢复自动升版产生的文件修改。" >&2
  fi

  rm -rf "$TEMP_DIR"
  return "$exit_code"
}

trap restore_on_failure EXIT

echo "运行 CLI 测试。"
npm test

echo "自动升级 patch 版本。"
npm version patch --no-git-tag-version --ignore-scripts >/dev/null
VERSION="$(node -p "require('./package.json').version")"

CONNECTOR_JSON="$CONNECTOR_JSON" PACKAGE_NAME="$PACKAGE_NAME" PACKAGE_VERSION="$VERSION" node <<'NODE'
const fs = require('fs');

const file = process.env.CONNECTOR_JSON;
const packageName = process.env.PACKAGE_NAME;
const version = process.env.PACKAGE_VERSION;
const connector = JSON.parse(fs.readFileSync(file, 'utf8'));

for (const platform of ['darwin', 'linux', 'win32']) {
  const command = connector.init?.[platform];
  const prefix = `npm install --global ${packageName}@`;

  if (typeof command !== 'string' || !command.startsWith(prefix)) {
    throw new Error(`WorkBuddy ${platform} init command does not match ${packageName}`);
  }

  connector.init[platform] = `${prefix}${version}`;
}

fs.writeFileSync(file, `${JSON.stringify(connector, null, 2)}\n`);
NODE

echo "检查发布内容：$PACKAGE_NAME@$VERSION"
npm pack --dry-run

echo "发布 npm 包：$PACKAGE_NAME@$VERSION"
npm publish --access public --registry="$REGISTRY"

RELEASE_SUCCEEDED=1
echo
echo "发布成功：$PACKAGE_NAME@$VERSION"
echo "已同步 WorkBuddy 安装版本：$VERSION"
echo "请检查并提交 cli/package.json 和 workbuddy/chuangkit-cli-connector/cli.json。"
