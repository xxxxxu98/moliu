/**
 * 动态字数目标计算
 * 
 * 根据章节位置、内容密度动态调整字数目标，替代固定 3000 字。
 * 
 * 设计原则:
 * - 黄金三章: 节奏紧凑，控制在 2500-2700 字
 * - 高潮章节: 张力充足，3500-4000 字
 * - 内容密集: 事件多的章节需要更多篇幅
 * - 过渡章节: 事件少的章节可以更短
 * - 边界保护: 2400-4500 字，避免极端值
 */

export interface DynamicWordCountInput {
  /** 当前章号 (1-based) */
  chapterNumber: number;
  /** 计划总章数 */
  totalChapters: number;
  /** 章节大纲结构 (可选，用于计算内容密度) */
  plotNode?: {
    CBN?: string;
    CPNs?: string[];
    CEN?: string;
    mustCover?: string[];
  };
  /** 基准字数 (默认 3000) */
  baseWordCount?: number;
}

/** 字数目标范围 */
const MIN_WORD_TARGET = 2400;
const MAX_WORD_TARGET = 4500;
const DEFAULT_BASE_WORD_COUNT = 3000;

/** 黄金三章目标字数 (节奏紧凑) */
const GOLDEN_THREE_WORD_COUNT = 2600;

/** 高潮章节目标字数 (张力充足) */
const CLIMAX_WORD_COUNT = 3800;

/** 事件密度调整系数: 每个额外事件 +200 字 */
const EVENT_DENSITY_WEIGHT = 200;

/** 过渡章节减少字数 */
const TRANSITION_CHAPTER_REDUCTION = 300;

/**
 * 判断是否为高潮章节
 * 
 * 规则:
 * - 最后 5 章 (大结局)
 * - 每 25 章的倒数第 2 章 (小高潮)
 */
function isClimaxChapter(chapterNumber: number, totalChapters: number): boolean {
  // 最后 5 章
  if (totalChapters - chapterNumber < 5) {
    return true;
  }
  
  // 每 25 章的倒数第 2 章 (例如: 24, 49, 74, 99, ...)
  if (chapterNumber % 25 === 24) {
    return true;
  }
  
  return false;
}

/**
 * 计算内容密度
 * 
 * 依据:
 * - CBN (章核心冲突): 权重 1
 * - CPNs (章情节节点): 每个权重 1
 * - CEN (章结束): 权重 0 (结尾不计入密度)
 * - mustCover (必履约内容): 每项权重 1
 * 
 * @returns 内容节点总数
 */
function calculateContentDensity(plotNode?: DynamicWordCountInput['plotNode']): number {
  if (!plotNode) {
    return 0;
  }
  
  let density = 0;
  
  // CBN 计 1 个节点
  if (plotNode.CBN && plotNode.CBN.trim().length > 0) {
    density += 1;
  }
  
  // CPNs 每个计 1 个节点
  if (plotNode.CPNs) {
    density += plotNode.CPNs.filter(cpn => cpn.trim().length > 0).length;
  }
  
  // mustCover 每项计 1 个节点
  if (plotNode.mustCover) {
    density += plotNode.mustCover.filter(item => item.trim().length > 0).length;
  }
  
  return density;
}

/**
 * 动态计算章节字数目标
 * 
 * 计算流程:
 * 1. 黄金三章: 固定 2600 字 (优先级最高)
 * 2. 高潮章节: 固定 3800 字
 * 3. 普通章节: 从基准字数开始调整
 *    - 内容密集 (节点数 > 3): 每个额外节点 +200 字
 *    - 过渡章节 (节点数 ≤ 1): -300 字
 * 4. 边界保护: 限制在 2400-4500 字范围内
 * 
 * @example
 * // 黄金三章
 * calculateDynamicWordCount({ chapterNumber: 1, totalChapters: 100 })
 * // => 2600
 * 
 * // 高潮章节 (第 96 章)
 * calculateDynamicWordCount({ chapterNumber: 96, totalChapters: 100 })
 * // => 3800
 * 
 * // 内容密集章节 (5 个节点)
 * calculateDynamicWordCount({
 *   chapterNumber: 10,
 *   totalChapters: 100,
 *   plotNode: {
 *     CBN: '核心冲突',
 *     CPNs: ['节点1', '节点2', '节点3'],
 *     mustCover: ['必履约1']
 *   }
 * })
 * // => 3000 + (5 - 3) * 200 = 3400
 * 
 * // 过渡章节 (1 个节点)
 * calculateDynamicWordCount({
 *   chapterNumber: 10,
 *   totalChapters: 100,
 *   plotNode: { CBN: '简单过渡' }
 * })
 * // => 3000 - 300 = 2700
 */
export function calculateDynamicWordCount(input: DynamicWordCountInput): number {
  const baseWordCount = input.baseWordCount ?? DEFAULT_BASE_WORD_COUNT;
  
  // 1. 黄金三章: 固定 2600 字 (优先级最高)
  if (input.chapterNumber <= 3) {
    return GOLDEN_THREE_WORD_COUNT;
  }
  
  // 2. 高潮章节: 固定 3800 字
  if (isClimaxChapter(input.chapterNumber, input.totalChapters)) {
    return CLIMAX_WORD_COUNT;
  }
  
  // 3. 普通章节: 根据内容密度调整
  let wordCount = baseWordCount;
  
  // 只有提供了 plotNode 才进行密度调整
  if (input.plotNode) {
    const contentDensity = calculateContentDensity(input.plotNode);
    
    // 内容密集 (节点数 > 3): 每个额外节点 +200 字
    if (contentDensity > 3) {
      wordCount += (contentDensity - 3) * EVENT_DENSITY_WEIGHT;
    }
    // 过渡章节 (节点数 ≤ 1): -300 字
    else if (contentDensity <= 1) {
      wordCount -= TRANSITION_CHAPTER_REDUCTION;
    }
  }
  
  // 4. 边界保护: 2400-4500 字
  return Math.max(MIN_WORD_TARGET, Math.min(MAX_WORD_TARGET, wordCount));
}

/**
 * 批量计算多章字数目标
 * 
 * @param chapters 章节数组
 * @param totalChapters 计划总章数
 * @returns 每章的字数目标数组
 */
export function calculateBatchWordCounts(
  chapters: Array<{
    chapterNumber: number;
    plotNode?: DynamicWordCountInput['plotNode'];
  }>,
  totalChapters: number
): number[] {
  return chapters.map(chapter =>
    calculateDynamicWordCount({
      chapterNumber: chapter.chapterNumber,
      totalChapters,
      plotNode: chapter.plotNode,
    })
  );
}
