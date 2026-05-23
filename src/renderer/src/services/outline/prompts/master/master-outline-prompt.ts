/**
 * Prompt System - Master Outline Prompt (v2)
 * 总纲提示词 - 基于 oh-story 和 webnovel-writer 方法论重构
 */

import type { ExtendedGenreTemplate } from '../../knowledge';
import {
  buildCorePrinciplesPrompt,
  buildEightStrandsPrompt,
  buildConflictEscalationPrompt,
  COOL_POINT_DENSITY,
} from '../system/core-principles';

/**
 * 总纲提示词选项
 */
export interface MasterOutlineOptions {
  seed: string;
  genre?: string;
  targetWordCount?: string;
  platform?: string;
  tone?: string[];
  template?: ExtendedGenreTemplate;
  wordCountRange?: string; // 字数范围（五步法使用）
}

/**
 * 五步大纲法提示词选项
 */
export interface FiveStepPromptOptions {
  seed: string;
  genre?: string;
  template?: ExtendedGenreTemplate;
  wordCountRange?: string;
}

/**
 * 构建总纲提示词
 */
export function buildMasterOutlinePrompt(options: MasterOutlineOptions): {
  system: string;
  user: string;
} {
  const { seed, genre, targetWordCount, platform, tone, template } = options;

  const system = buildSystemPrompt(template, targetWordCount);
  const user = buildUserPrompt({ seed, genre, targetWordCount, platform, tone });

  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(template?: ExtendedGenreTemplate, targetWordCount?: string): string {
  const genreSection = template ? buildGenreSection(template) : '';

  // 解析字数范围
  const wordCountNum = parseWordCount(targetWordCount);
  const chaptersPerVolume = Math.ceil(wordCountNum / 150000);
  const totalChapters = Math.ceil(wordCountNum / 3000);

  return `你是一位专业的小说创作顾问，擅长长篇网文创作。

【字数要求】
${targetWordCount ? `目标字数：${targetWordCount}（约${wordCountNum.toLocaleString()}字）` : '目标字数：50万-100万字（约75万字）'}
建议卷数：${chaptersPerVolume}卷
建议章节数：${totalChapters}章
每卷字数：约${Math.round(wordCountNum / chaptersPerVolume / 10000)}万字

${buildCorePrinciplesPrompt()}

${genreSection}

${buildEightStrandsPrompt()}

${buildConflictEscalationPrompt()}

【输出格式要求】
请以 Markdown 格式输出完整的大纲，使用清晰的标题和列表结构：

# 基本信息

- **书名**：故事标题
- **题材**：题材
- **子题材**：子题材1、子题材2
- **文风**：文风标签1、文风标签2
- **目标字数**：500000
- **目标平台**：目标平台
- **目标读者**：目标读者画像
- **一句话概括**：主角+目标+阻碍+反转

# 情绪目标

- **核心情绪**：热血/甜蜜/虐心/紧张/悬疑/治愈/搞笑/悲壮
- **次要情绪**：可选
- **情绪弧线**：rising/falling/wave/mixed/m_shape/n_shape
- **情绪密度**：3000
- **情绪高点**：5, 20, 50, 100
- **情绪低点**：10, 30, 60

# 世界设定

- **世界类型**：都市/古代/异世界/未来/玄幻
- **世界描述**：50字以内

## 主要地点

| 地点名 | 描述 | 等级 |
|--------|------|------|
| 地点1 | 描述15-30字 | 新手村/主城/禁地 |

## 主要势力

| 势力名 | 描述 | 阵营 |
|--------|------|------|
| 势力1 | 描述20字 | 正派/反派/中立 |

## 核心规则

| 规则名 | 描述 |
|--------|------|
| 规则1 | 描述20字 |

## 力量体系

- **体系名称**：力量体系名称
- **等级划分**：等级1 → 等级2 → 等级3 → 等级4 → 等级5 → 等级6 → 等级7
- **突破条件**：突破条件1、突破条件2

# 主角设定

- **姓名**：主角名
- **标签**：标签1、标签2
- **身份背景**：身份背景（50字以内）

## 金手指

- **名称**：金手指名称
- **描述**：金手指描述（50字以内）
- **代价**：代价描述（无代价写'无'）

## 优势与短板

- **优势**：优势1、优势2
- **短板**：短板1、短板2

## 核心设定

- **核心动机**：他为什么要做这件事
- **当前困境**：开篇面临的问题（30字以内）
- **成长弧线**：成长弧线描述

# 反派体系

## 三层反派

- **小反派**（新手村/前10章）：小反派描述（30字）
- **中反派**（中期势力）：中反派描述（30字）
- **大反派**（终极Boss）：大反派描述（30字）

## 镜像关系

反派与主角的镜像关系（20字）

# 世界约束

- **时间基准**：如玄幻纪元2024年
- **时间方向**：forward/backward/mixed
- **能力来源**：能力来源1、能力来源2
- **最高等级**：最高等级
- **最大主角数**：20
- **最大配角数**：50

## 禁止项

- **禁止时间循环**：是/否
- **禁止组合**：禁止组合1、禁止组合2
- **禁止死亡角色**：角色名

# 三线交织

| 故事线 | 比例 | 状态 | 当前内容 |
|--------|------|------|----------|
| Quest（主线） | 60% | active | 当前弧线 |
| Fire（感情线） | 25% | active | cold/warm/hot/climax |
| Constellation（世界观线） | 15% | active | 已揭示地点 |

# 八条故事线

## 1. 地图线

- **描述**：地图递进描述
- **里程碑**：
  - 第5章：新地图 - 解锁事件
  - 第20章：进阶地图 - 解锁事件

## 2. 阵营线

- **描述**：阵营发展描述
- **里程碑**：
  - 第10章：势力名 - 加入/冲突事件

## 3. 人物线

- **描述**：人物登场描述
- **里程碑**：
  - 第3章：角色名（女主/配角/Boss）- 登场方式

## 4. 金手指线

- **描述**：能力升级描述
- **里程碑**：
  - 第5章：能力名 - 能力升级

## 5. 世界观线

- **描述**：设定揭示描述
- **里程碑**：
  - 第10章：规则名 - 揭示方式

## 6. 矛盾线

- **描述**：冲突递进描述
- **里程碑**：
  - 第15章：冲突名 - 升级

## 7. 收集线

- **描述**：资源收集描述
- **里程碑**：
  - 第8章：物品名 - 收集进度

## 8. 感情线

- **描述**：感情发展描述
- **里程碑**：
  - 第5章：对象 - 相遇/相知/暧昧/表白/相守

# 矛盾递进

| 层级 | 名称 | 描述 | 状态 |
|------|------|------|------|
| 1 | 人与自我 | 内心挣扎、自我怀疑 | pending |
| 2 | 人与自然 | 环境挑战、生存危机 | pending |
| 3 | 人与人 | 人际冲突、恩怨情仇 | pending |
| 4 | 人与世界 | 终极对抗、命运挑战 | pending |

# 核心承诺

- **核心卖点**：一句话概括
- **主要满足点**：满足点1、满足点2
- **题材特定承诺**：可选

# 爽点设计

## 爽点密度

- **微爽点**：每${COOL_POINT_DENSITY.micro}字至少1个
- **小爽点**：每${COOL_POINT_DENSITY.small}字1个
- **大爽点**：每${COOL_POINT_DENSITY.big}字1个

## 爽点类型

装逼打脸、实力碾压、意外收获、感情突破、真相揭示、复仇成功

## 爽点安排

| 章节 | 类型 | 描述 |
|------|------|------|
| 5 | micro | 微爽点描述 |
| 10 | small | 小爽点描述 |
| 30 | big | 大爽点描述 |

## 故事卡使用

| 故事卡ID | 名称 | 应用章节 | 变体 |
|----------|------|----------|------|
| 1 | 英雄救美 | 8, 25 | 变体描述 |

# 伏笔表

| ID | 内容 | 埋设章节 | 回收章节 | 层级 | 状态 | 类型 |
|----|------|----------|----------|------|------|------|
| fs1 | 伏笔内容 | 3 | 50 | story/volume/chapter | active | mystery/dialogue/event/item |

# 卷划分

## 第1卷

- **卷ID**：1
- **卷名**：卷1标题
- **章节范围**：1-30
- **目标字数**：150000
- **功能**：铺垫/起步/第一个大爽点
- **核心冲突**：本卷核心冲突
- **起始状态**：主角起始状态
- **结束状态**：主角结束状态
- **高潮事件**：本卷高潮事件
- **新钩子**：本卷新钩子

【关键要求】
1. 所有字段都必须有实际内容，不能使用占位符
2. 卷数规划要与目标字数匹配（每卷约15-20万字）
3. 前3章必须包含：钩子、人设、爽点、悬念
4. 爽点节奏必须符合密度要求
5. 八条故事线必须有具体的里程碑节点

请用 Markdown 格式输出完整的大纲，使用清晰的分级标题和列表结构。`;
}

/**
 * 构建题材特定章节
 */
function buildGenreSection(template: ExtendedGenreTemplate): string {
  let section = `\n【题材：${template.name}】\n${template.description}\n`;

  if (template.subGenres?.length) {
    section += `\n可选流派：\n`;
    for (const sub of template.subGenres) {
      section += `- ${sub.name}：${sub.description}\n`;
    }
  }

  section += `\n核心爽点：\n`;
  for (const cp of (template.coreCoolPoints || []).slice(0, 5)) {
    section += `- ${cp.name}：${cp.description}\n`;
  }

  if (template.powerSystem) {
    section += `\n力量体系：${template.powerSystem.name}\n`;
    section += `等级划分：${template.powerSystem.levels.slice(0, 7).join(' → ')}...\n`;
  }

  if (template.factionTypes) {
    section += `\n势力类型：${template.factionTypes.slice(0, 5).join('、')}...\n`;
  }

  if (template.paceCharacteristics) {
    section += `\n节奏特点：\n`;
    section += `- 开篇：${template.paceCharacteristics.opening.style} - ${template.paceCharacteristics.opening.description}\n`;
    section += `- 发展：${template.paceCharacteristics.development.rhythm}\n`;
    section += `- 高潮：${template.paceCharacteristics.climax.structure}\n`;
  }

  if (template.antiPatterns && template.antiPatterns.length > 0) {
    section += `\n禁忌/毒点：\n`;
    for (const anti of template.antiPatterns.slice(0, 3)) {
      section += `- ${anti.name}：${anti.description}\n`;
    }
  }

  if (template.recommendedStoryCards && template.recommendedStoryCards.length > 0) {
    section += `\n推荐故事卡：${template.recommendedStoryCards.join('、')}\n`;
  }

  return section;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(params: {
  seed: string;
  genre?: string;
  targetWordCount?: string;
  platform?: string;
  tone?: string[];
}): string {
  const { seed, genre, targetWordCount, platform, tone } = params;

  let user = `# 创意种子

${seed}

`;

  if (genre) {
    user += `## 题材
${genre}
`;
  }

  if (targetWordCount) {
    user += `## 目标字数
${targetWordCount}
`;
  }

  if (platform) {
    user += `## 目标平台
${platform}
`;
  }

  if (tone && tone.length > 0) {
    user += `## 文风要求
${tone.join('、')}
`;
  }

  user += `
请按照网文工程化方法论，生成完整的总纲。确保每个模块都有具体内容，不要使用占位符。`;

  return user;
}

/**
 * 五步法各步骤的详细提示词（保持向后兼容）
 */
export const FIVE_STEP_DETAILS = {
  step1: {
    title: '确定情绪目标',
    system: `你是一位专业的小说创作顾问。现在需要帮助用户确定故事的情绪目标。

【任务】
分析用户的创意种子，确定故事要传达的核心情绪。

【需要输出的内容】
1. 核心情绪：主要让读者感受到什么？（热血/甜蜜/虐心/紧张/悬疑/治愈等）
2. 情绪弧线：情绪如何发展？（从低到高/波动起伏/M形/N形等）
3. 情绪密度：多久需要有一个情绪波动？（建议每3000字）
4. 情绪高点：计划在哪几个章节设置情绪高峰？

【注意事项】
- 情绪目标要贯穿全文
- 选择1-2个核心情绪即可
- 每个高潮场景都要服务于核心情绪`,
  },

  step2: {
    title: '设计核心设定',
    system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的世界观和核心设定。

【任务】
根据已有信息，设计故事的世界观体系。

【需要输出的内容】
1. 世界类型：都市/古代/异世界/未来/玄幻
2. 核心规则：力量体系/社会规则/特殊设定
3. 世界矛盾：这个世界的核心冲突是什么？
4. 金手指设计：主角的独特优势
5. 升级体系：实力如何递进？`,
  },

  step3: {
    title: '设计主角设定',
    system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的主角。

【任务】
设计一个能让读者代入的主角。

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
- 性格要能在压力下展现变化`,
  },

  step4: {
    title: '设计故事结构',
    system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的整体结构。

【任务】
规划故事的整体框架和关键节点。

${buildEightStrandsPrompt()}

${buildConflictEscalationPrompt()}

3. 关键转折点：列出3-5个重大转折

【注意事项】
- 开篇前3000字决定读者去留
- 每个大情节要有起伏
- 高潮要足够震撼`,
  },

  step5: {
    title: '设计爽点安排',
    system: `你是一位专业的小说创作顾问。现在需要帮助用户规划故事的爽点。

【任务】
设计让读者过瘾的精彩场景。

【需要输出的内容】
1. 爽点类型：准备使用哪些类型的爽点
   - 装逼打脸
   - 实力碾压
   - 意外收获
   - 感情突破
   - 真相揭示
   - 复仇成功

2. 爽点节奏：
   - 每章至少1个微爽点
   - 每3章1个小爽点
   - 每7章1个大爽点

3. 核心高潮：计划2-3个大高潮场景

4. 铺垫设计：每个大爽点需要什么铺垫？

【注意事项】
- 爽点要提前铺垫
- 爽点要有递进，越来越大
- 形式要多样化`,
  },
};

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
