/**
 * 统一实体状态账本（docs/unified-state-ledger.md）·第 2 阶段读侧核心。
 *
 * TS 侧是生产正典实现：buildLedgerFromMemories 把章记忆的字符串协议
 * （命运五态 / 押地:X / 头衔:X / 解除族规范化值）迁移成「实体 × 属性 × 转移」
 * 条目，snapshotAt 按章折叠出状态卡——写手/判官提示词由此拿到单一真相源，
 * 替代「每角色最晚一条原始状态」的旧正典通道（collectFateStatusAnchors）。
 * scripts/state-ledger.mjs 是第 1 阶段影子实现（triage 可观测），两处规则
 * 必须同步改；第 3 阶段写侧契约重构后影子版退役。
 *
 * 状态机语义判定纪律不变：违规/缺口只做候选，终审归 fate-adjudicate；
 * 正则仅用于事件完成体召回（ledger-gap 候选）。
 */
import { readPositiveIntEnv } from '@/utils/env';
import type { ChapterMemory } from '@/types/project';

/** 账本属性：每个属性一条独立时间线（location 第 1 期不启用，§9.2） */
export type LedgerAttribute = 'vital' | 'custody' | 'custodyPlace' | 'office';

/** 转移类别：迁移自现有字符串协议，确定性代码只认枚举（§4.1） */
export type TransitionKind =
  | 'death' | 'faked-death' | 'death-revealed-fake'
  | 'arrest' | 'release' | 'bail' | 'escape' | 'recapture' | 'transfer'
  | 'dismiss' | 'appoint' | 'restore';

export interface LedgerEntry {
  entityId: string;
  attribute: LedgerAttribute;
  value: string;
  /** 1 基章号，全链路唯一口径 */
  fromChapter: number;
  transition: TransitionKind;
  evidence: { chapter: number; quote: string };
  source: 'extractor' | 'adjudicator' | 'migration';
}

export interface LedgerViolation {
  entityId: string;
  attribute: LedgerAttribute;
  fromValue: string | null;
  toValue: string;
  transition: TransitionKind;
  chapter: number;
  note: string;
}

/** 命运五态 → 账本条目映射（定罪是定谳事实，隐含在押，与 CUSTODY_FATES 同口径） */
const FATE_STATE_MAP: Record<string, { attribute: LedgerAttribute; value: string; transition: TransitionKind }> = {
  '死亡': { attribute: 'vital', value: 'dead', transition: 'death' },
  '驾崩': { attribute: 'vital', value: 'dead', transition: 'death' },
  '假死': { attribute: 'vital', value: 'faked-dead', transition: 'faked-death' },
  '下狱': { attribute: 'custody', value: 'held', transition: 'arrest' },
  '定罪': { attribute: 'custody', value: 'held', transition: 'arrest' },
  '越狱': { attribute: 'custody', value: 'fugitive', transition: 'escape' },
  '去职': { attribute: 'office', value: 'none', transition: 'dismiss' },
};

/** 解除族（语义判定在 AI 提取合同，这里只做状态机映射） */
const RELEASE_STATE_MAP: Record<string, { attribute: LedgerAttribute; value: string; transition: TransitionKind }> = {
  '获释': { attribute: 'custody', value: 'free', transition: 'release' },
  '平反': { attribute: 'custody', value: 'free', transition: 'release' },
  '赦免': { attribute: 'custody', value: 'free', transition: 'release' },
  '保释': { attribute: 'custody', value: 'bailed', transition: 'bail' },
  '复职': { attribute: 'office', value: 'restored', transition: 'restore' },
  '复位': { attribute: 'office', value: 'restored', transition: 'restore' },
  '起复': { attribute: 'office', value: 'restored', transition: 'restore' },
};

const CUSTODY_PLACE_PREFIX = '押地:';
const TITLE_PREFIX = '头衔:';
const EMPTY_CUSTODY_PLACE = new Set(['无', '无押地', '暂无', '未知']);

/** 事件完成体召回（ledger-gap 候选网）：正则只召回，是否真缺账交 AI 仲裁 */
const DEATH_COMPLETION_RE = /(枭首|斩立决|人头落地|头颅滚落|当场毙命|气绝身亡|饮鸩(身亡|毙命)|暴毙|伏诛|气绝|洞穿[^。；，]{0,8}喉|割喉|归于死寂|殒命|断了气|咽了气|没了声息|没了气息|再无声息)/;

export function buildLedgerFromMemories(memories: ChapterMemory[]): {
  entries: LedgerEntry[];
  violations: LedgerViolation[];
  gaps: Array<{ chapter: number; anchor: string; preview: string }>;
} {
  const entries: LedgerEntry[] = [];
  // 迁移保真：越狱后的再入押（下狱/定罪）按当前 custody 态记 recapture
  const currentCustody = new Map<string, string>();
  const sorted = [...(memories ?? [])].sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));
  for (const memory of sorted) {
    const chapter = memory.chapterIndex ?? 0;
    for (const change of memory.characterStateChanges ?? []) {
      const name = String(change?.characterName ?? '').trim();
      const state = String(change?.state ?? '').trim();
      const detail = String(change?.detail ?? '').trim();
      if (!name || !state) continue;
      let mapped: { attribute: LedgerAttribute; value: string; transition: TransitionKind } | null = null;
      if (FATE_STATE_MAP[state]) {
        mapped = { ...FATE_STATE_MAP[state] };
        if (mapped.attribute === 'custody' && currentCustody.get(name) === 'fugitive') {
          mapped.transition = 'recapture';
        }
      } else if (RELEASE_STATE_MAP[state]) {
        mapped = RELEASE_STATE_MAP[state];
      } else if (state.startsWith(CUSTODY_PLACE_PREFIX)) {
        const place = state.slice(CUSTODY_PLACE_PREFIX.length).trim();
        if (place && !EMPTY_CUSTODY_PLACE.has(place)) {
          mapped = { attribute: 'custodyPlace', value: place, transition: 'transfer' };
        }
      } else if (state.startsWith(TITLE_PREFIX)) {
        const title = state.slice(TITLE_PREFIX.length).trim();
        if (title) mapped = { attribute: 'office', value: title, transition: 'appoint' };
      } else if (state === '揭晓') {
        mapped = { attribute: 'vital', value: 'alive', transition: 'death-revealed-fake' };
      }
      if (!mapped) continue;
      entries.push({
        entityId: name,
        attribute: mapped.attribute,
        value: mapped.value,
        fromChapter: chapter,
        transition: mapped.transition,
        evidence: { chapter, quote: detail.slice(0, 60) },
        source: 'migration',
      });
      if (mapped.attribute === 'custody') currentCustody.set(name, mapped.value);
    }
  }
  return { entries, violations: validateLedgerTransitions(entries), gaps: collectLedgerGaps(sorted, entries) };
}

/** custody 合法转移表（§5）；同值幂等条目报「重复登」候选 */
const CUSTODY_TRANSITION_TABLE: Record<string, TransitionKind[]> = {
  'free|held': ['arrest', 'recapture'],
  'held|free': ['release'],
  'held|bailed': ['bail'],
  'held|fugitive': ['escape'],
  'fugitive|held': ['recapture'],
  'bailed|held': ['arrest', 'recapture'],
  'bailed|free': ['release'],
};

export function validateLedgerTransitions(entries: LedgerEntry[]): LedgerViolation[] {
  const violations: LedgerViolation[] = [];
  const current = new Map<string, LedgerEntry>();
  const custodyCycles = new Map<string, number>();
  const sorted = [...entries].sort((a, b) => a.fromChapter - b.fromChapter);
  for (const entry of sorted) {
    const key = `${entry.entityId}|${entry.attribute}`;
    const prev = current.get(key);
    const push = (note: string): void => {
      violations.push({
        entityId: entry.entityId,
        attribute: entry.attribute,
        fromValue: prev?.value ?? null,
        toValue: entry.value,
        transition: entry.transition,
        chapter: entry.fromChapter,
        note,
      });
    };
    if (prev) {
      if (entry.attribute === 'vital') {
        if (prev.value === 'dead') push('死亡在册后再出 vital 转移（真复活/提取误报，交仲裁）');
        if (prev.value === 'faked-dead' && entry.value === 'alive' && entry.transition !== 'death-revealed-fake') {
          push('假死揭晓必须走「揭晓」delta');
        }
      } else if (entry.attribute === 'custody') {
        const allowed = CUSTODY_TRANSITION_TABLE[`${prev.value}|${entry.value}`];
        if (allowed) {
          if (!allowed.includes(entry.transition)) push(`custody ${prev.value}→${entry.value} 转移枚举不合法（${entry.transition}）`);
        } else if (prev.value === entry.value) {
          push(`custody 重复登 ${entry.value}（幂等条目或解除晚到）`);
        } else {
          push(`custody ${prev.value}→${entry.value} 无合法路径`);
        }
        if (
          (prev.value === 'held' && entry.value === 'fugitive') ||
          (prev.value === 'fugitive' && entry.value === 'held')
        ) {
          const count = (custodyCycles.get(entry.entityId) ?? 0) + 1;
          custodyCycles.set(entry.entityId, count);
          if (count === 3) {
            push('在押↔逃亡往返已达 3 次（structure.repeat 信号，供滚纲参考）');
          }
        }
      } else if (entry.attribute === 'office') {
        // none→新衔 需 appoint/restore；幂等重复去职不算违规（实测噪音）
        if (prev.value === 'none' && entry.value !== 'none' && !['appoint', 'restore'].includes(entry.transition)) {
          push('去职后复职缺 appoint/restore 转移');
        }
      }
    }
    // 跨属性不变量：死亡在册者的任何羁押程序性 delta 都是矛盾信号候选
    if (
      entry.attribute === 'custody' &&
      ['arrest', 'recapture', 'release', 'bail', 'escape'].includes(entry.transition) &&
      current.get(`${entry.entityId}|vital`)?.value === 'dead'
    ) {
      push('死亡在册后仍出入押程序（死人不能被逮捕/释放/越狱，交仲裁）');
    }
    // 押地变更隐含在押：与有无历史押地条目无关
    if (entry.attribute === 'custodyPlace' && !['held', 'bailed'].includes(current.get(`${entry.entityId}|custody`)?.value ?? 'free')) {
      push('押地入账时 custody 不在押（缺 arrest 前置或解除晚到）');
    }
    current.set(key, entry);
  }
  return violations;
}

function collectLedgerGaps(
  sortedMemories: ChapterMemory[],
  entries: LedgerEntry[],
): Array<{ chapter: number; anchor: string; preview: string }> {
  const gaps: Array<{ chapter: number; anchor: string; preview: string }> = [];
  const vitalChapters = new Set(
    entries.filter(e => e.attribute === 'vital' && e.transition !== 'faked-death').map(e => e.fromChapter),
  );
  for (const memory of sortedMemories) {
    if (vitalChapters.has(memory.chapterIndex ?? 0)) continue;
    const text = `${memory.corePlot ?? ''}\n${(memory.keyEvents ?? []).join('\n')}`;
    const hit = text.match(DEATH_COMPLETION_RE);
    if (hit?.index !== undefined) {
      gaps.push({
        chapter: memory.chapterIndex ?? 0,
        anchor: hit[0],
        preview: text.slice(Math.max(0, hit.index - 20), hit.index + 60).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return gaps;
}

/**
 * 第 N 章状态快照（§4.1）：所有 fromChapter < N 的条目按属性折叠后的最新值。
 * 返回 entityId → { attribute: value }（含 office 字面头衔与 custodyPlace）。
 */
export function snapshotAt(entries: LedgerEntry[], chapter: number): Map<string, Record<string, string>> {
  const snap = new Map<string, Record<string, string>>();
  const sorted = [...entries].filter(e => e.fromChapter < chapter).sort((a, b) => a.fromChapter - b.fromChapter);
  for (const entry of sorted) {
    const row = snap.get(entry.entityId) ?? {};
    row[entry.attribute] = entry.value;
    snap.set(entry.entityId, row);
  }
  return snap;
}

/**
 * 状态卡（读侧接管的提示词形态）：从账本快照产出分组行——在押（含押地）、
 * 已死、假死在册、革职、现任头衔。替代 collectFateStatusAnchors 的
 * 「最晚一条原始状态」视图（其读不到被押地/头衔行覆盖的终态，r8-S1-05 实证）。
 */
export function buildStateCardRows(memories: ChapterMemory[], chapter: number, maxRows = 16): string[] {
  const { entries } = buildLedgerFromMemories(memories);
  const snap = snapshotAt(entries, chapter);
  // 证据章号：各属性最近一次转移的章号（展示给写手对上号）
  const lastChapterOf = new Map<string, number>();
  for (const entry of entries.filter(e => e.fromChapter < chapter)) {
    lastChapterOf.set(`${entry.entityId}|${entry.attribute}`, entry.fromChapter);
  }
  const rows: string[] = [];
  const held: string[] = [];
  const dead: string[] = [];
  const faked: string[] = [];
  const dismissed: string[] = [];
  const offices: string[] = [];
  for (const [name, row] of snap) {
    if (row.vital === 'dead') {
      dead.push(`${name}（第${lastChapterOf.get(`${name}|vital`)}章死亡）`);
    } else if (row.vital === 'faked-dead') {
      faked.push(`${name}（第${lastChapterOf.get(`${name}|vital`)}章起假死在册，未揭晓）`);
    }
    if (row.custody === 'held') {
      const place = row.custodyPlace ? `，现押于${row.custodyPlace}` : '';
      held.push(`${name}（第${lastChapterOf.get(`${name}|custody`)}章起在押${place}）`);
    } else if (row.custody === 'fugitive') {
      held.push(`${name}（第${lastChapterOf.get(`${name}|custody`)}章起越狱在逃）`);
    } else if (row.custody === 'bailed') {
      held.push(`${name}（第${lastChapterOf.get(`${name}|custody`)}章起保释候勘）`);
    }
    if (row.office === 'none') {
      dismissed.push(`${name}（第${lastChapterOf.get(`${name}|office`)}章去职）`);
    } else if (typeof row.office === 'string' && row.office !== 'restored' && row.office !== 'none') {
      offices.push(`${name}＝${row.office}`);
    }
  }
  if (dead.length > 0) rows.push(`已死（仅可回忆/追述，禁止活体出场）：${dead.join('；')}`);
  if (held.length > 0) rows.push(`在押/在逃（出场须押解/提审/狱中形态，自由活动须明写释放或越狱过程）：${held.join('；')}`);
  if (faked.length > 0) rows.push(`假死在册（活着的隐匿状态，公开现身须揭晓）：${faked.join('；')}`);
  if (dismissed.length > 0) rows.push(`已去职（不得行使原职权/穿原品服，复起须明示任命）：${dismissed.join('；')}`);
  if (offices.length > 0) rows.push(`现任头衔（正文称谓须一致）：${offices.join('；')}`);
  return rows.slice(0, maxRows);
}

/**
 * 功能开关（第 2 阶段默认关闭，§7）：MOLIU_STATE_CARD=1 时状态卡替换
 * 【命运状态正典】通道。读环境变量必须走 readPositiveIntEnv（renderer 无 process）。
 */
export function isStateCardEnabled(): boolean {
  return readPositiveIntEnv('MOLIU_STATE_CARD') === 1;
}

/** 状态实际变化的宣告场面规则：两条通道共用，恒 appended */
const STATUS_CHANGE_RULE =
  '- 状态实际变化（新下狱/获释/去职/复职等）必须在正文写出宣告场面，不得静默切换；状态未变时禁止复述性改写';

/**
 * 提示词规则块渲染（SceneDraftEngine 调用）：状态卡在场时替换命运状态正典块，
 * 卡的分组视图是正典视图的超集（多 vital/押地折叠），避免双块重复注入。
 */
export function renderStatusRules(
  stateCard: string[] | undefined,
  fateStatusAnchors: Array<{ name: string; status: string; chapterIndex: number }> | undefined,
): string[] {
  if (stateCard && stateCard.length > 0) {
    return [
      '- 【实体状态卡】以下是从全书状态账本折叠出的各角色当前状态（唯一现值）——正文涉及这些角色时必须先与该状态自洽：在押者出场须有押解/提审/狱中形态或明写的释放、越狱过程；已死者禁止活体出场，仅可回忆追述；去职者不得行使原职权；头衔称谓须与现任头衔一致：',
      ...stateCard.map(row => `  - ${row}`),
      STATUS_CHANGE_RULE,
    ];
  }
  const anchors = fateStatusAnchors ?? [];
  if (anchors.length === 0) return [];
  return [
    '- 【命运状态正典】以下是各角色截至上章的最新命运状态（唯一现值，旧状态已作废）——正文涉及这些角色时必须先与该状态自洽：在押/下狱者出场必须有押解、提审、越狱或获释的明写过程，禁止凭空自由活动；去职/削爵者不得行使原职权、穿着原品服；获释/复职者按新状态处理：',
    ...anchors.map(item => `  - ${item.name}：${item.status}（第${item.chapterIndex}章起在册）`),
    STATUS_CHANGE_RULE,
  ];
}
