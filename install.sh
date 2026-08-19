#!/usr/bin/env bash
set -e

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${HOME}/.local/bin"
CMD_PATH="${BIN_DIR}/moyu-log"

mkdir -p "$BIN_DIR"

cat > "$CMD_PATH" <<'SCRIPT'
#!/usr/bin/env bash

# 从 .env 读取配置（取第一个匹配到的 .env 文件所在目录作为项目目录）
find_project_dir() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/.env" ] && grep -q 'MOYU_' "$dir/.env" 2>/dev/null; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

load_env() {
  local env_file="$1/.env"
  if [ -f "$env_file" ]; then
    while IFS='=' read -r key value; do
      key=$(echo "$key" | xargs)
      [[ -z "$key" || "$key" == \#* ]] && continue
      value=$(echo "$value" | xargs)
      export "$key=$value"
    done < "$env_file"
  fi
}

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  cat <<'HELP'
用法: moyu-log [选项]

交互式模式 (无参数):
  moyu-log                    启动交互式菜单

获取模式 (从魔芋 API 拉取并存入数据库):
  --hours N       最近 N 小时的日志 (默认 24)
  --status CODE   按 HTTP 状态码筛选 (如 500)
  --model NAME    按模型名称筛选
  --channel ID    按渠道 ID 筛选
  --trace ID      按 trace ID 筛选
  --page N        起始页码 (默认 1)
  --page-size M   每页条数 (默认 100)
  --out [FILE]    额外导出 JSON 文件 (缺省文件名: errors_YYYY-MM-DD.json)
  --list          仅打印统计，不写入数据库

本地查询模式 (查询已入库的数据，不联网):
  --query         查询数据库中的日志记录
  --stats         显示数据库统计摘要
  --hours N       筛选最近 N 小时 (默认 24)
  --status CODE   按状态码筛选
  --model NAME    按模型筛选
  --channel ID    按渠道筛选
  --limit N       最多显示 N 条 (默认 20)

工作目录名通过 .env 中的 MOYU_WORK_DIR_NAME 配置 (默认 error_logs)
HELP
  exit 0
fi

PROJECT_DIR="$(find_project_dir)"
if [ -z "$PROJECT_DIR" ]; then
  echo "moyu-log: 未找到包含 .env 的项目目录，请在项目目录下运行" >&2
  exit 1
fi

load_env "$PROJECT_DIR"

WORK_DIR_NAME="${MOYU_WORK_DIR_NAME:-error_logs}"
CURRENT_DIR_NAME="$(basename "$PWD")"
if [ -n "$WORK_DIR_NAME" ] && [ "$CURRENT_DIR_NAME" != "$WORK_DIR_NAME" ]; then
  echo "moyu-log 仅在目录名为 '$WORK_DIR_NAME' 的目录下可用" >&2
  echo "  当前目录: $PWD (目录名: $CURRENT_DIR_NAME)" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  exec node "$PROJECT_DIR/moyu-log.mjs"
else
  exec node "$PROJECT_DIR/fetch_request_log.mjs" "$@"
fi
SCRIPT

chmod +x "$CMD_PATH"

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
  SHELL_RC=""
  case "$(basename "$SHELL")" in
    zsh)  SHELL_RC="$HOME/.zshrc" ;;
    bash) SHELL_RC="$HOME/.bashrc" ;;
    *)    SHELL_RC="$HOME/.profile" ;;
  esac

  if [ -n "$SHELL_RC" ] && ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
    echo "已将 $BIN_DIR 添加到 $SHELL_RC"
    echo "请运行: source $SHELL_RC 或重新打开终端使其生效"
  fi
fi

echo "安装完成: $CMD_PATH"
echo "项目目录: $INSTALL_DIR"
