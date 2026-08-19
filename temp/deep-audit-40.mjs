import { readFileSync, readdirSync } from 'node:fs';

for (const pid of ['provider-1787044972770', 'provider-1787039781123']) {
  console.log('======', pid);
  const dir = `temp/storyflow-matrix/${pid}/prose`;
  const chapters = readdirSync(dir).filter(f => /^ch\d+\.txt$/.test(f)).sort().slice(0, 40);
  const prose = chapters.map(f => readFileSync(`${dir}/${f}`, 'utf8'));

  // 开章套路分类
  const openTypes = { env: 0, action: 0, other: 0 };
  const envOpenings = [];
  prose.forEach((t, i) => {
    const first = (t.split(/\r?\n/).find(p => p.trim()) || '').trim();
    const isEnv = /^(深夜|深夜的|清晨|晨|夜|午时|黄昏|破晓|黎明|正午|秋|寒|风|雨|光|烈|月)/.test(first)
      || (/[的地]/.test(first.slice(0, 6)) && /(内|里|上|中|深处)/.test(first.slice(0, 12)) && !/[“”]/.test(first.slice(0, 6)));
    if (isEnv) { openTypes.env += 1; envOpenings.push(i + 1); }
    else openTypes.action += 1;
  });
  console.log('开章: 环境/氛围起手', openTypes.env, '| 动作/对话起手', openTypes.action);
  console.log('  环境起手章:', envOpenings.join(','));

  // 跨章重复 5-gram（≥8 章）
  const gramMap = new Map();
  prose.forEach((t, i) => {
    const clean = t.replace(/[\r\n“”"]/g, '');
    const seen = new Set();
    for (let j = 0; j + 5 <= clean.length; j++) {
      const g = clean.slice(j, j + 5);
      if (/[，。！？；：、\s]/.test(g)) continue;
      if (!seen.has(g)) {
        seen.add(g);
        if (!gramMap.has(g)) gramMap.set(g, new Set());
        gramMap.get(g).add(i);
      }
    }
  });
  const repeated = [...gramMap.entries()].filter(([, set]) => set.size >= 8)
    .sort((a, b) => b[1].size - a[1].size).slice(0, 15);
  repeated.forEach(([g, set]) => console.log(' ', set.size + '章:', g));
}
