// A/B 验收补充:从正文算 paraCv(同口径) + 从日志提质量签名 + 墙钟
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function paraCvOf(text) {
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paras.length < 2) return null;
  const lens = paras.map(p => p.replace(/\s/g, '').length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (mean === 0) return null;
  const variance = lens.reduce((t, l) => t + (l - mean) ** 2, 0) / lens.length;
  return Math.sqrt(variance) / mean;
}

function proseStats(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
  const cvs = [];
  let words = 0;
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    words += text.replace(/\s/g, '').length;
    const cv = paraCvOf(text);
    if (cv !== null) cvs.push({ f, cv });
  }
  cvs.sort((a, b) => a.cv - b.cv);
  const mean = cvs.reduce((t, x) => t + x.cv, 0) / cvs.length;
  const low = cvs.filter(x => x.cv < 0.15).length;
  const p25 = cvs[Math.floor(cvs.length * 0.25)]?.cv ?? 0;
  const p75 = cvs[Math.floor(cvs.length * 0.75)]?.cv ?? 0;
  console.log(`${dir}: 章文件=${files.length} paraCv均值=${mean.toFixed(3)} P25=${p25.toFixed(3)} P75=${p75.toFixed(3)} AI腔章(<0.15)=${low} 均字数=${Math.round(words / files.length)}`);
  return { mean, low, n: files.length };
}

console.log('--- paraCv(从正文,同口径) ---');
const b = proseStats('temp/storyflow.closed-loop.ab-base.prose');
const a = proseStats('temp/storyflow.closed-loop.ab-agent.prose');

console.log('--- 质量签名(从日志) ---');
function signatures(logPath, label) {
  const lines = readFileSync(logPath, 'utf8').split('\n').map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
  const sig = {};
  let halt = null;
  for (const line of lines) {
    let m = line.match(/审核未通过，开始第 \d+\/\d+ 次 (\w+) 重写/);
    if (m) { sig[`rewrite-${m[1]}`] = (sig[`rewrite-${m[1]}`] ?? 0) + 1; }
    m = line.match(/第\s*(\d+)\s*章持久错误（([\w-]+)，第 (\d)\/3 次）/);
    if (m) {
      const key = `persistent-${m[2]}`;
      sig[key] = (sig[key] ?? 0) + 1;
      if (m[3] === '3') halt = m[1];
    }
    if (line.includes('结束批量')) sig['batch-halt'] = (sig['batch-halt'] ?? 0) + 1;
    m = line.match(/(未履约节点|未在角色表登记|对话引号未闭合|节点原句照抄|连续碎段过多|字数严重超限|字数严重不足)/);
    if (m) sig[`sig-${m[1]}`] = (sig[`sig-${m[1]}`] ?? 0) + 1;
  }
  console.log(`${label}: ${JSON.stringify(sig)} ${halt ? `熔断章=ch${halt}` : ''}`);
}
signatures('C:/Users/许保良/.zcode/cli/exec/sess_7bce7d99-6192-4c12-8ee2-34c329f11462/call_3178a88d3a5f42a092957312-stdout.log', 'base');
signatures('C:/Users/许保良/.zcode/cli/exec/sess_7bce7d99-6192-4c12-8ee2-34c329f11462/call_147d65f405744f89ad8aef80-stdout.log', 'agent');

console.log('--- 墙钟 ---');
const baseSummary = JSON.parse(readFileSync('temp/storyflow.closed-loop.ab-base.summary.json', 'utf8'));
console.log('base phaseTimings=', JSON.stringify(baseSummary.phaseTimings));
const agentSummary = JSON.parse(readFileSync('temp/storyflow.closed-loop.ab-agent.summary.json', 'utf8'));
console.log('agent phaseTimings=', JSON.stringify(agentSummary.phaseTimings ?? null), 'totalMs=', agentSummary.totalMs ?? null);
