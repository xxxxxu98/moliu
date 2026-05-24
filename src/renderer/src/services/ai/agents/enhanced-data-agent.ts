/**
 * 增强数据提取 Agent (Enhanced Data Agent)
 * 
 * 职责：
 * 1. 从章节内容中提取事实
 * 2. 评估合同完成度
 * 3. 处理歧义
 */

import { useProjectStore } from '@/stores/project.store';
import type {
  ExtractionResult,
  FulfillmentResult,
  DisambiguationResult,
  ExtractedEvent,
  StateDelta,
  EntityDelta,
  Scene,
  ChapterContract,
} from '@/types/writing-v2';

export interface DataAgentInput {
  chapterNumber: number;
  chapterContent: string;
  contract?: ChapterContract;
}

export interface DataAgentOutput {
  success: boolean;
  extraction?: ExtractionResult;
  fulfillment?: FulfillmentResult;
  disambiguation?: DisambiguationResult;
  error?: string;
}

export class EnhancedDataAgent {
  private projectStore = useProjectStore();

  /**
   * 执行数据提取
   */
  async extract(input: DataAgentInput): Promise<DataAgentOutput> {
    try {
      const { chapterNumber, chapterContent, contract } = input;

      console.log('[DataAgent] 开始提取:', {
        chapter: chapterNumber,
        contentLength: chapterContent.length,
      });

      // 1. 提取事实
      const extraction = await this.extractFacts(chapterNumber, chapterContent);

      // 2. 评估完成度
      const fulfillment = await this.evaluateFulfillment(
        chapterNumber,
        extraction,
        contract
      );

      // 3. 处理歧义
      const disambiguation = await this.resolveAmbiguities(
        chapterNumber,
        extraction,
        contract
      );

      console.log('[DataAgent] 提取完成:', {
        events: extraction.acceptedEvents.length,
        stateDeltas: extraction.stateDeltas.length,
        entities: extraction.entitiesAppeared.length,
        scenes: extraction.scenes.length,
        fulfilled: fulfillment.plannedNodes.length,
        missed: fulfillment.missedNodes.length,
        pending: disambiguation.pending.length,
      });

      return {
        success: true,
        extraction,
        fulfillment,
        disambiguation,
      };
    } catch (error) {
      console.error('[DataAgent] 提取失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '提取失败',
      };
    }
  }

  // ============================================================
  // 事实提取
  // ============================================================

  /**
   * 提取事实
   */
  private async extractFacts(
    chapterNumber: number,
    content: string
  ): Promise<ExtractionResult> {
    const events: ExtractedEvent[] = [];
    const stateDeltas: StateDelta[] = [];
    const entityDeltas: EntityDelta[] = [];
    const entities: string[] = [];
    const scenes: Scene[] = [];

    // 1. 提取对话中的事件
    const dialogues = content.match(/[""][^""]+[""]/g) || [];
    for (const dialogue of dialogues) {
      const cleanDialogue = dialogue.replace(/[""]/g, '');
      this.extractDialogueEvents(chapterNumber, cleanDialogue, events);
    }

    // 2. 提取状态变化
    this.extractStateChanges(content, stateDeltas, entityDeltas);

    // 3. 提取角色名
    const characterMentions = this.extractCharacterMentions(content);
    entities.push(...characterMentions);

    // 4. 提取场景
    this.extractScenes(content, entities, scenes);

    // 5. 生成摘要文本
    const summaryText = this.generateSummaryText(content);

    return {
      acceptedEvents: events,
      stateDeltas,
      entityDeltas,
      entitiesAppeared: [...new Set(entities)],
      scenes: scenes.slice(0, 5),
      summaryText,
    };
  }

  /**
   * 从对话中提取事件
   */
  private extractDialogueEvents(
    chapter: number,
    dialogue: string,
    events: ExtractedEvent[]
  ): void {
    // 检测承诺
    if (/发誓|承诺|保证|答应|一定|一定会的/.test(dialogue)) {
      events.push({
        event_id: this.generateEventId(),
        chapter,
        event_type: 'promise',
        subject: 'speaker',
        payload: {
          action: '做出承诺',
          content: dialogue.slice(0, 100),
        },
      });
    }

    // 检测威胁
    if (/威胁|警告|等着瞧|别怪|小心/.test(dialogue)) {
      events.push({
        event_id: this.generateEventId(),
        chapter,
        event_type: 'threat',
        subject: 'speaker',
        payload: {
          action: '发出威胁',
          content: dialogue.slice(0, 100),
        },
      });
    }

    // 检测关系变化
    if (/绝交|断绝|分手|离婚|结拜|结仇|结盟|合作/.test(dialogue)) {
      events.push({
        event_id: this.generateEventId(),
        chapter,
        event_type: 'relationship_change',
        subject: 'speaker',
        payload: {
          action: '关系变化',
          content: dialogue.slice(0, 100),
        },
      });
    }

    // 检测揭示
    if (/原来|真相|揭秘|其实|没想到|竟然/.test(dialogue)) {
      events.push({
        event_id: this.generateEventId(),
        chapter,
        event_type: 'revelation',
        subject: 'speaker',
        payload: {
          action: '揭示信息',
          content: dialogue.slice(0, 100),
        },
      });
    }
  }

  /**
   * 提取状态变化
   */
  private extractStateChanges(
    content: string,
    stateDeltas: StateDelta[],
    entityDeltas: EntityDelta[]
  ): void {
    // 关系变化
    const relationshipPatterns = [
      /(成为|变成|化为|结识|认识|结交|绝交|断绝|分手|离婚|结拜|结仇|结盟|合作)(.{2,10}?)(?:，|。|$)/,
      /(和|与|跟)(.{2,6}?)(成为|结为|结成|产生|建立)(.{2,10}?)(?:，|。|$)/,
    ];

    for (const pattern of relationshipPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          stateDeltas.push({
            entity_id: 'unknown',
            field: 'relationship',
            from: '',
            to: match.slice(0, 50),
          });
        }
      }
    }

    // 能力变化
    const abilityPatterns = [
      /(获得|失去|提升|提高|降低|削弱|突破|晋升|升级|学会|掌握|领悟)(.{2,10}?)(?:，|。|$)/,
      /(修炼|修炼到|达到|升至)(.{2,10}?)(?:，|。|$)/,
    ];

    for (const pattern of abilityPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          stateDeltas.push({
            entity_id: 'unknown',
            field: 'ability',
            from: '',
            to: match.slice(0, 50),
          });
        }
      }
    }

    // 位置变化
    const locationPatterns = [
      /(来到|回到|前往|到达|抵达|进入|离开|走出|穿越)(.{2,10}?)(?:，|。|$)/,
    ];

    for (const pattern of locationPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          stateDeltas.push({
            entity_id: 'unknown',
            field: 'location',
            from: '',
            to: match.slice(0, 50),
          });
        }
      }
    }

    // 物品变化
    const itemPatterns = [
      /(获得|得到|拿到|丢失|失去|赠予|赠送|购买|获得)(.{2,10}?)(?:，|。|$)/,
    ];

    for (const pattern of itemPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          stateDeltas.push({
            entity_id: 'unknown',
            field: 'item',
            from: '',
            to: match.slice(0, 50),
          });
        }
      }
    }

    // 身份/地位变化
    const statusPatterns = [
      /(成为|任命|选举|册封|封为|尊为|认命为)(.{2,10}?)(?:，|。|$)/,
      /(被剥夺|失去|免除)(.{2,10}?)(?:，|。|$)/,
    ];

    for (const pattern of statusPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          stateDeltas.push({
            entity_id: 'unknown',
            field: 'status',
            from: '',
            to: match.slice(0, 50),
          });
        }
      }
    }
  }

  /**
   * 提取角色名
   */
  private extractCharacterMentions(content: string): string[] {
    const mentions: string[] = [];

    // 从对话标签提取
    const dialogueTags = content.match(/[\u4e00-\u9fa5]{2,4}(?:说|道|问|答|喊|叫|叹|想|问|答|回)/g);
    if (dialogueTags) {
      for (const tag of dialogueTags) {
        const name = tag.replace(/(?:说|道|问|答|喊|叫|叹|想|回)$/, '');
        if (name.length >= 2 && name.length <= 4) {
          mentions.push(name);
        }
      }
    }

    // 从引号内提取说话人
    const quotedNames = content.match(/"[^"]*[""][^""]*"/g);
    if (quotedNames) {
      for (const quote of quotedNames) {
        const nameMatch = quote.match(/^"([^"]+)"/);
        if (nameMatch && nameMatch[1].length >= 2 && nameMatch[1].length <= 4) {
          mentions.push(nameMatch[1]);
        }
      }
    }

    return [...new Set(mentions)];
  }

  /**
   * 提取场景
   */
  private extractScenes(
    content: string,
    entities: string[],
    scenes: Scene[]
  ): void {
    const locationIndicators = [
      /(?:来到|走进|回到|位于|在|来到|进入|到达)([^，。,\n]{2,20}?)(?:，|。|$)/,
      /【([^】]+)】/,
    ];

    for (const indicator of locationIndicators) {
      const regex = new RegExp(indicator, 'gi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const location = (match[1] || match[0]).trim();
        if (location.length >= 2) {
          scenes.push({
            location,
            time: this.extractTimeFromContext(content, match.index),
            participants: entities.slice(0, 3),
          });
        }
      }
    }

    // 提取时间信息
    const timePatterns = [
      /(早上|上午|中午|下午|傍晚|晚上|夜里|凌晨|深夜)/,
      /(昨天|今天|明天|前天|后天)/,
      /(春季|夏季|秋季|冬季)/,
      /(第[一二三四五六七八九十百千]+天)/,
    ];

    let detectedTime = '';
    for (const pattern of timePatterns) {
      const match = content.match(pattern);
      if (match) {
        detectedTime = match[0];
        break;
      }
    }

    // 更新场景时间
    for (const scene of scenes) {
      if (!scene.time && detectedTime) {
        scene.time = detectedTime;
      }
    }
  }

  /**
   * 从上下文中提取时间
   */
  private extractTimeFromContext(content: string, locationIndex: number): string {
    const context = content.slice(
      Math.max(0, locationIndex - 100),
      locationIndex + 100
    );

    const timePatterns = [
      /(早上|上午|中午|下午|傍晚|晚上|夜里|凌晨|深夜)/,
      /(昨天|今天|明天|前天|后天)/,
      /(春季|夏季|秋季|冬季)/,
    ];

    for (const pattern of timePatterns) {
      const match = context.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return '';
  }

  /**
   * 生成摘要文本
   */
  private generateSummaryText(content: string): string {
    if (!content) {
      return '';
    }

    // 提取关键信息
    const keyInfo: string[] = [];

    // 1. 提取前 200 字作为基础摘要
    const beginning = content.slice(0, 200);

    // 2. 提取最后 200 字作为结尾摘要
    const ending = content.slice(-200);

    // 3. 提取关键事件
    const events = content.match(
      /(?:突然|于是|然后|接着|最后|结果|没想到|居然|竟然|原来|其实)/g
    );

    if (events && events.length > 0) {
      keyInfo.push(`关键节点: ${events.slice(0, 5).join('、')}`);
    }

    // 4. 提取地点变化
    const locations = content.match(
      /(?:来到|走进|回到|进入|离开|前往)([^，。]{2,10})/g
    );

    if (locations && locations.length > 0) {
      keyInfo.push(`地点变化: ${[...new Set(locations)].slice(0, 3).join(' → ')}`);
    }

    // 组合摘要
    return [
      beginning.replace(/\n/g, ' ').trim(),
      keyInfo.length > 0 ? keyInfo.join(' | ') : '',
      `结尾: ${ending.replace(/\n/g, ' ').trim()}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // ============================================================
  // 完成度评估
  // ============================================================

  /**
   * 评估完成度
   */
  private async evaluateFulfillment(
    chapterNumber: number,
    extraction: ExtractionResult,
    contract?: ChapterContract
  ): Promise<FulfillmentResult> {
    if (!contract) {
      return {
        plannedNodes: [],
        coveredNodes: [],
        missedNodes: [],
        extraNodes: [],
      };
    }

    const directive = contract.directive;

    // 从章纲提取计划节点
    const plannedNodes: string[] = [];

    if (directive.goal) {
      plannedNodes.push(directive.goal);
    }

    if (directive.CBN) {
      plannedNodes.push(directive.CBN);
    }

    if (directive.CPNs) {
      plannedNodes.push(...directive.CPNs);
    }

    if (directive.CEN) {
      plannedNodes.push(directive.CEN);
    }

    if (directive.mustCoverNodes) {
      plannedNodes.push(...directive.mustCoverNodes);
    }

    // 检查覆盖
    const content = extraction.summaryText;
    const coveredNodes: string[] = [];
    const missedNodes: string[] = [];

    for (const node of plannedNodes) {
      if (this.checkNodeCovered(content, node)) {
        coveredNodes.push(node);
      } else {
        missedNodes.push(node);
      }
    }

    // 提取额外节点（内容中有但计划中没有的）
    const extraNodes = this.extractExtraNodes(content, plannedNodes);

    return {
      plannedNodes,
      coveredNodes,
      missedNodes,
      extraNodes,
    };
  }

  /**
   * 检查节点是否被覆盖
   */
  private checkNodeCovered(content: string, node: string): boolean {
    const keywords = node
      .match(/[\u4e00-\u9fa5]{2,}/g)
      ?.filter((w) => w.length >= 2) || [];

    if (keywords.length === 0) {
      return true;
    }

    // 至少需要匹配一半的关键词
    const matchedCount = keywords.filter((k) => content.includes(k)).length;
    return matchedCount >= keywords.length * 0.5;
  }

  /**
   * 提取额外节点
   */
  private extractExtraNodes(content: string, plannedNodes: string[]): string[] {
    const extraNodes: string[] = [];

    // 检测重要事件（可能未在计划中）
    const importantPatterns = [
      /(?:突破|晋升|升级|获得|失去|死亡|受伤|被发现|被揭露|反转)/,
      /(?:原来|真相|揭秘|震惊)/,
      /(?:关系|结交|结仇|绝交|分手|复合)/,
    ];

    for (const pattern of importantPatterns) {
      if (pattern.test(content)) {
        const match = content.match(pattern);
        if (match && !plannedNodes.some((n) => n.includes(match[0]))) {
          extraNodes.push(match[0]);
        }
      }
    }

    return [...new Set(extraNodes)];
  }

  // ============================================================
  // 歧义处理
  // ============================================================

  /**
   * 处理歧义
   */
  private async resolveAmbiguities(
    chapterNumber: number,
    extraction: ExtractionResult,
    contract?: ChapterContract
  ): Promise<DisambiguationResult> {
    const pending: DisambiguationResult['pending'] = [];
    const resolved: DisambiguationResult['resolved'] = [];

    // 1. 检查承诺/威胁是否需要跟进
    for (const event of extraction.acceptedEvents) {
      if (event.event_type === 'promise' || event.event_type === 'threat') {
        pending.push({
          id: event.event_id,
          question: `检查${event.event_type === 'promise' ? '承诺' : '威胁'}是否需要后续跟进: ${event.payload.content}`,
          status: 'pending',
        });
      }
    }

    // 2. 检查未提及的重要角色
    if (contract?.characters) {
      for (const char of contract.characters) {
        if (!extraction.entitiesAppeared.includes(char.name)) {
          pending.push({
            id: `char_${char.id}`,
            question: `重要角色"${char.name}"在本章未出场，是否需要调整？`,
            status: 'pending',
          });
        }
      }
    }

    // 3. 检查状态变化是否完整
    for (const delta of extraction.stateDeltas) {
      if (delta.field === 'relationship' && !delta.from) {
        pending.push({
          id: `rel_${delta.entity_id}_${Date.now()}`,
          question: `关系变化"${delta.to}"的起始状态不明确`,
          status: 'pending',
        });
      }
    }

    // 4. 检查场景变化是否合理
    if (extraction.scenes.length > 3) {
      pending.push({
        id: `scene_${chapterNumber}_${Date.now()}`,
        question: `本章场景切换较频繁（${extraction.scenes.length}个），是否合理？`,
        status: 'pending',
      });
    }

    return { pending, resolved };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ============================================================
// Composable 导出
// ============================================================

let dataAgentInstance: EnhancedDataAgent | null = null;

export function useEnhancedDataAgent(): EnhancedDataAgent {
  if (!dataAgentInstance) {
    dataAgentInstance = new EnhancedDataAgent();
  }
  return dataAgentInstance;
}

export default EnhancedDataAgent;
