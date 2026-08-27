const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/supplement.ts', 'utf8');
const ls = t.split(/\r?\n/);
const out = [];
for (let i = 0; i < ls.length; i++) {
  if (/runSupplementRounds|function.*[Ss]upplement|prose\s*\+|\+\s*supplement|trim\(\)/.test(ls[i])) {
    for (let j = Math.max(0, i - 2); j <= Math.min(ls.length - 1, i + 6); j++) {
      if (ls[j].trim()) out.push((j + 1) + ': ' + ls[j].trim().slice(0, 140));
    }
    out.push('-----');
  }
}
console.log(out.slice(0, 80).join('\n'));
