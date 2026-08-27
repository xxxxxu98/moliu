// 验证:这本书的章节按 SCENE_BREAK_PATTERN 切出来是几个场景块
// 模拟 LegacyProjectMigrator.splitChapter + normalizeWebnovelParagraphs 后的正文
const fs = require('fs');
const dir = 'D:/project/2026/moliu/temp/review-juezheng';
const SCENE_BREAK_PATTERN = /\n\s*(?:---+|={3,}|#{1,3}\s*场景[^\n]*|\*{3,})\s*\n|\n{3,}/u;
for (let i = 1; i <= 10; i++) {
  const f = String(i).padStart(2, '0') + '.txt';
  let content = fs.readFileSync(dir + '/' + f, 'utf8');
  content = content.split(/\n\n/).slice(2).join('\n\n'); // 去掉导出时加的标题行
  const parts = content.split(SCENE_BREAK_PATTERN).map(p => p.trim()).filter(Boolean);
  console.log('第' + i + '章: ' + parts.length + ' 个场景块, 各块字数: ' + parts.map(p => p.length).join(','));
}
