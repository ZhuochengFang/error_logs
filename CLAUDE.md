# 魔芋网关 - 错误日志获取工具

## 概述

从魔芋 AI 网关获取请求错误日志并持久化到本地 SQLite 数据库，支持交互式菜单和命令行两种使用方式。

纯 Node.js 脚本，零依赖，要求 Node >= 22（使用内置 `node:sqlite`）。提供 `moyu-log` 命令，进入项目目录时自动可用。

## 文件结构

```
.
├── CLAUDE.md                  # 本文件
├── .bashrc                    # 项目级 shell 函数（moyu-log 命令定义，cd 进入目录时自动加载）
├── .env                       # 环境配置（不入库，含凭证和 API 地址）
├── .env.example               # 环境配置模板（入库）
├── account.json               # 管理员凭证（不入库，.env 的后备方案）
├── error_logs.db              # SQLite 数据库（自动创建，持久存储所有错误日志）
├── lib.mjs                    # 共享函数库（数据库、API、查询逻辑）
├── moyu-log.mjs               # 交互式菜单入口
├── fetch_request_log.mjs      # 命令行脚本（脚本化/自动化调用）
├── install.sh                 # 安装脚本（在 ~/.bashrc 中注入目录钩子）
├── data/                      # --out 导出的 JSON 文件存放目录（自动创建）
└── KEY/
    └── settings.json          # AI API 密钥配置（非本工具使用）
```

## 环境配置

凭证和环境地址通过 `.env` 文件配置（优先），也兼容旧的 `account.json` 方式。

```bash
# 首次使用：从模板创建 .env
cp .env.example .env
# 编辑 .env 填写实际凭证和环境地址
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MOYU_BASE_URL` | 魔芋网关地址（必填） | 无，未配置时报错 |
| `MOYU_USERNAME` | 登录用户名 | 回退读取 `account.json` |
| `MOYU_PASSWORD` | 登录密码 | 回退读取 `account.json` |
| `MOYU_DB_PATH` | 数据库文件路径（相对于项目目录） | `error_logs.db` |

## 安装

```bash
cd <项目目录>

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入凭证（或继续使用 account.json）

# 安装命令
bash install.sh
# 然后 source ~/.bashrc 或重新打开终端
```

`install.sh` 会在 `~/.bashrc` 中注入一个 `PROMPT_COMMAND` 钩子，以项目的绝对路径为判断依据。当 `cd` 进入项目目录（或其子目录）时自动加载 `moyu-log` shell 函数，离开时自动卸载。项目可放在任意路径，安装脚本会自动检测。

## 快速开始

```bash
# 进入项目目录（moyu-log 命令自动可用）
cd <项目目录>

# 交互式菜单（推荐，无参数直接运行）
moyu-log

# 命令行方式（带参数）
moyu-log --hours 168
moyu-log --stats --hours 720
moyu-log --query --status 500
```

`moyu-log` 命令在项目目录及其子目录下自动可用，离开后自动卸载。

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

预期输出包含 `登录成功` 及用户信息。如果提示"登录失败"，检查 `.env` 中的凭证或 `account.json` 是否正确，以及 `MOYU_BASE_URL` 指向的网关是否可达。

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
moyu-log --hours 168 --model <模型名称>
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

1. 用 `.env`（或 `account.json`）中的凭证调用 `POST /api/user/login` 登录，获取 session cookie 和用户 id
2. 携带 `Cookie: session=...` + `Moyu-Ai-User: {id}` 请求 `GET /api/failed-request-log/` 接口（自动翻页取回所有匹配记录）
3. 解析 JSON 响应，输出统计摘要
4. 将日志写入 SQLite 数据库（按 id 去重）
5. 如指定 `--out`，额外导出一份 JSON 文件

## 故障排查

| 现象 | 排查方式 |
|------|----------|
| `moyu-log: 命令未找到` | 运行 `bash install.sh` 安装；然后 `source ~/.bashrc`；确认在项目目录下 |
| 离开项目目录后命令消失 | 正常行为，`cd` 回项目目录即可恢复 |
| `登录失败` | 检查 `.env` 凭证（`MOYU_USERNAME` / `MOYU_PASSWORD`），确认 `MOYU_BASE_URL` 可达 |
| `接口返回失败: 未提供用户标识` | 登录 session 可能已过期，重新运行即可（每次运行都会重新登录） |
| `0 条匹配` | 扩大 `--hours` 范围；该时间段内可能确实没有错误日志 |
| `ExperimentalWarning: SQLite` | 正常提示，Node.js 内置 SQLite 标记为实验性，功能稳定 |
| `DatabaseSync is not a constructor` | Node 版本需 >= 22，运行 `node --version` 确认 |
