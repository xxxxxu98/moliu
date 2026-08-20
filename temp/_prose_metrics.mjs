import fs from 'node:fs';

const dir = 'D:/project/2026/moliu/temp/ai-traces/';
const traceDir = fs
  .readdirSync(dir)
  .filter((f) => /storyflow-provider-1787039781123-ch\d+-\d+\.jsonl$/.test(f));

// group by chapter, order by mtime
const byCh = new Map();
for (const f of traceDir) {
  const ch = Number(f.match(/ch(\d+)/)[1]);
  if (!byCh.has(ch)) byCh.set(ch, []);
  byCh.get(ch).push({ f, mtime: fs.statSync(dir + f).mtimeMs });
}

const parasOf = (resp) => {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.paragraphs)) return resp.paragraphs;
  if (resp && typeof resp.paragraphs === 'string' && resp.paragraphs.length > 50)
    return resp.paragraphs.split(',');
  return null;
};

const out = [];
const allCh = [];
for (const [ch, files] of [...byCh.entries()].sort((a, b) => a[0] - b[0])) {
  // take last draft of last file = final prose
  let last = null;
  let draftCount = 0;
  for (const { f } of files.sort((a, b) => a.mtime - b.mtime)) {
    for (const l of fs.readFileSync(dir + f, 'utf8').split('\n').filter(Boolean)) {
      const j = JSON.parse(l);
      if (j.purpose !== 'scene-draft') continue;
      draftCount++;
      let resp = j.response;
      if (typeof resp === 'string') {
        try {
          resp = JSON.parse(resp);
        } catch {}
      }
      const p = parasOf(resp);
      if (p && p.join('').length > 500) last = p;
    }
  }
  if (!last) continue;
  const lens = last.map((p) => p.length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  const cv = sd / mean;
  const full = last.join('');
  const dialogue = last.filter((p) => /[“」]/.test(p)).length;
  const ellipsis = (full.match(/……/g) || []).length;
  const dash = (full.match(/——/g) || []).length;
  const nums = (full.match(/[0-9一二两三四五六七八九十百千万]+[石两斤里丈尺步日年月时]/g) || []).slice(0, 40);
  allCh.push({ ch, drafts: draftCount, paras: lens.length, chars: full.length, cv, dialogue, ellipsis, dash, nums });
  out.push(
    `ch${ch}: 稿数${draftCount} 段落${lens.length} 总字${full.length} 均段长${mean.toFixed(0)} 段长CV=${cv.toFixed(2)} 对话段${dialogue}(${((dialogue / lens.length) * 100).toFixed(0)}%) 省略号${ellipsis} 破折号${dash}`
  );
  out.push(`  数字提及: ${nums.join(' | ')}`);
}
fs.writeFileSync('D:/project/2026/moliu/temp/_prose_metrics.txt', out.join('\n'), 'utf8');
console.log('chapters analyzed:', allCh.length);
