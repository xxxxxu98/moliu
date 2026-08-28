// 回归书占位标签扫描
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/户部核算官：用现代审计整顿朝堂-0828';
const hits = [];
for (let i = 1; i <= 20; i++) {
  const t = readFileSync(join(dir, `${String(i).padStart(3, '0')}.txt`), 'utf8');
  const m = t.match(/[^\n。！？]*(?:派年轻官员|派官员|派老臣|派朝臣|年轻御史|老总管)[^\n。！？]*/g);
  if (m) hits.push(`ch${i}: ${m[0].trim().slice(0, 70)}`);
}
writeFileSync('temp/label-scan-report.txt', hits.join('\n') || '(零命中)', 'utf8');
console.log('hits=' + hits.length);
