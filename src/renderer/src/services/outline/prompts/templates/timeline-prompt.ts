/**
 * Prompt System - Timeline Template
 * Templates for timeline generation
 */

/**
 * 构建卷时间线提示词
 */
export function buildTimelinePrompt(params: {
  volumeTitle: string;
  volumeNumber: number;
  beatTable?: string;
  baseline?: string;
}): { system: string; user: string } {
  const { 
    volumeTitle, 
    volumeNumber, 
    beatTable,
    baseline = '未设定'
  } = params;
  
  const system = `你是一位专业的小说创作顾问。现在需要为第${volumeNumber}卷生成卷时间线表。

【什么是卷时间线】
卷时间线是规划一卷内时间流逝的工具，确保情节在时间维度上合理。

【时间线要求】
1. **时间基准**：确定故事发生的时间点
2. **单调递增**：时间必须向前推进，不能倒退
3. **倒计时**：如果有紧迫事件，需要设置倒计时
4. **合理间隔**：章与章之间的时间间隔要符合情节

【时间线约束】
- 章节时间不能倒流
- 倒计时事件的时间必须递减
- 长时间跳跃需要交代

【格式要求】
请以 Markdown 格式输出时间线表，包含：
- 时间基准设定
- 每章的时间锚点
- 倒计时事件追踪`;

  const user = `【第${volumeNumber}卷：${volumeTitle}】

时间基准：${baseline}

${beatTable ? `【卷节拍表参考】
${beatTable}

` : ''}请生成卷时间线表，确保：
1. 每章有明确的时间锚点
2. 有倒计时事件时清晰标注
3. 章与章之间的时间间隔合理
4. 时间线单调递增，不倒退`;

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
