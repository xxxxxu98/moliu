/**
 * 数据提取器
 * 从章节内容中提取结构化事实
 */

import type {
  ExtractedEvent,
  StateDelta,
  EntityDelta,
  Scene,
  ExtractionResult,
} from '@/services/writing/orchestrator/types';
import type { Chapter } from '@/types/project';

// ============================================================
// 类型定义
// ============================================================

export interface DataExtractorConfig {
  extractScenes: boolean;
  extractEntities: boolean;
  extractEvents: boolean;
  extractStateChanges: boolean;
  maxScenes: number;
  maxEvents: number;
}

export interface ExtractedChapterData {
  content: string;
  chapter: number;
  events: ExtractedEvent[];
  stateDeltas: StateDelta[];
  entityDeltas: EntityDelta[];
  scenes: Scene[];
  entitiesAppeared: string[];
  summaryText: string;
  dominantStrand?: 'quest' | 'fire' | 'constellation';
}

const DEFAULT_CONFIG: DataExtractorConfig = {
  extractScenes: true,
  extractEntities: true,
  extractEvents: true,
  extractStateChanges: true,
  maxScenes: 10,
  maxEvents: 20,
};

// ============================================================
// 提取器
// ============================================================

export class DataExtractor {
  private config: DataExtractorConfig;

  constructor(config: Partial<DataExtractorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async extract(chapter: Chapter, chapterIndex: number): Promise<ExtractionResult> {
    const content = chapter.content || '';
    const events: ExtractedEvent[] = [];
    const stateDeltas: StateDelta[] = [];
    const entityDeltas: EntityDelta[] = [];
    const scenes: Scene[] = [];
    const entitiesAppeared: string[] = [];

    if (this.config.extractScenes) {
      const extractedScenes = this.extractScenes(content);
      scenes.push(...extractedScenes.slice(0, this.config.maxScenes));
    }

    if (this.config.extractEvents) {
      const extractedEvents = this.extractEvents(content, chapterIndex);
      events.push(...extractedEvents.slice(0, this.config.maxEvents));
    }

    if (this.config.extractEntities) {
      const extractedEntities = this.extractEntities(content);
      entitiesAppeared.push(...extractedEntities);
    }

    if (this.config.extractStateChanges) {
      const extractedDeltas = this.extractStateChanges(content, entitiesAppeared);
      stateDeltas.push(...extractedDeltas);
    }

    const summaryText = this.generateSummary(content, events, scenes);

    return {
      acceptedEvents: events,
      stateDeltas,
      entityDeltas,
      entitiesAppeared: [...new Set(entitiesAppeared)],
      scenes,
      summaryText,
    };
  }

  // ============================================================
  // 场景提取
  // ============================================================

  private extractScenes(content: string): Scene[] {
    const scenes: Scene[] = [];
    const paragraphs = content.split(/\n\s*\n/);

    let currentScene: Partial<Scene> = {};

    for (const paragraph of paragraphs) {
      const locationMatch = paragraph.match(/^【(.+?)】|^第(.+?)章|（(.+?)）|^在(.+?)[，,]/);
      const timeMatch = paragraph.match(/(?:刚才|片刻后|此时|很快|不久|片刻|突然|忽然|蓦然)/);

      if (locationMatch) {
        const location = locationMatch[1] || locationMatch[2] || locationMatch[3] || locationMatch[4];
        if (location && location !== currentScene.location) {
          if (currentScene.location) {
            scenes.push(currentScene as Scene);
          }
          currentScene = {
            location,
            time: timeMatch?.[1] || '时间不明',
            participants: [],
          };
        }
      }

      const characters = this.extractCharactersFromText(paragraph);
      if (currentScene.participants && characters.length > 0) {
        currentScene.participants = [...new Set([...currentScene.participants, ...characters])];
      }
    }

    if (currentScene.location) {
      scenes.push(currentScene as Scene);
    }

    return scenes;
  }

  // ============================================================
  // 事件提取
  // ============================================================

  private extractEvents(content: string, chapterIndex: number): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const sentences = content.split(/[。！？]/).filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      const event = this.identifyEvent(sentence.trim(), chapterIndex);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  private identifyEvent(sentence: string, chapterIndex: number): ExtractedEvent | null {
    // 境界突破
    if (/突破|晋升|升级|进化|蜕变/.test(sentence)) {
      return {
        event_id: this.generateEventId(),
        chapter: chapterIndex,
        event_type: 'power_breakthrough',
        subject: this.extractSubject(sentence),
        payload: {
          action: this.extractAction(sentence),
          result: '境界提升',
        },
      };
    }

    // 获得物品
    if (/获得|得到|拿到|取得|收获/.test(sentence)) {
      return {
        event_id: this.generateEventId(),
        chapter: chapterIndex,
        event_type: 'artifact_obtained',
        subject: this.extractSubject(sentence),
        payload: {
          action: '获得物品',
          result: this.extractObject(sentence),
        },
      };
    }

    // 关系变化
    if (/结仇|结盟|结拜|结为|反目|决裂|和解|重归于好/.test(sentence)) {
      return {
        event_id: this.generateEventId(),
        chapter: chapterIndex,
        event_type: 'relationship_changed',
        subject: this.extractSubject(sentence),
        payload: {
          action: '关系变化',
          result: this.extractObject(sentence),
        },
      };
    }

    // 揭示世界规则
    if (/原来|真相是|揭秘|揭示/.test(sentence)) {
      return {
        event_id: this.generateEventId(),
        chapter: chapterIndex,
        event_type: 'world_rule_revealed',
        subject: this.extractSubject(sentence),
        payload: {
          action: '揭示真相',
          result: this.extractKeyInfo(sentence),
        },
      };
    }

    // 角色状态变化
    if (/受伤|中毒|昏迷|觉醒|激发/.test(sentence)) {
      return {
        event_id: this.generateEventId(),
        chapter: chapterIndex,
        event_type: 'character_state_changed',
        subject: this.extractSubject(sentence),
        payload: {
          action: '状态变化',
          result: this.extractStateChange(sentence),
        },
      };
    }

    return null;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============================================================
  // 实体提取
  // ============================================================

  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    const dialogues = content.match(/["""]([^"""]+)["""]/g) || [];
    const speakers = new Set<string>();

    for (const dialogue of dialogues) {
      const speakerMatch = dialogue.match(/^(.+?)[说问道喊叫笑道哭]/);
      if (speakerMatch) {
        speakers.add(speakerMatch[1].trim());
      }
    }

    entities.push(...Array.from(speakers));

    const entityPatterns = [
      /([A-Z\u4e00-\u9fa5]{2,4})(?:是|成为|化作|化为)/g,
      /(?:名为|叫做|名叫|号称)([A-Z\u4e00-\u9fa5]{2,4})/g,
      /(?:位于|坐落于|处于)([A-Z\u4e00-\u9fa5]{2,6})/g,
    ];

    for (const pattern of entityPatterns) {
      const matches = content.match(pattern) || [];
      entities.push(...matches.map((m) => m.trim()).slice(0, 20));
    }

    return [...new Set(entities)].slice(0, 50);
  }

  private extractCharactersFromText(text: string): string[] {
    const characters: string[] = [];
    const dialoguePattern = /([A-Z\u4e00-\u9fa5]{2,4})(?:[说问道喊叫笑道哭])/g;
    const matches = text.match(dialoguePattern);
    if (matches) {
      characters.push(...matches.map((m) => m.replace(dialoguePattern, '$1')));
    }
    return characters;
  }

  // ============================================================
  // 状态变化提取
  // ============================================================

  private extractStateChanges(content: string, entities: string[]): StateDelta[] {
    const deltas: StateDelta[] = [];

    for (const entity of entities.slice(0, 10)) {
      const statePatterns = [
        { pattern: new RegExp(`${entity}(?:从|被)([^，,]+)变为([^，,。！]+)`), field: '状态' },
        { pattern: new RegExp(`${entity}(?:的)([^，,]+)(?:提升|增加|增强|减弱|降低|减少)`), field: '属性' },
        { pattern: new RegExp(`${entity}(?:晋升|突破|升级)为([^，,。]+)`), field: '境界' },
      ];

      for (const { pattern, field } of statePatterns) {
        try {
          const match = content.match(pattern);
          if (match) {
            deltas.push({
              entity_id: entity,
              field,
              from: match[1]?.trim() || '未知',
              to: match[2]?.trim() || '未知',
            });
          }
        } catch {
          // 正则表达式可能失败，忽略
        }
      }
    }

    return deltas;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private extractSubject(sentence: string): string {
    const subjectMatch = sentence.match(/^([A-Z\u4e00-\u9fa5]{2,4})/);
    return subjectMatch?.[1] || '未知';
  }

  private extractObject(sentence: string): string {
    const objectMatch = sentence.match(/(?:获得|得到|拿到|取得)([^，,。]+)/);
    return objectMatch?.[1]?.trim() || '未知';
  }

  private extractAction(sentence: string): string {
    const actionMatch = sentence.match(/(?:突破|晋升|升级|进化|蜕变|获得|得到)+/);
    return actionMatch?.[1] || '执行动作';
  }

  private extractKeyInfo(sentence: string): string {
    const infoMatch = sentence.match(/(?:是|原来|真相是)([^，,。]+)/);
    return infoMatch?.[1]?.trim() || sentence.slice(0, 50);
  }

  private extractStateChange(sentence: string): string {
    const changeMatch = sentence.match(/(?:受伤|中毒|昏迷|觉醒|激发)([^，,。]+)/);
    return changeMatch?.[1]?.trim() || '状态改变';
  }

  private generateSummary(content: string, events: ExtractedEvent[], scenes: Scene[]): string {
    if (events.length === 0) {
      return content.slice(0, 200) + (content.length > 200 ? '...' : '');
    }

    const eventSummary = events
      .slice(0, 5)
      .map((e) => `${e.subject}${e.payload.action}${e.payload.result}`)
      .join('；');

    const sceneSummary = scenes.length > 0
      ? `场景：${scenes[0].location}`
      : '';

    return `${sceneSummary ? sceneSummary + '。' : ''}本章发生：${eventSummary}`;
  }

  updateConfig(config: Partial<DataExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================
// Composable
// ============================================================

export function useDataExtractor(config?: Partial<DataExtractorConfig>) {
  const extractor = new DataExtractor(config);

  return {
    extractor,

    extract: (chapter: Chapter, chapterIndex: number) =>
      extractor.extract(chapter, chapterIndex),

    extractEvents: (content: string, chapterIndex: number) =>
      extractor.extract({ content } as Chapter, chapterIndex).then((r) => r.acceptedEvents),

    extractScenes: (content: string) =>
      extractor.extract({ content } as Chapter, 0).then((r) => r.scenes),

    updateConfig: (config: Partial<DataExtractorConfig>) =>
      extractor.updateConfig(config),
  };
}
