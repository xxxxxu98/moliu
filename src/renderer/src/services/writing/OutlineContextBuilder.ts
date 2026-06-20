/**
 * 大纲上下文构建器
 *
 * 统一从 plotOutline 提取章节上下文，避免在 useChapterWriter / useBatchWriter 中重复代码。
 * 所有续写相关的上下文构建都通过此模块完成。
 */

import type {
  PlotNode,
  Project,
  EmotionGoal,
  ConflictDesign,
  CoolPointDesign,
  StoryLines,
  CoreSellingPoint,
  ProjectStartupPack,
} from '@/types/project';

// ============================================
// 类型定义
// ============================================

/** 单个章节的大纲上下文 */
export interface ChapterOutlineContext {
  title: string;
  description: string;
  orderIndex: number;

  // 结构化节点
  CBN?: string;
  CPNs?: string[];
  CEN?: string;
  mustCover?: string[];
  forbiddenZones?: string[];

  // 章节写作策略（大纲新增字段）
  chapterType?: PlotNode['chapterType'];
  hookType?: PlotNode['hookType'];
  pacingStrategy?: PlotNode['pacingStrategy'];
  timeSpan?: string;
  keyEvents?: string[];
  isClimax?: boolean;
  expectedCoolPoints?: number;
}

/** 增强的项目上下文（包含所有大纲增强字段） */
export interface EnhancedProjectContext {
  projectTitle: string;
  projectSynopsis: string;
  projectGenre: string[];

  currentChapter: ChapterOutlineContext;
  currentChapterOutline: string;

  // 增强设计
  emotionGoal?: EmotionGoal;
  conflictDesign?: ConflictDesign;
  coolPointDesign?: CoolPointDesign;
  storyLines?: StoryLines;
  coreSellingPoints?: CoreSellingPoint[];
  /** 前 30 章启动包（首页大纲产出） */
  startupPack?: ProjectStartupPack;

  // 写作配置
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';

  // 记忆系统
  memoryData?: {
    shortTermFullText?: string;
    characterStateTable?: string;
    plotProgressTable?: string;
    mediumTermMemories?: Array<{ chapterIndex: number; chapterTitle: string; corePlot: string }>;
    longTermSummary?: {
      allKeyEvents?: string[];
      allLocations?: string[];
      activeForeshadows?: string[];
    };
  };
}

// ============================================
// 工具映射表
// ============================================

const CHAPTER_TYPE_LABELS: Record<string, string> = {
  world_intro: '世界观介绍',
  character_intro: '人物登场',
  plot_setup: '情节铺陈',
  conflict: '冲突展开',
  climax: '高潮',
  resolution: '冲突解决',
  transitional: '过渡章节',
  ending: '结尾收束',
  normal: '普通章节',
};

const HOOK_TYPE_LABELS: Record<string, string> = {
  sudden_reveal: '突然揭示',
  urgent_crisis: '紧急危机',
  unfinished_action: '未完成动作',
  identity_reveal: '身份反转',
  tough_choice: '两难抉择',
  mysterious_item: '神秘物品',
  countdown: '倒计时',
  promise_threat: '承诺/威胁',
  strange_disappear: '神秘消失',
  hidden_meaning: '隐含深意',
  imagery: '意象留白',
  echo: '首尾呼应',
  blank: '悬念留白',
};

const PACE_LABELS: Record<string, string> = {
  build_up: '蓄势铺垫（慢节奏）',
  confront: '对峙冲突（中节奏）',
  release: '释放爆发（快节奏）',
  normal: '正常节奏',
};

const COOL_POINT_LABELS: Record<string, string> = {
  'face-slapping': '打脸',
  'show-off': '装逼',
  'identity-reveal': '身份揭秘',
  'growth': '成长突破',
  'rescue': '英雄救美',
  'treasure': '寻宝获宝',
  'breakthrough': '境界突破',
  'romance': '甜蜜恋爱',
  'revenge': '复仇快感',
  'mystery-reveal': '谜题揭开',
  'comedy': '搞笑逗比',
  'justice': '伸张正义',
};

// ============================================
// 核心提取函数
// ============================================

/**
 * 取出所有"章节型" plot 节点，按章节序号升序排列。
 *
 * 注意：首页大纲 buildPlotOutline 在 act/subplot 节点之后才追加 chapter 节点，
 * 且 chapter 节点的 orderIndex 是按全节点列表长度累加的（会被前面的 act/subplot 污染），
 * 因此这里不能直接按 orderIndex 排序——要先过滤到 chapter 型，再用 orderIndex 比较相对顺序。
 */
export function getChapterPlotNodes(plotOutline: PlotNode[]): PlotNode[] {
  return plotOutline
    .filter((p) => p.type === 'chapter')
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/**
 * 从 PlotOutline 中提取指定章节的完整大纲上下文
 *
 * 查找优先级（任一命中即返回）：
 * 1. plot 节点的 `chapterId` 显式等于传入 chapterId（用户在编辑器里绑定过的）
 * 2. plot 节点的 `id` 等于传入 chapterId（buildFullOutlineText 内部走这条：传入的就是 plot 节点 id）
 * 3. 位置兜底：在 chapter 型节点序列里按 `chapterOrderIndex` 取第 N 个
 *    —— 首页大纲路径下没有真实 Chapter，只能靠"第 N 个 chapter 节点 = 第 N 章"对齐
 *
 * @param plotOutline  全部 plot 节点
 * @param chapterId    当前章节 ID（或 buildFullOutlineText 调用时的 plot 节点 id）
 * @param chapterTitle 章节标题（仅用于回退展示）
 * @param chapterOrderIndex 章节在全书中的 0-based 序号，用于位置兜底；不传则禁用兜底
 */
export function extractChapterContext(
  plotOutline: PlotNode[],
  chapterId: string,
  chapterTitle?: string,
  chapterOrderIndex?: number,
): ChapterOutlineContext | null {
  // 章节型节点序列（按 orderIndex 升序）。同时用于位置兜底和 positional orderIndex 计算。
  const chapterNodes = getChapterPlotNodes(plotOutline);

  // 1. 显式 chapterId 绑定
  let node = plotOutline.find((p) => p.chapterId === chapterId);
  // 2. plot 节点 id 直接命中（buildFullOutlineText 场景）
  if (!node) node = plotOutline.find((p) => p.id === chapterId);
  // 3. 位置兜底：第 N 个 chapter 型节点对应第 N 章
  if (!node && chapterOrderIndex !== undefined && chapterOrderIndex >= 0) {
    node = chapterNodes[chapterOrderIndex];
  }
  if (!node) return null;

  // orderIndex 用「在 chapter 型节点序列中的位置」，而非节点原始 orderIndex。
  // 首页大纲落地时 chapter 节点的 orderIndex 会被前面的 act/subplot 污染（不是 0-based 章节序号），
  // 直接透传会导致 buildEnhancedDesignPrompt 的「前 30 章启动包」窗口判断错位（提前若干章丢弃启动包）。
  const positionalIndex = chapterNodes.findIndex((n) => n.id === node.id);

  return plotNodeToContext(
    node,
    chapterTitle,
    positionalIndex >= 0 ? positionalIndex : (node.orderIndex ?? 0),
  );
}

/**
 * 把 PlotNode 直接映射成 ChapterOutlineContext。
 *
 * 抽出来供 extractChapterContext / buildFullOutlineText / buildWindowedOutlineText 共用，
 * 避免后两者为了拿 ctx 再回头调 extractChapterContext（内部 find 会造成 O(N²)）。
 *
 * @param overrideOrderIndex 显式 orderIndex（通常是位置序号），不传则用 node.orderIndex
 */
function plotNodeToContext(
  node: PlotNode,
  fallbackTitle?: string,
  overrideOrderIndex?: number,
): ChapterOutlineContext {
  return {
    title: node.title || fallbackTitle || '未命名',
    description: node.description || '',
    orderIndex: overrideOrderIndex ?? node.orderIndex ?? 0,

    CBN: node.CBN,
    CPNs: node.CPNs,
    CEN: node.CEN,
    mustCover: node.mustCover,
    forbiddenZones: node.forbiddenZones,

    chapterType: node.chapterType,
    hookType: node.hookType,
    pacingStrategy: node.pacingStrategy,
    timeSpan: node.timeSpan,
    keyEvents: node.keyEvents,
    isClimax: node.isClimax,
    expectedCoolPoints: node.expectedCoolPoints,
  };
}

// ============================================
// Prompt 文本构建函数
// ============================================

/**
 * 将 ChapterOutlineContext 拼接为 AI 可读的 prompt 文本
 * @param includeStrategyFields 是否包含 chapterType/hookType 等策略字段
 */
export function buildChapterOutlineText(
  ctx: ChapterOutlineContext,
  includeStrategyFields: boolean = true,
): string {
  const parts: string[] = [];

  if (ctx.description) {
    parts.push(ctx.description);
  }

  if (ctx.CBN) parts.push(`【章节起点 CBN】${ctx.CBN}`);
  if (ctx.CPNs?.length) {
    parts.push(`【推进节点 CPNs】\n  ${ctx.CPNs.map((c, i) => `${i + 1}. ${c}`).join('\n  ')}`);
  }
  if (ctx.CEN) parts.push(`【章节终点 CEN】${ctx.CEN}`);
  if (ctx.mustCover?.length) parts.push(`【必须覆盖】${ctx.mustCover.join('、')}`);
  if (ctx.forbiddenZones?.length) parts.push(`【禁区】${ctx.forbiddenZones.join('、')}`);

  if (includeStrategyFields) {
    if (ctx.chapterType) {
      parts.push(`【章节类型】${CHAPTER_TYPE_LABELS[ctx.chapterType] || ctx.chapterType}`);
    }

    if (ctx.hookType) {
      parts.push(`【章尾钩子】${HOOK_TYPE_LABELS[ctx.hookType] || ctx.hookType}`);
    }

    if (ctx.pacingStrategy) {
      parts.push(`【节奏策略】${PACE_LABELS[ctx.pacingStrategy] || ctx.pacingStrategy}`);
    }

    if (ctx.timeSpan) {
      parts.push(`【章节时长】${ctx.timeSpan}`);
    }

    if (ctx.keyEvents?.length) {
      parts.push(`【关键事件】${ctx.keyEvents.join(' → ')}`);
    }

    if (ctx.isClimax) {
      parts.push('【重要】本章为高潮章节，需强化冲突和情感张力');
    }
  }

  return parts.join('\n');
}

/**
 * 构建完整大纲文本（所有章节，供 AI 参考）
 *
 * 注意：长篇下全书大纲每写一章都全量灌入会大量浪费 token 并稀释对当前章的聚焦。
 * 续写场景应优先使用 {@link buildWindowedOutlineText}；本函数保留给"展示/导出全书大纲"等少数场景。
 */
export function buildFullOutlineText(plotOutline: PlotNode[]): string {
  const chapters = getChapterPlotNodes(plotOutline);

  if (chapters.length === 0) return '';

  return chapters
    .map((node, i) => {
      const num = i + 1;
      const title = node.title || `第${num}章`;
      // 直接由 node 构造 ctx，不再回头调 extractChapterContext（避免每章一次 find 造成 O(N²)）。
      const ctx = plotNodeToContext(node, title, i);
      const outlineText = buildChapterOutlineText(ctx, true);
      const isClimax = node.isClimax ? ' ⭐高潮' : '';
      return `【第${num}章】${title}${isClimax}\n${outlineText}`;
    })
    .join('\n\n');
}

/**
 * 窗口化的大纲文本：只保留当前章 ± windowSize 章的细纲，其它章节仅给标题。
 *
 * 长篇续写时替代 {@link buildFullOutlineText} 注入 prompt：
 * - 当前章前后 N 章给完整 CBN/CPNs/CEN，让模型能看清上下承接
 * - 其它章节只列一行标题，模型仍知道全书骨架，但不会被远端章节细节稀释注意力
 * - 大幅降低 token 消耗（200 章时窗口=5 大约从全量降到 ~5%）
 *
 * @param plotOutline     全部 plot 节点
 * @param chapterOrderIndex 当前章节的 0-based 序号
 * @param windowSize      当前章前后各保留多少章细纲，默认 5
 */
export function buildWindowedOutlineText(
  plotOutline: PlotNode[],
  chapterOrderIndex: number,
  windowSize: number = 5,
): string {
  const chapters = getChapterPlotNodes(plotOutline);
  if (chapters.length === 0) return '';

  // 越界 clamp（R4 修复）：真实章节数可能多于大纲节点数（用户手动加章），
  // 此时传入的 chapterOrderIndex 会落在 chapters.length 之外，
  // 导致 `i === current` 永不命中、当前章无细纲、所有章节只剩标题行。
  // 这里把 current 钳到 [0, length-1]，保证总有 1 章被标“当前章”。
  const current = Math.min(Math.max(0, chapterOrderIndex), chapters.length - 1);
  const lo = Math.max(0, current - windowSize);
  const hi = Math.min(chapters.length - 1, current + windowSize);

  const lines: string[] = [];
  if (lo > 0) {
    lines.push(`……（省略前 ${lo} 章）……\n`);
  }
  chapters.forEach((node, i) => {
    const num = i + 1;
    const title = node.title || `第${num}章`;
    const isClimax = node.isClimax ? ' ⭐高潮' : '';
    if (i === current) {
      // 当前章细纲已由调用方（useChapterWriter.buildWritingPromptParts）通过 currentChapterOutline
      // 单独注入到 prompt，这里只给标题占位，避免同一章的 CBN/CPNs/CEN 在 prompt 里重复出现。
      lines.push(`【第${num}章】【当前章】${title}${isClimax}（详见上方「本章大纲」）`);
    } else if (i >= lo && i <= hi) {
      const ctx = plotNodeToContext(node, title, i);
      const outlineText = buildChapterOutlineText(ctx, true);
      lines.push(`【第${num}章】${title}${isClimax}\n${outlineText}`);
    } else {
      lines.push(`【第${num}章】${title}${isClimax}`);
    }
  });
  if (hi < chapters.length - 1) {
    lines.push(`\n……（省略后 ${chapters.length - 1 - hi} 章）……`);
  }
  return lines.join('\n\n');
}

// ============================================
// 增强设计 prompt 构建
// ============================================

/**
 * 构建增强设计（情绪/矛盾/爽点/故事线/卖点）的 prompt 段落
 */
export function buildEnhancedDesignPrompt(ctx: EnhancedProjectContext): string {
  const sections: string[] = [];

  if (ctx.emotionGoal) {
    const eg = ctx.emotionGoal;
    sections.push(`## 【情绪目标】
- 核心情绪：${eg.primary}
${eg.secondary ? `- 次要情绪：${eg.secondary}` : ''}
- 情绪弧线：${eg.arc}
- 波动间隔：每 ${eg.density} 字
${eg.highPoints?.length ? `- 情绪高点章节：第 ${eg.highPoints.join('、')} 章` : ''}
${eg.lowPoints?.length ? `- 情绪低点章节：第 ${eg.lowPoints.join('、')} 章` : ''}
请根据当前章节的情绪定位，合理安排情感铺垫和爆发。`);
  }

  if (ctx.conflictDesign) {
    const cd = ctx.conflictDesign;
    const escalationText = cd.escalation
      ?.map((e) => `${e.level}级：${e.name}`)
      .join(' → ') || '暂无';
    sections.push(`## 【矛盾设计】
- 冲突来源：${cd.source}
- 矛盾递进：${escalationText}
${cd.majorConflicts?.length ? `- 主要冲突：\n${cd.majorConflicts.map((c) => `  · ${c.title}（${c.type}级）`).join('\n')}` : ''}
请在章节中推进或揭示相关矛盾冲突。`);
  }

  if (ctx.coolPointDesign) {
    const cp = ctx.coolPointDesign;
    const patterns = cp.patterns
      ?.map((p) => COOL_POINT_LABELS[p] || p)
      .join('、') || '';
    sections.push(`## 【爽点设计】
- 爽点类型：${patterns || '暂无'}
- 爽点密度：微爽每 ${cp.density?.micro} 字 / 小爽每 ${cp.density?.small} 字 / 大爽每 ${cp.density?.big} 字
${cp.arranged?.length ? `- 已安排爽点：\n${cp.arranged.map((a) => `  · 第${a.chapter}章：${COOL_POINT_LABELS[a.type] || a.type} - ${a.description}`).join('\n')}` : ''}
请在章节中安排适当的爽点节奏。`);
  }

  if (ctx.storyLines) {
    const sl = ctx.storyLines;
    const romanceLabels: Record<string, string> = {
      cold: '冷淡期',
      warm: '暧昧期',
      hot: '热恋期',
      climax: '高潮期',
    };
    // 人物线（Bug 3 修复）：planned 形如 [{id, role}]，id 才是角色名。
    // 原实现取 p.role，导致输出“主角、盟友、反派”而非真名，人物线信息全部丢失。
    const characterLine = sl.character?.planned
      ?.map((p: any) => p.id || p.name || p.role)
      .filter(Boolean)
      .join('、') || '（暂无）';
    // 收集线（Bug 4 修复）：normalizeStoryLines 把收集目标放在 collection.target，
    // progress 恒为 []，原实现读取 progress 导致收集线永远显示“（暂无）”。
    const acquiredCollectibles = (sl.collection?.progress || [])
      .filter((p: any) => p.acquired)
      .map((p: any) => p.item)
      .filter(Boolean);
    const collectionTarget = Array.isArray(sl.collection?.target)
      ? sl.collection.target.join('、')
      : (sl.collection?.target as string | undefined);
    const collectionLine = acquiredCollectibles.length > 0
      ? `已获：${acquiredCollectibles.join('、')}`
      : collectionTarget || '';

    sections.push(`## 【八条故事线】
- 地图线：${sl.map?.current || '（暂无）'} ${sl.map?.planned?.length ? `（规划：${sl.map.planned.join('→')}）` : ''}
- 阵营线：${sl.faction?.planned?.join('、') || '（暂无）'}
- 人物线：${characterLine}
- 金手指线：${sl.goldenfinger?.type || '（暂无）'} - 当前阶段：${sl.goldenfinger?.currentStage || 0}
- 世界观线：${sl.worldRules?.revealed?.join('、') || '（暂无）'} 待揭示：${sl.worldRules?.pending?.join('、') || '无'}
- 矛盾线：${sl.conflict?.activeConflict || '（暂无）'}
- 收集线：${collectionLine || '（暂无）'}
- 感情线：${sl.romance?.currentStage ? romanceLabels[sl.romance.currentStage] || sl.romance.currentStage : '（暂无）'}
请确保章节内容推进相关故事线的发展。`);
  }

  if (ctx.coreSellingPoints?.length) {
    sections.push(`## 【核心卖点】
${ctx.coreSellingPoints.map((p) => `- ${p.name}：${p.description}`).join('\n')}
请确保章节内容体现和强化这些核心卖点。`);
  }

  // 开篇承诺（前 30 章启动包）—— 主要在续写前 30 章时生效
  // 仅当前章节属于启动区间（orderIndex + 1 <= 30）时才注入，避免长篇后期冗余
  const currentChapterNo = (ctx.currentChapter.orderIndex ?? 0) + 1;
  if (ctx.startupPack && currentChapterNo <= 30) {
    const sp = ctx.startupPack;
    sections.push(`## 【开篇承诺与前 30 章启动包】
- 开篇钩子：${sp.openingHook || '（暂无）'}
- 对读者的承诺：${sp.promiseToReader || '（暂无）'}
- 主角第一印象：${sp.protagonistFirstImpression || '（暂无）'}
- 首个大爽点：${sp.firstMajorCoolPoint || '（暂无）'}
- 首个冲突循环：${sp.firstConflictCycle || '（暂无）'}
${sp.chapterBlocks?.length ? sp.chapterBlocks.map((b) => `- 第${b.range}章：${b.objective}（节奏：${b.pacing === 'fast' ? '快' : '中'}；读者期待：${b.readerExpectation || '无'}）`).join('\n') : ''}
当前是第 ${currentChapterNo} 章，请严格落实启动包对应的承诺与节奏。开篇 30 章是黄金留存窗口，必须强力推进主角处境、立人设、埋冲突、铺爽点。`);
  }

  return sections.join('\n\n');
}
