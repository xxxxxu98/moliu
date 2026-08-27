const fs = require('fs');
const old = JSON.parse(fs.readFileSync('D:/project/2026/moliu/temp/book-review/juezheng-0826/metrics.json', 'utf8'));
const nw = JSON.parse(fs.readFileSync('D:/project/2026/moliu/temp/book-review/juezheng-0827-rewrite20/metrics.json', 'utf8'));
const sum = r => Object.values(r.aiWordTotals).reduce((a, b) => a + b, 0);
console.log('基线: ' + old.chapters.length + '章 AI词总量=' + sum(old) + ' 每章=' + (sum(old) / old.chapters.length).toFixed(1));
console.log('本轮: ' + nw.chapters.length + '章 AI词总量=' + sum(nw) + ' 每章=' + (sum(nw) / nw.chapters.length).toFixed(1));
console.log('均章字数: 基线', Math.round(old.chapters.reduce((a, c) => a + c.words, 0) / old.chapters.length), '本轮', Math.round(nw.chapters.reduce((a, c) => a + c.words, 0) / nw.chapters.length));
const cv = nw.chapters.map(c => c.paraCV);
console.log('本轮CV区间: ' + Math.min(...cv) + '-' + Math.max(...cv));
const cvOld = old.chapters.map(c => c.paraCV);
console.log('基线CV区间: ' + Math.min(...cvOld) + '-' + Math.max(...cvOld));
// 引号细节
console.log('本轮引号开/闭抽样:', nw.chapters.slice(0, 5).map(c => c.quoteOpen + '/' + c.quoteClose).join(' '));
