#!/usr/bin/env node
/**
 * 命运矛盾 AI 裁决（书审 agent 工具，2026-09-02 agent 化重构配套）。
 *
 * 定位：triage 的 fate.contradiction-candidate（台账终端命运 × 后文提及）只是
 * 「出题人」；回忆性提及 / 剧情解释（假死、越狱、翻案）/ 真复活的语义终审归 AI。
 * 本脚本把每条候选的证据包（台账命运句 + 各提及章的命中句窗口）喂给模型，
 * 逐条裁决并产出带原文引用的结论，供书审 Findings 直接引用。
 *
 * 用法：
 *   node .agents/skills/storyflow-release-loop/scripts/fate-adjudicate.mjs \
 *     <matrix目录>/<providerId>/<xxx.project-store.json> [--limit 8] [--out 自定义输出路径]
 *
 * 模型通道：读 temp/continue-write.real.config.json 的 providerId，
 * 再从 %APPDATA%/moliu/moliu-settings.json 取 baseUrl/apiKey/model（openai 兼容）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecipheriv, scryptSync } from 'node:crypto';

// App 设置里的 apiKey 为机器绑定 AES-256-GCM 密文（与
// src/renderer/src/services/writing/__tests__/continueWriteRealConfig.ts
// 的 decryptStoredApiKey 同算法）——冒烟 harness 会解密，脚本直读必须同样解密，
// 否则密文当明文发出去就是 403 token_rejected。
function decryptStoredApiKey(apiKey) {
  if (!apiKey) return '';
  const parts = apiKey.split(':');
  if (parts.length !== 3) return apiKey;
  try {
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
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(parts[2], 'base64', 'utf8') + decipher.final('utf8');
  } catch {
    return apiKey;
  }
}

const args = process.argv.slice(2);
const storeArg = args.find(a => !a.startsWith('--'));
if (!storeArg) {
  console.error('用法: node fate-adjudicate.mjs <project-store.json 路径> [--limit N] [--out 路径]');
  process.exit(2);
}
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 8 : 8;
const outIdx = args.indexOf('--out');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const storePath = resolve(storeArg);
if (!existsSync(storePath)) {
  console.error(`store 不存在: ${storePath}`);
  process.exit(2);
}

// ---------- 台账候选(与 triage 同逻辑,独立实现保持脚本自包含) ----------
const store = JSON.parse(readFileSync(storePath, 'utf8'));
const proj = Array.isArray(store.projects)
  ? store.projects[0]
  : (store.projects ? Object.values(store.projects)[0] : store);
const rosterSet = new Set(
  (proj.characters ?? []).map(c => (c?.name || '').trim()).filter(n => n.length >= 2 && n.length <= 8)
);
// 终态值域与提取合同（FactExtractor 契约 7/11）的 value 枚举保持一致：
// 逆向族（死亡/驾崩/下狱/定罪/去职）与逆转族（获释/复职/平反）都会改写台账终态，
// 矛盾检测取最新一条命运记录后看后文是否矛盾提及
const TERMINAL_FATES = new Set(['死亡', '驾崩', '下狱', '定罪', '去职', '获释', '复职', '平反', '越狱']);
const memories = [...(proj.chapterMemories ?? [])].sort(
  (a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0)
);
const chapters = (proj.chapters ?? [])
  .filter(ch => ch?.content && ch.content.trim())
  .map(ch => ({ n: (ch.orderIndex ?? 0) + 1, title: ch.title ?? '', text: ch.content }))
  .sort((a, b) => a.n - b.n);

const fateAt = new Map();
const fateEvidence = new Map();
// 死亡族单独跟踪（取最早一条）：只看「最新终态」会被后续轻态顶掉——
// 2026-09-12 g38f 200 章 S1 实证：严开礼 ch180 死亡入账、ch196「下狱」覆盖，
// 终态视图只剩「下狱@196」，真复活问题（死亡后 12 章活体）从未被送裁。
// 死亡不可逆：有死亡条目的角色一律按死亡裁，终态候选让位。
const DEATH_FATES = new Set(['死亡', '驾崩']);
const deathAt = new Map();
const deathEvidence = new Map();
for (const m of memories) {
  for (const change of m?.characterStateChanges ?? []) {
    const name = String(change?.characterName || '').trim();
    if (name.length < 2 || name.length > 8 || !rosterSet.has(name)) continue;
    if (!TERMINAL_FATES.has(change.state)) continue;
    // chapterIndex 即 1 基章号（ChapterMemory 类型约定，两条写入路径均传章号）
    const chapter = m.chapterIndex ?? 0;
    if (DEATH_FATES.has(change.state)) {
      const prevDeath = deathAt.get(name);
      if (!prevDeath || chapter < prevDeath.chapter) {
        deathAt.set(name, { name, state: change.state, chapter });
        deathEvidence.set(name, String(change?.detail || '').slice(0, 120));
      }
    }
    const prev = fateAt.get(name);
    if (!prev || chapter > prev.chapter) {
      fateAt.set(name, { name, state: change.state, chapter });
      fateEvidence.set(name, String(change?.detail || '').slice(0, 120));
    }
  }
}

function hitSentences(text, name) {
  const sentences = text.split(/(?<=[。！？])/);
  return sentences.filter(s => s.includes(name)).map(s => s.trim().slice(0, 160));
}

const candidates = [];
for (const fate of fateAt.values()) {
  // 死亡在册的角色跳过终态候选：其「下狱/获释」等后续终态是死亡矛盾的下游
  // 噪声，按死亡条目裁决才是正确问题
  if (deathAt.has(fate.name)) continue;
  const mentions = [];
  for (const ch of chapters) {
    if (ch.n <= fate.chapter) continue;
    const hits = hitSentences(ch.text, fate.name);
    if (hits.length) mentions.push({ chapter: ch.n, title: ch.title, sentences: hits.slice(0, 2) });
  }
  if (mentions.length) {
    candidates.push({ ...fate, ledgerEvidence: fateEvidence.get(fate.name) ?? '', mentions });
  }
}
for (const fate of deathAt.values()) {
  const mentions = [];
  for (const ch of chapters) {
    if (ch.n <= fate.chapter) continue;
    const hits = hitSentences(ch.text, fate.name);
    if (hits.length) mentions.push({ chapter: ch.n, title: ch.title, sentences: hits.slice(0, 2) });
  }
  if (mentions.length) {
    candidates.push({ ...fate, ledgerEvidence: deathEvidence.get(fate.name) ?? '', mentions, deathEntry: true });
  }
}
candidates.sort((a, b) => b.mentions.length - a.mentions.length);
const selected = candidates.slice(0, limit);

console.log(`[fate-adjudicate] 台账终端命运 ${fateAt.size} 个（死亡族 ${deathAt.size} 个优先裁），矛盾候选 ${candidates.length} 条，本轮裁决 ${selected.length} 条`);

// ---------- 模型通道 ----------
const cfgPath = resolve(repoRoot, 'temp/continue-write.real.config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const settings = JSON.parse(
  readFileSync(join(process.env.APPDATA || '', 'moliu', 'moliu-settings.json'), 'utf8')
);
const provider = (settings.aiProviders ?? []).find(p => p.id === cfg.providerId);
if (!provider?.baseUrl || !provider?.apiKey) {
  console.error(`厂商配置不完整: providerId=${cfg.providerId}`);
  process.exit(2);
}

async function chatJSON(system, user) {
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${decryptStoredApiKey(provider.apiKey)}` },
    body: JSON.stringify({
      model: provider.modelName ?? provider.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`AI 未返回 JSON: ${text.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

const SYSTEM = [
  '你是网文连续性审查的终审裁决者。输入：某角色的台账终端命运（死亡/驾崩，含证据句）与其后各章的命中句。',
  '判定该角色后文出现属于哪一类：',
  'real-resurrection = 真复活：无任何剧情解释，角色以活体在场/行动/说话（S1 连续性断裂）；',
  'flashback = 回忆/追述/他人转述旧事，不是活体；',
  'explained = 有明确剧情解释（假死、诈死、越狱、翻案平反、救活、囚中指挥等）且与前文自洽；',
  'ledger-error = 台账死亡入账本身可疑（原句是威胁/传闻/预言等非既成事实）。',
  '只输出一个 JSON 对象：{"verdict":"real-resurrection|flashback|explained|ledger-error","confidence":0-1,"explanation":"两三句理由","quotes":["关键原文引用"]}',
].join('\n');

const verdicts = [];
for (const c of selected) {
  const evidencePack = [
    `角色：${c.name}`,
    `台账命运：第${c.chapter}章 ${c.state}（入账证据：${c.ledgerEvidence || '（无 detail）'}）`,
    '后文命中：',
    ...c.mentions.slice(0, 6).map(
      m => `第${m.chapter}章《${m.title.replace(/^第\d+章\s*/, '')}》：${m.sentences.join(' ／ ')}`
    ),
  ].join('\n');
  try {
    const v = await chatJSON(SYSTEM, evidencePack);
    verdicts.push({ ...c, verdict: v.verdict ?? 'unknown', confidence: v.confidence ?? null, explanation: v.explanation ?? '', quotes: v.quotes ?? [] });
    console.log(`  ${c.name} @第${c.chapter}章${c.state} → ${v.verdict} (${v.confidence ?? '?'}) ${c.mentions.length} 章命中`);
  } catch (e) {
    console.error(`  ${c.name} 裁决失败: ${e.message}`);
    verdicts.push({ ...c, verdict: 'error', explanation: e.message, quotes: [] });
  }
}

const realOnes = verdicts.filter(v => v.verdict === 'real-resurrection');
const out = {
  store: storePath,
  generatedAt: new Date().toISOString(),
  candidatesTotal: candidates.length,
  adjudicated: verdicts.length,
  realResurrections: realOnes.length,
  verdicts,
};
const outPath = outIdx >= 0
  ? resolve(args[outIdx + 1])
  : resolve(repoRoot, `temp/fate-adjudication/adjudication-${new Date().toISOString().slice(5, 10)}.json`);
mkdirSync(join(outPath, '..'), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');
console.log(`[fate-adjudicate] 完成：真复活 ${realOnes.length}/${verdicts.length}，报告 → ${outPath}`);
if (realOnes.length > 0) {
  for (const r of realOnes) console.log(`  S1 ${r.name} @第${r.chapter}章${r.state}：${r.explanation.slice(0, 100)}`);
}
