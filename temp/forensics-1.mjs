import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = [];

// ---- B: ch72 全部 trace,找数组形状的 judge 响应 ----
const bDir = 'temp/storyflow-matrix-agif200ch-b/provider-1787039781123';
const bFiles = readdirSync(bDir).filter(f => f.includes('-ch72-')).sort();
out.push(`# B轮 ch72 trace 文件 ${bFiles.length} 个: ${bFiles.join(', ')}`);
for (const f of bFiles) {
  const lines = readFileSync(join(bDir, f), 'utf8').split('\n').filter(Boolean);
  out.push(`\n## ${f} (${lines.length} 行)`);
  for (const line of lines) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const keys = Object.keys(j);
    // 找 judge/审查类行
    const purpose = j.purpose ?? j.callPurpose ?? '';
    const resp = j.response ?? j.parsed ?? j.content;
    let respShape = '';
    if (resp !== undefined && resp !== null) {
      const v = typeof resp === 'string' ? safeJson(resp) : resp;
      respShape = Array.isArray(v) ? `ARRAY(len=${v.length})` : (v && typeof v === 'object' ? `object(keys=${Object.keys(v).slice(0, 6).join('|')})` : typeof v);
    }
    out.push(`- keys=[${keys.join(',')}] purpose=${purpose} respShape=${respShape || 'n/a'}`);
    if (Array.isArray(resp)) {
      out.push(`  ⚠ 数组响应原文(前600字): ${JSON.stringify(resp).slice(0, 600)}`);
    }
    if (typeof resp === 'string') {
      const trimmed = resp.trim();
      if (trimmed.startsWith('[')) out.push(`  ⚠ 字符串响应以[开头(前600字): ${trimmed.slice(0, 600)}`);
    }
    const err = j.error ?? j.errorMessage ?? null;
    if (err) out.push(`  error: ${String(err).slice(0, 300)}`);
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

// ---- A: 脏实体「登场并提供黑市」来源 ----
const aDir = 'temp/storyflow-matrix-agif200ch-a/provider-1787039781123';
const aFiles = readdirSync(aDir);
out.push(`\n\n# A轮 脏实体扫描 「登场并提供黑市」`);
const hits = [];
for (const f of aFiles) {
  if (!f.endsWith('.json') && !f.endsWith('.jsonl')) continue;
  const content = readFileSync(join(aDir, f), 'utf8');
  let idx = content.indexOf('登场并提供黑市');
  let count = 0;
  while (idx !== -1 && count < 3) {
    hits.push({ file: f, ctx: content.slice(Math.max(0, idx - 150), idx + 150) });
    count++;
    idx = content.indexOf('登场并提供黑市', idx + 1);
  }
}
out.push(`命中 ${hits.length} 处(每文件至多取3处)`);
for (const h of hits.slice(0, 12)) {
  out.push(`\n- 文件: ${h.file}\n  上下文: …${h.ctx.replace(/\n/g, ' ')}…`);
}

// A: ch8 的 project-store 里 chapterMemories/角色卡,看实体名单
const psFile = aFiles.find(f => f.includes('.project-store.json'));
if (psFile) {
  const ps = JSON.parse(readFileSync(join(aDir, psFile), 'utf8'));
  out.push(`\n# A轮 project-store 顶层键: ${Object.keys(ps).join(',')}`);
  const entities = ps?.stateSummary?.entities ?? ps?.state?.entities ?? ps?.entities ?? null;
  if (entities) {
    const names = Array.isArray(entities) ? entities.map(e => e.name ?? e.id) : Object.keys(entities);
    out.push(`stateSummary.entities 共${names.length}: ${names.slice(0, 60).join('、')}`);
    const dirty = names.filter(n => typeof n === 'string' && /[登场提供完成携押]|并且|以及/.test(n));
    out.push(`疑似脏实体名: ${JSON.stringify(dirty)}`);
  } else {
    out.push(`未找到 stateSummary.entities,试扫所有 name 字段含「登场」的:`);
    const s = JSON.stringify(ps);
    const re = /"name"\s*:\s*"([^"]{0,30}登场[^"]{0,30})"/g;
    let m; const found = new Set();
    while ((m = re.exec(s)) !== null) found.add(m[1]);
    out.push(`name含登场: ${JSON.stringify([...found])}`);
  }
}

writeFileSync('temp/forensics-1.md', out.join('\n'), 'utf8');
console.log('written temp/forensics-1.md');
