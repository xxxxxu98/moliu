// 阻塞 N 分钟后打印监控摘要(供长周期跑批轮询)
import fs from 'node:fs';

const minutes = Number(process.argv[2] || 10);
await new Promise((r) => setTimeout(r, minutes * 60_000));

const dir = 'temp/ai-traces';
const PROV = 'provider-1787039781123';
const chFiles = fs.readdirSync(dir).filter((x) => x.includes(PROV) && /-ch\d+-/.test(x));
let geo = 0;
for (const f of chFiles) {
  for (const l of fs.readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n')) {
    try { if (String(JSON.parse(l).response || '').includes('User location')) geo++; } catch {}
  }
}
const lastN = Math.max(...chFiles.map((x) => Number(x.match(/-ch(\d+)-/)[1])));
const newest = chFiles.map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs })).sort((a, b) => b.m - a.m)[0];
const ageMin = ((Date.now() - newest.m) / 60000).toFixed(1);
console.log(`[watch] 章数=${chFiles.length} 最新=ch${lastN} 最新文件年龄=${ageMin}min geo-block响应=${geo}`);
console.log(ageMin > 8 ? '[watch] ⚠ 最新章节文件超8分钟未更新,可能 stalled/长窗口' : '[watch] 正常推进');
