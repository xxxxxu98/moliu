/**
 * 情节记忆提取服务
 * 混合方案：规则提取为主 + AI 辅助为辅
 * 
 * 特性：
 * - 容错机制：AI 增强失败不影响主流程
 * - 文件系统备份：支持 Markdown 格式持久化
 * - 按需读取：通过 MemoryManager 管理记忆
 */

import type { ChapterMemory, CharacterStateChange } from '@/types/project';
import type { Chapter } from '@/types/project';
import { getMemoryManager } from './memory-manager';

/**
 * 主函数：从章节内容提取情节记忆
 * 采用混合策略：规则提取 + AI 辅助
 * 
 * 特性：
 * - 规则提取优先，确保可靠性
 * - AI 增强为辅，失败不影响主流程
 * - 自动保存到文件系统备份
 */
export async function extractChapterMemory(
  chapter: Chapter,
  chapterIndex: number,
  options?: {
    enableAIEnhancement?: boolean;
    enableFileBackup?: boolean;
  }
): Promise<ChapterMemory> {
  const content = chapter.content;
  const wordCount = Math.ceil(content.length / 2);

  // 1. 基础提取：使用规则从正文中提取
  const baseMemory = extractByRules(chapter, chapterIndex, wordCount);

  // 2. 尝试 AI 辅助增强（可选，不影响主流程）
  const enableAIEnhancement = options?.enableAIEnhancement ?? true;
  if (enableAIEnhancement) {
    try {
      const aiEnhanced = await enhanceWithAI(chapter, chapterIndex, baseMemory);
      if (aiEnhanced) {
        Object.assign(baseMemory, aiEnhanced);
      }
    } catch (error) {
      console.warn('[情节记忆] AI 增强失败，使用规则提取:', error);
      // 容错：AI 失败不影响主流程，继续使用规则提取结果
    }
  }

  // 3. 自动保存到文件系统（如果启用）
  const enableFileBackup = options?.enableFileBackup ?? true;
  if (enableFileBackup) {
    try {
      const manager = getMemoryManager();
      if (manager.isInitialized()) {
        await manager.saveMemory(baseMemory);
      }
    } catch (error) {
      console.warn('[情节记忆] 文件系统备份失败:', error);
      // 容错：备份失败不影响主流程
    }
  }

  return baseMemory;
}

/**
 * 安全提取函数 - 带完整容错机制
 * 用于关键业务场景，确保提取失败不影响写作流程
 */
export async function safeExtractChapterMemory(
  chapter: Chapter,
  chapterIndex: number,
  options?: {
    enableAIEnhancement?: boolean;
    enableFileBackup?: boolean;
    fallbackToPrevious?: boolean;
  }
): Promise<ChapterMemory | null> {
  try {
    // 执行提取
    const memory = await extractChapterMemory(chapter, chapterIndex, options);
    
    // 验证提取结果
    if (!validateMemory(memory)) {
      console.warn('[情节记忆] 提取结果验证失败');
      
      // 尝试从缓存恢复
      if (options?.fallbackToPrevious) {
        const recovered = await recoverFromCache(chapter.id);
        if (recovered) {
          console.log('[情节记忆] 从缓存恢复记忆成功');
          return recovered;
        }
      }
      
      // 返回基础记忆（确保不会返回 null）
      return createDefaultMemory(chapter, chapterIndex);
    }
    
    return memory;
  } catch (error) {
    console.error('[情节记忆] 安全提取失败:', error);
    
    // 最后保底：尝试从缓存恢复
    if (options?.fallbackToPrevious) {
      try {
        const recovered = await recoverFromCache(chapter.id);
        if (recovered) {
          console.log('[情节记忆] 错误恢复：从缓存恢复成功');
          return recovered;
        }
      } catch {
        // 忽略恢复错误
      }
    }
    
    // 最坏情况：返回默认记忆
    return createDefaultMemory(chapter, chapterIndex);
  }
}

/**
 * 验证记忆数据的有效性
 */
function validateMemory(memory: ChapterMemory): boolean {
  if (!memory) return false;
  if (!memory.chapterId) return false;
  if (!memory.chapterTitle) return false;
  if (memory.corePlot === undefined) return false;
  if (!Array.isArray(memory.keyEvents)) return false;
  if (!Array.isArray(memory.locations)) return false;
  if (!Array.isArray(memory.characterStateChanges)) return false;
  
  // 基础验证通过
  return true;
}

/**
 * 从缓存恢复记忆
 */
async function recoverFromCache(chapterId: string): Promise<ChapterMemory | null> {
  try {
    const manager = getMemoryManager();
    if (!manager.isInitialized()) {
      return null;
    }
    
    const memory = await manager.getMemory(chapterId);
    if (memory && validateMemory(memory)) {
      return memory;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * 创建默认记忆（保底方案）
 */
function createDefaultMemory(chapter: Chapter, chapterIndex: number): ChapterMemory {
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title || `第${chapterIndex + 1}章`,
    chapterIndex,
    corePlot: chapter.content?.slice(0, 200) || '（无内容）',
    keyEvents: [],
    locations: [],
    characterStateChanges: [],
    revealedForeshadows: [],
    newForeshadows: [],
    emotionalTone: '未知',
    wordCount: chapter.content?.length || 0,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 构建角色状态变化汇总表
 */
export function buildCharacterStateTable(memories: ChapterMemory[]): string {
  if (memories.length === 0) {
    return '（暂无角色状态信息）';
  }

  // 收集每个角色的最新状态
  const characterMap = new Map<string, CharacterStateChange>();

  for (const memory of memories) {
    for (const change of memory.characterStateChanges) {
      const existing = characterMap.get(change.characterName);
      // 保留更新的状态
      if (!existing || memory.chapterIndex > memories.find(m => m.chapterId === existing.stateType)?.chapterIndex!) {
        characterMap.set(change.characterName, change);
      }
    }
  }

  if (characterMap.size === 0) {
    return '（暂无角色状态信息）';
  }

  const lines: string[] = ['## 角色状态表', ''];

  for (const [name, change] of characterMap) {
    lines.push(`### ${name}`);
    lines.push(`- 类型：${change.stateType}`);
    lines.push(`- 状态：${change.state}`);
    lines.push(`- 详情：${change.detail}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 构建情节进度表
 */
export function buildPlotProgressTable(memories: ChapterMemory[]): string {
  if (memories.length === 0) {
    return '（暂无情节进度信息）';
  }

  const lines: string[] = ['## 情节进度表', ''];

  // 核心情节摘要
  lines.push('### 近期情节摘要', '');
  const recentMemories = memories.slice(-5);
  for (const memory of recentMemories) {
    lines.push(`**第${memory.chapterIndex + 1}章 · ${memory.chapterTitle}**`);
    lines.push(`> ${memory.corePlot.slice(0, 100)}${memory.corePlot.length > 100 ? '...' : ''}`);
    lines.push('');
  }

  // 关键事件汇总
  lines.push('### 关键事件', '');
  const allEvents = memories.flatMap(m => m.keyEvents);
  const uniqueEvents = [...new Set(allEvents)].slice(-10);
  for (const event of uniqueEvents) {
    lines.push(`- ${event}`);
  }
  lines.push('');

  // 场景/地点变化
  lines.push('### 涉及场景', '');
  const allLocations = [...new Set(memories.flatMap(m => m.locations))];
  for (const location of allLocations.slice(0, 10)) {
    lines.push(`- ${location}`);
  }
  lines.push('');

  // 伏笔追踪
  const allForeshadows = memories.flatMap(m => m.newForeshadows);
  if (allForeshadows.length > 0) {
    lines.push('### 活跃伏笔', '');
    for (const foreshadow of allForeshadows.slice(0, 5)) {
      lines.push(`- ${foreshadow}`);
    }
  }

  return lines.join('\n');
}

/**
 * 使用规则从正文中提取记忆（核心方法，可靠性高）
 */
function extractByRules(
  chapter: Chapter,
  chapterIndex: number,
  wordCount: number
): ChapterMemory {
  const content = chapter.content;
  const sentences = content.split(/[。！？；]/).filter(s => s.trim().length > 5);

  // 1. 核心情节：取第一段的前 200 字
  const firstParagraph = content.split(/[\n\r]+/)[0] || '';
  const corePlot = firstParagraph.slice(0, 200).trim() + (firstParagraph.length > 200 ? '...' : '');

  // 2. 关键事件：提取包含动作描写的句子
  const actionPatterns = [
    /[把将把].{0,20}[拿握抓举]|[拿握抓举].{0,20}[在到]|[走来去进出起躺站坐蹲靠]?[到在向往]?[了着过]?[^\s，。！？]{2,20}[。！？；]/,
    /[说问道喊叫笑道哭喊吼叹]["""'""][^""'""]{2,30}["""'""][^。！？；]*[。！？；]/,
    /[打开关上下上翻掀揭拉推踢踩踏]?[开了关上了上翻掀揭了着][^\s，。！？]{0,30}[。！？；]/,
  ];

  const keyEvents: string[] = [];
  for (const sentence of sentences.slice(0, 30)) {
    for (const pattern of actionPatterns) {
      if (pattern.test(sentence) && sentence.length >= 10 && sentence.length <= 100) {
        keyEvents.push(sentence.trim() + '。');
        break;
      }
    }
    if (keyEvents.length >= 8) break;
  }

  // 3. 场景/地点：查找常见的场景词
  const locations = extractLocations(content);

  // 4. 时间线标记：从正文中查找时间词
  const timelineMark = extractTimeline(content);

  // 5. 角色状态变化：提取对话和动作中的角色
  const characterStateChanges = extractCharacterChanges(content, sentences);

  // 6. 伏笔相关：查找悬念描写
  const { revealedForeshadows, newForeshadows } = extractForeshadows(content);

  // 7. 情感基调：通过标点和词汇分析
  const emotionalTone = analyzeEmotion(content);

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterIndex,
    corePlot: corePlot || '（无内容）',
    keyEvents: keyEvents.length > 0 ? keyEvents : ['（本章无明显关键事件）'],
    locations: locations.length > 0 ? locations : ['（未识别到明确地点）'],
    timelineMark,
    characterStateChanges,
    revealedForeshadows,
    newForeshadows,
    emotionalTone,
    wordCount,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 从正文中提取场景/地点
 */
function extractLocations(content: string): string[] {
  const locations: string[] = [];
  const locationSet = new Set<string>();

  // 常见地点后缀
  const suffixes = [
    '村', '城', '镇', '庄', '寨', '堡',
    '山', '峰', '岭', '谷', '洞', '谷',
    '河', '江', '湖', '海', '潭', '溪',
    '路', '街', '道', '巷', '桥',
    '房', '屋', '宅', '院', '馆', '楼', '殿', '堂', '室', '厅',
    '寺', '庙', '观', '府', '宫', '阙',
    '林', '森', '田', '园', '池',
  ];

  // 匹配模式：在 X 的 Y、来到 X、前往 X
  const patterns = [
    /([^\s，。！？]{2,8})(?:村|城|镇|庄|寨|堡|山|峰|岭|洞|河|江|湖|海|潭|溪|路|街|道|巷|桥|房|屋|宅|院|馆|楼|殿|堂|室|厅|寺|庙|观|府|宫|林|森|田|园|池)(?![^\s，。！？]*[村城镇庄寨堡山峰岭洞河江湖海潭溪路街道巷桥房屋宅院馆楼殿堂室厅寺庙观府宫林森田园池])/g,
  ];

  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(m => {
        if (m.length >= 3 && m.length <= 12) {
          locationSet.add(m);
        }
      });
    }
  }

  // 特殊地点词
  const specialPlaces = ['青云山', '青云门', '大竹峰', '小竹峰', '龙首峰', '朝阳峰', '通天峰',
    '碧水潭', '黑石洞', '万蝠洞', '死灵渊', '无情海',
    '长安城', '洛阳城', '扬州城', '苏州城', '杭州城',
    '青云祖师', '大竹峰上', '山路上', '竹林中', '溪水旁'];

  for (const place of specialPlaces) {
    if (content.includes(place) && place.length >= 2) {
      locationSet.add(place);
    }
  }

  locations.push(...Array.from(locationSet).slice(0, 8));
  return locations;
}

/**
 * 从正文中提取时间线标记
 */
function extractTimeline(content: string): string | undefined {
  const timelinePatterns = [
    /(?:故事|小说|此番)[前后左右]{1,3}(\d+)(?:年|个月|天|日|时辰)/,
    /(?:修炼|修行|学艺|入门|拜师|出山)[前后左右]{1,3}(\d+)(?:年|个月|天|日|时辰)/,
    /(?:第|每|又|再|接着|随后|之后|之前)(?:一|二|三|四|五|六|七|八|九|十|\d+)(?:天|日|年|月|个时辰)/,
    /(?:春|夏|秋|冬|初|末|中|早|午|晚|夜|晨|暮|黎明|黄昏|深夜)(?:天|日|晨|夜|春|夏|秋|冬|季)/,
    /(?:多年|数年后|多年后|数月后|数日后|转眼|倏忽|忽一日|忽有一日)/,
    /(?:当年|那年|那日|那月|那时|此时|彼时|此刻)/,
  ];

  for (const pattern of timelinePatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return undefined;
}

/**
 * 从正文中提取角色状态变化
 */
function extractCharacterChanges(content: string, sentences: string[]): CharacterStateChange[] {
  const changes: CharacterStateChange[] = [];
  const characterSet = new Set<string>();

  // 提取对话中的角色名
  const dialoguePattern = /(["""'""][^""'""]{1,20}["""'""])[说问道喊叫笑道][的]?/g;
  let match;
  while ((match = dialoguePattern.exec(content)) !== null) {
    const speaker = match[1].replace(/["""'"""]/g, '').trim();
    if (speaker.length >= 2 && speaker.length <= 8 && !speaker.includes('的')) {
      characterSet.add(speaker);
    }
  }

  // 查找角色动作（常见动作+角色名）
  const actionVerbs = ['走到', '来到', '站起', '坐下', '躺下', '抬起头', '转过身', '回过头',
    '拿起', '放下', '抽出', '握紧', '松开', '揭开', '打开', '关上',
    '看向', '望向', '盯着', '瞥见', '听见', '听到', '闻到',
    '走进', '冲出', '跃入', '飞向', '逃向', '奔向'];

  for (const sentence of sentences.slice(0, 20)) {
    for (const verb of actionVerbs) {
      const idx = sentence.indexOf(verb);
      if (idx > 0 && idx < 10) {
        // 提取动词前的可能是角色名的部分
        const before = sentence.slice(0, idx).trim();
        if (before.length >= 2 && before.length <= 8 && /^[\u4e00-\u9fa5]+$/.test(before)) {
          characterSet.add(before);
        }
      }
    }
  }

  // 生成角色状态变化
  for (const charName of Array.from(characterSet).slice(0, 10)) {
    // 检测角色是否首次出场
    const firstAppearPattern = new RegExp(`(?:[^\\u4e00-\\u9fa5]|^)([${charName.charAt(0)}][\\u4e00-\\u9fa5]{0,${charName.length - 1}})(?:走|来|站|坐|躺|进|出|到|去)`);
    const isFirstAppear = firstAppearPattern.test(content.slice(0, content.length / 2));

    changes.push({
      characterName: charName,
      stateType: isFirstAppear ? '出场' : '动作',
      state: isFirstAppear ? '首次出场' : '执行动作',
      detail: isFirstAppear ? `在情节中首次出现` : `发生动作描写`,
    });
  }

  return changes;
}

/**
 * 从正文中提取伏笔相关
 */
function extractForeshadows(content: string): { revealedForeshadows: string[]; newForeshadows: string[] } {
  const revealed: string[] = [];
  const newForeshadows: string[] = [];

  // 揭示伏笔的关键词
  const revealKeywords = ['原来', '竟然', '原来如此', '这才明白', '恍然大悟', '真相大白', '终于知道', '此时才知'];
  for (const keyword of revealKeywords) {
    if (content.includes(keyword)) {
      const idx = content.indexOf(keyword);
      const context = content.slice(Math.max(0, idx - 20), idx + keyword.length + 20);
      if (context.length > 10) {
        revealed.push(context.trim());
      }
    }
  }

  // 新埋伏笔的关键词
  const foreshadowKeywords = ['似乎', '好像', '隐约', '似乎要', '似乎在', '不由得', '不知为何', '总觉得'];
  for (const keyword of foreshadowKeywords) {
    const regex = new RegExp(`${keyword}[^。！？]{5,30}[。！？]`, 'g');
    const matches = content.match(regex);
    if (matches) {
      for (const m of matches.slice(0, 2)) {
        newForeshadows.push(m.trim());
      }
    }
  }

  return {
    revealedForeshadows: revealed.slice(0, 5),
    newForeshadows: newForeshadows.slice(0, 5),
  };
}

/**
 * 分析情感基调
 */
function analyzeEmotion(content: string): string {
  // 统计不同类型的句子
  const exclamations = (content.match(/[！？]/g) || []).length;
  const questions = (content.match(/[？]/g) || []).length;
  const ellipsis = (content.match(/[……—]/g) || []).length;

  // 情感关键词
  const emotionKeywords = {
    '紧张': ['紧张', '心跳', '屏息', '冷汗', '颤抖', '慌乱', '惊恐'],
    '恐怖': ['恐惧', '害怕', '发抖', '尖叫', '黑暗', '阴森', '诡异'],
    '温馨': ['温暖', '微笑', '欢笑', '亲切', '和善', '柔和', '轻声'],
    '悲伤': ['叹息', '眼泪', '哭泣', '哀伤', '凄凉', '心酸', '悲痛'],
    '愤怒': ['怒火', '愤怒', '暴怒', '大怒', '怒喝', '冷笑'],
    '悬疑': ['疑问', '疑惑', '不解', '奇怪', '神秘', '不解'],
    '激烈': ['激战', '搏斗', '争斗', '厮杀', '对峙'],
  };

  let maxCount = 0;
  let dominantEmotion = '平静';

  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    let count = 0;
    for (const keyword of keywords) {
      count += (content.match(new RegExp(keyword, 'g')) || []).length;
    }
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  // 如果感叹号很多，优先判断为紧张/激烈
  if (exclamations > 10) {
    dominantEmotion = '激烈';
  } else if (exclamations > 5) {
    dominantEmotion = '紧张';
  }

  // 如果省略号很多，可能是悬疑
  if (ellipsis > 3 && dominantEmotion === '平静') {
    dominantEmotion = '悬疑';
  }

  return dominantEmotion;
}

/**
 * AI 辅助增强（可选）
 * 使用自然语言对话方式，避免结构化 JSON
 * 
 * 容错机制：
 * - AI 调用失败不影响主流程
 * - 返回 null 时使用规则提取结果
 * - 严格验证 AI 返回内容，避免注入
 */
async function enhanceWithAI(
  chapter: Chapter,
  chapterIndex: number,
  baseMemory: ReturnType<typeof extractByRules>
): Promise<Partial<ChapterMemory> | null> {
  try {
    const { useAIService } = await import('@/services/ai/useAIService');
    const aiService = useAIService();

    if (!aiService) {
      console.log('[情节记忆] AI 服务不可用，跳过增强');
      return null;
    }

    // 分别调用 AI 获取不同的增强信息（每次一个简单问题）
    const [emotionResult, themeResult] = await Promise.allSettled([
      // 情感分析
      aiService.complete(
        `这是一段小说章节的片段：\n${chapter.content.slice(0, 500)}...\n\n请用1-2个词描述这段文字的情感基调（如：紧张、温馨、压抑、悬疑）。只回答词语，不要其他内容。`,
        { temperature: 0.3, maxTokens: 50 }
      ),
      // 主题分析
      aiService.complete(
        `这是一段小说章节的片段：\n${chapter.content.slice(0, 800)}...\n\n用一句话概括本章发生的主要事件（不超过50字）。只回答这句话，不要其他内容。`,
        { temperature: 0.3, maxTokens: 100 }
      ),
    ]);

    const result: Partial<ChapterMemory> = {};

    // 处理情感结果
    if (emotionResult.status === 'fulfilled') {
      try {
        const emotion = String(emotionResult.value).trim();
        // 严格验证：只接受纯文本词语，避免注入
        if (emotion && emotion.length <= 10 && !emotion.includes('{') && !emotion.includes('[') && !emotion.includes('\\')) {
          result.emotionalTone = emotion;
        }
      } catch (parseError) {
        console.warn('[情节记忆] 解析情感结果失败:', parseError);
      }
    } else {
      console.warn('[情节记忆] AI 情感分析失败:', emotionResult.reason);
    }

    // 处理主题结果
    if (themeResult.status === 'fulfilled') {
      try {
        const theme = String(themeResult.value).trim();
        // 严格验证：只接受纯文本
        if (theme && theme.length <= 100 && !theme.includes('{') && !theme.includes('[') && !theme.includes('\\')) {
          // 这里我们保留原来的 corePlot，只用 AI 补充情感信息
          // 如果 AI 返回的主题更有价值，可以考虑替换
          result.emotionalTone = theme; // 可以用 theme 更新 emotionalTone
        }
      } catch (parseError) {
        console.warn('[情节记忆] 解析主题结果失败:', parseError);
      }
    } else {
      console.warn('[情节记忆] AI 主题分析失败:', themeResult.reason);
    }

    // 只有当有有效结果时才返回
    if (Object.keys(result).length > 0) {
      console.log('[情节记忆] AI 增强成功:', result);
      return result;
    }

    return null;
  } catch (error) {
    console.warn('[情节记忆] AI 增强失败:', error);
    return null; // 返回 null 而不是抛出异常，确保不影响主流程
  }
}
