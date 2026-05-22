/**
 * Prompt System - Volume Outline Prompt (v2)
 * 卷级提示词 - 基于 webnovel-writer 方法论
 */

import type { ExtendedGenreTemplate } from '../../knowledge';
import type { Beat, StrandStatus } from '../../contracts';
import {
  buildCorePrinciplesPrompt,
  buildEightStrandsPrompt,
  buildConflictEscalationPrompt,
  buildChapterNodePrompt,
  COOL_POINT_DENSITY,
} from '../system/core-principles';

/**
 * 卷大纲选项
 */
export interface VolumeOutlineOptions {
  volumeId: number;
  volumeTitle: string;
  chapterRange: [number, number];
  coreConflict: string;
  previousVolumeSummary?: string;
  genre: string;
  template?: ExtendedGenreTemplate;
  strandStatus?: StrandStatus;
}

/**
 * 卷节拍选项
 */
export interface VolumeBeatOptions {
  volumeId: number;
  volumeTitle: string;
  chapterRange: [number, number];
  coreConflict: string;
  climax: string;
  previousVolume?: {
    endState: string;
    unresolvedForeshadow: string[];
  };
}

/**
 * 卷时间线选项
 */
export interface VolumeTimelineOptions {
  volumeId: number;
  volumeTitle: string;
  chapterRange: [number, number];
  timeBaseline: string;
  countdownEvents?: { event: string; targetChapter: number }[];
}

/**
 * 构建卷大纲提示词
 */
export function buildVolumeOutlinePrompt(options: VolumeOutlineOptions): {
  system: string;
  user: string;
} {
  const {
    volumeId,
    volumeTitle,
    chapterRange,
    coreConflict,
    previousVolumeSummary,
    genre,
    strandStatus,
  } = options;

  const chapterCount = chapterRange[1] - chapterRange[0] + 1;

  const system = buildSystemPrompt(options);
  const user = buildUserPrompt(options);

  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(options: VolumeOutlineOptions): string {
  const {
    volumeId,
    volumeTitle,
    chapterRange,
    coreConflict,
    previousVolumeSummary,
    strandStatus,
  } = options;

  const chapterCount = chapterRange[1] - chapterRange[0] + 1;

  return `你是一位专业的小说创作顾问，擅长卷级大纲规划。

【卷级规划原则】
1. 先锁定卷级目标，再批量拆章
2. 时间线是硬约束，必须单调递增
3. 每卷必须有明确的功能定位
4. 增量补齐，不重写整份总纲

${buildCorePrinciplesPrompt()}

【本卷信息】
- 卷号：第${volumeId}卷
- 卷名：${volumeTitle}
- 章节范围：第${chapterRange[0]}章 - 第${chapterRange[1]}章（共${chapterCount}章）
- 核心冲突：${coreConflict}

${previousVolumeSummary ? `- 上一卷概要：\n${previousVolumeSummary}\n` : ''}

${strandStatus ? `
【当前三线状态】
- Quest：${strandStatus.quest.mainObjective}
- Fire：${strandStatus.fire.relationshipStage} - ${strandStatus.fire.keyMoments?.join('、') || ''}
- Constellation：${strandStatus.constellation.newRevelations?.join('、') || '无'}
` : ''}

${buildChapterNodePrompt()}

${buildEightStrandsPrompt()}

【卷结构要求】
每个卷必须包含：
1. 卷摘要（100字以内）
2. 关键人物与反派层级
3. Strand 分布比例
4. 爽点密度规划
5. 伏笔规划（本卷埋设 + 跨卷承接）
6. 约束触发规划

【章级结构要求】
每章必须包含：
1. 章节起点（CBN）- 主体 | 动作/变化 | 对象/结果
2. 推进节点（CPNs）- 2-4个，按时间顺序
3. 章节终点（CEN）
4. 目标
5. 阻力
6. 代价
7. 时间锚点
8. 爽点
9. 章末未闭合问题（钩子）
10. 本章禁区（不超过5条硬禁区）

【结构化节点示例】
- CBN: 萧炎 | 抵达 | 迦南学院入口
- CPN: 萧炎 | 展示 | 异火控制力
- CPN: 药老 | 对萧炎产生 | 明确兴趣
- CEN: 萧炎 | 意识到 | 学院考核远比预想更严苛

【输出格式】
{
  "volume_summary": "卷摘要（100字以内）",
  "function": "本卷功能定位（铺垫/起步/高潮/收尾）",
  
  "key_characters": [
    { "name": "角色名", "role": "主角/女主/反派/配角", "description": "描述" }
  ],
  
  "antagonist_tiers": {
    "small": "本卷小反派描述",
    "medium": "本卷中反派描述"
  },
  
  "strand_distribution": {
    "quest": { "ratio": 0.6, "focus": "本卷主线重点" },
    "fire": { "ratio": 0.25, "focus": "本卷感情线重点" },
    "constellation": { "ratio": 0.15, "focus": "本卷世界观重点" }
  },
  
  "cool_point_plan": [
    { "type": "装逼打脸", "chapter": 5, "description": "描述" },
    { "type": "实力碾压", "chapter": 12, "description": "描述" },
    { "type": "大爽点", "chapter": 25, "description": "描述" }
  ],
  
  "foreshadow_plan": {
    "buried": [
      { "content": "伏笔内容", "buried_in": 3, "payoff_in": "本卷/后续卷", "level": "卷级/全书" }
    ],
    "fulfilled": []
  },
  
  "chapters": [
    {
      "chapter_id": ${chapterRange[0]},
      "chapter_title": "章节标题",
      
      "nodes": {
        "cbn": "主体 | 动作 | 对象",
        "cpns": ["主体 | 动作 | 对象", "主体 | 动作 | 对象"],
        "cen": "主体 | 动作 | 对象"
      },
      
      "requirements": {
        "objective": "本章目标",
        "resistance": "本章阻力",
        "cost": "本章代价",
        "time_anchor": "时间锚点",
        "chapter_time_span": "章内时间跨度",
        "time_diff_from_prev": "与上章时间差",
        "countdown_status": "倒计时状态",
        "cool_point": {
          "type": "爽点类型",
          "description": "爽点描述"
        },
        "strand": "主线/感情线/副线",
        "antagonist_level": "小反派/中反派/无"
      },
      
      "main_entities": ["关键人物", "物品", "地点"],
      
      "changes": {
        "protagonist_change": "主角变化",
        "relationship_change": "关系变化",
        "plot_change": "剧情变化"
      },
      
      "unfinished_question": "章末未闭合问题",
      "hook_type": "悬念/转折/危机/意外",
      
      "forbidden": ["禁区1", "禁区2"]
    }
  ]
}

【关键要求】
1. 卷必须有明确的功能定位
2. 章必须承接上一章 CEN
3. 时间线单调递增
4. 每章必须有爽点
5. 禁区不超过5条
6. 只生成卷级新增内容，不重写上一卷`;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(options: VolumeOutlineOptions): string {
  const {
    volumeId,
    volumeTitle,
    chapterRange,
    coreConflict,
    previousVolumeSummary,
  } = options;

  const chapterCount = chapterRange[1] - chapterRange[0] + 1;

  let user = `# 第${volumeId}卷：${volumeTitle}

**章节范围**：第${chapterRange[0]}章 - 第${chapterRange[1]}章（共${chapterCount}章）
**核心冲突**：${coreConflict}
`;

  if (previousVolumeSummary) {
    user += `
**上一卷概要**：
${previousVolumeSummary}
`;
  }

  user += `
请为第${volumeId}卷生成详细的卷级大纲和章级细纲。`;

  return user;
}

/**
 * 批量章纲提示词（基于卷上下文）
 */
export function buildBatchChapterOutlineFromVolume(params: {
  volumeId: number;
  volumeTitle: string;
  startChapter: number;
  endChapter: number;
  beatTable: Beat[];
  strandStatus: StrandStatus;
  volumeSummary: string;
}): { system: string; user: string } {
  const { volumeId, volumeTitle, startChapter, endChapter, beatTable, strandStatus, volumeSummary } = params;

  const chapterCount = endChapter - startChapter + 1;

  const system = `你是一位专业的小说创作顾问。现在需要为第${volumeId}卷的第${startChapter}-${endChapter}章批量生成章纲。

【卷级上下文】
- 卷名：${volumeTitle}
- 卷摘要：${volumeSummary}
- 节拍表：
${beatTable.map(b => `  - ${b.type}：第${b.chapterRange[0]}-${b.chapterRange[1]}章`).join('\n')}

【三线状态】
- Quest：${strandStatus.quest.mainObjective}
- Fire：${strandStatus.fire.relationshipStage}
- Constellation：${strandStatus.constellation.newRevelations?.join('、') || '无'}

${buildChapterNodePrompt()}

${buildCorePrinciplesPrompt()}

【章级要求】
每个章节必须包含：
1. nodes: { cbn, cpns[], cen }
2. requirements: { objective, resistance, cost, cool_point, strand, time_anchor, countdown_status }
3. changes: { protagonist_change, relationship_change, plot_change }
4. unfinished_question: 章末未闭合问题
5. forbidden: []

【输出格式】
请以JSON数组格式输出${chapterCount}个章纲。每个章纲结构如下：
{
  "chapter_id": 1,
  "chapter_title": "章节标题",
  "nodes": {
    "cbn": "主体 | 动作 | 对象",
    "cpns": ["主体 | 动作 | 对象"],
    "cen": "主体 | 动作 | 对象"
  },
  "requirements": {
    "objective": "目标",
    "resistance": "阻力",
    "cost": "代价",
    "time_anchor": "时间锚点",
    "cool_point": { "type": "类型", "description": "描述" },
    "strand": "主线/感情线/副线"
  },
  "unfinished_question": "章末未闭合问题",
  "hook_type": "悬念/转折/危机/意外",
  "forbidden": []
}

【关键要求】
1. CBN 承接上一章 CEN（首章承接卷开头）
2. CEN 有未闭合问题
3. 时间线单调递增
4. 每章有爽点
5. 遵循卷级节拍和 Strand 分布`;

  const user = `请批量生成第${startChapter}-${endChapter}章的章纲，共${chapterCount}章。`;

  return { system, user };
}
