/**
 * Enhanced Knowledge Query System
 * 增强版知识查询系统 - 从 webnovel-writer 导入丰富的 CSV 数据
 * 支持：爽点节奏、场景写法、桥段套路、写作技法等
 */

import type {
  CoolPointRecord,
  SceneWritingRecord,
  GoldenFingerRecord,
  CharacterRecord,
  GenreRuleRecord,
  BridgePatternRecord,
  KnowledgeQueryContext,
  KnowledgeResult,
} from '../../types';

// ====== 增强类型定义 ======

/**
 * 节奏策略记录
 */
export interface PaceStrategyRecord {
  id: string;
  skills: string[];
  category: string;
  level: string;
  keywords: string[];
  summary: string;
  details: string;
  instruction: string;
  examples: string[];
  paceType: string;
  antiPatterns: string[];
}

/**
 * 桥段套路记录
 */
export interface BridgePatternRecord {
  id: string;
  name: string;
  description: string;
  structure: {
    setup: string;
    conflict: string;
    resolution: string;
  };
  emotions: string[];
  genre: string[];
  variations: string[];
  example?: string;
}

/**
 * 写作技法记录
 */
export interface WritingTechniqueRecord {
  id: string;
  skills: string[];
  category: string;
  level: string;
  keywords: string[];
  summary: string;
  details: string;
  applicableGenres: string[];
  examples: string[];
}

/**
 * 增强知识查询上下文
 */
export interface EnhancedKnowledgeContext extends KnowledgeQueryContext {
  /** 查询模式 */
  mode?: 'chapter_start' | 'chapter_middle' | 'chapter_end' | 'climax' | 'transition' | 'all';
  /** 是否需要示例 */
  needExamples?: boolean;
  /** 最低相关性阈值 */
  minRelevance?: number;
}

/**
 * 查询结果配置
 */
export interface QueryOptions {
  /** 最大返回数量 */
  limit?: number;
  /** 是否包含详情 */
  includeDetails?: boolean;
  /** 是否包含示例 */
  includeExamples?: boolean;
}

// ====== 知识库类 ======

/**
 * 增强版知识查询系统
 */
export class EnhancedKnowledgeQuery {
  // 数据存储
  private paceStrategies: PaceStrategyRecord[] = [];
  private sceneWritings: SceneWritingRecord[] = [];
  private bridgePatterns: BridgePatternRecord[] = [];
  private writingTechniques: WritingTechniqueRecord[] = [];
  private loaded = false;

  /**
   * 加载所有知识数据
   */
  async loadAll(): Promise<void> {
    if (this.loaded) return;
    
    this.paceStrategies = this.getPaceStrategies();
    this.sceneWritings = this.getSceneWritings();
    this.bridgePatterns = this.getBridgePatterns();
    this.writingTechniques = this.getWritingTechniques();
    
    this.loaded = true;
  }

  // ====== 核心查询方法 ======

  /**
   * 查询适合当前上下文的爽点策略
   */
  queryPaceStrategies(context: EnhancedKnowledgeContext): KnowledgeResult[] {
    const { genre, mode, keywords, minRelevance = 1 } = context;
    const results: KnowledgeResult[] = [];

    for (const strategy of this.paceStrategies) {
      let relevance = 0;
      const matchedKeywords: string[] = [];

      // 题材匹配
      if (genre) {
        const applicableGenres = strategy.keywords[0]?.split('/') || [];
        if (applicableGenres.some(g => 
          g.includes(genre) || genre.includes(g) || g === '全部'
        )) {
          relevance += 3;
        }
      }

      // 场景模式匹配
      if (mode) {
        const modeKeywords = this.getModeKeywords(mode);
        if (strategy.keywords.some(k => 
          modeKeywords.some(mk => k.includes(mk))
        )) {
          relevance += 2;
        }
      }

      // 关键词匹配
      if (keywords && keywords.length > 0) {
        const kwStr = keywords.join(' ').toLowerCase();
        for (const k of strategy.keywords) {
          if (kwStr.includes(k.toLowerCase())) {
            relevance += 1;
            matchedKeywords.push(k);
          }
        }
      }

      if (relevance >= minRelevance) {
        results.push({
          id: strategy.id,
          type: 'pacestrategy',
          summary: strategy.summary,
          details: strategy.details,
          relevance,
        });
      }
    }

    return this.rankAndFilter(results);
  }

  /**
   * 查询场景写法
   */
  querySceneWritings(context: EnhancedKnowledgeContext): KnowledgeResult[] {
    const { sceneType, keywords, minRelevance = 1, needExamples = false } = context;
    const results: KnowledgeResult[] = [];

    for (const scene of this.sceneWritings) {
      let relevance = 0;

      // 场景类型匹配
      if (sceneType && scene.category.toLowerCase().includes(sceneType.toLowerCase())) {
        relevance += 5;
      }

      // 关键词匹配
      if (keywords && keywords.length > 0) {
        const kwStr = keywords.join(' ').toLowerCase();
        if (scene.keywords.some(k => kwStr.includes(k.toLowerCase()))) {
          relevance += 2;
        }
        if (scene.summary.toLowerCase().includes(kwStr)) {
          relevance += 1;
        }
      }

      if (relevance >= minRelevance) {
        results.push({
          id: scene.id,
          type: 'scenewriting',
          summary: scene.summary,
          details: scene.details,
          relevance,
        });
      }
    }

    return this.rankAndFilter(results);
  }

  /**
   * 查询桥段套路
   */
  queryBridgePatterns(context: EnhancedKnowledgeContext): KnowledgeResult[] {
    const { genre, keywords, emotion, minRelevance = 1 } = context;
    const results: KnowledgeResult[] = [];

    for (const pattern of this.bridgePatterns) {
      let relevance = 0;

      // 题材匹配
      if (genre) {
        if (pattern.genre.some(g => 
          g.includes(genre) || genre.includes(g) || g === '全部'
        )) {
          relevance += 3;
        }
      }

      // 情绪匹配
      if (emotion && pattern.emotions.some(e => 
        e.includes(emotion) || emotion.includes(e)
      )) {
        relevance += 3;
      }

      // 关键词匹配
      if (keywords && keywords.length > 0) {
        const kwStr = keywords.join(' ').toLowerCase();
        if (pattern.name.toLowerCase().includes(kwStr)) {
          relevance += 2;
        }
        if (pattern.description.toLowerCase().includes(kwStr)) {
          relevance += 1;
        }
      }

      if (relevance >= minRelevance) {
        results.push({
          id: pattern.id,
          type: 'bridgepattern',
          summary: pattern.description,
          details: `结构：${pattern.structure.setup} → ${pattern.structure.conflict} → ${pattern.structure.resolution}`,
          relevance,
        });
      }
    }

    return this.rankAndFilter(results);
  }

  /**
   * 查询写作技法
   */
  queryWritingTechniques(context: EnhancedKnowledgeContext): KnowledgeResult[] {
    const { genre, keywords, minRelevance = 1 } = context;
    const results: KnowledgeResult[] = [];

    for (const tech of this.writingTechniques) {
      let relevance = 0;

      // 题材匹配
      if (genre) {
        if (tech.applicableGenres.some(g => 
          g.includes(genre) || genre.includes(g) || g === '全部'
        )) {
          relevance += 3;
        }
      }

      // 关键词匹配
      if (keywords && keywords.length > 0) {
        const kwStr = keywords.join(' ').toLowerCase();
        if (tech.keywords.some(k => kwStr.includes(k.toLowerCase()))) {
          relevance += 2;
        }
        if (tech.summary.toLowerCase().includes(kwStr)) {
          relevance += 1;
        }
      }

      if (relevance >= minRelevance) {
        results.push({
          id: tech.id,
          type: 'writingtechnique',
          summary: tech.summary,
          details: tech.details,
          relevance,
        });
      }
    }

    return this.rankAndFilter(results);
  }

  /**
   * 综合查询
   */
  queryAll(context: EnhancedKnowledgeContext): KnowledgeResult[] {
    const results: KnowledgeResult[] = [];
    
    results.push(...this.queryPaceStrategies(context));
    results.push(...this.querySceneWritings(context));
    results.push(...this.queryBridgePatterns(context));
    results.push(...this.queryWritingTechniques(context));
    
    return this.rankAndFilter(results);
  }

  /**
   * 为章节生成上下文感知的提示词片段
   */
  generateContextPrompt(context: EnhancedKnowledgeContext): string {
    const results = this.queryAll({ ...context, limit: 10 });
    
    if (results.length === 0) {
      return '';
    }

    const sections: string[] = [];
    
    // 按类型分组
    const byType = this.groupByType(results);
    
    if (byType.pacestrategy && byType.pacestrategy.length > 0) {
      sections.push('【推荐节奏策略】');
      for (const r of byType.pacestrategy.slice(0, 3)) {
        sections.push(`- ${r.summary}`);
      }
    }
    
    if (byType.scenewriting && byType.scenewriting.length > 0) {
      sections.push('\n【推荐场景写法】');
      for (const r of byType.scenewriting.slice(0, 3)) {
        sections.push(`- ${r.summary}`);
      }
    }
    
    if (byType.bridgepattern && byType.bridgepattern.length > 0) {
      sections.push('\n【相关桥段套路】');
      for (const r of byType.bridgepattern.slice(0, 2)) {
        sections.push(`- ${r.summary}`);
      }
    }
    
    return sections.join('\n');
  }

  // ====== 辅助方法 ======

  private rankAndFilter(results: KnowledgeResult[], limit = 20): KnowledgeResult[] {
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private groupByType(results: KnowledgeResult[]): Record<string, KnowledgeResult[]> {
    const groups: Record<string, KnowledgeResult[]> = {};
    for (const r of results) {
      if (!groups[r.type]) {
        groups[r.type] = [];
      }
      groups[r.type].push(r);
    }
    return groups;
  }

  private getModeKeywords(mode: string): string[] {
    const modeMap: Record<string, string[]> = {
      'chapter_start': ['开篇', '黄金三章', '前300字', '前五章'],
      'chapter_middle': ['中段', '铺垫', '发展'],
      'chapter_end': ['章末钩子', '悬念结尾', '断章'],
      'climax': ['高潮', '爆发', '大高潮', '决战'],
      'transition': ['过渡', '转场', '衔接'],
    };
    return modeMap[mode] || [];
  }

  // ====== 内嵌数据：从 webnovel-writer 导入 ======

  private getPaceStrategies(): PaceStrategyRecord[] {
    return [
      {
        id: 'PA-001',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['压抑后爆发', '忍耐爆发', '先抑后扬', '全部'],
        summary: '先把压抑写具体且持续，再在不可退让点集中爆发',
        details: '压抑蓄力爆发的关键是限制持续累加，让读者和主角一起憋，再在一个不能再退的节点一次性兑现。压抑段要有真实损失和无法立刻反击的理由，爆发段则必须改写关系、局面或规则。',
        instruction: '先建立真实压抑，在不可退让点爆发',
        examples: ['主角被羞辱 → 隐忍积累 → 绝地反击'],
        paceType: '压抑蓄力爆发期',
        antiPatterns: ['前面没有真实压抑', '爆发只喊口号不改局面'],
      },
      {
        id: 'PA-002',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['微反转', '补刀', '假结束', '还有一手', '全部'],
        summary: '先给读者"已经结束"的错觉，再用新信息或更高层级结果完成补刀',
        details: '微反转补刀适合放在爽点兑现后半拍，用假结束制造松弛，再用更狠的一手把情绪再抬一格。这类节拍最怕提前透完牌，因此前段只兑现主目标，后段再揭开隐藏收益、额外代价或对方更惨的后果。',
        instruction: '先给假结束，再补刀抬升',
        examples: ['打败敌人 → 以为结束 → 背后还有更大的boss'],
        paceType: '微反转补刀期',
        antiPatterns: ['还没建立结束感就硬补刀', '补刀信息与前文无关'],
      },
      {
        id: 'PA-007',
        skills: ['plan', 'write'],
        category: '节奏',
        level: '知识补充',
        keywords: ['黄金三章', '开篇钩子', '情绪契约', '前300字', '全部'],
        summary: '前300字先立核心钩子和情绪承诺，再展示卖点与压迫',
        details: '黄金三章不是固定模板，而是尽快和读者签下情绪契约。第一章抓钩子和主角处境，第二章升压与展示差异点，第三章完成第一次小兑现并抛出更大悬念。',
        instruction: '开篇即签情绪契约，卖点尽快兑现',
        examples: ['第一章：主角困境 + 核心钩子', '第二章：升压 + 展示卖点', '第三章：小兑现 + 新悬念'],
        paceType: '黄金三章情绪契约',
        antiPatterns: ['开篇先讲设定史', '三章过去还没卖点'],
      },
      {
        id: 'PA-008',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['章末钩子', '悬念结尾', '断章', '追读钩子', '全部'],
        summary: '在动作、发现或身份揭露的临界点收住，并抛出新问题',
        details: '章末钩子要让读者带着新问题离开本章，而不是在总结句里把情绪放掉。发现型、危险型、揭露型都能用，但必须建立在本章已推进的基础上。',
        instruction: '在临界点断章，抛出新问题',
        examples: ['大战即将胜利 → 突然有人偷袭', '真相即将揭露 → 手机响了'],
        paceType: '章末钩子断点',
        antiPatterns: ['断在无关句子上', '只故弄玄虚不推进'],
      },
      {
        id: 'PA-019',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['段落情绪曲线', '章内起伏', '章内节奏', '段落功能', '全部'],
        summary: '一章内部至少安排一次明显上扬和一次回落，再在结尾挂钩',
        details: '章节内部的情绪曲线决定读者会不会觉得顺，哪怕事件很多，如果声调始终不变也会显得平。段落级别的开头引入、中段抬升、转折变调、结尾卡点，比宏观的大纲更直接影响阅读体感。',
        instruction: '章内要有情绪起伏',
        examples: ['开头平淡 → 中段抬升 → 小回落 → 结尾钩子'],
        paceType: '段落级情绪起伏',
        antiPatterns: ['整章都在同一情绪档位', '高潮太早后面拖平'],
      },
      {
        id: 'PA-021',
        skills: ['plan', 'write'],
        category: '节奏',
        level: '知识补充',
        keywords: ['爽压钩平衡', '章章三联', '章节追读', '连载节奏', '全部'],
        summary: '连续章节里保持爽点、压力和钩子的基础配比，别让连载忽冷忽热',
        details: '追读感稳定的连载，往往不是章章大高潮，而是章章都有回报、有压力、也有下一步诱饵。小爽点能续命，小压力能蓄势，小钩子能续读，三者比单靠大高潮更适合日更。',
        instruction: '保持爽点-压力-钩子的均衡',
        examples: ['小爽点续燃 + 小压力蓄火 + 结尾卡问题'],
        paceType: '章章爽压钩均衡期',
        antiPatterns: ['连续几章全是铺垫', '连续几章只剩无脑爽'],
      },
      {
        id: 'PA-037',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['假结束', '还有一手', '微反转补刀', '二次翻面', '全部'],
        summary: '先给一个足够像结局的落点，再在半拍停顿后翻第二次',
        details: '假结束再翻面期最有效的地方，在于读者刚松一口气，新的更高情绪就又压下来。主角刚赢、误会刚解、任务刚完成、反派刚认输，都是假结束的好节点。',
        instruction: '假结束后再翻面',
        examples: ['打败boss → 松一口气 → 更大的危机出现'],
        paceType: '假结束再翻面期',
        antiPatterns: ['假结束太假', '第二翻面凭空掉落'],
      },
      {
        id: 'PA-053',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['压扬循环', '压迫释放', '短循环', '爽点密度', '连载节奏', '全部'],
        summary: '连续几章里至少给一个清晰释放点，让压迫和回报形成可感知的小闭环',
        details: '长篇连载最稳的节奏，不是一直压或一直爽，而是不断完成小型压扬循环。压迫可以是误解、倒计时、资源短缺，释放可以是真相一角、阶段胜利、关系回暖。',
        instruction: '保持压-扬的短循环',
        examples: ['压迫1-2拍 → 给阶段释放 → 末尾挂新诱饵'],
        paceType: '压迫-释放短循环',
        antiPatterns: ['压太久不释放', '章章都爽失去梯度'],
      },
      {
        id: 'PA-054',
        skills: ['write', 'plan'],
        category: '节奏',
        level: '知识补充',
        keywords: ['质疑证明补刀', '三拍节奏', '打脸三段', '补刀反转', '都市', '玄幻', '悬疑', '现言'],
        summary: '把质疑、证明、补刀拆成三拍，不要一上来就直接宣布主角赢了',
        details: '很多打脸场的完成度，取决于最后那一拍补刀有没有把情绪真正抬满。先让对方轻视，再让主角稳稳证明，最后用额外信息、隐藏身份或反手收益完成第三拍。',
        instruction: '质疑-证明-补刀三拍节奏',
        examples: ['对手轻视 → 主角证明 → 补刀翻倍'],
        paceType: '质疑-证明-补刀三拍',
        antiPatterns: ['质疑太弱没有压迫', '证明过长拖掉爽感'],
      },
      {
        id: 'PA-061',
        skills: ['write', 'plan'],
        category: '爽点',
        level: '知识补充',
        keywords: ['铺垫兑现微反转', '三段式爽点', '爽点闭环', '还有一手', '全部'],
        summary: '爽点按铺垫、兑现、微反转三段走，先建立期待，再交付爆点，最后用一手补刀抬余味',
        details: '完整爽点不是单点爆炸，而是让读者先期待、再满足、再惊喜。铺垫段给信息差和反差，兑现段给动作或结果，微反转段给隐藏收益、对方更惨或情感升温。',
        instruction: '铺垫-兑现-微反转三段式',
        examples: ['建立期待 → 爽点兑现 → 额外收获'],
        paceType: '铺垫兑现微反转期',
        antiPatterns: ['没有铺垫直接爆', '兑现不改局面'],
      },
    ];
  }

  private getSceneWritings(): SceneWritingRecord[] {
    return [
      {
        id: 'SW-001',
        skills: ['write', 'plan'],
        category: '战斗',
        level: '知识补充',
        keywords: ['战斗描写', '打斗', '动作', '战斗场景'],
        summary: '按试探→对抗→转折→高潮推进战斗',
        details: '战斗场景应有清晰递进：先试探，再升级冲突，最后用关键转折拉出高潮。优先让动作、感官、局势变化交替推进。',
        patternName: '节奏递进式战斗',
        genre: ['玄幻', '仙侠', '都市', '奇幻'],
        example: '他侧身一闪，拳风擦着耳畔呼啸而过。脚下猛然发力，整个人如离弦之箭冲了出去——',
      },
      {
        id: 'SW-002',
        skills: ['write', 'plan'],
        category: '对话',
        level: '知识补充',
        keywords: ['对话声线', '对话描写', '人物对话', '声线区分'],
        summary: '先判断角色身份、关系和情绪，再分配词汇习惯、句长和潜台词',
        details: '多角色对话要靠词汇、句式长短、潜台词和情绪反应拉开声线差异，同一段对话里至少让核心角色在句式长短、礼貌程度、攻击方式或口头习惯上出现稳定区分。',
        patternName: '声线差异化',
        genre: ['全部'],
        example: '将军："老夫修行三百载，何曾怕过谁！"少年："切，又吹。"',
      },
      {
        id: 'SW-005',
        skills: ['write', 'plan'],
        category: '情感',
        level: '知识补充',
        keywords: ['重逢', '破镜重圆', '久别重逢', '前任相见'],
        summary: '表面克制、细节失控、身份反差要同时落地',
        details: '久别重逢场景的张力来自表面体面和身体细节失控的反差，以及过去与现在的对照。可以借公开场合、职业身份或第三人在场维持克制。',
        patternName: '克制式久别重逢',
        genre: ['现言', '古言', '幻言'],
        example: '她说好久不见时语气平稳，只有捏皱的登机牌暴露了那只手一直在抖。',
      },
      {
        id: 'SW-006',
        skills: ['write', 'plan'],
        category: '战斗',
        level: '知识补充',
        keywords: ['动作戏节奏', '五拍战斗', '动作场景', '战斗拍点'],
        summary: '按接战、失衡、逆转、高潮、余波五拍推进动作戏',
        details: '动作戏最稳的推进方式是五拍结构，让局势、速度和危险感持续变化。先接战建立空间关系，再制造短暂失衡和反压，随后用环境或判断完成逆转。',
        patternName: '五拍式动作推进',
        genre: ['玄幻', '仙侠', '奇幻', '都市'],
        example: '刀锋第一次撞上时还只是试探，等他脚下一滑被逼到屋檐边，整场战斗才真正开始转向。',
      },
      {
        id: 'SW-007',
        skills: ['write', 'plan'],
        category: '开篇',
        level: '知识补充',
        keywords: ['系统公告', '全球进化', '天音降临', '末世开篇'],
        summary: '宣告必须冷酷简短且不可抗拒，用集体异变和规则落地立刻改写世界',
        details: '系统天音降临式开篇要靠绝对权威感和全世界同步异常，在数句内完成旧世界终结。声音直接出现在脑海、天空变屏幕、规则即时生效。',
        patternName: '天音降临式系统宣告',
        genre: ['科幻', '衍生', '悬疑'],
        example: '欢迎来到地球2.0。那道声音不在天上，也不在耳边，而是像冰冷铁片一样直接压进每个人的视网膜。',
      },
      {
        id: 'SW-008',
        skills: ['write', 'plan'],
        category: '对话',
        level: '知识补充',
        keywords: ['潜台词对话', '话里有话', '错位对谈', '表面聊天暗地交锋'],
        summary: '表层聊A，实则在谈B，每句都让人物守住不能明说的东西',
        details: '潜台词错位式对谈的好看之处，是双方都在回答表面问题，却都在防另一个真正的问题。天气、旧事、礼数、关心都可以当壳。',
        patternName: '潜台词错位式对谈',
        genre: ['全部'],
        example: '他说今天雨大，她嗯了一声，视线却一直停在他袖口那道刚缝好的裂口上，像在问他昨晚到底去了哪。',
      },
      {
        id: 'SW-009',
        skills: ['write', 'plan'],
        category: '战斗',
        level: '知识补充',
        keywords: ['战斗开场', '多感官压迫', '交战前一秒', '战前氛围'],
        summary: '第一击前先把风压、金属声、血味和脚下触感都压上来，让身体先紧，再让动作炸开',
        details: '多感官压迫式战斗开场能让读者在第一刀落下前，就先听见、闻见、感到危险逼近。',
        patternName: '多感官压迫式战斗开场',
        genre: ['玄幻', '奇幻', '都市', '科幻'],
        example: '刀还没出鞘，风却先贴着皮肤刮了一层冷意，他甚至能听见对面那枚金属戒指轻轻磕在刀柄上的脆响。',
      },
      {
        id: 'SW-010',
        skills: ['write', 'plan'],
        category: '情感',
        level: '知识补充',
        keywords: ['察觉异样', '不逼问', '默契关心', '气氛不对'],
        summary: '真正懂对方的人未必会追问，而是先换话题、挡人、递水、留空间',
        details: '不逼问式默契察觉比直接问你怎么了更耐看，因为它让关系深度体现在理解分寸上。',
        patternName: '不逼问式默契察觉',
        genre: ['全部'],
        example: '她没问发生了什么，只把最吵的那几个人支去拿药，自己安静地在他手边放了一杯温水。',
      },
    ];
  }

  private getBridgePatterns(): BridgePatternRecord[] {
    return [
      {
        id: 'BP-001',
        name: '英雄救美',
        description: '危机 + 化解 + 关系质变',
        structure: {
          setup: '女主遭遇危机',
          conflict: '男主出手相救',
          resolution: '女主心动或关系升级',
        },
        emotions: ['心动', '感激', '依赖'],
        genre: ['玄幻', '都市', '现言', '古言'],
        variations: ['救美后被误解', '救美后被报复', '多次救美'],
      },
      {
        id: 'BP-002',
        name: '装逼打脸',
        description: '展示 + 震惊 + 收获',
        structure: {
          setup: '主角被轻视或挑衅',
          conflict: '主角展示实力震惊全场',
          resolution: '反派颜面尽失 + 主角获得收益',
        },
        emotions: ['爽快', '得意', '解气'],
        genre: ['玄幻', '都市', '修仙'],
        variations: ['言语打脸', '实力打脸', '身份打脸'],
      },
      {
        id: 'BP-003',
        name: '以小博大',
        description: '低成本 + 高风险 + 大收获',
        structure: {
          setup: '主角面临强敌或困境',
          conflict: '利用智慧或特殊能力以弱胜强',
          resolution: '战胜强敌获得丰厚回报',
        },
        emotions: ['紧张', '兴奋', '满足'],
        genre: ['玄幻', '仙侠', '都市'],
        variations: ['智取', '险胜', '逆转'],
      },
      {
        id: 'BP-004',
        name: '临危受命',
        description: '危机到来 + 配角无法解决 + 主角接手',
        structure: {
          setup: '团队或势力面临危机',
          conflict: '所有人尝试无果',
          resolution: '主角接手并成功解决',
        },
        emotions: ['紧张', '期待', '自豪'],
        genre: ['玄幻', '都市', '科幻'],
        variations: ['被动接手', '主动请缨', '被逼无奈'],
      },
      {
        id: 'BP-005',
        name: '歪打正着',
        description: '暗示重要性 + 错误方向努力 + 偶然获得',
        structure: {
          setup: '主角尝试做A事',
          conflict: '努力方向看似错误',
          resolution: '却因此获得了意想不到的B收获',
        },
        emotions: ['意外', '惊喜', '好笑'],
        genre: ['玄幻', '都市', '系统流'],
        variations: ['无心插柳', '误打误撞', '阴差阳错'],
      },
      {
        id: 'BP-006',
        name: '扮猪吃虎',
        description: '强者隐藏实力 + 被小觑 + 被逼出手 + 震惊全场',
        structure: {
          setup: '主角有实力但选择低调',
          conflict: '被轻视、嘲讽或挑衅',
          resolution: '被迫出手，一鸣惊人',
        },
        emotions: ['期待', '爽快感', '优越感'],
        genre: ['玄幻', '都市', '修仙'],
        variations: ['重生者隐藏', '传承者隐藏', '身份特殊隐藏'],
      },
      {
        id: 'BP-007',
        name: '退婚流',
        description: '被退婚/嫌弃 + 羞辱 + 逆袭打脸',
        structure: {
          setup: '曾经的天才/未婚妻退婚或嫌弃',
          conflict: '主角被羞辱，家族蒙羞',
          resolution: '主角逆袭，曾经看不起他的人后悔',
        },
        emotions: ['憋屈', '期待', '爽快'],
        genre: ['玄幻', '修仙', '都市'],
        variations: ['退婚', '退学', '被逐出师门'],
      },
      {
        id: 'BP-008',
        name: '打脸嘲讽',
        description: '嘲讽 + 轻视 + 主角反击 + 对方颜面尽失',
        structure: {
          setup: '有角色嘲讽或轻视主角',
          conflict: '主角隐忍或暗中准备',
          resolution: '主角展示实力或身份，打脸对方',
        },
        emotions: ['解气', '爽快', '优越'],
        genre: ['玄幻', '都市', '修仙'],
        variations: ['当场打脸', '事后打脸', '连续打脸'],
      },
      {
        id: 'BP-009',
        name: '误会冲突',
        description: '误解 + 矛盾 + 冲突升级 + 真相揭示',
        structure: {
          setup: '角色之间产生误会',
          conflict: '误会加深，矛盾激化',
          resolution: '真相大白，关系修复或决裂',
        },
        emotions: ['紧张', '揪心', '释然或心碎'],
        genre: ['现言', '古言', '幻言'],
        variations: ['被动误会', '主动制造误会', '连环误会'],
      },
      {
        id: 'BP-010',
        name: '身份反转',
        description: '隐藏身份 + 揭露 + 众人震惊',
        structure: {
          setup: '主角隐藏真实身份',
          conflict: '身份面临曝光风险',
          resolution: '身份揭露，众人震惊或后悔',
        },
        emotions: ['紧张', '期待', '震惊'],
        genre: ['玄幻', '都市', '现言'],
        variations: ['首富之子', '战神殿主', '神医传人'],
      },
    ];
  }

  private getWritingTechniques(): WritingTechniqueRecord[] {
    return [
      {
        id: 'WT-001',
        skills: ['write', 'plan'],
        category: '写作技法',
        level: '知识补充',
        keywords: ['三翻四震', '反转技巧', '情绪冲击'],
        summary: '通过反复铺垫和反转，制造强烈的情感冲击',
        details: '三翻四震：通过三次反转/翻盘，四个震撼点，让读者情绪不断被拉升。翻一在前期，翻二在中期，翻三在高潮；四震包括身份震、实力震、关系震、结局震。',
        applicableGenres: ['玄幻', '都市', '悬疑', '全部'],
        examples: ['翻一：看似要输，意外翻盘', '翻二：翻盘后遇更大危机', '翻三：最终决战，彻底碾压'],
      },
      {
        id: 'WT-002',
        skills: ['write'],
        category: '写作技法',
        level: '知识补充',
        keywords: ['情绪锚点', '情感峰值', '情绪设计'],
        summary: '在关键位置设置情绪锚点，让读者情绪有明确的峰值和回落',
        details: '情绪锚点理论：在每个重要情节点设置清晰的情绪高点，让读者有明确的"爽点"或"虐点"记忆。锚点之间要有情绪落差，形成波浪式情感曲线。',
        applicableGenres: ['全部'],
        examples: ['大战胜利 → 短暂温馨 → 更大危机', '误会解除 → 甜蜜时光 → 新的冲突'],
      },
      {
        id: 'WT-003',
        skills: ['write', 'plan'],
        category: '写作技法',
        level: '知识补充',
        keywords: ['反派嘲讽', '反派人设', '智谋反派'],
        summary: '反派嘲讽要有新意，不要只会"三十年河东三十年河西"',
        details: '反派嘲讽新思路：反派要有自己的逻辑和立场，不只是为了坏而坏。反派可以是傲慢的贵族、阴险的谋士、偏执的狂人，每个类型有不同的嘲讽方式。',
        applicableGenres: ['玄幻', '都市', '修仙', '全部'],
        examples: ['傲慢型：你的努力在我眼里不值一提', '阴险型：表面上称赞，背地里下绊子', '偏执型：你以为你能改变什么？'],
      },
      {
        id: 'WT-004',
        skills: ['write', 'plan'],
        category: '写作技法',
        level: '知识补充',
        keywords: ['人设拆解', '角色立体', '人物弧光'],
        summary: '让角色有清晰的定位、动机和成长弧线',
        details: '人设拆解法：每个重要角色都需要有清晰的身份定位（是谁）、行动动机（为什么）、性格特点（怎么做的）、成长弧线（怎么变的）。主角要有代入感，反派要有逻辑。',
        applicableGenres: ['全部'],
        examples: ['主角：废材逆袭型 → 初期被欺 → 获得机缘 → 逐步崛起 → 最终强者', '女主：追光者型 → 仰望男主 → 并肩作战 → 独立自主 → 对等关系'],
      },
      {
        id: 'WT-005',
        skills: ['write'],
        category: '写作技法',
        level: '知识补充',
        keywords: ['以小博大', '四要素', '核心梗'],
        summary: '以小博大的四要素：小人物、小目标、小风险、大回报',
        details: '核心梗驱动法：用一个核心梗贯穿全文，如"三年之约"、"废材逆袭"、"系统任务"等。核心梗要有明确的规则和限制，让读者知道主角在追求什么、风险是什么。',
        applicableGenres: ['玄幻', '都市', '修仙', '系统流'],
        examples: ['小人物：资质平庸的少年', '小目标：三年内超越未婚妻', '小风险：被逐出家族', '大回报：成为绝世强者'],
      },
      {
        id: 'WT-006',
        skills: ['write', 'plan'],
        category: '写作技法',
        level: '知识补充',
        keywords: ['爽点本质', '读者心理', '爽感来源'],
        summary: '爽点本质是读者的代入感和优越感的结合',
        details: '爽点本质：读者通过代入主角获得替代性的满足感。打脸爽是因为读者代入主角碾压了曾经欺负他的人；升级爽是因为读者代入主角变强的过程。爽点要提前铺垫，让读者有代入感。',
        applicableGenres: ['全部'],
        examples: ['打脸爽：铺垫对手的嚣张 → 主角碾压对手', '升级爽：铺垫升级的困难 → 主角突破成功', '装逼爽：铺垫旁人的轻视 → 主角展示实力'],
      },
    ];
  }
}

// ====== 导出 ======

export const enhancedKnowledgeQuery = new EnhancedKnowledgeQuery();

// 便捷函数
export async function queryWritingKnowledge(
  context: EnhancedKnowledgeContext
): Promise<KnowledgeResult[]> {
  await enhancedKnowledgeQuery.loadAll();
  return enhancedKnowledgeQuery.queryAll(context);
}

export async function generateKnowledgeContext(
  context: EnhancedKnowledgeContext
): Promise<string> {
  await enhancedKnowledgeQuery.loadAll();
  return enhancedKnowledgeQuery.generateContextPrompt(context);
}
