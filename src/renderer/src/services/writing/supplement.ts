/**
 * 字数检查与补充续写（共享工具）
 *
 * 智能续写 / 批量续写 / ChapterWritingPipeline 共用同一套阈值与 prompt，
 * 避免 useChapterWriter 与管道各写一份。
 */

import { countWords } from './utils';
import { normalizeWebnovelParagraphs } from './typesetting';

/** 最低字数阈值（目标字数的 85%） */
export const MIN_WORD_THRESHOLD = 0.85;
/** 最高字数阈值（目标字数的 115%，补写上限） */
export const MAX_WORD_THRESHOLD = 1.15;
/** 最多补充轮次 */
export const MAX_SUPPLEMENT_ROUNDS = 3;
/**
 * 补字提前停阈值：正文达目标该比例且结尾已闭合时，不再补字。
 * 与 MIN_WORD_THRESHOLD 对齐（85%），消除「补字停在 80% 但字数 blocking 判定要 85%」的灰区。
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
 * 检查正文是否落在目标字数的硬性区间 [85%, 115%]。
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
6. **分段适中**：每段约 3～5 句；忌超长大段

## 章节上下文
- 章节标题：${params.chapterTitle}
- 章节大纲：${params.chapterOutline || '（无）'}

## 原文（请压缩）
${params.existingContent}

请输出压缩后的完整章节正文。`;
}

/**
 * 超长硬裁：保留开头 + 结尾（章末钩子），按句边界压到 maxWords 以内。
 * 仅作 AI 压缩失败后的兜底，保证提交字数不炸上限。
 */
export function clampProseToMaxWords(prose: string, maxWords: number): string {
  const text = prose.trim();
  if (!text || maxWords <= 0 || countWords(text) <= maxWords) {
    return text;
  }

  const sentences = text.match(/[^。！？!?…]+[。！？!?…]?/gu);
  if (!sentences || sentences.length === 0) {
    return text;
  }

  const tailBudget = Math.max(1, Math.floor(maxWords * 0.3));
  const headBudget = Math.max(1, maxWords - tailBudget);

  const tail: string[] = [];
  let tailWords = 0;
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const piece = sentences[i];
    const words = countWords(piece);
    if (tail.length > 0 && tailWords + words > tailBudget) {
      break;
    }
    tail.unshift(piece);
    tailWords += words;
  }

  const tailStart = sentences.length - tail.length;
  const head: string[] = [];
  let headWords = 0;
  for (let i = 0; i < tailStart; i += 1) {
    const piece = sentences[i];
    const words = countWords(piece);
    if (head.length > 0 && headWords + words > headBudget) {
      break;
    }
    head.push(piece);
    headWords += words;
  }

  const merged = `${head.join('')}${tail.join('')}`.trim();
  if (!merged || countWords(merged) === 0) {
    // 极端短句场景：退化为按句从头累计
    const fallback: string[] = [];
    let used = 0;
    for (const piece of sentences) {
      const words = countWords(piece);
      if (fallback.length > 0 && used + words > maxWords) break;
      fallback.push(piece);
      used += words;
    }
    return fallback.join('').trim() || text;
  }
  return merged;
}

export type CondenseRecoveryStrategy = 'condensed' | 'original-clamp' | 'condensed-clamp';

export interface ChooseProseAfterCondenseResult {
  prose: string;
  strategy: CondenseRecoveryStrategy;
  bounds: WordCountBoundsCheck;
}

/**
 * AI 压缩后的字数决策：
 * - 落在区间 → 用压缩稿
 * - 压得太短 → 丢弃压缩稿，对原文硬裁到 max（避免 5000→800 塌方）
 * - 仍超长 → 对压缩稿（或原文）硬裁到 max
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

  if (condensedBounds.status === 'short') {
    const recovered = clampProseToMaxWords(params.originalProse, condensedBounds.maxWords);
    return {
      prose: recovered,
      strategy: 'original-clamp',
      bounds: checkWordCountBounds(recovered, params.target),
    };
  }

  const clamped = clampProseToMaxWords(params.condensedProse, condensedBounds.maxWords);
  return {
    prose: clamped,
    strategy: 'condensed-clamp',
    bounds: checkWordCountBounds(clamped, params.target),
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
   * 输出格式：'json' 表示调用方要求 AI 只返回 JSON 数组（如 LongFormWritingEngine 补字路径，
   * system 已要求 {"paragraphs":[...]}）；'plain' 表示直接输出正文（runSupplementRounds 纯文本路径）。
   * 默认 'plain'。区分二者避免“只输出 JSON”与“直接输出补充内容”两条指令互相矛盾
   * （曾导致 AI 输出纯散文、解析失败重试）。
   */
  outputFormat?: 'json' | 'plain';
}

const DEFAULT_ENDING_SNIPPET_CHARS = 500;

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
    outputFormat = 'plain',
  } = params;

  const currentWords = countWords(existingContent);
  const endingSnippet = sliceEndingSnippet(existingContent);
  const beats = pendingBeats.map(item => item.trim()).filter(Boolean).slice(0, 6);
  const beatSection =
    beats.length > 0
      ? `\n## 必须推进的未完成节点（优先写场面，禁止只提一句）\n${beats
          .map((item, index) => `${index + 1}. ${item}`)
          .join('\n')}\n`
      : '';

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
${beatSection}
## 原文结尾（请从这里继续）
${endingSnippet}

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
