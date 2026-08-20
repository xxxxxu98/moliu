import fs from 'node:fs';
for (const ch of [1, 2, 9]) {
  const s = fs.readFileSync(`D:/project/2026/moliu/temp/_ch${ch}_prose.txt`, 'utf8');
  const curly = (s.match(/[\u201C\u201D]/g) || []).length;
  const straight = (s.match(/"/g) || []).length;
  console.log(`ch${ch}: curly=${curly} straight=${straight}`);
}
