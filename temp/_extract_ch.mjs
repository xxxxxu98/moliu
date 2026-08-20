import fs from 'node:fs';

const dir = 'D:/project/2026/moliu/temp/ai-traces/';
const chArg = process.argv[2];
const pat = chArg
  ? new RegExp(`storyflow-provider-1787039781123-ch${chArg}-`)
  : /storyflow-provider-1787039781123-ch\d+-/;
const files = fs
  .readdirSync(dir)
  .filter((f) => pat.test(f))
  .sort((a, b) => Number(a.match(/ch(\d+)/)[1]) - Number(b.match(/ch(\d+)/)[1]));

const report = [];
for (const f of files) {
  const ch = f.match(/ch(\d+)/)[1];
  const lines = fs.readFileSync(dir + f, 'utf8').split('\n').filter(Boolean);
  report.push('######## ' + f + ' ########');
  const drafts = [];
  for (const l of lines) {
    const j = JSON.parse(l);
    let resp = j.response;
    if (typeof resp === 'string') {
      try {
        resp = JSON.parse(resp);
      } catch {}
    }
    report.push('--- seq' + j.seq + ' ' + j.purpose + ' ' + j.ms + 'ms');
    if (j.purpose === 'scene-draft' && resp) {
      let paras = null;
      if (Array.isArray(resp.paragraphs)) paras = resp.paragraphs;
      else if (typeof resp.paragraphs === 'string' && resp.paragraphs.length > 50)
        paras = resp.paragraphs.split(',');
      if (paras && paras.length) {
        drafts.push(paras);
        const full = paras.join('');
        report.push('  [draft] 段落' + paras.length + ' 字数' + full.length);
        report.push('  开头:' + paras[0].slice(0, 150));
        report.push('  结尾:' + paras[paras.length - 1].slice(-150));
      } else {
        report.push('  [draft resp keys] ' + Object.keys(resp).join(','));
        report.push('  [draft resp str] ' + String(JSON.stringify(resp)).slice(0, 400));
      }
    }
    if (j.purpose === 'chapter-judge' && resp) {
      report.push('  [judge] ' + JSON.stringify(resp).slice(0, 800));
    }
    if (j.purpose === 'fact-extraction' && resp) {
      report.push('  [fact] keys:' + Object.keys(resp).join(','));
    }
  }
  if (drafts.length) {
    fs.writeFileSync(
      `D:/project/2026/moliu/temp/_ch${ch}_prose.txt`,
      drafts[drafts.length - 1].join('\n\n'),
      'utf8'
    );
  }
}
fs.writeFileSync('D:/project/2026/moliu/temp/_ch_report.txt', report.join('\n'), 'utf8');
console.log('done', files.length, 'files');
