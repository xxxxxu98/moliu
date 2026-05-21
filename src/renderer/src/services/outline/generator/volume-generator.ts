/**
 * Volume Generator
 * 卷生成器 - 生成卷级大纲、节拍表和时间线
 * 基于新的契约系统重构
 */

import type { 
  VolumeContract, 
  Beat, 
  Timeline, 
  StoryContract,
  ValidationResult,
  StrandStatus 
} from '../contracts';
import { 
  createDefaultVolumeContract, 
  generateTimelineFromBeats,
  generateDefaultBeatTable,
} from '../contracts';
import { enhancedContractValidator } from '../validation';
import { 
  buildVolumeBeatPrompt, 
  buildTimelinePrompt,
  type VolumeBeatPromptOptions,
  type TimelinePromptOptions,
} from '../prompts';
import { placeholderScanner } from '../validation';

/**
 * 进度回调
 */
export type ProgressCallback = (phase: string, progress: number, message: string) => void;

/**
 * 卷生成选项
 */
export interface VolumeGeneratorOptions {
  /** 卷ID */
  volumeId: number;
  /** 卷标题 */
  volumeTitle: string;
  /** 章节起始 */
  chapterStart: number;
  /** 章节结束 */
  chapterEnd: number;
  /** 核心冲突 */
  coreConflict: string;
  /** 卷末高潮 */
  volumeClimax: string;
  /** 故事契约（可选） */
  storyContract?: StoryContract;
  /** 上卷摘要（可选） */
  previousVolumeSummary?: string;
  /** 进度回调 */
  onProgress?: ProgressCallback;
}

/**
 * 卷生成结果
 */
export interface VolumeGenerationResult {
  success: boolean;
  volume?: VolumeContract;
  beatTable?: Beat[];
  timeline?: Timeline;
  validation?: ValidationResult;
  warnings?: string[];
  errors?: string[];
}

/**
 * 卷生成器
 */
export class VolumeOutlineGenerator {
  private aiClient: any;
  
  constructor(aiClient?: any) {
    this.aiClient = aiClient;
  }
  
  /**
   * 生成卷大纲
   */
  async generate(options: VolumeGeneratorOptions): Promise<VolumeGenerationResult> {
    const { volumeId, volumeTitle, chapterStart, chapterEnd, 
            coreConflict, volumeClimax, storyContract, 
            previousVolumeSummary, onProgress } = options;
    
    const totalChapters = chapterEnd - chapterStart + 1;
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      // Phase 1: 生成节拍表
      onProgress?.('generating_beats', 0.1, '正在生成节拍表...');
      
      const beatPromptOptions: VolumeBeatPromptOptions = {
        volumeId,
        volumeTitle,
        chapterStart,
        chapterEnd,
        coreConflict,
        volumeClimax,
        previousVolumeSummary,
        genre: storyContract?.basic.genre,
        strandConfig: storyContract ? {
          quest: { 
            ratio: storyContract.strands.quest.ratio, 
            currentArc: storyContract.conflictEscalation[0]?.name || '' 
          },
          fire: { 
            ratio: storyContract.strands.fire.ratio, 
            currentStage: 'development' 
          },
          constellation: { 
            ratio: storyContract.strands.constellation.ratio, 
            revealedLocations: storyContract.worldSetting.locations || [] 
          },
        } : undefined,
        storyContract,
      };
      
      const beatPrompt = buildVolumeBeatPrompt(beatPromptOptions);
      let beatTable: Beat[];
      
      if (this.aiClient) {
        const beatResponse = await this.aiClient.complete({
          system: beatPrompt.system,
          user: beatPrompt.user,
          temperature: 0.7,
          maxTokens: 8192,
        });
        
        onProgress?.('parsing_beats', 0.3, '解析节拍表...');
        beatTable = this.parseBeatTable(beatResponse.content || '', volumeId, chapterStart, chapterEnd);
      } else {
        beatTable = generateDefaultBeatTable(volumeId, chapterStart, chapterEnd);
        warnings.push('未配置AI客户端，使用默认节拍表');
      }
      
      // Phase 2: 生成时间线
      onProgress?.('generating_timeline', 0.5, '正在生成时间线...');
      
      const timelinePromptOptions: TimelinePromptOptions = {
        volumeId,
        volumeTitle,
        beats: beatTable,
        baseline: storyContract?.worldConstraints?.timeBaseline || '未设定',
        hasCountdown: beatTable.some(b => b.node === 'Climax'),
        countdownEvents: [],
      };
      
      const timelinePrompt = buildTimelinePrompt(timelinePromptOptions);
      let timeline: Timeline;
      
      if (this.aiClient) {
        const timelineResponse = await this.aiClient.complete({
          system: timelinePrompt.system,
          user: timelinePrompt.user,
          temperature: 0.5,
          maxTokens: 4096,
        });
        
        onProgress?.('parsing_timeline', 0.6, '解析时间线...');
        timeline = this.parseTimeline(timelineResponse.content || '');
      } else {
        timeline = generateTimelineFromBeats(beatTable, storyContract?.worldConstraints?.timeBaseline);
        warnings.push('未配置AI客户端，使用默认时间线');
      }
      
      // Phase 3: 构建卷契约
      onProgress?.('building_contract', 0.8, '构建卷契约...');
      
      const strandStatus: StrandStatus = {
        quest: {
          mainObjective: coreConflict,
          obstacles: [],
          status: 'active',
        },
        fire: {
          relationshipStage: 'introduction',
          keyMoments: [],
          status: 'active',
        },
        constellation: {
          newRevelations: [],
          locationsIntroduced: [],
          status: 'active',
        },
      };
      
      const volume = createDefaultVolumeContract({
        volumeId,
        volumeTitle,
        chapterStart,
        chapterEnd,
        outlineId: storyContract?.meta?.createdAt,
      });
      
      volume.beats = beatTable;
      volume.timeline = timeline;
      volume.strandStatus = strandStatus;
      volume.promises = {
        mainPromise: coreConflict,
        subPromises: [],
        hookForNext: volumeClimax,
      };
      
      // Phase 4: 验证
      onProgress?.('validating', 0.9, '验证卷契约...');
      
      const validation = enhancedContractValidator.validateVolumeContract(volume, storyContract);
      
      if (!validation.isValid) {
        warnings.push(...validation.violations.map(v => v.description));
      }
      
      // 检查占位符
      const volumeContent = JSON.stringify(volume);
      const placeholders = placeholderScanner.scan(volumeContent);
      if (placeholders.length > 0) {
        warnings.push(`发现 ${placeholders.length} 个占位符`);
      }
      
      onProgress?.('completed', 1.0, '生成完成');
      
      return {
        success: validation.isValid,
        volume,
        beatTable,
        timeline,
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
   * 解析节拍表
   */
  private parseBeatTable(
    text: string, 
    volumeId: number, 
    chapterStart: number, 
    chapterEnd: number
  ): Beat[] {
    // 尝试从JSON解析
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed.beats)) {
          return parsed.beats;
        }
      } catch {
        // 忽略解析错误
      }
    }
    
    // 回退到默认节拍表
    return generateDefaultBeatTable(volumeId, chapterStart, chapterEnd);
  }
  
  /**
   * 解析时间线
   */
  private parseTimeline(text: string): Timeline {
    // 尝试从JSON解析
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.timeline) {
          return parsed.timeline;
        }
        return parsed;
      } catch {
        // 忽略解析错误
      }
    }
    
    // 返回默认时间线
    return {
      baseline: '未设定',
      span: '待设定',
      direction: 'forward',
      monotonic: true,
      anchors: [],
      countdownEvents: [],
    };
  }
  
  /**
   * 批量生成多卷
   */
  async generateMultipleVolumes(
    volumeConfigs: Omit<VolumeGeneratorOptions, 'onProgress'>[],
    onProgress?: (volumeIndex: number, total: number, phase: string, progress: number) => void
  ): Promise<VolumeGenerationResult[]> {
    const results: VolumeGenerationResult[] = [];
    
    for (let i = 0; i < volumeConfigs.length; i++) {
      const result = await this.generate({
        ...volumeConfigs[i],
        onProgress: (phase, progress, message) => {
          onProgress?.(i, volumeConfigs.length, phase, progress);
        },
      });
      results.push(result);
    }
    
    return results;
  }
}

// 导出工厂函数
export function createVolumeGenerator(aiClient?: any): VolumeOutlineGenerator {
  return new VolumeOutlineGenerator(aiClient);
}
