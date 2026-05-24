/**
 * Emotion Design System
 * 情绪设计系统 - 增强的情绪曲线、锚点和高潮设计
 * 从 oh-story-claudecode 借鉴的情绪驱动方法论
 */

/**
 * 情绪类型
 */
export type EmotionType =
  | '热血'
  | '甜蜜'
  | '虐心'
  | '紧张'
  | '悬疑'
  | '治愈'
  | '意难平'
  | '反转震撼'
  | '爽感释放'
  | '细思极恐'
  | '共鸣感动';

/**
 * 情绪曲线类型
 */
export type EmotionArcType = 'rising' | 'falling' | 'wave' | 'm-shape' | 'n-shape' | 'u-shape';

/**
 * 情绪锚点
 */
export interface EmotionAnchor {
  /** 锚点位置（章节） */
  position: number;
  /** 情绪强度（0-100） */
  intensity: number;
  /** 情绪类型 */
  type: EmotionType;
  /** 描述 */
  description: string;
}

/**
 * 情绪曲线配置
 */
export interface EmotionCurveConfig {
  /** 曲线类型 */
  type: EmotionArcType;
  /** 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 适用情绪类型 */
  suitableEmotions: EmotionType[];
  /** 适用题材 */
  suitableGenres: string[];
  /** 典型强度序列 */
  typicalPattern: number[];
}

/**
 * 情绪高潮设计
 */
export interface EmotionHighPoint {
  /** 高潮ID */
  id: string;
  /** 高潮位置（章节） */
  position: number;
  /** 高潮类型 */
  type: 'peak' | 'valley' | 'twist';
  /** 情绪类型 */
  emotion: EmotionType;
  /** 描述 */
  description: string;
  /** 需要多少铺垫 */
  requiredSetup: number;
  /** 预期读者反应 */
  expectedReaction: string;
}

/**
 * 情绪设计完整配置
 */
export interface EmotionDesignConfig {
  /** 核心情绪 */
  primaryEmotion: EmotionType;
  /** 次要情绪 */
  secondaryEmotion?: EmotionType;
  /** 情绪曲线 */
  curveType: EmotionArcType;
  /** 情绪密度（每多少字一个情绪波动） */
  density: number;
  /** 情绪锚点 */
  anchors: EmotionAnchor[];
  /** 高潮点 */
  highPoints: EmotionHighPoint[];
  /** 低谷点 */
  lowPoints: EmotionHighPoint[];
}

// ====== 情绪曲线配置 ======

export const EMOTION_CURVE_CONFIGS: EmotionCurveConfig[] = [
  {
    type: 'rising',
    name: '步步高升型',
    description: '情绪从低到高持续上升，适合逆袭爽文。主角从困境逐步走向巅峰，读者跟随主角一起成长。',
    suitableEmotions: ['热血', '爽感释放'],
    suitableGenres: ['玄幻', '都市', '仙侠'],
    typicalPattern: [20, 35, 45, 55, 65, 75, 85, 95],
  },
  {
    type: 'falling',
    name: '虐到谷底型',
    description: '情绪从高到低持续下降，适合虐文。让读者心痛到极点，为后续治愈或爆发蓄力。',
    suitableEmotions: ['虐心', '意难平'],
    suitableGenres: ['现言', '古言', '幻言'],
    typicalPattern: [100, 85, 70, 55, 40, 30, 20, 10],
  },
  {
    type: 'wave',
    name: '波浪起伏型',
    description: '情绪高低交替，适合多冲突剧情。让读者在紧张和舒缓之间反复，体验剧情的跌宕起伏。',
    suitableEmotions: ['紧张', '悬疑', '反转震撼'],
    suitableGenres: ['悬疑', '都市', '复仇'],
    typicalPattern: [30, 60, 40, 70, 50, 80, 60, 90],
  },
  {
    type: 'm-shape',
    name: 'M形双峰型',
    description: '两个高潮点，适合大长篇分段爽。卷末有一个小高潮，全书末尾有一个大高潮。',
    suitableEmotions: ['爽感释放', '热血'],
    suitableGenres: ['玄幻', '都市', '长篇'],
    typicalPattern: [30, 50, 80, 60, 50, 60, 80, 100],
  },
  {
    type: 'n-shape',
    name: 'N形先抑后扬型',
    description: '先压抑后爆发，适合废材逆袭。前期积累压抑，中期触底反弹，后期爆发。',
    suitableEmotions: ['热血', '爽感释放', '反转震撼'],
    suitableGenres: ['玄幻', '都市', '废材逆袭'],
    typicalPattern: [20, 30, 20, 40, 50, 70, 90, 100],
  },
  {
    type: 'u-shape',
    name: 'U形谷底反弹型',
    description: '先低→更低→爆发，适合绝地翻盘。主角陷入绝境，然后在最低点逆袭。',
    suitableEmotions: ['反转震撼', '紧张', '热血'],
    suitableGenres: ['玄幻', '都市', '复仇'],
    typicalPattern: [50, 40, 20, 10, 30, 50, 80, 100],
  },
];

// ====== 情绪类型配置 ======

export const EMOTION_TYPE_CONFIGS: Record<EmotionType, {
  description: string;
  intensity: number;
  displayName: string;
  suitableGenres: string[];
  tips: string[];
}> = {
  '热血': {
    description: '让读者感受到激情和力量',
    intensity: 80,
    displayName: '热血沸腾',
    suitableGenres: ['玄幻', '仙侠', '都市'],
    tips: ['升级要爽快', '战斗要精彩', '要有燃点'],
  },
  '甜蜜': {
    description: '让读者感受到温暖和幸福',
    intensity: 70,
    displayName: '甜蜜心动',
    suitableGenres: ['现言', '幻言', '古言'],
    tips: ['暧昧要细腻', '互动要有火花', '细节要动人'],
  },
  '虐心': {
    description: '让读者感受到心痛和不舍',
    intensity: 85,
    displayName: '虐心催泪',
    suitableGenres: ['现言', '古言', '幻言'],
    tips: ['误会要深刻', '离别要不舍', '遗憾要真实'],
  },
  '紧张': {
    description: '让读者感受到紧迫和刺激',
    intensity: 75,
    displayName: '紧张刺激',
    suitableGenres: ['悬疑', '都市', '末世'],
    tips: ['倒计时要有压迫感', '危机要迫在眉睫', '选择要两难'],
  },
  '悬疑': {
    description: '让读者感受到好奇和期待',
    intensity: 70,
    displayName: '悬疑好奇',
    suitableGenres: ['悬疑', '推理', '惊悚'],
    tips: ['线索要逐步揭示', '真相要出人意料', '要有推理快感'],
  },
  '治愈': {
    description: '让读者感受到温暖和治愈',
    intensity: 60,
    displayName: '温暖治愈',
    suitableGenres: ['现言', '日常', '治愈'],
    tips: ['日常要温馨', '互动要暖心', '结局要圆满'],
  },
  '意难平': {
    description: '让读者感到遗憾和不舍',
    intensity: 90,
    displayName: '意难平',
    suitableGenres: ['现言', '古言', '虐恋'],
    tips: ['遗憾要深刻', '结局要开放', '留白给想象'],
  },
  '反转震撼': {
    description: '让读者感受到惊讶和冲击',
    intensity: 95,
    displayName: '反转震撼',
    suitableGenres: ['悬疑', '都市', '复仇'],
    tips: ['反转要出人意料', '铺垫要合理', '冲击要强烈'],
  },
  '爽感释放': {
    description: '让读者感受到过瘾和满足',
    intensity: 85,
    displayName: '爽感释放',
    suitableGenres: ['玄幻', '都市', '系统'],
    tips: ['打脸要干脆', '升级要明显', '收获要丰厚'],
  },
  '细思极恐': {
    description: '让读者回看时感到脊背发凉',
    intensity: 80,
    displayName: '细思极恐',
    suitableGenres: ['悬疑', '惊悚', '规则'],
    tips: ['铺垫要日常', '细节要暗示', '真相要恐怖'],
  },
  '共鸣感动': {
    description: '让读者产生情感共鸣',
    intensity: 75,
    displayName: '共鸣感动',
    suitableGenres: ['现言', '都市', '现实'],
    tips: ['情感要真实', '处境要共鸣', '选择要人性'],
  },
};

// ====== 情绪弧线工具函数 ======

/**
 * 根据目标字数计算情绪锚点
 */
export function calculateEmotionAnchors(
  totalWordCount: number,
  curveType: EmotionArcType,
  primaryEmotion: EmotionType,
  chaptersPerVolume: number = 30
): EmotionAnchor[] {
  const config = EMOTION_CURVE_CONFIGS.find(c => c.type === curveType);
  const emotionConfig = EMOTION_TYPE_CONFIGS[primaryEmotion];
  
  if (!config || !emotionConfig) {
    return [];
  }
  
  const chapterCount = Math.ceil(totalWordCount / 2000);
  const anchors: EmotionAnchor[] = [];
  
  // 根据曲线类型确定锚点分布
  const interval = Math.ceil(chapterCount / config.typicalPattern.length);
  
  config.typicalPattern.forEach((intensity, index) => {
    const position = Math.min((index + 1) * interval, chapterCount);
    anchors.push({
      position,
      intensity: Math.round(intensity * emotionConfig.intensity / 100),
      type: primaryEmotion,
      description: `第${position}章情绪锚点`,
    });
  });
  
  return anchors;
}

/**
 * 根据节拍表生成高潮设计
 */
export function generateHighPointsFromBeats(
  beatTable: { node: string; chapterRange: [number, number] }[],
  primaryEmotion: EmotionType
): EmotionHighPoint[] {
  const highPoints: EmotionHighPoint[] = [];
  
  for (const beat of beatTable) {
    if (beat.node === 'Climax') {
      highPoints.push({
        id: `high-${beat.chapterRange[0]}`,
        position: beat.chapterRange[0],
        type: 'peak',
        emotion: primaryEmotion,
        description: `第${beat.chapterRange[0]}章高潮`,
        requiredSetup: 5,  // 需要5章铺垫
        expectedReaction: '情绪爆发，订阅飙升',
      });
    } else if (beat.node === 'AllIsLost') {
      highPoints.push({
        id: `low-${beat.chapterRange[0]}`,
        position: beat.chapterRange[0],
        type: 'valley',
        emotion: '虐心',
        description: `第${beat.chapterRange[0]}章低谷`,
        requiredSetup: 3,
        expectedReaction: '心痛，想继续看主角翻盘',
      });
    } else if (beat.node === 'Twist1' || beat.node === 'Twist2' || beat.node === 'Twist3') {
      highPoints.push({
        id: `twist-${beat.chapterRange[0]}`,
        position: beat.chapterRange[0],
        type: 'twist',
        emotion: '反转震撼',
        description: `第${beat.chapterRange[0]}章反转`,
        requiredSetup: 2,
        expectedReaction: '惊讶，想知道后续',
      });
    }
  }
  
  return highPoints;
}

/**
 * 生成完整的情绪设计配置
 */
export function createEmotionDesign(
  primaryEmotion: EmotionType,
  curveType: EmotionArcType,
  totalWordCount: number,
  beatTable?: { node: string; chapterRange: [number, number] }[]
): EmotionDesignConfig {
  const anchors = calculateEmotionAnchors(totalWordCount, curveType, primaryEmotion);
  
  const highPoints = beatTable 
    ? generateHighPointsFromBeats(beatTable, primaryEmotion)
    : [];
  
  const lowPoints = highPoints.filter(h => h.type === 'valley');
  
  return {
    primaryEmotion,
    curveType,
    density: 3000,  // 每3000字一个情绪波动
    anchors,
    highPoints,
    lowPoints,
  };
}

/**
 * 获取适合的情绪曲线建议
 */
export function getSuggestedEmotionCurves(
  genre: string,
  targetWordCount: number
): EmotionCurveConfig[] {
  const suggestions: EmotionCurveConfig[] = [];
  
  // 根据题材推荐
  const genreCurves: Record<string, EmotionArcType[]> = {
    '玄幻': ['rising', 'n-shape', 'm-shape'],
    '都市': ['rising', 'wave', 'u-shape'],
    '仙侠': ['rising', 'n-shape'],
    '悬疑': ['wave', 'u-shape'],
    '现言': ['falling', 'wave', 'u-shape'],
    '古言': ['falling', 'wave', 'n-shape'],
    '幻言': ['falling', 'wave'],
  };
  
  const recommendedTypes = genreCurves[genre] || ['wave'];
  
  for (const type of recommendedTypes) {
    const config = EMOTION_CURVE_CONFIGS.find(c => c.type === type);
    if (config) {
      suggestions.push(config);
    }
  }
  
  // 根据字数推荐
  if (targetWordCount > 500000) {
    // 长篇推荐多峰曲线
    if (!suggestions.some(s => s.type === 'm-shape')) {
      const mConfig = EMOTION_CURVE_CONFIGS.find(c => c.type === 'm-shape');
      if (mConfig) suggestions.unshift(mConfig);
    }
  }
  
  return suggestions.slice(0, 3);
}

/**
 * 验证情绪设计的合理性
 */
export function validateEmotionDesign(config: EmotionDesignConfig): {
  valid: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // 检查高潮点间隔
  if (config.highPoints.length > 0) {
    const sortedHighs = [...config.highPoints].sort((a, b) => a.position - b.position);
    for (let i = 1; i < sortedHighs.length; i++) {
      const gap = sortedHighs[i].position - sortedHighs[i - 1].position;
      if (gap > 50) {
        warnings.push(`高潮点间隔过大（第${sortedHighs[i - 1].position}章到第${sortedHighs[i].position}章，间隔${gap}章）`);
        suggestions.push('建议增加小高潮点，避免读者疲劳');
      }
    }
  }
  
  // 检查情绪密度
  if (config.density > 5000) {
    warnings.push(`情绪密度过低（每${config.density}字一个情绪波动）`);
    suggestions.push('建议将密度调整为3000-4000字，保持读者情绪');
  }
  
  // 检查低谷设计
  const valleyCount = config.lowPoints.length;
  if (valleyCount === 0 && config.primaryEmotion === '虐心') {
    warnings.push('虐心类作品建议设置低谷点');
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
    suggestions,
  };
}

// ====== 情绪设计提示词生成 ======

/**
 * 生成情绪设计提示词
 */
export function generateEmotionDesignPrompt(config: EmotionDesignConfig): string {
  const curveConfig = EMOTION_CURVE_CONFIGS.find(c => c.type === config.curveType);
  const emotionConfig = EMOTION_TYPE_CONFIGS[config.primaryEmotion];
  
  const sections: string[] = [];
  
  sections.push('【情绪设计】');
  sections.push(`核心情绪：${emotionConfig.displayName}`);
  sections.push(`情绪曲线：${curveConfig?.name || config.curveType}`);
  sections.push(`曲线描述：${curveConfig?.description || ''}`);
  sections.push('');
  
  sections.push('【情绪密度】');
  sections.push(`建议每${config.density}字设置一个情绪波动`);
  sections.push('');
  
  if (config.anchors.length > 0) {
    sections.push('【情绪锚点】');
    for (const anchor of config.anchors.slice(0, 5)) {
      sections.push(`- 第${anchor.position}章：情绪强度${anchor.intensity}%`);
    }
    sections.push('');
  }
  
  if (config.highPoints.length > 0) {
    sections.push('【高潮点】');
    for (const hp of config.highPoints.slice(0, 3)) {
      sections.push(`- 第${hp.position}章：${hp.type === 'peak' ? '高潮' : '反转'} - ${hp.emotion}`);
      sections.push(`  预期读者反应：${hp.expectedReaction}`);
    }
    sections.push('');
  }
  
  sections.push('【情绪技巧建议】');
  for (const tip of emotionConfig.tips) {
    sections.push(`- ${tip}`);
  }
  
  return sections.join('\n');
}
