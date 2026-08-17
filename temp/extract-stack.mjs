// 提取 luna rerun 日志中 Error: aborted 前的调用栈帧
import { readFileSync } from 'node:fs';
const t = readFileSync('temp/storyflow-luna-rerun.log', 'utf8');
const idx = t.indexOf('Error: aborted');
const before = t.slice(Math.max(0, idx - 4000), Math.min(t.length, idx + 1500));
const lines = before.split(/\r?\n/).filter(l => /at |❯|generator|stepper|stream|Retry|runWith|callStep/.test(l));
for (const l of lines.slice(-18)) console.log(l.trim().slice(0, 190));
