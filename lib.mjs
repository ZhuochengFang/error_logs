import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.MOYU_BASE_URL) {
  console.error('错误: 未配置 MOYU_BASE_URL，请在 .env 中设置魔芋网关地址');
  process.exit(1);
}
export const BASE = process.env.MOYU_BASE_URL;
export const DB_PATH = resolve(__dirname, process.env.MOYU_DB_PATH || 'error_logs.db');

export function initDb() {
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

export function insertLogs(db, logs) {
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

export function buildWhereClause(opts) {
  const conditions = [];
  const params = [];
  const now = Math.floor(Date.now() / 1000);
  if (opts.hours) {
    conditions.push('created_at >= ?');
    params.push(now - opts.hours * 3600);
  }
  if (opts.status) { conditions.push('http_status = ?'); params.push(Number(opts.status)); }
  if (opts.model) { conditions.push('model_name = ?'); params.push(opts.model); }
  if (opts.channel) { conditions.push('channel_id = ?'); params.push(Number(opts.channel)); }
  const where = conditions.length ? conditions.join(' AND ') : '1=1';
  return { where, params };
}

export function queryDb(opts) {
  const db = new DatabaseSync(DB_PATH);
  const { where, params } = buildWhereClause(opts);
  const limit = opts.limit ?? 20;

  const rows = db.prepare(
    `SELECT id, created_at, model_name, channel_name, http_status, error_message, duration_ms, failed_stage
     FROM error_logs WHERE ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, limit);

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM error_logs WHERE ${where}`).get(...params).cnt;

  console.log(`数据库查询: 共 ${total} 条匹配，显示最近 ${rows.length} 条\n`);
  for (const r of rows) {
    const time = new Date(r.created_at * 1000).toLocaleString('zh-CN');
    console.log(`  [${time}] ${r.model_name} | ${r.channel_name} | HTTP ${r.http_status} | ${r.duration_ms}ms`);
    console.log(`    ${(r.error_message ?? '').slice(0, 120)}`);
  }
  db.close();
}

export function statsDb(opts) {
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

export async function login() {
  let username = process.env.MOYU_USERNAME;
  let password = process.env.MOYU_PASSWORD;
  if (!username || !password) {
    const accountPath = resolve(__dirname, 'account.json');
    const { account } = JSON.parse(readFileSync(accountPath, 'utf-8'));
    username = account.username;
    password = account.password;
  }
  const loginRes = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const loginJson = await loginRes.json();
  if (!loginJson.success || !loginJson.data) {
    throw new Error(`登录失败: ${loginJson.message}`);
  }
  const userId = loginJson.data.id;
  const sessionCookie = (loginRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0])
    .find(c => c.startsWith('session='));
  if (!sessionCookie) {
    throw new Error('登录响应中未找到 session cookie');
  }
  console.log(`登录成功: ${loginJson.data.display_name} (id=${userId})`);
  return { userId, sessionCookie };
}

export async function fetchLogs(session, opts) {
  const { userId, sessionCookie } = session;
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - (opts.hours ?? 24) * 3600;
  const baseParams = new URLSearchParams({
    page_size: String(opts.pageSize ?? 100),
    start_timestamp: String(startTs),
    end_timestamp: String(now),
  });
  if (opts.status) baseParams.set('http_status', opts.status);
  if (opts.model) baseParams.set('model_name', opts.model);
  if (opts.channel) baseParams.set('channel_id', opts.channel);
  if (opts.trace) baseParams.set('trace_id', opts.trace);

  const logs = [];
  let total = 0;
  let page = opts.page ?? 1;
  const startPage = page;
  while (true) {
    const params = new URLSearchParams(baseParams);
    params.set('page', String(page));
    const apiUrl = `${BASE}/api/failed-request-log/?${params.toString()}`;
    if (page === startPage) console.log(`请求: ${apiUrl}`);

    const res = await fetch(apiUrl, {
      headers: {
        Cookie: sessionCookie,
        'Moyu-Ai-User': String(userId),
        'Cache-Control': 'no-store',
      },
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(`接口返回失败: ${json.message}`);
    }

    const pageLogs = json.data || [];
    total = json.total ?? total;
    logs.push(...pageLogs);

    const pageSize = opts.pageSize ?? 100;
    if (pageLogs.length < pageSize || logs.length >= total) break;
    page++;
    console.log(`  翻页: 第 ${page} 页...`);
  }

  return { logs, total, startTs, endTs: now };
}

export function printSummary(logs, total) {
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
}
