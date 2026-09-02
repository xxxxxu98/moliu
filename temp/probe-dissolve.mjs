import { readFileSync, writeFileSync } from 'node:fs';
import { scanProseDeadResurrection } from '../scripts/storyflow-triage.mjs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const out = [];

// 1) 溶解检查:ch158+ 含顾成化且命中解除词的段落
const RESURRECT_RELEASE = /平反|翻案|无罪释放|赦免|大赦|越狱|劫狱|起复|官复原职|重新起用|假死|诈死|并未.{0,4}死(?!心)|苏醒|保释|取保|候勘|待勘|戴罪/;
const chapters = [];
for (const ch of proj?.chapters ?? []) {
  if (ch?.content && ch.content.trim()) chapters.push({ n: (ch.orderIndex ?? 0) + 1, text: ch.content });
}
chapters.sort((a, b) => a.n - b.n);
for (const ch of chapters) {
  if (ch.n <= 157) continue;
  for (const para of ch.text.split(/\n+/)) {
    if (para.includes('顾成化') && RESURRECT_RELEASE.test(para)) {
      const m = para.match(RESURRECT_RELEASE);
      out.push(`溶解嫌疑 ch${ch.n}: [${m[0]}] ${para.slice(Math.max(0, para.indexOf('顾成化') - 40), para.indexOf('顾成化') + 60).replace(/\s+/g, ' ')}`);
    }
  }
}

// 2) 直接调扫描函数,看顾成化是否在任何命中里
const roster = (proj?.characters ?? []).map((c) => (c?.name || '').trim()).filter((n) => n.length >= 2 && n.length <= 8);
const res = scanProseDeadResurrection(chapters, roster);
out.push('\n扫描命中: ' + JSON.stringify(res, null, 1));

writeFileSync('temp/r2a-dissolve-probe.txt', out.join('\n'), 'utf8');
console.log('written');
