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
 *
 * 2026-09-06 退役：动作动词前缀扒名的启发式把「沈怀安快步」「沈怀安反手」等
 * 动宾粘连串当角色名入账，主角在第 55/61/101 章被重复登记「首次出场」，
 * 「执行动作」类无语义条目持续污染状态摘要（g38f-200chr2 200 章实测）。
 * 语义判定归 AI 提取合同（命运宣告契约 7-11）；出场/动作类碎片没有下游
 * 依赖（命运锁/禁入名单/判官冲突检测都只消费 FATE_STATES），整体停用。
 */
function extractCharacterChanges(
  _content: string,
  _sentences: string[],
  _characterRoster?: string[]
): CharacterStateChange[] {
  return [];
}

/**
 * 命运级状态：一旦进入即视为「不可自由活动」的终端状态。
 * 后续章节要写他们出场（回忆/翻案/平反除外）必须先显式解除。
 * 去职（削爵/革职/罢免/停职/废黜）2026-09-01 增补：B 书 200 章实测反派
 * 被削爵/停职后仍连续多章当朝履职（过期滚纲节点履约），禁入名单没有
 * 该态可依，判定无从报 fact_conflict。
 */
export const FATE_STATES = new Set(['死亡', '驾崩', '下狱', '定罪', '去职']);

/** 可解除命运（翻案/越狱/官复原职/保释候勘）的规则词，命中则从禁入名单剔除。
 *  保释/候勘系来自 2026-08-27 百章实测：权臣「待罪保释在外」「闭门待勘」是剧情
 *  合法中间态，不识别会把终态当永续、把后续正常活动误判为死而复活。
 *  复爵/复位/东山再起系 2026-09-01 随「去职」态增补：削爵/罢免后剧情性复起的
 *  合法通道。 */
const FATE_RELEASE_PATTERNS: RegExp[] = [
  /平反/, /翻案/, /无罪释放/, /赦免/, /大赦/, /洗清(?:冤屈|罪名)/,
  /越狱/, /劫狱/, /逃出(?:天牢|大牢|宗人府|诏狱)/,
  /保释(?:在外)?/, /取保(?:候审)?/, /候勘/, /待勘/, /戴罪(?:立功)?/,
  /起复/, /官复原职/, /重新起用/, /复爵/, /恢复(?:爵位|官职|职位|职务)/,
  /复位/, /重返(?:朝堂|朝廷|庙堂)/, /东山再起/,
];

export interface FateStatus {
  characterName: string;
  state: string;
  chapterIndex: number;
  detail: string;
}

/**
 * 命运级解除值（AI 提取合同 8 的规范化 value，非本地正则）：提取侧已把
 * 「获释族（出狱/放出/开释/走出牢门…）」归一为「获释」等合法解除值。消费侧
 * 此前只认 FATE_STATES 五态，这些解除 delta 被 `!FATE_STATES.has()` 静默
 * 丢弃——角色永久卡死在旧终态（2026-09-12 终验实证：萧元瑾 ch150 已出账
 * 「获释」，ch175 状态摘要仍是「下狱」，蓝图按获释后剧情写监国被三连拒成洞）。
 * 语义判定在 AI 合同，这里只做状态机映射：合法解除 delta 到账即从禁入名单剔除。
 * 注意「越狱」不在此列：越狱是逃亡不是合法解除，逃犯在押身份仍在（滚纲命运锁
 * 语义：越狱后终态=最晚下狱态，重捕/通缉剧情由此正确衔接——outline-roller
 * 命运弧用例锁定的行为）。
 */
const FATE_RELEASE_STATES = new Set(['获释', '平反', '复职', '复位', '赦免', '起复']);

/**
 * 汇总全量章节记忆的角色命运状态：取每个角色最晚一次的命运级变化；
 * 若其后的章节记忆里出现了解除性叙述（平反/越狱等），则不再列为禁入。
 */
export function collectCharacterFates(memories: ChapterMemory[]): FateStatus[] {  const byCharacter = new Map<string, FateStatus>();
  const memorySorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const memory of memorySorted) {
    for (const change of memory.characterStateChanges) {
      // 解除 delta（合同 8 规范化值）：到账即解除禁入——AI 已做语义判定，
      // 消费侧不做二次正则。解除后若再入终态，下方 FATE_STATES 分支自然重登。
      if (FATE_RELEASE_STATES.has(change.state)) {
        byCharacter.delete(change.characterName);
        continue;
      }
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

/** 后生事实熔断只覆盖死亡族：误登死亡会通过状态摘要杀主角、评审连拒至管线
 *  中止（2026-08-27 三轮回归实证），且死亡无法用剧情词合法解除，只能靠活动
 *  事实证伪。真复活场景上游门禁先拦；漏网者由 triage 恒红 dead-resurrection
 *  对最终语料审计兜底。下狱/定罪/去职是程序性事实，有 AI 仲裁与解除词表两条
 *  正路；若也允许「后生活动」熔断，过期滚纲把反派写回朝堂会反向洗掉真实命运
 *  ——B 书 200 章实测赵元泰/崔景渊去职后连续多章复位，矛盾就此被抹平
 *  （2026-09-01）。 */
const MISFIRE_PRONE_FATES = new Set(['死亡', '驾崩']);

function dropFatesContradictedByLaterActivity(
  byCharacter: Map<string, FateStatus>,
  memorySorted: ChapterMemory[]
): void {
  for (const memory of memorySorted) {
    for (const change of memory.characterStateChanges) {
      const name = change.characterName;
      const fate = byCharacter.get(name);
      if (!fate) continue;
      if (!MISFIRE_PRONE_FATES.has(fate.state)) continue;
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
export const RUNTIME_FATE_STATUS_VALUES = ['死亡', '驾崩', '下狱', '定罪', '去职'] as const;

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
/** 抓捕后叠加重复项（同角色同状态保留首条），按章节内出现顺序稳定输出 */
/**
 * keyEvents 真源合并（2026-09-04，与命运账 mergeCharacterStateChanges 同构）：
 * AI 提取的事件摘要在前，规则层只补漏。规则层 keyEvents 正则 25-43% 章节空转
 * 「（本章无明显关键事件）」（正则塔服役期实测），AI 条目存在时占位符一并清除。
 */
export function mergeKeyEvents(aiEvents: string[], ruleEvents: string[]): string[] {
  const cleaned = [...aiEvents, ...ruleEvents]
    .map(item => item.trim())
    .filter(item => item.length > 0 && !item.startsWith('（本章无明显关键事件'));
  const out: string[] = [];
  for (const item of cleaned) {
    if (out.some(existing => existing.includes(item) || item.includes(existing))) continue;
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

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

