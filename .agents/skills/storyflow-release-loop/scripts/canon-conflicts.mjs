#!/usr/bin/env node
/**
 * 口径正典冲突扫描（L3，2026-09-24 CANON-CALIBER-PROPOSAL 第三层）：
 *   node .agents/skills/storyflow-release-loop/scripts/canon-conflicts.mjs <project-store.json>
 *
 * 从章记忆台账确定性扫描「全书口径多值并存」清单，输出 S2 候选给书审：
 *   - 头衔多值：同一角色多次 title 入账且值不同（主角官品漂穿全书形态）
 *   - 命运往返：同一角色 status 在可逆终态间往返 ≥2 次（下狱→获释→下狱…，
 *     甄别对象——合法剧情可往返，输出供 AI 书审结合正文定罪）
 *   - 排行冲突：identity 文本含互斥排行词（大皇子 vs 四皇子等）
 * 数据源 chapterMemories 的 title/status delta（提取层漏登的形态本扫描天然
 * 看不见——那是 L1 复检闸的职责边界，本工具只审「已入账的自相矛盾」）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [storeArg] = process.argv.slice(2);
if (!storeArg) {
  console.error('用法: node canon-conflicts.mjs <project-store.json>');
  process.exit(1);
}
const root = JSON.parse(readFileSync(resolve(process.cwd(), storeArg), 'utf8'));
const project = Array.isArray(root.projects)
  ? root.projects[0]
  : Object.values(root.projects ?? {})[0] ?? root;
const mems = [...(project.chapterMemories ?? [])].sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));

const titleLedger = new Map(); // name -> [{ch, val}]
const statusLedger = new Map();
const RANK_WORDS = /([一二三四五六七八九十])皇子/g;
const identityRank = new Map(); // name -> Set(排行词)

for (const m of mems) {
  for (const c of m.characterStateChanges ?? []) {
    const name = String(c.characterName ?? '').trim();
    if (!name) continue;
    const state = String(c.state ?? '').trim();
    if (!state) continue;
    if (state.startsWith('头衔:') || state.startsWith('头衔：')) {
      const val = state.replace(/^头衔[:：]/, '').trim();
      if (!titleLedger.has(name)) titleLedger.set(name, []);
      titleLedger.get(name).push({ ch: m.chapterIndex, val });
    } else if (/^(死亡|驾崩|下狱|获释|越狱|去职|复职|定罪|平反|保释|假死|揭晓)/.test(state)) {
      if (!statusLedger.has(name)) statusLedger.set(name, []);
      statusLedger.get(name).push({ ch: m.chapterIndex, val: state });
    }
  }
}
for (const ch of project.characters ?? []) {
  const name = String(ch.name ?? '').trim();
  const desc = String(ch.description ?? '');
  if (!name || !desc) continue;
  for (const m of desc.matchAll(RANK_WORDS)) {
    if (!identityRank.has(name)) identityRank.set(name, new Set());
    identityRank.get(name).add(m[1]);
  }
}

const out = [];
out.push(`== 口径正典冲突扫描（${mems.length} 章记忆，${titleLedger.size} 角色有头衔账，${statusLedger.size} 角色有命运账）==`);
let s2Count = 0;
for (const [name, ledger] of titleLedger) {
  const unique = [...new Set(ledger.map(x => x.val))];
  if (unique.length > 1) {
    s2Count += 1;
    out.push(`[头衔多值][S2候选] ${name}：${unique.length} 个头衔并存`);
    for (const x of ledger) out.push(`    第${x.ch}章 ${x.val}`);
  }
}
for (const [name, ledger] of statusLedger) {
  const switches = ledger.length - 1;
  if (switches >= 3) {
    s2Count += 1;
    out.push(`[命运往返][S2候选] ${name}：${switches} 次状态切换`);
    out.push(`    ${ledger.map(x => `${x.ch}章:${x.val}`).join(' → ')}`);
  }
}
for (const [name, ranks] of identityRank) {
  if (ranks.size > 1) {
    s2Count += 1;
    out.push(`[排行冲突][S2候选] ${name}：角色卡同时含 ${[...ranks].join('/')} 皇子排行`);
  }
}
if (s2Count === 0) out.push('（零冲突：已入账口径单一）');
out.push(`== S2 候选合计：${s2Count} ==`);
const text = out.join('\n');
console.log(text);
import { writeFileSync } from 'node:fs';
const outPath = resolve(process.cwd(), 'temp/canon-conflicts-report.txt');
writeFileSync(outPath, text, 'utf8');
console.log(`\n报告已写入 ${outPath}`);
