import fs from 'node:fs';
const dir = 'D:/project/2026/moliu/temp/ai-traces/';
const targets = [8, 9, 11];
for (const ch of targets) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => new RegExp(`storyflow-provider-1787039781123-ch${ch}-`).test(f))
    .sort((a, b) => fs.statSync(dir + a).mtimeMs - fs.statSync(dir + b).mtimeMs);
  // last draft of last file
  let last = null;
  for (const f of files) {
    for (const l of fs.readFileSync(dir + f, 'utf8').split('\n').filter(Boolean)) {
      const j = JSON.parse(l);
      if (j.purpose !== 'scene-draft') continue;
      let r = j.response;
      if (typeof r === 'string') { try { r = JSON.parse(r); } catch {} }
      if (r && Array.isArray(r.paragraphs) && r.paragraphs.join('').length > 500) last = r;
      else if (Array.isArray(r) && r.join('').length > 500) last = { paragraphs: r };
    }
  }
  if (!last) { console.log(`ch${ch}: no prose`); continue; }
  const txt = last.paragraphs.join('\n');
  console.log(`\n===== ch${ch} (${txt.length}字) =====`);
  console.log('开头: ' + txt.slice(0, 180));
  console.log('结尾: ' + txt.slice(-180));
}
