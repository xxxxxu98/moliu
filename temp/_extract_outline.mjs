import fs from 'node:fs';

const dir = 'D:/project/2026/moliu/temp/ai-traces/';
const files = fs
  .readdirSync(dir)
  .filter((f) => /storyflow-provider-1787039781123-outline/.test(f))
  .sort((a, b) => (fs.statSync(dir + a).mtimeMs - fs.statSync(dir + b).mtimeMs));

const out = [];
for (const f of files) {
  const lines = fs.readFileSync(dir + f, 'utf8').split('\n').filter(Boolean);
  out.push('######## ' + f + ' (' + lines.length + ' entries) ########');
  for (const l of lines) {
    const j = JSON.parse(l);
    let resp = j.response;
    if (typeof resp === 'string') {
      try {
        resp = JSON.parse(resp);
      } catch {}
    }
    out.push(
      '--- seq' + j.seq + ' ' + j.purpose + ' ' + (j.schemaName || '') + ' ' + j.ms + 'ms'
    );
    if (resp && typeof resp === 'object') {
      out.push('  keys: ' + Object.keys(resp).join(',').slice(0, 300));
      // chapter lists
      for (const key of ['chapters', 'chapterOutlines', 'nodes', 'newChapters']) {
        if (Array.isArray(resp[key])) {
          out.push(
            '  ' + key + '[' + resp[key].length + ']: ' +
              resp[key]
                .map((c) => c.chapterNumber || c.number || c.chapter || '')
                .join(',')
                .slice(0, 400)
          );
        }
      }
    } else if (typeof resp === 'string') {
      out.push('  str: ' + resp.slice(0, 200));
    }
  }
}
fs.writeFileSync('D:/project/2026/moliu/temp/_outline_report.txt', out.join('\n'), 'utf8');
console.log('done', files.length, 'files');
