const fs = require('fs');
const path = require('path');
const o = fs.readFileSync(path.join(__dirname, 'outlines.txt'), 'utf8');
const blocks = o.split(/=== /).slice(1);
let mm = 0;
const bad = [];
for (let i = 1; i < blocks.length; i++) {
  const prevTitle = blocks[i - 1].split(' ')[0];
  const title = blocks[i].split(' ')[0];
  const prevCEN = ((blocks[i - 1].match(/【CEN】(.+)/) || [])[1] || '').trim();
  const curCBN = ((blocks[i].match(/【CBN】(.+)/) || [])[1] || '').trim();
  if (prevCEN && curCBN) {
    if (prevCEN === curCBN) mm++;
    else bad.push(prevTitle + ' CEN ≠ ' + title + ' CBN\n  CEN: ' + prevCEN + '\n  CBN: ' + curCBN);
  }
}
console.log('CEN(上一章)===CBN(本章) 链式一致: ' + mm + '/' + (blocks.length - 1));
if (bad.length) { console.log('--- 不一致明细 ---'); bad.forEach(x => console.log(x + '\n')); }
