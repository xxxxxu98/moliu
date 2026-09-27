/**
 * 书审 Findings 台账核心库（release-loop 跨轮收敛的数据层）。
 *
 * 职责：固定分类表 + findings.json 校验 + 上线判定计算 + 跨轮收敛/升级信号。
 * 关键约束：
 * - 分类表（FINDING_CLASSES）是跨轮可比的前提，只增不改名；新形态先归入最近类，
 *   确属新类时追加并在 SKILL.md 登记。
 * - 上线判定由本库从数据计算，不接受书审报告自行宣布「可上线」——r9 实证：
 *   同一份 S2 清单仅改标签就从 5 变 0，审法与读者裁判缺失也照样宣布 READY。
 * - 只有 status=final（终稿实锤）计数；caught（过程已兜住）不是 Finding，
 *   needs-verify（待取样核实）视同未关闭，阻断上线。
 */

/** findings.json 当前 schema 版本 */
export const FINDINGS_SCHEMA_VERSION = 'findings/v1';

/**
 * 固定问题分类表：key 为 `域.子类`，value 为中文释义。
 * state.* 是「实体属性变化缺转移事件」族，统一状态账本的直接治理对象。
 */
export const FINDING_CLASSES = Object.freeze({
  'state.fate': '生死/终态回滚（死人复活、终态无声撤销）',
  'state.custody': '羁押状态断裂（在押角色自由活动、释放/越狱无交代）',
  'state.title': '官职/品级/头衔/袍服漂移且无任免叙述',
  'state.identity': '身份/出身/年龄等人物设定漂移',
  'state.location': '人物位置/动线断裂（同时分身、瞬移、航线闭环）',
  'number.ledger': '跨章账面数字口径不一致',
  'number.arithmetic': '章内算术自相矛盾（数量×单位≠总量）',
  'number.setting': '设定类数字漂移（兵力/船数/长度/人数）',
  'time.era': '年号/纪年错误或平行纪年',
  'time.sequence': '时序/季节/时间跨度矛盾',
  'continuity.boundary': '章界衔接断裂（跳拍、同拍重演、伏击未触发即跳场）',
  'structure.arc': '主线/支线结构断裂（关键线索悬空、假死未揭晓）',
  'structure.offscreen': '关键事件无叙述场面（驾崩/处决/登基零叙述跳结果）',
  'structure.repeat': '同一终态/事件跨章重演',
  'outline.contract': '大纲/蓝图自身矛盾或违背禁区',
  'prose.leak': '大纲节点原句/元信息泄漏进正文',
  'prose.anachronism': '现代词出戏、礼制混用',
  'prose.slop': 'AI 腔/套路同构/词频复读',
  'ending.closure': '完本收束不足、主线伏笔未回收',
  other: '暂无归类（需在下轮前归入或新增类）',
});

/** 严重度：S1 致命 / S2 严重 / S3 观感 / S4 建议 */
export const SEVERITIES = Object.freeze(['S1', 'S2', 'S3', 'S4']);

/** 结论档：终稿实锤 / 过程已兜住 / 待取样核实 */
export const FINDING_STATUSES = Object.freeze(['final', 'caught', 'needs-verify']);

/** 根因所在层（归因四分诊的落点，用于升级信号「根因集中在上游」判定） */
export const ROOT_LAYERS = Object.freeze([
  'outline',
  'blueprint',
  'extraction',
  'judge',
  'writer',
  'model',
  'infra',
  'unknown',
]);

/** 上游层：根因集中于此时，写作侧再加防线边际收益很低 */
export const UPSTREAM_LAYERS = Object.freeze(['outline', 'blueprint']);

/** 合格审法：只有逐章全量通读才能给出 S1=0 的结论（2026-09-15 用户指令） */
export const FULL_READ_METHODS = Object.freeze(['full-read', 'full-read-4ch']);

/**
 * 读者裁判硬门禁（2026-09-13 复冻值，与 SKILL.md 退出条件同源）。
 * 数值变更属于质量门调整，必须人工确认后同步 SKILL.md。
 */
export const READER_JUDGE_GATE = Object.freeze({ outline: 85, mean: 85, median: 86, min: 65 });

/** 升级信号阈值（只在全读轮之间计算，未验证轮的 0 不可比） */
export const ESCALATION = Object.freeze({
  /** 同一类连续出现 S1 的全读轮数达到此值 → 上一轮针对该类的修复无效 */
  persistentRounds: 2,
  /** 最新全读轮 S1 中「前两轮未出现过的类」占比达到此值 → 形态在漂移 */
  shapeShiftRatio: 0.5,
  /** 最新全读轮 S1 根因落在上游层的占比达到此值 → 停止写作侧补丁 */
  upstreamRatio: 0.5,
});

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

/**
 * 校验单份 findings 文档。
 * @param {unknown} doc 解析后的 findings.json
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFindingsDoc(doc) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== 'object') {
    return { errors: ['文档不是对象'], warnings };
  }
  if (doc.schemaVersion !== FINDINGS_SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${FINDINGS_SCHEMA_VERSION}`);
  }
  for (const key of ['round', 'book', 'reviewedAt']) {
    if (!isNonEmptyString(doc[key])) errors.push(`缺少 ${key}`);
  }
  if (!Number.isInteger(doc.chapters) || doc.chapters <= 0) errors.push('chapters 必须为正整数');
  validateReview(doc.review, errors, warnings);
  if (!doc.gates || typeof doc.gates !== 'object') errors.push('缺少 gates');
  if (!Array.isArray(doc.findings)) {
    errors.push('findings 必须为数组');
    return { errors, warnings };
  }
  const seenIds = new Set();
  // 回填文档（由旧版散文报告整理）没有逐条原文引用，证据缺失降级为警告
  const isBackfilled = isNonEmptyString(doc.backfilledFrom);
  if (isBackfilled) warnings.push(`回填自 ${doc.backfilledFrom}，Findings 无逐条原文证据`);
  doc.findings.forEach((finding, index) => {
    validateFinding(finding, index, { seenIds, isBackfilled, errors, warnings });
  });
  return { errors, warnings };
}

function validateReview(review, errors, warnings) {
  if (!review || typeof review !== 'object') {
    errors.push('缺少 review（审法声明）');
    return;
  }
  if (!isNonEmptyString(review.method)) errors.push('review.method 缺失');
  if (!Number.isInteger(review.chaptersRead)) errors.push('review.chaptersRead 必须为整数');
  if (review.independentReviewer !== true) {
    warnings.push('审稿模型与写作模型同源（independentReviewer!=true），结论存在自评偏差');
  }
}

function validateFinding(finding, index, { seenIds, isBackfilled, errors, warnings }) {
  const where = `findings[${index}]`;
  if (!finding || typeof finding !== 'object') {
    errors.push(`${where} 不是对象`);
    return;
  }
  if (!isNonEmptyString(finding.id)) errors.push(`${where}.id 缺失`);
  else if (seenIds.has(finding.id)) errors.push(`${where}.id 重复：${finding.id}`);
  else seenIds.add(finding.id);
  if (!SEVERITIES.includes(finding.severity)) errors.push(`${where}.severity 非法：${finding.severity}`);
  if (!(finding.class in FINDING_CLASSES)) errors.push(`${where}.class 不在分类表：${finding.class}`);
  if (!FINDING_STATUSES.includes(finding.status)) errors.push(`${where}.status 非法：${finding.status}`);
  if (!ROOT_LAYERS.includes(finding.rootLayer)) errors.push(`${where}.rootLayer 非法：${finding.rootLayer}`);
  if (!Array.isArray(finding.chapters) || finding.chapters.length === 0) {
    errors.push(`${where}.chapters 至少一个章号`);
  }
  if (!isNonEmptyString(finding.summary)) errors.push(`${where}.summary 缺失`);
  if (finding.count !== undefined && !(Number.isInteger(finding.count) && finding.count > 0)) {
    errors.push(`${where}.count 必须为正整数（聚合条目的实际条数）`);
  }
  const isBlockingSeverity = finding.severity === 'S1' || finding.severity === 'S2';
  if (isBlockingSeverity && finding.status === 'final' && !isBackfilled) {
    const hasEvidence = Array.isArray(finding.evidence)
      && finding.evidence.some(item => Number.isInteger(item?.chapter) && isNonEmptyString(item?.quote));
    if (!hasEvidence) errors.push(`${where} 为终稿 ${finding.severity}，必须附带 {chapter, quote} 原文证据`);
  }
  if (isBlockingSeverity && finding.status === 'caught') {
    warnings.push(`${where}（${finding.id}）是过程已兜住项，不计入 ${finding.severity}；确认终稿无残留即可`);
  }
  if (finding.class === 'other') {
    warnings.push(`${where}（${finding.id}）未归类，下轮前需归入分类表`);
  }
}

/** 条目权重：聚合条目（同类多处归并为一条）按 count 计，默认 1 */
const weightOf = finding => (Number.isInteger(finding.count) && finding.count > 0 ? finding.count : 1);

/**
 * 统计终稿实锤 Findings（caught 不计，needs-verify 单列）。
 * @param {{ findings: Array<{severity: string, status: string, class: string, count?: number}> }} doc
 */
export function countFindings(doc) {
  const counts = { S1: 0, S2: 0, S3: 0, S4: 0, needsVerify: 0, caught: 0 };
  for (const finding of doc.findings ?? []) {
    const weight = weightOf(finding);
    if (finding.status === 'caught') counts.caught += weight;
    else if (finding.status === 'needs-verify') counts.needsVerify += weight;
    else if (finding.severity in counts) counts[finding.severity] += weight;
  }
  return counts;
}

/**
 * 从数据计算上线判定（north-star 生产可用验收门 1-6 + SKILL.md 退出条件）。
 * 任何一项缺数据都按未通过处理：缺失 ≠ 通过。
 * @param {object} doc findings 文档
 * @returns {{ ready: boolean, blockers: string[], warnings: string[] }}
 */
export function computeReleaseVerdict(doc) {
  const blockers = [];
  const warnings = [];
  const counts = countFindings(doc);
  const review = doc.review ?? {};
  const gates = doc.gates ?? {};

  if (!FULL_READ_METHODS.includes(review.method)) {
    blockers.push(`审法不合格：${review.method ?? '未声明'}（S1=0 结论只认逐章全量通读）`);
  } else if (review.chaptersRead < doc.chapters) {
    blockers.push(`通读不全：${review.chaptersRead}/${doc.chapters} 章`);
  }
  if (counts.S1 > 0) blockers.push(`终稿 S1 × ${counts.S1}`);
  if (counts.S2 > 0) blockers.push(`终稿 S2 × ${counts.S2}（north-star 验收门 3：无 S1/S2）`);
  if (counts.needsVerify > 0) blockers.push(`待核实 × ${counts.needsVerify}（未关闭视同未通过）`);
  if (!Number.isInteger(gates.precheckRedlines)) blockers.push('确定性预检红线数缺失');
  else if (gates.precheckRedlines > 0) blockers.push(`预检红线 × ${gates.precheckRedlines}`);
  if (!Number.isInteger(gates.fateRealResurrection)) blockers.push('命运 AI 裁决结果缺失');
  else if (gates.fateRealResurrection > 0) blockers.push(`命运裁决真复活 × ${gates.fateRealResurrection}`);

  collectReaderJudgeBlockers(gates.readerJudge, blockers);
  collectEndingBlockers(gates.ending, blockers);

  const interventions = Array.isArray(gates.humanIntervention) ? gates.humanIntervention : null;
  if (!interventions) blockers.push('人工干预记录缺失（无干预须显式写 []）');
  else if (interventions.length > 0) {
    blockers.push(`存在人工/补写干预：${interventions.join('；')}（north-star 验收门 1：人工零干预）`);
  }
  if (gates.blindTest !== 'pass') {
    blockers.push(`前三章盲测：${gates.blindTest ?? '未执行'}`);
  }
  if (gates.readerJudge && gates.readerJudge.independentFromWriter !== true) {
    warnings.push('读者裁判与写作同通道（independentFromWriter!=true），分数偏乐观');
  }
  return { ready: blockers.length === 0, blockers, warnings };
}

function collectReaderJudgeBlockers(readerJudge, blockers) {
  if (!readerJudge || typeof readerJudge !== 'object') {
    blockers.push('读者裁判四指标缺失');
    return;
  }
  for (const [key, threshold] of Object.entries(READER_JUDGE_GATE)) {
    const value = readerJudge[key];
    if (typeof value !== 'number') blockers.push(`读者裁判 ${key} 缺失`);
    else if (value < threshold) blockers.push(`读者裁判 ${key}=${value} < ${threshold}`);
  }
}

function collectEndingBlockers(ending, blockers) {
  if (!ending || typeof ending !== 'object') {
    blockers.push('完本审计缺失');
    return;
  }
  if (ending.complete !== true) blockers.push('完本完整性未通过（空洞/截断/停产）');
  if (typeof ending.mainUnresolved === 'number' && ending.mainUnresolved > 0) {
    blockers.push(`main 级伏笔未回收 × ${ending.mainUnresolved}`);
  }
  if (!(typeof ending.closureSignals === 'number' && ending.closureSignals > 0)) {
    blockers.push('完本收束信号为 0 或缺失');
  }
}

/** 取某轮终稿 S1 的类集合 */
function s1ClassesOf(doc) {
  return new Set(
    (doc.findings ?? [])
      .filter(finding => finding.severity === 'S1' && finding.status === 'final')
      .map(finding => finding.class)
  );
}

/**
 * 跨轮收敛矩阵：行=分类，列=轮次，值=终稿 S1/S2 计数。
 * @param {object[]} docs 已按时间升序排列的 findings 文档
 * @returns {{ rounds: string[], rows: Array<{cls: string, cells: Array<{S1: number, S2: number}>}> }}
 */
export function buildConvergenceMatrix(docs) {
  const rounds = docs.map(doc => doc.round);
  const classes = new Set();
  for (const doc of docs) {
    for (const finding of doc.findings ?? []) {
      if (finding.status === 'final' && (finding.severity === 'S1' || finding.severity === 'S2')) {
        classes.add(finding.class);
      }
    }
  }
  const order = Object.keys(FINDING_CLASSES);
  const rows = [...classes]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(cls => ({
      cls,
      cells: docs.map(doc => {
        const cell = { S1: 0, S2: 0 };
        for (const finding of doc.findings ?? []) {
          if (finding.class !== cls || finding.status !== 'final') continue;
          if (finding.severity === 'S1' || finding.severity === 'S2') {
            cell[finding.severity] += weightOf(finding);
          }
        }
        return cell;
      }),
    }));
  return { rounds, rows };
}

/**
 * 升级信号：判断是否该停止写作侧补丁、转投架构/上游层。
 * @param {object[]} docs 已按时间升序排列的 findings 文档
 * @returns {Array<{ kind: string, message: string }>}
 */
export function detectEscalationSignals(docs) {
  const signals = [];
  if (docs.length === 0) return signals;
  const latest = docs[docs.length - 1];

  const isFullRead = doc => FULL_READ_METHODS.includes(doc.review?.method);
  if (!isFullRead(latest)) {
    signals.push({
      kind: 'review-downgrade',
      message: `最新轮 ${latest.round} 审法为 ${latest.review?.method ?? '未声明'}，其 S1 计数不可与全读轮比较`,
    });
  }
  const lastFullRead = docs.slice(0, -1).reverse().find(isFullRead);
  if (lastFullRead && countFindings(latest).S1 === 0 && countFindings(lastFullRead).S1 > 0) {
    if (!isFullRead(latest) || latest.chapters < lastFullRead.chapters) {
      signals.push({
        kind: 'unverified-zero',
        message: `S1 从 ${lastFullRead.round} 的 ${countFindings(lastFullRead).S1} 降为 0，但审法或规模不同（${lastFullRead.review?.method}/${lastFullRead.chapters}章 → ${latest.review?.method}/${latest.chapters}章），需同口径全读复核`,
      });
    }
  }

  const comparable = docs.filter(isFullRead);
  for (const cls of findPersistentClasses(comparable)) {
    signals.push({
      kind: 'persistent-class',
      message: `${cls}（${FINDING_CLASSES[cls]}）连续 ${ESCALATION.persistentRounds} 个全读轮出现 S1：上一轮针对该类的修复无效，需换机制而非再加补丁`,
    });
  }

  const shapeShift = measureShapeShift(comparable);
  if (shapeShift && shapeShift.ratio >= ESCALATION.shapeShiftRatio) {
    signals.push({
      kind: 'shape-shift',
      message: `最新全读轮 S1 有 ${Math.round(shapeShift.ratio * 100)}% 属于前两轮未出现的新类（${shapeShift.fresh.join('、')}）：形态在漂移，逐形态补防线不会收敛`,
    });
  }

  const latestComparable = comparable[comparable.length - 1];
  const upstream = latestComparable ? measureUpstreamShare(latestComparable) : { total: 0 };
  if (upstream.total > 0 && upstream.ratio >= ESCALATION.upstreamRatio) {
    signals.push({
      kind: 'upstream-root',
      message: `最新全读轮 ${latestComparable.round} 的 S1 有 ${Math.round(upstream.ratio * 100)}%（${upstream.upstream}/${upstream.total}）根因在大纲/蓝图层：下一轮停止写作侧补防线，主攻上游`,
    });
  }
  return signals;
}

function findPersistentClasses(docs) {
  const window = docs.slice(-ESCALATION.persistentRounds);
  if (window.length < ESCALATION.persistentRounds) return [];
  const sets = window.map(s1ClassesOf);
  return [...sets[0]].filter(cls => sets.every(set => set.has(cls)));
}

function measureShapeShift(docs) {
  if (docs.length < 3) return null;
  const latestClasses = s1ClassesOf(docs[docs.length - 1]);
  if (latestClasses.size === 0) return null;
  const history = new Set([...s1ClassesOf(docs[docs.length - 2]), ...s1ClassesOf(docs[docs.length - 3])]);
  const fresh = [...latestClasses].filter(cls => !history.has(cls));
  return { ratio: fresh.length / latestClasses.size, fresh };
}

function measureUpstreamShare(doc) {
  let total = 0;
  let upstream = 0;
  for (const finding of doc.findings ?? []) {
    if (finding.severity !== 'S1' || finding.status !== 'final') continue;
    total += weightOf(finding);
    if (UPSTREAM_LAYERS.includes(finding.rootLayer)) upstream += weightOf(finding);
  }
  return { total, upstream, ratio: total > 0 ? upstream / total : 0 };
}
