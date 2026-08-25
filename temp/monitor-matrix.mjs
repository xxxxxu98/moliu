// 8题材矩阵监控：矩阵stdout摘要 + 最新run.log尾部 + 阶段summary + trace活性
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STDOUT_LOG = process.argv[2];
const now = Date.now();

const line = (s = '') => console.log(String(s).length > 220 ? String(s).slice(0, 220) + '…' : s);

// 1. 矩阵 stdout：场景级进度行
if (STDOUT_LOG && existsSync(STDOUT_LOG)) {
  const out = readFileSync(STDOUT_LOG, 'utf8');
  const markers = out
    .split(/\r?\n/)
    .filter(l => /\[storyflow-scenarios\]|exit=|判定|红签名|启动|矩阵计划|ERROR|失败|完成 \d+ 个场景/.test(l));
  line('== 矩阵进度 ==');
  for (const m of markers.slice(-20)) line(m);
} else {
  line('== 矩阵 stdout 不可读 ==');
}

// 2. 找最新 run.log（按 mtime）
const smRoot = join(ROOT, 'temp', 'storyflow-scenario-matrix');
let newest = null;
if (existsSync(smRoot)) {
  for (const scen of readdirSync(smRoot)) {
    const p = join(smRoot, scen);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const prov of readdirSync(p)) {
      const rl = join(p, prov, 'run.log');
      if (existsSync(rl)) {
        const m = statSync(rl).mtimeMs;
        if (!newest || m > newest.m) newest = { path: rl, m, scen };
      }
    }
  }
}
if (newest) {
  line(`\n== 当前 run.log: ${newest.scen} (更新于 ${Math.round((now - newest.m) / 1000)}s 前) ==`);
  const tail = readFileSync(newest.path, 'utf8').split(/\r?\n/).filter(Boolean).slice(-12);
  for (const t of tail) line(t);
} else {
  line('\n== 尚无 run.log ==');
}

// 3. 阶段性 summary（temp 根目录实时产物）
const tmp = join(ROOT, 'temp');
for (const f of readdirSync(tmp)) {
  if (/^storyflow\.closed-loop\..*\.summary\.json$/.test(f)) {
    try {
      const j = JSON.parse(readFileSync(join(tmp, f), 'utf8'));
      const upd = j.updatedAt || j.generatedAt || '';
      const age = upd ? Math.round((now - Date.parse(upd)) / 1000) : '?';
      line(`\n== summary ${f} == updatedAt=${age}s前 completedChapters=${j.completedChapters ?? '?'} 状态=${j.status ?? j.phase ?? '?'}`);
    } catch (e) {
      line(`summary 解析失败 ${f}: ${e.message}`);
    }
  }
}

// 4. trace 活性（最近5分钟内有无新写入）
const traceDir = join(ROOT, 'temp', 'ai-traces');
if (existsSync(traceDir)) {
  let fresh = 0;
  for (const f of readdirSync(traceDir)) {
    try {
      if (now - statSync(join(traceDir, f)).mtimeMs < 300000) fresh++;
    } catch {}
  }
  line(`\n== trace 活性: 最近5分钟更新 ${fresh} 个文件 ==`);
}
