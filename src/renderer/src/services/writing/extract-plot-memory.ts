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
    chapterTitle: chapter.title || `第${chapterIndex}章`,
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
    lines.push(`**第${memory.chapterIndex}章 · ${memory.chapterTitle}**`);
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

/** 命运条目；chapterIndex 与 ChapterMemory.chapterIndex 同口径（1 基章号） */
export interface FateStatus {
  characterName: string;
  state: string;
  chapterIndex: number;
  detail: string;
  /** 最近一次押地入账的关押地（契约 11 押地变更），仅在押族有值 */
  custodyPlace?: string;
}

/** 押地账前缀（ChapterWritingPipeline.mapStatusDeltasToStateChanges 写入） */
const CUSTODY_PREFIX = '押地:';

/** 押地 value 的空值哨兵：格式层归一，不代表任何关押地 */
const EMPTY_CUSTODY_VALUES = new Set(['无', '无押地', '暂无', '未知']);

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
 * 「保释」覆盖保释/候勘/闭门待勘等合法中间态（契约 11 保释族）。
 */
const FATE_RELEASE_STATES = new Set(['获释', '保释', '平反', '复职', '复位', '赦免', '起复', '揭晓']);

/** 在押族：押地入账时保持原命运态，只刷新关押地 */
const CUSTODY_FATES = new Set(['下狱', '定罪']);

/**
 * 汇总全量章节记忆的角色命运状态：取每个角色最晚一次的命运级变化。
 *
 * 解除只认 AI 提取的规范化解除值（FATE_RELEASE_STATES），不做正文词共现：
 * 章级共现无法判断解除词说的是谁（2026-09-23 r8-S1-05 回放实证：ch119「崔显
 * 磕头领命戴罪效力」与顾宪诚同章共现，顾宪诚的下狱被连带解除；ch134「防……
 * 趁乱劫狱」否定句再次命中；ch142 起草前命运表无此人，在押者以次辅身份自由出场）。
 *
 * 押地入账即在押证据：押地 delta 只在在押者关押地转移时出账（契约 11），晚于最近
 * 一次解除的押地条目重新建立在押（去职/无命运 → 下狱），已在押者只刷新关押地。
 */
export function collectCharacterFates(memories: ChapterMemory[]): FateStatus[] {
  const byCharacter = new Map<string, FateStatus>();
  const memorySorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const memory of memorySorted) {
    // 同章既有解除又有押地时，押地不反向重锁：同章先后顺序不可靠，解除 delta 是更强信号
    const releasedThisChapter = new Set(
      memory.characterStateChanges
        .filter(change => FATE_RELEASE_STATES.has(change.state))
        .map(change => change.characterName)
    );
    for (const change of memory.characterStateChanges) {
      const current = byCharacter.get(change.characterName);
      // 死亡族在册时，获释/复职等解除 delta 一律不生效：死人不能被释放，
      // 这条 delta 是矛盾信号（写手复活或提取误报），交 fate-adjudicate 终审
      if (FATE_RELEASE_STATES.has(change.state)) {
        if (isDeathFate(current?.state)) continue;
        byCharacter.delete(change.characterName);
        continue;
      }
      if (change.state.startsWith(CUSTODY_PREFIX)) {
        applyCustodyEvidence(byCharacter, change, memory.chapterIndex, releasedThisChapter);
        continue;
      }
      if (!FATE_STATES.has(change.state)) continue;
      // 死亡族在册时，轻态（下狱/定罪/去职）不覆盖：死人不能再入狱，
      // 覆盖会让禁入名单/状态摘要读到「下狱」，真复活信号被洗白
      if (isDeathFate(current?.state) && !isDeathFate(change.state)) continue;
      if (!current || memory.chapterIndex >= current.chapterIndex) {
        byCharacter.set(change.characterName, {
          characterName: change.characterName,
          state: change.state,
          chapterIndex: memory.chapterIndex,
          detail: change.detail,
          ...(CUSTODY_FATES.has(change.state) && current?.custodyPlace
            ? { custodyPlace: current.custodyPlace }
            : {}),
        });
      }
    }
  }
  dropFatesContradictedByLaterActivity(byCharacter, memorySorted);
  return [...byCharacter.values()];
}

/** 押地条目 → 命运表：在押者刷新关押地；去职/无命运者重建在押；死亡族不动 */
function applyCustodyEvidence(
  byCharacter: Map<string, FateStatus>,
  change: CharacterStateChange,
  chapterIndex: number,
  releasedThisChapter: Set<string>
): void {
  const place = change.state.slice(CUSTODY_PREFIX.length).trim();
  if (!place || EMPTY_CUSTODY_VALUES.has(place)) return;
  if (releasedThisChapter.has(change.characterName)) return;
  const current = byCharacter.get(change.characterName);
  if (isDeathFate(current?.state)) return;
  if (current && CUSTODY_FATES.has(current.state)) {
    byCharacter.set(change.characterName, { ...current, custodyPlace: place });
    return;
  }
  byCharacter.set(change.characterName, {
    characterName: change.characterName,
    state: '下狱',
    chapterIndex,
    detail: change.detail,
    custodyPlace: place,
  });
}

/** 后生事实熔断只覆盖死亡族：误登死亡会通过状态摘要杀主角、评审连拒至管线
 *  中止（2026-08-27 三轮回归实证），且死亡无法用剧情词合法解除，只能靠活动
 *  事实证伪。真复活场景上游门禁先拦；漏网者由 triage 恒红 dead-resurrection
 *  对最终语料审计兜底。下狱/定罪/去职是程序性事实，有 AI 仲裁与解除词表两条
 *  正路；若也允许「后生活动」熔断，过期滚纲把反派写回朝堂会反向洗掉真实命运
 *  ——B 书 200 章实测赵元泰/崔景渊去职后连续多章复位，矛盾就此被抹平
 *  （2026-09-01）。 */
const MISFIRE_PRONE_FATES = new Set(['死亡', '驾崩']);

/**
 * 死亡族终态不可被轻态覆盖/解除误擦（2026-09-12 g38f 200 章 S1 实证：
 * 严开礼 ch179 撞柱气绝入账「死亡」，ch186 写手按过期滚纲节点写其越狱复活，
 * ch196「下狱」delta 直接顶掉死亡——命运表、overlay、禁入名单、triage 裁决
 * 全部读到「下狱」，真复活信号被静默洗白）。死人再被下狱/定罪/去职/获释
 * 都是矛盾信号而非状态转移：死亡保持终态，语义终审归 fate-adjudicate。
 */
const IRREVERSIBLE_FATES = new Set(['死亡', '驾崩']);

function isDeathFate(state: string | undefined): boolean {
  return !!state && IRREVERSIBLE_FATES.has(state);
}

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
      // 状态转移不是「后生活动」：越狱/获释族/押地 delta 断言角色活着且在押，
      // 对在册死亡是矛盾信号而非误报证伪（2026-09-12 g38f 200 章 S1 实证：
      // 严开礼死亡在册被 ch187 越狱 delta 当活动熔断，ch195 下狱重登，
      // 死亡信号就此洗白）。熔断只认良性生活状态（出场/晋升/受伤类）。
      if (
        change.state &&
        (FATE_STATES.has(change.state) ||
          FATE_RELEASE_STATES.has(change.state) ||
          change.state === '越狱' ||
          change.state.startsWith(CUSTODY_PREFIX))
      ) {
        continue;
      }
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
    // 已有不同终态登记时保守跳过：显式数据优先于记忆推导，避免互相覆盖。
    // 例外（2026-09-12 g38f 200 章 S1 实证）：命运表死亡族 > 已登记轻态——
    // 严开礼 runtime 残留「下狱」时 ch179 死亡被保守跳过，判官全程读不到
    // 死亡，ch186 写手按过期滚纲写其越狱复活一次过审。死亡不可逆，必须顶掉
    // 旧轻态；反向（表轻态 vs 已登记死亡）维持保守跳过。
    const existing = String(entity.attributes?.status ?? '');
    if (isDeathFate(existing) && !isDeathFate(fate.state)) continue;
    if (existing && existing !== fate.state && !isDeathFate(fate.state)) continue;
    if (existing === fate.state) continue;
    next[entity.id] = { ...entity, attributes: { ...entity.attributes, status: fate.state } };
    applied += 1;
  }
  // 清除被后生活动证伪的残留终态（含押地残留：2026-09-30 r16 ch114 实证——
  // status 被清除后 custody「天牢」仍留在实体上，判官 stateDigest 读作在押）
  for (const [name, entity] of byName) {
    if (fateNames.has(name)) continue;
    const existing = String(entity.attributes?.status ?? '');
    if (!fateValues.includes(existing)) continue;
    if (!activeAfterFate.get(name)) continue;
    const attributes = { ...(next[entity.id]?.attributes ?? entity.attributes) };
    delete attributes.status;
    delete attributes.custody;
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
  // 分族措辞（2026-09-15 g38f r4 ch129 崔显实证：ch60 已入下狱账，ch129 仍以自由身
  // 现身朝班举黄绫自辩——旧文案「禁止以在场活人身份出场」对下狱族语义模糊，
  // 判官无法区分「狱中受审（合法）」与「自由身行动（违规）」）：
  // 死亡族维持全禁；下狱/定罪/去职族禁的是自由身形态，狱中形态合法。
  const fateZoneText = (
    state: string,
    chapterIndex: number,
    detail: string,
    custodyPlace?: string
  ): string => {
    const place = custodyPlace ? `，现押于${custodyPlace}` : '';
    const base = `已于第${chapterIndex}章${state}（证据：${detail.slice(0, 50)}）${place}`;
    if (state === '死亡' || state === '驾崩') {
      return `${base}，本章禁止其以在场活人身份出场、对话或行动；仅可作回忆/追述提及`;
    }
    const custody = state === '下狱' || state === '定罪';
    return custody
      ? `${base}，本章其只能以在押/狱中受审/押解途中的形态出现或被提及；禁止以自由身现身朝班、官署办公、领兵、自行出入或当众自辩——注意「剧情性回归」同样违规：让该角色若无其事地重新出现在公堂主事、深宅议事、率部行动等日常场景，而未在本章或近章明示释放/提审/押解过程的，即属状态矛盾（2026-09-16 r5 实证：黄承德 ch63 被捕后 ch72 无交代自由出场、崔敬堂革职后无复职即复位公座）；若剧情确需其离开牢狱或恢复官身，必须先写明示的押解/提审/释放/复职过程`
      : `${base}，本章禁止其以原职身份办公、理事或受命；复起必须有明示的任命过程——革职看管者若无复职明旨即重坐公座理事，同样属状态矛盾`;
  };
  return collectCharacterFates(memories)
    .filter(fate => roster.has(fate.characterName))
    .map(
      fate =>
        `${fate.characterName}${fateZoneText(fate.state, fate.chapterIndex, fate.detail, fate.custodyPlace)}`
    );
}

/**
 * 头衔锚（2026-09-15 契约 14，g38f 200 章全文通读实证官职五重漂移）：
 * 每角色最新一次「头衔:」入账的最新值，供写作 prompt 注入正文称谓锚——
 * 正文中的官职/头衔/品级称谓必须与最近一次入账头衔一致。
 */
export interface CharacterTitleAnchor {
  characterName: string;
  title: string;
}

export function collectCharacterTitles(memories: ChapterMemory[]): CharacterTitleAnchor[] {
  const byCharacter = new Map<string, CharacterTitleAnchor & { chapterIndex: number }>();
  const memorySorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const memory of memorySorted) {
    for (const change of memory.characterStateChanges) {
      if (!change.characterName || !change.state.startsWith('头衔:')) continue;
      const title = change.state.slice('头衔:'.length).trim();
      if (!title) continue;
      const prev = byCharacter.get(change.characterName);
      if (!prev || memory.chapterIndex >= prev.chapterIndex) {
        byCharacter.set(change.characterName, {
          characterName: change.characterName,
          title,
          chapterIndex: memory.chapterIndex,
        });
      }
    }
  }
  return [...byCharacter.values()].map(({ characterName, title }) => ({ characterName, title }));
}

/**
 * 纪年锚（2026-09-16 r5 全文通读实证：纪年五套架空+八种真实年号混入互斥）：
 * 从近章记忆文本确定性抽取「年号+数字年」叙述句（候选网，真实明朝年号在
 * 写作层另有黑名单守卫拦截），取最近 N 条供写作 prompt 注入——正文纪年必须
 * 与近章既成纪年连续。抽取的是原文叙述不是语义判定，属软提示非禁令。
 */
const ERA_NARRATIVE_RE = /[^\s。！？"」』]{2,4}(?:元|正|嘉|永|天|成|弘|万|历|宣|德|庆|和|平|安|贞|佑|兴|宁|定|光|熹|崇)[^\s。！？"」』]{0,2}[一二三四五六七八九十百零]{1,4}年/g;
const REAL_MING_ERAS_FILTER = new Set(['洪武','建文','永乐','洪熙','宣德','正统','景泰','天顺','成化','弘治','正德','嘉靖','隆庆','万历','泰昌','天启','崇祯']);

/** 中文年份（一~一百内）→ 阿拉伯数；解析失败返回 null。跨度换算是格式层算术 */
const CN_DIGIT: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function parseChineseYear(text: string): number | null {
  const m = text.match(/([一二三四五六七八九十]{1,3})年/);
  if (!m) return null;
  const s = m[1];
  if (s === '十') return 10;
  const tenIdx = s.indexOf('十');
  if (tenIdx < 0) return CN_DIGIT[s] ?? null;
  const tens = tenIdx === 0 ? 1 : CN_DIGIT[s[0]] ?? 0;
  const ones = tenIdx === s.length - 1 ? 0 : CN_DIGIT[s[tenIdx + 1]] ?? 0;
  return tens * 10 + ones;
}

export function collectEraAnchors(
  memories: ChapterMemory[],
  maxAnchors = 4,
): string[] {
  const anchors: Array<{ chapterIndex: number; text: string }> = [];
  const memorySorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const memory of memorySorted) {
    const text = `${memory.corePlot || ''}\n${(memory.keyEvents ?? []).join('\n')}`;
    for (const match of text.matchAll(ERA_NARRATIVE_RE)) {
      const token = match[0];
      const eraName = token.replace(/[一二三四五六七八九十百零]{1,4}年$/, '');
      if (REAL_MING_ERAS_FILTER.has(eraName)) continue; // 真实年号不注入锚
      // 与已收锚同一年号只保留最新章
      const dupIdx = anchors.findIndex(a => a.text.replace(/[一二三四五六七八九十百零]{1,4}年$/, '') === eraName);
      if (dupIdx >= 0) {
        anchors[dupIdx] = { chapterIndex: memory.chapterIndex, text: token };
      } else {
        anchors.push({ chapterIndex: memory.chapterIndex, text: token });
      }
    }
  }
  const lines = anchors
    .sort((a, b) => b.chapterIndex - a.chapterIndex)
    .slice(0, maxAnchors)
    .map(a => `第${a.chapterIndex}章纪年「${a.text}」`);
  if (lines.length === 0) return [];
  // 当前年份锚（r11 实证三洞失败签名全在纪年跨度/未来年份族：ch42「天德四年至
  // 天德十二年＝整整二十年」9 年当 20 年、ch35 借据落款写至「天德二十年」而当前
  // 十二年、ch91 元年起整十年而当前九年）。锚定「最晚章提及的年份」为当前年，
  // 给出换算规则与未来年份禁令——跨度算术是格式层，规则可确定性给出。
  // 锚 token 会带 ≤4 字上文（「已是天德十二年」），年号显示取去年份后的尾部两字
  // （架空年号全书统一两字：天德/景和/建安…）。
  const dominant = anchors.slice().sort((a, b) => b.chapterIndex - a.chapterIndex)[0];
  const stripped = dominant.text.replace(/[一二三四五六七八九十百零]{1,4}年$/, '');
  const eraDisplay = stripped.length >= 2 ? stripped.slice(-2) : stripped;
  const year = parseChineseYear(dominant.text);
  const currentLine = year != null
    ? `当前纪年「${eraDisplay}${year}年」（第${dominant.chapterIndex}章确立）：任何纪年跨度先换算——「${eraDisplay}X年至${eraDisplay}Y年」的跨度＝(Y−X)年，禁止凭「二十年来/十年间」类笼统表述替代换算；正文与文书中出现的年份数字不得大于${year}（当前年份之后的历史不存在，回溯性文书/借据/旧账的落款年份同样不得越界）`
    : `当前纪年「${dominant.text}」（第${dominant.chapterIndex}章确立）：纪年跨度按年份差换算，文书落款年份不得晚于当前年份`;
  return [currentLine, ...lines];
}

/**
 * 数字锚（2026-09-17 g38f r6 全文通读实证：同一笔盐税五套口径、太仓存粮四万石
 * 无解释改写为四十万石、押运车队八十箱变八百辆——长程数字漂移是书审最大 S1 簇）：
 * 从近章记忆文本确定性抽取含「数字+计量单位」的既成叙述句（候选网，语义判定
 * 归判官——数值是否属于同一对象、是否矛盾由【数字一致】规则判定），取最近 N 条
 * 供写作侧【数字锚】与判官【数字一致】共源注入。数据源含契约 15 的 numeric-fact
 * 事件（经 keyEvents 入链）。
 */
const NUMERIC_UNIT_RE = /[一二三四五六七八九十百千万零\d]+(?:万|千|余)?(?:两|匹|石|引|斤|兵|人|骑|亩|顷|箱|辆|艘|张|道|锭|贯|斛|斗|文)/;

export function collectNumericAnchors(
  memories: ChapterMemory[],
  maxAnchors = 8,
): string[] {
  const anchors: Array<{ chapterIndex: number; text: string }> = [];
  const memorySorted = [...memories].sort((a, b) => b.chapterIndex - a.chapterIndex);
  for (const memory of memorySorted) {
    const lines = [
      ...(memory.keyEvents ?? []),
      memory.corePlot || '',
    ];
    for (const raw of lines) {
      // 抽整句（按句号切）而非整段，避免把无关键Events段落整体灌入
      for (const sentence of raw.split(/[。！？；\n]/)) {
        const s = sentence.trim();
        if (s.length < 6 || s.length > 60) continue;
        if (!NUMERIC_UNIT_RE.test(s)) continue;
        if (anchors.some(a => a.text === s)) continue;
        anchors.push({ chapterIndex: memory.chapterIndex, text: s });
        if (anchors.length >= 32) break;
      }
      if (anchors.length >= 32) break;
    }
    if (anchors.length >= 32) break;
  }
  // 口径正典·最新值覆盖（2026-09-24 g38f 500ch 书审 S2 实证：盐案亏空
  // 200/300/400/500 万四档漂移——旧实现平铺最近 8 条数字句，同对象新旧值并列
  // 注入，模型无所适从）：按「主体前缀」聚类，同对象只保留章号最新一条
  // （候选已按章倒序，先见为准）。前缀 = 句首至首个数字/单位词前的文本；
  // 两前缀共享任一 ≥3 字连续片段即视为同对象——措辞变化的新勘误句若聚不上
  // 则两条都注入（退化为旧行为，不劣化），另有头部兜底规则声明最新章优先。
  const prefixOf = (s: string): string => {
    const m = s.match(/^[^0-9零一二三四五六七八九十百千万两]+/u);
    return (m ? m[0] : s).trim();
  };
  const fragmentsOf = (prefix: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i + 3 <= prefix.length; i += 1) out.push(prefix.slice(i, i + 3));
    return out;
  };
  const canonical: Array<{ chapterIndex: number; text: string }> = [];
  const seenFragments = new Set<string>();
  for (const anchor of anchors) {
    const fragments = fragmentsOf(prefixOf(anchor.text));
    if (fragments.length > 0 && fragments.some(f => seenFragments.has(f))) continue;
    for (const f of fragments) seenFragments.add(f);
    canonical.push(anchor);
    if (canonical.length >= maxAnchors) break;
  }
  if (canonical.length === 0) return [];
  return [
    '以下为各关键数字对象的最新既成值（同对象旧值已作废；若条目间仍疑似同对象不同值，以章号最新者为准，引用旧值必须写出勘误过程）。同一对象在本章内多次出现的数额必须一致；涉及乘除换算（单价×数量、比例×基数、年数×岁入）先笔算核验再落笔——乘积与总量声明对不上、同账两说，判官将直接拒稿（r11 实证 ch29 一万八千两/九千两同账两说、ch44 亩产折价差 9.1 倍、ch55 耗羡差额口径混乱，均三连拒成洞）',
    ...canonical.map(a => `第${a.chapterIndex}章既成「${a.text}」`),
  ];
}

/**
 * 命运状态正典（2026-09-24 g38f 500ch 书审 S1/S2 实证：在押角色凭空自由出场、
 * 去职角色照常行使职权——终态禁令只列死亡族，可逆终态无注入）：从章记忆的
 * characterStateChanges 取每角色最新一条命运状态（倒序先见为准），产出
 * 「角色：状态（第N章起）」供写作 prompt 注入。与死亡终态禁令互补：死亡禁入
 * 是硬禁令，这里是可逆终态的「当前口径」——正文处理这些角色必须先与该状态
 * 自洽（在押者出场需押解/提审过程，去职者不得行使原职权）。
 */
export interface FateStatusAnchor {
  name: string;
  status: string;
  chapterIndex: number;
}

export function collectFateStatusAnchors(
  memories: ChapterMemory[],
  maxRows = 12,
): FateStatusAnchor[] {
  const sorted = [...memories].sort((a, b) => b.chapterIndex - a.chapterIndex);
  const latest = new Map<string, FateStatusAnchor>();
  for (const memory of sorted) {
    for (const change of memory.characterStateChanges ?? []) {
      const name = String(
        (change as { characterName?: unknown }).characterName ?? ''
      ).trim();
      if (!name || latest.has(name)) continue;
      const status = String(
        (change as { state?: unknown }).state ??
          (change as { status?: unknown }).status ??
          ''
      ).trim();
      if (!status) continue;
      latest.set(name, { name, status, chapterIndex: memory.chapterIndex });
    }
  }
  return [...latest.values()].slice(0, maxRows);
}

/**
 * 身份锚（2026-09-17 g38f r6 实证：角色表赵宣=三皇子恭王本人，ch24 写手却自行
 * 发明「户部右侍郎的姻亲、刑部主事赵宣」降格身份，ch25 又按角色表写回恭王本人
 * ——同一人前后两身份）：取本章出场角色的角色卡身份首句，供写作 prompt 注入——
 * 出场角色的身份/地位/职权必须与角色卡一致，禁止发明同名姻亲/替身/门客调和。
 */
export interface CharacterIdentityAnchor {
  name: string;
  identity: string;
}

export function collectCharacterIdentityAnchors(
  characters: Array<{ name?: string; description?: string }>,
  allowedNames: string[],
  maxAnchors = 12
): CharacterIdentityAnchor[] {
  const allowed = new Set(allowedNames.map(n => n.trim()).filter(Boolean));
  const out: CharacterIdentityAnchor[] = [];
  for (const character of characters) {
    const name = (character.name ?? '').trim();
    if (!name || !allowed.has(name)) continue;
    const identity = (character.description ?? '')
      .split(/[。；;]/)[0]
      .trim()
      .slice(0, 50);
    if (!identity) continue;
    out.push({ name, identity });
    if (out.length >= maxAnchors) break;
  }
  return out;
}

/**
 * 假死在册角色（2026-09-20 g38f r8 实证：ch152 假死被登「死亡」→ 死亡禁令/
 * 陈旧度裁剪/判官三道防线锁死主角 48 章，蓝图活体节点全灭，写手被迫发明
 * 衣冠道具、滚纲按死人写「生前密信」）：登「假死」且其后无「揭晓」delta 的
 * 角色——假死=活着的隐匿状态，不进任何终态禁令（FATE_STATES/RUNTIME 状态库
 * 均不含假死），仅供写作侧注入【假死纪律】：隐匿形态活动 + 公开现身需揭晓。
 */
export interface FakedDeathCharacter {
  name: string;
  chapterIndex: number;
}

export function collectFakedDeathCharacters(
  memories: ChapterMemory[]
): FakedDeathCharacter[] {
  const memorySorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  const faked = new Map<string, FakedDeathCharacter>();
  for (const memory of memorySorted) {
    for (const change of memory.characterStateChanges) {
      if (!change.characterName) continue;
      if (change.state === '假死') {
        faked.set(change.characterName, {
          name: change.characterName,
          chapterIndex: memory.chapterIndex,
        });
      } else if (change.state === '揭晓') {
        // 揭晓后不再是假死（身份已公开），从在册表移除
        faked.delete(change.characterName);
      }
    }
  }
  return [...faked.values()];
}

/**
 * 头衔锚 → runtime 实体表接线（与 overlayCharacterFates 同构）：
 * 把 collectCharacterTitles 的最新头衔映射到 entities.attributes.title，
 * 不落 SQLite（每章从记忆重推导），仅作用于本章起草/校验视图。
 */
export function overlayCharacterTitles(
  entities: Record<string, StoryEntity>,
  memories: ChapterMemory[],
): CharacterFateOverlayResult {
  const titles = collectCharacterTitles(memories);
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
  for (const anchor of titles) {
    const entity = byName.get(anchor.characterName.trim());
    if (!entity) continue;
    if (String(entity.attributes?.title ?? '') === anchor.title) continue;
    next[entity.id] = { ...entity, attributes: { ...entity.attributes, title: anchor.title } };
    applied += 1;
  }
  return { entities: next, applied };
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

