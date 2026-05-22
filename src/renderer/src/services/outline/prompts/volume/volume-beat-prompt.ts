/**
 * Prompt System - Volume Beat Table Prompt
 * 八节点节拍表提示词 - 基于 oh-story-claudecode 八节点结构
 */

import type { Beat, StrandStatus, StoryContract } from '../../contracts';
import {
  buildCorePrinciplesPrompt,
  COOL_POINT_DENSITY,
} from '../system/core-principles';

/**
 * 卷节拍表选项
 */
export interface VolumeBeatPromptOptions {
  volumeId: number;
  volumeTitle: string;
  chapterStart: number;
  chapterEnd: number;
  coreConflict: string;
  volumeClimax: string;
  previousVolumeSummary?: string;
  genre?: string;
  strandConfig?: {
    quest: { ratio: number; currentArc: string };
    fire: { ratio: number; currentStage: string };
    constellation: { ratio: number; revealedLocations: string[] };
  };
  storyContract?: StoryContract;
}

/**
 * 构建卷节拍表提示词
 */
export function buildVolumeBeatPrompt(options: VolumeBeatPromptOptions): {
  system: string;
  user: string;
} {
  const { volumeId, volumeTitle, chapterStart, chapterEnd, coreConflict, 
          volumeClimax, previousVolumeSummary, genre, strandConfig } = options;
  
  const totalChapters = chapterEnd - chapterStart + 1;
  
  const system = buildSystemPrompt(totalChapters, genre, strandConfig);
  const user = buildUserPrompt(options);
  
  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(totalChapters: number, genre?: string, strandConfig?: VolumeBeatPromptOptions['strandConfig']): string {
  const genreSection = genre ? `\n【题材】\n${genre}\n` : '';
  const strandSection = strandConfig ? buildStrandSection(strandConfig) : '';

  return `你是一位专业的小说创作顾问。现在需要为卷生成卷节拍表。

${buildCorePrinciplesPrompt()}

${genreSection}
${strandSection}

【八节点故事结构】

## 1. 开篇（Opening）
- 核心任务：抓住读者，建立期待
- 写法：必须 in media res——从冲突中间切入，不要从天气/风景/背景介绍开始
- 篇幅：前500字内必须有钩子
- 必备元素：主角出场、核心冲突露出、至少一个悬念
- 检查清单：
  - [ ] 前 500 字有冲突或悬念？
  - [ ] 主角是否在第一章出场并有行动？
  - [ ] 读者读完第一章是否想知道"接下来怎样"？

## 2. 发展（Development）
- 核心任务：用多个事件推进情节，深化人物关系，铺设伏笔
- 写法：3-5 个递进事件，每个事件都要推动主线
- 篇幅：占本弧线 30-40%，通常 5-15 章
- 必备元素：新角色登场、伏笔埋设、主角能力/认知升级、至少 2 个爽点
- 检查清单：
  - [ ] 每个事件是否推动主线？
  - [ ] 事件之间是否有因果递进？
  - [ ] 每 3000-5000 字是否有爽点？

## 3. 转折一（Twist 1）
- 核心任务：打破读者预期，拉升故事张力
- 写法：一个改变格局的信息或事件——盟友背叛、敌人真实身份曝光、规则被颠覆
- 篇幅：1-3 章，节奏加快
- 必备元素：意外性（读者难猜到）、合理性（回头看有伏笔）、推动力（转折后故事走向不同）
- 检查清单：
  - [ ] 回头看是否有至少 1 处伏笔铺垫？
  - [ ] 转折后主角的目标/处境是否发生改变？

## 4. 转折二（Twist 2）
- 核心任务：再次拉升赌注，让主角陷入更深困境
- 写法：升级版转折——失去关键资源、更大阴谋浮现、主角被逼入绝境
- 篇幅：1-2 章，节奏紧凑
- 必备元素：赌注升级（输的代价更大）、情感冲击（牵动读者情绪）、通往高潮的桥梁
- 检查清单：
  - [ ] 赌注是否比转折一更高？
  - [ ] 转折类型是否与转折一不同？

## 5. 高潮（Climax）
- 核心任务：全书/本卷情绪最高点，核心冲突正面对决
- 写法：快节奏，短句为主，动作+对话+情绪密集交织
- 篇幅：2-4 章，不留水，字数可以偏短（2000-3000 字/章）
- 必备元素：主线冲突正面碰撞、主角发挥核心能力、至少一个"燃点"或"泪点"
- 检查清单：
  - [ ] 核心冲突是否正面对决？
  - [ ] 主角是否展现了成长？
  - [ ] 没有插叙、回忆、说明打断节奏？

## 6. 矛盾结果（Conflict Resolution）
- 核心任务：解决主要矛盾，给读者喘息
- 写法：高潮后的收束——打赢了收拾战场、打输了舔伤口
- 篇幅：2-3 章
- 必备元素：主要矛盾解决（或暂缓）、战利品/收获盘点、角色关系变化、新悬念露出
- 检查清单：
  - [ ] 主要矛盾是否解决或进入新阶段？
  - [ ] 收获是否通过情节展现而非罗列？

## 7. 转折三（Twist 3）
- 核心任务：最终转折，在读者以为结束时再投一颗炸弹
- 写法：颠覆读者对"结局"的预判——真凶另有其人、胜利是假象、更大的危机浮现
- 篇幅：1-2 章
- 必备元素：颠覆性、为结局定调、情感余韵
- 注意：如果是卷末，这个转折要为下一卷做铺垫

## 8. 结局（Ending）
- 核心任务：收束情感，给出交代，留有余韵
- 写法：主线收束 + 人物归宿 + 留白（可选）
- 篇幅：2-4 章（卷末）或 5-10 章（全书末尾）
- 必备元素：核心悬念解决、主要角色结局交代、情感收束

${genreSection}
${strandSection}

【爽点密度要求】
- 微爽点：每${COOL_POINT_DENSITY.micro}字至少1个
- 小爽点：每${COOL_POINT_DENSITY.small}字1个
- 大爽点：每${COOL_POINT_DENSITY.big}字1个

【字数分配建议】
本卷共${totalChapters}章，约${Math.round(totalChapters * 3000 / 10000)}万字

| 节点 | 占本卷比例 | 参考章数 | 节奏 |
|------|-----------|---------|------|
| 开篇 | 5-10% | 1-${Math.ceil(totalChapters * 0.08)}章 | 快 |
| 发展 | 30-40% | ${Math.ceil(totalChapters * 0.35) - Math.ceil(totalChapters * 0.10)}章 | 中 |
| 转折一 | 5-10% | ${Math.ceil(totalChapters * 0.48) - Math.ceil(totalChapters * 0.40)}章 | 快 |
| 转折二 | 5-10% | ${Math.ceil(totalChapters * 0.55) - Math.ceil(totalChapters * 0.50)}章 | 快 |
| 高潮 | 10-15% | ${Math.ceil(totalChapters * 0.65) - Math.ceil(totalChapters * 0.55)}章 | 极快 |
| 矛盾结果 | 10-15% | ${Math.ceil(totalChapters * 0.75) - Math.ceil(totalChapters * 0.65)}章 | 慢 |
| 转折三 | 5-10% | ${Math.ceil(totalChapters * 0.85) - Math.ceil(totalChapters * 0.75)}章 | 快 |
| 结局 | 10-15% | ${totalChapters - Math.ceil(totalChapters * 0.85) + 1}-${totalChapters}章 | 慢 |

【情绪拉扯=斗地主法】
主角与反派双方角力过程：
- 每次小角力主角稍占上风（"稍占上风"特别重要）
- 每次小角力以主角胜利告终，最后迎来大胜利
- 经过拉扯后的爽感远比单纯碾压爽

【输出格式】
请以JSON格式输出卷节拍表：
{
  "beats": [
    {
      "node": "Opening",
      "chapterRange": [1, ${Math.ceil(totalChapters * 0.08)}],
      "description": "节拍描述",
      "promise": "开卷承诺",
      "events": ["事件1", "事件2"],
      "coolPoints": ["微爽点1"],
      "foreshadows": ["伏笔1"]
    },
    {
      "node": "Development",
      "chapterRange": [${Math.ceil(totalChapters * 0.10)}, ${Math.ceil(totalChapters * 0.45)}],
      "description": "节拍描述",
      "events": ["事件1", "事件2", "事件3"],
      "coolPoints": ["微爽点1", "小爽点1"],
      "foreshadows": ["伏笔1", "伏笔2"]
    },
    ...
  ],
  "strandDistribution": {
    "quest": { "chapters": [], "mainEvents": [] },
    "fire": { "chapters": [], "mainEvents": [] },
    "constellation": { "chapters": [], "mainEvents": [] }
  }
}

请确保每个节点都有完整的描述，不要使用占位符。`;
}

/**
 * 构建三线交织配置章节
 */
function buildStrandSection(config: VolumeBeatPromptOptions['strandConfig']): string {
  if (!config) return '';
  
  return `
【三线交织配置】
- Quest线: ${(config.quest.ratio * 100).toFixed(0)}% - ${config.quest.currentArc}
- Fire线: ${(config.fire.ratio * 100).toFixed(0)}% - ${config.fire.currentStage}
- Constellation线: ${(config.constellation.ratio * 100).toFixed(0)}% - ${config.constellation.revealedLocations.join('、')}
`;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(options: VolumeBeatPromptOptions): string {
  const { volumeId, volumeTitle, chapterStart, chapterEnd, 
          coreConflict, volumeClimax, previousVolumeSummary, genre } = options;
  
  const totalChapters = chapterEnd - chapterStart + 1;
  
  let user = `# 第${volumeId}卷：${volumeTitle}

**章节范围**：第${chapterStart} - ${chapterEnd}章（共${totalChapters}章）
**核心冲突**：${coreConflict}
**卷末高潮**：${volumeClimax}
`;

  if (previousVolumeSummary) {
    user += `\n## 上卷回顾
${previousVolumeSummary}
`;
  }

  user += `
## 题材
${genre || '通用'}

请生成完整的八节点卷节拍表，确保：
1. 每个节拍有明确的起止章节
2. 节拍之间有逻辑递进关系
3. 有明确的危机升级过程
4. 高潮要有足够的铺垫
5. 每章都有爽点安排
`;
  
  return user;
}

/**
 * 简化版节拍表提示词（用于快速生成）
 */
export function buildSimpleBeatPrompt(params: {
  volumeId: number;
  volumeTitle: string;
  chapterStart: number;
  chapterEnd: number;
  coreConflict: string;
  climax: string;
}): { system: string; user: string } {
  const { volumeId, volumeTitle, chapterStart, chapterEnd, coreConflict, climax } = params;
  const totalChapters = chapterEnd - chapterStart + 1;
  
  const system = `你是一位专业的小说创作顾问。现在需要为第${volumeId}卷生成卷节拍表。

【卷节拍表模板】
1. 开卷承诺(Promise)：告诉读者这卷会给他们什么
2. 催化事件(Catalyst)：打破平衡的事件
3. 危机递增(Fichtean)：至少3次递进的危机
4. 中段反转(Midpoint)：重大转折
5. 最低谷(All Is Lost)：最黑暗时刻
6. 大兑现(Climax)：承诺兑现
7. 新钩子(Hook)：为下一卷埋下伏笔

【字数分配建议】
目标字数：约${totalChapters * 3000}字（约${Math.round(totalChapters * 3000 / 10000)}万字）

请以 Markdown 格式输出节拍表，包含每个节拍的类型、章节范围、描述。`;

  const user = `【第${volumeId}卷：${volumeTitle}】

本卷总章节数：约${totalChapters}章
目标字数：约${totalChapters * 3000}字

核心冲突：${coreConflict}
卷末高潮：${climax}

请生成完整的卷节拍表。`;

  return { system, user };
}

/**
 * 节拍表输出模板
 */
export const BEAT_TABLE_TEMPLATE = `## 第 {volumeId} 卷节拍表

### 开卷承诺
- **类型**：Promise
- **章节范围**：第{startChapter}-{endChapter}章
- **描述**：{description}
- **承诺内容**：{promise}

### 催化事件
- **类型**：Catalyst
- **章节范围**：第{startChapter}-{endChapter}章
- **描述**：{description}

### 危机递增链
| 节点 | 章节范围 | 危机描述 | 代价升级 |
|------|---------|---------|---------|
| 1 | 第{chapter1Start}-{chapter1End}章 | {crisis1} | {stakes1} |
| 2 | 第{chapter2Start}-{chapter2End}章 | {crisis2} | {stakes2} |
| 3 | 第{chapter3Start}-{chapter3End}章 | {crisis3} | {stakes3} |

### 中段反转
- **类型**：Midpoint
- **章节范围**：第{startChapter}-{endChapter}章
- **描述**：{description}
- **影响**：{consequences}

### 最低谷
- **类型**：All Is Lost
- **章节范围**：第{startChapter}-{endChapter}章
- **描述**：{description}

### 大兑现
- **类型**：Climax
- **章节范围**：第{startChapter}-{endChapter}章
- **描述**：{description}
- **兑现内容**：{fulfillment}

### 新钩子
- **类型**：Hook
- **章节范围**：第{startChapter}-{endChapter}章
- **钩子内容**：{hookContent}
`;
