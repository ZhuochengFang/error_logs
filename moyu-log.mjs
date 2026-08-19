#!/usr/bin/env node
/**
 * 魔芋 AI 错误日志工具 — 交互式菜单
 *
 * 用法:
 *   node moyu-log.mjs
 */
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initDb, insertLogs, queryDb, statsDb,
  login, fetchLogs, printSummary,
} from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const rl = readline.createInterface({ input, output });

async function ask(prompt, defaultValue = '') {
  const suffix = defaultValue ? ` (默认 ${defaultValue})` : '';
  const answer = (await rl.question(`${prompt}${suffix}: `)).trim();
  return answer === '' ? defaultValue : answer;
}

function separator() {
  console.log('─'.repeat(50));
}

async function collectFilters(includeHours = true) {
  const hours = includeHours ? Number(await ask('时间范围 (小时)', '24')) : 0;
  const status = await ask('按 HTTP 状态码筛选 (留空跳过)');
  const model = await ask('按模型名称筛选 (留空跳过)');
  const channel = await ask('按渠道 ID 筛选 (留空跳过)');
  return { hours, status, model, channel };
}

async function actionFetch() {
  console.log('\n[获取最新错误日志]');
  const filters = await collectFilters();
  try {
    const session = await login();
    const { logs, total } = await fetchLogs(session, filters);
    printSummary(logs, total);

    const db = initDb();
    const inserted = insertLogs(db, logs);
    const skipped = logs.length - inserted;
    const totalRows = db.prepare('SELECT COUNT(*) as cnt FROM error_logs').get().cnt;
    db.close();
    console.log(`\n数据库: 新增 ${inserted} 条，跳过 ${skipped} 条重复 (库中共 ${totalRows} 条)`);
  } catch (err) {
    console.error(`错误: ${err.message}`);
  }
}

async function actionQuery() {
  console.log('\n[查询数据库记录]');
  const filters = await collectFilters();
  const limit = Number(await ask('显示条数', '20'));
  queryDb({ ...filters, limit });
}

async function actionStats() {
  console.log('\n[数据库统计]');
  const filters = await collectFilters();
  statsDb(filters);
}

async function actionExport() {
  console.log('\n[导出 JSON 文件]');
  const filters = await collectFilters();
  const out = await ask('导出文件名', `request_log_${new Date().toISOString().slice(0, 10)}.json`);
  try {
    const session = await login();
    const { logs, total, startTs, endTs } = await fetchLogs(session, filters);
    const dataDir = resolve(__dirname, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      resolve(dataDir, out),
      JSON.stringify({
        total,
        fetched: logs.length,
        query: {
          hours: filters.hours,
          http_status: filters.status,
          model_name: filters.model,
          channel_id: filters.channel,
          page: 1,
          page_size: 100,
          start_timestamp: startTs,
          end_timestamp: endTs,
        },
        logs,
      }, null, 2),
      'utf-8'
    );
    console.log(`已导出 ${logs.length} 条到 data/${out}`);
  } catch (err) {
    console.error(`错误: ${err.message}`);
  }
}

async function main() {
  while (true) {
    separator();
    console.log('魔芋 AI 错误日志工具\n');
    console.log('请选择操作:');
    console.log('  1. 获取最新错误日志 (从 API 拉取并存入数据库)');
    console.log('  2. 查询数据库记录');
    console.log('  3. 数据库统计');
    console.log('  4. 导出 JSON 文件');
    console.log('  0. 退出');
    separator();

    const choice = await rl.question('\n> ');

    if (choice === '0') {
      console.log('再见');
      rl.close();
      return;
    }

    switch (choice) {
      case '1': await actionFetch(); break;
      case '2': await actionQuery(); break;
      case '3': await actionStats(); break;
      case '4': await actionExport(); break;
      default: console.log('无效选择，请输入 0-4'); break;
    }

    await rl.question('\n按回车返回主菜单...');
  }
}

main().catch(err => {
  console.error('错误:', err.message);
  rl.close();
  process.exit(1);
});
