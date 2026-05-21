/**
 * Prompt System - Chapter Outline Prompt
 * CBN/CPN/CEN 章纲提示词
 */

import type { Beat, StrandStatus, ChapterCommit } from '../../contracts';

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
  return `你是一位专业的小说创作顾问。现在需要为章生成章纲。

【章节结构】

## CBN - 章节起点（必须1个）
- 功能：承接上文，自然过渡
- 格式：「主体 | 动作/变化 | 对象/结果」
- 示例：萧炎 | 抵达 | 迦南学院入口
- 必须包含：时间锚点、情绪延续

## CPN - 推进节点（必须2-4个）
- 功能：推进剧情，制造冲突
- 按时间顺序排列
- 每个CPN要有明确的戏剧功能
- 格式：「主体 | 动作 | 结果」

## CEN - 章节终点（必须1个）
- 功能：设置悬念，吸引订阅
- 格式：「主体 | 动作 | 结果 + 悬念」
- 必须包含：悬念、钩子类型

【核心要素】
| 要素 | 说明 | 示例 |
|------|------|------|
| 目标 | 本章主角要完成什么 | 参加宗门大比 |
| 阻力 | 遇到什么阻碍 | 对手实力强劲 |
| 代价 | 失败会有什么后果 | 被逐出宗门 |
| 时间锚点 | 章节发生在什么时间 | 仙历3021年春 |
| 爽点 | 本章的亮点（每章必须有） | 越级挑战成功 |
| Strand | Quest/Fire/Constellation | Quest |

【故事卡类型参考】
故事卡可以组合使用：
- 英雄救美：危机 + 化解 + 关系质变
- 装逼打脸：展示 + 震惊 + 收获
- 以小博大：低成本 + 高风险 + 大收获
- 临危受命：危机到来 + 配角无法解决 + 主角接手
- 歪打正着：暗示重要性 + 错误方向努力 + 偶然获得

【爽点密度要求】
- 每章至少1个微爽点
- 爽点类型：打脸/实力展示/意外收获/感情进展

【本章禁区】（不超过5条）
只写本章绝对不能发生的硬禁区：
- 禁止：角色死亡（除非剧情需要）
- 禁止：关键设定揭示
- 禁止：感情关系突变
- 禁止：战力体系崩坏

【伏笔追踪】
- 本章新埋的伏笔
- 本章回收的伏笔

【输出格式】
请以JSON格式输出章纲：
{
  "chapterId": 1,
  "volumeId": 1,
  "nodes": {
    "cbn": {
      "statement": "主体 | 动作 | 结果",
      "承接上文": "...",
      "情绪延续": "..."
    },
    "cpns": [
      {
        "id": "CPN1",
        "statement": "主体 | 动作 | 结果",
        "戏剧功能": "制造冲突/推进情节/揭示信息",
        "coolPoint": "爽点描述（可选）"
      }
    ],
    "cen": {
      "statement": "主体 | 动作 | 结果 + 悬念",
      "悬念": "...",
      "钩子类型": "冲突悬念/信息悬念/情感悬念"
    }
  },
  "requirements": {
    "objective": "本章目标",
    "resistance": "阻碍",
    "cost": "代价",
    "timeAnchor": "时间锚点",
    "coolPoint": "爽点（必须填写）",
    "strand": "Quest/Fire/Constellation",
    "storyCard": "应用的故事卡（可选）"
  },
  "foreshadow": {
    "new": [{"id": "fs1", "content": "伏笔内容", "payoffChapter": 10}],
    "fulfilled": []
  },
  "forbiddenZones": [
    {"type": "character_death", "target": "主角", "reason": "剧情阶段不对"}
  ],
  "wordCount": 3000
}`;
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
- **节拍**：${currentBeat.node}
- **描述**：${currentBeat.description}
`;
  }

  user += `
## 三线状态
- **Quest**：${strandStatus.quest.mainObjective}
- **Fire**：${strandStatus.fire.relationshipStage}
- **Constellation**：${strandStatus.constellation.newRevelations.join('、') || '无'}
`;

  if (previousChapterCommit) {
    user += `
## 上章回顾
- **上章终点**：${previousChapterCommit.nodes.cen.statement}
- **上章爽点**：${previousChapterCommit.requirements.coolPoint}
- **上章情绪**：${previousChapterCommit.nodes.cbn.情绪延续 || '待延续'}
`;
  }

  if (knowledgeContext) {
    user += `
## 知识参考
${knowledgeContext}
`;
  }

  user += `
请生成第${chapterNumber}章的详细章纲，确保：
1. 每章必须有爽点
2. CBN承接上文自然
3. CEN设置悬念吸引订阅
4. 节点格式：「主体 | 动作 | 结果」
`;

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

请以JSON格式输出。`;

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
1. nodes: { cbn, cpns[], cen }
2. requirements: { objective, resistance, cost, coolPoint, strand }
3. foreshadow: { new[], fulfilled[] }
4. forbiddenZones: []

【节点格式】
- CBN：「主体 | 动作 | 结果」
- CPN：「主体 | 动作 | 结果」
- CEN：「主体 | 动作 | 结果 + 悬念」

【爽点要求】
- 每章必须有爽点
- 微爽点：打脸/实力展示
- 小爽点：身份揭示/关系突破

请以JSON数组格式输出${endChapter - startChapter + 1}个章纲。`;

  const user = `卷ID：${volumeId}
章节范围：第${startChapter}-${endChapter}章

节拍表：
${beatTable.map(b => `- ${b.node}：第${b.chapterRange[0]}-${b.chapterRange[1]}章`).join('\n')}

三线状态：
- Quest：${strandStatus.quest.mainObjective}
- Fire：${strandStatus.fire.relationshipStage}
- Constellation：${strandStatus.constellation.newRevelations.join('、')}

请批量生成章纲。`;

  return { system, user };
}
