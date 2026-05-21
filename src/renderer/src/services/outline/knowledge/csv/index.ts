/**
 * Knowledge Base - CSV Loader
 * Loads and manages CSV-based knowledge for writing assistance
 */

import type {
  CoolPointRecord,
  SceneWritingRecord,
  GoldenFingerRecord,
  CharacterRecord,
  GenreRuleRecord,
  KnowledgeQueryContext,
  KnowledgeResult,
  PriorityLevel,
} from '../../types';
import { comparePriority } from '../../types';

/**
 * 知识项优先级
 */
export interface KnowledgeItemPriority {
  level: PriorityLevel;
  reason: string;
  tags: string[];
}

/**
 * CSV 行数据接口
 */
interface CSVRow {
  [key: string]: string;
}

/**
 * CSV 知识库加载器
 */
export class CSVKnowledgeBase {
  private coolPoints: CoolPointRecord[] = [];
  private sceneWritings: SceneWritingRecord[] = [];
  private goldenFingers: GoldenFingerRecord[] = [];
  private characters: CharacterRecord[] = [];
  private genreRules: Map<string, GenreRuleRecord> = new Map();
  
  private loaded = false;
  
  /**
   * 加载所有知识库
   */
  async loadAll(): Promise<void> {
    if (this.loaded) return;
    
    await Promise.all([
      this.loadCoolPoints(),
      this.loadSceneWritings(),
      this.loadGoldenFingers(),
      this.loadCharacters(),
      this.loadGenreRules(),
    ]);
    
    this.loaded = true;
  }
  
  /**
   * 解析 CSV 字符串
   */
  private parseCSV(csvString: string): CSVRow[] {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows: CSVRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row: CSVRow = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        rows.push(row);
      }
    }
    
    return rows;
  }
  
  /**
   * 解析单行 CSV（处理引号包裹的值）
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  }
  
  /**
   * 加载爽点与节奏数据
   */
  private async loadCoolPoints(): Promise<void> {
    // 这里使用内嵌数据，实际可以从外部文件加载
    const csvData = this.getCoolPointsCSV();
    const rows = this.parseCSV(csvData);
    
    this.coolPoints = rows.map((row, index) => ({
      id: row['编号'] || `CP-${index + 1}`,
      skills: (row['适用技能'] || '').split('|').map(s => s.trim()),
      category: row['分类'] || '',
      level: row['层级'] || '',
      keywords: (row['关键词'] || '').split('/').map(k => k.trim()),
      intent: row['意图与同义词'] || '',
      applicableGenres: (row['适用题材'] || '').split('/').map(g => g.trim()),
      instruction: row['大模型指令'] || '',
      summary: row['核心摘要'] || '',
      details: row['详细展开'] || '',
      paceType: row['节奏类型'] || '',
      emotionTechniques: (row['情绪调动手法'] || '').split('|').map(e => e.trim()),
      antiPatterns: (row['毒点'] || '').split('/').map(a => a.trim()),
    }));
  }
  
  /**
   * 加载场景写法数据
   */
  private async loadSceneWritings(): Promise<void> {
    const csvData = this.getSceneWritingsCSV();
    const rows = this.parseCSV(csvData);
    
    this.sceneWritings = rows.map((row, index) => ({
      id: row['编号'] || `SW-${index + 1}`,
      skills: (row['适用技能'] || '').split('|').map(s => s.trim()),
      category: row['分类'] || '',
      level: row['层级'] || '',
      keywords: (row['关键词'] || '').split('/').map(k => k.trim()),
      summary: row['核心摘要'] || '',
      details: row['详细展开'] || '',
      patternName: row['模式名称'] || '',
      example: row['示例'] || '',
    }));
  }
  
  /**
   * 加载金手指与设定数据
   */
  private async loadGoldenFingers(): Promise<void> {
    const csvData = this.getGoldenFingersCSV();
    const rows = this.parseCSV(csvData);
    
    this.goldenFingers = rows.map((row, index) => ({
      id: row['编号'] || `GF-${index + 1}`,
      skills: (row['适用技能'] || '').split('|').map(s => s.trim()),
      category: row['分类'] || '',
      level: row['层级'] || '',
      keywords: (row['关键词'] || '').split('/').map(k => k.trim()),
      summary: row['核心摘要'] || '',
      details: row['详细展开'] || '',
      type: row['类型'] || '',
      limitations: (row['限制'] || '').split('/').map(l => l.trim()),
      examples: (row['示例'] || '').split('\n').filter(e => e.trim()),
    }));
  }
  
  /**
   * 加载人设与关系数据
   */
  private async loadCharacters(): Promise<void> {
    const csvData = this.getCharactersCSV();
    const rows = this.parseCSV(csvData);
    
    this.characters = rows.map((row, index) => ({
      id: row['编号'] || `CH-${index + 1}`,
      skills: (row['适用技能'] || '').split('|').map(s => s.trim()),
      category: row['分类'] || '',
      level: row['层级'] || '',
      keywords: (row['关键词'] || '').split('/').map(k => k.trim()),
      summary: row['核心摘要'] || '',
      details: row['详细展开'] || '',
      archetypes: (row['原型'] || '').split('/').map(a => a.trim()),
      relationshipPatterns: (row['关系模式'] || '').split('/').map(r => r.trim()),
    }));
  }
  
  /**
   * 加载题材裁决规则数据
   */
  private async loadGenreRules(): Promise<void> {
    const csvData = this.getGenreRulesCSV();
    const rows = this.parseCSV(csvData);
    
    rows.forEach(row => {
      const genre = row['题材'] || '';
      this.genreRules.set(genre, {
        id: row['编号'] || '',
        genre,
        stylePriority: (row['风格优先级'] || '').split('>').map(s => s.trim()),
        coolPointPriority: (row['爽点优先级'] || '').split('>').map(s => s.trim()),
        defaultPaceStrategy: row['节奏默认策略'] || '',
        antiPatterns: (row['毒点权重'] || '').split('/').map(a => a.trim()),
        tabooWeight: this.parseTabooWeight(row['毒点权重'] || ''),
      });
    });
  }
  
  private parseTabooWeight(weightStr: string): Record<string, number> {
    // 解析毒点权重字符串
    const result: Record<string, number> = {};
    const pairs = weightStr.split('/');
    
    pairs.forEach(pair => {
      const [key, value] = pair.split(':');
      if (key && value) {
        result[key.trim()] = parseFloat(value.trim());
      }
    });
    
    return result;
  }
  
  /**
   * 获取爽点建议
   */
  getCoolPointSuggestions(
    genre?: string,
    context?: 'chapter_start' | 'chapter_middle' | 'chapter_end'
  ): CoolPointRecord[] {
    let results = this.coolPoints;

    if (genre) {
      results = results.filter(cp =>
        cp.applicableGenres.some(g => g.includes(genre) || genre.includes(g))
      );
    }

    return results.slice(0, 10);
  }

  /**
   * 获取爽点建议（带优先级）
   */
  getCoolPointSuggestionsWithPriority(
    genre?: string,
    context?: 'chapter_start' | 'chapter_middle' | 'chapter_end',
    options?: {
      minPriority?: PriorityLevel;
      sortBy?: 'relevance' | 'priority' | 'name';
      limit?: number;
    }
  ): Array<CoolPointRecord & { _priority: KnowledgeItemPriority }> {
    let results = this.coolPoints;

    if (genre) {
      results = results.filter(cp =>
        cp.applicableGenres.some(g => g.includes(genre) || genre.includes(g))
      );
    }

    // 添加优先级
    const withPriority = results.map(cp => ({
      ...cp,
      _priority: this.calculateCoolPointPriority(cp, genre, context),
    }));

    // 过滤最小优先级
    if (options?.minPriority) {
      const filtered = withPriority.filter(cp => {
        const priorityWeight = { critical: 100, high: 75, medium: 50, low: 25 };
        const minWeight = priorityWeight[options.minPriority!];
        const cpWeight = priorityWeight[cp._priority.level];
        return cpWeight >= minWeight;
      });
      return this.sortResults(filtered, options.sortBy || 'priority', options.limit);
    }

    return this.sortResults(withPriority, options?.sortBy || 'priority', options?.limit);
  }

  /**
   * 计算爽点优先级
   */
  private calculateCoolPointPriority(
    coolPoint: CoolPointRecord,
    genre?: string,
    context?: string
  ): KnowledgeItemPriority {
    let level: PriorityLevel = 'medium';
    const tags: string[] = [];
    let reason = '';

    // 基于层级计算优先级
    if (coolPoint.level === '大爽点') {
      level = 'critical';
      tags.push('大爽点');
    } else if (coolPoint.level === '小爽点') {
      level = 'high';
      tags.push('小爽点');
    } else if (coolPoint.level === '微爽点') {
      level = 'low';
      tags.push('微爽点');
    }

    // 基于节奏类型
    if (coolPoint.paceType === '压抑蓄力爆发期') {
      level = level === 'low' ? 'medium' : level;
      tags.push('核心节奏');
    }

    // 基于题材匹配
    if (genre && coolPoint.applicableGenres.includes(genre)) {
      tags.push('题材匹配');
    }

    // 基于上下文
    if (context === 'chapter_end' && coolPoint.paceType === '爆发式') {
      level = level === 'low' ? 'medium' : level;
      tags.push('适合章节结尾');
    }

    if (context === 'chapter_start' && coolPoint.paceType === '渐进式') {
      tags.push('适合章节开头');
    }

    reason = tags.length > 0 ? `基于: ${tags.join(', ')}` : '默认优先级';

    return { level, reason, tags };
  }

  /**
   * 排序结果
   */
  private sortResults<T extends { _priority: KnowledgeItemPriority }>(
    results: T[],
    sortBy: 'relevance' | 'priority' | 'name',
    limit?: number
  ): T[] {
    let sorted = [...results];

    switch (sortBy) {
      case 'priority':
        sorted.sort((a, b) =>
          comparePriority(a._priority.level, b._priority.level)
        );
        break;
      case 'name':
        sorted.sort((a, b) => {
          const nameA = (a as any).name || (a as any).summary || '';
          const nameB = (b as any).name || (b as any).summary || '';
          return nameA.localeCompare(nameB);
        });
        break;
      case 'relevance':
      default:
        // 优先级优先，然后按名称
        sorted.sort((a, b) => {
          const priorityCompare = comparePriority(a._priority.level, b._priority.level);
          if (priorityCompare !== 0) return priorityCompare;
          return 0;
        });
    }

    if (limit) {
      sorted = sorted.slice(0, limit);
    }

    return sorted;
  }
  
  /**
   * 获取场景写法
   */
  getSceneWriting(category: string): SceneWritingRecord[] {
    return this.sceneWritings.filter(sw => 
      sw.category.toLowerCase().includes(category.toLowerCase())
    );
  }
  
  /**
   * 获取题材裁决规则
   */
  getGenreRules(genre: string): GenreRuleRecord | undefined {
    return this.genreRules.get(genre);
  }

  /**
   * 获取题材裁决规则（带优先级）
   */
  getGenreRulesWithPriority(
    genre: string
  ): (GenreRuleRecord & { _priority: KnowledgeItemPriority }) | undefined {
    const rules = this.genreRules.get(genre);
    if (!rules) return undefined;

    return {
      ...rules,
      _priority: this.calculateGenreRulePriority(rules),
    };
  }

  /**
   * 计算题材规则优先级
   */
  private calculateGenreRulePriority(rules: GenreRuleRecord): KnowledgeItemPriority {
    const tags: string[] = [];
    let level: PriorityLevel = 'medium';

    // 基于爽点优先级数量
    if (rules.coolPointPriority && rules.coolPointPriority.length >= 5) {
      level = 'high';
      tags.push('爽点丰富');
    }

    // 基于风格优先级
    if (rules.stylePriority && rules.stylePriority.length >= 4) {
      tags.push('风格明确');
    }

    // 基于毒点权重
    if (rules.antiPatterns && rules.antiPatterns.length >= 3) {
      tags.push('毒点清晰');
    }

    return {
      level,
      reason: tags.length > 0 ? `基于: ${tags.join(', ')}` : '默认优先级',
      tags,
    };
  }

  /**
   * 查询相关知识（带优先级）
   */
  queryRelevantKnowledgeWithPriority(
    context: KnowledgeQueryContext,
    options?: {
      minPriority?: PriorityLevel;
      sortBy?: 'relevance' | 'priority' | 'type';
      limit?: number;
    }
  ): Array<KnowledgeResult & { _priority: KnowledgeItemPriority }> {
    const results: Array<KnowledgeResult & { _priority: KnowledgeItemPriority }> = [];

    // 搜索爽点
    if (context.emotion || context.keywords) {
      const coolPointResults = this.searchCoolPoints(context);
      for (const cp of coolPointResults) {
        results.push({
          ...cp,
          _priority: this.calculateCoolPointResultPriority(cp),
        });
      }
    }

    // 搜索场景写法
    if (context.sceneType) {
      const sceneResults = this.searchSceneWritings(context);
      for (const sw of sceneResults) {
        results.push({
          ...sw,
          _priority: this.calculateSceneWritingPriority(sw),
        });
      }
    }

    // 搜索金手指
    if (context.keywords) {
      const goldenFingerResults = this.searchGoldenFingers(context);
      for (const gf of goldenFingerResults) {
        results.push({
          ...gf,
          _priority: this.calculateGoldenFingerPriority(gf),
        });
      }
    }

    // 过滤最小优先级
    if (options?.minPriority) {
      const filtered = results.filter(r => {
        const priorityWeight = { critical: 100, high: 75, medium: 50, low: 25 };
        const minWeight = priorityWeight[options.minPriority!];
        const rWeight = priorityWeight[r._priority.level];
        return rWeight >= minWeight;
      });
      return this.sortKnowledgeResults(filtered, options.sortBy || 'priority', options.limit);
    }

    return this.sortKnowledgeResults(results, options?.sortBy || 'priority', options.limit);
  }

  /**
   * 计算爽点结果优先级
   */
  private calculateCoolPointResultPriority(result: KnowledgeResult): KnowledgeItemPriority {
    const tags: string[] = [];
    let level: PriorityLevel = 'medium';

    // 基于相关性
    if (result.relevance >= 5) {
      level = 'high';
      tags.push('高相关');
    } else if (result.relevance >= 3) {
      level = 'medium';
      tags.push('中相关');
    } else {
      level = 'low';
      tags.push('低相关');
    }

    return {
      level,
      reason: tags.length > 0 ? `基于: ${tags.join(', ')}` : '默认优先级',
      tags,
    };
  }

  /**
   * 计算场景写法优先级
   */
  private calculateSceneWritingPriority(result: KnowledgeResult): KnowledgeItemPriority {
    const tags: string[] = [];
    let level: PriorityLevel = 'low';

    if (result.relevance >= 5) {
      level = 'high';
      tags.push('场景匹配');
    } else if (result.relevance >= 3) {
      level = 'medium';
      tags.push('部分匹配');
    }

    return {
      level,
      reason: tags.length > 0 ? `基于: ${tags.join(', ')}` : '默认优先级',
      tags,
    };
  }

  /**
   * 计算金手指优先级
   */
  private calculateGoldenFingerPriority(result: KnowledgeResult): KnowledgeItemPriority {
    const tags: string[] = [];
    let level: PriorityLevel = 'medium';

    if (result.relevance >= 5) {
      level = 'critical';
      tags.push('金手指匹配');
    } else if (result.relevance >= 3) {
      level = 'high';
      tags.push('部分匹配');
    }

    return {
      level,
      reason: tags.length > 0 ? `基于: ${tags.join(', ')}` : '默认优先级',
      tags,
    };
  }

  /**
   * 排序知识结果
   */
  private sortKnowledgeResults<T extends { _priority: KnowledgeItemPriority }>(
    results: T[],
    sortBy: 'relevance' | 'priority' | 'type',
    limit?: number
  ): T[] {
    let sorted = [...results];

    switch (sortBy) {
      case 'priority':
        sorted.sort((a, b) =>
          comparePriority(a._priority.level, b._priority.level)
        );
        break;
      case 'type':
        sorted.sort((a, b) => {
          const typeA = (a as any).type || '';
          const typeB = (b as any).type || '';
          return typeA.localeCompare(typeB);
        });
        break;
      case 'relevance':
      default:
        sorted.sort((a, b) => {
          const rA = (a as any).relevance || 0;
          const rB = (b as any).relevance || 0;
          return rB - rA;
        });
    }

    if (limit) {
      sorted = sorted.slice(0, limit);
    }

    return sorted;
  }
  
  /**
   * 查询相关知识
   */
  queryRelevantKnowledge(context: KnowledgeQueryContext): KnowledgeResult[] {
    const results: KnowledgeResult[] = [];
    
    // 搜索爽点
    if (context.emotion || context.keywords) {
      const coolPointResults = this.searchCoolPoints(context);
      results.push(...coolPointResults);
    }
    
    // 搜索场景写法
    if (context.sceneType) {
      const sceneResults = this.searchSceneWritings(context);
      results.push(...sceneResults);
    }
    
    // 搜索金手指
    if (context.keywords) {
      const goldenFingerResults = this.searchGoldenFingers(context);
      results.push(...goldenFingerResults);
    }
    
    // 按相关性排序
    return this.rankByRelevance(results, context);
  }
  
  private searchCoolPoints(context: KnowledgeQueryContext): KnowledgeResult[] {
    const results: KnowledgeResult[] = [];
    
    for (const cp of this.coolPoints) {
      let relevance = 0;
      
      // 题材匹配
      if (context.genre && cp.applicableGenres.some(g => g.includes(context.genre!))) {
        relevance += 3;
      }
      
      // 关键词匹配
      if (context.keywords) {
        const keywords = context.keywords.join(' ').toLowerCase();
        if (cp.summary.toLowerCase().includes(keywords)) relevance += 2;
        if (cp.keywords.some(k => keywords.includes(k.toLowerCase()))) relevance += 2;
      }
      
      if (relevance > 0) {
        results.push({
          id: cp.id,
          type: 'coolpoint',
          summary: cp.summary,
          details: cp.details,
          relevance,
        });
      }
    }
    
    return results;
  }
  
  private searchSceneWritings(context: KnowledgeQueryContext): KnowledgeResult[] {
    const results: KnowledgeResult[] = [];
    
    for (const sw of this.sceneWritings) {
      let relevance = 0;
      
      if (context.sceneType && sw.category.includes(context.sceneType)) {
        relevance += 5;
      }
      
      if (context.keywords) {
        const keywords = context.keywords.join(' ').toLowerCase();
        if (sw.summary.toLowerCase().includes(keywords)) relevance += 2;
      }
      
      if (relevance > 0) {
        results.push({
          id: sw.id,
          type: 'scenewriting',
          summary: sw.summary,
          details: sw.details,
          relevance,
        });
      }
    }
    
    return results;
  }
  
  private searchGoldenFingers(context: KnowledgeQueryContext): KnowledgeResult[] {
    const results: KnowledgeResult[] = [];
    
    for (const gf of this.goldenFingers) {
      let relevance = 0;
      
      if (context.keywords) {
        const keywords = context.keywords.join(' ').toLowerCase();
        if (gf.summary.toLowerCase().includes(keywords)) relevance += 3;
        if (gf.keywords.some(k => keywords.includes(k.toLowerCase()))) relevance += 2;
      }
      
      if (relevance > 0) {
        results.push({
          id: gf.id,
          type: 'goldenfinger',
          summary: gf.summary,
          details: gf.details,
          relevance,
        });
      }
    }
    
    return results;
  }
  
  private rankByRelevance(results: KnowledgeResult[], context: KnowledgeQueryContext): KnowledgeResult[] {
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20);
  }
  
  /**
   * 获取所有数据（调试用）
   */
  getAllData() {
    return {
      coolPoints: this.coolPoints,
      sceneWritings: this.sceneWritings,
      goldenFingers: this.goldenFingers,
      characters: this.characters,
      genreRules: Array.from(this.genreRules.entries()),
    };
  }
  
  // ====== 内嵌 CSV 数据 ======
  
  private getCoolPointsCSV(): string {
    return `编号,适用技能,分类,层级,关键词,意图与同义词,适用题材,大模型指令,核心摘要,详细展开,节奏类型,情绪调动手法,毒点
CP-001,write|plan,节奏,知识补充,压抑后爆发,忍耐爆发,先抑后扬,玄幻/都市/言情,先把压抑写具体且持续，再在不可退让点集中爆发,节奏递进式，先写压力积累，结尾爆发,压抑蓄力爆发期,限制累加|沉默停顿|单点引爆,前面没有真实压抑|爆发只喊口号不改局面
CP-002,write|plan,节奏,知识补充,装逼打脸,反转打脸,主角展示碾压实力让对方颜面尽失,通用,设置被打压场景→展示实力→制造落差→众人震惊,反转要干脆利落，不要拖沓,反转式,对比反差|情绪反转|旁观者反应,铺垫不够|打脸不够狠|配角反应太假
CP-003,write|plan,节奏,知识补充,信息差爽,认知优势,利用信息差制造爽感，主角知道别人不知道,通用,读者知道的比角色多，制造信息差和信息优势,信息揭示要控制节奏,信息差式,悬念建立|信息揭示|认知优势,信息揭示太早|读者疲劳
CP-004,write|plan,节奏,知识补充,成长展示,升级快感,主角实力或地位提升时的满足感,玄幻/仙侠,描写突破瞬间的体验，强调与过去的对比,升级要有仪式感,升级式,境界突破|对比过去|收获盘点,升级太快|境界描述混乱
CP-005,write|plan,节奏,知识补充,感情升温,甜蜜时刻,感情线推进时的甜蜜和心动,言情/都市,暧昧互动→小冲突→和好→感情升温,情感节奏要细腻,渐进式,互动增加|小冲突|和好|心动,进展太快|太甜无味
CP-006,write|plan,节奏,知识补充,绝地翻盘,逆转胜利,绝境中反杀，有强烈的对比和逆转感,通用,先写绝境，再写转机，最后反杀,反转要合理且出人意料,逆转式,绝境描写|转机出现|反杀成功,反转太突兀|逻辑不通
CP-007,write|plan,节奏,知识补充,复仇快感,快意恩仇,报仇雪恨时的痛快和满足,通用,仇恨铺垫→努力准备→最终对决→仇人下场,仇恨要真实，复仇要干脆,复仇式,仇恨建立|准备阶段|最终对决|仇人下场,复仇太容易|仇恨不够深
CP-008,write|plan,节奏,知识补充,意外收获,天降馅饼,意外获得宝物/机缘/美人等,玄幻/都市,设计意外场景，让主角获得意外收获,收获要有铺垫，不能太突兀,收获式,意外场景|收获描写|众人反应,收获太容易|没有代价
CP-009,write|plan,节奏,知识补充,揭露真相,恍然大悟,隐藏的秘密被揭露时的震撼,悬疑/玄幻,设置悬念→逐步铺垫→真相揭露,揭露要有冲击力,揭露式,悬念铺垫|线索积累|真相揭露,揭露太早|没有铺垫
CP-010,write|plan,节奏,知识补充,身份反转,身份逆转,某人身份揭露时的震撼和意外,通用,身份铺垫→身份揭露→众人反应,身份反转要合理且出人意料,反转式,身份铺垫|反转揭露|震惊反应,反转太突兀|铺垫不足
CP-011,write|plan,节奏,知识补充,生死危机,紧张刺激,生死关头的紧张感和危机感,通用,设置危机→主角应对→惊险过关,危机要真实，应对要精彩,危机式,危机升级|应对过程|惊险过关,危机太容易解决|没有紧张感
CP-012,write|plan,节奏,知识补充,认主归宗,归属认同,被认可、被接纳时的满足感,通用,展示能力→获得认可→建立归属,认可要有分量,认主式,能力展示|认可获得|归属建立,认可太容易|没有分量`;
  }
  
  private getSceneWritingsCSV(): string {
    return `编号,适用技能,分类,层级,关键词,核心摘要,详细展开,模式名称,示例
SW-001,write|plan,战斗,知识补充,战斗描写,按试探→对抗→转折→高潮推进战斗,优先让动作、感官、局势变化交替推进,节奏递进式,"他侧身一闪，拳风擦着耳畔呼啸而过。脚下猛然发力，整个人如离弦之箭般冲出。"
SW-002,write|plan,战斗,知识补充,战斗,展示战斗双方的策略和智商,让智谋成为战斗的关键而不是蛮力,智谋博弈式,"看似是强攻，实则在引蛇出洞。果然，对方中计暴露了破绽。"
SW-003,write|plan,对话,知识补充,对话,对话要推进剧情或揭示性格,对话不仅是信息传递，还要有潜台词和情绪,潜台词式,""你来晚了。"他没有解释，只是看着窗外。（潜台词：他一直在等）
SW-004,write|plan,对话,知识补充,对话,让人物说人话，符合性格和身份,不同角色说话方式要不同，不能千人一面,角色差异式,"将军下令撤退！"vs"撤！快撤！"vs"留得青山在..."
SW-005,write|plan,情感,知识补充,心动,让读者感受到心动和甜蜜,细节描写比直接描写更有效,细节暗示式,"他递过伞的时候，指尖不小心碰到了她的手。那一刻，她的心跳漏了一拍。"
SW-006,write|plan,情感,知识补充,悲伤,让读者感受到悲伤和心痛,用细节和环境来渲染情绪，不要直白,间接渲染式,"她笑着送他出门。关上门的那一刻，她靠着门板滑坐在地上，眼泪终于涌了出来。"
SW-007,write|plan,心理,知识补充,内心,展示角色的内心挣扎和成长,让内心变化有迹可循，不是突然顿悟,渐进变化式,"他握紧拳头。（第一次：犹豫）他深吸一口气。（第二次：下定决心）他踏出了那一步。（第三次：行动）"
SW-008,write|plan,开篇,知识补充,开篇,用开篇抓住读者,不要从环境描写开始，不要从背景介绍开始,in-media-res式,"门被踹开的瞬间，他已经动了。（直接进入动作）
SW-009,write|plan,场景,知识补充,环境,用环境来渲染氛围,环境描写要服务于情绪和剧情，不要堆砌,情绪服务式,"雨下得很大。每个人都低着头，脚步匆匆。没有人注意到角落里那个蜷缩的身影。"
SW-010,write|plan,场景,知识补充,氛围,营造紧张或恐怖的氛围,让读者感同身受,感官叠加式,"走廊里静得可怕。只有他们的脚步声在回荡，每一步都像是踩在心脏上。墙上的影子在晃动，像是有什么东西在跟着他们。"
SW-011,write|plan,节奏,知识补充,悬念,让读者想继续看下去,在章节结尾设置悬念，让读者翻页,悬念式,"就在这时，他的手机响了。来电显示是一个他以为再也不会看到的号码。"
SW-012,write|plan,节奏,知识补充,节奏,控制节奏，让情节有起伏,快节奏和慢节奏交替，不能一直紧张也不能一直平淡,张弛有度式,"战斗结束后，他瘫坐在地上。月光洒下来，他突然想起了很多年前的这个夜晚，也是这样的月光。`;
  }
  
  private getGoldenFingersCSV(): string {
    return `编号,适用技能,分类,层级,关键词,核心摘要,详细展开,类型,限制,示例
GF-001,init|plan|write,设定,知识补充,力量体系,每个大层级都要有可感知的质变,境界要有明确的差异感，不能只是数字变化,阶梯式,战力边界,练气→筑基有质变，筑基→金丹又有质变
GF-002,init|plan|write,设定,知识补充,力量体系,战力基准和突破门槛要明确,主角越级挑战要有代价和逻辑,越级挑战式,代价机制,能越一级是因为努力和机遇，越两级是天才，越三级是有特殊机缘
GF-003,init|plan|write,设定,知识补充,系统流,系统要有独特玩法，不是简单的任务奖励,任务难度和奖励要平衡，系统可以有自己的"性格",任务系统式,任务限制,完成任务获得奖励，但任务不是简单的刷怪
GF-004,init|plan|write,设定,知识补充,系统流,系统是辅助，金手指的真正价值在于主角的运用,系统给的是工具，如何使用看主角,工具强化式,使用限制,系统给技能书，但技能要靠主角练习和实战打磨
GF-005,init|plan|write,设定,知识补充,重生,重生者最大的优势是预知未来和信息差,重生前的遗憾和遗憾带来的动机要设计好,信息差式,信息时效,重生者知道未来，但未来会因他的行动而改变
GF-006,init|plan|write,设定,知识补充,重生,重生者的痛苦和挣扎要真实,重生不是为了弥补遗憾而是要有新的人生,成长驱动式,心理代价,重生者的心理负担：知道所有人的结局，却无法说出
GF-007,init|plan|write,设定,知识补充,传承,传承要有独特性和稀缺性,传承者不只是一个工具，还有精神和意志,精神传承式,继承条件,得到传承不只是得到力量，还有前人的意志和使命
GF-008,init|plan|write,设定,知识补充,传承,传承要有代价和考验,不是随便就能得到，要经历考验,考验获取式,获取难度,传承需要经历生死考验，而且考验不只是实力还有心性
GF-009,init|plan|write,设定,知识补充,发现,发现类金手指要有探索的乐趣,宝物不是直接给，要有发现和争夺的过程,探索发现式,发现条件,秘境探索要设计重重机关和谜题，获得宝物要付出代价
GF-010,init|plan|write,设定,知识补充,发现,发现要有惊喜感和获得感,宝物到手的那一刻要让读者也跟着爽,收获惊喜式,归属竞争,发现了宝物，但宝物还有争夺者，需要智取或力夺
GF-011,init|plan|write,设定,知识补充,异能,异能要有明确的规则和限制,能力不是无敌的，要有限制才能有戏剧性,规则限制式,能力限制,异能每天只能用三次，或者有副作用
GF-012,init|plan|write,设定,知识补充,异能,异能可以成长但成长要有代价,能力的成长需要付出，不能不劳而获,成长代价式,成长代价,异能的成长需要消耗生命力或其他重要资源`;
  }
  
  private getCharactersCSV(): string {
    return `编号,适用技能,分类,层级,关键词,核心摘要,详细展开,原型,关系模式
CH-001,init|plan,人设,知识补充,主角,主角要有能让读者代入的特质,读者的代入感来自于主角的困境和选择,奋斗者,师徒/兄弟/竞争
CH-002,init|plan,人设,知识补充,主角,主角要有明确的目标和动机,目标驱动剧情，动机提供合理性,追梦者,亦敌亦友/红颜知己
CH-003,init|plan,人设,知识补充,主角,主角要有成长空间,但成长要可信，不能一步登天,成长型,导师/伙伴/劲敌
CH-004,init|plan,人设,知识补充,反派,反派要有自己的逻辑和立场,反派不是为了坏而坏，有自己的动机,野心家,对手/合作/利用
CH-005,init|plan,人设,知识补充,反派,反派的实力要接近主角,反派太弱没有威胁感，太强会显得主角开挂,阴谋家,亦敌亦师/利益交换
CH-006,init|plan,人设,知识补充,导师,导师要推动主角成长,导师的帮助要恰到好处，不能包办代替,引路人,师徒/传道授业
CH-007,init|plan,人设,知识补充,导师,导师也可以有自己的困境,导师不是万能的，也有自己的问题,困顿者,忘年交/同病相怜
CH-008,init|plan,人设,知识补充,女主,女主要有自己的魅力和故事,女主要立体，不是附属品或工具人,追光者,红颜知己/并肩作战
CH-009,init|plan,人设,知识补充,女主,女主和男主要有化学反应,感情线要有张力和发展空间,对等者,欢喜冤家/势均力敌
CH-010,init|plan,人设,知识补充,配角,配角要有自己的闪光点,配角不是工具人，也有自己的故事,追梦人,旁观者/见证者/辅助
CH-011,init|plan,人设,知识补充,配角,配角的命运可以映照主角,配角的选择和结局可以对比主角,对照者,镜像/对比/选择
CH-012,init|plan,人设,知识补充,团队,团队成员要有差异化和互补性,每个成员要有自己擅长的领域,追梦人,各司其职/互补长短`;
  }
  
  private getGenreRulesCSV(): string {
    return `编号,题材,风格优先级,爽点优先级,节奏默认策略,毒点权重
RS-001,通用,热血冲突>冷硬算计>超然物外>轻松幽默,升级爽>打脸>感情甜>真相揭示>团队归属,慢蓄快爆,节奏拖沓/金手指无代价/配角弱智
RS-002,玄幻/仙侠,冷硬算计>超然物外>热血冲突,境界碾压>底牌揭晓>因果兑现>秘宝获得>仇人跪地,慢蓄快爆,修炼水字数/战斗太简单/境界混乱
RS-003,都市/异能,现实质感>轻喜互动>热血冲突,打脸嘲讽>异能展示>关系推进>身份揭露>规则反用,情感铺垫密集,太脱离现实/金手指无代价/感情线突兀
RS-004,古言/宫斗,权谋算计>古典韵味>情感细腻,身份逆袭>权力争斗>真相大白>感情纠葛,慢热递进,节奏太慢/宫斗太幼稚/感情太狗血
RS-005,现言/甜宠,轻松甜蜜>现实质感>轻喜互动,关系推进>甜蜜互动>身份揭晓>误会解除>误会产生,小甜大虐式,太甜无味/太虐心累/节奏单一
RS-006,悬疑/推理,高压克制>信息控制>冷硬推理,真相揭示>规则反用>误导反转>身份逆转>危机脱困,慢给线索,线索太明显/反转太突兀/逻辑不通
RS-007,规则/怪谈,压抑惊悚>规则博弈>人性探索,规则反用>真相揭示>绝境求生>身份危机>世界观扩展,压抑递进,规则太简单/恐怖太弱/逻辑混乱
RS-008,游戏/电竞,热血竞技>轻松幽默>策略博弈,逆风翻盘>实力认证>团队配合>对手对决>荣誉获得,快节奏爆发,游戏描写太水/对手太弱/成长太快
RS-009,末世/求生,压抑求生>热血希望>残酷现实,绝境逆袭>资源争夺>基地建立>人性揭示>希望曙光,压抑后爆发,绝望太重/希望太早/战斗太简单
RS-010,历史/穿越,历史韵味>权谋博弈>穿越逆袭,身份逆袭>历史改写>权谋争斗>感情纠葛>文明推动,慢热递进,历史错误/穿越太万能/节奏太慢`;
  }
}

// 导出单例
export const csvKnowledgeBase = new CSVKnowledgeBase();
