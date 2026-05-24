/**
 * Prompt System - Quick Outline Prompt (v2)
 * 快速大纲提示词 - 基于 oh-story 和 webnovel-writer 方法论重构
 */

import type { ExtendedGenreTemplate } from '../../knowledge';
import {
  buildCorePrinciplesPrompt,
  buildEightStrandsPrompt,
  buildConflictEscalationPrompt,
  COOL_POINT_DENSITY,
} from './core-principles';

/**
 * 快速大纲生成选项
 */
export interface QuickOutlinePromptOptions {
  seed: string;
  genre?: string;
  wordCountRange?: string;
  template?: ExtendedGenreTemplate;
  generateCount?: number;
}

/**
 * 构建快速大纲提示词
 */
export function buildQuickOutlinePrompt(options: QuickOutlinePromptOptions): {
  system: string;
  user: string;
} {
  const {
    seed,
    genre = '通用',
    wordCountRange = '50万-100万字',
    template,
    generateCount = 3
  } = options;

  const system = buildSystemPrompt(genre, template, wordCountRange, generateCount);
  const user = buildUserPrompt(seed, generateCount);

  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(
  genre: string,
  template: ExtendedGenreTemplate | undefined,
  wordCountRange: string,
  generateCount: number
): string {
  const genreSection = template ? buildGenreSection(template) : '';

  return `你是一位专业的小说创作顾问。根据用户的创意种子，生成结构清晰的故事大纲。

${buildCorePrinciplesPrompt()}

${genreSection}

${buildEightStrandsPrompt()}

${buildConflictEscalationPrompt()}

【大纲结构】
每个大纲必须包含：
1. **标题**：一个吸引人的故事标题
2. **题材标签**：1-2个核心题材
3. **简介**：60-80字的核心冲突和主题
4. **世界观**：
   - 地点：1-2个主要场景
   - 势力：1-2个对立/合作势力
   - 规则：核心力量/能力体系
5. **主角设定**：
   - 身份背景
   - 核心性格标签（2-3个关键词）
   - 金手指/独特优势
   - 当前困境
6. **反派设定**：
   - 小反派（新手村/前10章）
   - 中反派（中期势力）
   - 大反派（终极Boss）
7. **情绪目标**：
   - 核心情绪
   - 情绪弧线
8. **八条故事线规划**（简要）
9. **爽点规划**：
   - 核心爽点2-3个
   - 爽点节奏
10. **卷级规划**（2-3卷）

【字数要求】
预估字数：${wordCountRange}

【输出格式】
请以 Markdown 格式输出${generateCount}个大纲，每个大纲使用二级标题（## 大纲X）。

## 大纲1

### 基本信息

- **标题**：故事标题
- **题材标签**：题材1、题材2
- **预估字数**：500000
- **一句话简介**：60-80字的故事简介

### 情绪目标

- **核心情绪**：热血/甜蜜/紧张等
- **次要情绪**：次要情绪
- **情绪弧线**：rising/falling/wave/mixed
- **情绪密度**：3000
- **情绪高点**：5, 20, 50
- **情绪低点**：10, 30

### 世界设定

- **世界类型**：世界类型

#### 主要地点

| 地点名称 | 描述 | 等级 |
|----------|------|------|
| 地点1 | 描述 | city/district/special |

#### 主要势力

| 势力名称 | 描述 | 盟友 | 敌人 |
|----------|------|------|------|
| 势力1 | 描述 | 盟友 | 敌人 |

#### 核心规则

| 规则名称 | 描述 | 类别 |
|----------|------|------|
| 规则1 | 描述 | cultivation/magic/social |

### 角色设定

#### 主角

- **姓名**：角色名
- **角色类型**：protagonist/antagonist/mentor/supporting
- **描述**：角色描述
- **性格标签**：性格标签1、性格标签2
- **金手指**：金手指（如有）
- **优势**：优势1
- **短板**：短板1
- **人际关系**：
  - 关联角色（friend/enemy/mentor/lover）：关系描述

### 三幕结构

#### 第一幕（建置，约20%）

第一幕描述

#### 第二幕A（对抗上半，约25%）

第二幕A描述

#### 第二幕B（对抗下半，约25%）

第二幕B描述

#### 第三幕（结局，约30%）

第三幕描述

### 爽点设计

#### 爽点类型

打脸爽、装逼爽、身份揭秘、实力碾压

#### 爽点安排

| 章节 | 类型 | 描述 |
|------|------|------|
| 5 | 爽点类型 | 爽点描述 |

### 核心卖点

| 名称 | 描述 | 优先级 |
|------|------|--------|
| 卖点名称 | 卖点描述 | 1 |

### 矛盾设计

- **冲突来源**：资源/利益、阵营/种族等

#### 矛盾递进

1. 一级矛盾
2. 二级矛盾
3. 三级矛盾
4. 四级矛盾

#### 主要冲突

- 主要冲突1
- 主要冲突2

### 八条故事线

#### 地图线

地图线规划（地点递进）

#### 阵营线

阵营线规划（势力发展）

#### 人物线

人物线规划（角色登场）

#### 金手指线

金手指线规划（能力升级）

#### 世界观线

世界观线规划（设定揭示）

#### 矛盾线

矛盾线规划（冲突递进）

#### 收集线

收集线规划（材料收集）

#### 感情线

感情线规划（感情发展）

### 伏笔规划

| 内容 | 类型 | 建议章节 |
|------|------|----------|
| 伏笔内容 | item/dialogue/event/mystery | 10 |

### 章节概览

| 章节 | 标题 | 摘要 | 关键事件 | 涉及角色 |
|------|------|------|----------|----------|
| 1 | 章节标题 | 章节摘要 | 关键事件1 | 角色1 |

请确保每个大纲都有独特的卖点和风格，所有字段都要完整填写。`;
}

/**
 * 构建题材特定章节
 */
function buildGenreSection(template: ExtendedGenreTemplate): string {
  let section = `\n【题材：${template.name}】\n${template.description}\n`;

  if (template.subGenres?.length) {
    section += `\n可选流派：${template.subGenres.map((s: { name: string; description: string }) => `${s.name}：${s.description}`).join('、')}\n`;
  }

  if (template.coreCoolPoints?.length) {
    section += `\n核心爽点：${template.coreCoolPoints.join('、')}\n`;
  }

  if (template.powerSystem) {
    section += `\n力量体系：${template.powerSystem.name}\n`;
    section += `等级划分：${template.powerSystem.levels.slice(0, 5).join(' → ')}...\n`;
  }

  if (template.factionTypes) {
    section += `\n势力类型：${template.factionTypes.slice(0, 3).join('、')}...\n`;
  }

  if (template.paceCharacteristics) {
    section += `\n节奏特点：\n`;
    section += `- 开篇：${template.paceCharacteristics.opening}\n`;
    section += `- 发展：${template.paceCharacteristics.development}\n`;
    section += `- 高潮：${template.paceCharacteristics.climax}\n`;
  }

  if (template.antiPatterns?.length) {
    section += `\n禁忌：${template.antiPatterns.slice(0, 2).join('、')}\n`;
  }

  return section;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(seed: string, count: number): string {
  return `用户的创意种子：

${seed}

请根据以上创意种子，生成${count}个不同风格的网文大纲。每个大纲都要有独特的卖点，避免同质化。`;
}

/**
 * 构建五步大纲法提示词
 */
export function buildFiveStepPrompt(params: {
  step: number;
  userInput: string;
  previousSteps?: Record<number, any>;
  genre?: string;
  wordCountRange?: string;
}): { system: string; user: string } {
  const { step, userInput, previousSteps = {}, genre, wordCountRange } = params;

  // 解析字数范围
  const wordCountNum = parseWordCount(wordCountRange);
  const totalChapters = Math.ceil(wordCountNum / 2000);
  const chaptersPerVolume = Math.ceil(wordCountNum / 150000);

  // 动态生成情绪密度建议（基于字数）
  const emotionDensity = 3000; // 固定值，但可以根据字数调整
  const highPointChapters = generateHighPoints(totalChapters);
  const lowPointChapters = generateLowPoints(totalChapters);

  const stepPrompts: Record<number, { title: string; system: string; user: string }> = {
    1: {
      title: '确定情绪目标',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户确定故事的情绪目标。

【字数背景】
目标字数：${wordCountRange || '50万-100万字'}
预计总章节数：${totalChapters}章
情绪波动间隔：每${emotionDensity}字

【任务】
分析用户的创意种子，确定故事要传达的核心情绪。

${buildCorePrinciplesPrompt()}

【需要输出的内容】
1. 核心情绪：主要让读者感受到什么？（热血/甜蜜/虐心/紧张/悬疑/治愈等）
2. 情绪弧线：情绪如何发展？（从低到高/波动起伏/M形/N形等）
3. 情绪密度：多久需要有一个情绪波动？（建议每${emotionDensity}字）
4. 情绪高点：计划在哪几个章节设置情绪高峰？${wordCountNum > 500000 ? `（建议设置${Math.ceil(totalChapters * 0.1)}-${Math.ceil(totalChapters * 0.2)}个）` : ''}

【输出格式】
请以 Markdown 格式输出，使用清晰的标题结构：

# 情绪目标

- **核心情绪**：热血/甜蜜/虐心/紧张/悬疑等
- **情绪弧线**：rising/falling/wave/mixed
- **情绪密度**：${emotionDensity}
- **情绪高点**：${highPointChapters}
- **情绪低点**：${lowPointChapters}

请用 Markdown 格式输出情绪目标规划。`,
      user: `用户的创意种子：

${userInput}

请分析并输出情绪目标规划。`,
    },

    2: {
      title: '设计核心设定',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的世界观和核心设定。

【字数背景】
目标字数：${wordCountRange || '50万-100万字'}
预计总章节数：${totalChapters}章
建议卷数：${chaptersPerVolume}卷

【任务】
根据已有信息，设计故事的世界观体系。

【需要输出的内容】
1. 世界类型：都市/古代/异世界/未来/玄幻
2. 核心规则：力量体系/社会规则/特殊设定
3. 世界矛盾：这个世界的核心冲突是什么？
4. 金手指设计：主角的独特优势
5. 升级体系：实力如何递进？（建议${Math.ceil(wordCountNum / 100000)}个主要阶段）

【参考已有信息】
${JSON.stringify(previousSteps, null, 2)}

【输出格式】
请以 Markdown 格式输出，使用清晰的标题结构：

# 世界设定

## 世界类型

世界类型

## 力量体系

- **名称**：力量体系
- **等级**：等级列表

## 金手指

金手指设计

## 核心冲突

世界核心冲突

请用 Markdown 格式输出世界观和核心设定。`,
      user: `请基于上述信息设计世界观和核心设定。`,
    },

    3: {
      title: '设计主角设定',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的主角。

【任务】
设计一个能让读者代入的主角。

${buildCorePrinciplesPrompt()}

【需要输出的内容】
1. 主角标签：让读者一想到这个词就想到主角的关键词
2. 身份背景：主角是谁，从哪里来
3. 性格特点：2-3个核心性格词
4. 优势与短板：让主角真实可信
5. 成长弧线：主角如何成长变化？
6. 当前困境：开篇主角面临的问题

【注意事项】
- 主角要有明显的优点和缺点
- 困境要具体，让读者有代入感
- 性格要能在压力下展现变化

【输出格式】
请以 Markdown 格式输出，使用清晰的标题结构：

# 主角设定

## 基本信息

- **姓名**：主角名
- **性格标签**：标签1、标签2
- **身份背景**：身份背景

## 金手指

金手指

## 优势与短板

- **优势**：优势1
- **短板**：短板1

## 核心动机

核心动机

## 当前困境

当前困境

请用 Markdown 格式输出主角的完整设定。`,
      user: `请设计主角的完整设定。`,
    },

    4: {
      title: '设计故事结构',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的整体结构。

【字数背景】
目标字数：${wordCountRange || '50万-100万字'}
预计总章节数：${totalChapters}章
建议卷数：${chaptersPerVolume}卷

【任务】
规划故事的整体框架和关键节点。

${buildEightStrandsPrompt()}

${buildConflictEscalationPrompt()}

【关键节点规划】
1. 建置阶段（约第1-${Math.ceil(totalChapters * 0.2)}章）：建立世界、主角、核心冲突
2. 催化剂（第${Math.ceil(totalChapters * 0.2)}章左右）：触发主角行动的关键事件
3. 中点（约第${Math.ceil(totalChapters * 0.5)}章）：重大转折或揭示
4. 反派逼近（第${Math.ceil(totalChapters * 0.7)}章左右）：最大危机
5. 结局（第${Math.ceil(totalChapters * 0.9)}-${totalChapters}章）：高潮与收尾

3. 关键转折点：列出${Math.min(5, Math.ceil(totalChapters * 0.05))}个重大转折

【注意事项】
- 开篇前3000字决定读者去留
- 每个大情节要有起伏
- 高潮要足够震撼

【输出格式】
请以 Markdown 格式输出，使用清晰的标题结构：

# 故事结构

## 八条故事线

### 地图线

描述

### 阵营线

描述

### 人物线

描述

### 金手指线

描述

### 世界观线

描述

### 矛盾线

描述

### 收集线

描述

### 感情线

描述

## 矛盾递进

1. 一级矛盾
2. 二级矛盾
3. 三级矛盾
4. 四级矛盾

## 关键转折点

- 转折1
- 转折2
- 转折3

请用 Markdown 格式输出故事的完整结构。`,
      user: `请设计故事的完整结构。`,
    },

    5: {
      title: '设计爽点安排',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户规划故事的爽点。

【字数背景】
目标字数：${wordCountRange || '50万-100万字'}
预计总章节数：${totalChapters}章
微爽点数量：约${Math.ceil(wordCountNum / COOL_POINT_DENSITY.micro)}个
小爽点数量：约${Math.ceil(wordCountNum / COOL_POINT_DENSITY.small)}个
大爽点数量：约${Math.ceil(wordCountNum / COOL_POINT_DENSITY.big)}个

【任务】
设计让读者过瘾的精彩场景。

${buildCorePrinciplesPrompt()}

【需要输出的内容】
1. 爽点类型：准备使用哪些类型的爽点
   - 装逼打脸
   - 实力碾压
   - 意外收获
   - 感情突破
   - 真相揭示
   - 复仇成功

2. 爽点节奏：
   - 微爽点：约${Math.ceil(wordCountNum / COOL_POINT_DENSITY.micro)}个（每${COOL_POINT_DENSITY.micro}字1个）
   - 小爽点：约${Math.ceil(wordCountNum / COOL_POINT_DENSITY.small)}个（每${COOL_POINT_DENSITY.small}字1个）
   - 大爽点：约${Math.ceil(wordCountNum / COOL_POINT_DENSITY.big)}个（每${COOL_POINT_DENSITY.big}字1个）

3. 核心高潮：计划${Math.min(5, Math.ceil(totalChapters * 0.05))}个大高潮场景（分布在关键转折点）

4. 铺垫设计：每个大爽点需要什么铺垫？

【注意事项】
- 爽点要提前铺垫
- 爽点要有递进，越来越大
- 形式要多样化
- 长篇作品需要周期性大爽点保持读者兴趣

【输出格式】
请以 Markdown 格式输出，使用清晰的标题结构：

# 爽点安排

## 爽点类型

- 装逼打脸
- 实力碾压
- 意外收获
- 感情突破
- 真相揭示
- 复仇成功

## 爽点规划

| 章节 | 类型 | 描述 |
|------|------|------|
| 5 | micro | 描述 |

## 核心高潮

描述2-3个大高潮场景

## 铺垫设计

每个大爽点需要的铺垫

请用 Markdown 格式输出爽点的完整安排。`,
      user: `请设计爽点的完整安排。`,
    },
  };

  const stepData = stepPrompts[step] || stepPrompts[1];

  return {
    system: stepData.system,
    user: stepData.user,
  };
}

/**
 * 解析字数范围为数字
 */
function parseWordCount(wordCountRange?: string): number {
  if (!wordCountRange) return 500000;
  // 匹配 "50万-100万字" 或 "50-100万字" 等格式
  const match = wordCountRange.match(/(\d+(?:\.\d+)?)\s*万/);
  if (match) {
    const wan = parseFloat(match[1]);
    // 如果有范围，取中间值
    if (wordCountRange.includes('-')) {
      return Math.round(wan * 5000); // 取范围中间值，估算为万字的0.5倍
    }
    return Math.round(wan * 10000);
  }
  // 默认返回50万字
  return 500000;
}

/**
 * 根据总章节数生成情绪高点建议
 */
function generateHighPoints(totalChapters: number): string {
  const highPoints = [];
  const ratios = [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95];
  for (const ratio of ratios) {
    const chapter = Math.max(1, Math.ceil(totalChapters * ratio));
    highPoints.push(chapter);
    if (highPoints.length >= 5) break;
  }
  return highPoints.join(', ');
}

/**
 * 根据总章节数生成情绪低点建议
 */
function generateLowPoints(totalChapters: number): string {
  const lowPoints = [];
  const ratios = [0.1, 0.25, 0.4, 0.6, 0.8];
  for (const ratio of ratios) {
    const chapter = Math.max(1, Math.ceil(totalChapters * ratio));
    lowPoints.push(chapter);
    if (lowPoints.length >= 4) break;
  }
  return lowPoints.join(', ');
}

/**
 * 构建章节写作提示词
 */
export function buildChapterWritingPrompt(params: {
  chapterNumber: number;
  chapterTitle: string;
  previousContent: string;
  chapterOutline: string;
  knowledgeContext?: string;
  genre?: string;
}): { system: string; user: string } {
  const {
    chapterNumber,
    chapterTitle,
    previousContent,
    chapterOutline,
    knowledgeContext,
    genre = '通用'
  } = params;

  const system = `你是一位专业的小说作家。你的任务是续写第${chapterNumber}章。

【核心原则】写得真实，而非写得正确
- 不要写出"正确"的文章，要写出"像那么回事"的文章
- 有脾气、有漏洞、有意外才是真人写作

【写作要求】
1. 仔细阅读上文，理解当前情节走向和写作风格
2. 续写内容要与前文自然衔接
3. 结尾要有吸引力，设置悬念

【Show, Don't Tell】
禁止直接描写情绪：
❌ "他感到非常愤怒"
❌ "她感到十分惊讶"
✅ "他一拳砸在桌上，杯子震得跳了起来。"
✅ "她愣住了，半天才回过神来。"

【掐断升华】
禁止在结尾进行总结、说教：
❌ "这就是成长"、"这就是人生"
✅ 停在对话/悬念/未完成动作上

${knowledgeContext ? `\n【知识参考】\n${knowledgeContext}\n` : ''}

【题材提示】
${genre !== '通用' ? `当前题材：${genre}` : '通用题材'}`;

  const user = `【上章结尾】
${previousContent.slice(-500)}

【本章章纲】
${chapterOutline}

请续写第${chapterNumber}章的内容。`;

  return { system, user };
}
