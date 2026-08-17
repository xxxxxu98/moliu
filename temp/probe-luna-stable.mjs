// 稳定性门禁：连续 3 次长生成探针全过才算网关稳定，避免抢跑后中途又塌
// 通过 exit 0；任一失败立即 exit 1（由外层等待下一轮）
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

async function heavyProbe(round) {
  const t0 = Date.now();
  try {
    const res = await fetch(prov.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: prov.modelName,
        messages: [{ role: 'user', content: `写一段450字左右的中文小说场景片段，编号${round}。` }],
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let genChars = 0;
    if (res.status === 200) {
      try { genChars = (JSON.parse(text).choices?.[0]?.message?.content ?? '').length; } catch { /* ignore */ }
    }
    const ok = res.status === 200 && genChars >= 300;
    console.log(`round${round}: status=${res.status} ms=${Date.now() - t0} gen=${genChars} ${ok ? 'OK' : 'BAD'}`);
    return ok;
  } catch (e) {
    console.log(`round${round}: FAIL ms=${Date.now() - t0}: ${e.cause?.message ?? e.message}`);
    return false;
  }
}

for (let round = 1; round <= 3; round += 1) {
  const ok = await heavyProbe(round);
  if (!ok) process.exit(1);
  if (round < 3) await new Promise(r => setTimeout(r, 10_000));
}
console.log('STABLE');
process.exit(0);
