/**
 * 事实提取器 (DataExtractor)
 * 基于 webnovel-writer 架构
 * 
 * 核心职责：
 * - 从章节内容中提取结构化事实
 * - 识别事件、状态变化、实体、场景
 * - 支持 Commit 机制的数据提取
 */

import { ref } from 'vue';
import type { 
  ExtractedEvent, 
  StateDelta, 
  EntityDelta, 
  Scene,
  ExtractionResult,
} from '@/services/writing/orchestrator/types';
import type { Chapter } from '@/types/project';
import type { EventType } from '@/types/writing-task';

// ============================================================
// 类型定义
// ============================================================

export interface DataExtractorConfig {
  /** 是否提取场景 */
  extractScenes: boolean;
  /** 是否提取实体 */
  extractEntities: boolean;
  /** 是否提取事件 */
  extractEvents: boolean;
  /** 是否提取状态变化 */
  extractStateChanges: boolean;
  /** 最大场景数 */
  maxScenes: number;
  /** 最大事件数 */
  maxEvents: number;
}

export interface ExtractedChapterData {
  /** 章节内容 */
  content: string;
  /** 章节号 */
  chapter: number;
  /** 提取的事件 */
  events: ExtractedEvent[];
  /** 状态变化 */
  stateDeltas: StateDelta[];
  /** 实体变化 */
  entityDeltas: EntityDelta[];
  /** 场景列表 */
  scenes: Scene[];
  /** 出场实体 */
  entitiesAppeared: string[];
  /** 摘要文本 */
  summaryText: string;
  /** 主导情节线 */
  dominantStrand?: 'quest' | 'fire' | 'constellation';
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: DataExtractorConfig = {
  extractScenes: true,
  extractEntities: true,
  extractEvents: true,
  extractStateChanges: true,
  maxScenes: 10,
  maxEvents: 20,
};

// ============================================================
// 提取器实现
// ============================================================

export class DataExtractor {
  private config: DataExtractorConfig;
  
  constructor(config?: Partial<DataExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 提取章节数据
   */
  async extract(chapter: Chapter, chapterIndex: number): Promise<ExtractionResult> {
    const content = chapter.content || '';
    const events: ExtractedEvent[] = [];
    const stateDeltas: StateDelta[] = [];
    const entityDeltas: EntityDelta[] = [];
    const scenes: Scene[] = [];
    const entitiesAppeared: string[] = [];
    
    // 1. 提取场景
    if (this.config.extractScenes) {
      const extractedScenes = this.extractScenes(content);
      scenes.push(...extractedScenes.slice(0, this.config.maxScenes));
    }
    
    // 2. 提取事件
    if (this.config.extractEvents) {
      const extractedEvents = this.extractEvents(content, chapterIndex);
      events.push(...extractedEvents.slice(0, this.config.maxEvents));
    }
    
    // 3. 提取实体
    if (this.config.extractEntities) {
      const extractedEntities = this.extractEntities(content);
      entitiesAppeared.push(...extractedEntities);
    }
    
    // 4. 提取状态变化
    if (this.config.extractStateChanges) {
      const extractedDeltas = this.extractStateChanges(content, entitiesAppeared);
      stateDeltas.push(...extractedDeltas);
    }
    
    // 5. 生成摘要
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
    let sceneIndex = 0;
    
    for (const paragraph of paragraphs) {
      // 检测场景变化标记
      const locationMatch = paragraph.match(/^【(.+?)】|^第(.+?)章|（(.+?)）|^在(.+?)[，,]/);
      const timeMatch = paragraph.match(/(刚才|片刻后|此时|此时|很快|不久|片刻|突然|忽然|蓦然)/);
      
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
          sceneIndex++;
        }
      }
      
      // 提取参与者
      const characters = this.extractCharactersFromText(paragraph);
      if (currentScene.participants) {
        currentScene.participants = [...new Set([...currentScene.participants, ...characters])];
      }
    }
    
    // 添加最后一个场景
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
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    
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
      const subject = this.extractSubject(sentence);
      return {
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        chapter: chapterIndex,
        event_type: 'power_breakthrough',
        subject,
        payload: {
          action: this.extractAction(sentence),
          result: '境界提升',
        },
      };
    }
    
    // 获得物品
    if (/获得|得到|拿到|取得|收获/.test(sentence)) {
      const subject = this.extractSubject(sentence);
      const item = this.extractObject(sentence);
      return {
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        chapter: chapterIndex,
        event_type: 'artifact_obtained',
        subject,
        payload: {
          action: '获得物品',
          result: item,
        },
      };
    }
    
    // 关系变化
    if (/结仇|结盟|结拜|结为|反目|决裂|和解|重归于好|结为/.test(sentence)) {
      const subject = this.extractSubject(sentence);
      const object = this.extractObject(sentence);
      return {
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        chapter: chapterIndex,
        event_type: 'relationship_changed',
        subject,
        payload: {
          action: '关系变化',
          result: object,
        },
      };
    }
    
    // 揭示世界规则
    if (/原来|真相是|竟然是|竟然是|揭秘|揭示/.test(sentence)) {
      const subject = this.extractSubject(sentence);
      return {
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        chapter: chapterIndex,
        event_type: 'world_rule_revealed',
        subject,
        payload: {
          action: '揭示真相',
          result: this.extractKeyInfo(sentence),
        },
      };
    }
    
    // 角色状态变化
    if (/受伤|中毒|昏迷|觉醒|激发|觉醒/.test(sentence)) {
      const subject = this.extractSubject(sentence);
      return {
        event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        chapter: chapterIndex,
        event_type: 'character_state_changed',
        subject,
        payload: {
          action: '状态变化',
          result: this.extractStateChange(sentence),
        },
      };
    }
    
    return null;
  }
  
  // ============================================================
  // 实体提取
  // ============================================================
  
  private extractEntities(content: string): string[] {
    const entities: string[] = [];
    
    // 提取引号中的对话人物
    const dialogues = content.match(/["""]([^"""]+)["""]/g) || [];
    const speakers = new Set<string>();
    
    for (const dialogue of dialogues) {
      const speakerMatch = dialogue.match(/^(.+?)[说问道喊叫笑道哭]/);
      if (speakerMatch) {
        speakers.add(speakerMatch[1].trim());
      }
    }
    
    entities.push(...Array.from(speakers));
    
    // 提取常见实体标记
    const entityPatterns = [
      /([A-Z\u4e00-\u9fa5]{2,4})(?:是|成为|化作|化为)/g, // 角色
      /(?:名为|叫做|名叫|号称)([A-Z\u4e00-\u9fa5]{2,4})/g, // 物品/地点
      /(?:位于|坐落于|处于)([A-Z\u4e00-\u9fa5]{2,6})/g, // 地点
    ];
    
    for (const pattern of entityPatterns) {
      const matches = content.match(pattern) || [];
      entities.push(...matches.map(m => m.trim()).slice(0, 20));
    }
    
    return [...new Set(entities)].slice(0, 50);
  }
  
  private extractCharactersFromText(text: string): string[] {
    const characters: string[] = [];
    
    // 提取引号前的人名
    const dialoguePattern = /([A-Z\u4e00-\u9fa5]{2,4})(?:[说问道喊叫笑道哭])/g;
    const matches = text.match(dialoguePattern);
    if (matches) {
      characters.push(...matches.map(m => m.replace(dialoguePattern, '$1')));
    }
    
    return characters;
  }
  
  // ============================================================
  // 状态变化提取
  // ============================================================
  
  private extractStateChanges(content: string, entities: string[]): StateDelta[] {
    const deltas: StateDelta[] = [];
    
    for (const entity of entities.slice(0, 10)) {
      // 查找该实体的状态变化
      const statePatterns = [
        { pattern: new RegExp(`${entity}(?:从|被)([^，,]+)变为([^，,。！]+)`), field: '状态' },
        { pattern: new RegExp(`${entity}(?:的)([^，,]+)(?:提升|增加|增强|减弱|降低|减少)`), field: '属性' },
        { pattern: new RegExp(`${entity}(?:晋升|突破|升级)为([^，,。]+)`), field: '境界' },
      ];
      
      for (const { pattern, field } of statePatterns) {
        const match = content.match(pattern);
        if (match) {
          deltas.push({
            entity_id: entity,
            field,
            from: match[1]?.trim() || '未知',
            to: match[2]?.trim() || '未知',
          });
        }
      }
    }
    
    return deltas;
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private extractSubject(sentence: string): string {
    // 提取主语
    const subjectMatch = sentence.match(/^([A-Z\u4e00-\u9fa5]{2,4})/);
    return subjectMatch?.[1] || '未知';
  }
  
  private extractObject(sentence: string): string {
    // 提取宾语
    const objectMatch = sentence.match(/(?:获得|得到|拿到|取得)([^，,。]+)/);
    return objectMatch?.[1]?.trim() || '未知';
  }
  
  private extractAction(sentence: string): string {
    // 提取动作
    const actionMatch = sentence.match(/([突破|晋升|升级|进化|蜕变|获得|得到]+)/);
    return actionMatch?.[1] || '执行动作';
  }
  
  private extractKeyInfo(sentence: string): string {
    // 提取关键信息
    const infoMatch = sentence.match(/(?:是|原来|真相是)([^，,。]+)/);
    return infoMatch?.[1]?.trim() || sentence.slice(0, 50);
  }
  
  private extractStateChange(sentence: string): string {
    // 提取状态变化
    const changeMatch = sentence.match(/(?:受伤|中毒|昏迷|觉醒|激发)([^，,。]+)/);
    return changeMatch?.[1]?.trim() || '状态改变';
  }
  
  private generateSummary(content: string, events: ExtractedEvent[], scenes: Scene[]): string {
    // 生成摘要
    if (events.length === 0) {
      return content.slice(0, 200) + (content.length > 200 ? '...' : '');
    }
    
    const eventSummary = events
      .slice(0, 5)
      .map(e => `${e.subject}${e.payload.action}${e.payload.result}`)
      .join('；');
    
    const sceneSummary = scenes.length > 0
      ? `场景：${scenes[0].location}`
      : '';
    
    return `${sceneSummary ? sceneSummary + '。' : ''}本章发生：${eventSummary}`;
  }
  
  // ============================================================
  // 配置更新
  // ============================================================
  
  updateConfig(config: Partial<DataExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useDataExtractor(config?: Partial<DataExtractorConfig>) {
  const extractor = new DataExtractor(config);
  
  return {
    extractor,
    
    extract: (chapter: Chapter, chapterIndex: number) => 
      extractor.extract(chapter, chapterIndex),
    
    extractEvents: (content: string, chapterIndex: number) => 
      extractor.extract({ content } as Chapter, chapterIndex).then(r => r.acceptedEvents),
    
    extractScenes: (content: string) => 
      extractor.extract({ content } as Chapter, 0).then(r => r.scenes),
  };
}
