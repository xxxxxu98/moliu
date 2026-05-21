/**
 * Prompt System - Master Outline Prompt
 * 五步大纲法 - 基于 oh-story-claudecode 的方法论
 */

import type { StoryContract, EmotionType, EmotionArc } from '../../contracts';
import type { ExtendedGenreTemplate } from '../../knowledge';

/**
 * 五步大纲法选项
 */
export interface FiveStepPromptOptions {
  seed: string;
  genre?: string;
  targetWordCount?: string;
  platform?: string;
  tone?: string[];
  template?: ExtendedGenreTemplate;
}

/**
 * 构建五步大纲法提示词
 */
export function buildMasterOutlinePrompt(options: FiveStepPromptOptions): {
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

【核心信念】
网文写作是工程，不是灵感。靠灵感写不了200万字，靠工程可以。

【核心原则】
1. 爽点密度决定存亡：追读率由爽点密度决定
2. 日更是底线：稳定日更4000字比单章完美更重要
3. 先写30章：大纲不需要完美，30章后自然会发现问题

${genreSection}

【五步大纲法】

## 第一步：确定情绪目标
分析用户创意，确定故事传达的核心情绪。
- 核心情绪：读者主要感受什么？
- 情绪弧线：从低到高/波动起伏/M形/N形
- 情绪密度：建议每3000字一个情绪波动
- 情绪高点：在哪几个章节设置情绪高峰？

## 第二步：设计核心设定
根据题材设计世界观体系。
- 世界类型：都市/古代/异世界/未来/玄幻
- 核心规则：力量体系/社会规则/特殊设定
- 世界矛盾：这个世界的核心冲突是什么？
- 金手指设计：主角的独特优势
- 升级体系：实力如何递进？

## 第三步：设计主角设定
设计一个能让读者代入的主角。
- 主角标签：让读者一想到这个词就想到主角
- 身份背景：主角是谁，从哪里来
- 性格特点：2-3个核心性格词
- 优势与短板：让主角真实可信
- 成长弧线：主角如何成长变化？
- 当前困境：开篇主角面临的问题

## 第四步：设计故事结构
规划故事的整体框架和关键节点。

【八条故事线规划】
| 故事线 | 内容 | 预埋什么 |
|--------|------|----------|
| 地图线 | 层级地点（城→地标→室内） | 新地图解锁时机 |
| 阵营线 | 势力与地图匹配 | 阵营冲突爆发点 |
| 人物线 | 角色按类型分组 | 新角色登场时机 |
| 金手指线 | 主角获得的物品/技能 | 能力升级节点 |
| 世界观线 | 世界设定规则 | 设定揭示时机 |
| 矛盾线 | 冲突放入矛盾网络 | 矛盾升级链 |
| 收集线 | 材料/线索收集 | 渐进式收集层级 |
| 感情线 | 感情关系进展 | 亲密度升级节点 |

【矛盾四重递进】
人与自我 → 人与自然 → 人与人 → 人与世界

## 第五步：设计爽点安排
设计让读者过瘾的精彩场景。

【爽点类型】
- 装逼打脸
- 实力碾压
- 意外收获
- 感情突破
- 真相揭示
- 复仇成功

【爽点节奏】
- 每章至少1个微爽点
- 每3章1个小爽点
- 每7章1个大爽点

【核心高潮】
计划2-3个大高潮场景，每个大爽点需要什么铺垫？

【故事卡组合技术】
故事卡可以自由组合嵌套：
- 英雄救美 + 装逼打脸
- 以小博大 + 慧眼识真
- 少年热血 + 临危受命

【高潮逆推法】
先确定结局 → 逆推各级目标 → 大主线→中主线→小主线

【输出格式要求】
请以JSON格式输出完整的大纲：
{
  "basic": {
    "title": "故事标题",
    "genre": "题材",
    "subGenres": ["子题材"],
    "tone": ["文风"],
    "targetWordCount": 500000,
    "platform": "目标平台",
    "oneLineSummary": "一句话概括主线矛盾与成长方向"
  },
  "emotionGoal": {
    "primary": "核心情绪",
    "arc": "rising/falling/wave/mixed",
    "density": 3000,
    "highPoints": [5, 20, 50],
    "lowPoints": [10, 30]
  },
  "worldSetting": {
    "type": "世界类型",
    "locations": ["地点1", "地点2"],
    "factions": ["势力1", "势力2"],
    "rules": ["规则1", "规则2"],
    "powerSystem": { "name": "力量体系", "levels": ["等级1", "等级2"] }
  },
  "protagonist": {
    "name": "主角名",
    "tags": ["标签1", "标签2"],
    "identity": "身份背景",
    "goldenFinger": "金手指描述",
    "strengths": ["优势1", "优势2"],
    "weaknesses": ["短板1", "短板2"],
    "motivation": "核心动机",
    "currentDilemma": "当前困境"
  },
  "worldConstraints": {
    "timeBaseline": "时间基准",
    "timeMonotonic": true,
    "forbiddenTimeLoops": true,
    "abilitySources": ["能力来源"],
    "forbiddenCombinations": []
  },
  "strands": {
    "quest": { "ratio": 0.6, "status": "active" },
    "fire": { "ratio": 0.25, "status": "active" },
    "constellation": { "ratio": 0.15, "status": "active" }
  },
  "conflictEscalation": [
    { "level": 1, "name": "第一层", "description": "", "chapters": [], "status": "pending" }
  ],
  "promises": {
    "coreHook": "核心卖点一句话",
    "mainSatisfactions": ["满足点1", "满足点2"]
  },
  "coolPointDesign": {
    "density": { "micro": 3000, "small": 9000, "big": 21000 },
    "patterns": ["装逼打脸", "实力碾压"]
  },
  "volumes": [
    { "volumeId": 1, "title": "卷1名", "chapterRange": [1, 30], "coreConflict": "核心冲突", "climax": "高潮" }
  ]
}

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
请按照五步大纲法，生成完整的网文大纲。确保每个模块都有具体内容，不要使用占位符。`;
  
  return user;
}

/**
 * 五步法各步骤的详细提示词
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
4. 金手指设计：主角的独特优势是什么？
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

【需要输出的内容】
1. 八条故事线规划：
   - 地图线：地点如何递进
   - 阵营线：势力如何发展
   - 人物线：关键角色何时登场
   - 金手指线：能力如何升级
   - 世界观线：设定如何揭示
   - 矛盾线：冲突如何递进
   - 收集线：资源/道具如何收集
   - 感情线：感情如何发展

2. 矛盾递进：
   - 人与自我（内心挣扎）
   - 人与自然（环境挑战）
   - 人与人（人际冲突）
   - 人与世界（终极对抗）

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
