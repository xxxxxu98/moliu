/**
 * 统一实体状态账本·第 1 阶段影子实现（docs/unified-state-ledger.md §7）。
 *
 * 纯函数：从 project-store 的 chapterMemories（characterStateChanges 字符串协议：
 * 命运五态 / 押地:X / 头衔:X / 身份:X / 解除族规范化值）迁移成「实体 × 属性 × 转移」条目，
 * 用确定性状态机校验转移合法性，并按章折叠快照。
 *
 * 影子期纪律（第 1 阶段）：不接管任何生产链路，只由 storyflow-triage /
 * assemble-matrix-bookreview 输出「账本快照 vs 现有锚」差异报告 + 违规/缺口清单，
 * 为第 2 阶段（读侧接管）积累实证。语义判定（真复活 vs 提取误报）不在这里做——
 * 违规与缺口只是候选，终审归 fate-adjudicate；正则仅用于事件完成体的召回候选。
 *
 * 章号口径：chapterMemories.chapterIndex 全链 1 基（第 0 阶段已统一），
 * 账本 fromChapter/evidence.chapter 同口径。
 */

/** 账本属性：每个属性一条独立时间线（location 第 1 期不启用，见 §9.2） */
export const LEDGER_ATTRIBUTES = ['vital', 'custody', 'custodyPlace', 'office', 'identity'];

/** 转移类别：迁移自现有字符串协议时按值族映射，确定性代码只认枚举 */
export const TRANSITION_KINDS = [
  'death', 'faked-death', 'death-revealed-fake',
  'arrest', 'release', 'bail', 'escape', 'recapture', 'transfer',
  'dismiss', 'appoint', 'restore',
  'reveal-identity',
];

/**
 * 命运五态 → 账本条目映射（迁移源 1：FATE_STATES）。
 * 「定罪」是定谳事实，隐含在押：custody=held（transfer=arrest 语义由 conviction
 * 承担），与 TS 侧 CUSTODY_FATES 的在押族口径一致。
 */
const FATE_STATE_MAP = {
  '死亡': { attribute: 'vital', value: 'dead', transition: 'death' },
  '驾崩': { attribute: 'vital', value: 'dead', transition: 'death' },
  '假死': { attribute: 'vital', value: 'faked-dead', transition: 'faked-death' },
  '下狱': { attribute: 'custody', value: 'held', transition: 'arrest' },
  '定罪': { attribute: 'custody', value: 'held', transition: 'arrest' },
  '越狱': { attribute: 'custody', value: 'fugitive', transition: 'escape' },
  '去职': { attribute: 'office', value: 'none', transition: 'dismiss' },
};

/** 解除族（迁移源 2：FATE_RELEASE_STATES，语义判定在 AI 提取合同） */
const RELEASE_STATE_MAP = {
  '获释': { attribute: 'custody', value: 'free', transition: 'release' },
  '平反': { attribute: 'custody', value: 'free', transition: 'release' },
  '赦免': { attribute: 'custody', value: 'free', transition: 'release' },
  '保释': { attribute: 'custody', value: 'bailed', transition: 'bail' },
  '复职': { attribute: 'office', value: 'restored', transition: 'restore' },
  '复位': { attribute: 'office', value: 'restored', transition: 'restore' },
  '起复': { attribute: 'office', value: 'restored', transition: 'restore' },
};

/** 前缀协议：押地:X / 头衔:X（迁移源 3，ChapterWritingPipeline 写入） */
const CUSTODY_PLACE_PREFIX = '押地:';
const TITLE_PREFIX = '頭衔:';
const TITLE_PREFIX_CN = '头衔:';
const IDENTITY_PREFIX = '身份:';
const EMPTY_CUSTODY_PLACE = new Set(['无', '无押地', '暂无', '未知']);

/**
 * 事件完成体召回（ledger-gap 候选网）：keyEvents/corePlot 里出现死亡/枭首族
 * 完成体而同章无任何 vital 条目时输出候选。只召回不判定——是否真缺账交
 * AI 仲裁（§5 跨章规则「事件有账无」）。
 */
const DEATH_COMPLETION_RE = /(枭首|斩立决|人头落地|头颅滚落|当场毙命|气绝身亡|饮鸩(身亡|毙命)|暴毙|伏诛|气绝|洞穿[^。；，]{0,8}喉|割喉|归于死寂|殒命|断了气|咽了气|没了声息|没了气息|再无声息)/;

/**
 * 从章记忆构建账本条目。
 *
 * @param {import('./state-ledger-types.mjs').ChapterMemoryLike[]} memories
 * @returns {{ entries: LedgerEntry[], violations: LedgerViolation[], gaps: LedgerGap[] }}
 */
export function buildLedgerFromMemories(memories) {
  /** @type {import('./state-ledger-types.mjs').LedgerEntry[]} */
  const entries = [];
  // 迁移保真：越狱后的再入押（下狱/定罪）在协议里仍是裸「下狱」，账本按当前
  // custody 态改记 recapture（fugitive→held 的唯一合法转移），避免状态机假违规
  const currentCustody = new Map();
  const sorted = [...(memories ?? [])].sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));
  for (const memory of sorted) {
    const chapter = memory.chapterIndex ?? 0;
    for (const change of memory.characterStateChanges ?? []) {
      const name = String(change?.characterName ?? '').trim();
      const state = String(change?.state ?? '').trim();
      const detail = String(change?.detail ?? '').trim();
      if (!name || !state) continue;
      let mapped = null;
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
      } else if (state.startsWith(TITLE_PREFIX) || state.startsWith(TITLE_PREFIX_CN)) {
        const title = state.slice(state.startsWith(TITLE_PREFIX) ? TITLE_PREFIX.length : TITLE_PREFIX_CN.length).trim();
        if (title) mapped = { attribute: 'office', value: title, transition: 'appoint' };
      } else if (state.startsWith(IDENTITY_PREFIX)) {
        const identity = state.slice(IDENTITY_PREFIX.length).trim().slice(0, 50);
        if (identity && change.transition === 'reveal-identity') {
          mapped = { attribute: 'identity', value: identity, transition: 'reveal-identity' };
        }
      } else if (state === '揭晓') {
        // 假死揭晓：faked-dead → alive 的唯一合法转移
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
  const violations = validateLedgerTransitions(entries);
  const gaps = collectLedgerGaps(sorted, entries);
  return { entries, violations, gaps };
}

/**
 * 状态机校验（§5 转移规则表）：只检查「transition 枚举能否作用于当前值」，
 * 不读正文语义。违规是候选信号，交仲裁，不在本地放行或拦截。
 *
 * @param {import('./state-ledger-types.mjs').LedgerEntry[]} entries
 * @returns {import('./state-ledger-types.mjs').LedgerViolation[]}
 */
export function validateLedgerTransitions(entries) {
  /** @type {import('./state-ledger-types.mjs').LedgerViolation[]} */
  const violations = [];
  /** @type {Map<string, import('./state-ledger-types.mjs').LedgerEntry>} */ // entityId|attribute → 最新条目
  const current = new Map();
  /** @type {Map<string, number>} */ // entityId → held↔fugitive 往返计数
  const custodyCycles = new Map();
  const sorted = [...entries].sort((a, b) => a.fromChapter - b.fromChapter);
  for (const entry of sorted) {
    const key = `${entry.entityId}|${entry.attribute}`;
    const prev = current.get(key);
    const push = (note) => violations.push({
      entityId: entry.entityId,
      attribute: entry.attribute,
      fromValue: prev?.value ?? null,
      toValue: entry.value,
      transition: entry.transition,
      chapter: entry.fromChapter,
      note,
    });
    if (prev) {
      switch (entry.attribute) {
        case 'vital':
          // 死亡不可逆：dead 后任何 vital 转移都是矛盾信号（真复活或提取误报）
          if (prev.value === 'dead') push('死亡在册后再出 vital 转移（真复活/提取误报，交仲裁）');
          // faked-dead → alive 必须经「揭晓」；faked-dead → dead（假死成真）合法
          if (prev.value === 'faked-dead' && entry.value === 'alive' && entry.transition !== 'death-revealed-fake') {
            push('假死揭晓必须走「揭晓」delta');
          }
          break;
        case 'custody': {
          const legal = custodyLegalTransition(prev.value, entry.value, entry.transition);
          if (!legal.ok) push(legal.note);
          if ((prev.value === 'held' && entry.value === 'fugitive') || (prev.value === 'fugitive' && entry.value === 'held')) {
            const count = (custodyCycles.get(entry.entityId) ?? 0) + 1;
            custodyCycles.set(entry.entityId, count);
            if (count === 3) {
              violations.push({
                entityId: entry.entityId,
                attribute: 'custody',
                fromValue: prev.value,
                toValue: entry.value,
                transition: entry.transition,
                chapter: entry.fromChapter,
                note: '在押↔逃亡往返已达 3 次（structure.repeat 信号，供滚纲参考）',
              });
            }
          }
          break;
        }
        case 'office':
          // none→新衔 需 appoint/restore；X→none 需 dismiss；头衔直接改写（appoint）合法——
          // 「改写是否有任免叙事」是语义问题，由证据句交判官，不在状态机判。
          // none→none（幂等重复去职条目）不算违规：ch34 齐泰双去职形态实测为噪音
          if (prev.value === 'none' && entry.value !== 'none' && !['appoint', 'restore'].includes(entry.transition)) {
            push('去职后复职缺 appoint/restore 转移');
          }
          break;
        case 'identity':
          if (entry.transition !== 'reveal-identity') {
            push('身份变更必须走 reveal-identity');
          }
          break;
      }
    }
    // 跨属性不变量（独立于本属性有无前条）：死亡在册者的任何羁押程序性 delta
    // 都是矛盾信号候选（r10a 周豹形态：ch170 死亡入账后 ch180 又登在押；r8 严开礼
    // 形态：死亡被获释/越狱洗白）——单看 custody 转移表它们合法，必须对照 vital。
    if (entry.attribute === 'custody'
      && ['arrest', 'recapture', 'release', 'bail', 'escape'].includes(entry.transition)
      && current.get(`${entry.entityId}|vital`)?.value === 'dead') {
      push('死亡在册后仍出入押程序（死人不能被逮捕/释放/越狱，交仲裁）');
    }
    // 押地变更隐含在押（§5 规则）：custodyPlace 条目要求此刻 custody ∈ {held, bailed}，
    // 与有无历史押地条目无关
    if (entry.attribute === 'custodyPlace' && !['held', 'bailed'].includes(custodyValueOf(current, entry.entityId))) {
      push('押地入账时 custody 不在押（缺 arrest 前置或解除晚到）');
    }
    current.set(key, entry);
  }
  return violations;
}

/** custody 合法转移表（§5）：返回 {ok, note} */
function custodyLegalTransition(from, to, transition) {
  const table = {
    'free|held': ['arrest', 'recapture'],
    'held|free': ['release'],
    'held|bailed': ['bail'],
    'held|fugitive': ['escape'],
    'fugitive|held': ['recapture'],
    'bailed|held': ['arrest', 'recapture'],
    'bailed|free': ['release'],
  };
  const allowed = table[`${from}|${to}`];
  if (allowed) {
    return allowed.includes(transition)
      ? { ok: true, note: '' }
      : { ok: false, note: `custody ${from}→${to} 转移枚举不合法（${transition}）` };
  }
  // 同值幂等（重复 arrest 等）：格式层告警不判语义
  if (from === to) return { ok: false, note: `custody 重复登 ${to}（幂等条目或解除晚到）` };
  return { ok: false, note: `custody ${from}→${to} 无合法路径` };
}

function custodyValueOf(current, entityId) {
  return current.get(`${entityId}|custody`)?.value ?? 'free';
}

/**
 * 事件有账无（ledger-gap 候选）：章记忆文本命中死亡完成体而同章无任何该章 vital
 * 条目。正则只做召回，候选交 AI 仲裁（§5 跨章规则）。
 */
function collectLedgerGaps(sortedMemories, entries) {
  /** @type {import('./state-ledger-types.mjs').LedgerGap[]} */
  const gaps = [];
  const vitalChapters = new Set(
    entries.filter(e => e.attribute === 'vital' && e.transition !== 'faked-death').map(e => e.fromChapter)
  );
  for (const memory of sortedMemories) {
    if (vitalChapters.has(memory.chapterIndex ?? 0)) continue;
    const text = `${memory.corePlot ?? ''}\n${(memory.keyEvents ?? []).join('\n')}`;
    const hit = text.match(DEATH_COMPLETION_RE);
    if (hit) {
      gaps.push({
        chapter: memory.chapterIndex ?? 0,
        anchor: hit[0],
        preview: text.slice(Math.max(0, (hit?.index ?? 0) - 20), (hit?.index ?? 0) + 60).replace(/\s+/g, ' ').trim(),
        note: '死亡完成体出现但同章无 vital 条目（候选，交仲裁）',
      });
    }
  }
  return gaps;
}

/**
 * 第 N 章状态快照：所有 fromChapter < N 的条目按属性折叠后的最新值（§4.1）。
 * @returns {Map<string, Record<string, string>>} entityId → { attribute: value }
 */
export function snapshotAt(entries, chapter) {
  /** @type {Map<string, Record<string, string>>} */
  const snap = new Map();
  const sorted = [...entries]
    .filter(e => e.fromChapter < chapter)
    .sort((a, b) => a.fromChapter - b.fromChapter);
  for (const entry of sorted) {
    const row = snap.get(entry.entityId) ?? {};
    row[entry.attribute] = entry.value;
    snap.set(entry.entityId, row);
  }
  return snap;
}

/**
 * 影子差异报告（第 1 阶段验收口径）：账本快照 vs 「每角色最晚一条原始状态」
 * （现有 collectFateStatusAnchors 的取值方式）。差异不是谁对谁错——是两套读法
 * 对同一批 delta 的分歧点，第 2 阶段接管前先让分歧可见。
 *
 * @param {import('./state-ledger-types.mjs').ChapterMemoryLike[]} memories
 */
export function buildShadowLedgerReport(memories, atChapter) {
  const { entries, violations, gaps } = buildLedgerFromMemories(memories);
  const lastChapter = atChapter ?? Math.max(0, ...(memories ?? []).map(m => m.chapterIndex ?? 0)) + 1;
  const snap = snapshotAt(entries, lastChapter);

  // 现有锚口径：每角色最晚一条 characterStateChange 原样值（不折叠属性、不做状态机）
  const legacyLatest = new Map();
  for (const memory of [...(memories ?? [])].sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0))) {
    for (const change of memory.characterStateChanges ?? []) {
      const name = String(change?.characterName ?? '').trim();
      if (name) legacyLatest.set(name, { state: String(change?.state ?? ''), chapter: memory.chapterIndex ?? 0 });
    }
  }
  /** @type {Array<{entityId:string, ledger:string, legacy:string, note:string}>} */
  const legacyDiff = [];
  for (const [name, legacy] of legacyLatest) {
    const row = snap.get(name);
    const ledgerCustody = row?.custody ? `custody=${row.custody}` : '';
    const ledgerVital = row?.vital && row.vital !== 'alive' ? `vital=${row.vital}` : '';
    const ledgerView = [ledgerVital, ledgerCustody].filter(Boolean).join(',') || '（无终态）';
    // 已知分歧形态：命运族在账本在押/死亡，但最晚原始行是解除/头衔/押地（legacy 视角已「看不见」终态）
    const fateLike = row && (row.custody === 'held' || row.vital === 'dead' || row.vital === 'faked-dead');
    const legacyNotFate = !['死亡', '驾崩', '下狱', '定罪'].includes(legacy.state);
    if (fateLike && legacyNotFate) {
      legacyDiff.push({
        entityId: name,
        ledger: ledgerView,
        legacy: `第${legacy.chapter}章最晚行「${legacy.state}」`,
        note: '账本仍有终态，现有「最晚值」锚读不到（r8-S1-05 顾宪诚形态）',
      });
    }
  }

  return {
    entries: entries.length,
    snapshotRows: snap.size,
    violations,
    gaps,
    legacyDiff,
    summary: [
      `条目 ${entries.length}，快照实体 ${snap.size}`,
      `状态机违规 ${violations.length}（候选，交仲裁）`,
      `事件有账无候选 ${gaps.length}（正则召回，交仲裁）`,
      `与现有锚分歧 ${legacyDiff.length}（r8-S1-05 形态族）`,
    ],
  };
}
