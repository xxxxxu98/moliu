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

  fullOutline: string;

  // 增强设计
  emotionGoal?: EmotionGoal;
  conflictDesign?: ConflictDesign;
  coolPointDesign?: CoolPointDesign;
  storyLines?: StoryLines;
  coreSellingPoints?: CoreSellingPoint[];

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
 * 从 PlotOutline 中提取指定章节的完整大纲上下文
 */
export function extractChapterContext(
  plotOutline: PlotNode[],
  chapterId: string,
  chapterTitle?: string,
): ChapterOutlineContext | null {
  let node = plotOutline.find((p) => p.chapterId === chapterId);
  if (!node) node = plotOutline.find((p) => p.id === chapterId);
  if (!node) return null;

  return {
    title: node.title || chapterTitle || '未命名',
    description: node.description || '',
    orderIndex: node.orderIndex ?? 0,

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
 */
export function buildFullOutlineText(plotOutline: PlotNode[]): string {
  const chapters = plotOutline
    .filter((p) => p.type === 'chapter')
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (chapters.length === 0) return '';

  return chapters
    .map((node, i) => {
      const num = i + 1;
      const title = node.title || `第${num}章`;
      const ctx = extractChapterContext(plotOutline, node.id, title);
      const outlineText = ctx ? buildChapterOutlineText(ctx, true) : (node.description || '（暂无大纲）');
      const isClimax = node.isClimax ? ' ⭐高潮' : '';
      return `【第${num}章】${title}${isClimax}\n${outlineText}`;
    })
    .join('\n\n');
}

// ============================================
// 章节写作策略
// ============================================

/**
 * 获取章节类型对应的写作策略 prompt 片段
 */
export function getChapterTypeStrategy(chapterType?: string): string {
  const strategies: Record<string, string> = {
    world_intro: `【章节策略：世界观/背景介绍】
本章需要详细介绍故事发生的世界背景、时代设定、社会结构等。
通过人物视角和具体事件自然带出世界观信息，避免大段说明文。
开篇要点：谁、在哪、有什么、因为什么、要做什么（黄金五章公式）。`,

    character_intro: `【章节策略：人物登场/介绍】
本章重点介绍角色登场。
通过具体场景展现角色（登场方式、与环境的互动）。
外貌描写简洁有力，性格通过言行举止展现。
建立读者对角色的第一印象。`,

    plot_setup: `【章节策略：情节铺陈/故事开端】
建立故事框架：开篇引人 → 主角处境 → 埋下伏笔 → 冲突种子 → 目标建立。
开头危机五词法则：用五个以内的词讲清楚事件，让读者一眼看懂。`,

    conflict: `【章节策略：冲突展开】
逐步推进冲突规模和激烈程度。
为主角设置更多障碍和困难。
节奏加快，在关键处设置悬念。
冲突必须升级：言语冲突 → 行动冲突 → 激烈对抗 → 决定胜负。`,

    climax: `【章节策略：高潮】
这是故事最激烈的部分。
快节奏短句为主，动作+对话+情绪密集交织。
震惊三层结构：点震惊 → 网震惊 → 深度震惊。
逼格塑造：歇斯底里解决 → 不爽；风轻云淡一指灭杀 → 爽。`,

    resolution: `【章节策略：冲突解决】
矛盾化解，核心问题得到解决。
情感收尾，角色情感得到释放或升华。
结局逻辑自洽，符合前面铺垫。
收获盘点：当场收获 + 额外收获。`,

    transitional: `【章节策略：过渡章节】
节奏放缓，情节缓冲期。
伏笔铺垫，为后续情节做准备。
维持期待感：当前目标完成前，提前铺设下一目标线索。`,

    ending: `【章节策略：结尾/收束】
收束线索，将之前埋设的伏笔和线索收拢。
情感落幕，给主要情感线一个交代。
不要所有伏笔都回收，保持自然感。
避免突然说教/总结人生感悟。`,

    normal: `【章节策略：普通章节】
正常推进情节，展现角色成长。
推进人物关系发展。
保持合理叙事节奏，每章至少1个微爽点。
每章结尾必须设置钩子。`,
  };

  return strategies[chapterType || 'normal'] || strategies.normal;
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
    sections.push(`## 【八条故事线】
- 地图线：${sl.map?.current || '（暂无）'} ${sl.map?.planned?.length ? `（规划：${sl.map.planned.join('→')}）` : ''}
- 阵营线：${sl.faction?.planned?.join('、') || '（暂无）'}
- 人物线：${sl.character?.planned?.map((p: any) => p.role).join('、') || '（暂无）'}
- 金手指线：${sl.goldenfinger?.type || '（暂无）'} - 当前阶段：${sl.goldenfinger?.currentStage || 0}
- 世界观线：${sl.worldRules?.revealed?.join('、') || '（暂无）'} 待揭示：${sl.worldRules?.pending?.join('、') || '无'}
- 矛盾线：${sl.conflict?.activeConflict || '（暂无）'}
- 收集线：${sl.collection?.progress?.filter((p) => p.acquired).map((p) => p.item).join('、') || '（暂无）'}
- 感情线：${sl.romance?.currentStage ? romanceLabels[sl.romance.currentStage] || sl.romance.currentStage : '（暂无）'}
请确保章节内容推进相关故事线的发展。`);
  }

  if (ctx.coreSellingPoints?.length) {
    sections.push(`## 【核心卖点】
${ctx.coreSellingPoints.map((p) => `- ${p.name}：${p.description}`).join('\n')}
请确保章节内容体现和强化这些核心卖点。`);
  }

  return sections.join('\n\n');
}

/**
 * 获取写作风格强化 prompt 片段
 */
export function getWritingStylePrompt(style?: 'concise' | 'elegant' | 'humorous' | 'ancient'): string {
  const prompts: Record<string, string> = {
    concise: `## 【风格强化：简洁有力】
- 惜字如金，每句话都要有信息量
- 短句为主，避免冗长描写
- 对话利落，像真人说话
- 动作代替心理描写`,

    elegant: `## 【风格强化：文笔华丽】
- 辞藻优美，意境深远
- 描写细腻，注重感官细节
- 善用修辞，文字有画面感
- 节奏舒缓但不拖沓`,

    humorous: `## 【风格强化：幽默风趣】
- 轻松诙谐，妙语连珠
- 吐槽和反转是核心武器
- 角色对话要有趣味
- 紧张场景中穿插幽默缓解气氛`,

    ancient: `## 【风格强化：古风典雅】
- 用词典雅，韵味悠长
- 善用四字词和对仗
- 人物对话半文半白
- 意境描写多于直白叙述`,
  };

  return prompts[style || ''] || '';
}

/**
 * 构建完整的高潮章节特殊 prompt
 */
export function getClimaxStrategy(): string {
  return `【高潮章节特殊要求】
本章为高潮章节！需要：
- 最强的冲突对抗，所有矛盾在此爆发
- 最密集的情绪爆发，情感张力拉到最大
- 最震撼的逆转或揭示，信息量要足够大
- 最快的节奏，所有描写都要服务于张力
- 章尾钩子要足够强，悬念要让人欲罢不能
请将以上要素发挥到极致。`;
}
