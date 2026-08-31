/**
 * 网文手机排版：硬约束文案 + 轻量规范化
 *
 * 策略（尊重模型分段，少动刀）：
 * 1. TYPESETTING_HARD_RULES / G8：写前约束 + 写后检查（可触发重写反馈）
 * 2. normalizeWebnovelParagraphs：只做空白清理与安全修补，不主动拆段/并段
 */

/** 单段舒适上限（约手机半屏内；只拆真正偏长的段） */
export const MAX_PARAGRAPH_CHARS = 280;

/** 单段建议最多句数 */
export const MAX_SENTENCES_PER_PARAGRAPH = 5;

/** 合并过短段时的目标字数 */
export const MERGE_TARGET_CHARS = 200;

/** 视为「过短、可合并」的段长 */
export const TOO_SHORT_CHARS = 80;

/** 有意短拍（不合并）：单独成段的短反应/停顿 */
export const INTENTIONAL_BEAT_CHARS = 15;

/** 超过此字数视为「超长段」（门禁 high） */
export const EXTREME_PARAGRAPH_CHARS = 520;

/** 单段超过该值已经明显影响手机阅读，直接进入高优先级门禁。 */
export const HARD_MAX_PARAGRAPH_CHARS = 420;

/** 连续一句一段达到该数量，视为模板化碎段。 */
export const MAX_CONSECUTIVE_SHORT_PARAGRAPHS = 5;

/** 超长段占比超过此值 → 门禁判定不通过 */
export const LONG_PARAGRAPH_RATIO_THRESHOLD = 0.5;

/**
 * 段落长度均匀化阈值：变异系数（标准差/均值）低于此值且段数足够时，
 * 说明全章段落长度雷同（如清一色 150-200 字中长段）——这是最典型的
 * AI 腔节奏（2026-08-18 双 gemini 矩阵实测 cv 0.07-0.13，人类网文
 * 因对话短拍与叙述长段交错通常在 0.25+）。仅报 medium 信号不阻断。
 */
export const UNIFORM_PARAGRAPH_CV_THRESHOLD = 0.14;

/** 均匀化判定所需最少段数（段太少统计无意义） */
export const UNIFORM_PARAGRAPH_MIN_COUNT = 12;

/** 均匀化判定所需最小平均段长（平均过短属碎段问题，由既有检测负责） */
export const UNIFORM_PARAGRAPH_MIN_AVG_CHARS = 120;

/**
 * 注入起草/任务书的排版硬约束（尽量短，避免挤占预算）。
 * 目标：适中分段——挡住超长大段，同时避免空行刷屏。
 */
export const TYPESETTING_HARD_RULES = `## 【强制】手机网文排版【观感核心】
读者在手机上滑读。分段要适中：既不要整章大段，也不要空行刷屏。
**请在生成时直接分好段**——系统后处理不会替你拆段/并段。

### 硬指标（必须遵守）
1. **每个自然段约 3～5 句话**为宜，不要动辄一句一段
2. **单段大约 180～280 字**较舒适；明显超过半屏请自行换段
3. **段与段之间空一行**；禁止整章只有少数超长大段
4. **换人就换行**：多人对话不要塞进同一段；单人短对话可与前后叙述同段
5. **收引号必须跟在对话句末**，不要把 ” 单独甩到下一行/下一段
6. **正文禁用省略号、破折号和双连字符**：不用省略号、破折号或双连字符硬造停顿，改用动作、逗号、句号或冒号

### 正例（推荐观感）
他走到窗前，夜色很黑。刚才的事还在脑子里转，像一场没醒的梦。楼下隐约传来说话声，他没有去听。

"你还在想她？"老刘问。

他没说话，只是把烟掐灭，转身回了屋。

### 反例（禁止）
1）整章挤成少数超长大段；
2）通篇一句一段、空行刷屏；
3）上一段对话缺收引号、下一段以 ” 开头。

### 自检
单段明显超过大半屏、或一段超过 5 个句号 → 自行换段；若大量段落不足两行 → 自行合并。`;

export interface ParagraphDensityStats {
  paragraphCount: number;
  longParagraphCount: number;
  extremeParagraphCount: number;
  longParagraphRatio: number;
  maxParagraphChars: number;
  avgParagraphChars: number;
  /** 超过 MAX_SENTENCES_PER_PARAGRAPH 的段落数 */
  overSentenceParagraphCount: number;
  /** 段落长度变异系数（标准差/均值）；越低越均匀，过低是 AI 腔节奏信号 */
  paragraphLengthCV: number;
}

export interface ParagraphDensityIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  evidence?: string;
}

function countChineseAwareLength(text: string): number {
  if (!text) return 0;
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const other = text.replace(/[\u4e00-\u9fa5\s]/g, '').length;
  return chinese + other;
}

/** 中文/弯引号：开引号 */
const OPEN_QUOTE_CLASS = '「『\\u201C\\u2018"\'';
/** 中文/弯引号：收引号 */
const CLOSE_QUOTE_CLASS = '」』\\u201D\\u2019"\'';

/** 审查/润色共用：是否超过舒适段长 */
export function isLongParagraph(text: string): boolean {
  return countChineseAwareLength(text) > MAX_PARAGRAPH_CHARS;
}

/**
 * 按中文句末切分，句末标点后的收引号必须附着在同一句内。
 * 否则会出现「上段缺 ”、下段以 ” 开头」的排版事故。
 */
export function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const pattern = new RegExp(
    `[^。！？…!?]+[。！？…!?]+[${CLOSE_QUOTE_CLASS}]*|[^。！？…!?]+$`,
    'gu'
  );
  const parts = trimmed.match(pattern);
  if (!parts) return [trimmed];
  return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * 把误拆到下一段开头的收引号并回上一段。
 */
export function repairOrphanClosingQuotes(paragraphs: string[]): string[] {
  if (paragraphs.length <= 1) return paragraphs;

  const orphanStart = new RegExp(`^[${CLOSE_QUOTE_CLASS}]+`);
  const result: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (result.length > 0 && orphanStart.test(trimmed)) {
      result[result.length - 1] = `${result[result.length - 1]}${trimmed}`;
    } else {
      result.push(trimmed);
    }
  }

  return result;
}

/**
 * 把「句末 + 单换行 + 新话轮/场景」提升为双空行，便于后续按段处理。
 */
export function promoteSingleNewlines(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // 句末/闭引号后接新开引号
    .replace(/([。！？…!?）」』\u201D\u2019"'])\n(?!\n)([\u201C\u2018「『"])/gu, '$1\n\n$2')
    // 任意行首开引号（模型常用单换行起对话）
    .replace(/\n(?!\n)([\u201C\u2018「『"])/gu, '\n\n$1')
    .replace(
      /([。！？…!?])\n(?!\n)((?:翌日|次日|第二天|与此同时|另一边|同一时刻|这时|此时|片刻后|不久后|半晌后))/gu,
      '$1\n\n$2'
    )
    .replace(/([。！？…!?])\n(?!\n)(---|\*\*\*|——{2,})/gu, '$1\n\n$2');
}

/**
 * 对话换人拆段：闭合引号后的叙述若后接新开引号，中间插入分段。
 */
export function splitDialogueTurns(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // “…。”他说。“…” / 「…！」她道。「…」
  const broken = trimmed.replace(
    new RegExp(
      `([${CLOSE_QUOTE_CLASS}])([。！？…!?]?)?\\s*([^${OPEN_QUOTE_CLASS}\\n]{0,48}[。！？…!?])\\s*(?=[${OPEN_QUOTE_CLASS}])`,
      'gu'
    ),
    '$1$2$3\n\n'
  );

  return broken
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

function packSentences(sentences: string[], maxChars: number, maxSentences: number): string[] {
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let current = '';
  let sentenceCount = 0;

  for (const sentence of sentences) {
    const next = current + sentence;
    const nextLen = countChineseAwareLength(next);
    if (current && (sentenceCount >= maxSentences || nextLen > maxChars)) {
      chunks.push(current.trim());
      current = sentence;
      sentenceCount = 1;
    } else {
      current = next;
      sentenceCount += 1;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

function isDialogueHeavy(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[「『“"]/.test(t)) return true;
  const quoteChars = (t.match(/[「」『』“”"]/g) || []).length;
  return quoteChars >= 2 && countChineseAwareLength(t) <= 120;
}

/** 场景分隔 / 时间跳切：合并时跳过 */
export function isSceneBoundary(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(?:---+|\*\*\*|——{2,}|☆{2,}|★{2,})$/.test(t)) return true;
  if (
    /^(?:翌日|次日|第二天|与此同时|另一边|同一时刻|这时|此时|片刻后|不久后|半晌后)/.test(t) &&
    countChineseAwareLength(t) <= 40
  ) {
    return true;
  }
  return false;
}

/** 有意短拍（沉默/停顿）：合并时跳过，避免抹平节奏 */
export function isIntentionalBeat(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const len = countChineseAwareLength(t);
  if (len === 0 || len > INTENTIONAL_BEAT_CHARS) return false;
  if (isDialogueHeavy(t)) return false;
  // 仅保护「停顿/反应」类短拍，普通短叙述仍可合并
  return /沉默|没说话|不语|无语|愣住|一顿|顿住|停住|深吸|屏息|死寂|安静了|他没动|她没动/.test(t);
}

/**
 * 合并过碎的连续叙述段，减少空行刷屏。
 * 对话段、场景边界、有意短拍不参与合并。
 */
export function mergeSparseParagraphs(paragraphs: string[]): string[] {
  if (paragraphs.length <= 1) return paragraphs;

  const merged: string[] = [];
  let buffer = paragraphs[0];

  for (let i = 1; i < paragraphs.length; i++) {
    const next = paragraphs[i];
    const bufLen = countChineseAwareLength(buffer);
    const nextLen = countChineseAwareLength(next);
    const bufSentences = splitIntoSentences(buffer).length;
    const nextSentences = splitIntoSentences(next).length;

    const protectedPair =
      isDialogueHeavy(buffer) ||
      isDialogueHeavy(next) ||
      isSceneBoundary(buffer) ||
      isSceneBoundary(next) ||
      isIntentionalBeat(buffer) ||
      isIntentionalBeat(next);

    const canMerge =
      !protectedPair &&
      bufLen + nextLen <= MAX_PARAGRAPH_CHARS &&
      bufSentences + nextSentences <= MAX_SENTENCES_PER_PARAGRAPH &&
      (bufLen < TOO_SHORT_CHARS ||
        nextLen < TOO_SHORT_CHARS ||
        bufLen + nextLen <= MERGE_TARGET_CHARS);

    if (canMerge) {
      buffer = `${buffer}${next}`;
    } else {
      merged.push(buffer);
      buffer = next;
    }
  }

  merged.push(buffer);
  return merged;
}

/**
 * 单弯引号升格为双弯引号。
 *
 * 模型偶尔整章用 ‘…’ 写对话（成对、可读），但中文出版规范里 ‘’ 是二级引号，
 * 成品缺一级引号在任何平台都是硬伤，且会让「全章无引号」门禁误判为裸台词而整章重写。
 * 只在「全文没有一对双引号」且单引号数量配平时整体升格，避免破坏 “他说‘走’。” 这类合法嵌套。
 */
function promoteSingleQuotesToPrimary(text: string): string {
  if (/\u201C[^\u201D]*\u201D/u.test(text)) return text;
  const openCount = (text.match(/\u2018/gu) ?? []).length;
  const closeCount = (text.match(/\u2019/gu) ?? []).length;
  if (openCount === 0 || openCount !== closeCount) return text;
  return text.replace(/\u2018/gu, '\u201C').replace(/\u2019/gu, '\u201D');
}

/**
 * ASCII 直引号归一为中文弯引号。
 *
 * 2026-08-26《绝症当虫治》第 6 章实测：模型整章用 "..." 写对话，弯引号配对门禁
 * （“ 与 ” 数量比对）完全不覆盖直引号，带伤入库。归一规则：
 * - 全文没有弯引号且直引号成对（出现于段首/空白后视为开引号，其余视为闭引号）时整体转换
 * - 直引号数量为奇数（丢闭引号）时只做能确定的开引号转换，剩余交给未闭合修补/门禁
 */
function normalizeStraightQuotes(text: string): string {
  const hasCurly = /[\u201C\u201D]/u.test(text);
  const straightCount = (text.match(/"/gu) ?? []).length;
  if (hasCurly || straightCount === 0) return text;

  // 按位置判定开/闭：段首、行首、空白后、开引号类字符后的 " 是开引号
  const openContext = /(?:^|[\n\s\u201C\u2018「『（(：:])$/u;
  let result = '';
  let prevChar = '';
  for (const ch of text) {
    if (ch === '"') {
      result += openContext.test(prevChar) ? '\u201C' : '\u201D';
      prevChar = result[result.length - 1];
    } else {
      result += ch;
      prevChar = ch;
    }
  }
  return result;
}

/**
 * 修补段内未闭合的对话引号：段落以开引号起头、含对话句末标点但没有闭引号时，
 * 在段末补上闭引号。
 *
 * 丢闭引号的段落（2026-08-26 实测第 6 章三处）会让 G8 引号配对门禁数量失衡，
 * 触发整章重写；实际上只需在段末补 ” 即可修复，无需浪费一次重写。
 * 保守起见只处理「段落本身就是一句对话」（以 “ 开头）的明确形态。
 */
export function repairUnterminatedDialogueQuotes(paragraphs: string[]): string[] {
  return paragraphs.map(paragraph => {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara.startsWith('\u201C')) return paragraph;
    const openCount = (trimmedPara.match(/\u201C/gu) ?? []).length;
    const closeCount = (trimmedPara.match(/\u201D/gu) ?? []).length;
    if (openCount !== closeCount + 1) return paragraph;
    // 只补一处缺口，且段末必须是句末标点（对话说完了只是引号丢了）
    if (!/[。！？…!?]\s*$/u.test(trimmedPara)) return paragraph;
    return trimmedPara + '\u201D';
  });
}

/**
 * 逐段修补失配的对话引号（通用形态，确定性）。
 *
 * 窄形态修复器（repairUnterminatedDialogueQuotes）只覆盖「段首 “、差恰好 1」，
 * 真实回归 fix2-final100 ch39 证明其余形态（段中开引号、差 >1）会连续 5 次重写
 * 全败于 G8 配对门禁、一章卡死全书——重写轮修不掉的失配，确定性补齐优于继续烧预算。
 * 逐字符配对栈找出未闭合的 “，在其后第一个句末标点处补 ”；段内无句末标点则段末补。
 */
export function repairUnbalancedQuotes(paragraphs: string[]): string[] {
  return paragraphs.map(paragraph => {
    if (!paragraph.includes('\u201C')) return paragraph;
    // 配对栈：扫描后残留的位置即未闭合的 “
    const stack: number[] = [];
    for (let i = 0; i < paragraph.length; i += 1) {
      const ch = paragraph[i];
      if (ch === '\u201C') stack.push(i);
      else if (ch === '\u201D') stack.pop();
    }
    if (stack.length === 0) return paragraph;

    let result = paragraph;
    // 从最晚的未闭合 “ 起倒序补：插入点都在更早位置之后，不影响待处理下标
    for (const openIdx of [...stack].reverse()) {
      const after = result.slice(openIdx + 1);
      const sentenceEnd = after.match(/[。！？…]/u);
      if (!sentenceEnd || sentenceEnd.index === undefined) {
        result = `${result}\u201D`;
      } else {
        const insertAt = openIdx + 1 + sentenceEnd.index + sentenceEnd[0].length;
        result = result.slice(0, insertAt) + '\u201D' + result.slice(insertAt);
      }
    }
    return result;
  });
}

/**
 * 轻量规范化：尊重模型原有分段，不做主动拆段/并段。
 *
 * 仅做：
 * - 统一换行、去掉段首段尾空白
 * - 连续空行压成一段间隔
 * - 标点归一（破折号/省略号、单弯引号升格）
 * - 修补「收引号被误甩到下一段开头」（历史拆段残留 / 偶发模型笔误）
 *
 * 段密问题交给 prompt 约束与 G8 门禁反馈，不再用启发式改写正文结构。
 */
export function normalizeWebnovelParagraphs(prose: string): string {
  if (!prose?.trim()) return prose ?? '';

  const punctuationNormalized = promoteSingleQuotesToPrimary(
    normalizeStraightQuotes(prose)
  )
    .replace(/\r\n/g, '\n')
    .replace(/—{2,}(?=[“"「『])/gu, '：')
    .replace(/—+/gu, '，')
    .replace(/--+/gu, '，')
    .replace(/…{2,}(?=[”"」』])/gu, '。')
    .replace(/…+/gu, '，');

  const paragraphs = punctuationNormalized
    // 模型响应没有编辑器软换行；单换行同样表示自然段，统一提升为标准空行。
    .split(/\n+/u)
    .map(p => p.trim())
    .filter(Boolean);

  const repaired = repairOrphanClosingQuotes(
    repairUnbalancedQuotes(repairUnterminatedDialogueQuotes(paragraphs))
  );
  return repaired.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function analyzeParagraphDensity(prose: string): ParagraphDensityStats {
  const paragraphs = prose
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return {
      paragraphCount: 0,
      longParagraphCount: 0,
      extremeParagraphCount: 0,
      longParagraphRatio: 0,
      maxParagraphChars: 0,
      avgParagraphChars: 0,
      overSentenceParagraphCount: 0,
      paragraphLengthCV: 0,
    };
  }

  const lengths = paragraphs.map(countChineseAwareLength);
  const longParagraphCount = lengths.filter(l => l > MAX_PARAGRAPH_CHARS).length;
  const extremeParagraphCount = lengths.filter(l => l > EXTREME_PARAGRAPH_CHARS).length;
  const overSentenceParagraphCount = paragraphs.filter(
    p => splitIntoSentences(p).length > MAX_SENTENCES_PER_PARAGRAPH
  ).length;
  const avgParagraphChars = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - avgParagraphChars) ** 2, 0) / lengths.length;

  return {
    paragraphCount: paragraphs.length,
    longParagraphCount,
    extremeParagraphCount,
    longParagraphRatio: longParagraphCount / paragraphs.length,
    maxParagraphChars: Math.max(...lengths),
    avgParagraphChars,
    overSentenceParagraphCount,
    paragraphLengthCV: avgParagraphChars > 0 ? Math.sqrt(variance) / avgParagraphChars : 0,
  };
}

/** 说话提示语 + 冒号 + 一整句台词，且台词没有被引号包住 */
const BARE_DIALOGUE_PATTERN =
  /(?:说|道|问|答|喊|叫|喝|吼|应|劝|骂|催|叹|笑|哑|开口|出声|脱口而出|低声|冷声|沉声|声音|嗓音|语气|意味)\s*[：:]\s*[^\u201C\u201D\u2018\u2019「」『』\n]{8,}[。！？!?]/u;

function countQuotePairs(text: string): number {
  // 单弯引号一般已被 promoteSingleQuotesToPrimary 升格；此处仍计数，兜住数量不配平
  // 而未被升格的情形——那是引号写法问题，不该被当成「全章裸台词」再罚一次整章重写。
  const pairPatterns = [
    /\u201C[^\u201D]*\u201D/gu,
    /\u2018[^\u2019]*\u2019/gu,
    /「[^」]*」/gu,
    /『[^』]*』/gu,
  ];
  return pairPatterns.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

/**
 * 根据密度统计产出门禁问题（供 G8 使用）。
 * 假定 prose 已经过 normalize；若仍超标则要求重写。
 */
export function buildTypesettingIssues(prose: string): ParagraphDensityIssue[] {
  const normalized = normalizeWebnovelParagraphs(prose);
  const stats = analyzeParagraphDensity(normalized);
  const issues: ParagraphDensityIssue[] = [];
  const paragraphs = normalized.split(/\n\s*\n/u).map(part => part.trim()).filter(Boolean);

  if (stats.paragraphCount === 0) return issues;

  if (
    stats.maxParagraphChars > HARD_MAX_PARAGRAPH_CHARS ||
    stats.longParagraphRatio >= LONG_PARAGRAPH_RATIO_THRESHOLD
  ) {
    issues.push({
      severity: 'high',
      description: `段落过密：超长段 ${stats.extremeParagraphCount} 个，长段占比 ${Math.round(stats.longParagraphRatio * 100)}%，最长 ${stats.maxParagraphChars} 字`,
      suggestion:
        '请调整分段：每段约 3～5 句、180～280 字；优先合并过碎短段；对话换人换行；忌整章大段与一句一段',
      evidence: normalized
        .split(/\n\s*\n/)
        .find(p => countChineseAwareLength(p) > EXTREME_PARAGRAPH_CHARS)
        ?.slice(0, 80),
    });
  } else if (
    stats.longParagraphCount > 0 ||
    stats.overSentenceParagraphCount > stats.paragraphCount * 0.25
  ) {
    issues.push({
      severity: 'medium',
      description: `段落偏长：长段 ${stats.longParagraphCount}/${stats.paragraphCount}，超过 ${MAX_SENTENCES_PER_PARAGRAPH} 句的段 ${stats.overSentenceParagraphCount}`,
      suggestion: '仅拆真正偏长的段；保持 3～5 句一段，不要拆成一句一段',
    });
  }

  const quotePairs = [
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
  ] as const;
  const quoteDefect = quotePairs.find(([open, close]) =>
    (normalized.split(open).length - 1) !== (normalized.split(close).length - 1)
  );
  if (quoteDefect) {
    issues.push({
      severity: 'high',
      description: `对话引号未闭合：${quoteDefect[0]} 与 ${quoteDefect[1]} 数量不一致`,
      suggestion: '逐段补齐对话开引号和收引号；换人说话必须换段',
      evidence: paragraphs.find(paragraph => paragraph.includes(quoteDefect[0]) || paragraph.includes(quoteDefect[1]))?.slice(0, 80),
    });
  }

  // 全章没有任何成对引号，却有多处「提示语＋冒号＋整句台词」——模型把对话写成了裸台词。
  // 引号数量平衡检查抓不到这种（0 对 0 也平衡），但成品缺引号在任何平台都是硬伤。
  // 真实回归：smoke:storyflow:real 第 1、2 章通篇裸台词，两道门禁全部放行。
  if (countQuotePairs(normalized) === 0) {
    const bareDialogueParagraphs = paragraphs.filter(paragraph =>
      BARE_DIALOGUE_PATTERN.test(paragraph)
    );
    if (bareDialogueParagraphs.length >= 2) {
      issues.push({
        severity: 'high',
        description: `对话未使用中文引号：${bareDialogueParagraphs.length} 处提示语后直接接台词，全章没有一对引号`,
        suggestion: '人物说出口的台词一律用成对中文引号“”包起来；换人说话另起一段',
        evidence: bareDialogueParagraphs[0]?.slice(0, 80),
      });
    }
  }

  let currentShortRun = 0;
  let longestShortRun = 0;
  for (const paragraph of paragraphs) {
    currentShortRun = countChineseAwareLength(paragraph) <= 40 ? currentShortRun + 1 : 0;
    longestShortRun = Math.max(longestShortRun, currentShortRun);
  }
  if (longestShortRun >= MAX_CONSECUTIVE_SHORT_PARAGRAPHS) {
    issues.push({
      severity: 'high',
      description: `连续碎段过多：最长连续 ${longestShortRun} 段不足 40 字`,
      suggestion: '合并同一动作或同一视角下的短段，保留必要的单句重拍，避免通篇一句一段',
    });
  }

  // 段落节奏均匀化（AI 腔信号，medium 不阻断）：段数够多、平均段长达到中长段、
  // 但变异系数过低——说明没有短拍与长段的呼吸交错。人类网文因对话独立成段
  // 与叙述段的交替，cv 通常 0.25+；模型不守「对话换行」时全章段长趋同。
  // 附带高频词计数（瞬间/缓缓/微微/如同）：百章实测它们与 CV 低下同源出现，
  // 放进同一条 warning 让重写提示能同时看到两类证据。
  if (
    stats.paragraphCount >= UNIFORM_PARAGRAPH_MIN_COUNT &&
    stats.avgParagraphChars >= UNIFORM_PARAGRAPH_MIN_AVG_CHARS &&
    stats.paragraphLengthCV < UNIFORM_PARAGRAPH_CV_THRESHOLD
  ) {
    const AI_FLAVOR_WORDS = ['瞬间', '缓缓', '微微', '如同'];
    const flavorCounts = AI_FLAVOR_WORDS.map(word => ({
      word,
      count: (prose.match(new RegExp(word, 'gu')) || []).length,
    }))
      .filter(item => item.count >= 6)
      .map(item => `${item.word}×${item.count}`);
    const flavorNote = flavorCounts.length > 0 ? `；高频词：${flavorCounts.join('、')}` : '';
    issues.push({
      severity: 'medium',
      description: `段落节奏均匀化：${stats.paragraphCount} 段平均 ${Math.round(stats.avgParagraphChars)} 字、变异系数 ${stats.paragraphLengthCV.toFixed(2)}，长短段缺乏交错${flavorNote}`,
      suggestion:
        '关键台词/冲突爆点独立成短段，铺垫叙述用长段；多人对话每个说话人单独成段' +
        (flavorCounts.length > 0
          ? '；高频词改写为具体动作/时长过渡（瞬间→话音未落、眨眼的工夫；缓缓→直接写动作过程）'
          : ''),
    });
  }

  return issues;
}

/** 组装 writingRules：排版硬约束 + 可选任务书 */
export function buildWritingRulesWithTypesetting(taskBookSection?: string | null): string {
  const parts = [TYPESETTING_HARD_RULES];
  if (taskBookSection?.trim()) {
    parts.push(taskBookSection.trim());
  }
  return parts.join('\n\n');
}
