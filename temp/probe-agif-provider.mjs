import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const settingsPath = join(process.env.APPDATA || '', 'moliu', 'moliu-settings.json');
if (!existsSync(settingsPath)) {
  console.error('settings not found: ' + settingsPath);
  process.exit(1);
}
const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
const providers = raw.aiProviders ?? [];
for (const p of providers) {
  const model = p.modelName || '';
  if (/gemini/i.test(model)) {
    console.log(
      JSON.stringify(
        {
          id: p.id,
          name: p.name,
          model,
          baseUrl: p.baseUrl || p.baseURL || '',
          enabled: p.enabled !== false,
          hasKey: !!p.apiKey,
        },
        null,
        0,
      ),
    );
  }
}
// 顺带确认 reader judge 环境变量默认回退项
for (const p of providers) {
  if (p.enabled === false) continue;
  console.log(`[enabled-list] ${p.id} name=${p.name || '(no-name)'} model=${p.modelName}`);
}
