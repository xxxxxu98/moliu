/**
 * 情节记忆提取服务
 * 从生成的章节内容中提取关键信息，构建章节记忆
 */

import type { ChapterMemory, CharacterStateChange } from '@/types/project';
import type { Chapter } from '@/types/project';

/**
 * 提取情节记忆的 Prompt 模板
 */
const EXTRACT_MEMORY_PROMPT = `# 情节记忆提取任务

## 任务说明
请从以下章节内容中提取关键信息，生成结构化的章节记忆。

## 章节信息
- 章节标题：{chapterTitle}
- 章节序号：第 {chapterIndex} 章
- 章节字数：约 {wordCount} 字

## 章节内容
{content}

## 提取要求
请提取以下信息：

### 1. 核心情节（必填）
用50-100字概括本章的核心情节，只描述最重要的1-3个事件。

### 2. 关键事件列表（必填）
列出本章发生的3-8个关键事件，每个事件用一句话描述。
格式：
- [事件1描述]
- [事件2描述]
...

### 3. 场景/地点列表（必填）
列出本章涉及的所有地点/场景。
格式：
- [地点1]
- [地点2]
...

### 4. 时间线标记（可选）
如果本章有明确的时间标记（如"故事第3天"、"修炼开始后1年"、"春末"等），请提取。
如果没有明确时间标记，请基于情节推测一个合理的时间线描述。

### 5. 角色状态变化（必填）
列出本章中角色发生的重要状态变化（包括外貌、情感、能力、关系、位置等变化）。
格式：
- [角色名]：[状态类型]：[详细描述]
例如：
- 张小凡：情感：从自卑变为稍有自信
- 李四：关系：与王五从陌生变为朋友
- 赵六：位置：离开村庄，前往青云山

### 6. 伏笔相关（必填）
列出本章中：
- 揭示/推进的伏笔（如有）
- 新埋下的伏笔（如有）
格式：
【已揭示】
- [伏笔描述]
【新埋伏笔】
- [伏笔描述]
如没有，填写"无"

### 7. 情感基调（必填）
用1-2个词描述本章的情感基调。
例如：紧张、温馨、压抑、热血、悲伤、轻松等

## 输出格式
请严格按以下JSON格式输出，不要添加任何额外说明，禁止输出任何其他内容：

\`\`\`json
{
  "corePlot": "核心情节描述（50-100字）",
  "keyEvents": ["事件1", "事件2", "事件3"],
  "locations": ["地点1", "地点2"],
  "timelineMark": "时间线描述（如有）",
  "characterStateChanges": [
    {
      "characterName": "角色名",
      "stateType": "状态类型",
      "state": "状态简述",
      "detail": "详细描述"
    }
  ],
  "revealedForeshadows": ["已揭示伏笔1", "已揭示伏笔2"],
  "newForeshadows": ["新埋伏笔1", "新埋伏笔2"],
  "emotionalTone": "情感基调"
}
\`\`\`

重要提醒：
1. 只输出上面的JSON格式，不要有任何前缀、后缀或说明文字
2. 所有字段都要填写，如果没有对应内容则填"无"或空数组[]
3. 确保JSON格式完全正确，可以被标准JSON解析器解析
`;

/**
 * 从章节内容中提取情节记忆
 */
export async function extractChapterMemory(
  chapter: Chapter,
  chapterIndex: number
): Promise<ChapterMemory> {
  // 估算字数（简单估算：中文约2字=1词）
  const wordCount = Math.ceil(chapter.content.length / 2);

  // 构建 prompt
  const prompt = EXTRACT_MEMORY_PROMPT
    .replace('{chapterTitle}', chapter.title)
    .replace('{chapterIndex}', String(chapterIndex))
    .replace('{wordCount}', String(wordCount))
    .replace('{content}', chapter.content);

  // 调用 AI 提取记忆
  // 注意：这里需要使用 AI 服务来生成结果
  // 由于是内部服务调用，我们直接实现提取逻辑
  return await callAIForMemoryExtraction(prompt, chapter, chapterIndex, wordCount);
}

/**
 * 调用 AI 提取记忆
 */
async function callAIForMemoryExtraction(
  prompt: string,
  chapter: Chapter,
  chapterIndex: number,
  wordCount: number
): Promise<ChapterMemory> {
  // 最大重试次数
  const MAX_RETRIES = 2;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 尝试调用 AI 服务
      const { useAIService } = await import('@/services/ai/useAIService');
      const aiService = useAIService();
      
      if (aiService) {
        const response = await aiService.complete(prompt, {
          temperature: 0.3, // 较低的随机性，确保结果稳定
          maxTokens: 2000,
        });
        
        // 解析 JSON 响应，处理可能的 markdown 代码块包裹
        const memoryData = parseJSONResponse(response);
        
        return buildChapterMemory(chapter, chapterIndex, wordCount, memoryData);
      }
    } catch (error) {
      console.warn(`AI memory extraction attempt ${attempt + 1} failed:`, error);
      
      // 如果是最后一次尝试，或者错误不是 JSON 解析错误，不再重试
      if (attempt === MAX_RETRIES) {
        break;
      }
      
      // 短暂等待后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // 后备方案：使用规则提取
  return extractWithRules(chapter, chapterIndex, wordCount);
}

/**
 * 解析 AI 返回的 JSON 响应
 * 处理 markdown 代码块包裹或其他格式问题
 */
function parseJSONResponse(response: string): any {
  // 清理响应文本，去除常见的前缀/后缀
  let cleaned = response.trim();
  
  // 移除可能的前缀说明文字（如"以下是JSON输出："、"以下是分析结果："等）
  const prefixPatterns = [
    /^以下是[^：]*：?\s*/,
    /^【[^】]*】\s*/,
    /^【分析结果】\s*/,
    /^【记忆提取】\s*/,
    /^##\s*[^#\n]*\s*/,
    /^\s*分析[:：]\s*/,
    /^\s*记忆[:：]\s*/,
  ];
  prefixPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // 尝试直接解析
  try {
    return JSON.parse(cleaned);
  } catch {
    // 继续尝试其他方法
  }
  
  // 尝试从 markdown 代码块中提取 JSON
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // 继续尝试
    }
  }
  
  // 尝试查找 JSON 对象（以 { 开始，以 } 结束）
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]);
    } catch {
      // 继续尝试
    }
  }
  
  // 如果都无法解析，抛出错误
  throw new Error(`无法解析 AI 返回的 JSON 响应: ${cleaned.slice(0, 200)}...`);
}

/**
 * 使用规则提取记忆（后备方案）
 */
function extractWithRules(
  chapter: Chapter,
  chapterIndex: number,
  wordCount: number
): ChapterMemory {
  const content = chapter.content;
  
  // 简单规则：提取前100字作为核心情节（取第一句完整的话）
  const firstParagraph = content.split(/[\n\r]+/)[0] || '';
  const corePlot = firstParagraph.slice(0, 100) + (firstParagraph.length > 100 ? '...' : '');
  
  // 简单规则：提取所有引号内容作为对话（用于后续分析）
  // 这里只是占位，实际应该更复杂
  
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterIndex,
    corePlot,
    keyEvents: ['（使用规则提取，详情待完善）'],
    locations: ['（待分析）'],
    timelineMark: undefined,
    characterStateChanges: [],
    revealedForeshadows: [],
    newForeshadows: [],
    emotionalTone: '未知',
    wordCount,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 构建章节记忆对象
 */
function buildChapterMemory(
  chapter: Chapter,
  chapterIndex: number,
  wordCount: number,
  data: {
    corePlot: string;
    keyEvents: string[];
    locations: string[];
    timelineMark?: string;
    characterStateChanges: Array<{
      characterName: string;
      stateType: string;
      state: string;
      detail: string;
    }>;
    revealedForeshadows: string[];
    newForeshadows: string[];
    emotionalTone: string;
  }
): ChapterMemory {
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterIndex,
    corePlot: data.corePlot,
    keyEvents: data.keyEvents || [],
    locations: data.locations || [],
    timelineMark: data.timelineMark,
    characterStateChanges: (data.characterStateChanges || []).map(c => ({
      characterName: c.characterName,
      stateType: c.stateType as CharacterStateChange['stateType'],
      state: c.state,
      detail: c.detail,
    })),
    revealedForeshadows: data.revealedForeshadows || [],
    newForeshadows: data.newForeshadows || [],
    emotionalTone: data.emotionalTone,
    wordCount,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 批量提取章节记忆
 */
export async function extractMemoriesForChapters(
  chapters: Chapter[],
  startIndex: number = 0
): Promise<ChapterMemory[]> {
  const memories: ChapterMemory[] = [];
  
  for (let i = startIndex; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (chapter.content) {
      const memory = await extractChapterMemory(chapter, i + 1);
      memories.push(memory);
    }
  }
  
  return memories;
}

/**
 * 构建人物当前状态表（用于 prompt）
 */
export function buildCharacterStateTable(
  memories: ChapterMemory[]
): string {
  if (memories.length === 0) {
    return '（暂无章节记忆）';
  }
  
  // 收集所有角色状态，按角色分组，保留最新的
  const characterStates = new Map<string, {
    state: string;
    chapterIndex: number;
  }>();
  
  memories.forEach(memory => {
    memory.characterStateChanges.forEach(change => {
      const existing = characterStates.get(change.characterName);
      if (!existing || memory.chapterIndex > existing.chapterIndex) {
        characterStates.set(change.characterName, {
          state: `${change.stateType}: ${change.detail}`,
          chapterIndex: memory.chapterIndex,
        });
      }
    });
  });
  
  if (characterStates.size === 0) {
    return '（暂无角色状态记录）';
  }
  
  const lines = Array.from(characterStates.entries()).map(([name, data]) => {
    return `- ${name}（第${data.chapterIndex}章）：${data.state}`;
  });
  
  return lines.join('\n');
}

/**
 * 构建情节进度表（用于 prompt）
 */
export function buildPlotProgressTable(
  memories: ChapterMemory[]
): string {
  if (memories.length === 0) {
    return '（暂无情节记录）';
  }
  
  // 按章节顺序收集关键事件
  const allEvents: Array<{ chapter: number; event: string }> = [];
  
  memories.forEach(memory => {
    memory.keyEvents.forEach(event => {
      allEvents.push({
        chapter: memory.chapterIndex,
        event,
      });
    });
  });
  
  if (allEvents.length === 0) {
    return '（暂无关键事件记录）';
  }
  
  const lines = allEvents.slice(-20).map(e => {
    return `- 第${e.chapter}章：${e.event}`;
  });
  
  return lines.join('\n');
}
