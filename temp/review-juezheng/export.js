const fs = require('fs');
const p = require('./project.json');
const dir = __dirname + '/';

let out = '';
p.chapters.forEach((c, i) => {
  out += '=== ' + c.title + ' (orderIndex=' + i + ') ===\n';
  const o = c.outline;
  if (o) {
    if (typeof o === 'string') {
      out += o + '\n';
    } else {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string') out += k + ': ' + v + '\n';
        else if (Array.isArray(v)) out += k + ': ' + v.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' | ') + '\n';
        else if (v != null) out += k + ': ' + JSON.stringify(v) + '\n';
      }
    }
  } else out += '(无outline)\n';
  out += 'plotSummary: ' + (c.plotSummary || '(无)') + '\n\n';
});
fs.writeFileSync(dir + 'outlines.txt', out, 'utf8');

p.chapters.slice(0, 10).forEach((c, i) => {
  fs.writeFileSync(dir + String(i + 1).padStart(2, '0') + '.txt', c.title + '\n\n' + (c.content || ''), 'utf8');
});

console.log('outline field type:', typeof p.chapters[0].outline);
console.log('done. outline size:', out.length);
