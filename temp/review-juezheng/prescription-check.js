const fs = require('fs');
const dir = 'D:/project/2026/moliu/temp/book-review/juezheng-0827-rewrite20';
// 药方一致性:跨章枚举三块五处方的成分与价格
const files = fs.readdirSync(dir).filter(f => /^\d{3}\.txt$/.test(f)).sort();
for (const f of files) {
  const t = fs.readFileSync(dir + '/' + f, 'utf8');
  if (/三块五|三块五毛/.test(t)) {
    // 抓含价格成分的句子
    const sents = t.split(/(?<=[。！？])/).filter(s => /(苦楝|石灰|花椒|川椒|烟叶|陈醋|米醋|老醋)/.test(s) && /[一二两三毛块元]|[0-9一二三四五六七八九十]+毛/.test(s));
    if (sents.length) {
      console.log('== ' + f + ' ==');
      sents.slice(0, 3).forEach(s => console.log('  ' + s.trim().slice(0, 120)));
    }
  }
}
