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
请以 Markdown 格式输出卷大纲，使用清晰的标题结构：

# 第${volumeId}卷：${volumeTitle}

## 卷级信息

- **章节范围**：第${chapterRange[0]}章 - 第${chapterRange[1]}章（共${chapterCount}章）
- **核心冲突**：${coreConflict}

## 卷摘要

卷摘要（100字以内）

## 本卷功能定位

铺垫/起步/高潮/收尾

## 关键人物

| 角色名 | 角色类型 | 描述 |
|--------|----------|------|
| 角色1 | 主角/女主/反派/配角 | 描述 |

## 反派层级

- **小反派**：本卷小反派描述
- **中反派**：本卷中反派描述

## 三线分布

| 故事线 | 比例 | 本卷重点 |
|--------|------|----------|
| Quest（主线） | 60% | 本卷主线重点 |
| Fire（感情线） | 25% | 本卷感情线重点 |
| Constellation（世界观线） | 15% | 本卷世界观重点 |

## 爽点规划

| 章节 | 类型 | 描述 |
|------|------|------|
| 5 | 装逼打脸 | 描述 |
| 12 | 实力碾压 | 描述 |
| 25 | 大爽点 | 描述 |

## 伏笔规划

### 本卷埋设

| ID | 内容 | 埋设章节 | 回收章节 | 层级 |
|----|------|----------|----------|------|
| fs1 | 伏笔内容 | 3 | 本卷/后续卷 | 卷级/全书 |

### 已回收伏笔

- 伏笔描述

## 章级细纲

### 第${chapterRange[0]}章

- **章节标题**：章节标题

#### 节点结构

- **CBN**：主体 | 动作 | 对象
- **CPNs**：
  1. 主体 | 动作 | 对象
  2. 主体 | 动作 | 对象
- **CEN**：主体 | 动作 | 对象

#### 本章要求

- **目标**：本章目标
- **阻力**：本章阻力
- **代价**：本章代价
- **时间锚点**：时间锚点
- **章内跨度**：章内时间跨度
- **与上章间隔**：与上章时间差
- **倒计时状态**：倒计时状态
- **爽点**：爽点类型 - 爽点描述
- **故事线**：主线/感情线/副线

#### 主要实体

- **关键人物**：角色1、角色2
- **物品**：物品名
- **地点**：地点名

#### 本章变化

- **主角变化**：主角变化
- **关系变化**：关系变化
- **剧情变化**：剧情变化

#### 钩子与悬念

- **未闭合问题**：章末未闭合问题
- **钩子类型**：悬念/转折/危机/意外

#### 本章禁区

- 禁区1
- 禁区2

【关键要求】
1. 卷必须有明确的功能定位
2. 章必须承接上一章 CEN
3. 时间线单调递增
4. 每章必须有爽点
5. 禁区不超过5条
6. 只生成卷级新增内容，不重写上一卷
`;
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
请以 Markdown 格式输出${chapterCount}个章纲，每个章纲使用二级标题（## 第X章）。

## 第X章

- **章节ID**：1
- **章节标题**：章节标题

### 节点结构

- **CBN**：主体 | 动作 | 对象
- **CPNs**：主体 | 动作 | 对象
- **CEN**：主体 | 动作 | 对象

### 本章要求

- **目标**：目标描述
- **阻力**：阻力描述
- **代价**：代价描述
- **时间锚点**：时间锚点
- **爽点**：爽点类型 - 描述
- **故事线**：主线/感情线/副线

### 钩子与悬念

- **未闭合问题**：章末未闭合问题
- **钩子类型**：悬念/转折/危机/意外

### 本章禁区

- 禁区描述

【关键要求】
1. CBN 承接上一章 CEN（首章承接卷开头）
2. CEN 有未闭合问题
3. 时间线单调递增
4. 每章有爽点
5. 遵循卷级节拍和 Strand 分布`;

  const user = `请批量生成第${startChapter}-${endChapter}章的章纲，共${chapterCount}章。`;

  return { system, user };
}
