// luna 网关快速探针：3 次间隔 20s，任一 200 即恢复
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

for (let i = 1; i <= 3; i += 1) {
  const t0 = Date.now();
  try {
    const res = await fetch(prov.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: prov.modelName, messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(30000),
    });
    console.log(`probe${i}: status=${res.status} ms=${Date.now() - t0}`);
    if (res.status === 200) { console.log('RECOVERED'); process.exit(0); }
  } catch (e) {
    console.log(`probe${i}: FAIL ${e.cause?.message ?? e.message}`);
  }
  if (i < 3) await new Promise(r => setTimeout(r, 20_000));
}
process.exit(1);
