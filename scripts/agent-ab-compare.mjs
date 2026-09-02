// A/B 验收对比：读两份 storyflow summary + agent trace，产出对比指标（一次性脚本，不进生产）
// 用法：node scripts/agent-ab-compare.mjs [实验组后缀=ab-agent] [基线后缀=ab-base] [--window=80]
// 维度：章级接受/首过/重写、门禁类别、读者评审、检索回合（kind 缺省）、改稿回合（kind=writer）。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter(arg => arg.startsWith('--'))
    .map(arg => {
      const [key, value] = arg.slice(2).split('=');
      return [key, value ?? '1'];
    })
);
const agentSuffix = positional[0] ?? 'ab-agent';
const baseSuffix = positional[1] ?? 'ab-base';
const windowSize = Number(flags.window ?? 80);

function loadSummary(suffix) {
  const path = `temp/storyflow.closed-loop.${suffix}.summary.json`;
  if (!existsSync(path)) {
    console.error(`缺少 summary：${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
const base = loadSummary(baseSuffix);
const agent = loadSummary(agentSuffix);

function pct(numerator, denominator) {
  return `${((numerator / Math.max(1, denominator)) * 100).toFixed(1)}%`;
}

function stats(summary, label) {
  const batch = summary.batch ?? [];
  const accepted = batch.filter(x => x.accepted).length;
  const attemptsOver1 = batch.filter(x => (x.attempts ?? 1) > 1).length;
  const rewrites = batch.reduce((t, x) => t + (x.rewriteRounds ?? 0), 0);
  const firstPass = batch.filter(x => (x.attempts ?? 1) === 1 && !x.rewriteRounds).length;
  const paraCv = batch.reduce((t, x) => t + (x.paraCv ?? 0), 0) / Math.max(1, batch.length);
  const words = batch.reduce((t, x) => t + (x.words ?? 0), 0) / Math.max(1, batch.length);
  const categories = {};
  for (const x of batch) {
    for (const g of x.gateIssues ?? []) {
      const key = `${g.category}:${g.severity}`;
      categories[key] = (categories[key] ?? 0) + 1;
    }
  }
  console.log(`--- ${label} ---`);
  console.log(
    `章数=${batch.length} 接受=${accepted} 未接受=${JSON.stringify(batch.filter(x => !x.accepted).map(x => x.ch))}`
  );
  console.log(
    `首过率=${(firstPass / Math.max(1, batch.length)).toFixed(3)} 重写章=${attemptsOver1} 重写轮合计=${rewrites}`
  );
  console.log(`paraCv均值=${paraCv.toFixed(3)} 均字数=${Math.round(words)}`);
  console.log(`gateIssues=${JSON.stringify(categories)}`);
  const repair = summary.repairMetrics;
  if (repair) {
    console.log(
      `repairMetrics=首过${repair.firstPassRate} 重写轮均=${repair.averageRewriteRounds} pipelineAttempts=${repair.pipelineAttempts}`
    );
  }
  const runtime = summary.runtimeMetrics;
  if (runtime) {
    console.log(
      `请求数=${JSON.stringify(runtime.requestCountsByPurpose)} p50=${runtime.latencyP50Ms} p95=${runtime.latencyP95Ms}`
    );
  }
  const reader = summary.readerEvaluation?.metrics;
  if (reader) {
    console.log(
      `读者:章均=${reader.chapterAverage} 中位=${reader.chapterMedian} 最低=${reader.chapterMinimum} 开三均=${reader.openingThreeAverage} 不追读=${reader.continueReadingNoCount}`
    );
  } else {
    console.log('读者评审:无(超时路径未跑)');
  }
  writerStatsFromBatch(batch);
  return batch;
}

/** 改稿回合（summary.batch[].writer，由 storyflowClosedLoopHarness 写入；旧 summary 无此字段时跳过） */
function writerStatsFromBatch(batch) {
  const entries = batch.filter(x => x.writer);
  if (batch.length > 0 && !('writer' in batch[0])) {
    console.log('改稿回合:summary 无 writer 字段(旧格式或 legacy 循环)');
    return;
  }
  const triggered = entries.length;
  const finishes = entries.filter(x => x.writer.finishReason === 'model-finish').length;
  const reverted = entries.filter(x => x.writer.revertedUnchecked).length;
  const acceptedAfterAgent = entries.filter(x => x.accepted).length;
  const checks = entries.reduce((t, x) => t + (x.writer.checksUsed ?? 0), 0);
  const rounds = entries.reduce((t, x) => t + (x.writer.rounds ?? 0), 0);
  const toolCalls = entries.reduce((t, x) => t + (x.writer.toolCalls ?? 0), 0);
  const ms = entries.reduce((t, x) => t + (x.writer.ms ?? 0), 0);
  const byTool = {};
  const finishReasons = {};
  for (const x of entries) {
    finishReasons[x.writer.finishReason] = (finishReasons[x.writer.finishReason] ?? 0) + 1;
    for (const [k, v] of Object.entries(x.writer.byTool ?? {})) byTool[k] = (byTool[k] ?? 0) + v;
  }
  console.log(
    `改稿回合:触发章=${triggered}/${batch.length}(${pct(triggered, batch.length)}) 触发后接受=${acceptedAfterAgent}/${triggered} model-finish=${finishes} 回退未复检=${reverted}`
  );
  if (triggered > 0) {
    console.log(
      `改稿回合:均复检=${(checks / triggered).toFixed(2)} 均轮数=${(rounds / triggered).toFixed(1)} 均工具调用=${(toolCalls / triggered).toFixed(1)} 均耗时=${Math.round(ms / triggered)}ms`
    );
    console.log(`改稿回合:finishReason=${JSON.stringify(finishReasons)} byTool=${JSON.stringify(byTool)}`);
  }
}

const baseBatch = stats(base, `基线 ${baseSuffix}`);
const agentBatch = stats(agent, `实验组 ${agentSuffix}`);

// 同窗口对比（基线可能提前熔断，取共同前 N 章）
function windowStats(batch, label, n) {
  const w = batch.slice(0, n);
  const firstPass = w.filter(x => (x.attempts ?? 1) === 1 && !x.rewriteRounds).length;
  const accepted = w.filter(x => x.accepted).length;
  const paraCv = w.reduce((t, x) => t + (x.paraCv ?? 0), 0) / Math.max(1, w.length);
  const words = w.reduce((t, x) => t + (x.words ?? 0), 0) / Math.max(1, w.length);
  const rewrites = w.reduce((t, x) => t + (x.rewriteRounds ?? 0), 0);
  console.log(
    `[${label} 前${w.length}章] 接受率=${pct(accepted, w.length)} 首过率=${(firstPass / Math.max(1, w.length)).toFixed(3)} 重写轮均=${(rewrites / Math.max(1, w.length)).toFixed(2)} paraCv=${paraCv.toFixed(3)} 均字数=${Math.round(words)}`
  );
}
const commonWindow = Math.min(windowSize, baseBatch.length, agentBatch.length);
console.log(`--- 同窗口(前${commonWindow}章) ---`);
windowStats(baseBatch, baseSuffix, commonWindow);
windowStats(agentBatch, agentSuffix, commonWindow);

// trace 汇总：检索回合（无 kind）与改稿回合（kind=writer）共用同一 trace 文件，按 kind 分流
const outlinePath = `temp/storyflow.closed-loop.${agentSuffix}.outline.json`;
if (!existsSync(outlinePath) || !existsSync('temp/ai-traces')) {
  console.log(`--- agent trace 跳过(缺 ${outlinePath} 或 temp/ai-traces) ---`);
  process.exit(0);
}
const cutoff = statSync(outlinePath).mtimeMs;
const files = readdirSync('temp/ai-traces')
  .filter(f => f.startsWith('longform-agent-'))
  .map(f => ({ f, m: statSync(join('temp/ai-traces', f)).mtimeMs }))
  .filter(x => x.m > cutoff)
  .sort((a, b) => a.m - b.m);

function makeBucket() {
  return { runs: 0, finishes: 0, rounds: 0, tools: 0, ms: 0, byTool: {}, finishReasons: {} };
}
const buckets = { research: makeBucket(), writer: makeBucket() };
for (const { f } of files) {
  const lines = readFileSync(join('temp/ai-traces', f), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
  for (const line of lines) {
    if (line.schemaName !== 'AgentResearchSummary' || !line.response?.stats) continue;
    const bucket = line.response.kind === 'writer' ? buckets.writer : buckets.research;
    const st = line.response.stats;
    bucket.runs += 1;
    bucket.finishes += st.finishReason === 'model-finish' ? 1 : 0;
    bucket.rounds += st.rounds ?? 0;
    bucket.tools += st.toolCalls ?? 0;
    bucket.ms += st.ms ?? 0;
    bucket.finishReasons[st.finishReason] = (bucket.finishReasons[st.finishReason] ?? 0) + 1;
    for (const [k, v] of Object.entries(st.byTool ?? {})) bucket.byTool[k] = (bucket.byTool[k] ?? 0) + v;
  }
}
function printBucket(label, b) {
  console.log(`--- ${label}(${agentSuffix} 全程 trace) ---`);
  console.log(`回合数=${b.runs} model-finish=${b.finishes} 降级率=${pct(b.runs - b.finishes, b.runs)}`);
  console.log(
    `平均轮数=${(b.rounds / Math.max(1, b.runs)).toFixed(1)} 平均工具调用=${(b.tools / Math.max(1, b.runs)).toFixed(1)} 平均耗时=${Math.round(b.ms / Math.max(1, b.runs))}ms`
  );
  console.log(`finishReason=${JSON.stringify(b.finishReasons)}`);
  console.log(`byTool=${JSON.stringify(b.byTool)}`);
}
printBucket('agent 检索回合', buckets.research);
printBucket('agent 改稿回合', buckets.writer);
