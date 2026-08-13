import { resolveContinueWriteRealConfig } from '../src/renderer/src/services/writing/__tests__/continueWriteRealConfig';

/**
 * 探测厂商配置的实际输出上限：要求一次吐出大段 markdown，
 * 观察 content / reasoning_content 字数与 finish_reason。
 */
const SYSTEM = '你是中文长篇网文大纲师。只输出 markdown，不要任何解释或前后缀。';
const USER = [
  '为"废柴皇子靠系统翻盘"写前 30 章的单章蓝图。',
  '每章严格用以下结构，不得省略、不得合并、不得只写部分章节：',
  '### 第N章',
  '- 标题：6-16字',
  '- CBN：8-25字章首钩子',
  '- CPNs：2-3个推进节点，中文分号分隔',
  '- CEN：8-25字章尾悬念',
  '- 正文摘要：不少于 80 字',
  '必须完整输出第 1 章到第 30 章。',
].join('\n');

const cfg = resolveContinueWriteRealConfig();
console.log(`provider=${cfg.providerId} | model=${cfg.model} | baseUrl=${cfg.baseUrl}`);

const started = Date.now();
const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    Authorization: `Bearer ${cfg.apiKey}`,
  },
  body: JSON.stringify({
    model: cfg.model,
    stream: true,
    temperature: 0.7,
    top_p: 0.9,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
    ],
  }),
});

if (!res.ok) {
  console.log('status', res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}

const raw = await res.text();
let contentChars = 0;
let reasoningChars = 0;
const finishReasons: Record<string, number> = {};
for (const line of raw.split('\n')) {
  if (!line.startsWith('data:')) continue;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') continue;
  try {
    const choice = JSON.parse(payload)?.choices?.[0] ?? {};
    const delta = choice.delta ?? {};
    if (typeof delta.content === 'string') contentChars += delta.content.length;
    if (typeof delta.reasoning_content === 'string') {
      reasoningChars += delta.reasoning_content.length;
    }
    if (choice.finish_reason) {
      finishReasons[choice.finish_reason] = (finishReasons[choice.finish_reason] ?? 0) + 1;
    }
  } catch {
    /* 半截事件忽略 */
  }
}

console.log(
  `elapsed=${((Date.now() - started) / 1000).toFixed(1)}s | content=${contentChars} | reasoning=${reasoningChars} | finish=${JSON.stringify(finishReasons)}`
);
