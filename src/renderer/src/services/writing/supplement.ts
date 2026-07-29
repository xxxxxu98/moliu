/**
 * 字数检查与补充续写（共享工具）
 *
 * 智能续写 / 批量续写 / ChapterWritingPipeline 共用同一套阈值与 prompt，
 * 避免 useChapterWriter 与管道各写一份。
 */

import { countWords } from './utils';

/** 最低字数阈值（目标字数的 85%） */
export const MIN_WORD_THRESHOLD = 0.85;
/** 最高字数阈值（目标字数的 115%，补写上限） */
export const MAX_WORD_THRESHOLD = 1.15;
/** 最多补充轮次 */
export const MAX_SUPPLEMENT_ROUNDS = 3;

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

export interface BuildSupplementPromptParams {
  existingContent: string;
  targetWordCount: number;
  additionalWords: number;
  round: number;
  maxRounds?: number;
  chapterTitle: string;
  chapterOutline?: string;
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
  } = params;

  const currentWords = countWords(existingContent);
  const endingSnippet = existingContent.slice(-500) || '（无）';

  return `【补充续写指令】

## 当前状态
- 已有字数：约 ${currentWords} 字
- 目标字数：约 ${targetWordCount} 字
- 本次补充：约 ${additionalWords} 字
- 补充轮次：第 ${round}/${maxRounds} 轮

## 补充要求
1. **自然衔接**：从原文结尾处继续，不要重复已有内容
2. **保持风格**：与原文保持一致的文风、语气和叙事节奏
3. **内容充实**：补充的内容要有实质性情节推进，不要凑字数
4. **衔接自然**：补充内容与原文之间过渡要自然，不突兀

## 原文结尾（请从这里继续）
${endingSnippet}

## 章节上下文
- 章节标题：${chapterTitle}
- 章节大纲：${chapterOutline || '（无）'}

请直接输出补充内容，不要添加任何前缀说明。`;
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

      const separator = prose && !prose.endsWith('\n') ? '\n\n' : '';
      const candidateProse = prose + separator + delta;
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
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Supplement] 第 ${round} 轮补写失败，停止补写:`, err);
      return {
        prose,
        rounds,
        error: `第 ${round} 轮补写失败：${message}`,
      };
    }
  }

  return { prose, rounds };
}
