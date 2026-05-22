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
}

/**
 * 构建总纲提示词
 */
export function buildMasterOutlinePrompt(options: MasterOutlineOptions): {
  system: string;
  user: string;
} {
  const { seed, genre, targetWordCount, platform, tone, template } = options;

  const system = buildSystemPrompt(template);
  const user = buildUserPrompt({ seed, genre, targetWordCount, platform, tone });

  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(template?: ExtendedGenreTemplate): string {
  const genreSection = template ? buildGenreSection(template) : '';

  return `你是一位专业的小说创作顾问，擅长长篇网文创作。

${buildCorePrinciplesPrompt()}

${genreSection}

${buildEightStrandsPrompt()}

${buildConflictEscalationPrompt()}

【输出格式要求】
请以JSON格式输出完整的大纲，遵循以下结构：

{
  "basic": {
    "title": "故事标题",
    "genre": "题材",
    "subGenres": ["子题材1", "子题材2"],
    "tone": ["文风标签1", "文风标签2"],
    "targetWordCount": 500000,
    "platform": "目标平台",
    "targetAudience": "目标读者画像",
    "oneLineSummary": "主角+目标+阻碍+反转，一句话概括全书"
  },
  
  "emotionGoal": {
    "primary": "核心情绪（热血/甜蜜/虐心/紧张/悬疑/治愈/搞笑/悲壮）",
    "secondary": "次要情绪（可选）",
    "arc": "rising/falling/wave/mixed/m_shape/n_shape",
    "density": 3000,
    "highPoints": [5, 20, 50, 100],
    "lowPoints": [10, 30, 60]
  },
  
  "worldSetting": {
    "type": "都市/古代/异世界/未来/玄幻",
    "description": "世界描述（50字以内）",
    "locations": [
      { "name": "地点名", "description": "描述15-30字", "level": "新手村/主城/禁地" }
    ],
    "factions": [
      { "name": "势力名", "description": "描述20字", "alignment": "正派/反派/中立" }
    ],
    "rules": [
      { "name": "规则名", "description": "描述20字" }
    ],
    "powerSystem": {
      "name": "力量体系名称",
      "levels": ["等级1", "等级2", "等级3", "等级4", "等级5", "等级6", "等级7"],
      "breakthroughConditions": ["突破条件1", "突破条件2"]
    }
  },
  
  "protagonist": {
    "name": "主角名",
    "tags": ["标签1", "标签2"],
    "identity": "身份背景（50字以内）",
    "goldenFinger": {
      "name": "金手指名称",
      "description": "金手指描述（50字以内）",
      "cost": "代价描述（无代价写'无'）"
    },
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["短板1", "短板2"],
    "motivation": "核心动机（他为什么要做这件事）",
    "currentDilemma": "当前困境（开篇面临的问题，30字以内）",
    "growthArc": "成长弧线描述"
  },
  
  "antagonist": {
    "tiers": {
      "small": "小反派描述（新手村/前10章，30字）",
      "medium": "中反派描述（中期势力，30字）",
      "big": "大反派描述（终极Boss，30字）"
    },
    "mirror": "反派与主角的镜像关系（20字）"
  },
  
  "worldConstraints": {
    "timeBaseline": "时间基准（如：玄幻纪元2024年）",
    "timeDirection": "forward/backward/mixed",
    "timeMonotonic": true,
    "maxTimeGaps": 1,
    "forbiddenTimeLoops": true,
    "abilitySources": ["能力来源1", "能力来源2"],
    "maxLevelReached": "最高等级",
    "forbiddenCombinations": [["禁止组合1"], ["禁止组合2"]],
    "maxMajorCharacters": 20,
    "maxMinorCharacters": 50,
    "forbiddenDeaths": ["禁止死亡的角色名"]
  },
  
  "strands": {
    "quest": { "ratio": 0.6, "status": "active", "currentArc": "当前弧线" },
    "fire": { "ratio": 0.25, "status": "active", "currentStage": "cold/warm/hot/climax" },
    "constellation": { "ratio": 0.15, "status": "active", "revealedLocations": ["已揭示地点"] }
  },
  
  "eightStrands": {
    "quest": {
      "description": "地图递进描述",
      "milestones": [
        { "chapter": 5, "location": "新地图", "event": "解锁事件" },
        { "chapter": 20, "location": "进阶地图", "event": "解锁事件" }
      ]
    },
    "faction": {
      "description": "阵营发展描述",
      "milestones": [
        { "chapter": 10, "faction": "势力名", "event": "加入/冲突事件" }
      ]
    },
    "character": {
      "description": "人物登场描述",
      "milestones": [
        { "chapter": 3, "name": "角色名", "role": "女主/配角/Boss", "event": "登场方式" }
      ]
    },
    "goldenFinger": {
      "description": "能力升级描述",
      "milestones": [
        { "chapter": 5, "ability": "能力名", "event": "能力升级" }
      ]
    },
    "worldBuilding": {
      "description": "设定揭示描述",
      "milestones": [
        { "chapter": 10, "rule": "规则名", "event": "揭示方式" }
      ]
    },
    "conflict": {
      "description": "冲突递进描述",
      "milestones": [
        { "chapter": 15, "conflict": "冲突名", "escalation": "升级" }
      ]
    },
    "collection": {
      "description": "资源收集描述",
      "milestones": [
        { "chapter": 8, "item": "物品名", "progress": "收集进度" }
      ]
    },
    "romance": {
      "description": "感情发展描述",
      "milestones": [
        { "chapter": 5, "with": "对象", "stage": "相遇/相知/暧昧/表白/相守" }
      ]
    }
  },
  
  "conflictEscalation": [
    { "level": 1, "name": "人与自我", "description": "内心挣扎、自我怀疑", "chapters": [], "status": "pending" },
    { "level": 2, "name": "人与自然", "description": "环境挑战、生存危机", "chapters": [], "status": "pending" },
    { "level": 3, "name": "人与人", "description": "人际冲突、恩怨情仇", "chapters": [], "status": "pending" },
    { "level": 4, "name": "人与世界", "description": "终极对抗、命运挑战", "chapters": [], "status": "pending" }
  ],
  
  "promises": {
    "coreHook": "核心卖点一句话",
    "mainSatisfactions": ["满足点1", "满足点2"],
    "genreSpecificPromise": "题材特定承诺（可选）"
  },
  
  "coolPointDesign": {
    "density": {
      "micro": ${COOL_POINT_DENSITY.micro},
      "small": ${COOL_POINT_DENSITY.small},
      "big": ${COOL_POINT_DENSITY.big}
    },
    "patterns": ["装逼打脸", "实力碾压", "意外收获", "感情突破", "真相揭示", "复仇成功"],
    "arranged": [
      { "chapter": 5, "type": "micro", "description": "微爽点描述" },
      { "chapter": 10, "type": "small", "description": "小爽点描述" },
      { "chapter": 30, "type": "big", "description": "大爽点描述" }
    ],
    "storyCardUsage": [
      { "cardId": "1", "cardName": "英雄救美", "chapters": [8, 25], "variation": "变体描述" }
    ]
  },
  
  "foreshadowTable": [
    { "id": "fs1", "content": "伏笔内容", "buriedChapter": 3, "payoffChapter": 50, "level": "story/volume/chapter", "status": "active", "type": "mystery/dialogue/event/item" }
  ],
  
  "volumes": [
    {
      "volumeId": 1,
      "title": "卷1标题",
      "chapterRange": [1, 30],
      "wordCount": 150000,
      "function": "铺垫/起步/第一个大爽点",
      "coreConflict": "本卷核心冲突",
      "startState": "主角起始状态",
      "endState": "主角结束状态",
      "climax": "本卷高潮事件",
      "newHooks": "本卷新钩子"
    }
  ]
}

【关键要求】
1. 所有字段都必须有实际内容，不能使用占位符
2. 卷数规划要与目标字数匹配（每卷约15-20万字）
3. 前3章必须包含：钩子、人设、爽点、悬念
4. 爽点节奏必须符合密度要求
5. 八条故事线必须有具体的里程碑节点

请确保输出完整的JSON，不要截断，不要省略字段。`;
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
