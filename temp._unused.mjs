import fs from 'node:fs';
const f = 'D:/project/2026/moliu/temp/ai-traces/storyflow-provider-1787039781123-outline-1787206451925.jsonl';
const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
for (const l of lines) {
  const j = JSON.parse(l);
  if (j.seq !== 5) continue; // 前50章启动包
  const raw = typeof j.response === 'string' ? j.response : JSON.stringify(j.response);
  console.log(raw);
}
