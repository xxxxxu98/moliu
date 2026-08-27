const fs = require('fs');
const path = require('path');
const settingsPath = path.join(process.env.APPDATA, 'moliu', 'moliu-settings.json');
const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const provs = s.aiProviders || [];
for (const p of provs) {
  if (/gemini|反重力|agif/i.test(p.name + ' ' + (p.baseUrl || ''))) {
    console.log(JSON.stringify({ id: p.id, name: p.name, baseUrl: p.baseUrl, models: p.models, defaultModel: p.defaultModel, enabled: p.enabled }, null, 1));
  }
}
console.log('--- settings.defaultModel?', s.settings && (s.settings.defaultModel || s.settings.defaultProviderId || s.settings.activeProviderId));
