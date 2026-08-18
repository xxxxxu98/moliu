import { readFileSync } from 'node:fs';

for (const pid of ['provider-1787044972770', 'provider-1787039781123']) {
  console.log('======', pid);
  for (let ch = 1; ch <= 5; ch++) {
    const t = readFileSync(`temp/storyflow-matrix/${pid}/prose/ch0${ch}.txt`, 'utf8');
    const paras = t.split(/\r?\n/).filter(p => p.trim());
    const lens = paras.map(p => p.length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length);
    const cv = sd / avg;
    const vague = (t.match(/(他|她|他们|对方|那人|此人)/g) || []).length;
    const notAB = (t.match(/不是[^，。；]{1,12}[，]?而是/g) || []).length;
    const simile = (t.match(/(像是|仿佛|宛如|犹如)/g) || []).length;
    const total = t.length;
    console.log(
      'ch' + ch,
      'paras:' + paras.length,
      'avgLen:' + avg.toFixed(0),
      'cv:' + cv.toFixed(2),
      'vague/千字:' + (vague / total * 1000).toFixed(1),
      '不是A而是B:' + notAB,
      '明喻:' + simile,
    );
  }
}
