// 一次性探针：确认 better-sqlite3 已按 Electron ABI 编译（smoke 需要真实 SQLite）
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');
const code =
  'try { require("better-sqlite3"); console.log("sqlite OK, modules=" + process.versions.modules); }' +
  ' catch (e) { console.log("FAIL: " + e.message.slice(0, 200)); }';
const r = spawnSync(electron, ['-e', code], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
});
console.log(r.stdout?.trim(), r.stderr?.trim());
