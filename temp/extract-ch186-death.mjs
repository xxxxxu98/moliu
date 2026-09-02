import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/社畜官场生存指南：从九品刀笔吏到摄政权臣-0902';
const ch186 = readFileSync(join(dir, '186.txt'), 'utf8');
const out = [];

// 找 ch186 中所有死亡类动词的上下文
const verbs = /(斩|杀|毙|伏诛|处决|枭首|首级|人头|战死|阵亡|气绝|毙命|尸体|尸首|身亡|殒命|人头落地|头颅)/g;
let m;
const seen = new Set();
while ((m = verbs.exec(ch186)) !== null) {
  const start = Math.max(0, m.index - 80);
  const ctx = ch186.slice(start, m.index + 80).replace(/\n/g, ' ');
  const key = ctx.slice(60, 100);
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(`[${m[1]}] ...${ctx}...`);
}

// 章记忆里 ch186 的 characterStateChanges(死亡提取的证据源)
try {
  const store = JSON.parse(readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'));
  out.push('\n===== project-store 顶层键 =====');
  out.push(Object.keys(store).join(','));
  const cms = store.chapterMemories || store.chapters;
  if (Array.isArray(cms)) {
    const c186 = cms.find((c) => (c.chapterNo ?? c.chapter ?? c.no) === 186) || cms[185];
    out.push('ch186 memory keys: ' + Object.keys(c186 || {}).join(','));
    out.push('ch186 characterStateChanges: ' + JSON.stringify(c186?.characterStateChanges ?? c186?.stateChanges ?? null).slice(0, 1500));
    // 全书扫描:所有把林铁锋置死的记忆
    const hits = [];
    for (const c of cms) {
      const s = JSON.stringify(c?.characterStateChanges ?? c?.stateChanges ?? '');
      if (s.includes('林铁锋') && /(死|亡|殒|毙|诛|斩)/.test(s)) hits.push(`ch${c.chapterNo ?? c.chapter ?? c.no}: ` + s.slice(0, 300));
    }
    out.push('\n===== 全书章记忆中林铁锋+死亡 词面命中 =====');
    out.push(hits.join('\n') || '(无)');
  } else {
    out.push('chapterMemories 不是数组: ' + typeof cms);
  }
} catch (e) {
  out.push('store ERR ' + e.message);
}

writeFileSync('temp/r2a-ch186-death-evidence.txt', out.join('\n'), 'utf8');
console.log('written, blocks=' + out.length);
