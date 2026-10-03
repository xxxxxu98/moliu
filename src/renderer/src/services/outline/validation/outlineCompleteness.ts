import type { ChapterBlueprint, ExecutableOutline } from '../types/executable-outline';
import { normalizedSimilarityKeepingNumbers } from '@/utils/text-similarity';
import { hasFinaleClosureSignal, isTruncatedClause } from '../rolling/foreshadowTiming';

/**
 * 长篇商业网文大纲的可应用门槛。
 *
 * 这些数值必须与 expand-direction-prompt 的固定模板保持一致，避免提示词要求
 * 50/10/10，运行时却用更低阈值放行残缺结果。
 */
export const OUTLINE_COMPLETENESS_POLICY = {
  startupChapterCount: 50,
  minimumKeyCharacters: 10,
  minimumForeshadows: 10,
  titleMinChars: 6,
  titleMaxChars: 16,
  hookMinChars: 8,
  hookMaxChars: 25,
  minimumCpns: 1,
  maximumCpns: 3,
} as const;

export type OutlineCompletenessBlockerKind =
  | 'opening-hook'
  | 'chapter-count'
  | 'character-count'
  | 'foreshadow-count'
  | 'placeholder-title'
  | 'invalid-title-length'
  | 'invalid-hook-length'
  | 'invalid-cpn-count'
  | 'invalid-chapter-order'
  | 'incomplete-blueprint'
  | 'chronology-regression'
  | 'chapter-opening-repetition'
  | 'inconsistent-story-scale'
  | 'chapter-reference-out-of-range'
  | 'unknown-character-reference'
  | 'protagonist-name-mismatch'
  | 'unknown-location-reference'
  | 'truncated-hook-clause'
  | 'finale-not-closing'
  | 'duplicate-title-grant';

export interface OutlineCompletenessBlocker {
  kind: OutlineCompletenessBlockerKind;
  message: string;
  chapterNumber?: number;
}

export interface OutlineCompletenessReport {
  canApply: boolean;
  blockers: OutlineCompletenessBlocker[];
  /** 非阻断观察项（黄签）：地点自由文本扫描的命中——正则猜地名误报史太长
   *  （「利用市」「遭遇商帮罢市」都进过表），2026-08-28 用户批准降级：
   *  不再 fail-closed，地点补登记通道照常读这里 */
  warnings?: OutlineCompletenessBlocker[];
}

const STRUCTURAL_BLOCKER_KINDS = new Set<OutlineCompletenessBlockerKind>([
  'opening-hook',
  'chapter-count',
  'character-count',
  'foreshadow-count',
  'placeholder-title',
  'incomplete-blueprint',
  'invalid-chapter-order',
  // 生成截断残句与短书末章不收束是结构性腐败（2026-09-12 g38f r3/reg 实证），
  // 触发外层重试再生成而非带病落库
  'truncated-hook-clause',
  'finale-not-closing',
]);

export function hasStructuralOutlineBlockers(report: OutlineCompletenessReport): boolean {
  return report.blockers.some(blocker => STRUCTURAL_BLOCKER_KINDS.has(blocker.kind));
}

const PLACEHOLDER_TITLE_RE =
  /^第[一二三四五六七八九十百千零\d]+章(?:\s*[（(]?未命名[)）]?)?$/u;

function isPlaceholderTitle(title: string): boolean {
  return !title.trim() || PLACEHOLDER_TITLE_RE.test(title.trim());
}

function blueprintText(blueprint: ChapterBlueprint): string {
  return [
    blueprint.title,
    blueprint.CBN,
    ...blueprint.CPNs,
    blueprint.CEN,
    ...blueprint.mustCover,
  ].join('；');
}

function blueprintEvents(blueprint: ChapterBlueprint): string[] {
  return [
    blueprint.title,
    blueprint.CBN,
    ...blueprint.CPNs,
    blueprint.CEN,
    ...blueprint.mustCover,
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseTargetWordCount(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[,，\s]/gu, '');
  const range = normalized.match(/(\d+(?:\.\d+)?)万?[-~～至到](\d+(?:\.\d+)?)万?(?:字)?/u);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const multiplier = normalized.includes('万') ? 10_000 : 1;
      return Math.round(((min + max) / 2) * multiplier);
    }
  }
  const wan = normalized.match(/(\d+(?:\.\d+)?)万(?:字)?/u);
  if (wan) return Math.round(Number(wan[1]) * 10_000);
  const plain = normalized.match(/(\d{4,9})(?:字)?/u);
  return plain ? Number(plain[1]) : null;
}

const GENERIC_CHARACTER_REFERENCES = new Set([
  '主角', '男主', '女主', '皇帝', '太子', '皇后', '反派', '盟友', '导师', '配角',
]);

/**
 * 非姓名形态的"角色引用"特征：括号注解（「忠诚执行者）」「韩尚书（六部尚书…）"）、
 * 标点断句、关系短语字（从/到/与/和…）。这些是模型把关系字段/描述整句写进了
 * 角色引用字段（2026-08-16 矩阵实测 40+ 条此类 blocker 拦死整轮），补登记救不了
 * （不是名字）、整体重试不收敛（格式惯性）——属于字段腐化的格式守卫，保留在本地。
 */
const IMPLAUSIBLE_NAME_RE = /[（()），,。；;、··]/u;
const RELATION_PHRASE_RE = /[从到与和及在对为向着]/u;

/**
 * 【2026-09-03 语义正则塔退役】头衔/官职/爵位/阵营泛称的「像不像姓名」判定
 * （原 TITLE_ONLY/ORG_TITLE/RANKED_TITLE/MULTI_CHAR_OFFICE/FACTION_ROLE_PHRASE/
 * ORGANIZATION 六族正则）不再由本地维护：每轮新语料形态（08-16 关系短语 → 08-28
 * 阵营泛称 → 09-02 多字官职 → 09-03 国号爵位/太后/殿+皇帝）都要回来补丁，与
 * 命运词表塔同款跑步机。语义判定全权归大纲修复 agent：未登记引用一律产生
 * blocker 交给 agent 裁决（resolve_character_references 记 alias/collective 台账，
 * 或 append_to_section 补登记），门禁只核对台账与登记表的结构一致性。
 */
function isPlausibleCharacterName(value: string): boolean {
  const name = value.trim();
  if (!name) return false;
  if ([...name].length > 10) return false;
  if (IMPLAUSIBLE_NAME_RE.test(name)) return false;
  if (RELATION_PHRASE_RE.test(name)) return false;
  return true;
}

function inspectSemanticConsistency(outline: ExecutableOutline): {
  blockers: OutlineCompletenessBlocker[];
  locationWarnings: OutlineCompletenessBlocker[];
} {
  const blockers: OutlineCompletenessBlocker[] = [];
  const locationWarnings: OutlineCompletenessBlocker[] = [];
  const totalChapters = outline.storyScale?.estimatedChapterCount;

  if (outline.storyScale && Number.isFinite(totalChapters) && totalChapters > 0) {
    const targetWords = parseTargetWordCount(outline.storyScale.targetWordCount);
    const computedWords = totalChapters * outline.storyScale.averageWordsPerChapter;
    if (targetWords && computedWords > 0) {
      const drift = Math.abs(targetWords - computedWords) / targetWords;
      if (drift > 0.1) {
        blockers.push({
          kind: 'inconsistent-story-scale',
          message: `故事规模互相矛盾：目标 ${targetWords} 字，但 ${totalChapters} 章 × ${outline.storyScale.averageWordsPerChapter} 字 = ${computedWords} 字（偏差 ${Math.round(drift * 100)}%）`,
        });
      }
    }
    const plannedByVolumes = outline.storyScale.suggestedVolumeCount
      * outline.storyScale.estimatedChaptersPerVolume;
    if (plannedByVolumes > 0 && Math.abs(plannedByVolumes - totalChapters) / totalChapters > 0.1) {
      blockers.push({
        kind: 'inconsistent-story-scale',
        message: `卷章规模互相矛盾：总章数 ${totalChapters}，但 ${outline.storyScale.suggestedVolumeCount} 卷 × 每卷 ${outline.storyScale.estimatedChaptersPerVolume} 章 = ${plannedByVolumes} 章`,
      });
    }
  }

  if (Number.isFinite(totalChapters) && totalChapters > 0) {
    const checkChapter = (label: string, chapter: number | null | undefined): void => {
      if (chapter !== null && chapter !== undefined && (chapter < 1 || chapter > totalChapters)) {
        blockers.push({
          kind: 'chapter-reference-out-of-range',
          message: `${label}指向第 ${chapter} 章，超出全书 1～${totalChapters} 章范围`,
        });
      }
    };
    for (const subplot of outline.subplots ?? []) {
      checkChapter(`支线「${subplot.title}」开始章节`, subplot.startChapter);
      checkChapter(`支线「${subplot.title}」结束章节`, subplot.endChapter);
      if (subplot.startChapter && subplot.endChapter && subplot.startChapter > subplot.endChapter) {
        blockers.push({
          kind: 'chapter-reference-out-of-range',
          message: `支线「${subplot.title}」章节倒置：${subplot.startChapter}～${subplot.endChapter} 章`,
        });
      }
    }
    for (const foreshadow of outline.foreshadowPlan ?? []) {
      checkChapter(`伏笔「${foreshadow.hint}」埋设章节`, foreshadow.setupChapter);
      checkChapter(`伏笔「${foreshadow.hint}」回收章节`, foreshadow.payoffChapter);
      if (foreshadow.setupChapter && foreshadow.payoffChapter
        && foreshadow.setupChapter > foreshadow.payoffChapter) {
        blockers.push({
          kind: 'chapter-reference-out-of-range',
          message: `伏笔「${foreshadow.hint}」先回收后埋设：第${foreshadow.setupChapter}章埋设、第${foreshadow.payoffChapter}章回收`,
        });
      }
    }
    for (const point of outline.coolPointPlan ?? []) {
      checkChapter(`爽点「${point.description || point.type}」兑现章节`, point.suggestedChapter);
    }
    for (const chapter of outline.emotionPlan?.highPoints ?? []) checkChapter('情绪高点', chapter);
    for (const chapter of outline.emotionPlan?.lowPoints ?? []) checkChapter('情绪低点', chapter);
    checkChapter('金手指首次兑现章节', outline.goldenfingerPlan?.firstRevealChapter);
  }

  const canonicalNames = new Set(
    (outline.keyCharacters ?? []).map(character => character.name?.trim()).filter(Boolean),
  );
  const protagonistName = outline.storyEngine?.protagonistName?.trim();
  if (protagonistName
    && !GENERIC_CHARACTER_REFERENCES.has(protagonistName)
    && !canonicalNames.has(protagonistName)) {
    blockers.push({
      kind: 'protagonist-name-mismatch',
      message: `核心驱动中的主角「${protagonistName}」未进入关键角色规划，角色真源不一致`,
    });
  }

  // agent 裁决台账：collective 直接生效；alias 必须指向登记表内姓名才生效
  // （模型把别名映射到笔误名时保持阻断，逼它重裁或补登记）
  const effectiveResolutions = new Set(
    (outline.characterReferenceResolutions ?? [])
      .filter(entry => {
        const reference = entry.reference?.trim();
        if (!reference) return false;
        if (entry.as === 'collective') return true;
        if (entry.as !== 'alias') return false;
        const target = entry.target?.trim();
        return Boolean(target) && canonicalNames.has(target as string);
      })
      .map(entry => entry.reference.trim()),
  );

  const checkCharacterReference = (
    label: string,
    reference: string | undefined,
    chapterNumber?: number,
  ): void => {
    const value = reference?.trim();
    if (!value || GENERIC_CHARACTER_REFERENCES.has(value)) return;
    if ([...canonicalNames].some(name => value.includes(name))) return;
    if (effectiveResolutions.has(value)) return;
    // 字段腐化守卫：关系整句/标点断句不是引用，产生 blocker 只会 fail-closed 且无修复通道
    if (!isPlausibleCharacterName(value)) return;
    blockers.push({
      kind: 'unknown-character-reference',
      chapterNumber,
      message: `${label}引用了未登记角色「${value}」；请裁决：别称/爵位/官职指向已登记角色则 resolve_character_references 记 alias，群体泛称记 collective，确为新人物则补入关键角色规划`,
    });
  };
  for (const volume of outline.volumePlan ?? []) {
    for (const reference of volume.keyCharacters ?? []) {
      checkCharacterReference(`第${volume.volumeIndex}卷关键角色`, reference);
    }
  }
  for (const subplot of outline.subplots ?? []) {
    for (const reference of subplot.relatedCharacters ?? []) {
      checkCharacterReference(`支线「${subplot.title}」关联角色`, reference);
    }
  }
  for (const foreshadow of outline.foreshadowPlan ?? []) {
    checkCharacterReference(`伏笔「${foreshadow.hint}」载体角色`, foreshadow.carrierCharacter);
  }
  for (const character of outline.keyCharacters ?? []) {
    for (const relationship of character.relationshipChanges ?? []) {
      checkCharacterReference(`角色「${character.name}」关系`, relationship.targetName);
    }
  }
  for (const blueprint of outline.chapterBlueprints ?? []) {
    for (const reference of blueprint.involvedCharacters ?? []) {
      checkCharacterReference(`第${blueprint.orderIndex}章出场角色`, reference, blueprint.orderIndex);
    }
  }

  // 未登记地名检测：与角色登记对称的软门禁。地点表（worldBuilding.locations）
  // 是地名真源；卷纲/蓝图引用了表外地名即跨层漂移（真实项目：幕层写「南江市」、
  // 正文写「江城市」）。只在「强行政后缀」文本中提取候选（市/县/省/区/镇/乡/村/港
  // 且 ≥3 字）。后缀集刻意排除 京/城/州/郡/府/都 等弱后缀——它们高频出现在
  // 动词短语里（真实冒烟误报：「陆衡在京」被当成了地名 fail-closed 整份大纲）。
  const registeredLocations = (outline.worldBuilding?.locations ?? [])
    .map(location => location.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (registeredLocations.length >= 3) {
    const ADMINISTRATIVE_LOCATION_RE =
      /[\u4e00-\u9fff·]{2,6}(?:市|县|省|自治区|区|镇|乡|村|港)/gu;
    // 「人名+介词+后缀字」的误切防御：以已登记角色名开头的候选（陆衡在济南市）
    // 不是地名引用
    const characterNameList = (outline.keyCharacters ?? [])
      .map(character => character.name?.trim())
      .filter((name): name is string => Boolean(name && name.length >= 2));
    // 候选前缀剥离：动词/介词短语黏在地名前（「主角在南江市」「前往清河县」），
    // 正则贪婪前缀会整段吞进来。逐词剥离后若剩余仍 ≥2 字+后缀才算地名候选。
    const LOCATION_PREFIX_WORDS = [
      '主角', '前往', '抵达', '回到', '进入', '赶赴', '赶往', '奔向', '位于',
      '在', '到', '去', '向', '从', '于', '与', '和', '及', '至',
    ];
    const stripLocationPrefix = (candidate: string): string => {
      let value = candidate;
      let stripped = true;
      while (stripped) {
        stripped = false;
        for (const word of LOCATION_PREFIX_WORDS) {
          // 剥离后必须仍满足「≥2 字 + 行政后缀」，否则该前缀是地名本体的一部分
          if (value.startsWith(word) && value.length - word.length >= 3) {
            value = value.slice(word.length);
            stripped = true;
            break;
          }
        }
        if (stripped) continue;
        // 句中匹配的动词黏连修复：「慧被带至青河市」「证据链指向南江市」——
        // 介词/连词出现在候选内部而非开头。找候选内最后一个连接词，截断其前
        // 的动词短语。真地名几乎不含这些虚词（「王大志市」类反例远少于黏连）
        for (let i = value.length - 4; i >= 0; i -= 1) {
          const word = LOCATION_PREFIX_WORDS.find(item => value.startsWith(item, i));
          if (word && value.length - i - word.length >= 3) {
            const remainder = value.slice(i + word.length);
            // 截断前的片段以已登记角色名开头（「陆衡在济南市」）说明这是
            // 人名+介词形态，由 characterName 前缀检查负责，不再切
            const precededByCharacterName = characterNameList.some(name =>
              value.slice(0, Math.max(0, i)).includes(name)
            );
            if (!precededByCharacterName) {
              value = remainder;
              stripped = true;
            }
            break;
          }
        }
      }
      return value;
    };
    // 行政后缀后紧跟的组词字符（市级/市局/市政/市公安）：后缀在此是修饰语而非
    // 地名边界，正则吞进来的 2-6 字其实是动词短语。2026-08-25 8题材矩阵实测
    // 「利用市级权限」→「利用市」、「比对市局台账」→「比对市」被补登记进地点表。
    const LOCATION_COMPOUND_FOLLOWERS = new Set(['级', '局', '所', '厅', '队', '域', '政', '公']);
    // 动词短语形态拒绝：候选以双字动词开头或含事件动词宾语结构，是把叙事句
    // 当地点名（2026-08-27 两轮实证：「遭遇商帮罢市」「依赖顾青舟救市」「拼出跨省」
    // 均被登记成 city 级地点污染设定表）。真地名几乎不含这些开场动词。
    const LOCATION_VERB_OPENERS = [
      '遭遇', '依赖', '勾结', '串联', '突袭', '夜袭', '驰援', '营救', '护送',
      '查抄', '起获', '引爆', '埋伏', '穿透', '击溃', '解救', '押送', '运抵',
      // 2026-08-31 反重力 200 章双开冒烟：蓝图句「听雨轩暗通情报，截获黑市粮价」
      // 切出「截获黑市」入表并随 stateDigest 进每一章上下文
      '截获', '登场',
    ];
    // 候选含连词/助词 = 动词短语切片而非地名本体：真地名几乎不含这些虚词，
    // 误拒代价仅是地点不自动入表（黄签级，不 fail-closed）。2026-08-31 实证：
    // 「苏清婉登场并提供黑市粮价情报」被 6 字贪心窗口切成「登场并提供黑市」
    // 入表，该脏实体名随后把判定守卫的点名角色匹配污染到误判整章未履约。
    const LOCATION_FUNCTION_CHAR_RE = /[并并且或的着了过被把]/u;
    const isVerbPhraseLocation = (name: string): boolean => {
      if (LOCATION_VERB_OPENERS.some(word => name.startsWith(word))) return true;
      if (/(?:罢市|救市|跨省)$/u.test(name)) return true;
      if (LOCATION_FUNCTION_CHAR_RE.test(name)) return true;
      return false;
    };
    const extractUnregisteredLocations = (text: string): string[] => {
      const found: string[] = [];
      const pattern = new RegExp(ADMINISTRATIVE_LOCATION_RE.source, 'gu');
      for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        const candidate = stripLocationPrefix(match[0]);
        if (candidate.length < 3) continue;
        // 盲区是叙述概念（视觉盲区/排查盲区），不是可登记地名
        if (candidate.endsWith('盲区')) continue;
        if (characterNameList.some(name => candidate.startsWith(name))) continue;
        if (
          registeredLocations.some(
            location => candidate.includes(location) || location.includes(candidate)
          )
        ) {
          continue;
        }
        // 与已登记地点共享 ≥2 连续字符 = 同一地点的动词黏连变体
        // （「东押解至青河市」vs 已登记「青河大桥北江滩…」、「梳理出老街片区」vs
        // 已登记「光明路派出所及老街片区」）。前缀剥离救不了：黏着的是人名尾字或
        // 动词组，没有可枚举的词表；按字符窗口重叠判定即可覆盖。
        const sharesRunWithRegistered = registeredLocations.some(location => {
          for (let i = 0; i + 2 <= candidate.length; i += 1) {
            if (location.includes(candidate.slice(i, i + 2))) return true;
          }
          return false;
        });
        if (sharesRunWithRegistered) continue;
        if (LOCATION_COMPOUND_FOLLOWERS.has(text[pattern.lastIndex] ?? '')) continue;
        if (isVerbPhraseLocation(candidate)) continue;
        if (!found.includes(candidate)) found.push(candidate);
      }
      return found;
    };
    for (const volume of outline.volumePlan ?? []) {
      const volumeText = [volume.objective, volume.coreConflict, volume.climax].join('；');
      for (const location of extractUnregisteredLocations(volumeText)) {
        locationWarnings.push({
          kind: 'unknown-location-reference',
          message: `第${volume.volumeIndex}卷卷纲引用了未登记地点「${location}」；建议补入世界与势力规划或改用已登记地点`,
        });
      }
    }
    for (const blueprint of outline.chapterBlueprints ?? []) {
      const blueprintTextValue = blueprintText(blueprint);
      for (const location of extractUnregisteredLocations(blueprintTextValue)) {
        locationWarnings.push({
          kind: 'unknown-location-reference',
          chapterNumber: blueprint.orderIndex,
          message: `第${blueprint.orderIndex}章蓝图引用了未登记地点「${location}」；建议补入世界与势力规划或改用已登记地点`,
        });
      }
    }
  }

  return { blockers, locationWarnings };
}

function inspectChronologyRegressions(outline: ExecutableOutline): OutlineCompletenessBlocker[] {
  const blockers: OutlineCompletenessBlocker[] = [];
  const sorted = [...(outline.chapterBlueprints ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const terminalChapterByCharacter = new Map<string, number>();
  const names = outline.keyCharacters
    .map(character => character.name?.trim())
    .filter((name): name is string => Boolean(name && name.length >= 2));
  let closedDeadlineChapter: number | null = null;

  for (const blueprint of sorted) {
    const text = blueprintText(blueprint);
    const events = blueprintEvents(blueprint);
    if (
      closedDeadlineChapter !== null &&
      /三日(?:期限|之期).{0,8}(?:第一日|已至|已到|开始)/u.test(text)
    ) {
      blockers.push({
        kind: 'chronology-regression',
        chapterNumber: blueprint.orderIndex,
        message: `第${blueprint.orderIndex}章重启了第${closedDeadlineChapter}章已结束的“三日之期”`,
      });
      closedDeadlineChapter = null;
    }
    if (/三日(?:期限|之期).{0,8}(?:终局|结束|已结|届满)/u.test(text)) {
      closedDeadlineChapter = blueprint.orderIndex;
    }

    for (const name of names) {
      const escapedName = escapeRegExp(name);
      const released = new RegExp(`${escapedName}.{0,10}(?:越狱|逃脱|获释|释放|复职|官复原职|被劫走)`, 'u');
      const activeAfterTerminal = new RegExp(
        `${escapedName}(?:本人)?(?:当即|随即|立刻|连夜|再次|重新|亲自|暗中|当堂|仍|仍然|又)?(?:带着|率领|下令|派人|指挥|堵在|包围|审讯|缉拿|主持|召集)`,
        'u'
      );
      const terminal = new RegExp(
        `${escapedName}(?:本人)?(?:当场|当堂|随后|最终|已经|已|也|却|旋即|随即|立即|仍|仍然|又|因[^，,。；;]{1,6}){0,2}(?:被(?:当场)?(?:拿下|收押|押解|革职|处死|斩杀)|入狱|伏法|身亡)`,
        'u'
      );
      const terminalChapter = terminalChapterByCharacter.get(name);
      const releasedInChapter = events.some(event => released.test(event));
      const activeInChapter = events.some(
        event => !terminal.test(event) && activeAfterTerminal.test(event)
      );
      const terminalInChapter = events.some(event => terminal.test(event));
      if (terminalChapter !== undefined && releasedInChapter) {
        terminalChapterByCharacter.delete(name);
      } else if (terminalChapter !== undefined && activeInChapter) {
        blockers.push({
          kind: 'chronology-regression',
          chapterNumber: blueprint.orderIndex,
          message: `第${blueprint.orderIndex}章让第${terminalChapter}章已失去行动自由/官职的“${name}”无解释恢复权力行为`,
        });
      }
      if (terminalInChapter) {
        terminalChapterByCharacter.set(name, blueprint.orderIndex);
      }
    }
  }

  return blockers;
}

/**
 * 跨章开场复述检测：相邻章 CBN 高度相似或互为子串 = 本章开局复读上章结尾
 * （章界重演，绝症书审实测形态：第4→5、7→8章边界处方剧情重演）。
 * 履约校验会把复述型 CBN 当硬约束强制覆盖 → 正文整段重演。
 * 检测放大纲侧（blocker），滚动批次另有 findBlueprintRepetition 同口径检查。
 */
/** 归一化（去标点/空白，保留数字）编辑距离；详见 text-similarity */
function blueprintEditDistance(a: string, b: string): number {
  const normalize = (text: string): string =>
    (text ?? '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  const na = normalize(a);
  const nb = normalize(b);
  const matrix: number[][] = [];
  for (let i = 0; i <= nb.length; i += 1) matrix[i] = [i];
  for (let j = 0; j <= na.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= nb.length; i += 1) {
    for (let j = 1; j <= na.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j - 1] + (nb.charAt(i - 1) === na.charAt(j - 1) ? 0 : 1),
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
      );
    }
  }
  return matrix[nb.length][na.length];
}

function inspectBlueprintOpeningRepetition(
  outline: ExecutableOutline,
): OutlineCompletenessBlocker[] {
  const blockers: OutlineCompletenessBlocker[] = [];
  const sorted = [...(outline.chapterBlueprints ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = (sorted[i - 1].CBN ?? '').trim();
    const curr = (sorted[i].CBN ?? '').trim();
    if (!prev || !curr) continue;
    // 子串包含 = 明确复述；相似度路径要求归一化编辑距离 ≥3（更细粒度的
    // normalizedSimilarityKeepingNumbers 无法表达阈值）：仅差一个序号/人名的
    // 模板句（「核对第3笔账目」vs「核对第4笔账目」）是合法的相邻推进，不算重演。
    if (!curr.includes(prev) && !prev.includes(curr)) {
      const distance = blueprintEditDistance(prev, curr);
      if (distance < 3) continue;
      if (normalizedSimilarityKeepingNumbers(prev, curr) < 0.85) continue;
    }
    blockers.push({
      kind: 'chapter-opening-repetition',
      chapterNumber: sorted[i].orderIndex,
      message:
        `第${sorted[i].orderIndex}章 CBN「${curr.slice(0, 30)}」与第${sorted[i - 1].orderIndex}章 ` +
        `CBN「${prev.slice(0, 30)}」高度相似或为跨章复述；本章开篇必须推进到新事件而非重演上章结尾`,
    });
  }
  return blockers;
}

/**
 * 只检查“能否安全应用”的硬条件；内容质量问题仍由 outline-reviewer 负责。
 */
export function inspectOutlineCompleteness(
  outline: ExecutableOutline,
): OutlineCompletenessReport {
  const blockers: OutlineCompletenessBlocker[] = [];
  const blueprints = outline.chapterBlueprints ?? [];
  const seenOrders = new Set<number>();

  if (!(outline.startupPack30?.openingHook ?? '').trim()) {
    blockers.push({
      kind: 'opening-hook',
      message: `前${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}章启动包缺少开篇钩子，不能用于生产续写`,
    });
  }

  if (blueprints.length !== OUTLINE_COMPLETENESS_POLICY.startupChapterCount) {
    blockers.push({
      kind: 'chapter-count',
      message:
        `单章蓝图数量为 ${blueprints.length}，` +
        `必须完整生成 ${OUTLINE_COMPLETENESS_POLICY.startupChapterCount} 章后才能应用`,
    });
  }

  if (outline.keyCharacters.length < OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters) {
    blockers.push({
      kind: 'character-count',
      message:
        `关键角色仅 ${outline.keyCharacters.length} 个，` +
        `至少需要 ${OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters} 个`,
    });
  }

  if (outline.foreshadowPlan.length < OUTLINE_COMPLETENESS_POLICY.minimumForeshadows) {
    blockers.push({
      kind: 'foreshadow-count',
      message:
        `伏笔仅 ${outline.foreshadowPlan.length} 条，` +
        `至少需要 ${OUTLINE_COMPLETENESS_POLICY.minimumForeshadows} 条`,
    });
  }

  for (const blueprint of blueprints) {
    const chapterNumber = blueprint.orderIndex;
    if (
      !Number.isInteger(chapterNumber) ||
      chapterNumber < 1 ||
      chapterNumber > OUTLINE_COMPLETENESS_POLICY.startupChapterCount ||
      seenOrders.has(chapterNumber)
    ) {
      blockers.push({
        kind: 'invalid-chapter-order',
        chapterNumber,
        message: `单章蓝图章号 ${chapterNumber} 非 1～${OUTLINE_COMPLETENESS_POLICY.startupChapterCount} 的唯一连续整数`,
      });
    }
    seenOrders.add(chapterNumber);
    if (isPlaceholderTitle(blueprint.title)) {
      blockers.push({
        kind: 'placeholder-title',
        chapterNumber,
        message: `第${chapterNumber}章仍是占位标题，必须生成可辨识的情节标题`,
      });
    }

    const titleLength = blueprint.title.trim().length;
    if (
      titleLength < OUTLINE_COMPLETENESS_POLICY.titleMinChars ||
      titleLength > OUTLINE_COMPLETENESS_POLICY.titleMaxChars
    ) {
      blockers.push({
        kind: 'invalid-title-length',
        chapterNumber,
        message: `第${chapterNumber}章标题长度 ${titleLength} 字，必须为 ${OUTLINE_COMPLETENESS_POLICY.titleMinChars}～${OUTLINE_COMPLETENESS_POLICY.titleMaxChars} 字`,
      });
    }

    for (const [label, hook] of [['CBN', blueprint.CBN], ['CEN', blueprint.CEN]] as const) {
      const length = hook.trim().length;
      if (
        length < OUTLINE_COMPLETENESS_POLICY.hookMinChars ||
        length > OUTLINE_COMPLETENESS_POLICY.hookMaxChars
      ) {
        blockers.push({
          kind: 'invalid-hook-length',
          chapterNumber,
          message: `第${chapterNumber}章 ${label} 长度 ${length} 字，必须为 ${OUTLINE_COMPLETENESS_POLICY.hookMinChars}～${OUTLINE_COMPLETENESS_POLICY.hookMaxChars} 字`,
        });
      }
    }

    if (
      blueprint.CPNs.length < OUTLINE_COMPLETENESS_POLICY.minimumCpns ||
      blueprint.CPNs.length > OUTLINE_COMPLETENESS_POLICY.maximumCpns
    ) {
      blockers.push({
        kind: 'invalid-cpn-count',
        chapterNumber,
        message: `第${chapterNumber}章 CPN 数量为 ${blueprint.CPNs.length}，必须为 ${OUTLINE_COMPLETENESS_POLICY.minimumCpns}～${OUTLINE_COMPLETENESS_POLICY.maximumCpns} 个`,
      });
    }

    if (
      !blueprint.CBN.trim() ||
      blueprint.CPNs.length === 0 ||
      !blueprint.CEN.trim() ||
      blueprint.mustCover.length === 0
    ) {
      blockers.push({
        kind: 'incomplete-blueprint',
        chapterNumber,
        message: `第${chapterNumber}章缺少 CBN、CPNs、CEN 或 mustCover，不能用于续写`,
      });
    }
  }

  for (let chapterNumber = 1; chapterNumber <= OUTLINE_COMPLETENESS_POLICY.startupChapterCount; chapterNumber += 1) {
    if (!seenOrders.has(chapterNumber)) {
      blockers.push({
        kind: 'invalid-chapter-order',
        chapterNumber,
        message: `单章蓝图缺少第${chapterNumber}章`,
      });
    }
  }

  blockers.push(...inspectChronologyRegressions(outline));
  blockers.push(...inspectBlueprintOpeningRepetition(outline));
  const semantic = inspectSemanticConsistency(outline);
  blockers.push(...semantic.blockers);

  // 生成截断残句（g38f reg20 初版第 40+ 章实测：CBN「…沈淮安手中。」通过长度闸落库）
  for (const blueprint of blueprints) {
    for (const [label, text] of [['CBN', blueprint.CBN], ['CEN', blueprint.CEN]] as const) {
      if (isTruncatedClause(text)) {
        blockers.push({
          kind: 'truncated-hook-clause',
          chapterNumber: blueprint.orderIndex,
          message: `第${blueprint.orderIndex}章 ${label}「…${text.slice(-12)}」句末悬垂，疑似生成截断残句`,
        });
      }
    }
  }

  // 短书末章收束声明：全书规划章数落在初版 50 章蓝图射程内时，末章必须带收束信号
  // （200 章书的末章由滚纲终卷批次负责，outline-roller 的 finale 校验覆盖）
  const plannedTotal = Number(outline.storyScale?.estimatedChapterCount ?? NaN);
  if (
    Number.isFinite(plannedTotal) &&
    plannedTotal >= 1 &&
    plannedTotal <= blueprints.length
  ) {
    const finale = blueprints.find(bp => bp.orderIndex === plannedTotal);
    if (
      finale &&
      !hasFinaleClosureSignal(
        [finale.CEN, ...finale.mustCover, finale.hookText ?? ''].join('\n'),
      )
    ) {
      blockers.push({
        kind: 'finale-not-closing',
        chapterNumber: finale.orderIndex,
        message: `第${finale.orderIndex}章是全书末章（规划 ${plannedTotal} 章），CEN/mustCover 缺少收束声明（尘埃落定/终局/归处/新秩序等），禁止以新危机钩子完本`,
      });
    }
  }

  // 爽点规划 ↔ 蓝图时序错位（g38f r3 主轮+reg 双书实测：爽点规划第 48 章「御前逼死
  // 崔元敬」而蓝图第 19-20 章已写完其触柱身亡与主角受封——错位近 30 章，读者审标
  // 记核心爽点脱钩）。词面对齐是格式级信号，语义复核归 outline-reviewer，故只出黄签
  const coolPointWarnings = inspectCoolPointTimelineAlignment(outline);
  const cardWarnings = inspectCharacterCardAndLocationPlausibility(outline);
  const titleGrantWarnings = inspectDuplicateTitleGrants(outline);

  return {
    canApply: blockers.length === 0,
    blockers,
    warnings: [
      ...(semantic.locationWarnings ?? []),
      ...coolPointWarnings,
      ...cardWarnings,
      ...titleGrantWarnings,
    ],
  };
}

/** 授予/到任动词族（格式级信号；单字「授」可匹配授印/授意，靠「角色名+官职尾缀」共现收窄） */
const TITLE_GRANT_VERB_RE =
  /(特晋|擢升|简授|补授|授予|授为|授|封为|任命为|升任|拜|到任|接任|接印|受领|上任|走马上任)/u;
/** 官职尾缀（命中后向左看 6 字取紧邻品级，拼成比对键：升品改授是合法新官，
 * 同品同职重复授才是冲突） */
const OFFICE_SUFFIX_RE =
  /(主事|尚书|侍郎|郎中|御史|大学士|监正|验工使|巡按|总督|都指挥使|通政使|修撰|侍读|指挥使|统领|府尹|知府|知县|首辅|次辅|主簿|典吏|佥事|寺卿|少卿|员外郎|给事中)/gu;
const ADJACENT_RANK_RE = /((?:正|从)[一二三四五六七八九]品)$/u;

function extractGrantedTitles(item: string): string[] {
  const titles = new Set<string>();
  for (const match of item.matchAll(OFFICE_SUFFIX_RE)) {
    const before = item.slice(Math.max(0, (match.index ?? 0) - 6), match.index);
    const rank = before.match(ADJACENT_RANK_RE);
    titles.add(`${rank?.[1] ?? ''}${match[1]}`);
  }
  return [...titles];
}

/**
 * 重复授官双端自冲突（2026-09-30 r16 S1-04 实证，黄签）：ch34 大纲节点「沈淮受领
 * 工部都水司正六品主事官印」、ch49 又「特晋沈淮为工部都水司正六品主事」——两端
 * 各自编码两次授予，正文照写即「已任 15 章的官再授一遍+称谓倒退典吏」。大纲两端
 * 由不同生成轮产出互不知情，靠本扫描对齐。词面信号出黄签，改写归 outline 修复轮
 * （后端应改为继任他职/职权变化节点，或删除后一次授予）。
 */
function inspectDuplicateTitleGrants(outline: ExecutableOutline): OutlineCompletenessBlocker[] {
  const names = (outline.keyCharacters ?? [])
    .map(character =>
      typeof character === 'string' ? character : String(character?.name ?? '')
    )
    .map(name => name.trim())
    .filter(name => name.length >= 2);
  const firstGrantChapter = new Map<string, number>();
  const warnings: OutlineCompletenessBlocker[] = [];
  const sorted = [...(outline.chapterBlueprints ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  for (const blueprint of sorted) {
    const grantedThisChapter = new Set<string>();
    for (const item of blueprintEvents(blueprint)) {
      if (!TITLE_GRANT_VERB_RE.test(item)) continue;
      const hitNames = names.filter(name => item.includes(name));
      if (hitNames.length === 0) continue;
      const titles = extractGrantedTitles(item);
      if (titles.length === 0) continue;
      for (const name of hitNames) {
        for (const title of titles) {
          const key = `${name}|${title}`;
          if (grantedThisChapter.has(key)) continue;
          grantedThisChapter.add(key);
          const previous = firstGrantChapter.get(key);
          if (previous !== undefined) {
            warnings.push({
              kind: 'duplicate-title-grant',
              chapterNumber: blueprint.orderIndex,
              message: `「${name}」的${title}已在第${previous}章授予，第${blueprint.orderIndex}章再次授予（大纲双端自冲突：重复授官/称谓倒退，r16 S1-04 形态）——后端节点应改写为职权变化/继任他职或删除重复授予`,
            });
          } else {
            firstGrantChapter.set(key, blueprint.orderIndex);
          }
        }
      }
    }
  }
  return warnings;
}

/**
 * 角色卡/地名设定的格式级合理性（2026-09-12 g38f 双书实测，黄签观察项）：
 * - relationshipChanges 条目字段残缺/描述截断（reg 实证：数组第二项元素截断错位）；
 * - worldBuilding.locations 把政策动作误填为地名（r3 主轮实证：「预售粮票平抑市」
 *   level=city 入表）。语义错标（政治同盟写成 lover）归读者评估/AI 书审，不本地判。
 */
function inspectCharacterCardAndLocationPlausibility(
  outline: ExecutableOutline,
): OutlineCompletenessBlocker[] {
  const warnings: OutlineCompletenessBlocker[] = [];
  for (const character of outline.keyCharacters ?? []) {
    for (const relation of character.relationshipChanges ?? []) {
      const dynamic = String(relation?.dynamic ?? '');
      if (!String(relation?.targetName ?? '').trim() || !dynamic.trim() || isTruncatedClause(dynamic)) {
        warnings.push({
          kind: 'unknown-character-reference',
          message: `角色卡「${character.name}」的 relationshipChanges 存在字段残缺/描述截断条目（target：${String(relation?.targetName ?? '（空）')}），需补全为完整关系卡`,
        });
        break;
      }
    }
  }
  const POLICY_ACTION_IN_NAME_RE = /[平抑预售推行颁行改革罢免查抄调升封驳兑付]/u;
  for (const location of outline.worldBuilding?.locations ?? []) {
    const name = String(location?.name ?? '').trim();
    if (name.length >= 2 && POLICY_ACTION_IN_NAME_RE.test(name)) {
      warnings.push({
        kind: 'unknown-location-reference',
        message: `地点表「${name}」疑似政策动作误填为地名，地点名应为空间场所而非行政措施`,
      });
    }
  }
  return warnings;
}

/** 爽点描述的 CJK 二字组词面：与蓝图文本对齐统计 */
function cjkBigrams(text: string): Set<string> {
  const cjk = (text ?? '').replace(/[^\u4e00-\u9fff]+/gu, '');
  const grams = new Set<string>();
  for (let i = 0; i + 1 < cjk.length; i += 1) grams.add(cjk.slice(i, i + 2));
  return grams;
}

function inspectCoolPointTimelineAlignment(
  outline: ExecutableOutline,
): OutlineCompletenessBlocker[] {
  const blueprints = outline.chapterBlueprints ?? [];
  if (blueprints.length === 0) return [];
  const bpTextByChapter = new Map<number, string>();
  for (const bp of blueprints) {
    bpTextByChapter.set(bp.orderIndex, blueprintText(bp));
  }
  const warnings: OutlineCompletenessBlocker[] = [];
  for (const beat of outline.coolPointPlan ?? []) {
    const suggested = Number(beat.suggestedChapter ?? NaN);
    if (!Number.isFinite(suggested) || suggested < 1) continue;
    const desc = `${beat.description ?? ''}${beat.payoff ?? ''}`;
    const descGrams = cjkBigrams(desc);
    if (descGrams.size < 6) continue;
    let earliestHit: number | null = null;
    for (const bp of blueprints) {
      if (bp.orderIndex >= suggested) break;
      const bpGrams = cjkBigrams(bpTextByChapter.get(bp.orderIndex) ?? '');
      let hits = 0;
      for (const gram of descGrams) if (bpGrams.has(gram)) hits += 1;
      if (hits >= 4 && hits / descGrams.size >= 0.34) {
        earliestHit = bp.orderIndex;
        break;
      }
    }
    // 错位 ≥15 章（reg 实证 28 章档）才报：小偏移是正常滚纲弹性
    if (earliestHit !== null && suggested - earliestHit >= 15) {
      warnings.push({
        kind: 'inconsistent-story-scale',
        message:
          `爽点规划第 ${suggested} 章「${(beat.description ?? '').slice(0, 24)}」的词面已在第 ${earliestHit} 章蓝图中兑现，` +
          `时序错位 ${suggested - earliestHit} 章——要么把爽点规划的章号对齐到实际节奏，要么蓝图改为铺垫不兑现`,
      });
    }
  }
  return warnings;
}
