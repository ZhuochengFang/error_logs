# moyu-log 命令定义 - 进入项目目录时自动加载，离开时自动卸载
_MOYU_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

moyu-log() {
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
HELP
    return 0
  fi

  if [ $# -eq 0 ]; then
    node "$_MOYU_PROJECT_DIR/moyu-log.mjs"
  else
    node "$_MOYU_PROJECT_DIR/fetch_request_log.mjs" "$@"
  fi
}
