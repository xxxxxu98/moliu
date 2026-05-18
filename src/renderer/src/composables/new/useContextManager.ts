/**
 * 上下文管理器
 * 基于 webnovel-writer-master 的上下文注入系统
 * 
 * 上下文管理器负责：
 * - 管理不同写作阶段的上下文
 * - 优化上下文注入策略
 * - 控制上下文长度和结构
 */

import { ref, computed, shallowRef } from 'vue';
import type { UseContractManagerReturn } from './useContractManager';

// ============================================================
// 类型定义
// ============================================================

export type ContextPhase = 
  | 'chapter_start'      // 章节开始
  | 'chapter_body'       // 章节主体
  | 'chapter_end'        // 章节结尾
  | 'transition';        // 过渡段落

export interface ContextConfig {
  // 最大上下文长度（token）
  maxLength: number;
  // 是否启用压缩
  enableCompression: boolean;
  // 压缩阈值
  compressionThreshold: number;
  // 是否启用智能截断
  enableSmartTruncation: boolean;
}

export interface WritingContext {
  // 项目元信息
  projectMeta: {
    title: string;
    genre: string;
    currentChapter: number;
    totalChapters: number;
  };
  
  // 核心设定摘要
  coreSetting: string;
  
  // 合同摘要
  contractSummary: string;
  
  // 前章摘要
  previousChapterSummary?: string;
  
  // 角色状态
  characterStates: CharacterStateSummary[];
  
  // 活跃伏笔
  activeForeshadows: ForeshadowSummary[];
  
  // 当前章节合同
  currentContract?: string;
  
  // 记忆摘要
  memorySummary?: string;
  
  // 阶段特定上下文
  phaseContext?: {
    [key in ContextPhase]?: string;
  };
}

export interface CharacterStateSummary {
  name: string;
  role: string;
  status: string;
  location: string;
  goal?: string;
}

export interface ForeshadowSummary {
  id: string;
  hint: string;
  status: 'buried' | 'developed' | 'revealed';
  buriedChapter: number;
}

export interface ContextSegment {
  id: string;
  type: 'meta' | 'contract' | 'summary' | 'character' | 'foreshadow' | 'memory' | 'custom';
  content: string;
  priority: number;
  estimatedTokens: number;
  phase?: ContextPhase;
}

// ============================================================
// Composable 定义
// ============================================================

export function useContextManager(options: {
  projectId: string;
  contractManager: UseContractManagerReturn;
}) {
  const { projectId, contractManager } = options;

  // 配置
  const config = ref<ContextConfig>({
    maxLength: 8000,
    enableCompression: true,
    compressionThreshold: 0.8,
    enableSmartTruncation: true,
  });

  // 状态
  const currentContext = shallowRef<WritingContext | null>(null);
  const contextSegments = shallowRef<ContextSegment[]>([]);
  const isInitialized = ref(false);
  const lastUpdateTime = ref<string | null>(null);

  // 计算属性
  const totalTokens = computed(() => {
    return contextSegments.value.reduce((sum, seg) => sum + seg.estimatedTokens, 0);
  });

  const isContextTooLong = computed(() => {
    return totalTokens.value > config.value.maxLength;
  });

  const contextByPhase = computed(() => {
    const result: Record<ContextPhase, ContextSegment[]> = {
      chapter_start: [],
      chapter_body: [],
      chapter_end: [],
      transition: [],
    };

    for (const segment of contextSegments.value) {
      if (segment.phase && result[segment.phase]) {
        result[segment.phase].push(segment);
      } else {
        // 默认添加到所有阶段
        Object.values(result).forEach(arr => arr.push(segment));
      }
    }

    return result;
  });

  // ============================================================
  // 初始化
  // ============================================================

  /**
   * 初始化上下文
   */
  function initialize(): void {
    if (!contractManager.masterContract.value) return;

    currentContext.value = buildContext();
    contextSegments.value = buildSegments();
    isInitialized.value = true;
    lastUpdateTime.value = new Date().toISOString();
  }

  /**
   * 构建上下文对象
   */
  function buildContext(): WritingContext {
    const master = contractManager.masterContract.value!;
    
    return {
      projectMeta: {
        title: master.meta.title,
        genre: master.genreProfile.name,
        currentChapter: 1,
        totalChapters: master.meta.chapterCount,
      },
      coreSetting: buildCoreSettingSummary(),
      contractSummary: contractManager.getContractSummary(),
      characterStates: buildCharacterStates(),
      activeForeshadows: buildForeshadowSummary(),
      currentContract: undefined,
      memorySummary: undefined,
      phaseContext: {
        chapter_start: buildChapterStartContext(),
        chapter_body: buildChapterBodyContext(),
        chapter_end: buildChapterEndContext(),
      },
    };
  }

  /**
   * 构建核心设定摘要
   */
  function buildCoreSettingSummary(): string {
    const master = contractManager.masterContract.value;
    if (!master) return '';

    const setting = master.coreSetting;
    const lines: string[] = [];

    lines.push(`【世界】${setting.worldType}`);
    lines.push(`【力量体系】${setting.powerSystem}`);
    
    if (setting.goldenFinger.name) {
      lines.push(`【金手指】${setting.goldenFinger.name}（${setting.goldenFinger.style}风格）`);
      lines.push(`  - 展现方式：${setting.goldenFinger.visibility}`);
      if (setting.goldenFinger.cost) {
        lines.push(`  - 代价：${setting.goldenFinger.cost}`);
      }
    }

    // 叙事线摘要
    if (master.strands.quest.mainConflict) {
      lines.push(`【主线】${master.strands.quest.mainConflict}`);
    }

    return lines.join('\n');
  }

  /**
   * 构建角色状态摘要
   */
  function buildCharacterStates(): CharacterStateSummary[] {
    const characters = contractManager.activeCharacters.value;
    
    return characters.map(char => ({
      name: char.name,
      role: char.role,
      status: `处于第${char.growth.currentStage}阶段`,
      location: '', // 动态获取
      goal: '', // 动态获取
    }));
  }

  /**
   * 构建伏笔摘要
   */
  function buildForeshadowSummary(): ForeshadowSummary[] {
    return contractManager.activeForeshadows.value.map(f => ({
      id: f.id,
      hint: f.hint,
      status: f.status,
      buriedChapter: f.buriedChapter,
    }));
  }

  // ============================================================
  // 上下文构建
  // ============================================================

  /**
   * 构建上下文片段
   */
  function buildSegments(): ContextSegment[] {
    const segments: ContextSegment[] = [];

    // 元信息片段
    segments.push({
      id: 'meta-project',
      type: 'meta',
      content: buildProjectMeta(),
      priority: 100,
      estimatedTokens: estimateTokens(buildProjectMeta()),
    });

    // 合同摘要片段
    segments.push({
      id: 'contract-summary',
      type: 'contract',
      content: contractManager.getContractSummary(),
      priority: 90,
      estimatedTokens: estimateTokens(contractManager.getContractSummary()),
    });

    // 核心设定片段
    segments.push({
      id: 'core-setting',
      type: 'summary',
      content: buildCoreSettingSummary(),
      priority: 80,
      estimatedTokens: estimateTokens(buildCoreSettingSummary()),
    });

    // 角色状态片段
    segments.push({
      id: 'character-states',
      type: 'character',
      content: buildCharactersContext(),
      priority: 70,
      estimatedTokens: estimateTokens(buildCharactersContext()),
    });

    // 伏笔片段
    const foreshadows = contractManager.activeForeshadows.value;
    if (foreshadows.length > 0) {
      segments.push({
        id: 'active-foreshadows',
        type: 'foreshadow',
        content: buildForeshadowContext(),
        priority: 60,
        estimatedTokens: estimateTokens(buildForeshadowContext()),
      });
    }

    return segments;
  }

  /**
   * 构建项目元信息
   */
  function buildProjectMeta(): string {
    const master = contractManager.masterContract.value;
    if (!master) return '';

    return `【项目】${master.meta.title}
【题材】${master.genreProfile.name}
【目标】${master.meta.chapterCount}章 / ${(master.meta.targetWordCount / 10000).toFixed(0)}万字`;
  }

  /**
   * 构建角色上下文
   */
  function buildCharactersContext(): string {
    const characters = contractManager.activeCharacters.value;
    if (characters.length === 0) return '';

    const lines: string[] = ['【主要角色】'];
    
    for (const char of characters) {
      lines.push(`- ${char.name}（${char.role}）`);
      if (char.description) {
        lines.push(`  描述：${char.description.slice(0, 100)}`);
      }
      if (char.personality.length > 0) {
        lines.push(`  性格：${char.personality.join('、')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 构建伏笔上下文
   */
  function buildForeshadowContext(): string {
    const foreshadows = contractManager.activeForeshadows.value;
    if (foreshadows.length === 0) return '';

    const lines: string[] = ['【活跃伏笔】'];
    
    for (const f of foreshadows.slice(0, 5)) {
      lines.push(`- ${f.hint}（埋于第${f.buriedChapter}章）`);
    }

    return lines.join('\n');
  }

  // ============================================================
  // 阶段上下文
  // ============================================================

  /**
   * 构建章节开始上下文
   */
  function buildChapterStartContext(): string {
    const lines: string[] = [];

    lines.push('【章节开始】');
    lines.push('- 承接上文，自然过渡');
    lines.push('- 明确当前处境');
    lines.push('- 埋下本章钩子');

    return lines.join('\n');
  }

  /**
   * 构建章节主体上下文
   */
  function buildChapterBodyContext(): string {
    const lines: string[] = [];

    lines.push('【章节主体】');
    lines.push('- 围绕核心冲突展开');
    lines.push('- 推进主线/感情线');
    lines.push('- 适时插入爽点');
    lines.push('- 保持节奏紧凑');

    return lines.join('\n');
  }

  /**
   * 构建章节结尾上下文
   */
  function buildChapterEndContext(): string {
    const lines: string[] = [];

    lines.push('【章节结尾】');
    lines.push('- 解决本章主要冲突');
    lines.push('- 留下悬念/钩子');
    lines.push('- 引发读者期待');

    return lines.join('\n');
  }

  // ============================================================
  // 上下文优化
  // ============================================================

  /**
   * 优化上下文（压缩/截断）
   */
  function optimizeContext(): void {
    if (!isContextTooLong.value) return;

    // 按优先级排序
    const sorted = [...contextSegments.value].sort((a, b) => b.priority - a.priority);

    // 逐步压缩直到满足长度要求
    const optimized: ContextSegment[] = [];
    let currentLength = 0;

    for (const segment of sorted) {
      if (currentLength + segment.estimatedTokens <= config.value.maxLength) {
        optimized.push(segment);
        currentLength += segment.estimatedTokens;
      } else if (config.value.enableCompression) {
        // 尝试压缩
        const compressed = compressSegment(segment);
        if (currentLength + compressed.estimatedTokens <= config.value.maxLength) {
          optimized.push(compressed);
          currentLength += compressed.estimatedTokens;
        }
      }
    }

    contextSegments.value = optimized;
  }

  /**
   * 压缩上下文片段
   */
  function compressSegment(segment: ContextSegment): ContextSegment {
    const lines = segment.content.split('\n');
    const compressed = lines.slice(0, Math.ceil(lines.length * 0.5));
    
    return {
      ...segment,
      content: compressed.join('\n') + '\n...（已压缩）',
      estimatedTokens: estimateTokens(compressed.join('\n')),
    };
  }

  /**
   * 估算 token 数量（粗略估计：1 token ≈ 2 字符）
   */
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 2);
  }

  // ============================================================
  // 章节上下文
  // ============================================================

  /**
   * 获取章节上下文
   */
  function getChapterContext(chapterNumber: number): string {
    const segments = contextSegments.value;
    
    // 按优先级和阶段过滤
    const filtered = segments.filter(seg => {
      if (!seg.phase) return true;
      return seg.phase === 'chapter_start' || seg.phase === 'chapter_body';
    });

    return filtered.map(seg => seg.content).join('\n\n');
  }

  /**
   * 获取章节开始上下文
   */
  function getChapterStartContext(chapterNumber: number): string {
    const master = contractManager.masterContract.value;
    if (!master) return '';

    const chapter = contractManager.getChapterByNumber(chapterNumber);
    const previousChapter = chapterNumber > 1 
      ? contractManager.getChapterByNumber(chapterNumber - 1)
      : null;

    const lines: string[] = [];

    // 项目信息
    lines.push(`【项目】${master.meta.title}`);
    lines.push(`【题材】${master.genreProfile.name}`);
    lines.push('');

    // 章节信息
    lines.push(`【当前章节】第${chapterNumber}章`);
    if (chapter) {
      lines.push(`【章节标题】${chapter.meta.title}`);
    }
    lines.push('');

    // 前章摘要
    if (previousChapter) {
      lines.push('【前章回顾】');
      if (previousChapter.cen.resolution) {
        lines.push(previousChapter.cen.resolution);
      }
      lines.push('');
    }

    // 当前章节合同
    if (chapter) {
      lines.push('【本章合同】');
      if (chapter.cbn.situation) {
        lines.push(`起始：${chapter.cbn.situation}`);
      }
      if (chapter.cbn.characterStatus) {
        lines.push(`状态：${chapter.cbn.characterStatus}`);
      }
      lines.push('');
    }

    // 阶段指引
    lines.push('【写作要求】');
    lines.push('- 承接上文，自然过渡');
    lines.push('- 明确当前处境');
    lines.push('- 推进剧情发展');

    return lines.join('\n');
  }

  /**
   * 获取章节结尾上下文
   */
  function getChapterEndContext(chapterNumber: number): string {
    const master = contractManager.masterContract.value;
    if (!master) return '';

    const chapter = contractManager.getChapterByNumber(chapterNumber);
    const nextChapter = contractManager.getChapterByNumber(chapterNumber + 1);

    const lines: string[] = [];

    // 章节信息
    lines.push(`【当前章节】第${chapterNumber}章`);
    lines.push('');

    // 本章任务
    if (chapter) {
      lines.push('【本章任务】');
      if (chapter.cen.resolution) {
        lines.push(`- 解决：${chapter.cen.resolution}`);
      }
      if (chapter.cen.foreshadowReveal) {
        lines.push(`- 揭示伏笔：${chapter.cen.foreshadowReveal}`);
      }
      if (chapter.cen.cliffhanger) {
        lines.push(`- 悬念：${chapter.cen.cliffhanger.description}`);
      }
      lines.push('');
    }

    // 下章预告
    if (nextChapter) {
      lines.push('【下章预告】');
      if (nextChapter.cbn.situation) {
        lines.push(nextChapter.cbn.situation);
      }
      lines.push('');
    }

    // 阶段指引
    lines.push('【写作要求】');
    lines.push('- 解决本章主要冲突');
    lines.push('- 留下悬念/钩子');
    lines.push('- 引发读者期待下一章');

    return lines.join('\n');
  }

  // ============================================================
  // 更新上下文
  // ============================================================

  /**
   * 更新上下文
   */
  function updateContext(): void {
    if (!isInitialized.value) {
      initialize();
      return;
    }

    currentContext.value = buildContext();
    contextSegments.value = buildSegments();
    lastUpdateTime.value = new Date().toISOString();

    // 检查是否需要优化
    if (config.value.enableCompression && isContextTooLong.value) {
      optimizeContext();
    }
  }

  /**
   * 更新章节进度
   */
  function updateChapterProgress(chapterNumber: number): void {
    if (currentContext.value) {
      currentContext.value.projectMeta.currentChapter = chapterNumber;
      lastUpdateTime.value = new Date().toISOString();
    }
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<ContextConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,

    // 状态
    currentContext,
    contextSegments,
    isInitialized,
    lastUpdateTime,

    // 计算属性
    totalTokens,
    isContextTooLong,
    contextByPhase,

    // 初始化
    initialize,
    updateContext,
    updateChapterProgress,

    // 获取上下文
    getChapterContext,
    getChapterStartContext,
    getChapterEndContext,

    // 优化
    optimizeContext,
  };
}

// ============================================================
// 类型导出（必须在函数定义之后）
// ============================================================

export type UseContractManagerReturn = ReturnType<typeof useContractManager>;

/**
 * 导出契约管理器需要的方法类型
 */
export interface ContractManagerInterface {
  masterContract: { value: any };
  activeForeshadows: { value: any[] };
  activeCharacters: { value: any[] };
  getContractSummary: () => string;
  getChapterByNumber: (num: number) => any;
  getChapter: (id: string) => any;
  getVolume: (id: string) => any;
  updateChapter: (id: string, updates: any) => void;
  lockChapter: (id: string) => void;
  addForeshadow: (foreshadow: any) => void;
  updateForeshadowStatus: (id: string, status: string, chapter?: number) => void;
}
