#!/usr/bin/env node
/**
 * 获取 moyu UAT 请求日志（错误日志）— 命令行接口
 *
 * 用法:
 *   node fetch_request_log.mjs [选项]
 *
 * 交互式用法:
 *   node moyu-log.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DB_PATH, initDb, insertLogs, queryDb, statsDb,
  login, fetchLogs, printSummary,
} from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      case '--out': {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          opts.out = args[++i];
        } else {
          opts.out = `errors_${new Date().toISOString().slice(0, 10)}.json`;
        }
        break;
      }
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

交互式模式:
  node moyu-log.mjs

数据存储在 ${DB_PATH}`);
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

  if (opts.query) { queryDb(opts); return; }
  if (opts.stats) { statsDb(opts); return; }

  const session = await login();
  const { logs, total, startTs, endTs } = await fetchLogs(session, opts);
  printSummary(logs, total);

  if (!opts.listOnly) {
    const db = initDb();
    const inserted = insertLogs(db, logs);
    const skipped = logs.length - inserted;
    const totalRows = db.prepare('SELECT COUNT(*) as cnt FROM error_logs').get().cnt;
    db.close();
    console.log(`\n数据库: 新增 ${inserted} 条，跳过 ${skipped} 条重复 (库中共 ${totalRows} 条)`);
  }

  if (opts.out) {
    const dataDir = resolve(__dirname, 'data');
    mkdirSync(dataDir, { recursive: true });
    const outFile = resolve(dataDir, opts.out);
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
          end_timestamp: endTs,
        },
        logs,
      }, null, 2),
      'utf-8'
    );
    console.log(`已导出 ${logs.length} 条到 data/${opts.out}`);
  }
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
