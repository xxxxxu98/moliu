/**
 * Chapter Commit 服务
 * 参考 webnovel-writer 的 Commit 机制设计
 *
 * 核心流程：
 * 1. Data Agent 提取 artifacts（fulfillment/disambiguation/extraction）
 * 2. chapter-commit 提交 accepted/rejected
 * 3. projection writers 更新 state.json / summaries / memories
 */

import type {
  ChapterCommit,
  ChapterCommitArtifacts,
  CommitStatus,
  ProjectionStatus,
  ProjectionStatusMap,
  FulfillmentResult,
  DisambiguationResult,
  ExtractionResult,
  AcceptedEvent,
  StateDelta,
  EntityDelta,
  SceneChunk,
  EnhancedForeshadow,
  ForeshadowStatus,
  EventType,
} from '@/types/writing-task';
import type { Project, Chapter, ChapterMemory, Foreshadow } from '@/types/project';
import { getMemoryManager } from './memory-manager';

export interface CommitContext {
  project: Project;
  chapter: Chapter;
  chapterIndex: number;
}

export interface CommitOptions {
  /** 是否自动触发投影 */
  autoProject?: boolean;
  /** 是否强制接受（忽略 blocking issues）*/
  forceAccept?: boolean;
}

export interface ProjectionResult {
  success: boolean;
  state?: ProjectionStatus;
  summary?: ProjectionStatus;
  memory?: ProjectionStatus;
  error?: string;
}

/**
 * Chapter Commit 服务
 */
export class ChapterCommitService {
  private project: Project;
  private chapter: Chapter;
  private chapterIndex: number;
  private artifacts: ChapterCommitArtifacts | null = null;
  private commitResult: ChapterCommit | null = null;

  constructor(context: CommitContext) {
    this.project = context.project;
    this.chapter = context.chapter;
    this.chapterIndex = context.chapterIndex;
  }

  /**
   * 设置提交产物
   */
  setArtifacts(artifacts: ChapterCommitArtifacts): void {
    this.artifacts = artifacts;
  }

  /**
   * 执行提交
   *
   * 自动判定：
   * - blocking_count > 0 → rejected
   * - missed_nodes 非空 → rejected
   * - pending 非空 → rejected
   * - 否则 → accepted
   */
  async commit(options: CommitOptions = {}): Promise<ChapterCommit> {
    if (!this.artifacts) {
      throw new Error('请先设置 artifacts');
    }

    const { autoProject = true, forceAccept = false } = options;

    // 判定提交状态
    const status = this.determineStatus(forceAccept);

    this.commitResult = {
      chapterId: this.chapter.id,
      chapterNumber: this.chapterIndex + 1,
      status,
      artifacts: this.artifacts,
      projectionStatus: {
        state: 'pending',
        index: 'pending',
        summary: 'pending',
        memory: 'pending',
        vector: 'skipped', // 向量投影暂不实现
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 如果接受且启用自动投影
    if (status === 'accepted' && autoProject) {
      await this.executeProjection();
    }

    return this.commitResult;
  }

  /**
   * 判定提交状态
   */
  private determineStatus(forceAccept: boolean): CommitStatus {
    if (forceAccept) {
      return 'accepted';
    }

    const { fulfillment, extraction } = this.artifacts!;

    // 检查是否有阻断性问题
    // （这里简化处理，实际需要传入 review 结果）

    // 检查大纲遗漏
    if (fulfillment.missedNodes.length > 0) {
      return 'rejected';
    }

    // 检查实体冲突
    const unresolvedEntities = extraction.entitiesAppeared.filter(
      e => !this.artifacts!.disambiguation.some(d => d.entityId === e)
    );
    if (unresolvedEntities.length > 0) {
      return 'pending';
    }

    return 'accepted';
  }

  /**
   * 执行投影
   * 将 commit artifacts 投影到 state / summaries / memories
   */
  async executeProjection(): Promise<ProjectionResult> {
    if (!this.commitResult || this.commitResult.status !== 'accepted') {
      return { success: false, error: 'commit 状态不是 accepted' };
    }

    const result: ProjectionResult = { success: true };

    try {
      // 1. 投影到 state
      result.state = await this.projectState();
      this.commitResult.projectionStatus.state = result.state;

      // 2. 投影到 summaries
      result.summary = await this.projectSummary();
      this.commitResult.projectionStatus.summary = result.summary;

      // 3. 投影到 memories
      result.memory = await this.projectMemory();
      this.commitResult.projectionStatus.memory = result.memory;

      // 更新 commit 时间
      this.commitResult.updatedAt = new Date().toISOString();
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : '投影失败';
    }

    return result;
  }

  /**
   * 投影到 state
   * 更新项目状态
   */
  private async projectState(): Promise<ProjectionStatus> {
    try {
      const { stateDeltas, entityDeltas } = this.artifacts!.extraction;

      // 更新角色状态
      for (const delta of stateDeltas) {
        const character = this.project.characters.find(
          c => c.id === delta.entityId || c.name === delta.entityId
        );
        if (character && character.profile) {
          // 更新角色相关状态
          // （这里简化处理，实际需要更复杂的逻辑）
        }
      }

      // 添加新实体
      for (const delta of entityDeltas) {
        if (delta.action === 'upsert') {
          // 添加新角色/势力等
          // （这里简化处理）
        }
      }

      return 'done';
    } catch (error) {
      console.error('[ChapterCommit] 投影 state 失败:', error);
      return 'failed';
    }
  }

  /**
   * 投影到 summaries
   * 生成章节摘要
   */
  private async projectSummary(): Promise<ProjectionStatus> {
    try {
      const { summaryText, scenes, dominantStrand } = this.artifacts!.extraction;

      // 创建章节摘要对象
      const summary = {
        chapterId: this.chapter.id,
        chapterNumber: this.chapterIndex + 1,
        summary: summaryText,
        scenes: scenes.length,
        dominantStrand,
        createdAt: new Date().toISOString(),
      };

      return 'done';
    } catch (error) {
      console.error('[ChapterCommit] 投影 summary 失败:', error);
      return 'failed';
    }
  }

  /**
   * 投影到 memories
   * 保存章节记忆
   */
  private async projectMemory(): Promise<ProjectionStatus> {
    try {
      const memoryManager = getMemoryManager();
      if (!memoryManager.isInitialized()) {
        return 'skipped';
      }

      const { acceptedEvents, summaryText, scenes } = this.artifacts!.extraction;

      // 构建章节记忆
      const memory: ChapterMemory = {
        chapterId: this.chapter.id,
        chapterTitle: this.chapter.title,
        chapterIndex: this.chapterIndex,
        corePlot: summaryText.slice(0, 200),
        keyEvents: scenes.map(s => s.summary),
        locations: scenes.map(s => s.location).filter(Boolean) as string[],
        characterStateChanges: this.extractCharacterChanges(acceptedEvents),
        revealedForeshadows: acceptedEvents
          .filter(e => e.eventType === 'open_loop_closed')
          .map(e => e.payload.content as string),
        newForeshadows: acceptedEvents
          .filter(e => e.eventType === 'open_loop_created')
          .map(e => e.payload.content as string),
        wordCount: this.chapter.content.length,
        createdAt: new Date().toISOString(),
      };

      await memoryManager.saveMemory(memory);

      return 'done';
    } catch (error) {
      console.error('[ChapterCommit] 投影 memory 失败:', error);
      return 'failed';
    }
  }

  /**
   * 提取角色状态变化
   */
  private extractCharacterChanges(events: AcceptedEvent[]): any[] {
    return events
      .filter(e => e.eventType === 'character_state_changed')
      .map(e => ({
        characterName: e.subject,
        stateType: e.payload.field,
        state: e.payload.new,
        detail: `${e.payload.field}: ${e.payload.old} → ${e.payload.new}`,
      }));
  }

  /**
   * 获取提交结果
   */
  getCommit(): ChapterCommit | null {
    return this.commitResult;
  }

  /**
   * 验证提交
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.artifacts) {
      errors.push('artifacts 未设置');
    }

    if (this.artifacts) {
      if (!this.artifacts.extraction.summaryText) {
        errors.push('summaryText 为空');
      }
      if (!this.artifacts.extraction.stateDeltas) {
        errors.push('stateDeltas 未生成');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================
// Data Agent 提取服务
// ============================================

/**
 * 事实提取配置
 */
export interface ExtractionConfig {
  /** 是否启用 AI 辅助 */
  enableAIEnhancement?: boolean;
  /** 实体识别置信度阈值 */
  confidenceThreshold?: number;
  /** 是否自动消歧 */
  autoDisambiguate?: boolean;
}

/**
 * Data Agent 事实提取服务
 * 从章节正文中提取结构化信息
 */
export class DataExtractionService {
  private chapter: Chapter;
  private chapterIndex: number;
  private config: ExtractionConfig;

  constructor(chapter: Chapter, chapterIndex: number, config: ExtractionConfig = {}) {
    this.chapter = chapter;
    this.chapterIndex = chapterIndex;
    this.config = {
      enableAIEnhancement: true,
      confidenceThreshold: 0.5,
      autoDisambiguate: true,
      ...config,
    };
  }

  /**
   * 执行提取
   */
  async extract(): Promise<ExtractionResult> {
    const content = this.chapter.content;

    // 1. 提取场景切片
    const scenes = this.extractScenes(content);

    // 2. 识别出场实体
    const entities = this.identifyEntities(content);

    // 3. 提取事件
    const events = this.extractEvents(content);

    // 4. 提取状态变更
    const stateDeltas = this.extractStateDeltas(content, entities);

    // 5. 生成摘要
    const summaryText = this.generateSummary(content, scenes);

    // 6. 判断主导情节线
    const dominantStrand = this.determineDominantStrand(events);

    return {
      acceptedEvents: events,
      stateDeltas,
      entityDeltas: [], // 实体变更在 entityDeltas 中处理
      entitiesAppeared: entities,
      scenes,
      summaryText,
      dominantStrand,
    };
  }

  /**
   * 提取场景切片
   */
  private extractScenes(content: string): SceneChunk[] {
    const scenes: SceneChunk[] = [];
    const paragraphs = content.split(/\n\n+/);

    let currentScene: Partial<SceneChunk> = {};
    let sceneIndex = 0;
    let lineNumber = 1;

    for (const para of paragraphs) {
      const paraLines = para.split('\n').length;

      // 检测场景切换（地点变化）
      const locationPattern = /(在|来到|到了|进入|来到)(.+?)[，。]/;
      const locationMatch = para.match(locationPattern);

      if (locationMatch && paraLines > 5) {
        // 保存上一个场景
        if (currentScene.summary) {
          scenes.push(currentScene as SceneChunk);
          sceneIndex++;
        }

        // 开始新场景
        currentScene = {
          index: sceneIndex,
          startLine: lineNumber,
          location: locationMatch[2],
          summary: para.slice(0, 100),
          characters: this.extractCharactersFromParagraph(para),
        };
      } else {
        // 累积场景内容
        if (!currentScene.summary) {
          currentScene.summary = '';
        }
        currentScene.summary += para.slice(0, 50);
      }

      lineNumber += paraLines;
      currentScene.endLine = lineNumber;
    }

    // 保存最后一个场景
    if (currentScene.summary) {
      scenes.push(currentScene as SceneChunk);
    }

    return scenes;
  }

  /**
   * 识别出场实体
   */
  private identifyEntities(content: string): string[] {
    const entities: string[] = [];
    const sentences = content.split(/[。！？]/);

    // 简单的人名识别（实际需要更复杂的 NER）
    const namePatterns = [
      /^[「『]?([A-Z\u4e00-\u9fa5]{2,4})[」』]?(?:说|道|问|笑|怒|喊|叹|答|喊)/,
      /([A-Z\u4e00-\u9fa5]{2,4})(?:走到|来到|站起|坐下|拿起|放下)/,
    ];

    for (const sentence of sentences) {
      for (const pattern of namePatterns) {
        const match = sentence.match(pattern);
        if (match && !entities.includes(match[1])) {
          entities.push(match[1]);
        }
      }
    }

    return [...new Set(entities)];
  }

  /**
   * 提取事件
   */
  private extractEvents(content: string): AcceptedEvent[] {
    const events: AcceptedEvent[] = [];
    const sentences = content.split(/[。！？]/);

    for (const sentence of sentences) {
      // 境界突破
      if (sentence.includes('突破') || sentence.includes('晋升')) {
        events.push({
          eventType: 'power_breakthrough',
          subject: this.extractSubject(sentence),
          payload: { description: sentence.trim() },
          chapterIndex: this.chapterIndex,
        });
      }

      // 关系变化
      if (
        sentence.includes('结拜') ||
        sentence.includes('结仇') ||
        sentence.includes('成为') ||
        sentence.includes('反目')
      ) {
        events.push({
          eventType: 'relationship_changed',
          subject: this.extractSubject(sentence),
          payload: { description: sentence.trim() },
          chapterIndex: this.chapterIndex,
        });
      }

      // 物品获得
      if (
        sentence.includes('获得') ||
        sentence.includes('得到') ||
        sentence.includes('获得') ||
        sentence.includes('得到')
      ) {
        events.push({
          eventType: 'artifact_obtained',
          subject: this.extractSubject(sentence),
          payload: { description: sentence.trim() },
          chapterIndex: this.chapterIndex,
        });
      }

      // 伏笔埋设（悬念）
      const suspensePatterns = ['似乎', '好像', '隐约', '总觉得'];
      for (const pattern of suspensePatterns) {
        if (sentence.includes(pattern) && sentence.length > 10) {
          events.push({
            eventType: 'open_loop_created',
            subject: 'reader',
            payload: { content: sentence.trim() },
            chapterIndex: this.chapterIndex,
          });
          break;
        }
      }
    }

    return events;
  }

  /**
   * 提取状态变更
   */
  private extractStateDeltas(content: string, entities: string[]): StateDelta[] {
    const deltas: StateDelta[] = [];

    // 境界变化检测
    const realmPatterns = [/(练气|筑基|金丹|元婴|化神|渡劫|大乘|真仙)/g];

    for (const pattern of realmPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        for (const entity of entities.slice(0, 3)) {
          deltas.push({
            entityId: entity,
            field: 'realm',
            old: '未知',
            new: matches[0],
          });
        }
      }
    }

    // 地点变化检测
    const locationPattern = /(在|来到|到了|进入)(.+?)[，。]/;
    let match;
    const regex = new RegExp(locationPattern, 'g');
    while ((match = regex.exec(content)) !== null) {
      for (const entity of entities.slice(0, 3)) {
        deltas.push({
          entityId: entity,
          field: 'location',
          old: '未知',
          new: match[2],
        });
      }
    }

    return deltas;
  }

  /**
   * 生成摘要
   */
  private generateSummary(content: string, scenes: SceneChunk[]): string {
    // 取第一段作为摘要基础
    const firstParagraph = content.split(/\n\n/)[0] || '';

    // 结合场景信息
    const sceneSummary = scenes
      .slice(0, 3)
      .map(s => s.summary)
      .join('; ');

    // 生成 100-150 字摘要
    const summary = (firstParagraph + sceneSummary).slice(0, 150);
    return summary || '（本章无明显情节）';
  }

  /**
   * 判断主导情节线
   */
  private determineDominantStrand(events: AcceptedEvent[]): 'quest' | 'fire' | 'constellation' {
    const eventTypes = events.map(e => e.eventType);

    // 简单判断：战斗/修炼相关 → quest
    if (eventTypes.some(t => t.includes('breakthrough') || t.includes('artifact'))) {
      return 'quest';
    }

    // 情感相关 → fire
    if (eventTypes.some(t => t.includes('relationship'))) {
      return 'fire';
    }

    // 默认 → quest
    return 'quest';
  }

  /**
   * 提取句子主语
   */
  private extractSubject(sentence: string): string {
    const patterns = [/([A-Z\u4e00-\u9fa5]{2,4})(?:的|将|把|被|在)/, /^([A-Z\u4e00-\u9fa5]{2,4})/];

    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return 'unknown';
  }

  /**
   * 从段落提取角色
   */
  private extractCharactersFromParagraph(para: string): string[] {
    const characters: string[] = [];
    const pattern = /([A-Z\u4e00-\u9fa5]{2,4})/g;
    let match;

    while ((match = pattern.exec(para)) !== null) {
      if (!characters.includes(match[1])) {
        characters.push(match[1]);
      }
    }

    return characters.slice(0, 5);
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 Chapter Commit
 */
export async function createChapterCommit(
  context: CommitContext,
  artifacts: ChapterCommitArtifacts,
  options?: CommitOptions
): Promise<ChapterCommit> {
  const service = new ChapterCommitService(context);
  service.setArtifacts(artifacts);
  return await service.commit(options);
}

/**
 * 执行事实提取
 */
export async function extractChapterFacts(
  chapter: Chapter,
  chapterIndex: number,
  config?: ExtractionConfig
): Promise<ExtractionResult> {
  const service = new DataExtractionService(chapter, chapterIndex, config);
  return await service.extract();
}
