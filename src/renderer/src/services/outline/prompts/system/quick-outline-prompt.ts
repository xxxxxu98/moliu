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
请以JSON格式输出${generateCount}个大纲。每个大纲必须包含以下所有字段：

{
  "outlines": [
    {
      "title": "故事标题",
      "synopsis": "60-80字的故事简介",
      "genres": ["题材1", "题材2"],
      "estimatedWordCount": 500000,
      
      "emotionGoal": {
        "primary": "核心情绪（热血/甜蜜/紧张等）",
        "secondary": "次要情绪",
        "arc": "rising/falling/wave/mixed",
        "density": 3000,
        "highPoints": [5, 20, 50],
        "lowPoints": [10, 30]
      },
      
      "worldSetting": {
        "type": "世界类型",
        "locations": [
          { "name": "地点名称", "description": "地点描述", "level": "city/district/special" }
        ],
        "factions": [
          { "name": "势力名称", "description": "势力描述", "allies": [], "enemies": [] }
        ],
        "rules": [
          { "name": "规则名称", "description": "规则描述", "category": "cultivation/magic/social" }
        ]
      },
      
      "characters": [
        {
          "name": "角色名",
          "role": "protagonist/antagonist/mentor/supporting",
          "description": "角色描述",
          "personality": ["性格标签1", "性格标签2"],
          "goldenFinger": "金手指（如有）",
          "strengths": ["优势1"],
          "weaknesses": ["短板1"],
          "relationships": [
            { "targetName": "关联角色", "type": "friend/enemy/mentor/lover", "description": "关系描述" }
          ]
        }
      ],
      
      "structure": {
        "act1": "第一幕描述（建置，约20%字数）",
        "act2a": "第二幕A描述（对抗上半，约25%字数）",
        "act2b": "第二幕B描述（对抗下半，约25%字数）",
        "act3": "第三幕描述（结局，约30%字数）"
      },
      
      "coolPointDesign": {
        "patterns": ["打脸爽", "装逼爽", "身份揭秘", "实力碾压"],
        "arranged": [
          { "type": "爽点类型", "description": "爽点描述", "suggestedChapter": 5 }
        ]
      },
      
      "coreSellingPoints": [
        { "name": "卖点名称", "description": "卖点描述", "priority": 1 }
      ],
      
      "conflictDesign": {
        "source": "冲突来源（资源/利益、阵营/种族等）",
        "escalation": ["一级矛盾", "二级矛盾", "三级矛盾", "四级矛盾"],
        "majorConflicts": ["主要冲突1", "主要冲突2"]
      },
      
      "storyLines": {
        "map": "地图线规划（地点递进）",
        "faction": "阵营线规划（势力发展）",
        "character": "人物线规划（角色登场）",
        "goldenfinger": "金手指线规划（能力升级）",
        "worldRules": "世界观线规划（设定揭示）",
        "conflict": "矛盾线规划（冲突递进）",
        "collection": "收集线规划（材料收集）",
        "romance": "感情线规划（感情发展）"
      },
      
      "foreshadows": [
        { "hint": "伏笔内容", "type": "item/dialogue/event/mystery", "suggestedChapter": 10 }
      ],
      
      "chapters": [
        { "title": "章节标题", "summary": "章节摘要", "keyEvents": ["关键事件1"], "involvedCharacters": ["角色1"] }
      ]
    }
  ]
}

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
}): { system: string; user: string } {
  const { step, userInput, previousSteps = {}, genre } = params;

  const stepPrompts: Record<number, { title: string; system: string; user: string }> = {
    1: {
      title: '确定情绪目标',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户确定故事的情绪目标。

【任务】
分析用户的创意种子，确定故事要传达的核心情绪。

${buildCorePrinciplesPrompt()}

【需要输出的内容】
1. 核心情绪：主要让读者感受到什么？（热血/甜蜜/虐心/紧张/悬疑/治愈等）
2. 情绪弧线：情绪如何发展？（从低到高/波动起伏/M形/N形等）
3. 情绪密度：多久需要有一个情绪波动？（建议每3000字）
4. 情绪高点：计划在哪几个章节设置情绪高峰？

【输出格式】
{
  "primary": "核心情绪",
  "arc": "rising/falling/wave/mixed",
  "density": 3000,
  "highPoints": [5, 20, 50],
  "lowPoints": [10, 30]
}`,
      user: `用户的创意种子：

${userInput}

请分析并输出情绪目标规划。`,
    },

    2: {
      title: '设计核心设定',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户设计故事的世界观和核心设定。

【任务】
根据已有信息，设计故事的世界观体系。

【需要输出的内容】
1. 世界类型：都市/古代/异世界/未来/玄幻
2. 核心规则：力量体系/社会规则/特殊设定
3. 世界矛盾：这个世界的核心冲突是什么？
4. 金手指设计：主角的独特优势
5. 升级体系：实力如何递进？

【参考已有信息】
${JSON.stringify(previousSteps, null, 2)}

【输出格式】
{
  "type": "世界类型",
  "powerSystem": { "name": "力量体系", "levels": [] },
  "goldenFinger": "金手指设计",
  "coreConflict": "世界核心冲突"
}`,
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
{
  "name": "主角名",
  "tags": ["标签1", "标签2"],
  "identity": "身份背景",
  "goldenFinger": "金手指",
  "strengths": ["优势1"],
  "weaknesses": ["短板1"],
  "motivation": "核心动机",
  "currentDilemma": "当前困境"
}`,
      user: `请设计主角的完整设定。`,
    },

    4: {
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
- 高潮要足够震撼

【输出格式】
{
  "eightStrands": { "quest": {}, "faction": {}, ... },
  "conflictEscalation": [...],
  "keyTurningPoints": ["转折1", "转折2"]
}`,
      user: `请设计故事的完整结构。`,
    },

    5: {
      title: '设计爽点安排',
      system: `你是一位专业的小说创作顾问。现在需要帮助用户规划故事的爽点。

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
   - 每章至少1个微爽点（每${COOL_POINT_DENSITY.micro}字）
   - 每3章1个小爽点（每${COOL_POINT_DENSITY.small}字）
   - 每7章1个大爽点（每${COOL_POINT_DENSITY.big}字）

3. 核心高潮：计划2-3个大高潮场景

4. 铺垫设计：每个大爽点需要什么铺垫？

【注意事项】
- 爽点要提前铺垫
- 爽点要有递进，越来越大
- 形式要多样化

【输出格式】
{
  "patterns": ["装逼打脸", "实力碾压"],
  "arranged": [
    { "chapter": 5, "type": "micro", "description": "描述" }
  ]
}`,
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
