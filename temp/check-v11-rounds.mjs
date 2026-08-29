// v1.1 检索单轮耗时分析:定位轮数下降但总耗时上升的原因(一次性)
import { readFileSync, readdirSync, statSync } from 'node:fs';

const cutoff = statSync('temp/storyflow.closed-loop.agent-v11.outline.json').mtimeMs;
const files = readdirSync('temp/ai-traces')
  .filter(f => f.startsWith('longform-agent-'))
  .map(f => 'temp/ai-traces/' + f)
  .filter(f => statSync(f).mtimeMs > cutoff)
  .sort();
for (const f of files) {
  const lines = readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const rounds = lines.filter(l => l.schemaName === 'AgentResearchRound' && l.schemaName && l.ms > 0 && l.prompt !== '');
  console.log('=== ' + f.split('/').pop());
  for (const r of rounds) {
    let calls = '?';
    if (typeof r.rawResponse === 'string') {
      try { calls = String((JSON.parse(r.rawResponse).calls ?? []).length); } catch { calls = 'finish?'; }
    }
    console.log(`  seq=${r.seq} ms=${r.ms} calls=${calls} 输入prompt=${(r.prompt || '').length}字 输出=${(r.rawResponse || '').length}字`);
  }
}
