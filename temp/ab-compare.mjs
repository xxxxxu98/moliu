// A/B 验收对比:读两份 summary + agent trace,产出对比指标(一次性脚本)
// 用法:node temp/ab-compare.mjs [agent后缀,默认 ab-agent]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const agentSuffix = process.argv[2] ?? 'ab-agent';
const base = JSON.parse(readFileSync('temp/storyflow.closed-loop.ab-base.summary.json', 'utf8'));
const agent = JSON.parse(readFileSync(`temp/storyflow.closed-loop.${agentSuffix}.summary.json`, 'utf8'));

function stats(s, label) {
  const b = s.batch ?? [];
  const accepted = b.filter(x => x.accepted).length;
  const attemptsOver1 = b.filter(x => (x.attempts ?? 1) > 1).length;
  const rewrites = b.reduce((t, x) => t + (x.rewriteRounds ?? 0), 0);
  const firstPass = b.filter(x => (x.attempts ?? 1) === 1 && !(x.rewriteRounds)).length;
  const paraCv = b.reduce((t, x) => t + (x.paraCv ?? 0), 0) / Math.max(1, b.length);
  const words = b.reduce((t, x) => t + (x.words ?? 0), 0) / Math.max(1, b.length);
  const cat = {};
  for (const x of b) {
    for (const g of x.gateIssues ?? []) {
      const key = `${g.category}:${g.severity}`;
      cat[key] = (cat[key] ?? 0) + 1;
    }
  }
  console.log(`--- ${label} ---`);
  console.log(`章数=${b.length} 接受=${accepted} 未接受=${b.filter(x => !x.accepted).map(x => x.ch)}`);
  console.log(`首过率=${(firstPass / Math.max(1, b.length)).toFixed(3)} 重写章=${attemptsOver1} 重写轮合计=${rewrites}`);
  console.log(`paraCv均值=${paraCv.toFixed(3)} 均字数=${Math.round(words)}`);
  console.log(`gateIssues=${JSON.stringify(cat)}`);
  const rm = s.repairMetrics;
  if (rm) console.log(`repairMetrics=首过${rm.firstPassRate} 重写轮均=${rm.averageRewriteRounds} pipelineAttempts=${rm.pipelineAttempts}`);
  const rm2 = s.runtimeMetrics;
  if (rm2) console.log(`请求数=${JSON.stringify(rm2.requestCountsByPurpose)} p50=${rm2.latencyP50Ms} p95=${rm2.latencyP95Ms}`);
  const re = s.readerEvaluation?.metrics;
  if (re) console.log(`读者:章均=${re.chapterAverage} 中位=${re.chapterMedian} 最低=${re.chapterMinimum} 开三均=${re.openingThreeAverage} 不追读=${re.continueReadingNoCount}`);
  else console.log('读者评审:无(超时路径未跑)');
  return b;
}

const baseBatch = stats(base, '基线 ab-base(无agent)');
const agentBatch = stats(agent, `实验组 ${agentSuffix}(agent检索开)`);

// 前 80 章同窗口对比(基线在 ch81 熔断)
function windowStats(batch, label, n) {
  const w = batch.slice(0, n);
  const firstPass = w.filter(x => (x.attempts ?? 1) === 1 && !(x.rewriteRounds)).length;
  const paraCv = w.reduce((t, x) => t + (x.paraCv ?? 0), 0) / Math.max(1, w.length);
  const words = w.reduce((t, x) => t + (x.words ?? 0), 0) / Math.max(1, w.length);
  console.log(`[${label} 前${n}章] 首过率=${(firstPass / n).toFixed(3)} paraCv=${paraCv.toFixed(3)} 均字数=${Math.round(words)}`);
}
console.log('--- 同窗口(前80章) ---');
windowStats(baseBatch, 'base', 80);
windowStats(agentBatch, 'agent', 80);

// agent 检索回合统计(本轮时间窗内的 longform-agent trace)
const cutoff = statSync(`temp/storyflow.closed-loop.${agentSuffix}.outline.json`).mtimeMs;
const files = readdirSync('temp/ai-traces')
  .filter(f => f.startsWith('longform-agent-'))
  .map(f => ({ f, m: statSync(join('temp/ai-traces', f)).mtimeMs }))
  .filter(x => x.m > cutoff)
  .sort((a, b) => a.m - b.m);
let runs = 0, finishes = 0, rounds = 0, tools = 0, ms = 0;
const byTool = {};
const finishReasons = {};
for (const { f } of files) {
  const lines = readFileSync(join('temp/ai-traces', f), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const s = lines.find(l => l.schemaName === 'AgentResearchSummary');
  if (!s?.response?.stats) continue;
  runs += 1;
  const st = s.response.stats;
  finishes += st.finishReason === 'model-finish' ? 1 : 0;
  rounds += st.rounds;
  tools += st.toolCalls;
  ms += st.ms;
  finishReasons[st.finishReason] = (finishReasons[st.finishReason] ?? 0) + 1;
  for (const [k, v] of Object.entries(st.byTool ?? {})) byTool[k] = (byTool[k] ?? 0) + v;
}
console.log('--- agent 检索回合(ab-agent 全程) ---');
console.log(`章数=${runs} model-finish=${finishes} 降级率=${((runs - finishes) / Math.max(1, runs) * 100).toFixed(1)}%`);
console.log(`平均轮数=${(rounds / Math.max(1, runs)).toFixed(1)} 平均工具调用=${(tools / Math.max(1, runs)).toFixed(1)} 平均耗时=${Math.round(ms / Math.max(1, runs))}ms`);
console.log(`finishReason=${JSON.stringify(finishReasons)}`);
console.log(`byTool=${JSON.stringify(byTool)}`);
