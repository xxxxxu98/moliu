import fs from 'node:fs';

const dir = 'D:/project/2026/moliu/temp/ai-traces/';
const files = fs
  .readdirSync(dir)
  .filter((f) => /storyflow-provider-1787039781123-outline/.test(f))
  .sort((a, b) => fs.statSync(dir + a).mtimeMs - fs.statSync(dir + b).mtimeMs);

const titles = new Map();
for (const f of files) {
  for (const l of fs.readFileSync(dir + f, 'utf8').split('\n').filter(Boolean)) {
    const j = JSON.parse(l);
    const raw = typeof j.response === 'string' ? j.response : JSON.stringify(j.response);
    // match ### 第N章 + 标题
    const re = /###\s*第(\d+)章\s*-?\s*标题[：:]\s*(.+)/g;
    let m;
    while ((m = re.exec(raw))) titles.set(Number(m[1]), m[2].trim());
  }
}
const nums = [...titles.keys()].sort((a, b) => a - b);
console.log('章节数:', nums.length);
console.log('范围:', nums[0], '-', nums[nums.length - 1]);
const missing = [];
for (let i = nums[0]; i <= nums[nums.length - 1]; i++) if (!titles.has(i)) missing.push(i);
console.log('缺号:', missing.length ? missing.join(',') : '无');
for (const n of nums) console.log(n + ': ' + titles.get(n));
fs.writeFileSync(
  'D:/project/2026/moliu/temp/_outline_titles.txt',
  nums.map((n) => n + ': ' + titles.get(n)).join('\n'),
  'utf8'
);
