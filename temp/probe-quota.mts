import { resolveContinueWriteRealConfig } from '../src/renderer/src/services/writing/__tests__/continueWriteRealConfig';

/** 最小请求：只看厂商是否放行（额度/限流），不评估输出能力 */
const cfg = resolveContinueWriteRealConfig();
const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  },
  body: JSON.stringify({
    model: cfg.model,
    stream: false,
    messages: [{ role: 'user', content: '回复"ok"两个字' }],
  }),
});
const body = await res.text();
console.log(`${cfg.model} @ ${cfg.baseUrl}`);
console.log(`status=${res.status} | cors=${res.headers.get('access-control-allow-origin') ?? '-'}`);
console.log(body.slice(0, 220));
