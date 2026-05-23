/**
 * Prompt System - Volume Timeline Prompt
 * 卷时间线提示词
 */

import type { Beat, TimeAnchor } from '../../contracts';
import { buildTimelineConstraintPrompt } from '../system/core-principles';

/**
 * 时间线选项
 */
export interface TimelinePromptOptions {
  volumeId: number;
  volumeTitle: string;
  beats: Beat[];
  baseline?: string;
  hasCountdown?: boolean;
  countdownEvents?: { event: string; targetChapter: number; daysRemaining: number }[];
}

/**
 * 构建时间线提示词
 */
export function buildTimelinePrompt(options: TimelinePromptOptions): {
  system: string;
  user: string;
} {
  const { volumeId, volumeTitle, beats, baseline, hasCountdown, countdownEvents } = options;
  
  const system = buildSystemPrompt();
  const user = buildUserPrompt(options);
  
  return { system, user };
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(): string {
  const timelineConstraints = buildTimelineConstraintPrompt();
  
  return `你是一位专业的小说创作顾问。现在需要为卷生成卷时间线表。

${timelineConstraints}

【时间线要求】
1. **时间基准**：确定故事发生的时间点
2. **单调递增**：时间必须向前推进，不能倒退
3. **倒计时**：如果有紧迫事件，需要设置倒计时
4. **合理间隔**：章与章之间的时间间隔要符合情节

【时间锚点格式】
{
  "chapter": 1,                    // 章节号
  "absoluteTime": "第1天/仙历3021年春",  // 绝对时间
  "relativeTime": "穿越后第3天",    // 相对时间（可选）
  "duration": "约3000字",            // 章内时间跨度
  "gapFromPrevious": "-",            // 与上章间隔，"-"表示首章
  "countdown": {                    // 倒计时（可选）
    "active": true,
    "event": "宗门大比",
    "daysRemaining": 10
  }
}

【常见时间表达】
- 末世文："末世第X天"
- 修仙文："仙历XXXX年春/夏/秋/冬"
- 都市文："XXXX年X月X日"
- 异世界："历XXXX年X月"
- 通用："第X章/第X天"

【输出格式】
请以 Markdown 格式输出时间线表，使用清晰的表格结构：

# 时间线总览

## 卷级设定

| 项目 | 值 |
|------|-----|
| **时间基准** | 时间基准描述 |
| **本卷跨度** | 本卷时间跨度 |
| **时间方向** | forward（向前） |
| **是否单调** | 是 |
| **倒计时事件** | 事件名（剩余天数） |

## 倒计时事件

| 事件 | 目标章节 | 剩余天数 |
|------|----------|----------|
| 事件名 | 章节号 | 剩余天数 |

# 章节时间轴

| 章节 | 绝对时间 | 相对时间 | 章内跨度 | 与上章间隔 | 倒计时状态 |
|------|----------|----------|----------|------------|------------|
| 1 | 第1天/仙历3021年春 | 穿越后第3天 | 约3000字 | - | 无 |
| 2 | 第2天 | 穿越后第4天 | 约3000字 | 次日 | 无 |
| ... | ... | ... | ... | ... | ... |

# 时间一致性检查

请确保：
1. 每章都有时间锚点
2. 时间单调递增（不倒退）
3. 倒计时天数递减
4. 与上章间隔合理
5. 符合各节拍的时间要求`;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(options: TimelinePromptOptions): string {
  const { volumeId, volumeTitle, beats, baseline, hasCountdown, countdownEvents } = options;
  
  let user = `# 第${volumeId}卷：${volumeTitle}

**时间基准**：${baseline || '未设定'}
`;

  if (beats && beats.length > 0) {
    user += `\n## 节拍表参考
`;
    
    const sortedBeats = [...beats].sort((a, b) => {
      const order = ['Opening', 'Development', 'Twist1', 'Twist2', 'Climax', 'ConflictResolution', 'Twist3', 'Ending'];
      return order.indexOf(a.node) - order.indexOf(b.node);
    });
    
    for (const beat of sortedBeats) {
      user += `- ${beat.node}：第${beat.chapterRange[0]}-${beat.chapterRange[1]}章 - ${beat.description}\n`;
    }
  }

  if (hasCountdown && countdownEvents && countdownEvents.length > 0) {
    user += `\n## 倒计时事件
`;
    for (const event of countdownEvents) {
      user += `- ${event.event}：截止于第${event.targetChapter}章，剩余${event.daysRemaining}天\n`;
    }
  }

  user += `
请生成卷时间线表，确保每章有明确的时间锚点。`;

  return user;
}

/**
 * 简化版时间线提示词
 */
export function buildSimpleTimelinePrompt(params: {
  volumeId: number;
  volumeTitle: string;
  chapterStart: number;
  chapterEnd: number;
  baseline?: string;
}): { system: string; user: string } {
  const { volumeId, volumeTitle, chapterStart, chapterEnd, baseline } = params;
  
  const system = `你是一位专业的小说创作顾问。现在需要为第${volumeId}卷生成卷时间线表。

【时间线要求】
1. 确定时间基准
2. 时间必须单调递增
3. 每章有明确的时间锚点
4. 倒计时天数必须递减

请以 Markdown 格式输出时间线表，包含章节、时间锚点、章内跨度、与上章间隔。`;

  const user = `【第${volumeId}卷：${volumeTitle}】
章节范围：第${chapterStart}-${chapterEnd}章
时间基准：${baseline || '未设定'}

请生成卷时间线表。`;

  return { system, user };
}

/**
 * 时间线输出模板
 */
export const TIMELINE_TEMPLATE = `## 第 {volumeId} 卷时间线

### 卷级时间设定
| 项目 | 值 |
|------|-----|
| 时间基准 | {baseline} |
| 本卷时间跨度 | {span} |
| 关键倒计时事件 | {countdownEvents} |

### 章节时间轴
| 章节 | 时间锚点 | 章内跨度 | 与上章间隔 | 倒计时状态 |
|------|---------|---------|-----------|-----------|
{chapterRows}

### 时间一致性检查
- [ ] 时间基准设定正确
- [ ] 没有时间倒流
- [ ] 倒计时逻辑正确
- [ ] 间隔合理
`;
