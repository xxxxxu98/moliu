// 一次性探针：验证 opencode zen 的 deepseek-v4-flash 可用（跑长冒烟前的快速健康检查）
import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv, scryptSync } from 'node:crypto';

const PROVIDER_ID = process.argv[2] || 'provider-1785758934445';

function decrypt(apiKey) {
  const parts = apiKey.split(':');
  if (parts.length !== 3) return apiKey;
  const machineId = [
    process.env.COMPUTERNAME || process.env.HOSTNAME || 'default',
    process.env.USERNAME || process.env.USER || 'user',
    process.env.USERPROFILE || process.env.HOME || '/home',
  ].join('-');
  const key = scryptSync(machineId, 'moliu-ai-providers-v1', 32, {
    N: 2 ** 14,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
  return decipher.update(parts[2], 'base64', 'utf8') + decipher.final('utf8');
}

const settings = JSON.parse(
  fs.readFileSync(path.join(process.env.APPDATA, 'moliu', 'moliu-settings.json'), 'utf8')
);
const p = (settings.aiProviders || []).find(x => x.id === PROVIDER_ID);
if (!p) throw new Error('provider not found: ' + PROVIDER_ID);
const apiKey = decrypt(p.apiKey);
console.log('provider', p.id, p.modelName, p.baseUrl, 'keyLen', apiKey.length);

const started = Date.now();
const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: p.modelName,
    messages: [
      { role: 'system', content: '只输出合法 JSON 对象。' },
      { role: 'user', content: '返回 {"ok":true,"n":3} 这样的 JSON。' },
    ],
    response_format: { type: 'json_object' },
  }),
});
const text = await res.text();
console.log('status', res.status, 'ms', Date.now() - started);
console.log(text.slice(0, 800));
