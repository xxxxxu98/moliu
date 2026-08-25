import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const idx = JSON.parse(readFileSync('temp/storyflow-scenario-matrix/index.json', 'utf8'));
console.log('生成:', idx.generatedAt);
const tot = { red: 0, yellow: 0, readerSum: 0, readerN: 0, fpSum: 0, rw: 0, min: 0 };
for (const r of idx.results) {
  const j = JSON.parse(readFileSync(join('temp', 'storyflow-scenario-matrix', r.scenarioId, 'triage', 'latest.json'), 'utf8'));
  const p = j.providers[0];
  const sigs = p.signatures || [];
  const red = sigs.filter(s => s.severity === 'red').length;
  const yellow = sigs.filter(s => s.severity === 'yellow').length;
  const rm = p.repairMetrics || {};
  const rd = p.readerMetrics || p.reader || {};
  const ravg = rd.chapterAverage;
  tot.red += red; tot.yellow += yellow;
  tot.fpSum += (rm.firstPassRate || 0); tot.rw += (rm.totalRewriteRounds || 0); tot.min += (p.wallMinutes || 0);
  if (typeof ravg === 'number') { tot.readerSum += ravg; tot.readerN++; }
  console.log([r.scenarioId, p.verdict, `红${red}`, `黄${yellow}`, `首过${Math.round((rm.firstPassRate || 0) * 100)}%`, `重写${rm.totalRewriteRounds || 0}`, ravg !== undefined ? `读者${ravg}` : '', `${p.wallMinutes}min`, JSON.stringify(Object.keys(p))].join(' | '));
}
console.log('--- 合计: 红签名', tot.red, '| 黄签名', tot.yellow, '| 平均首过', `${Math.round((tot.fpSum / 8) * 100)}%`, '| 总重写轮', tot.rw, '| 总耗时', `${tot.min}min`, '| 读者均分', tot.readerN ? (tot.readerSum / tot.readerN).toFixed(1) : '?');
