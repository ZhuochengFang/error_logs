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
 *   --out FILE      额外导出一份 JSON 文件
 *   --list          仅列出统计信息，不写入数据库
 *
 * 存储: SQLite 数据库 error_logs.db（自动去重）。
 * 依赖: 仅使用 Node.js 内置模块 (Node >= 22)。
 * 凭证: 从同目录 account.json 读取 { account: { username, password } }
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://uat.moyu.info';
const DB_PATH = resolve(__dirname, 'error_logs.db');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    hours: 24, status: '', model: '', channel: '', trace: '',
    page: 1, pageSize: 100, out: '', listOnly: false,
    query: false, stats: false, limit: 20,
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
      case '--query': opts.query = true; break;
      case '--stats': opts.stats = true; break;
      case '--limit': opts.limit = Number(args[++i]); break;
      case '--help':
        console.log(`用法: node fetch_request_log.mjs [选项]

获取模式 (默认，从魔芋 API 拉取并存入数据库):
  --hours N       最近 N 小时的日志 (默认 24)
  --status CODE   按 HTTP 状态码筛选 (如 500)
  --model NAME    按模型名称筛选
  --channel ID    按渠道 ID 筛选
  --trace ID      按 trace ID 筛选
  --page N        起始页码 (默认 1)
  --page-size M   每页条数 (默认 100)
  --out FILE      额外导出一份 JSON 文件
  --list          仅打印统计，不写入数据库

本地查询模式 (查询已入库的数据，不联网):
  --query         查询数据库中的日志记录
  --stats         显示数据库统计摘要
  --hours N       筛选最近 N 小时 (默认 24)
  --status CODE   按状态码筛选
  --model NAME    按模型筛选
  --channel ID    按渠道筛选
  --limit N       最多显示 N 条 (默认 20)

数据存储在 ${DB_PATH}`);
        process.exit(0);
      default:
        console.error(`未知参数: ${args[i]} (用 --help 查看用法)`);
        process.exit(1);
    }
  }
  return opts;
}

function initDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id            INTEGER PRIMARY KEY,
      created_at    INTEGER NOT NULL,
      trace_id      TEXT,
      user_id       INTEGER,
      username      TEXT,
      token_id      INTEGER,
      token_name    TEXT,
      channel_id    INTEGER,
      channel_name  TEXT,
      channel_type  INTEGER,
      model_name    TEXT,
      endpoint      TEXT,
      http_status   INTEGER,
      error_message TEXT,
      retry_number  INTEGER,
      duration_ms   INTEGER,
      group_name    TEXT,
      is_stream     INTEGER,
      failed_stage  TEXT,
      request_ip    TEXT,
      use_channel   TEXT,
      fetched_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_created_at  ON error_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_http_status  ON error_logs(http_status);
    CREATE INDEX IF NOT EXISTS idx_model_name   ON error_logs(model_name);
    CREATE INDEX IF NOT EXISTS idx_channel_id   ON error_logs(channel_id);
  `);
  return db;
}

function insertLogs(db, logs) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO error_logs (
      id, created_at, trace_id, user_id, username,
      token_id, token_name, channel_id, channel_name, channel_type,
      model_name, endpoint, http_status, error_message, retry_number,
      duration_ms, group_name, is_stream, failed_stage, request_ip,
      use_channel, fetched_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )
  `);
  const now = Math.floor(Date.now() / 1000);
  let inserted = 0;
  for (const log of logs) {
    const result = stmt.run(
      log.id, log.created_at, log.trace_id, log.user_id, log.username,
      log.token_id, log.token_name, log.channel_id, log.channel_name, log.channel_type,
      log.model_name, log.endpoint, log.http_status, log.error_message, log.retry_number,
      log.duration_ms, log.group ?? null, log.is_stream ? 1 : 0, log.failed_stage, log.request_ip,
      log.use_channel, now,
    );
    if (result.changes > 0) inserted++;
  }
  return inserted;
}

function buildWhereClause(opts) {
  const conditions = [];
  const params = [];
  const now = Math.floor(Date.now() / 1000);
  conditions.push('created_at >= ?');
  params.push(now - opts.hours * 3600);
  if (opts.status) { conditions.push('http_status = ?'); params.push(Number(opts.status)); }
  if (opts.model) { conditions.push('model_name = ?'); params.push(opts.model); }
  if (opts.channel) { conditions.push('channel_id = ?'); params.push(Number(opts.channel)); }
  return { where: conditions.join(' AND '), params };
}

function queryDb(opts) {
  const db = new DatabaseSync(DB_PATH);
  const { where, params } = buildWhereClause(opts);

  const rows = db.prepare(
    `SELECT id, created_at, model_name, channel_name, http_status, error_message, duration_ms, failed_stage
     FROM error_logs WHERE ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, opts.limit);

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM error_logs WHERE ${where}`).get(...params).cnt;

  console.log(`数据库查询: 共 ${total} 条匹配，显示最近 ${rows.length} 条\n`);
  for (const r of rows) {
    const time = new Date(r.created_at * 1000).toLocaleString('zh-CN');
    console.log(`  [${time}] ${r.model_name} | ${r.channel_name} | HTTP ${r.http_status} | ${r.duration_ms}ms`);
    console.log(`    ${(r.error_message ?? '').slice(0, 120)}`);
  }
  db.close();
}

function statsDb(opts) {
  const db = new DatabaseSync(DB_PATH);
  const { where, params } = buildWhereClause(opts);

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM error_logs WHERE ${where}`).get(...params).cnt;
  const allTotal = db.prepare('SELECT COUNT(*) as cnt FROM error_logs').get().cnt;

  console.log(`数据库统计: 筛选 ${total} 条 / 总计 ${allTotal} 条\n`);

  console.log('按 HTTP 状态码:');
  const byStatus = db.prepare(
    `SELECT http_status, COUNT(*) as cnt FROM error_logs WHERE ${where} GROUP BY http_status ORDER BY cnt DESC`
  ).all(...params);
  for (const r of byStatus) console.log(`  HTTP ${r.http_status}: ${r.cnt} 条`);

  console.log('\n按模型:');
  const byModel = db.prepare(
    `SELECT model_name, COUNT(*) as cnt FROM error_logs WHERE ${where} GROUP BY model_name ORDER BY cnt DESC`
  ).all(...params);
  for (const r of byModel) console.log(`  ${r.model_name || '(空)'}: ${r.cnt} 条`);

  console.log('\n按渠道:');
  const byChan = db.prepare(
    `SELECT channel_name, COUNT(*) as cnt FROM error_logs WHERE ${where} GROUP BY channel_name ORDER BY cnt DESC`
  ).all(...params);
  for (const r of byChan) console.log(`  ${r.channel_name}: ${r.cnt} 条`);

  console.log('\n按失败阶段:');
  const byStage = db.prepare(
    `SELECT failed_stage, COUNT(*) as cnt FROM error_logs WHERE ${where} GROUP BY failed_stage ORDER BY cnt DESC`
  ).all(...params);
  for (const r of byStage) console.log(`  ${r.failed_stage}: ${r.cnt} 条`);

  db.close();
}

async function main() {
  const opts = parseArgs();

  if (opts.query) { queryDb(opts); return; }
  if (opts.stats) { statsDb(opts); return; }

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

  // 2. 自动翻页获取所有日志
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - opts.hours * 3600;
  const baseParams = new URLSearchParams({
    page_size: String(opts.pageSize),
    start_timestamp: String(startTs),
    end_timestamp: String(now),
  });
  if (opts.status) baseParams.set('http_status', opts.status);
  if (opts.model) baseParams.set('model_name', opts.model);
  if (opts.channel) baseParams.set('channel_id', opts.channel);
  if (opts.trace) baseParams.set('trace_id', opts.trace);

  const logs = [];
  let total = 0;
  let page = opts.page;
  while (true) {
    const params = new URLSearchParams(baseParams);
    params.set('page', String(page));
    const apiUrl = `${BASE}/api/failed-request-log/?${params.toString()}`;
    if (page === opts.page) console.log(`请求: ${apiUrl}`);

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

    const pageLogs = json.data || [];
    total = json.total ?? total;
    logs.push(...pageLogs);

    if (pageLogs.length < opts.pageSize || logs.length >= total) break;
    page++;
    console.log(`  翻页: 第 ${page} 页...`);
  }

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

  // 5. 写入数据库
  if (!opts.listOnly) {
    const db = initDb();
    const inserted = insertLogs(db, logs);
    const skipped = logs.length - inserted;
    const totalRows = db.prepare('SELECT COUNT(*) as cnt FROM error_logs').get().cnt;
    db.close();
    console.log(`\n数据库: 新增 ${inserted} 条，跳过 ${skipped} 条重复 (库中共 ${totalRows} 条)`);
  }

  // 6. 可选：导出 JSON
  if (opts.out) {
    const outFile = resolve(__dirname, opts.out);
    writeFileSync(
      outFile,
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
    console.log(`已导出 ${logs.length} 条到 ${opts.out}`);
  }
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
