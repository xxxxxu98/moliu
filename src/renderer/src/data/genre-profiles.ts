/**
 * 题材Profile配置
 * 基于 oh-story-claudecode-main 和 webnovel-writer-master 的题材系统
 * 
 * 每个题材Profile包含：
 * - Hook配置
 * - 爽点配置
 * - 节奏红线
 * - 典型模式
 * - 常见风险
 */

import type { 
  GenreProfile, 
  HookType, 
  CoolPointType,
  GenreType 
} from '@/types/evaluation';

// ============================================================
// 题材Profile列表
// ============================================================

export const GENRE_PROFILES: GenreProfile[] = [
  // ============================================================
  // 修仙/玄幻
  // ============================================================
  {
    id: 'xianxia',
    name: '修仙',
    hooks: {
      opening: ['mystery', 'conflict', 'tension'],
      chapterEnd: ['cliffhanger', 'revelation', 'choice'],
      recommendedDensity: 0.8,
    },
    coolpoints: {
      primary: ['breakthrough', 'face-slapping', 'treasure', 'growth'],
      secondary: ['rescue', 'identity-reveal', 'justice'],
      comboInterval: 5,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 7,
      fireBreakMax: 15,
      constellationInterval: { min: 10, max: 20 },
      actBreakpoint: [30, 60, 100],
    },
    typicalPatterns: [
      { name: '资质检测', description: '开场资质检测引发冲突', chapters: [1, 2, 3] },
      { name: '秘境探险', description: '中期秘境获得机缘', chapters: [50, 51, 52] },
      { name: '宗门大比', description: '大比碾压天才', chapters: [80, 81, 82] },
    ],
    commonRisks: [
      { type: '战力崩塌', description: '境界描述前后矛盾', prevention: '严格遵循战力表' },
      { type: '升级过快', description: '主角升级速度失控', prevention: '设定清晰的升级间隔' },
    ],
  },

  {
    id: 'fantasy',
    name: '玄幻',
    hooks: {
      opening: ['mystery', 'conflict', 'action'],
      chapterEnd: ['cliffhanger', 'revelation', 'action'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['face-slapping', 'show-off', 'breakthrough', 'growth'],
      secondary: ['treasure', 'identity-reveal', 'rescue'],
      comboInterval: 4,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 12,
      constellationInterval: { min: 8, max: 18 },
      actBreakpoint: [25, 55, 90],
    },
    typicalPatterns: [
      { name: '废物流逆袭', description: '开场被欺压后逆袭', chapters: [1, 2, 5] },
      { name: '血脉觉醒', description: '特殊血脉引发关注', chapters: [20, 30, 40] },
    ],
    commonRisks: [
      { type: '设定过杂', description: '各种设定堆砌导致混乱', prevention: '控制核心设定数量' },
    ],
  },

  // ============================================================
  // 都市
  // ============================================================
  {
    id: 'urban',
    name: '都市',
    hooks: {
      opening: ['conflict', 'revelation', 'question'],
      chapterEnd: ['cliffhanger', 'tension', 'emotional'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['face-slapping', 'show-off', 'identity-reveal', 'romance'],
      secondary: ['comedy', 'rescue', 'revenge'],
      comboInterval: 3,
      density: { min: 2.0, optimal: 2.5, max: 4.0 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 5, max: 15 },
      actBreakpoint: [20, 50, 100],
    },
    typicalPatterns: [
      { name: '打脸前任', description: '开场打脸看不起自己的人', chapters: [1, 2] },
      { name: '隐藏身份', description: '身份掉马带来爽点', chapters: [30, 60, 100] },
    ],
    commonRisks: [
      { type: '剧情拖沓', description: '都市背景容易写散', prevention: '保持主线清晰' },
      { type: '节奏过快', description: '打脸太密集失去期待感', prevention: '控制打脸频率' },
    ],
  },

  {
    id: 'urban-romance',
    name: '都市言情',
    hooks: {
      opening: ['emotional', 'conflict', 'revelation'],
      chapterEnd: ['emotional', 'cliffhanger', 'choice'],
      recommendedDensity: 0.95,
    },
    coolpoints: {
      primary: ['romance', 'show-off', 'face-slapping'],
      secondary: ['emotional', 'identity-reveal', 'comedy'],
      comboInterval: 4,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 8,
      constellationInterval: { min: 8, max: 15 },
      actBreakpoint: [25, 55, 100],
    },
    typicalPatterns: [
      { name: '欢喜冤家', description: '从互相看不顺眼到相爱', chapters: [1, 20, 50] },
      { name: '误会重重', description: '误会制造虐点', chapters: [30, 45, 70] },
    ],
    commonRisks: [
      { type: '感情线拖沓', description: '读者等太久会弃书', prevention: '保持感情线推进' },
      { type: '男主扁平', description: '霸道总裁人设单一', prevention: '增加人物深度' },
    ],
  },

  // ============================================================
  // 言情
  // ============================================================
  {
    id: 'romance',
    name: '言情',
    hooks: {
      opening: ['emotional', 'question', 'tension'],
      chapterEnd: ['emotional', 'conflict', 'choice'],
      recommendedDensity: 0.95,
    },
    coolpoints: {
      primary: ['romance', 'show-off', 'emotional'],
      secondary: ['face-slapping', 'rescue', 'mystery-reveal'],
      comboInterval: 4,
      density: { min: 1.0, optimal: 1.5, max: 2.5 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 8,
      constellationInterval: { min: 8, max: 15 },
      actBreakpoint: [25, 55, 100],
    },
    typicalPatterns: [
      { name: '欢喜冤家', description: '从互相看不顺眼到相爱', chapters: [1, 20, 50] },
      { name: '误会重重', description: '误会制造虐点', chapters: [30, 45, 70] },
    ],
    commonRisks: [
      { type: '感情线拖沓', description: '读者等太久会弃书', prevention: '保持感情线推进' },
    ],
  },

  // ============================================================
  // 科幻
  // ============================================================
  {
    id: 'scifi',
    name: '科幻',
    hooks: {
      opening: ['mystery', 'question', 'action'],
      chapterEnd: ['cliffhanger', 'revelation', 'choice'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'growth', 'show-off', 'justice'],
      secondary: ['face-slapping', 'rescue', 'treasure'],
      comboInterval: 5,
      density: { min: 1.2, optimal: 1.8, max: 2.5 },
    },
    pacing: {
      questContinuityMax: 8,
      fireBreakMax: 12,
      constellationInterval: { min: 10, max: 25 },
      actBreakpoint: [35, 70, 120],
    },
    typicalPatterns: [
      { name: '科技突破', description: '关键科技突破引发变革', chapters: [20, 60, 100] },
      { name: '星际战争', description: '宏大的星际冲突', chapters: [50, 80, 120] },
    ],
    commonRisks: [
      { type: '设定过重', description: '科幻设定太多影响阅读', prevention: '渐进式揭示' },
      { type: '感情线弱', description: '科幻文感情线容易被忽略', prevention: '固定感情线更新频率' },
    ],
  },

  // ============================================================
  // 悬疑/推理
  // ============================================================
  {
    id: 'mystery',
    name: '悬疑',
    hooks: {
      opening: ['question', 'mystery', 'tension'],
      chapterEnd: ['cliffhanger', 'question', 'revelation'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'justice', 'face-slapping'],
      secondary: ['comedy', 'emotional', 'growth'],
      comboInterval: 3,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 5, max: 12 },
      actBreakpoint: [20, 50, 80],
    },
    typicalPatterns: [
      { name: '连环谜案', description: '多个案件串联推进', chapters: [1, 20, 50] },
      { name: '真相大白', description: '最终揭示真相', chapters: [70, 80] },
    ],
    commonRisks: [
      { type: '伏笔泄露', description: '线索太明显失去悬念', prevention: '精心设计线索隐藏' },
      { type: '结局仓促', description: '揭秘太突然', prevention: '提前埋好线索' },
    ],
  },

  // ============================================================
  // 武侠
  // ============================================================
  {
    id: 'wuxia',
    name: '武侠',
    hooks: {
      opening: ['conflict', 'action', 'mystery'],
      chapterEnd: ['cliffhanger', 'revelation', 'choice'],
      recommendedDensity: 0.8,
    },
    coolpoints: {
      primary: ['face-slapping', 'growth', 'show-off', 'breakthrough'],
      secondary: ['rescue', 'romance', 'justice'],
      comboInterval: 5,
      density: { min: 1.2, optimal: 1.8, max: 2.5 },
    },
    pacing: {
      questContinuityMax: 7,
      fireBreakMax: 12,
      constellationInterval: { min: 10, max: 20 },
      actBreakpoint: [30, 60, 100],
    },
    typicalPatterns: [
      { name: '江湖恩怨', description: '门派争斗贯穿全书', chapters: [1, 30, 60] },
      { name: '神功秘籍', description: '获得秘籍突破境界', chapters: [10, 40, 80] },
    ],
    commonRisks: [
      { type: '打斗套路', description: '比武场面千篇一律', prevention: '设计独特的战斗风格' },
    ],
  },

  // ============================================================
  // 历史
  // ============================================================
  {
    id: 'historical',
    name: '历史',
    hooks: {
      opening: ['conflict', 'emotional', 'revelation'],
      chapterEnd: ['cliffhanger', 'emotional', 'choice'],
      recommendedDensity: 0.75,
    },
    coolpoints: {
      primary: ['face-slapping', 'show-off', 'growth', 'romance'],
      secondary: ['justice', 'rescue', 'emotional'],
      comboInterval: 5,
      density: { min: 1.0, optimal: 1.5, max: 2.0 },
    },
    pacing: {
      questContinuityMax: 8,
      fireBreakMax: 15,
      constellationInterval: { min: 10, max: 25 },
      actBreakpoint: [30, 65, 100],
    },
    typicalPatterns: [
      { name: '穿越逆袭', description: '现代人穿越古代改变历史', chapters: [1, 20, 50] },
      { name: '权力争斗', description: '宫廷/官场权力博弈', chapters: [30, 50, 80] },
    ],
    commonRisks: [
      { type: '史实错误', description: '历史细节出错', prevention: '做好资料查阅' },
      { type: '人名拗口', description: '古代人名难以记忆', prevention: '使用通俗易懂的名字' },
    ],
  },

  // ============================================================
  // 末世/废土
  // ============================================================
  {
    id: 'apocalypse',
    name: '末世',
    hooks: {
      opening: ['tension', 'conflict', 'action'],
      chapterEnd: ['cliffhanger', 'tension', 'revelation'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['growth', 'face-slapping', 'treasure', 'rescue'],
      secondary: ['show-off', 'identity-reveal', 'breakthrough'],
      comboInterval: 4,
      density: { min: 1.8, optimal: 2.2, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 8, max: 15 },
      actBreakpoint: [20, 50, 80],
    },
    typicalPatterns: [
      { name: '丧尸围城', description: '丧尸潮爆发求生', chapters: [1, 10, 30] },
      { name: '基地崛起', description: '建立幸存者基地', chapters: [40, 60, 80] },
    ],
    commonRisks: [
      { type: '绝望感过重', description: '末世文容易太压抑', prevention: '保持希望主线' },
    ],
  },
];

// ============================================================
// 辅助函数
// ============================================================

/**
 * 根据ID获取题材Profile
 */
export function getGenreProfile(id: string): GenreProfile | undefined {
  return GENRE_PROFILES.find(p => p.id === id);
}

/**
 * 根据名称获取题材Profile
 */
export function getGenreProfileByName(name: string): GenreProfile | undefined {
  return GENRE_PROFILES.find(p => 
    p.name.includes(name) || name.includes(p.name)
  );
}

/**
 * 匹配题材Profile
 */
export function matchGenreProfile(genres: string[]): GenreProfile {
  const genreSet = new Set(genres.map(g => g.toLowerCase()));
  
  // 精确匹配
  for (const profile of GENRE_PROFILES) {
    if (genreSet.has(profile.name.toLowerCase())) {
      return profile;
    }
    if (genreSet.has(profile.id.toLowerCase())) {
      return profile;
    }
  }
  
  // 部分匹配
  for (const profile of GENRE_PROFILES) {
    const profileNames = [profile.name, ...profile.id.split('-')];
    for (const gn of profileNames) {
      for (const selectedGenre of genres) {
        if (selectedGenre.includes(gn) || gn.includes(selectedGenre)) {
          return profile;
        }
      }
    }
  }
  
  // 默认返回都市
  return GENRE_PROFILES.find(p => p.id === 'urban')!;
}

/**
 * 获取所有题材Profile
 */
export function getAllGenreProfiles(): GenreProfile[] {
  return GENRE_PROFILES;
}

/**
 * 获取题材Profile的Hook类型
 */
export function getGenreHooks(profileId: string): {
  opening: HookType[];
  chapterEnd: HookType[];
} {
  const profile = getGenreProfile(profileId);
  if (!profile) {
    return { opening: ['conflict'], chapterEnd: ['cliffhanger'] };
  }
  return {
    opening: profile.hooks.opening,
    chapterEnd: profile.hooks.chapterEnd,
  };
}

/**
 * 获取题材Profile的爽点类型
 */
export function getGenreCoolpoints(profileId: string): {
  primary: CoolPointType[];
  secondary: CoolPointType[];
} {
  const profile = getGenreProfile(profileId);
  if (!profile) {
    return { primary: ['face-slapping', 'show-off'], secondary: ['growth'] };
  }
  return {
    primary: profile.coolpoints.primary,
    secondary: profile.coolpoints.secondary,
  };
}

/**
 * 验证题材Profile是否适合
 */
export function validateGenreProfile(
  profileId: string,
  wordCount: number
): { valid: boolean; warnings: string[] } {
  const profile = getGenreProfile(profileId);
  if (!profile) {
    return { valid: true, warnings: [] };
  }
  
  const warnings: string[] = [];
  
  // 字数与节奏检查
  if (wordCount < 200000 && profile.id === 'scifi') {
    warnings.push('科幻文建议字数在20万以上');
  }
  
  if (wordCount > 500000 && profile.pacing.fireBreakMax < 15) {
    warnings.push('长篇文建议增加感情线断档容忍度');
  }
  
  return { valid: warnings.length === 0, warnings };
}

/**
 * 题材类型映射
 */
export const GENRE_TYPE_MAP: Record<string, GenreType> = {
  'xianxia': 'xianxia',
  'xiuzhuan': 'xianxia',
  '修仙': 'xianxia',
  'fantasy': 'fantasy',
  'xuanhuan': 'fantasy',
  '玄幻': 'fantasy',
  'urban': 'urban',
  'dushi': 'urban',
  '都市': 'urban',
  'romance': 'romance',
  'yanqing': 'romance',
  '言情': 'romance',
  'scifi': 'scifi',
  'kehuan': 'scifi',
  '科幻': 'scifi',
  'mystery': 'mystery',
  'xuanyi': 'mystery',
  '悬疑': 'mystery',
  'wuxia': 'wuxia',
  '武侠': 'wuxia',
  'historical': 'historical',
  'lishi': 'historical',
  '历史': 'historical',
};

/**
 * 获取GenreType
 */
export function getGenreType(genreName: string): GenreType {
  return GENRE_TYPE_MAP[genreName] || 'other';
}

// ============================================================
// 推荐函数
// ============================================================

/**
 * 获取推荐的开篇钩子类型
 */
export function getRecommendedOpeningHooks(genres: string[]): HookType[] {
  const profile = matchGenreProfile(genres);
  return profile.hooks.opening;
}

/**
 * 获取推荐的章节结尾钩子类型
 */
export function getRecommendedChapterEndHooks(genres: string[]): HookType[] {
  const profile = matchGenreProfile(genres);
  return profile.hooks.chapterEnd;
}

/**
 * 获取推荐的爽点类型
 */
export function getRecommendedCoolPoints(genres: string[]): CoolPointType[] {
  const profile = matchGenreProfile(genres);
  return profile.coolpoints.primary;
}
