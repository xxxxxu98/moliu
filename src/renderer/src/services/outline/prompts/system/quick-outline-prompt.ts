/**
 * Prompt System - Core Prompts
 * Centralized prompt definitions for outline generation
 */

import type { GenreTemplate } from '../../knowledge';

/**
 * 快速大纲生成选项
 */
export interface QuickOutlinePromptOptions {
  seed: string;
  genre?: string;
  wordCountRange?: string;
  template?: GenreTemplate;
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
  template: GenreTemplate | undefined,
  wordCountRange: string,
  generateCount: number
): string {
  const genreSection = template ? buildGenreSection(template) : '';
  
  return `你是一位专业的小说创作顾问。根据用户的创意种子，生成结构清晰的故事大纲。

【核心原则】
1. 生成${generateCount}个不同风格的大纲供选择
2. 每个大纲要有明确的特色和卖点
3. 遵循网文创作的核心规律

${genreSection}

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
6. **四幕结构**：
   - 第一幕（建置）：20%，介绍主角和世界观
   - 第二幕A（对抗上）：25%，主角遭遇冲突
   - 第二幕B（对抗下）：25%，冲突升级
   - 第三幕（结局）：30%，问题解决
7. **章节大纲**：6-10章，每章一句话
8. **核心爽点**：2-3个
9. **主要伏笔**：1-2个

【字数要求】
预估字数：${wordCountRange}

【格式要求】
- 输出纯JSON格式：{"outlines":[...]}
- 每个大纲包含所有上述字段
- 语言简洁，避免冗长描写
- 章节标题格式统一为"第X章：标题"
- 不要输出任何其他内容`;
}

/**
 * 构建题材特定章节
 */
function buildGenreSection(template: GenreTemplate): string {
  let section = `\n【题材：${template.name}】\n${template.description}\n`;
  
  if (template.subGenres?.length) {
    section += `\n可选流派：${template.subGenres.map(s => `${s.name}：${s.description}`).join('、')}\n`;
  }
  
  section += `\n核心爽点：${template.coreCoolPoints.join('、')}\n`;
  
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
  
  if (template.antiPatterns.length > 0) {
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

请根据以上创意种子，生成${count}个不同风格的${count > 1 ? '故事大纲' : '故事大纲'}。确保每个大纲都有独特的卖点和吸引力。`;
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

【需要输出的内容】
1. 核心情绪：主要让读者感受到什么？（热血/甜蜜/虐心/紧张/悬疑/治愈等）
2. 情绪弧线：情绪如何发展？（从低到高/波动起伏/M形/N形等）
3. 情绪密度：多久需要有一个情绪波动？（建议每3000字）
4. 情绪高点：计划在哪几个章节设置情绪高峰？

【注意事项】
- 情绪目标要贯穿全文
- 选择1-2个核心情绪即可
- 每个高潮场景都要服务于核心情绪`,
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
4. 金手指设计：主角的独特优势是什么？
5. 升级体系：实力如何递进？

【参考已有信息】
${JSON.stringify(previousSteps, null, 2)}`,
      user: `请基于上述信息设计世界观和核心设定。`,
    },
    
    3: {
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
      user: `请设计主角的完整设定。`,
    },
    
    4: {
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
      user: `请设计故事的完整结构。`,
    },
    
    5: {
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
