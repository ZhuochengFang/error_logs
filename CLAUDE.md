# Catalog Service - 错误日志获取工具

## 概述

从魔芋 AI 网关 UAT 环境 (`https://uat.moyu.info/console/request-log`) 获取请求错误日志。

纯 Node.js 脚本，零依赖，要求 Node >= 18。已安装为系统命令 `moyu-log`。

## 文件结构

```
.
├── CLAUDE.md                  # 本文件
├── account.json               # 管理员凭证 { account: { username, password } }
├── KEY/
│   └── settings.json          # AI API 密钥配置（非本工具使用）
└── fetch_request_log.mjs      # 日志获取脚本
~/.local/bin/moyu-log          # 系统命令（Shell 入口，转发到上面的脚本）
```

## 快速开始

```bash
# 在任意目录使用系统命令
moyu-log

# 或在项目目录直接运行脚本
node fetch_request_log.mjs
```

## 全部参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--hours N` | 查询最近 N 小时 | 24 |
| `--status CODE` | 按 HTTP 状态码筛选（400、500 等） | 不筛选 |
| `--model NAME` | 按模型名称筛选 | 不筛选 |
| `--channel ID` | 按渠道 ID 筛选 | 不筛选 |
| `--trace ID` | 按 trace ID 筛选 | 不筛选 |
| `--page N` | 页码 | 1 |
| `--page-size M` | 每页条数 | 100 |
| `--out FILE` | 指定输出文件路径 | `request_log_<日期>.json` |
| `--list` | 仅打印统计摘要，不写文件 | 否 |
| `--help` | 显示帮助信息 | - |

## 测试方法

### 1. 验证登录

```bash
# 使用系统命令（推荐，任意目录可用）
moyu-log --list --hours 1

# 或在项目目录直接调脚本
node fetch_request_log.mjs --list --hours 1
```

预期输出第一行为 `登录成功: Root User (id=1)`。如果提示"登录失败"，检查 `account.json` 中的凭证是否正确。

### 2. 获取近 7 天错误日志

```bash
moyu-log --hours 168
```

预期输出包含匹配条数、HTTP 状态码分布、模型分布，以及最近 3 条记录预览。文件保存到当前目录下 `request_log_<日期>.json`。

### 3. 按状态码筛选

```bash
# 只看 HTTP 400 错误
moyu-log --hours 168 --status 400

# 只看 HTTP 500 错误
moyu-log --hours 168 --status 500
```

### 4. 按模型筛选

```bash
moyu-log --hours 168 --model deepseek-v4-flash
```

### 5. 导出到指定文件

```bash
moyu-log --hours 168 --out errors_this_week.json
```

### 6. 分页获取大量数据

```bash
# 第 1 页，每页 50 条
moyu-log --hours 720 --page 1 --page-size 50

# 第 2 页
moyu-log --hours 720 --page 2 --page-size 50
```

## 输出格式

JSON 文件结构：

```json
{
  "total": 16,
  "fetched": 5,
  "query": {
    "hours": 168,
    "http_status": "",
    "model_name": "",
    "page": 1,
    "page_size": 5,
    "start_timestamp": 1786438808,
    "end_timestamp": 1787043608
  },
  "logs": [
    {
      "id": 1755410,
      "created_at": 1786525084,
      "trace_id": "20260812165803950715700PVP2KutG",
      "user_id": 1,
      "username": "admin",
      "token_name": "token1",
      "channel_id": 141,
      "channel_name": "pro质量-deepseek官网直连",
      "model_name": "deepseek-v4-flash",
      "endpoint": "/v1/messages",
      "http_status": 400,
      "error_message": "The `content[].thinking` in the thinking mode must be passed back to the API.",
      "duration_ms": 171,
      "group": "default",
      "is_stream": true,
      "failed_stage": "upstream_request",
      "retry_number": 0
    }
  ]
}
```

## 工作原理

1. 用 `account.json` 中的凭证调用 `POST /api/user/login` 登录，获取 session cookie 和用户 id
2. 携带 `Cookie: session=...` + `Moyu-Ai-User: {id}` 请求 `GET /api/failed-request-log/` 接口
3. 解析 JSON 响应，输出统计摘要并保存到文件

## 故障排查

| 现象 | 排查方式 |
|------|----------|
| `登录失败` | 检查 `account.json` 凭证，确认 UAT 环境 `https://uat.moyu.info` 可达 |
| `接口返回失败: 未提供用户标识` | 登录 session 可能已过期，重新运行即可（每次运行都会重新登录） |
| `0 条匹配` | 扩大 `--hours` 范围；该时间段内可能确实没有错误日志 |
| `fetch is not a function` | Node 版本需 >= 18，运行 `node --version` 确认 |
