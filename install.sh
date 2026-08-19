#!/usr/bin/env bash
set -e

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

# 清理旧的 ~/.local/bin/moyu-log（如果存在）
OLD_CMD="${HOME}/.local/bin/moyu-log"
if [ -f "$OLD_CMD" ]; then
  rm "$OLD_CMD"
  echo "已移除旧命令: $OLD_CMD"
fi

SHELL_RC=""
case "$(basename "$SHELL")" in
  zsh)  SHELL_RC="$HOME/.zshrc" ;;
  bash) SHELL_RC="$HOME/.bashrc" ;;
  *)    SHELL_RC="$HOME/.profile" ;;
esac

HOOK_MARKER="# >>> moyu-log directory hook >>>"
HOOK_END="# <<< moyu-log directory hook <<<"

# 先移除旧的 hook（如果存在）
if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
  sed -i "/$HOOK_MARKER/,/$HOOK_END/d" "$SHELL_RC"
fi

# 写入新的 hook
cat >> "$SHELL_RC" <<HOOK

$HOOK_MARKER
_moyu_log_check_dir() {
  local project_dir="$INSTALL_DIR"
  if [[ "\$PWD" == "\$project_dir" || "\$PWD" == "\$project_dir"/* ]]; then
    if [ -z "\$_MOYU_LOG_LOADED" ]; then
      source "\$project_dir/.bashrc"
      _MOYU_LOG_LOADED=1
    fi
  else
    if [ -n "\$_MOYU_LOG_LOADED" ]; then
      unset -f moyu-log 2>/dev/null
      unset _MOYU_PROJECT_DIR
      unset _MOYU_LOG_LOADED
    fi
  fi
}
if [[ "\$PROMPT_COMMAND" != *"_moyu_log_check_dir"* ]]; then
  PROMPT_COMMAND="_moyu_log_check_dir;\${PROMPT_COMMAND:-}"
fi
$HOOK_END
HOOK

echo "安装完成！"
echo "项目目录: $INSTALL_DIR"
echo ""
echo "moyu-log 命令将在 cd 进入 $INSTALL_DIR 时自动可用，离开后自动卸载。"
echo "请运行: source $SHELL_RC 或重新打开终端使其生效。"
