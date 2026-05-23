/**
 * Prompt System - Chapter Outline Prompt (v2)
 * CBN/CPN/CEN 章纲提示词 - 基于 webnovel-writer 方法论重构
 */

import type { Beat, StrandStatus, ChapterCommit } from '../../contracts';
import {
  buildWritingTipsPrompt,
  buildChapterNodePrompt,
  buildTimelineConstraintPrompt,
  SHOW_DONT_TELL,
  CUT_SUBLIMATION,
  COOL_POINT_DENSITY,
} from '../system/core-principles';

/**
 * 章纲选项
 */
export interface ChapterOutlinePromptOptions {
  volumeId: number;
  chapterNumber: number;
  previousChapterCommit?: ChapterCommit;
  currentBeat?: Beat;
  nextBeat?: Beat;
  strandStatus: StrandStatus;
  genre?: string;
  knowledgeContext?: string;
}

/**
 * 构建章纲提示词
 */
export function buildChapterOutlinePrompt(options: ChapterOutlinePromptOptions): {
  system: string;
  user: string;
} {
  const { volumeId, chapterNumber, previousChapterCommit, currentBeat,
          strandStatus, genre, knowledgeContext } = options;

  const system = buildSystemPrompt();
  const user = buildUserPrompt(options);

  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(): string {
  return `你是一位专业的小说创作顾问，擅长章级大纲规划。

【章节规划原则】
1. 每章必须有明确的目标和阻力
2. 结构化节点：CBN + 2-4 CPN + CEN
3. 章末必须有未闭合问题（钩子）
4. 遵守"本章禁区"，不越界

${buildChapterNodePrompt()}

${buildTimelineConstraintPrompt()}

${buildWritingTipsPrompt()}

【Show, Don't Tell 规则】
禁止直接描写情绪：
❌ "他感到非常愤怒"
❌ "她感到十分惊讶"
✅ "他一拳砸在桌上，杯子震得跳了起来。"
✅ "她愣住了，半天才回过神来。"

【掐断升华规则】
禁止在结尾进行总结、说教：
❌ "这就是成长"、"这就是人生"
✅ 停在对话/悬念/未完成动作上

【爽点密度要求】
- 微爽点：每${COOL_POINT_DENSITY.micro}字至少1个
- 小爽点：每${COOL_POINT_DENSITY.small}字1个

【故事卡类型参考】
故事卡可以组合使用：
- 英雄救美：危机 + 化解 + 关系质变
- 装逼打脸：展示 + 震惊 + 收获
- 以小博大：低成本 + 高风险 + 大收获
- 临危受命：危机到来 + 配角无法解决 + 主角接手
- 歪打正着：暗示重要性 + 错误方向努力 + 偶然获得

【输出格式】
请以 Markdown 格式输出章纲，使用清晰的标题和列表结构：

# 第1章 章纲

## 章节基本信息

- **章节ID**：1
- **卷ID**：1
- **字数目标**：3000字

## 节点结构

### 章节起点（CBN）

主体 | 动作 | 对象
（如：萧炎 | 抵达 | 迦南学院入口）

### 推进节点（CPNs）

1. 主体 | 动作 | 对象
2. 主体 | 动作 | 对象
3. 主体 | 动作 | 对象

### 章节终点（CEN）

主体 | 动作 | 对象 + 悬念

## 本章要求

### 目标与阻力

- **本章目标**：一句话描述
- **本章阻力**：一句话描述
- **本章代价**：一句话描述

### 时间设定

- **时间锚点**：具体时间点或时间线位置
- **章内跨度**：约3000字
- **与上章间隔**：当天/次日/三月后
- **倒计时状态**：如距宗门大比30天

### 爽点

- **爽点类型**：装逼打脸/实力碾压/意外收获等
- **爽点描述**：具体描述
- **铺垫章节**：铺垫的章节号

### 故事线

- **主线类型**：主线/感情线/副线
- **反派等级**：小反派/中反派/无

## 主要实体

- **关键人物**：角色1、角色2
- **涉及物品**：物品名
- **涉及地点**：地点名

## 本章变化

- **主角变化**：主角在本章的变化
- **关系变化**：关系变化（如有）
- **剧情变化**：剧情变化

## 伏笔

### 新伏笔

| ID | 内容 | 埋设章节 | 回收章节 | 类型 |
|----|------|----------|----------|------|
| fs1 | 伏笔内容 | 1 | 50 | mystery/item/dialogue |

### 已回收伏笔

- 伏笔描述

## 钩子与悬念

- **未闭合问题**：章末未闭合问题（必须填写）
- **钩子类型**：悬念/转折/危机/意外

## 本章禁区

- 禁区1
- 禁区2

【关键要求】
1. CBN 承接上文自然过渡
2. CEN 必须有未闭合问题（钩子）
3. 每章必须有爽点
4. 时间线必须单调递增
5. 禁区不超过5条
6. CPNs 必须按时间顺序`;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(options: ChapterOutlinePromptOptions): string {
  const { volumeId, chapterNumber, previousChapterCommit, currentBeat,
          strandStatus, genre, knowledgeContext } = options;

  let user = `# 第${chapterNumber}章

**所属卷**：第${volumeId}卷
**题材**：${genre || '通用'}
`;

  if (currentBeat) {
    user += `
## 所属节拍
- **节拍类型**：${currentBeat.type}
- **节拍描述**：${currentBeat.description}
`;
  }

  user += `
## 三线状态
- **Quest（主线）**：${strandStatus.quest.mainObjective}
- **Fire（感情线）**：关系阶段 ${strandStatus.fire.relationshipStage}
- **Constellation（世界观线）**：${strandStatus.constellation.newRevelations.join('、') || '无新揭示'}
`;

  if (previousChapterCommit) {
    user += `
## 上章回顾
- **上章终点（CEN）**：${previousChapterCommit.nodes.cen.description}
- **上章爽点**：${previousChapterCommit.requirements.coolPoint}
- **上章情绪延续**：${previousChapterCommit.nodes.cbn.requiredElements?.join('、') || '待延续'}
`;
  }

  if (knowledgeContext) {
    user += `
## 知识参考
${knowledgeContext}
`;
  }

  user += `
请生成第${chapterNumber}章的详细章纲。`;

  return user;
}

/**
 * 简化版章纲提示词
 */
export function buildSimpleChapterPrompt(params: {
  chapterNumber: number;
  beatType: string;
  strand: string;
  previousSummary?: string;
}): { system: string; user: string } {
  const { chapterNumber, beatType, strand, previousSummary } = params;

  const system = `你是一位专业的小说创作顾问。现在需要为第${chapterNumber}章生成章纲。

【章纲要求】
- 每章必须有爽点
- 包含：目标、阻力、代价、爽点
- 节点格式：「主体 | 动作 | 结果」
- 本章禁区不超过5条
- 必须有时间锚点

【输出格式】
请以 Markdown 格式输出章纲，使用清晰的标题和列表结构：

# 第${chapterNumber}章 章纲

## 节点结构

### 章节起点（CBN）

主体 | 动作 | 对象

### 推进节点（CPNs）

主体 | 动作 | 对象

### 章节终点（CEN）

主体 | 动作 | 对象 + 悬念

## 本章要求

- **目标**：一句话描述
- **阻力**：一句话描述
- **代价**：一句话描述
- **爽点**：爽点描述
- **时间锚点**：具体时间点

## 钩子与悬念

- **未闭合问题**：章末未闭合问题

## 本章禁区

- 禁区描述

请用 Markdown 格式输出章纲。`;

  const user = `第${chapterNumber}章
节拍：${beatType}
故事线：${strand}
${previousSummary ? `上章摘要：${previousSummary}` : ''}

请生成章纲。`;

  return { system, user };
}

/**
 * 批量章纲提示词
 */
export function buildBatchChapterPrompt(params: {
  volumeId: number;
  startChapter: number;
  endChapter: number;
  beatTable: Beat[];
  strandStatus: StrandStatus;
}): { system: string; user: string } {
  const { volumeId, startChapter, endChapter, beatTable, strandStatus } = params;

  const system = `你是一位专业的小说创作顾问。现在需要为第${startChapter}-${endChapter}章批量生成章纲。

【章纲要求】
每个章节必须包含：
1. 节点：CBN（起点）、CPNs（推进节点）、CEN（终点）
2. 要求：目标、阻力、代价、爽点、时间锚点
3. 伏笔：新埋设的伏笔
4. 钩子：章末未闭合问题
5. 禁区：绝对不能发生的事

【节点格式】
- CBN：「主体 | 动作 | 结果」
- CPN：「主体 | 动作 | 结果」
- CEN：「主体 | 动作 | 结果 + 悬念」

【爽点要求】
- 每章必须有爽点
- 微爽点：打脸/实力展示
- 小爽点：身份揭示/关系突破

【时间约束】
- 必须有时间锚点
- 时间差必须标注
- 倒计时必须更新

请以 Markdown 格式输出${endChapter - startChapter + 1}个章纲，每个章纲使用二级标题（## 第X章）。`;

  const user = `卷ID：${volumeId}
章节范围：第${startChapter}-${endChapter}章（共${endChapter - startChapter + 1}章）

节拍表：
${beatTable.map(b => `- ${b.node}：第${b.chapterRange[0]}-${b.chapterRange[1]}章`).join('\n')}

三线状态：
- Quest：${strandStatus.quest.mainObjective}
- Fire：${strandStatus.fire.relationshipStage}
- Constellation：${strandStatus.constellation.newRevelations.join('、')}

请批量生成章纲，确保每个章纲都有：
1. CBN 承接上一章 CEN
2. CEN 有未闭合问题
3. 时间线单调递增
4. 每章有爽点`;

  return { system, user };
}

/**
 * 章节写作提示词（用于写作阶段）
 */
export function buildChapterWritingPrompt(params: {
  chapterNumber: number;
  chapterOutline: ChapterCommit;
  previousContent?: string;
  knowledgeContext?: string;
  genre?: string;
}): { system: string; user: string } {
  const { chapterNumber, chapterOutline, previousContent, knowledgeContext, genre } = params;

  const system = `你是一位专业的小说作家。你的任务是续写第${chapterNumber}章。

【核心原则】写得真实，而非写得正确
- 不要写出"正确"的文章，要写出"像那么回事"的文章
- 有脾气、有漏洞、有意外才是真人写作

${buildWritingTipsPrompt()}

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
${genre !== '通用' ? `当前题材：${genre}` : '通用题材'}

【章节节点要求】
请严格遵循以下节点：

**章节起点（CBN）**：
${chapterOutline.nodes.cbn.description}

**推进节点（CPNs）**：
${chapterOutline.nodes.cpns.map((n, i) => `${i + 1}. ${n.description}`).join('\n')}

**章节终点（CEN）**：
${chapterOutline.nodes.cen.description}

【本章要求】
- 目标：${chapterOutline.requirements.objective}
- 阻力：${chapterOutline.requirements.resistance}
- 代价：${chapterOutline.requirements.cost}
- 爽点：${chapterOutline.requirements.coolPoint}
- 故事线：${chapterOutline.requirements.strand}
- 禁区：${chapterOutline.forbiddenZones.map(f => f.target).join('、')}`;

  const user = `【上章结尾】
${previousContent?.slice(-500) || '（无上文，从本章开始）'}

【本章节点】
${JSON.stringify({
  cbn: chapterOutline.nodes.cbn.description,
  cpns: chapterOutline.nodes.cpns.map(n => n.description),
  cen: chapterOutline.nodes.cen.description
}, null, 2)}

请续写第${chapterNumber}章的内容，直接输出正文，不要有其他内容。`;

  return { system, user };
}
