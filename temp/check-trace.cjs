/* 查看最新 storyflow-outline trace 的进展 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join('D:', 'project', '2026', 'moliu', 'temp', 'ai-traces');
const files = fs.readdirSync(dir)
  .filter(f => /^storyflow-outline/.test(f))
  .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (!files.length) {
  console.log('no trace yet');
  process.exit(0);
}
const lines = fs.readFileSync(path.join(dir, files[0].f), 'utf8').trim().split('\n');
console.log(files[0].f, 'entries:', lines.length);
for (const l of lines) {
  const j = JSON.parse(l);
  console.log(j.purpose, '| ms=' + j.ms, '|', j.response ? j.response.length + '字' : 'ERR');
}
