// 抽查 v1.1 短程跑的检索统计(一次性)
import { readFileSync, readdirSync, statSync } from 'node:fs';

const cutoff = statSync('temp/storyflow.closed-loop.agent-v11.outline.json').mtimeMs;
const files = readdirSync('temp/ai-traces')
  .filter(f => f.startsWith('longform-agent-'))
  .map(f => ({ f, m: statSync(join2('temp/ai-traces', f)).mtimeMs }))
  .filter(x => x.m > cutoff)
  .sort((a, b) => a.m - b.m);
function join2(a, b) { return a + '/' + b; }
for (const { f } of files) {
  const lines = readFileSync(join2('temp/ai-traces', f), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const s = lines.find(l => l.schemaName === 'AgentResearchSummary');
  if (!s?.response?.stats) continue;
  const st = s.response.stats;
  const batched = lines.filter(
    l => l.schemaName === 'AgentResearchRound' && typeof l.rawResponse === 'string' && l.rawResponse.includes('"calls"')
  ).length;
  console.log(`ch${s.response.chapterNumber} ${st.finishReason} rounds=${st.rounds} tools=${st.toolCalls} ms=${st.ms} 批量轮=${batched}`);
}
