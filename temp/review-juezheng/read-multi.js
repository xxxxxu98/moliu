const fs = require('fs');
const path = require('path');
const temp = 'D:/project/2026/moliu/temp';
// multi summary
try {
  const m = JSON.parse(fs.readFileSync(path.join(temp, 'continue-write.real.multi.summary.json'), 'utf8'));
  console.log('== MULTI ==');
  console.log('book:', m.book, '| model:', m.model, '| mode:', m.mode, '| from:', m.fromChapter, 'count:', m.chapterCount);
  for (const c of m.chapters || []) {
    console.log(`ch${c.chapterNumber}: ${c.wordCount}字 success=${c.success} words=${c.wordCount}/${c.targetWordCount}`);
  }
} catch (e) { console.log('multi summary 读取失败:', e.message); }
// 章级 summary
const chs = fs.readdirSync(temp).filter(f => /^continue-write\.real\.ch\d+\.summary\.json$/.test(f));
console.log('== 章级summary数:', chs.length, '==');
