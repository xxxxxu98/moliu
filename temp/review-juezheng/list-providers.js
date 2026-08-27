const fs = require('fs');
const path = require('path');
const settingsPath = path.join(process.env.APPDATA, 'moliu', 'moliu-settings.json');
const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
console.log('顶层键:', Object.keys(s).join(', '));
const candidates = ['providers', 'aiProviders', 'models', 'aiProviders'];
for (const key of Object.keys(s)) {
  const v = s[key];
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && (v[0].name || v[0].id)) {
    console.log(`--- ${key} (${v.length}) ---`);
    for (const p of v.slice(0, 20)) {
      console.log([p.id, p.name, p.model || p.defaultModel || '', p.baseUrl || '', 'enabled=' + (p.enabled ?? '?'), 'isDefault=' + (p.isDefault ?? '?')].join(' | '));
    }
  } else if (typeof v === 'string' && /provider|model/i.test(key)) {
    console.log(key + ' = ' + v);
  }
}
