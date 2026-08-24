// 自动循环监控:统计 provider trace 的章进度、重试、空响应、geo-block
import fs from 'node:fs';

const PROV = 'provider-1787039781123';
const traceDir = 'temp/ai-traces';
const files = fs.readdirSync(traceDir)
  .filter((f) => f.includes(PROV))
  .map((f) => {
    const m = f.match(/^(?:storyflow-provider-\d+-)?(\w+?)(?:-(\d+))?-(\d+)\.jsonl$/);
    const st = fs.statSync(`${traceDir}/${f}`);
    return { f, kind: m ? m[1] : f, ts: Number(m?.[3] || 0), size: st.size, mtime: st.mtimeMs };
  })
  .sort((a, b) => a.ts - b.ts);

const chFiles = files.filter((x) => /^ch\d+$/.test(x.kind));
console.log(`章 trace 数: ${chFiles.length}  最新: ${chFiles.at(-1)?.f || '-'} ${new Date(chFiles.at(-1)?.mtime || 0).toLocaleTimeString()}`);

let geo = 0, empty = 0, judgeIssues = 0, totalReq = 0;
const perCh = [];
for (const cf of chFiles) {
  const lines = fs.readFileSync(`${traceDir}/${cf.f}`, 'utf8').trim().split('\n');
  const stats = { ch: cf.kind, reqs: lines.length, judge: 0, rewrite: 0 };
  for (const l of lines) {
    let j; try { j = JSON.parse(l); } catch { continue; }
    totalReq++;
    if (j.purpose === 'chapter-judge') stats.judge++;
    if (/scene-draft/.test(j.purpose) && Number(j.seq) > 1) stats.rewrite++;
    const r = j.response;
    const isEmpty = r === undefined || r === null || (typeof r === 'string' && r.length === 0);
    if (isEmpty) empty++;
    if (j.purpose === 'chapter-judge' && j.response && Array.isArray(j.response.issues) && j.response.issues.length) judgeIssues++;
  }
  perCh.push(stats);
}
console.log(`总请求: ${totalReq}  空响应: ${empty}  geo-block: ${geo}  judge带issues: ${judgeIssues}`);
const multiJudge = perCh.filter((s) => s.judge > 1);
console.log(`多轮审核章: ${multiJudge.length ? multiJudge.map((s) => `${s.ch}(judge×${s.judge})`).join(' ') : '无'}`);

// run.log 尾部
try {
  const rl = fs.readFileSync(`temp/storyflow-matrix/${PROV}/run.log`, 'utf8').trim().split('\n');
  console.log(`run.log ${rl.length} 行, 尾3行:`);
  console.log(rl.slice(-3).map((x) => '  ' + x).join('\n'));
} catch { console.log('run.log 不可读'); }
