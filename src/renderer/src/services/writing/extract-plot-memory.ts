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
import type { StoryEntity } from '@/types/story-runtime';
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
    /** 项目角色名白名单：传入时命运级提取只认名单内的名字，过滤谓语前缀噪声 */
    characterRoster?: string[];
  }
): Promise<ChapterMemory> {
  const content = chapter.content;
  const wordCount = Math.ceil(content.length / 2);

  // 1. 基础提取：使用规则从正文中提取
  const baseMemory = extractByRules(chapter, chapterIndex, wordCount, options?.characterRoster);

  // 2. 尝试 AI 辅助增强（可选，不影响主流程）
  const enableAIEnhancement = options?.enableAIEnhancement ?? true;
  if (enableAIEnhancement) {
    try {
      const aiEnhanced = await enhanceWithAI(chapter);
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
    /** 项目角色名白名单：传入时命运级提取只认名单内的名字 */
    characterRoster?: string[];
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
  wordCount: number,
  characterRoster?: string[]
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
  const characterStateChanges = extractCharacterChanges(content, sentences, characterRoster);

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
function extractCharacterChanges(
  content: string,
  sentences: string[],
  characterRoster?: string[]
): CharacterStateChange[] {
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
      stateType: isFirstAppear ? 'appearance' : 'status',
      state: isFirstAppear ? '首次出场' : '执行动作',
      detail: isFirstAppear ? `在情节中首次出现` : `发生动作描写`,
    });
  }

  // 关键状态事件（生死/下狱/官职）：滑动窗口状态摘要曾经完全丢掉这类事件，
  // 500 章实测导致已死角色大面积复活。规则提取带正文证据，供下游合同禁入。
  changes.push(...extractCriticalStatusChanges(content, characterRoster));
  return changes;
}

/**
 * 命运级状态：一旦进入即视为「不可自由活动」的终端状态。
 * 后续章节要写他们出场（回忆/翻案/平反除外）必须先显式解除。
 */
const FATE_STATES = new Set(['死亡', '驾崩', '下狱', '定罪']);

/** 可解除命运（翻案/越狱/官复原职/保释候勘）的规则词，命中则从禁入名单剔除。
 *  保释/候勘系来自 2026-08-27 百章实测：权臣「待罪保释在外」「闭门待勘」是剧情
 *  合法中间态，不识别会把终态当永续、把后续正常活动误判为死而复活。 */
const FATE_RELEASE_PATTERNS: RegExp[] = [
  /平反/, /翻案/, /无罪释放/, /赦免/, /大赦/, /洗清(?:冤屈|罪名)/,
  /越狱/, /劫狱/, /逃出(?:天牢|大牢|宗人府|诏狱)/,
  /保释(?:在外)?/, /取保(?:候审)?/, /候勘/, /待勘/, /戴罪(?:立功)?/,
  /起复/, /官复原职/, /重新起用/,
];

export interface FateStatus {
  characterName: string;
  state: string;
  chapterIndex: number;
  detail: string;
}

/**
 * 汇总全量章节记忆的角色命运状态：取每个角色最晚一次的命运级变化；
 * 若其后的章节记忆里出现了解除性叙述（平反/越狱等），则不再列为禁入。
 */
export function collectCharacterFates(memories: ChapterMemory[]): FateStatus[] {  const byCharacter = new Map<string, FateStatus>();
  const memorySorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const memory of memorySorted) {
    for (const change of memory.characterStateChanges) {
      if (!FATE_STATES.has(change.state)) continue;
      const prev = byCharacter.get(change.characterName);
      if (!prev || memory.chapterIndex >= prev.chapterIndex) {
        byCharacter.set(change.characterName, {
          characterName: change.characterName,
          state: change.state,
          chapterIndex: memory.chapterIndex,
          detail: change.detail,
        });
      }
    }
    // 解除检测：只有「命运事件之后」且解除叙述与该角色同章共现才生效——
    // 一段平反文本只救它提到的人，不能顺带赦免同章所有在押角色
    for (const [name, fate] of byCharacter) {
      if (memory.chapterIndex <= fate.chapterIndex) continue;
      const text = `${memory.corePlot || ''}\n${memory.keyEvents.join('\n')}`;
      if (!text.includes(name)) continue;
      const released = FATE_RELEASE_PATTERNS.some(re => re.test(text));
      if (released) {
        byCharacter.delete(name);
      }
    }
  }
  dropFatesContradictedByLaterActivity(byCharacter, memorySorted);
  return [...byCharacter.values()];
}

/** 后生事实熔断：死亡登记之后，同角色在同章之后又出现任何出场/行动类状态行，
 *  说明死亡是误登（修辞/威胁/句级共现假阳性）或剧情有诈——取更晚的活动事实，
 *  解除终态避免主角被自己的状态摘要判死、评审连拒至管线中止（2026-08-27 三轮
 *  回归实证）。真复活场景上游门禁先拦；漏网者由 triage 恒红 dead-resurrection
 *  对最终语料审计兜底。 */
function dropFatesContradictedByLaterActivity(
  byCharacter: Map<string, FateStatus>,
  memorySorted: ChapterMemory[]
): void {
  for (const memory of memorySorted) {
    for (const change of memory.characterStateChanges) {
      const name = change.characterName;
      const fate = byCharacter.get(name);
      if (!fate) continue;
      const activityChapter = memory.chapterIndex;
      if (activityChapter <= fate.chapterIndex) continue;
      if (change.state && FATE_STATES.has(change.state)) continue;
      byCharacter.delete(name);
      break;
    }
  }
}

/**
 * 命运级终态 → runtime 状态库的接线（陈旧度门禁的数据源）。
 *
 * runtime 的 StoryEntity.attributes.status 从不被事实提取写入，
 * contractHealth.healChapterContract 的陈旧度裁剪若只读状态库将恒空转。
 * 批量写作每章起草前，把 collectCharacterFates 汇总出的终态映射到
 * 加载后的 state.entities（按 name/alias 匹配），门禁由此有据可裁。
 * 已解除命运的角色不在 fates 列表中，天然不会误标。
 */
export const RUNTIME_FATE_STATUS_VALUES = ['死亡', '驾崩', '下狱', '定罪'] as const;

export interface CharacterFateOverlayResult {
  /** 替换后的实体表（未命中的实体原样保留） */
  entities: Record<string, StoryEntity>;
  /** 实际写入 status 的实体数 */
  applied: number;
}

export function overlayCharacterFates(
  entities: Record<string, StoryEntity>,
  memories: ChapterMemory[],
): CharacterFateOverlayResult {
  const fateValues = RUNTIME_FATE_STATUS_VALUES as readonly string[];
  const fates = collectCharacterFates(memories).filter(fate =>
    fateValues.includes(fate.state)
  );
  // 每个角色「最后一次命运行」的章号，以及其后是否出现活动/出场行：
  // 实体上的终态状态是误报当章写入的，命运表被熔断清空后它仍残留——
  // 第六轮回归实证（主角被 ch4 误报判死、ch18 评审仍读到 死亡）。此处对
  // 「已不在命运表、但实体带着终态、且终态章后有活动行」的实体执行清除。
  const lastFateChapter = new Map<string, number>();
  const activeAfterFate = new Map<string, boolean>();
  for (const memory of [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex)) {
    for (const change of memory.characterStateChanges) {
      if (!change.characterName) continue;
      if (FATE_STATES.has(change.state)) {
        const prev = lastFateChapter.get(change.characterName) ?? -1;
        if (memory.chapterIndex > prev) lastFateChapter.set(change.characterName, memory.chapterIndex);
      } else if (lastFateChapter.has(change.characterName)) {
        if (memory.chapterIndex > (lastFateChapter.get(change.characterName) ?? -1)) {
          activeAfterFate.set(change.characterName, true);
        }
      }
    }
  }

  const byName = new Map<string, StoryEntity>();
  for (const entity of Object.values(entities)) {
    if (entity.kind !== 'character') continue;
    if (entity.name.trim()) byName.set(entity.name.trim(), entity);
    for (const alias of entity.aliases ?? []) {
      if (alias.trim()) byName.set(alias.trim(), entity);
    }
  }

  let applied = 0;
  const next = { ...entities };
  const fateNames = new Set<string>();
  for (const fate of fates) {
    fateNames.add(fate.characterName);
    const entity = byName.get(fate.characterName.trim());
    if (!entity) continue;
    // 已有不同终态登记时保守跳过：显式数据优先于记忆推导，避免互相覆盖
    const existing = String(entity.attributes?.status ?? '');
    if (existing && existing !== fate.state) continue;
    if (existing === fate.state) continue;
    next[entity.id] = { ...entity, attributes: { ...entity.attributes, status: fate.state } };
    applied += 1;
  }
  // 清除被后生活动证伪的残留终态
  for (const [name, entity] of byName) {
    if (fateNames.has(name)) continue;
    const existing = String(entity.attributes?.status ?? '');
    if (!fateValues.includes(existing)) continue;
    if (!activeAfterFate.get(name)) continue;
    const attributes = { ...(next[entity.id]?.attributes ?? entity.attributes) };
    delete attributes.status;
    next[entity.id] = { ...entity, attributes };
  }
  return { entities: next, applied };
}

/**
 * 续写合同用的命运级禁入条目。
 * 只登记在角色名单内的角色（规则提取的名字可能撞上非人名词，做一次白名单过滤），
 * 每条带发生章号与证据，让模型能对上号而不是盲目避开一个字符串。
 */
export function collectFateForbiddenZones(
  memories: ChapterMemory[],
  characterNames: string[]
): string[] {
  const roster = new Set(characterNames.map(n => n.trim()).filter(Boolean));
  return collectCharacterFates(memories)
    .filter(fate => roster.has(fate.characterName))
    .map(
      fate =>
        `${fate.characterName}已于第${fate.chapterIndex + 1}章${fate.state}（证据：${fate.detail.slice(0, 50)}），` +
        `本章禁止其以在场活人身份出场、对话或行动；仅可作回忆/追述提及`
    );
}
const CRITICAL_STATUS_RULES: Array<{
  state: string;
  patterns: RegExp[];
}> = [
  {
    state: '死亡',
    patterns: [
      // 命名式：X 死了/被杀/被鸩杀/毒发身亡/气绝/毙命/人头落地…
      /([\u4e00-\u9fa5]{2,8}?)(?:被[人毒酒刀剑]?[\u4e00-\u9fa5]{0,2}(?:杀|害|鸩))亡?/,
      /([\u4e00-\u9fa5]{2,8}?)(?:气绝|毙命|身亡|丧命|殒命|惨死|暴毙|命丧|死于)/,
      /杀了([\u4e00-\u9fa5]{2,8})/,
      // 动词后置式：斩杀巨贪严世宽／格杀首恶——捕获段含称号前缀，经
      // stripNameEpithets 剥除后再过白名单（「者」入前瞻集防悬赏句误吞）
      /(?:斩|格|射|毒|勒|绞)(?:杀了?)([\u4e00-\u9fa5]{2,10}?)(?=[，。！？；、"”'」』者]|$)/,
      /([\u4e00-\u9fa5]{2,8}?)(?:的(?:尸[体首]|遗体|遗容))|(?:收殓|安葬|下葬)(?:了)?([\u4e00-\u9fa5]{2,8})/,
    ],
  },
  {
    state: '驾崩',
    patterns: [
      /([\u4e00-\u9fa5]{1,6}(?:帝|皇|上|圣上|天子|君王))(?:驾崩|晏驾|崩逝|龙驭上宾|宾天|薨逝)/,
    ],
  },
  {
    state: '下狱',
    patterns: [
      /([\u4e00-\u9fa5]{2,8}?)(?:被[关押打入抓投入锁] ?(?:进|入|到)? ?(?:天牢|大牢|死牢|宗人府|大狱|监狱|诏狱))/,
      /(?:天牢|大牢|死牢|宗人府|大狱|诏狱)(?:中|里)?的?([\u4e00-\u9fa5]{2,8})/,
      /(?:押(?:解|送|入)|囚禁|圈禁)(?:了)?([\u4e00-\u9fa5]{2,8})/,
      /([\u4e00-\u9fa5]{2,8}?)(?:沦为阶下囚|被打入死牢|下狱)/,
    ],
  },
  {
    state: '定罪',
    patterns: [
      /([\u4e00-\u9fa5]{2,8}?)(?:被|遭)?(?:判斩|处斩|问斩|论罪|定罪|革职抄没|满门抄斩|褫夺)/,
    ],
  },
  {
    state: '官职变更',
    patterns: [
      /(?:擢升|晋升|升任|提拔|任命|敕封|册封|加封|封)(?:为)?([\u4e00-\u9fa5]{2,6}?(?:尚书|侍郎|大学士|首辅|总督|巡抚|将军|都统|御史|给事中|郎中|少卿|总兵|指挥使))/,
      /([\u4e00-\u9fa5]{2,8})(?:出任|接任|转任|擢|升) ?([\u4e00-\u9fa5]{2,6}?(?:尚书|侍郎|大学士|首辅|总督|巡抚|将军|都统|御史|给事中|郎中|少卿|总兵|指挥使))/,
    ],
  },
];

/**
 * 从正文提取命运级状态变化（死亡/驾崩/下狱/定罪/官职）。
 * 返回去重后的 CharacterStateChange 列表，detail 带命中正文原句片段。
 * roster 传入时只保留命中角色名单的名字——谓语前缀（「重新陷入一片死寂」的
 * 「重新陷入一片死寂」）没有词典可以枚举，白名单是唯一可靠的过滤。
 */
export function extractCriticalStatusChanges(
  content: string,
  roster?: string[]
): CharacterStateChange[] {
  const rosterSet = roster && roster.length > 0 ? new Set(roster) : null;
  const changes: CharacterStateChange[] = [];
  const seen = new Set<string>();
  for (const rule of CRITICAL_STATUS_RULES) {
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const name = stripNameEpithets(m[1] || m[2] || '');
        if (!name || name.length < 2 || name.length > 8) continue;
        // 排除代词/指示词与明显非人名的命中
        if (/^(?:的|了|他|她|它|这|那|此|其|众|一|被|又|即|皆|全部|在场)/.test(name)) continue;
        // 悬赏/通缉语境的「斩杀X者赏银万两」不是已发生的死亡
        if (
          rule.state === '死亡' &&
          /(?:赏银|悬赏|通缉|缉拿|重金|购其首级|活捉|捉拿)/.test(
            content.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
          )
        ) {
          continue;
        }
        // 假设/盘算/条件语境（「今夜若是强行在此处杀了陆云铮」）：动词循环窗口
        // 覆盖命中点前后 30 字，含假设标记即放弃——窄版祈使守卫拦不住条件句
        if (
          rule.state === '死亡' &&
          HYPOTHETICAL_SENTENCE_RE.test(
            content.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
          )
        ) {
          continue;
        }
        // 威胁/命令语气：「给我杀了顾青舟」是意图，不是事实（2026-08-27 回归实测反噬）
        if (rule.state === '死亡' && isVolitionalThreat(content, m.index)) continue;
        if (rosterSet && !rosterSet.has(name)) continue;
        const key = `${name}|${rule.state}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const start = Math.max(0, m.index - 15);
        const evidence = content.slice(start, m.index + m[0].length + 15).replace(/\s+/g, ' ').trim();
        changes.push({
          characterName: name,
          stateType: 'status',
          state: rule.state,
          detail: evidence,
        });
        if (changes.length >= 24) return changes;
      }
    }
  }
  changes.push(...extractExecutionDeaths(content, rosterSet));
  return mergeCharacterStateChanges(changes);
}

/** 抓捕后叠加重复项（同角色同状态保留首条），按章节内出现顺序稳定输出 */
export function mergeCharacterStateChanges(
  changes: CharacterStateChange[]
): CharacterStateChange[] {
  const seen = new Set<string>();
  const out: CharacterStateChange[] = [];
  for (const change of changes) {
    if (!change?.characterName || !change.state) continue;
    const key = `${change.characterName}|${change.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(change);
  }
  return out;
}

/** 命中式死亡谓词不足以覆盖「处决完成体」：斩立决当堂执行、头颅滚落这类
 *  叙事句里，人名与死亡谓语常常隔着十几个字（100 章矩阵实测第 60 章公开
 *  斩立决整体漏提→禁入名单空转→死人复活重启审判线）。此处退到句子粒度：
 *  句中含处决/头颅落地谓语且出现名单内角色 → 该角色记 死亡。 */
/** 仅认「结果可见」的完成体：裸判词（斩立决/处决）大量出现于威胁与宣判台词，
 *  不构成已发生的死亡——100章矩阵里它是漏报源，新版书里它曾把「给我杀了主角」
 *  误报成真死。锚定点改为头颅落地/当场毙命这类不可逆结果描写。 */
const EXECUTION_SENTENCE_RE =
  /人头落地|(?:头颅|首级)[^。！？]{0,8}(?:滚落|落地)|当场毙命|当场身亡|气绝身亡|当场殒命/;
const EXECUTION_AVOID_RE =
  /幸免|免于|刀下留人|且慢|手下留情|暂且留命|死罪可免/;
/** 修辞引用豁免：完成体结果词被用来修饰文书/抽象概念（「承载着无数人头落地的
 *  勘合」「人头落地的旧案卷」）是文学修辞不是事件——100章终验第24章实测把主角
 *  同句共现误判为死亡、评审以跨章生死冲突连拒至管线中止 */
const RHETORICAL_CUE_RE =
  /(?:勘合|文书|账册|账本|卷宗|名册|密报|邸报|檄文|供状|话本|戏文|故事|传闻|消息|流言|记载)[^。！？]{0,6}(?:人头落地|(?:头颅|首级)(?:滚落|落地))|人头落地的|(?:头颅|首级)(?:滚落|落地)的/u;

function isRhetoricalCueSentence(sentence: string): boolean {
  return RHETORICAL_CUE_RE.test(sentence);
}

/** 假设/盘算语气守卫（句级）：「杀了陆承安不过是交差抵罪……自己照样人头落地」
 *  是反派内心权衡，不是处决事实——2026-08-28 第五轮回归实证，句级扫描此前只挡
 *  祈使不挡条件句。含假设/推演标记的句子一律不登记。
 *  「只要统领手腕稍一用力，顾衡的头颅便会当场落地」是同族条件句（刀架脖颈但未死），
 *  百章双开 r1 ch13 漏挡致主角登记死亡、ch14 连拒 5 次管线中止——与 FactExtractor
 *  侧同源，两侧必须同步改。 */
const HYPOTHETICAL_SENTENCE_RE =
  /不过是|无非是|大不了|照样[要会]|便[是要]|便会|就得|要是|若是|如果|倘若|万一|与其|只当|等于|无非|想想|盘算|权衡|只要/u;

/** 句内「动词紧贴人名」（杀了陆承安/斩了严世宽）：意图/盘算形态，不构成完成体 */
const VERB_BEFORE_NAME_RE = (name: string): RegExp =>
  new RegExp(`[杀斩格刺鸩毒绞]了?${name}`, 'u');

/** 威胁/命令语气守卫：「给我杀了X」「要把X处斩」是意图不是事实。
 *  在死亡谓语命中点之前的小窗口内看到祈使/将来助词即放弃登记。 */
const VOLITIONAL_THREAT_TAIL_RE =
  /(?:把|要|想|敢|欲|企图|扬言|威胁|下令|传令|吩咐|去|给(?:我)?|要是)[^。！？，、"”』」]{0,10}$/u;

function isVolitionalThreat(content: string, index: number): boolean {
  const windowStart = Math.max(0, index - 14);
  return VOLITIONAL_THREAT_TAIL_RE.test(content.slice(windowStart, index));
}

function extractExecutionDeaths(
  content: string,
  rosterSet: Set<string> | null
): CharacterStateChange[] {
  if (rosterSet === null) return [];
  const changes: CharacterStateChange[] = [];
  for (const sentence of content.split(/(?<=[。！？])/)) {
    if (EXECUTION_AVOID_RE.test(sentence)) continue;
    if (!EXECUTION_SENTENCE_RE.test(sentence)) continue;
    if (isRhetoricalCueSentence(sentence)) continue;
    if (HYPOTHETICAL_SENTENCE_RE.test(sentence)) continue;
    for (const name of rosterSet) {
      if (!sentence.includes(name)) continue;
      // 「杀了陆承安」式动词紧贴人名 = 意图/盘算，即便句中带结果词也不登记
      if (VERB_BEFORE_NAME_RE(name).test(sentence)) continue;
      changes.push({
        characterName: name,
        stateType: 'status',
        state: '死亡',
        detail: sentence.replace(/\s+/g, '').slice(0, 60),
      });
    }
    if (changes.length >= 8) break;
  }
  return changes;
}

/** 「斩杀巨贪严世宽」式动词后带修饰语的命中，剥掉称号前缀再交给白名单过滤 */
function stripNameEpithets(raw: string): string {
  let name = (raw || '').trim();
  for (;;) {
    const next = name.replace(/^(?:巨贪|巨寇|大盗|逆贼|奸商|罪臣|钦犯|前朝|老贼|贼子)/, '');
    if (next === name) break;
    name = next;
  }
  return name;
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
async function enhanceWithAI(chapter: Chapter): Promise<Partial<ChapterMemory> | null> {
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
        { temperature: 0.3 }
      ),
      // 主题分析
      aiService.complete(
        `这是一段小说章节的片段：\n${chapter.content.slice(0, 800)}...\n\n用一句话概括本章发生的主要事件（不超过50字）。只回答这句话，不要其他内容。`,
        { temperature: 0.3 }
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

    // 处理主题结果：这是「本章主要事件」的一句话概括，属于 corePlot。
    // 曾误写进 emotionalTone，把情感基调覆盖成一整句事件摘要，导致下游按
    // 情感词匹配（如 includes('温馨')）的节奏判断与完结感知全部失效。
    // 规则版 corePlot 只是首段前 200 字原文，AI 概括更适合中期记忆，故直接替换。
    if (themeResult.status === 'fulfilled') {
      try {
        const theme = String(themeResult.value).trim();
        // 严格验证：只接受纯文本，长度对齐 ChapterMemory.corePlot 的 100 字上限
        if (theme && theme.length <= 100 && !theme.includes('{') && !theme.includes('[') && !theme.includes('\\')) {
          result.corePlot = theme;
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
