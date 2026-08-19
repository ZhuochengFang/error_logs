# Catalog Service - 错误日志获取工具

## 概述

从魔芋 AI 网关 UAT 环境 (`https://uat.moyu.info/console/request-log`) 获取请求错误日志。

纯 Node.js 脚本，零依赖，要求 Node >= 22（使用内置 `node:sqlite`）。提供 `moyu-log` 命令，仅在项目目录下可用。

## 文件结构

```
.
├── CLAUDE.md                  # 本文件
├── account.json               # 管理员凭证 { account: { username, password } }
├── error_logs.db              # SQLite 数据库（自动创建，持久存储所有错误日志）
├── lib.mjs                    # 共享函数库（数据库、API、查询逻辑）
├── moyu-log.mjs               # 交互式菜单入口
├── fetch_request_log.mjs      # 命令行脚本（脚本化/自动化调用）
├── install.sh                 # 安装脚本（自动生成 moyu-log 命令并配置 PATH）
├── data/                      # --out 导出的 JSON 文件存放目录（自动创建）
├── KEY/
│   └── settings.json          # AI API 密钥配置（非本工具使用）
└── ~/.local/bin/moyu-log      # 系统命令入口（由 install.sh 自动生成）
```

## 安装

```bash
cd /home/fzc_ubuntu/error_logs
bash install.sh
```

脚本会自动将 `moyu-log` 命令安装到 `~/.local/bin/`，并在需要时将该目录添加到 PATH。

## 快速开始

```bash
# 先进入项目目录
cd /home/fzc_ubuntu/error_logs

# 交互式菜单（推荐，无参数直接运行）
moyu-log

# 命令行方式（带参数）
moyu-log --hours 168
moyu-log --stats --hours 720
moyu-log --query --status 500
```

`moyu-log` 命令仅在本目录下可用，在其他目录执行会提示先 `cd` 到项目目录。

## 全部参数 (命令行模式)

以下参数用于 `moyu-log`（或 `node fetch_request_log.mjs`）：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--hours N` | 查询最近 N 小时 | 24 |
| `--status CODE` | 按 HTTP 状态码筛选（400、500 等） | 不筛选 |
| `--model NAME` | 按模型名称筛选 | 不筛选 |
| `--channel ID` | 按渠道 ID 筛选 | 不筛选 |
| `--trace ID` | 按 trace ID 筛选 | 不筛选 |
| `--page N` | 页码 | 1 |
| `--page-size M` | 每页条数 | 100 |
| `--out [FILE]` | 额外导出 JSON 文件（省略文件名则自动生成 `errors_YYYY-MM-DD.json`） | 不导出 |
| `--list` | 仅打印统计摘要，不写入数据库 | 否 |
| `--query` | 查询数据库中的日志记录（不联网） | 否 |
| `--stats` | 显示数据库统计摘要（不联网） | 否 |
| `--limit N` | `--query` 模式下最多显示条数 | 20 |
| `--help` | 显示帮助信息 | - |

## 数据存储

日志存储在 SQLite 数据库 `error_logs.db` 中（首次运行自动创建）。

- 每次获取的日志自动写入数据库，按 `id` 字段去重
- 重复运行不会产生重复数据
- 可用 `--out` 按需导出 JSON 文件

### 数据库表结构

表 `error_logs`，字段与 API 返回一一对应：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PRIMARY KEY | 日志唯一 ID（天然去重） |
| `created_at` | INTEGER | 错误发生时间（Unix 秒） |
| `trace_id` | TEXT | 请求追踪 ID |
| `user_id` | INTEGER | 用户 ID |
| `username` | TEXT | 用户名 |
| `token_id` | INTEGER | API Token ID |
| `token_name` | TEXT | Token 名称 |
| `channel_id` | INTEGER | 渠道 ID |
| `channel_name` | TEXT | 渠道名称 |
| `channel_type` | INTEGER | 渠道类型 |
| `model_name` | TEXT | 模型名称 |
| `endpoint` | TEXT | API 端点 |
| `http_status` | INTEGER | HTTP 状态码 |
| `error_message` | TEXT | 错误信息 |
| `retry_number` | INTEGER | 重试次数 |
| `duration_ms` | INTEGER | 请求耗时（毫秒） |
| `group_name` | TEXT | 路由分组 |
| `is_stream` | INTEGER | 是否流式请求（0/1） |
| `failed_stage` | TEXT | 失败阶段 |
| `request_ip` | TEXT | 请求来源 IP |
| `use_channel` | TEXT | 渠道路由路径 |
| `fetched_at` | INTEGER | 记录入库时间（Unix 秒） |

索引：`created_at`、`http_status`、`model_name`、`channel_id`。

### 直接查询数据库

```bash
# 查询最近 7 天的记录
moyu-log --query --hours 168

# 查看统计
moyu-log --stats --hours 720

# 按条件筛选
moyu-log --query --status 500 --limit 10
```

## 测试方法

### 1. 交互式模式

```bash
moyu-log
```

运行后选择菜单选项即可，按提示输入筛选参数。

### 2. 验证登录

```bash
moyu-log --list --hours 1
```

预期输出第一行为 `登录成功: Root User (id=1)`。如果提示"登录失败"，检查 `account.json` 中的凭证是否正确。

### 3. 获取近 7 天错误日志

```bash
moyu-log --hours 168
```

预期输出包含匹配条数、HTTP 状态码分布、模型分布、最近 3 条记录预览，以及数据库写入统计（新增 N 条、跳过 N 条重复）。

### 4. 按状态码筛选

```bash
moyu-log --hours 168 --status 400
moyu-log --hours 168 --status 500
```

### 5. 按模型筛选

```bash
moyu-log --hours 168 --model deepseek-v4-flash
```

### 6. 导出 JSON 文件

```bash
moyu-log --hours 168 --out errors_this_week.json
```

### 7. 分页获取大量数据

```bash
moyu-log --hours 720 --page 1 --page-size 50
```

## 工作原理

1. 用 `account.json` 中的凭证调用 `POST /api/user/login` 登录，获取 session cookie 和用户 id
2. 携带 `Cookie: session=...` + `Moyu-Ai-User: {id}` 请求 `GET /api/failed-request-log/` 接口（自动翻页取回所有匹配记录）
3. 解析 JSON 响应，输出统计摘要
4. 将日志写入 SQLite 数据库 `error_logs.db`（按 id 去重）
5. 如指定 `--out`，额外导出一份 JSON 文件

## 故障排查

| 现象 | 排查方式 |
|------|----------|
| `moyu-log: 命令未找到` | 运行 `bash install.sh` 安装；确认 `~/.local/bin` 在 PATH 中；`hash -r` 刷新命令缓存 |
| `moyu-log 仅在项目目录下可用` | 先执行 `cd /home/fzc_ubuntu/error_logs` 再运行 |
| `登录失败` | 检查 `account.json` 凭证，确认 UAT 环境 `https://uat.moyu.info` 可达 |
| `接口返回失败: 未提供用户标识` | 登录 session 可能已过期，重新运行即可（每次运行都会重新登录） |
| `0 条匹配` | 扩大 `--hours` 范围；该时间段内可能确实没有错误日志 |
| `ExperimentalWarning: SQLite` | 正常提示，Node.js 内置 SQLite 标记为实验性，功能稳定 |
| `DatabaseSync is not a constructor` | Node 版本需 >= 22，运行 `node --version` 确认 |
