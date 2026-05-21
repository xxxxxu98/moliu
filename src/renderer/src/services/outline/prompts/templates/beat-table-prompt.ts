/**
 * Prompt System - Beat Table Template
 * Templates for volume beat table generation
 */

/**
 * 构建卷节拍表提示词
 */
export function buildBeatTablePrompt(params: {
  volumeTitle: string;
  volumeNumber: number;
  previousVolumeSummary?: string;
  totalChapters: number;
  wordCountTarget: number;
  genre?: string;
}): { system: string; user: string } {
  const { 
    volumeTitle, 
    volumeNumber, 
    previousVolumeSummary,
    totalChapters,
    wordCountTarget,
    genre = '通用'
  } = params;
  
  const system = `你是一位专业的小说创作顾问。现在需要为第${volumeNumber}卷生成卷节拍表。

【什么是卷节拍表】
卷节拍表是规划一卷内容的关键工具，将一卷小说分解为若干"节拍"，每个节拍都有特定功能和目标。

【节拍类型】
1. **开卷承诺(Promise)**：告诉读者这卷会给他们什么
2. **催化事件(Catalyst)**：打破平衡的事件
3. **危机递增(Fichtean)**：至少3次递进的危机
4. **中段反转(Midpoint)**：重大转折
5. **最低谷(All Is Lost)**：最黑暗时刻
6. **大兑现(Climax)**：承诺兑现
7. **新钩子(Hook)**：为下一卷埋下伏笔

【字数分配建议】
目标字数：${wordCountTarget}
建议分配：
- 开卷承诺：10%（约${Math.round(wordCountTarget * 0.1 / 3000)}章）
- 催化+危机链：50%（约${Math.round(wordCountTarget * 0.5 / 3000)}章）
- 中段反转+最低谷：15%（约${Math.round(wordCountTarget * 0.15 / 3000)}章）
- 高潮+解决：25%（约${Math.round(wordCountTarget * 0.25 / 3000)}章）

【格式要求】
请以 Markdown 格式输出，包含：
- 每个节拍的类型、章节范围
- 每个节拍的描述（30-50字）
- 节拍之间的逻辑关系

【题材】
当前题材：${genre}`;

  const user = `【第${volumeNumber}卷：${volumeTitle}】

本卷总章节数：约${Math.ceil(totalChapters / 10)}章
目标字数：约${wordCountTarget}字

${previousVolumeSummary ? `【上卷回顾】
${previousVolumeSummary}

` : ''}请生成完整的卷节拍表，确保：
1. 每个节拍有明确的起止章节
2. 节拍之间有逻辑递进关系
3. 有明确的危机升级过程
4. 高潮要有足够的铺垫`;

  return { system, user };
}

/**
 * 卷节拍表输出模板
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
