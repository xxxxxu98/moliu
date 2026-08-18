import { readFileSync } from 'node:fs';
const s = readFileSync('temp/storyflow-matrix/provider-1787039781123/prose/ch13.txt', 'utf8');
const curlyOpen = (s.match(/\u201C/g) || []).length;
const curlyClose = (s.match(/\u201D/g) || []).length;
const asciiQuote = (s.match(/"/g) || []).length;
const paras = s.split(/\r?\n/).filter(p => p.trim());
console.log('curly open/close:', curlyOpen, '/', curlyClose, '| ascii quotes:', asciiQuote, '| paras:', paras.length);
paras.slice(0, 8).forEach((p, i) => {
  console.log(i + 1, '|', p.slice(0, 50));
});
