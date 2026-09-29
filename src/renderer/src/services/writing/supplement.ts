/**
 * 字数检查与补充续写（共享工具）
 *
 * 智能续写 / 批量续写 / ChapterWritingPipeline 共用同一套阈值与 prompt，
 * 避免 useChapterWriter 与管道各写一份。
 */

import { countWords } from './utils';
import { normalizeWebnovelParagraphs } from './typesetting';

/** 最低字数阈值（目标字数的 80%）。
 *  0.85 → 0.80：快模型（如 deepseek-v4-flash）系统性欠写，实测常落在 80-85%
 *  区间被判 blocking 拒收，浪费整章重试预算。0.80（目标 2000→下限 1600）
 *  仍属主流网文单章正常字数，显著降低误杀。 */
export const MIN_WORD_THRESHOLD = 0.8;
/**
 * 最高字数阈值（目标字数的 118%，补写上限）。
 * 3000 字目标对应 3540 字；主流网文章节中 3500 字仍属正常波动，避免 3520 左右的
 * 完整成稿仅因几十字擦边而耗尽整章重试。明显超长稿（4000+）仍会被拦截。
 */
export const MAX_WORD_THRESHOLD = 1.18;
/** 最多补充轮次 */
export const MAX_SUPPLEMENT_ROUNDS = 3;
/**
 * 补字提前停阈值：正文达目标该比例且结尾已闭合时，不再补字。
 * 与 MIN_WORD_THRESHOLD 对齐，消除「补字停在更低比例但字数 blocking 判定要更高」的灰区。
 */
export const SUPPLEMENT_STOP_THRESHOLD = MIN_WORD_THRESHOLD;

export interface WordCountCheck {
  needsSupplement: boolean;
  currentWords: number;
  targetWords: number;
  shortfall: number;
  percentage: number;
}

/**
 * 检查正文是否达到最低字数阈值。
 */
export function checkWordCount(content: string, target: number): WordCountCheck {
  const currentWords = countWords(content);
  const minRequired = Math.floor(target * MIN_WORD_THRESHOLD);
  const percentage = target > 0 ? (currentWords / target) * 100 : 0;

  return {
    needsSupplement: currentWords < minRequired,
    currentWords,
    targetWords: target,
    shortfall: Math.max(0, minRequired - currentWords),
    percentage,
  };
}

export interface WordCountBoundsCheck {
  currentWords: number;
  targetWords: number;
  minWords: number;
  maxWords: number;
  status: 'ok' | 'short' | 'over';
  percentage: number;
}

/**
 * 检查正文是否落在目标字数的硬性区间 [MIN_WORD_THRESHOLD, MAX_WORD_THRESHOLD]。
 */
export function checkWordCountBounds(content: string, target: number): WordCountBoundsCheck {
  const currentWords = countWords(content);
  const minWords = Math.floor(target * MIN_WORD_THRESHOLD);
  const maxWords = Math.ceil(target * MAX_WORD_THRESHOLD);
  const percentage = target > 0 ? (currentWords / target) * 100 : 0;
  let status: WordCountBoundsCheck['status'] = 'ok';
  if (target > 0 && currentWords < minWords) status = 'short';
  else if (target > 0 && currentWords > maxWords) status = 'over';
  return { currentWords, targetWords: target, minWords, maxWords, status, percentage };
}

export interface BuildCondensePromptParams {
  existingContent: string;
  targetWordCount: number;
  minWords: number;
  maxWords: number;
  chapterTitle: string;
  chapterOutline?: string;
}

/**
 * 构建超长压缩改写提示词（保留情节，压到目标区间）。
 */
export function buildCondensePrompt(params: BuildCondensePromptParams): string {
  const currentWords = countWords(params.existingContent);
  return `【压缩改写指令】

## 当前状态
- 已有字数：约 ${currentWords} 字（已超上限）
- 目标字数：约 ${params.targetWordCount} 字
- 硬性区间：${params.minWords}–${params.maxWords} 字

## 压缩要求
1. **必须整章重写为更紧凑版本**，输出完整正文（不是增量）
2. **硬性字数**：压缩后必须落在 ${params.minWords}–${params.maxWords} 字；**严禁压到低于 ${params.minWords} 字**
3. **保留全部关键情节与章末钩子**，不得删掉冲突兑现与结尾悬念
4. **删冗余**：重复描写、同义反复、无推进注水优先删；不要把整章删成梗概
5. **禁止另起炉灶**：人物关系、已发生事件、证据细节不得改写跑偏
6. **分段**：基准 1～3 句一段（多数 20～90 字），关键拍可一句话独立成段；忌超长大段——与起草排版合同同口径，压缩不得把段落合并变长

## 章节上下文
- 章节标题：${params.chapterTitle}
- 章节大纲：${params.chapterOutline || '（无）'}

## 原文（请压缩）
${params.existingContent}

请输出压缩后的完整章节正文。`;
}

export type CondenseRecoveryStrategy = 'condensed' | 'original-kept' | 'condensed-kept';

export interface ChooseProseAfterCondenseResult {
  prose: string;
  strategy: CondenseRecoveryStrategy;
  bounds: WordCountBoundsCheck;
}

/**
 * AI 压缩后的字数决策（优先正文质量，不再硬裁）：
 * - 落在区间 → 用压缩稿
 * - 压得太短（塌方）→ 回退原文，不再硬裁（保留完整正文，宁可偏长也不掐断）
 * - 仍超长 → 用压缩稿，不再硬裁（压缩稿已是流畅重写，硬裁会破坏文气）
 */
export function chooseProseAfterCondense(params: {
  originalProse: string;
  condensedProse: string;
  target: number;
}): ChooseProseAfterCondenseResult {
  const condensedBounds = checkWordCountBounds(params.condensedProse, params.target);
  if (condensedBounds.status === 'ok') {
    return {
      prose: params.condensedProse,
      strategy: 'condensed',
      bounds: condensedBounds,
    };
  }

  // AI 压缩塌方（如 5000→800）：压缩稿不可用，回退原文。
  // 不再硬裁——硬裁会从中间掐断正文、破坏文气；宁可偏长也保留完整原文。
  if (condensedBounds.status === 'short') {
    return {
      prose: params.originalProse,
      strategy: 'original-kept',
      bounds: checkWordCountBounds(params.originalProse, params.target),
    };
  }

  // AI 压缩完仍超上限：压缩稿已是模型完整重写的流畅版本，只是没压到目标区间。
  // 硬裁会掐断正文、破坏文气，故直接采用压缩稿。
  return {
    prose: params.condensedProse,
    strategy: 'condensed-kept',
    bounds: condensedBounds,
  };
}

/**
 * 字数仍低于下限时，注入 blocking 问题，驱动重写循环 / 拒收提交。
 */
export function buildWordCountShortfallIssue(
  prose: string,
  target: number
): {
  id: string;
  domain: 'fulfillment';
  severity: 'blocking';
  message: string;
  evidence: string[];
} | null {
  if (target <= 0) return null;
  const bounds = checkWordCountBounds(prose, target);
  if (bounds.status !== 'short') return null;
  return {
    id: `word-count-short:${bounds.currentWords}/${bounds.minWords}`,
    domain: 'fulfillment',
    severity: 'blocking',
    message: `字数严重不足：当前约 ${bounds.currentWords} 字，至少需 ${bounds.minWords} 字（目标 ${target}）。请扩写关键情节、对话与感官细节，禁止注水凑字，也禁止再压成梗概。`,
    evidence: [
      `currentWords=${bounds.currentWords}`,
      `minWords=${bounds.minWords}`,
      `targetWords=${target}`,
    ],
  };
}

/**
 * 正文落库前的统一字数硬门禁。短于下限和长于上限都会返回 blocking；
 * 调用方可以保留 rejected 草稿用于诊断/人工处理，但不得标记为 accepted。
 */
export function buildWordCountBoundsIssue(
  prose: string,
  target: number
): {
  id: string;
  domain: 'fulfillment';
  severity: 'blocking';
  message: string;
  evidence: string[];
} | null {
  if (target <= 0) return null;
  const bounds = checkWordCountBounds(prose, target);
  if (bounds.status === 'ok') return null;
  if (bounds.status === 'short') {
    return buildWordCountShortfallIssue(prose, target);
  }
  return {
    id: `word-count-over:${bounds.currentWords}/${bounds.maxWords}`,
    domain: 'fulfillment',
    severity: 'blocking',
    message: `字数严重超限：当前约 ${bounds.currentWords} 字，最多允许 ${bounds.maxWords} 字（目标 ${target}）。请压缩重复解释、低效对话与无推进描写，同时保留关键情节和章尾钩子。`,
    evidence: [
      `currentWords=${bounds.currentWords}`,
      `maxWords=${bounds.maxWords}`,
      `targetWords=${target}`,
    ],
  };
}

export interface BuildSupplementPromptParams {
  existingContent: string;
  targetWordCount: number;
  additionalWords: number;
  round: number;
  maxRounds?: number;
  chapterTitle: string;
  chapterOutline?: string;
  /** 尚未写满的履约节点 / 章末钩子，补字必须朝它们推进 */
  pendingBeats?: string[];
  /**
   * 本章允许现身/发声的角色名。补字与起草共用同一份白名单，
   * 否则补字会拉来未到登场章的角色，触发 critical 门禁并让整章重写。
   */
  allowedAppearanceNames?: string[];
  /** 本章禁区（合同 forbidden），补字同样受约束 */
  forbiddenZones?: string[];
  /**
   * 输出格式：'json' 表示调用方要求 AI 只返回 JSON 数组（如 LongFormWritingEngine 补字路径，
   * system 已要求 {"paragraphs":[...]}）；'plain' 表示直接输出正文（runSupplementRounds 纯文本路径）。
   * 默认 'plain'。区分二者避免“只输出 JSON”与“直接输出补充内容”两条指令互相矛盾
   * （曾导致 AI 输出纯散文、解析失败重试）。
   */
  outputFormat?: 'json' | 'plain';
}

const DEFAULT_ENDING_SNIPPET_CHARS = 500;

/** 整章塞进补字上下文的字数上限；超过则退回结尾片段锚定 */
const FULL_CHAPTER_CONTEXT_CHARS = 6000;

/**
 * 截取原文结尾供补充续写锚定：优先段落边界，其次句末标点，避免从半句起读。
 */
export function sliceEndingSnippet(
  content: string,
  maxChars: number = DEFAULT_ENDING_SNIPPET_CHARS
): string {
  const text = content.trim();
  if (!text) return '（无）';
  if (text.length <= maxChars) return text;

  const raw = text.slice(-maxChars);
  const paragraphBreak = raw.search(/\n\s*\n/u);
  if (paragraphBreak >= 0 && paragraphBreak < raw.length - 20) {
    const fromParagraph = raw.slice(paragraphBreak).replace(/^\s+/, '');
    if (fromParagraph.length >= 40) return fromParagraph;
  }

  const sentenceMatch = raw.match(/[。！？…」』》”.!?]/u);
  if (sentenceMatch && typeof sentenceMatch.index === 'number') {
    const fromSentence = raw.slice(sentenceMatch.index + sentenceMatch[0].length).trimStart();
    if (fromSentence.length >= 40) return fromSentence;
  }

  const lineBreak = raw.indexOf('\n');
  if (lineBreak >= 0 && lineBreak < raw.length - 20) {
    const fromLine = raw.slice(lineBreak + 1).trimStart();
    if (fromLine.length >= 40) return fromLine;
  }

  return raw;
}

/**
 * 构建补充续写提示词（纯函数，不依赖 Vue / store）。
 */
export function buildSupplementPrompt(params: BuildSupplementPromptParams): string {
  const {
    existingContent,
    targetWordCount,
    additionalWords,
    round,
    maxRounds = MAX_SUPPLEMENT_ROUNDS,
    chapterTitle,
    chapterOutline,
    pendingBeats = [],
    allowedAppearanceNames = [],
    forbiddenZones = [],
    outputFormat = 'plain',
  } = params;

  const currentWords = countWords(existingContent);
  const beats = pendingBeats.map(item => item.trim()).filter(Boolean).slice(0, 6);
  const beatSection =
    beats.length > 0
      ? `\n## 必须推进的未完成节点（优先写场面，禁止只提一句）\n${beats
          .map((item, index) => `${index + 1}. ${item}`)
          .join('\n')}\n`
      : '';

  // 只给 500 字结尾片段时，模型看不到本章前半程已经确立的事实（谁死了、哪天画的押），
  // 补出来的段落常与前文互相打架，反而触发 logic_gap 让整章重写。
  // 单章体量本就只有几千字，能整章塞就整章塞，让补字在完整事实面前续写。
  const trimmedContent = existingContent.trim();
  const includeFullChapter = trimmedContent.length > 0 && trimmedContent.length <= FULL_CHAPTER_CONTEXT_CHARS;
  const contentSection = includeFullChapter
    ? `## 本章已写正文（禁止与其中任何事实冲突，也不要重复其中场面；请接着最后一段往下写）
${trimmedContent}`
    : `## 原文结尾（请从这里继续）
${sliceEndingSnippet(existingContent)}`;

  const constraintLines = [
    allowedAppearanceNames.length > 0
      ? `- 【出场名单】本章只有以下角色可以现身、说话或行动：${allowedAppearanceNames.join('、')}；其他角色最多作为背景被提及，不得到场或发声`
      : '',
    forbiddenZones.length > 0
      ? `- 【禁区】不得触碰：${forbiddenZones.join('；')}`
      : '',
  ].filter(Boolean);
  const constraintSection =
    constraintLines.length > 0 ? `\n## 硬约束\n${constraintLines.join('\n')}\n` : '';

  return `【补充续写指令】

## 当前状态
- 已有字数：约 ${currentWords} 字
- 目标字数：约 ${targetWordCount} 字
- 本次补充：约 ${additionalWords} 字
- 补充轮次：第 ${round}/${maxRounds} 轮

## 补充要求
1. **自然衔接**：从原文结尾处继续，不要重复已有内容
2. **保持风格**：与原文保持一致的文风、语气和叙事节奏
3. **内容充实**：用对话、动作、取证、对峙推进未完成节点；禁止纯夜色/回忆/心理独白注水
4. **禁止复读**：不要再次穿越醒来、不要无因由再次入狱、不要把已写过的公堂戏换皮重写
5. **衔接自然**：补充内容与原文之间过渡要自然，不突兀
6. **分段适中**：每段约 3～5 句、180～280 字；段间空行；忌一句一段与超长大段
7. **事实一致**：人物的生死、时间、身份、持有物必须与前文完全一致；不确定就不要写死
${beatSection}${constraintSection}
${contentSection}

## 章节上下文
- 章节标题：${chapterTitle}
- 章节大纲：${chapterOutline || '（无）'}

${
  outputFormat === 'json'
    ? '只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}（与 system 要求一致）。不要输出 Markdown 代码块，不要任何前后解释文字。'
    : '请直接输出补充内容正文，不要添加任何前缀说明，不要输出 Markdown 代码块。'
}`;
}

/** 补写起草回调：只负责按 prompt 生成一段增量正文 */
export interface SupplementDrafter {
  draft(prompt: string, maxTokens: number): Promise<string>;
}

export interface RunSupplementRoundsParams {
  prose: string;
  targetWordCount: number;
  drafter: SupplementDrafter;
  chapterTitle: string;
  chapterOutline?: string;
  maxRounds?: number;
  /** 用户停止时 abort，中断补写循环与在飞请求 */
  signal?: AbortSignal;
  /**
   * 每轮补写成功后的回调。
   * @param round 当前轮次（从 1 开始）
   * @param delta 本轮新增正文（非全文）
   * @param fullProse 追加后的全文
   */
  onRound?: (round: number, delta: string, fullProse: string) => void | Promise<void>;
  /**
   * 每轮持久化前校验追加后的完整正文。
   * 返回错误文本即拒绝本轮，且不会调用 onRound。
   */
  validateRound?: (
    round: number,
    delta: string,
    fullProse: string
  ) => string | null | Promise<string | null>;
}

export interface RunSupplementRoundsResult {
  prose: string;
  rounds: number;
  /** 补写生成、校验或持久化失败时的明确原因。 */
  error?: string;
}

/**
 * 按阈值循环补写，直到达标或达到最大轮次。
 * 单轮失败则停止（保留已有正文），不抛错。
 */
export async function runSupplementRounds(
  params: RunSupplementRoundsParams
): Promise<RunSupplementRoundsResult> {
  const maxRounds = params.maxRounds ?? MAX_SUPPLEMENT_ROUNDS;
  let prose = params.prose;
  let rounds = 0;

  while (rounds < maxRounds) {
    if (params.signal?.aborted) {
      return {
        prose,
        rounds,
        error: 'Generation stopped by user',
      };
    }

    const check = checkWordCount(prose, params.targetWordCount);
    if (!check.needsSupplement) {
      break;
    }

    const maxSupplement =
      Math.ceil(params.targetWordCount * MAX_WORD_THRESHOLD) - check.currentWords;
    if (maxSupplement <= 0) {
      break;
    }

    const additionalWords = Math.min(
      check.shortfall || Math.ceil(params.targetWordCount * 0.3),
      maxSupplement
    );

    const round = rounds + 1;
    const prompt = buildSupplementPrompt({
      existingContent: prose,
      targetWordCount: params.targetWordCount,
      additionalWords,
      round,
      maxRounds,
      chapterTitle: params.chapterTitle,
      chapterOutline: params.chapterOutline,
    });

    try {
      const delta = (await params.drafter.draft(prompt, Math.ceil(additionalWords))).trim();
      if (!delta) {
        break;
      }
      // 输出护栏（与 LongFormWritingEngine 补充轮一致）：单轮补充输出异常膨胀
      // （如模型把 JSON 骨架当正文）时丢弃该轮，避免垃圾正文入库。
      const maxDeltaChars = Math.max(6000, Math.ceil(params.targetWordCount * 3));
      if (delta.length > maxDeltaChars) {
        console.warn(
          `[Supplement] 第 ${round} 轮补充输出异常膨胀（${delta.length} 字符 > ${maxDeltaChars}），丢弃该轮`
        );
        break;
      }

      const separator = prose && !prose.endsWith('\n') ? '\n\n' : '';
      const candidateProse = normalizeWebnovelParagraphs(prose + separator + delta);
      const validationError = await params.validateRound?.(round, delta, candidateProse);
      if (validationError) {
        return {
          prose,
          rounds,
          error: `第 ${round} 轮补写校验失败：${validationError}`,
        };
      }

      // 持久化成功后才把候选正文纳入返回值，避免内存结果与落库内容分叉。
      await params.onRound?.(round, delta, candidateProse);
      prose = candidateProse;
      rounds = round;
    } catch (err) {
      if (
        params.signal?.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return {
          prose,
          rounds,
          error: 'Generation stopped by user',
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Supplement] 第 ${round} 轮补写失败，停止补写:`, err);
      return {
        prose,
        rounds,
        error: `第 ${round} 轮补写失败：${message}`,
      };
    }
  }

  return { prose: normalizeWebnovelParagraphs(prose), rounds };
}
