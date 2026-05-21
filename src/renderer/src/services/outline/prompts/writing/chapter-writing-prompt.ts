/**
 * Prompt System - Chapter Writing Prompt
 * 正文写作提示词
 */

import type { ChapterCommit } from '../../contracts';

/**
 * 正文写作选项
 */
export interface ChapterWritingPromptOptions {
  chapterNumber: number;
  chapterTitle: string;
  previousContent: string;
  chapterCommit: ChapterCommit;
  genre?: string;
  knowledgeContext?: string;
  styleGuide?: string;
}

/**
 * 构建正文写作提示词
 */
export function buildChapterWritingPrompt(options: ChapterWritingPromptOptions): {
  system: string;
  user: string;
} {
  const { chapterNumber, chapterTitle, previousContent, 
          chapterCommit, genre, knowledgeContext, styleGuide } = options;
  
  const system = buildSystemPrompt(chapterCommit, genre, knowledgeContext, styleGuide);
  const user = buildUserPrompt(chapterNumber, chapterTitle, previousContent, chapterCommit);
  
  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(
  commit: ChapterCommit,
  genre?: string,
  knowledgeContext?: string,
  styleGuide?: string
): string {
  const { nodes, requirements } = commit;
  
  let system = `你是一位专业的网文作家。你的任务是续写第${commit.chapterId}章。

【核心原则：写得真实，而非写得正确】
- 不要写出"正确"的文章，要写出"像那么回事"的文章
- 有脾气、有漏洞、有意外才是真人写作
- 不要端着装，假装完美
- 角色要有自己的判断和立场

【Show, Don't Tell】
禁止直接描写情绪：
❌ "他感到非常愤怒"
❌ "她感到十分惊讶"
✅ "他一拳砸在桌上，杯子震得跳了起来。"
✅ "她愣住了，半天才回过神来。"

禁止直接描写心理：
❌ "他心想，这次一定要赢。"
✅ "他攥紧了拳头，目光死死盯着对方。"

【掐断升华】
禁止在结尾进行总结、说教：
❌ "这就是成长"、"这就是人生"
✅ 停在对话/悬念/未完成动作上

【节奏要求】
- 开头300字必须有钩子
- 每1000字推进一次情节
- 对话要推进剧情，不能只为了凑字数
- 打斗要有策略和反转，不要"你一拳我一脚"

【章纲要求】
本章必须遵循以下章纲：

**目标**：${requirements.objective}
**阻力**：${requirements.resistance}
**代价**：${requirements.cost}
**爽点**：${requirements.coolPoint}
**故事线**：${requirements.strand}
${requirements.storyCard ? `**故事卡**：${requirements.storyCard}` : ''}

**节点结构**：
- CBN: ${nodes.cbn.statement}
${nodes.cpns.map((cpn, i) => `- CPN${i + 1}: ${cpn.statement}`).join('\n')}
- CEN: ${nodes.cen.statement}

**悬念**：${nodes.cen.悬念}
**钩子类型**：${nodes.cen.钩子类型}

${commit.forbiddenZones && commit.forbiddenZones.length > 0 ? `【本章禁区】
${commit.forbiddenZones.map((f, i) => `${i + 1}. ${f.type}: ${f.target} - ${f.reason}`).join('\n')}
` : ''}`;

  if (knowledgeContext) {
    system += `

【知识参考】
${knowledgeContext}
`;
  }

  if (styleGuide) {
    system += `

【风格指南】
${styleGuide}
`;
  }

  system += `

【写作要求】
1. 仔细阅读上文，理解当前情节走向和写作风格
2. 续写内容要与前文自然衔接
3. 结尾要有吸引力，设置${nodes.cen.钩子类型}
4. 字数：约${commit.wordCount}字
5. 每3000字至少有一个情绪波动`;

  return system;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(
  chapterNumber: number,
  chapterTitle: string,
  previousContent: string,
  commit: ChapterCommit
): string {
  // 提取上章最后500字
  const lastContent = previousContent.length > 500 
    ? previousContent.slice(-500) 
    : previousContent;
  
  return `【上章结尾】（最后500字）
${lastContent || '（无上文，直接开始）'}

【本章标题】
第${chapterNumber}章：${chapterTitle}

请续写第${chapterNumber}章的正文内容。`;
}

/**
 * 分段写作提示词
 */
export function buildSegmentWritingPrompt(params: {
  chapterNumber: number;
  segmentStart: string;
  segmentEnd?: string;
  segmentGoal: string;
  constraints: string[];
}): { system: string; user: string } {
  const { chapterNumber, segmentStart, segmentEnd, segmentGoal, constraints } = params;
  
  const system = `你是一位专业的网文作家。现在需要续写第${chapterNumber}章的一个段落。

【核心原则】
- 写得真实，不要端着装
- Show, Don't Tell
- 掐断升华，不要说教

【本段目标】
${segmentGoal}

【本段约束】
${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

【写作要求】
1. 与上下文自然衔接
2. 推进情节
3. 字数：约1000字`;
  
  const user = `【段落开始】
${segmentStart}

${segmentEnd ? `【段落结束】\n${segmentEnd}` : ''}

请续写本段落的正文。`;

  return { system, user };
}

/**
 * 润色提示词
 */
export function buildPolishingPrompt(params: {
  chapterNumber: number;
  content: string;
  issues?: string[];
}): { system: string; user: string } {
  const { chapterNumber, content, issues } = params;
  
  let system = `你是一位专业的网文作家。现在需要对第${chapterNumber}章进行润色。

【润色要求】
1. 保持原文风格和节奏
2. 增强画面感
3. 消除AI写作痕迹
4. 强化爽点表达

`;

  if (issues && issues.length > 0) {
    system += `【需要修复的问题】
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}
`;
  }

  system += `
【Show, Don't Tell】
改写情绪描写：
❌ "他很愤怒" → ✅ "他握紧拳头，指节发白"
❌ "她很感动" → ✅ "她的眼眶红了，嘴唇微微颤抖"

【掐断升华】
删除说教式结尾：
❌ "这就是成长啊"
✅ "他转身离开，没有回头。"

请输出润色后的完整章节。`;

  const user = `【原文】
${content}

请润色上述内容。`;

  return { system, user };
}
