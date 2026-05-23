/**
 * 情绪波浪线量化系统
 * 基于 oh-story 的情绪波浪线设计
 * 
 * 核心理念：
 * - 每章需要明确的情绪波动
 * - 情绪不能一直高潮，需要起伏
 * - 章尾需要情绪钩子
 */

import { ref, computed } from 'vue';

// ============================================================
// 类型定义
// ============================================================

/**
 * 基础情绪类型
 */
export type BaseEmotion = 'tension' | 'relaxation' | 'excitement' | 'calm';

/**
 * 章节类型
 */
export type ChapterType = 'normal' | 'climax' | 'transition' | 'setup' | 'world_intro' | 'character_intro' | 'conflict' | 'resolution' | 'ending';

/**
 * 章尾情绪类型
 */
export type ChapterEndEmotion = 
  | 'cliffhanger'      // 悬念钩子
  | 'revelation'        // 揭示钩子
  | 'tension_release'   // 张力释放
  | 'question'          // 疑问钩子
  | 'tough_choice';     // 两难抉择

/**
 * 情绪转换点
 */
export interface EmotionTransition {
  /** 位置（0-1） */
  position: number;
  /** 从什么情绪 */
  from: string;
  /** 转为什么情绪 */
  to: string;
}

/**
 * 情绪波浪线
 */
export interface EmotionWave {
  /** 章节基础情绪 */
  baseEmotion: BaseEmotion;
  /** 情绪曲线（按段落百分比，0-100） */
  curve: number[];
  /** 情绪峰值位置（0-1） */
  peakPosition: number;
  /** 情绪峰值强度（1-10） */
  peakIntensity: number;
  /** 情绪谷底位置（0-1） */
  valleyPosition: number;
  /** 情绪谷底强度（1-10） */
  valleyIntensity: number;
  /** 章尾情绪 */
  chapterEndEmotion: ChapterEndEmotion;
  /** 章尾情绪强度（1-10） */
  chapterEndIntensity: number;
  /** 章尾悬念描述 */
  chapterEndDescription: string;
  /** 情绪转换点 */
  transitionPoints: EmotionTransition[];
  /** 情绪变化次数 */
  emotionChangeCount: number;
}

/**
 * 情绪波浪线配置
 */
export interface EmotionWaveConfig {
  /** 目标字数 */
  targetWordCount: number;
  /** 章节类型 */
  chapterType: ChapterType;
  /** 章节序号 */
  chapterNumber: number;
  /** 题材 */
  genre: string[];
  /** 情绪密度（每千字情绪变化次数，默认 2-4） */
  emotionDensity?: number;
  /** 是否为卷末章节 */
  isVolumeEnd?: boolean;
  /** 是否有前置章节 */
  hasPreviousChapter?: boolean;
}

/**
 * 情绪状态
 */
export interface EmotionState {
  /** 当前情绪 */
  emotion: string;
  /** 强度（1-10） */
  intensity: number;
  /** 位置（0-1） */
  position: number;
}

// ============================================================
// 常量
// ============================================================

/** 情绪名称映射 */
const EMOTION_NAMES: Record<BaseEmotion, string> = {
  tension: '紧张',
  relaxation: '放松',
  excitement: '兴奋',
  calm: '平静',
};

/** 章节类型到基础情绪的映射 */
const CHAPTER_TYPE_TO_EMOTION: Record<ChapterType, BaseEmotion> = {
  normal: 'tension',
  climax: 'excitement',
  transition: 'calm',
  setup: 'relaxation',
  world_intro: 'calm',
  character_intro: 'relaxation',
  conflict: 'tension',
  resolution: 'excitement',
  ending: 'excitement',
};

/** 题材特殊配置 */
const GENRE_EMOTION_CONFIG: Record<string, { defaultDensity: number; cliffhangerIntensity: number }> = {
  '都市': { defaultDensity: 3, cliffhangerIntensity: 8 },
  '修仙': { defaultDensity: 2.5, cliffhangerIntensity: 9 },
  '玄幻': { defaultDensity: 2.5, cliffhangerIntensity: 9 },
  '言情': { defaultDensity: 2, cliffhangerIntensity: 7 },
  '悬疑': { defaultDensity: 1.5, cliffhangerIntensity: 10 },
  '科幻': { defaultDensity: 2, cliffhangerIntensity: 8 },
  '都市修仙': { defaultDensity: 2.5, cliffhangerIntensity: 9 },
};

// ============================================================
// 情绪波浪线量化器
// ============================================================

export class EmotionWaveQuantifier {
  /**
   * 生成情绪波浪线
   */
  static generate(config: EmotionWaveConfig): EmotionWave {
    const {
      targetWordCount,
      chapterType,
      chapterNumber,
      genre,
      emotionDensity = 3,
      isVolumeEnd = false,
      hasPreviousChapter = true,
    } = config;

    // 1. 确定基础情绪
    const baseEmotion = this.getBaseEmotion(chapterType);

    // 2. 获取题材配置
    const genreConfig = this.getGenreConfig(genre);

    // 3. 生成情绪曲线
    const curve = this.generateCurve(chapterType, targetWordCount, emotionDensity);

    // 4. 确定峰值和谷底
    const { peakPosition, peakIntensity, valleyPosition, valleyIntensity } = this.analyzeWaveExtremes(
      curve,
      chapterType,
      isVolumeEnd
    );

    // 5. 确定章尾情绪
    const { chapterEndEmotion, chapterEndIntensity, chapterEndDescription } = this.determineChapterEnd(
      chapterType,
      genreConfig.cliffhangerIntensity,
      isVolumeEnd,
      hasPreviousChapter
    );

    // 6. 生成转换点
    const transitionPoints = this.generateTransitionPoints(curve);

    // 7. 计算情绪变化次数
    const emotionChangeCount = this.countEmotionChanges(curve);

    return {
      baseEmotion,
      curve,
      peakPosition,
      peakIntensity,
      valleyPosition,
      valleyIntensity,
      chapterEndEmotion,
      chapterEndIntensity,
      chapterEndDescription,
      transitionPoints,
      emotionChangeCount,
    };
  }

  /**
   * 获取基础情绪
   */
  private static getBaseEmotion(chapterType: ChapterType): BaseEmotion {
    return CHAPTER_TYPE_TO_EMOTION[chapterType] || 'tension';
  }

  /**
   * 获取题材配置
   */
  private static getGenreConfig(genre: string[]): { defaultDensity: number; cliffhangerIntensity: number } {
    // 优先匹配组合题材
    const combinedGenre = genre.join('');
    if (GENRE_EMOTION_CONFIG[combinedGenre]) {
      return GENRE_EMOTION_CONFIG[combinedGenre];
    }

    // 匹配单个题材
    for (const g of genre) {
      if (GENRE_EMOTION_CONFIG[g]) {
        return GENRE_EMOTION_CONFIG[g];
      }
    }

    // 默认配置
    return { defaultDensity: 3, cliffhangerIntensity: 8 };
  }

  /**
   * 生成情绪曲线
   * 
   * 规则：
   * 1. 开局要有钩子（前10%要有情绪起伏）
   * 2. 中段要有推进（稳定上升或波动）
   * 3. 结尾要有钩子（最后10%要有情绪高点或悬念）
   */
  private static generateCurve(
    chapterType: ChapterType,
    wordCount: number,
    density: number
  ): number[] {
    const curve: number[] = [];
    const segments = 10; // 10个段落，每段10%

    // 根据字数计算段落数（每段约500字）
    const paragraphsCount = Math.max(10, Math.ceil(wordCount / 500));

    for (let i = 0; i < 10; i++) {
      const position = i / 10; // 0-1

      let emotion: number;

      if (chapterType === 'climax') {
        // 高潮章：全程高情绪，逐步上升
        emotion = 7 + position * 3;
      } else if (chapterType === 'normal') {
        // 普通章：波浪起伏
        emotion = 5 + Math.sin(position * Math.PI * 2) * 2;
        // 确保结尾有情绪高点
        if (position >= 0.7) {
          const endProgress = (position - 0.7) / 0.3;
          emotion = 5 + Math.sin(0.7 * Math.PI * 2) * 2 + endProgress * 3;
        }
      } else if (chapterType === 'transition') {
        // 过渡章：平缓为主
        emotion = 4 + Math.sin(position * Math.PI) * 1;
      } else if (chapterType === 'setup') {
        // 铺垫章：前半低后半升
        emotion = 3 + position * 4;
      } else if (chapterType === 'world_intro' || chapterType === 'character_intro') {
        // 介绍章：平稳介绍，偶尔有趣味点
        emotion = 4 + Math.sin(position * Math.PI * 3) * 1;
      } else if (chapterType === 'conflict') {
        // 冲突章：紧张上升
        emotion = 5 + position * 4;
      } else if (chapterType === 'resolution') {
        // 解决章：高潮后逐渐平复
        emotion = 9 - position * 2;
      } else if (chapterType === 'ending') {
        // 结尾章：最终高潮
        emotion = 7 + position * 3;
      } else {
        // 默认普通章
        emotion = 5 + Math.sin(position * Math.PI * 2) * 2;
      }

      curve.push(Math.round(Math.max(1, Math.min(10, emotion))));
    }

    return curve;
  }

  /**
   * 分析波浪极值
   */
  private static analyzeWaveExtremes(
    curve: number[],
    chapterType: ChapterType,
    isVolumeEnd: boolean
  ): { peakPosition: number; peakIntensity: number; valleyPosition: number; valleyIntensity: number } {
    let peakPosition = 0.7;
    let peakIntensity = 7;
    let valleyPosition = 0.2;
    let valleyIntensity = 3;

    // 找峰值
    let maxVal = curve[0];
    let maxIdx = 0;
    for (let i = 0; i < curve.length; i++) {
      if (curve[i] > maxVal) {
        maxVal = curve[i];
        maxIdx = i;
      }
    }
    peakPosition = maxIdx / (curve.length - 1);
    peakIntensity = maxVal;

    // 找谷值
    let minVal = curve[0];
    let minIdx = 0;
    for (let i = 0; i < curve.length; i++) {
      if (curve[i] < minVal) {
        minVal = curve[i];
        minIdx = i;
      }
    }
    valleyPosition = minIdx / (curve.length - 1);
    valleyIntensity = minVal;

    // 根据章节类型调整
    if (chapterType === 'climax' || chapterType === 'ending') {
      peakIntensity = Math.min(10, peakIntensity + 2);
      peakPosition = 0.85;
    } else if (chapterType === 'transition') {
      peakIntensity = Math.max(4, peakIntensity - 1);
    }

    // 卷末章节峰值更强
    if (isVolumeEnd) {
      peakIntensity = Math.min(10, peakIntensity + 1);
    }

    return { peakPosition, peakIntensity, valleyPosition, valleyIntensity };
  }

  /**
   * 确定章尾情绪
   */
  private static determineChapterEnd(
    chapterType: ChapterType,
    baseCliffhangerIntensity: number,
    isVolumeEnd: boolean,
    hasPreviousChapter: boolean
  ): { chapterEndEmotion: ChapterEndEmotion; chapterEndIntensity: number; chapterEndDescription: string } {
    // 第一章不需要悬念钩子
    if (!hasPreviousChapter) {
      return {
        chapterEndEmotion: 'revelation',
        chapterEndIntensity: 6,
        chapterEndDescription: '留下一个关键信息或悬念，引发读者兴趣',
      };
    }

    // 卷末章节需要更强的钩子
    if (isVolumeEnd) {
      return {
        chapterEndEmotion: 'cliffhanger',
        chapterEndIntensity: Math.min(10, baseCliffhangerIntensity + 2),
        chapterEndDescription: '抛出重大悬念或转折，为下一卷埋下伏笔',
      };
    }

    // 高潮章和普通章需要悬念
    if (chapterType === 'climax' || chapterType === 'normal' || chapterType === 'conflict') {
      const hookTypes: ChapterEndEmotion[] = ['cliffhanger', 'question', 'tough_choice'];
      const randomHook = hookTypes[Math.floor(Math.random() * hookTypes.length)];
      return {
        chapterEndEmotion: randomHook,
        chapterEndIntensity: baseCliffhangerIntensity,
        chapterEndDescription: this.getHookDescription(randomHook),
      };
    }

    // 过渡章可以用较轻的钩子
    if (chapterType === 'transition') {
      return {
        chapterEndEmotion: 'question',
        chapterEndIntensity: baseCliffhangerIntensity - 2,
        chapterEndDescription: '留下一个疑问或悬念，但不需要太强烈',
      };
    }

    // 铺垫章可以以揭示或悬念结束
    if (chapterType === 'setup' || chapterType === 'world_intro') {
      return {
        chapterEndEmotion: 'revelation',
        chapterEndIntensity: baseCliffhangerIntensity - 1,
        chapterEndDescription: '揭示一个有趣的信息或新发现',
      };
    }

    // 默认悬念钩子
    return {
      chapterEndEmotion: 'cliffhanger',
      chapterEndIntensity: baseCliffhangerIntensity,
      chapterEndDescription: '抛出悬念，吸引读者继续阅读',
    };
  }

  /**
   * 获取钩子描述
   */
  private static getHookDescription(hookType: ChapterEndEmotion): string {
    const descriptions: Record<ChapterEndEmotion, string> = {
      cliffhanger: '突然揭示重要信息或发生重大事件',
      revelation: '揭示关键真相或发现',
      tension_release: '暂时缓解紧张，但留下隐患',
      question: '提出疑问，让读者思考',
      tough_choice: '主角面临两难抉择',
    };
    return descriptions[hookType];
  }

  /**
   * 生成情绪转换点
   */
  private static generateTransitionPoints(curve: number[]): EmotionTransition[] {
    const transitions: EmotionTransition[] = [];
    const emotions = ['平静', '紧张', '放松', '期待', '惊讶', '疑惑', '兴奋', '恐惧'];

    for (let i = 1; i < curve.length; i++) {
      const diff = curve[i] - curve[i - 1];
      const position = i / curve.length;

      // 情绪变化超过2级才记录为转换点
      if (Math.abs(diff) >= 2) {
        const fromIdx = Math.floor(curve[i - 1] / 2);
        const toIdx = Math.floor(curve[i] / 2);
        transitions.push({
          position,
          from: emotions[Math.min(fromIdx, emotions.length - 1)],
          to: emotions[Math.min(toIdx, emotions.length - 1)],
        });
      }
    }

    return transitions;
  }

  /**
   * 计算情绪变化次数
   */
  private static countEmotionChanges(curve: number[]): number {
    let changes = 0;
    for (let i = 1; i < curve.length; i++) {
      if (Math.abs(curve[i] - curve[i - 1]) >= 1) {
        changes++;
      }
    }
    return changes;
  }

  /**
   * 获取情绪曲线摘要
   */
  static getSummary(wave: EmotionWave): string {
    const parts: string[] = [];

    // 基础情绪
    parts.push(`基调：${EMOTION_NAMES[wave.baseEmotion]}`);

    // 情绪变化
    parts.push(`情绪波动：${wave.emotionChangeCount}次`);

    // 峰值
    parts.push(`高潮点：第${Math.round(wave.peakPosition * 100)}%，强度${wave.peakIntensity}/10`);

    // 谷底
    parts.push(`低点：第${Math.round(wave.valleyPosition * 100)}%，强度${wave.valleyIntensity}/10`);

    // 章尾
    parts.push(`结尾：${this.getHookDescription(wave.chapterEndEmotion)}（${wave.chapterEndIntensity}/10）`);

    return parts.join(' | ');
  }
}

// ============================================================
// 情绪波浪线提示词构建
// ============================================================

export class EmotionWavePromptBuilder {
  /**
   * 构建情绪波浪线提示词
   */
  static buildPrompt(wave: EmotionWave, context?: { previousEnding?: string; chapterGoal?: string }): string {
    const parts: string[] = [];

    parts.push('## 【情绪波浪线要求】\n');
    parts.push(`本章基调：${EMOTION_NAMES[wave.baseEmotion]}\n`);

    // 情绪曲线
    parts.push('### 情绪曲线（按章节进度）');
    for (let i = 0; i < wave.curve.length; i++) {
      const start = i * 10;
      const end = (i + 1) * 10;
      const intensity = wave.curve[i];
      const bar = '█'.repeat(intensity) + '░'.repeat(10 - intensity);
      parts.push(`${start}%-${end}%: ${bar} ${intensity}/10`);
    }
    parts.push('');

    // 情绪峰值和谷底
    parts.push('### 情绪极值');
    parts.push(`- 高潮点：第 ${Math.round(wave.peakPosition * 100)}% 位置，强度 ${wave.peakIntensity}/10`);
    parts.push(`- 低谷点：第 ${Math.round(wave.valleyPosition * 100)}% 位置，强度 ${wave.valleyIntensity}/10`);
    parts.push(`- 情绪变化：${wave.emotionChangeCount} 次\n`);

    // 转换点
    if (wave.transitionPoints.length > 0) {
      parts.push('### 情绪转换点');
      for (const tp of wave.transitionPoints) {
        parts.push(`- ${Math.round(tp.position * 100)}% 处：从${tp.from}转为${tp.to}`);
      }
      parts.push('');
    }

    // 章尾情绪【必须】
    parts.push('### 【章尾情绪·必须】');
    parts.push(`- 类型：${this.getHookDescription(wave.chapterEndEmotion)}`);
    parts.push(`- 强度：${wave.chapterEndIntensity}/10`);
    parts.push(`- 要求：${wave.chapterEndDescription}`);
    parts.push('');

    // 写作提示
    parts.push('### 写作提示');
    parts.push('1. 不要让情绪一直保持同一水平，要有起伏');
    parts.push('2. 每 500-1000 字至少有一次情绪起伏');
    parts.push('3. 章尾必须制造情绪钩子，留悬念让读者想翻下一页');
    parts.push('4. 可以用对话、动作、环境来表现情绪变化');
    parts.push('5. 避免直接描写情绪，用动作和反应展示\n');

    // 衔接提示
    if (context?.previousEnding) {
      parts.push('### 前章结尾衔接');
      parts.push(`前章结尾：${context.previousEnding}`);
      parts.push('请自然衔接上述情绪氛围，继续本章的叙事。\n');
    }

    return parts.join('\n');
  }

  /**
   * 获取钩子描述
   */
  private static getHookDescription(hookType: ChapterEndEmotion): string {
    const descriptions: Record<ChapterEndEmotion, string> = {
      cliffhanger: '悬念钩子 - 抛出悬念或危机',
      revelation: '揭示钩子 - 揭示关键信息',
      tension_release: '张力释放 - 暂时缓解但留隐患',
      question: '疑问钩子 - 提出疑问',
      tough_choice: '抉择钩子 - 两难选择',
    };
    return descriptions[hookType];
  }

  /**
   * 构建情绪标注提示（用于审查）
   */
  static buildReviewPrompt(): string {
    return `
## 【情绪波浪线审查要求】

请分析本章的情绪波浪线，检查以下问题：

### 1. 情绪起伏检查
- [ ] 开局（前10%）是否有情绪钩子
- [ ] 中段是否有情绪波动
- [ ] 章尾是否有情绪高潮或悬念

### 2. 情绪连续性检查
- [ ] 情绪变化是否自然
- [ ] 是否有突兀的情绪跳跃
- [ ] 是否有情绪断层

### 3. 章尾钩子检查
- [ ] 章尾是否有情绪钩子
- [ ] 钩子强度是否足够
- [ ] 钩子类型是否合适

### 4. 情绪外化检查
- [ ] 是否用动作/对话/反应展示情绪
- [ ] 是否有直接描写情绪的句子（如"他感到愤怒"）

请输出审查结果，格式：
{
  "emotionWave": {
    "has起伏": true/false,
    "has章尾钩子": true/false,
    "has情绪外化": true/false,
    "评分": 0-100,
    "问题": ["问题1", "问题2"],
    "建议": ["建议1", "建议2"]
  }
}
`;
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useEmotionWave() {
  const currentWave = ref<EmotionWave | null>(null);

  /**
   * 生成情绪波浪线
   */
  function generateWave(config: EmotionWaveConfig): EmotionWave {
    const wave = EmotionWaveQuantifier.generate(config);
    currentWave.value = wave;
    return wave;
  }

  /**
   * 构建提示词
   */
  function buildPrompt(context?: { previousEnding?: string; chapterGoal?: string }): string {
    if (!currentWave.value) {
      return '';
    }
    return EmotionWavePromptBuilder.buildPrompt(currentWave.value, context);
  }

  /**
   * 获取摘要
   */
  function getSummary(): string {
    if (!currentWave.value) {
      return '';
    }
    return EmotionWaveQuantifier.getSummary(currentWave.value);
  }

  return {
    currentWave,
    generateWave,
    buildPrompt,
    getSummary,
    Quantifier: EmotionWaveQuantifier,
    PromptBuilder: EmotionWavePromptBuilder,
  };
}

// ============================================================
// 类型导出
// ============================================================

export type { EmotionWave, EmotionWaveConfig, EmotionState, EmotionTransition };
