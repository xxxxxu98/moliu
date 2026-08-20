import fs from 'node:fs';
const dir = 'D:/project/2026/moliu/temp/ai-traces/';
const runs = [
  ['storyflow-provider-1787039781123-ch5-1787207329967.jsonl', 5],
  ['storyflow-provider-1787039781123-ch5-1787207505731.jsonl', 5],
];
for (const [f, seq] of runs) {
  for (const l of fs.readFileSync(dir + f, 'utf8').split('\n').filter(Boolean)) {
    const j = JSON.parse(l);
    if (j.seq === seq && j.purpose === 'scene-draft') {
      let r = j.response;
      if (typeof r === 'string') {
        try { r = JSON.parse(r); } catch {}
      }
      const txt = r.paragraphs.join('');
      const n = (txt.match(/齐王/g) || []).length;
      console.log(f.slice(-20), 'chars=' + txt.length, '齐王出现', n, '次');
      const re = /.{0,20}齐王.{0,20}/g;
      let m;
      while ((m = re.exec(txt))) console.log('  ctx:', m[0]);
    }
  }
}
