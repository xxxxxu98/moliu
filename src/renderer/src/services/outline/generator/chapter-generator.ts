/**
 * Chapter Generator
 * 章节生成器 - 基于新的契约系统重构
 */

import type { 
  ChapterCommit, 
  ChapterBrief,
  VolumeContract,
  Beat,
  ValidationResult,
  StrandStatus,
} from '../contracts';
import {
  createDefaultChapterCommit,
  commitToBrief,
  determineNodeType,
  generateDefaultNodes,
} from '../contracts';
import { enhancedContractValidator } from '../validation';
import { consistencyValidator } from '../validation';
import { strandValidator } from '../validation';
import { 
  buildChapterOutlinePrompt, 
  buildSimpleChapterPrompt,
  buildBatchChapterPrompt,
  type ChapterOutlinePromptOptions,
} from '../prompts';
import { placeholderScanner } from '../validation';

/**
 * 进度回调
 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

/**
 * 章节生成选项
 */
export interface ChapterGeneratorOptions {
  volume: VolumeContract;
  chapterNumber: number;
  previousChapterCommit?: ChapterCommit;
  nextChapterCommit?: ChapterCommit;
  onProgress?: ProgressCallback;
}

/**
 * 章节生成结果
 */
export interface ChapterGenerationResult {
  success: boolean;
  commit?: ChapterCommit;
  brief?: ChapterBrief;
  validation?: ValidationResult;
  warnings?: string[];
  errors?: string[];
}

/**
 * 批量章节生成选项
 */
export interface BatchChapterOptions {
  volume: VolumeContract;
  startChapter: number;
  count: number;
  batchSize?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * 章节生成器
 */
export class ChapterOutlineGenerator {
  private aiClient: any;
  
  constructor(aiClient?: any) {
    this.aiClient = aiClient;
  }
  
  /**
   * 生成单个章节
   */
  async generate(options: ChapterGeneratorOptions): Promise<ChapterGenerationResult> {
    const { volume, chapterNumber, previousChapterCommit, nextChapterCommit, onProgress } = options;
    
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      onProgress?.(chapterNumber, volume.chapterRange[1] - volume.chapterRange[0] + 1, '正在生成章纲...');
      
      // 1. 确定节拍和节点类型
      const currentBeat = this.findCurrentBeat(volume, chapterNumber);
      const nextBeat = this.findNextBeat(volume, chapterNumber);
      const nodeInfo = this.determineNodeType(volume, chapterNumber);
      
      // 2. 构建提示词
      const promptOptions: ChapterOutlinePromptOptions = {
        volumeId: volume.volumeId,
        chapterNumber,
        previousChapterCommit,
        currentBeat,
        nextBeat,
        strandStatus: volume.strandStatus,
        genre: undefined,
        knowledgeContext: this.buildKnowledgeContext(volume, chapterNumber),
      };
      
      const { system, user } = buildChapterOutlinePrompt(promptOptions);
      
      let commit: ChapterCommit;
      
      if (this.aiClient) {
        // 3. 调用AI
        onProgress?.(chapterNumber, 0, '正在生成章纲...');
        
        const response = await this.aiClient.complete({
          system,
          user,
          temperature: 0.7,
          maxTokens: 4096,
        });
        
        // 4. 解析结果
        onProgress?.(chapterNumber, 0, '正在解析章纲...');
        commit = this.parseChapterCommit(response.content || '', chapterNumber, volume.volumeId);
      } else {
        // 使用默认值
        commit = createDefaultChapterCommit({
          chapterId: chapterNumber,
          volumeId: volume.volumeId,
          strand: 'Quest' as any,
        });
        commit.nodes = generateDefaultNodes(nodeInfo);
        warnings.push('未配置AI客户端，使用默认章节结构');
      }
      
      // 5. 验证
      onProgress?.(chapterNumber, 0, '正在验证章纲...');
      
      const validation = enhancedContractValidator.validateChapterCommit(
        commit,
        volume,
        previousChapterCommit
      );
      
      if (!validation.isValid) {
        warnings.push(...validation.violations.map(v => v.description));
      }
      
      // 验证故事线一致性
      const strandValidation = strandValidator.validateChapterStrand(
        commit.requirements.strand,
        volume.strandStatus
      );
      warnings.push(...strandValidation.warnings.map(w => w.description));
      
      // 检查占位符
      const commitContent = JSON.stringify(commit);
      const placeholders = placeholderScanner.scan(commitContent);
      if (placeholders.length > 0) {
        warnings.push(`发现 ${placeholders.length} 个占位符`);
      }
      
      onProgress?.(chapterNumber, 0, '章纲生成完成');
      
      return {
        success: validation.isValid,
        commit,
        brief: commitToBrief(commit),
        validation,
        warnings,
        errors: [],
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : '生成失败'],
        warnings,
      };
    }
  }
  
  /**
   * 批量生成章节
   */
  async *generateBatch(options: BatchChapterOptions): AsyncGenerator<ChapterGenerationResult[]> {
    const { volume, startChapter, count, batchSize = 5, onProgress } = options;
    
    let previousCommit: ChapterCommit | undefined;
    
    for (let i = 0; i < count; i += batchSize) {
      const batchCount = Math.min(batchSize, count - i);
      const batchResults: ChapterGenerationResult[] = [];
      
      for (let j = 0; j < batchCount; j++) {
        const chapterNumber = startChapter + i + j;
        
        const result = await this.generate({
          volume,
          chapterNumber,
          previousChapterCommit: previousCommit,
        });
        
        batchResults.push(result);
        
        if (result.success && result.commit) {
          previousCommit = result.commit;
        }
        
        onProgress?.(i + j + 1, count);
      }
      
      yield batchResults;
    }
  }
  
  /**
   * 找到当前章节所属的节拍
   */
  private findCurrentBeat(volume: VolumeContract, chapterNumber: number): Beat | undefined {
    return volume.beats.find(beat =>
      chapterNumber >= beat.chapterRange[0] &&
      chapterNumber <= beat.chapterRange[1]
    );
  }
  
  /**
   * 找到下一个节拍
   */
  private findNextBeat(volume: VolumeContract, chapterNumber: number): Beat | undefined {
    const sortedBeats = [...volume.beats].sort((a, b) => {
      const order = ['Opening', 'Development', 'Twist1', 'Twist2', 'Climax', 'ConflictResolution', 'Twist3', 'Ending'];
      return order.indexOf(a.node) - order.indexOf(b.node);
    });
    
    const currentIndex = sortedBeats.findIndex(beat =>
      chapterNumber >= beat.chapterRange[0] &&
      chapterNumber <= beat.chapterRange[1]
    );
    
    return currentIndex >= 0 && currentIndex < sortedBeats.length - 1 
      ? sortedBeats[currentIndex + 1] 
      : undefined;
  }
  
  /**
   * 确定节点类型
   */
  private determineNodeType(volume: VolumeContract, chapterNumber: number) {
    const beat = this.findCurrentBeat(volume, chapterNumber);
    
    if (!beat) {
      return { cpnType: 'objective' as const, cpnCount: 2 };
    }
    
    const totalInBeat = beat.chapterRange[1] - beat.chapterRange[0] + 1;
    const positionInBeat = chapterNumber - beat.chapterRange[0];
    const progress = positionInBeat / totalInBeat;
    
    let cpnType: 'objective' | 'conflict' | 'revelation' | 'climax' = 'objective';
    
    if (progress < 0.3) {
      cpnType = 'objective';
    } else if (progress < 0.6) {
      cpnType = 'conflict';
    } else if (progress < 0.85) {
      cpnType = 'revelation';
    } else {
      cpnType = 'climax';
    }
    
    return {
      cpnType,
      cpnCount: cpnType === 'climax' ? 4 : 3,
    };
  }
  
  /**
   * 构建知识上下文
   */
  private buildKnowledgeContext(volume: VolumeContract, chapterNumber: number): string {
    const sections: string[] = [];
    
    // 获取时间线信息
    const timeAnchor = volume.timeline.anchors.find(a => a.chapter === chapterNumber);
    if (timeAnchor) {
      sections.push(`【时间锚点】${timeAnchor.absoluteTime}`);
      if (timeAnchor.gapFromPrevious) {
        sections.push(`【与上章间隔】${timeAnchor.gapFromPrevious}`);
      }
    }
    
    // 获取倒计时信息
    if (timeAnchor?.countdown.active) {
      sections.push(`【倒计时】${timeAnchor.countdown.event} - 剩余${timeAnchor.countdown.daysRemaining}天`);
    }
    
    return sections.join('\n');
  }
  
  /**
   * 解析章节承诺
   */
  private parseChapterCommit(content: string, chapterNumber: number, volumeId: number): ChapterCommit {
    // 尝试从JSON解析
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    let parsed: any = {};
    
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch {
        // 忽略解析错误
      }
    }
    
    // 构建承诺
    const commit = createDefaultChapterCommit({
      chapterId: chapterNumber,
      volumeId,
      strand: 'Quest' as any,
    });
    
    // 填充数据
    if (parsed.nodes) {
      if (parsed.nodes.cbn) {
        commit.nodes.cbn = {
          id: 'CBN',
          type: 'start',
          statement: parsed.nodes.cbn.statement || '主体 | 动作 | 结果',
          承接上文: parsed.nodes.cbn.承接上文 || '',
          情绪延续: parsed.nodes.cbn.情绪延续,
          requiredElements: ['时间锚点'],
        };
      }
      
      if (parsed.nodes.cpns) {
        commit.nodes.cpns = parsed.nodes.cpns.map((cpn: any, i: number) => ({
          id: `CPN${i + 1}`,
          type: 'progress' as const,
          statement: cpn.statement || '主体 | 动作 | 结果',
          戏剧功能: cpn.戏剧功能 || '推进情节',
          coolPoint: cpn.coolPoint,
          foreshadow: cpn.foreshadow,
        }));
      }
      
      if (parsed.nodes.cen) {
        commit.nodes.cen = {
          id: 'CEN',
          type: 'end',
          statement: parsed.nodes.cen.statement || '主体 | 动作 | 结果 + 悬念',
          悬念: parsed.nodes.cen.悬念 || '',
          钩子类型: parsed.nodes.cen.钩子类型 || '冲突悬念',
          requiredElements: ['悬念', '钩子'],
        };
      }
    }
    
    if (parsed.requirements) {
      commit.requirements = {
        objective: parsed.requirements.objective || '待设定',
        resistance: parsed.requirements.resistance || '待设定',
        cost: parsed.requirements.cost || '待设定',
        timeAnchor: parsed.requirements.timeAnchor || '',
        countdownStatus: parsed.requirements.countdownStatus || '',
        coolPoint: parsed.requirements.coolPoint || '待设定',
        strand: parsed.requirements.strand || 'Quest',
        storyCard: parsed.requirements.storyCard,
      };
    }
    
    if (parsed.foreshadow) {
      commit.foreshadow = parsed.foreshadow;
    }
    
    if (parsed.forbiddenZones) {
      commit.forbiddenZones = parsed.forbiddenZones;
    }
    
    return commit;
  }
  
  /**
   * 验证章节过渡
   */
  validateTransition(current: ChapterCommit, previous?: ChapterCommit): ValidationResult {
    if (!previous) {
      return { isValid: true, violations: [], warnings: [] };
    }
    
    return consistencyValidator.validateChapterTransition(current, previous);
  }
}

// 导出工厂函数
export function createChapterGenerator(aiClient?: any): ChapterOutlineGenerator {
  return new ChapterOutlineGenerator(aiClient);
}
