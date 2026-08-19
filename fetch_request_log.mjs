#!/usr/bin/env node
/**
 * 获取 moyu UAT 请求日志（错误日志）
 *
 * 用法:
 *   node fetch_request_log.mjs [选项]
 *
 * 选项:
 *   --hours N       最近 N 小时的日志 (默认 24)
 *   --status CODE   按 HTTP 状态码筛选 (如 500, 400)
 *   --model NAME    按模型名称筛选 (如 claude-opus-4-6)
 *   --channel ID    按渠道 ID 筛选
 *   --trace ID      按 trace ID 筛选
 *   --page N        页码 (默认 1)
 *   --page-size M   每页条数 (默认 100)
 *   --out FILE      输出文件路径 (默认 request_log_<日期>.json)
 *   --list          仅列出统计信息，不写文件
 *
 * 依赖: 仅使用 Node.js 内置 fetch (Node >= 18)。
 * 凭证: 从同目录 account.json 读取 { account: { username, password } }
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://uat.moyu.info';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    hours: 24, status: '', model: '', channel: '', trace: '',
    page: 1, pageSize: 100, out: '', listOnly: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--hours': opts.hours = Number(args[++i]); break;
      case '--status': opts.status = args[++i]; break;
      case '--model': opts.model = args[++i]; break;
      case '--channel': opts.channel = args[++i]; break;
      case '--trace': opts.trace = args[++i]; break;
      case '--page': opts.page = Number(args[++i]); break;
      case '--page-size': opts.pageSize = Number(args[++i]); break;
      case '--out': opts.out = args[++i]; break;
      case '--list': opts.listOnly = true; break;
      case '--help':
        console.log(`用法: node fetch_request_log.mjs [选项]
  --hours N       最近 N 小时的日志 (默认 24)
  --status CODE   按 HTTP 状态码筛选 (如 500)
  --model NAME    按模型名称筛选
  --channel ID    按渠道 ID 筛选
  --trace ID      按 trace ID 筛选
  --page N        页码 (默认 1)
  --page-size M   每页条数 (默认 100)
  --out FILE      输出文件路径 (默认 request_log_<日期>.json)
  --list          仅打印统计，不写文件`);
        process.exit(0);
      default:
        console.error(`未知参数: ${args[i]} (用 --help 查看用法)`);
        process.exit(1);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const { account } = JSON.parse(readFileSync(resolve(__dirname, 'account.json'), 'utf-8'));

  // 1. 登录，拿到 session cookie + 用户 id
  const loginRes = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: account.username, password: account.password }),
  });
  const loginJson = await loginRes.json();
  if (!loginJson.success || !loginJson.data) {
    console.error('登录失败:', loginJson.message);
    process.exit(1);
  }
  const userId = loginJson.data.id;
  const sessionCookie = (loginRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0])
    .find(c => c.startsWith('session='));
  if (!sessionCookie) {
    console.error('登录响应中未找到 session cookie');
    process.exit(1);
  }
  console.log(`登录成功: ${loginJson.data.display_name} (id=${userId})`);

  // 2. 构造日志查询参数
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - opts.hours * 3600;
  const params = new URLSearchParams({
    page: String(opts.page),
    page_size: String(opts.pageSize),
    start_timestamp: String(startTs),
    end_timestamp: String(now),
  });
  if (opts.status) params.set('http_status', opts.status);
  if (opts.model) params.set('model_name', opts.model);
  if (opts.channel) params.set('channel_id', opts.channel);
  if (opts.trace) params.set('trace_id', opts.trace);

  const apiUrl = `${BASE}/api/failed-request-log/?${params.toString()}`;
  console.log(`请求: ${apiUrl}`);

  // 3. 请求日志接口。关键 header: session cookie + Moyu-Ai-User (用户 id)
  const res = await fetch(apiUrl, {
    headers: {
      Cookie: sessionCookie,
      'Moyu-Ai-User': String(userId),
      'Cache-Control': 'no-store',
    },
  });
  const json = await res.json();
  if (!json.success) {
    console.error('接口返回失败:', json.message);
    process.exit(1);
  }

  const logs = json.data || [];
  const total = json.total ?? logs.length;

  // 4. 统计
  const statusCounts = {};
  const modelCounts = {};
  for (const log of logs) {
    const s = log.http_status ?? 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
    const m = log.model_name ?? 'unknown';
    modelCounts[m] = (modelCounts[m] || 0) + 1;
  }

  console.log(`\n共 ${total} 条匹配，本次取出 ${logs.length} 条`);
  console.log('\n按 HTTP 状态码分布:');
  for (const [code, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  HTTP ${code}: ${count} 条`);
  }
  console.log('\n按模型分布:');
  for (const [m, count] of Object.entries(modelCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m}: ${count} 条`);
  }

  if (logs.length > 0) {
    console.log('\n最近 3 条记录:');
    for (const log of logs.slice(0, 3)) {
      const time = new Date((log.created_at ?? 0) * 1000).toLocaleString('zh-CN');
      console.log(`  [${time}] ${log.model_name} | HTTP ${log.http_status} | ${(log.error_message ?? '').slice(0, 100)}`);
    }
  }

  // 5. 写文件
  if (!opts.listOnly) {
    const outFile = opts.out || `request_log_${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(
      resolve(__dirname, outFile),
      JSON.stringify({
        total,
        fetched: logs.length,
        query: {
          hours: opts.hours,
          http_status: opts.status,
          model_name: opts.model,
          channel_id: opts.channel,
          page: opts.page,
          page_size: opts.pageSize,
          start_timestamp: startTs,
          end_timestamp: now,
        },
        logs,
      }, null, 2),
      'utf-8'
    );
    console.log(`\n已保存 ${logs.length} 条到 ${outFile}`);
  }
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
