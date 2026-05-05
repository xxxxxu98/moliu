/**
 * 六维审查服务
 * 参考 webnovel-writer 的 Reviewer Agent 设计
 * 
 * 六维审查：
 * 1. 设定一致性（setting）
 * 2. 时间线（timeline）
 * 3. 叙事连贯（continuity）
 * 4. 角色一致性（character）
 * 5. 逻辑（logic）
 * 6. AI味（ai_flavor）
 */

import type {
  ReviewIssue,
  ReviewSeverity,
  ReviewCategory,
  SixDimensionReview,
  ReviewResult
} from '@/types/writing-task';
import type { Project, Chapter, Character, WorldSchema, ChapterMemory } from '@/types/project';
import { DeAIService } from '@/services/writing/de-ai-service';
import { ContextManager } from '@/services/writing/context-manager';

export interface ReviewContext {
  project: Project;
  chapter: Chapter;
  chapterIndex: number;
  previousChapter?: Chapter;
  previousSummary?: string;
}

export interface ReviewOptions {
  /** 是否检查设定一致性 */
  checkSetting?: boolean;
  /** 是否检查时间线 */
  checkTimeline?: boolean;
  /** 是否检查叙事连贯 */
  checkContinuity?: boolean;
  /** 是否检查角色一致性 */
  checkCharacter?: boolean;
  /** 是否检查逻辑 */
  checkLogic?: boolean;
  /** 是否检查AI味 */
  checkAIFlavor?: boolean;
  /** 是否启用严格模式 */
  strictMode?: boolean;
}

/**
 * 六维审查服务
 */
export class ReviewService {
  private context: ReviewContext;
  private options: ReviewOptions;
  private contextManager: ContextManager;

  constructor(context: ReviewContext, options: ReviewOptions = {}) {
    this.context = context;
    this.options = {
      checkSetting: true,
      checkTimeline: true,
      checkContinuity: true,
      checkCharacter: true,
      checkLogic: true,
      checkAIFlavor: true,
      strictMode: false,
      ...options
    };
    this.contextManager = new ContextManager();
  }

  /**
   * 执行六维审查
   */
  async review(): Promise<SixDimensionReview> {
    const content = this.context.chapter.content;
    const issues: ReviewIssue[] = [];

    // 1. 设定一致性检查
    if (this.options.checkSetting) {
      const settingIssues = await this.checkSettingConsistency(content);
      issues.push(...settingIssues);
    }

    // 2. 时间线检查
    if (this.options.checkTimeline) {
      const timelineIssues = await this.checkTimeline(content);
      issues.push(...timelineIssues);
    }

    // 3. 叙事连贯检查
    if (this.options.checkContinuity) {
      const continuityIssues = await this.checkContinuity(content);
      issues.push(...continuityIssues);
    }

    // 4. 角色一致性检查
    if (this.options.checkCharacter) {
      const characterIssues = await this.checkCharacterConsistency(content);
      issues.push(...characterIssues);
    }

    // 5. 逻辑检查
    if (this.options.checkLogic) {
      const logicIssues = await this.checkLogic(content);
      issues.push(...logicIssues);
    }

    // 6. AI味检查
    if (this.options.checkAIFlavor) {
      const aiFlavorIssues = await this.checkAIFlavor(content);
      issues.push(...aiFlavorIssues);
    }

    // 汇总结果
    return this.buildReviewResult(issues);
  }

  /**
   * 设定一致性检查
   * 检查角色能力、地点描述、物品/货币使用是否符合已建立规则
   */
  private async checkSettingConsistency(content: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    const { project } = this.context;
    const lines = content.split('\n');

    // 1. 检查角色能力是否与境界匹配
    const characters = project.characters || [];
    for (const char of characters) {
      // 检查是否出现"越级"战斗但无合理解释
      const powerKeywords = ['击败', '战胜', '打败', '压制', '碾压'];
      for (const keyword of powerKeywords) {
        if (content.includes(keyword) && content.includes(char.name)) {
          // 检查是否有合理说明
          if (!content.includes('意外') && !content.includes('特殊') && !content.includes('秘法')) {
            // 简单检查：可能是战力不一致
            const nearbyContext = this.findNearbyContext(content, `${char.name}${keyword}`, 50);
            if (nearbyContext && !nearbyContext.includes('然而') && !nearbyContext.includes('但')) {
              // 可能缺少解释
              issues.push({
                severity: 'medium',
                category: 'setting',
                location: this.findLocation(content, nearbyContext),
                description: `角色 ${char.name} 的战斗结果可能与境界设定不一致`,
                evidence: nearbyContext,
                fixHint: '添加战力差异的合理解释（如秘法、偷袭、克制等）',
                blocking: false
              });
            }
          }
        }
      }
    }

    // 2. 检查地点描述是否与世界观一致
    const worldSchema = project.worldSchema;
    if (worldSchema) {
      const locations = worldSchema.locations || [];
      for (const loc of locations) {
        // 检查地点名称是否一致
        if (content.includes(loc.name)) {
          // 检查是否正确使用了地点
          // （这里简化处理，实际需要更复杂的逻辑）
        }
      }
    }

    // 3. 检查物品/货币使用是否符合规则
    const currencyKeywords = ['灵石', '金币', '银两', '铜钱'];
    for (const currency of currencyKeywords) {
      const count = (content.match(new RegExp(currency, 'g')) || []).length;
      if (count > 10) {
        issues.push({
          severity: 'low',
          category: 'setting',
          location: '全文',
          description: `货币 "${currency}" 出现过于频繁，可能过度强调`,
          evidence: `出现 ${count} 次`,
          fixHint: '适当减少货币相关描写，或用其他方式表达财富',
          blocking: false
        });
      }
    }

    return issues;
  }

  /**
   * 时间线检查
   * 检查时间回跳、倒计时推进、角色同时出现在两个地点
   */
  private async checkTimeline(content: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // 1. 检查时间回跳
    const timePatterns = [
      /回到?(.+?)之后/,
      /(.+?)之后?(.+?)又/,
      /(.+?)时(.+?)又/,
    ];

    const timelineKeywords = ['第二天', '第三天', '数日后', '转眼', '倏忽'];
    let lastTimeKeyword = '';
    let lastTimePosition = 0;

    for (const keyword of timelineKeywords) {
      const position = content.indexOf(keyword);
      if (position > 0 && position < lastTimePosition && lastTimeKeyword) {
        issues.push({
          severity: 'high',
          category: 'timeline',
          location: `位置 ${position}`,
          description: `时间线回跳：从"${lastTimeKeyword}"回退到"${keyword}"`,
          evidence: `前文：...${content.slice(lastTimePosition - 20, lastTimePosition + 10)}...\n后文：...${content.slice(position - 10, position + 10)}...`,
          fixHint: '确保时间线单调递增，或明确标注闪回',
          blocking: true
        });
        break;
      }
      if (position > 0) {
        lastTimeKeyword = keyword;
        lastTimePosition = position;
      }
    }

    // 2. 检查倒计时
    const countdownPatterns = [
      /还剩(\d+)(天|小时|分钟|秒)/,
      /(\d+)(天|小时|分钟|秒)后/,
      /倒计时[：:](\d+)/,
    ];

    for (const pattern of countdownPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches && matches.length > 1) {
        // 检查是否递减
        const numbers = matches.map(m => {
          const numMatch = m.match(/\d+/);
          return numMatch ? parseInt(numMatch[0]) : 0;
        });
        
        for (let i = 1; i < numbers.length; i++) {
          if (numbers[i] > numbers[i - 1]) {
            issues.push({
              severity: 'medium',
              category: 'timeline',
              location: `第 ${i + 1} 个倒计时`,
              description: '倒计时数值未递减',
              evidence: matches.join('; '),
              fixHint: '确保倒计时数值随情节推进递减',
              blocking: false
            });
          }
        }
      }
    }

    // 3. 检查角色同时出现在两个地点（简化）
    const locationTransition = content.match(/(在.+?)(.+?)(来到|到了|来到|进入|进入)(.+?)/);
    // （实际需要更复杂的逻辑来检测角色位置冲突）

    return issues;
  }

  /**
   * 叙事连贯检查
   * 检查上章钩子回应、场景转换、情绪弧连续
   */
  private async checkContinuity(content: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    const { previousChapter, previousSummary } = this.context;

    // 1. 检查上章钩子是否回应
    if (previousChapter?.content) {
      const prevEnding = this.contextManager.extractChapterEnding(previousChapter.content);
      
      // 检查是否包含悬念关键词
      const suspenseKeywords = ['？', '……', '悬念', '为何', '怎么回事'];
      const hasSuspense = suspenseKeywords.some(k => prevEnding.includes(k));

      if (hasSuspense) {
        // 检查本章是否有回应
        const responsePatterns = ['原来', '原来如此', '才明白', '恍然大悟', '这才知道'];
        const hasResponse = responsePatterns.some(p => content.includes(p));
        
        if (!hasResponse) {
          issues.push({
            severity: 'medium',
            category: 'continuity',
            location: '开头部分',
            description: '上章结尾留有悬念，本章可能未回应',
            evidence: `上章结尾："${prevEnding.slice(-30)}"`,
            fixHint: '在本章开头或适当位置回应上章悬念',
            blocking: false
          });
        }
      }
    }

    // 2. 检查场景转换是否有过渡
    const sceneChanges = content.match(/(在|来到|到了|进入|来到)(.+?)[，。]/g);
    if (sceneChanges && sceneChanges.length > 3) {
      // 检查是否有过渡词
      const transitionWords = ['然后', '接着', '随后', '不久', '片刻后', '不多时'];
      let transitionCount = 0;
      for (const change of sceneChanges) {
        if (transitionWords.some(t => content.includes(t))) {
          transitionCount++;
        }
      }

      if (transitionCount < sceneChanges.length * 0.3) {
        issues.push({
          severity: 'low',
          category: 'continuity',
          location: '场景转换处',
          description: '场景转换较多但过渡描写较少',
          evidence: `场景变化 ${sceneChanges.length} 次，过渡词仅 ${transitionCount} 次`,
          fixHint: '在场景转换处添加过渡描写',
          blocking: false
        });
      }
    }

    // 3. 检查情绪弧是否连续
    // （简化版：检查感叹号和问号的分布）
    const exclamationCount = (content.match(/[！？]/g) || []).length;
    const paragraphs = content.split('\n\n');
    
    // 检查开头和结尾的情绪是否突变
    if (paragraphs.length >= 2) {
      const firstPara = paragraphs[0];
      const lastPara = paragraphs[paragraphs.length - 1];
      
      const firstExclamations = (firstPara.match(/[！？]/g) || []).length;
      const lastExclamations = (lastPara.match(/[！？]/g) || []).length;

      // 如果开头平静但结尾突然激烈
      if (firstExclamations === 0 && lastExclamations >= 3) {
        issues.push({
          severity: 'medium',
          category: 'continuity',
          location: '开头和结尾',
          description: '情绪从平静突变到激烈，可能缺少过渡',
          evidence: `开头感叹号：${firstExclamations}，结尾感叹号：${lastExclamations}`,
          fixHint: '在突变前添加情绪铺垫或过渡段落',
          blocking: false
        });
      }
    }

    return issues;
  }

  /**
   * 角色一致性检查
   * 检查对话风格、行为一致性、知识边界
   */
  private async checkCharacterConsistency(content: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    const { project } = this.context;
    const characters = project.characters || [];

    for (const char of characters.slice(0, 5)) {
      const personality = char.profile?.personality || [];
      const charName = char.name;

      // 检查是否出现在正文中
      const charAppearances = (content.match(new RegExp(charName, 'g')) || []).length;
      if (charAppearances === 0) continue;

      // 1. 检查性格与行为是否一致
      if (personality.includes('冷静') || personality.includes('内敛')) {
        // 检查是否过于情绪化
        const emotionalPatterns = [
          /暴跳如雷/,
          /大怒/,
          /勃然大怒/,
          /怒不可遏/,
        ];
        
        for (const pattern of emotionalPatterns) {
          const match = content.match(new RegExp(`${charName}.*${pattern.source}`));
          if (match) {
            issues.push({
              severity: 'high',
              category: 'character',
              location: this.findLocation(content, match[0]),
              description: `角色 ${charName} 性格设定为冷静/内敛，但表现出强烈愤怒`,
              evidence: match[0],
              fixHint: '修改为符合性格的反应，如压抑、不动声色、或内心波动但外表平静',
              blocking: false
            });
          }
        }
      }

      // 2. 检查说话风格是否符合设定
      const speakingStyle = char.profile?.speakingStyle;
      if (speakingStyle?.includes('简短')) {
        // 检查对话长度
        const dialogues = content.match(/[「『]([^」』]{30,})[」』]/g);
        if (dialogues && dialogues.length > 3) {
          issues.push({
            severity: 'medium',
            category: 'character',
            location: '对话部分',
            description: `角色 ${charName} 设定说话简短，但对话较长`,
            evidence: `发现 ${dialogues.length} 处超过30字的长对话`,
            fixHint: '缩短对话长度，符合角色说话风格',
            blocking: false
          });
        }
      }
    }

    // 3. 检查角色知识边界
    // （简化版：检查是否使用了不该知道的信息）
    const knowledgePatterns = [
      /他居然不知道.*?已经/,
      /虽然.*?但其实.*?早就在/,
    ];

    for (const pattern of knowledgePatterns) {
      const match = content.match(pattern);
      if (match) {
        issues.push({
          severity: 'medium',
          category: 'character',
          location: this.findLocation(content, match[0]),
          description: '可能存在角色知识边界问题',
          evidence: match[0],
          fixHint: '确保角色只能使用其应该知道的信息',
          blocking: false
        });
      }
    }

    return issues;
  }

  /**
   * 逻辑检查
   * 检查因果关系、决策动机、战斗结果
   */
  private async checkLogic(content: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // 1. 检查因果关系
    const causePatterns = [
      /因为(.+?)，所以(.+?)/,
      /由于(.+?)，(.+?)导致/,
    ];

    for (const pattern of causePatterns) {
      let match;
      const regex = new RegExp(pattern, 'g');
      while ((match = regex.exec(content)) !== null) {
        const cause = match[1];
        const effect = match[2];

        // 检查因果是否合理（简化检查）
        if (cause.length > 50 || effect.length > 50) {
          // 因果关系可能过于复杂
          issues.push({
            severity: 'low',
            category: 'logic',
            location: this.findLocation(content, match[0]),
            description: '因果关系可能过于复杂',
            evidence: match[0].slice(0, 100),
            fixHint: '简化因果关系，使逻辑更清晰',
            blocking: false
          });
        }
      }
    }

    // 2. 检查决策动机
    const decisionPatterns = [
      /决定(.+?去|要|将|要)/,
      /选择(.+?去|要|将|选择)/,
    ];

    for (const pattern of decisionPatterns) {
      const match = content.match(pattern);
      if (match) {
        // 检查是否有明确的动机
        const motivationKeywords = ['因为', '为了', '由于', '所以', '因此'];
        const hasMotivation = motivationKeywords.some(k => content.includes(k));
        
        if (!hasMotivation) {
          issues.push({
            severity: 'medium',
            category: 'logic',
            location: this.findLocation(content, match[0]),
            description: '角色决策可能缺少明确动机',
            evidence: match[0],
            fixHint: '添加决策的合理动机',
            blocking: false
          });
        }
      }
    }

    // 3. 检查战斗/冲突结果是否合理
    const battleResultPatterns = [
      /(.+?)击败(.+?)。/,
      /(.+?)战胜(.+?)。/,
    ];

    for (const pattern of battleResultPatterns) {
      const match = content.match(pattern);
      if (match) {
        const winner = match[1];
        const loser = match[2];

        // 简单检查：如果一方明显较弱（通过上下文判断）
        const loserContext = this.findNearbyContext(content, loser, 100);
        const winnerContext = this.findNearbyContext(content, winner, 100);

        if (loserContext && winnerContext) {
          // 检查是否有解释
          const explanationPatterns = ['秘法', '偷袭', '克制', '意外', '特殊'];
          const hasExplanation = explanationPatterns.some(p => 
            loserContext.includes(p) || winnerContext.includes(p)
          );

          if (!hasExplanation) {
            issues.push({
              severity: 'medium',
              category: 'logic',
              location: this.findLocation(content, match[0]),
              description: `战斗结果 "${winner}击败${loser}" 缺少合理解释`,
              evidence: match[0],
              fixHint: '添加战斗结果的合理解释（如实力差距、策略、意外因素等）',
              blocking: false
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * AI味检查
   * 使用 DeAIService 进行检查
   */
  private async checkAIFlavor(content: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // 使用 DeAIService 检测
    const detection = await DeAIService.detect(content);

    // 转换检测结果为审查问题
    for (const issue of detection.issues) {
      issues.push({
        severity: issue.severity === 'high' ? 'high' : issue.severity === 'medium' ? 'medium' : 'low',
        category: 'ai_flavor',
        location: issue.position,
        description: issue.suggestion,
        evidence: issue.original,
        fixHint: issue.suggestion,
        blocking: issue.severity === 'high'
      });
    }

    // 额外检查：句式层
    // 检查是否存在"起因→经过→结果→感悟"四段闭环
    const closurePatterns = [
      /，因此(.+?)。(.+?)。(.+?)。(.+?)$/,
    ];

    for (const pattern of closurePatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches && matches.length > 2) {
        issues.push({
          severity: 'high',
          category: 'ai_flavor',
          location: '多处',
          description: '存在连续的四段闭环结构（起因→经过→结果→感悟）',
          evidence: `发现 ${matches.length} 处`,
          fixHint: '删除感悟句，留余味',
          blocking: false
        });
      }
    }

    // 检查节奏是否过于均匀
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    if (paragraphs.length >= 5) {
      const lengths = paragraphs.map(p => p.length);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
      const stdDev = Math.sqrt(variance);

      // 如果标准差小于平均值的20%，说明节奏过于均匀
      if (stdDev / avgLength < 0.2) {
        issues.push({
          severity: 'medium',
          category: 'ai_flavor',
          location: '全文',
          description: '段落长度过于均匀，节奏缺少疏密对比',
          evidence: `段落长度标准差：${stdDev.toFixed(1)}，平均值：${avgLength.toFixed(1)}`,
          fixHint: '调整段落长度，增加节奏疏密对比',
          blocking: false
        });
      }
    }

    return issues;
  }

  /**
   * 构建审查结果
   */
  private buildReviewResult(issues: ReviewIssue[]): SixDimensionReview {
    const result: SixDimensionReview = {
      setting: { passed: true, issues: [], checkedItems: [] },
      timeline: { passed: true, issues: [], checkedItems: [] },
      continuity: { passed: true, issues: [], checkedItems: [] },
      character: { passed: true, issues: [], checkedItems: [] },
      logic: { passed: true, issues: [], checkedItems: [] },
      aiFlavor: { passed: true, issues: [], checkedItems: [] },
      overall: {
        issues: [],
        summary: '',
        blockingCount: 0,
        highPriorityCount: 0
      }
    };

    // 按分类组织问题
    for (const issue of issues) {
      const category = issue.category as keyof typeof result;
      if (category in result && category !== 'overall') {
        result[category].issues.push(issue);
        result[category].checkedItems.push(issue.location);
        if (issue.severity !== 'low') {
          result[category].passed = false;
        }
      }

      // 汇总到 overall
      result.overall.issues.push(issue);
      if (issue.blocking) {
        result.overall.blockingCount++;
      }
      if (issue.severity === 'high' || issue.severity === 'critical') {
        result.overall.highPriorityCount++;
      }
    }

    // 生成总结
    const totalIssues = issues.length;
    const blockingCount = result.overall.blockingCount;
    const highPriorityCount = result.overall.highPriorityCount;

    result.overall.summary = `${totalIssues}个问题：${blockingCount}个阻断，${highPriorityCount}个高优`;

    return result;
  }

  /**
   * 查找内容位置
   */
  private findLocation(content: string, evidence: string): string {
    const position = content.indexOf(evidence);
    if (position < 0) return '未知位置';

    const lineNumber = content.slice(0, position).split('\n').length;
    return `第 ${lineNumber} 行附近`;
  }

  /**
   * 查找附近上下文
   */
  private findNearbyContext(content: string, keyword: string, windowSize: number): string | null {
    const position = content.indexOf(keyword);
    if (position < 0) return null;

    const start = Math.max(0, position - windowSize);
    const end = Math.min(content.length, position + keyword.length + windowSize);
    
    return content.slice(start, end);
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 执行六维审查
 */
export async function reviewChapter(
  context: ReviewContext,
  options?: ReviewOptions
): Promise<SixDimensionReview> {
  const service = new ReviewService(context, options);
  return await service.review();
}

/**
 * 执行快速审查（仅 AI 味）
 */
export async function quickReview(content: string): Promise<ReviewIssue[]> {
  const service = new ReviewService(
    {
      project: { id: '', name: '', description: '', genre: [], wordCount: 0, status: 'writing', volumes: [], chapters: [], characters: [], worldSchema: { locations: [], rules: [], factions: [] }, foreshadows: [], plotOutline: [], chapterMemories: [], createdAt: '', updatedAt: '' },
      chapter: { id: '', title: '', content, wordCount: content.length, orderIndex: 0, version: 1, status: 'draft', createdAt: '', updatedAt: '' },
      chapterIndex: 0
    },
    {
      checkSetting: false,
      checkTimeline: false,
      checkContinuity: false,
      checkCharacter: false,
      checkLogic: false,
      checkAIFlavor: true
    }
  );
  
  const result = await service.review();
  return result.overall.issues;
}
