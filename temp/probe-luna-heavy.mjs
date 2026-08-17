// 长生成探针：小探针 200 不代表网关能扛真实长生成（rerun4 实测 3 分钟内全 503）。
// 本探针要求模型真实产出 ≥400 字，模拟 scene-draft 负载形态。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDecipheriv, scryptSync } from 'node:crypto';

const raw = JSON.parse(readFileSync(join(process.env.APPDATA, 'moliu', 'moliu-settings.json'), 'utf8'));
const prov = (raw.aiProviders || []).find(x => x.id === 'provider-1786812318014');
const parts = prov.apiKey.split(':');
const machineId = [
  process.env.COMPUTERNAME || '',
  process.env.USERNAME || '',
  process.env.USERPROFILE || '',
].join('-');
const key = scryptSync(machineId, 'moliu-ai-providers-v1', 32, {
  N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
});
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
const apiKey = decipher.update(parts[2], 'base64', 'utf8') + decipher.final('utf8');

const t0 = Date.now();
try {
  const res = await fetch(prov.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: prov.modelName,
      messages: [{ role: 'user', content: '写一段450字左右的中文小说场景：县衙账房里，主角深夜核对赈灾粮册，发现一处对不上的数字。' }],
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  const ok = res.status === 200;
  let genChars = 0;
  if (ok) {
    try {
      const j = JSON.parse(text);
      genChars = (j.choices?.[0]?.message?.content ?? '').length;
    } catch { /* ignore */ }
  }
  console.log(`status=${res.status} ms=${Date.now() - t0} 生成=${genChars}字`);
  process.exit(ok && genChars >= 300 ? 0 : 1);
} catch (e) {
  console.log(`FAIL ms=${Date.now() - t0}: ${e.cause?.message ?? e.message}`);
  process.exit(1);
}
