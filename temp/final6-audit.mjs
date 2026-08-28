// 收官审计:final6 triage 报告关键签名统计 + 记忆死亡登记抽检
import fs from 'node:fs';

const report = fs.readFileSync('temp/storyflow-triage/latest.md', 'utf8');
const lines = report.split('\n');
const red = lines.filter(l => l.startsWith('| 红'));
const yellow = lines.filter(l => l.startsWith('| 黄'));
const count = re => (report.match(new RegExp(re, 'g')) || []).length;

console.log('红签条数:', red.length);
for (const l of red) console.log(' ', l.slice(0, 160));
console.log('黄签条数:', yellow.length);
console.log('dead-resurrection 提及:', count('dead-resurrection'));
console.log('reader.chapter-score-low:', count('chapter-score-low'));
console.log('reader.continuity:', count('reader.continuity'));
console.log('quote未闭合(quality.review-other带引号):', count('对话引号未闭合'));

// 记忆层命运抽检:死亡/下狱行 vs 后续活动
const dir = 'temp/storyflow-matrix-agif100ch-final6/provider-1787039781123';
const f = fs.readdirSync(dir).find(x => x.includes('project-store'));
const p = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).projects[0];
const memories = p.chapterMemories || [];
const fateRows = [];
for (const m of memories) {
  for (const c of m.characterStateChanges || []) {
    if (['死亡', '下狱', '定罪', '驾崩'].includes(c.state)) {
      fateRows.push({ ch: m.chapterIndex + 1, name: c.characterName, state: c.state });
    }
  }
}
console.log('\n命运级登记行:', JSON.stringify(fateRows));
// 主角是谁(第一个角色)与其状态
const hero = (p.characters || [])[0];
console.log('主角:', hero?.name, 'status=', JSON.stringify(hero?.status ?? hero?.attributes?.status ?? '无'));
