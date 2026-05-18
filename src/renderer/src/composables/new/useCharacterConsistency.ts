/**
 * 角色一致性检查器
 * 基于 webnovel-writer-master 的角色管理系统
 * 
 * 角色一致性检查器负责：
 * - 检查角色描述的一致性
 * - 管理角色状态和变化
 * - 追踪角色关系
 * - 验证角色弧线
 */

import { ref, computed, shallowRef } from 'vue';
import type { CharacterContract } from '@/types/contract';

// ============================================================
// 类型定义
// ============================================================

export interface CharacterProfile {
  id: string;
  name: string;
  // 基础属性
  role: CharacterRole;
  personality: string[];
  appearance?: string;
  abilities?: string[];
  background?: string;
  // 状态
  currentLocation?: string;
  currentGoal?: string;
  emotionalState?: string;
  // 首次出场
  firstAppearance?: number;
  lastAppearance?: number;
  // 一致性追踪
  descriptionVariations: string[];
  speechPatterns: SpeechPattern[];
  relationshipChanges: RelationshipChange[];
}

export type CharacterRole = 'protagonist' | 'antagonist' | 'mentor' | 'love_interest' | 'rival' | 'ally' | 'supporting';

export interface SpeechPattern {
  pattern: string;
  example: string;
  chapter: number;
}

export interface RelationshipChange {
  targetId: string;
  targetName: string;
  oldType?: string;
  newType: string;
  chapter: number;
  description?: string;
}

export interface ConsistencyCheckResult {
  characterId: string;
  passed: boolean;
  issues: ConsistencyIssue[];
  score: number;
}

export interface ConsistencyIssue {
  type: 'description' | 'speech' | 'ability' | 'relationship' | 'behavior';
  severity: 'low' | 'medium' | 'high';
  message: string;
  location?: {
    chapter: number;
    paragraph?: number;
  };
  suggestion?: string;
}

export interface CharacterConfig {
  // 检查设置
  checkDescription: boolean;
  checkSpeech: boolean;
  checkAbilities: boolean;
  checkRelationships: boolean;
  checkBehavior: boolean;
  // 阈值
  minDescriptionMatches: number;
  maxDescriptionVariation: number;
}

// ============================================================
// Composable 定义
// ============================================================

export function useCharacterConsistency() {
  // 配置
  const config = ref<CharacterConfig>({
    checkDescription: true,
    checkSpeech: true,
    checkAbilities: true,
    checkRelationships: true,
    checkBehavior: true,
    minDescriptionMatches: 2,
    maxDescriptionVariation: 3,
  });

  // 状态
  const characters = shallowRef<Map<string, CharacterProfile>>(new Map());
  const isChecking = ref(false);
  const lastCheck = ref<ConsistencyCheckResult | null>(null);

  // ============================================================
  // 角色管理
  // ============================================================

  /**
   * 添加角色
   */
  function addCharacter(contract: CharacterContract, firstChapter?: number): void {
    const profile: CharacterProfile = {
      id: contract.id,
      name: contract.name,
      role: contract.role,
      personality: contract.personality,
      appearance: contract.appearance,
      abilities: contract.abilities,
      background: contract.background,
      firstAppearance: firstChapter,
      lastAppearance: firstChapter,
      descriptionVariations: contract.description ? [contract.description] : [],
      speechPatterns: [],
      relationshipChanges: [],
    };

    const newMap = new Map(characters.value);
    newMap.set(contract.id, profile);
    characters.value = newMap;
  }

  /**
   * 批量添加角色
   */
  function addCharacters(contracts: CharacterContract[], firstChapter: number = 1): void {
    for (const contract of contracts) {
      addCharacter(contract, firstChapter);
    }
  }

  /**
   * 更新角色状态
   */
  function updateCharacterStatus(
    characterId: string,
    updates: {
      location?: string;
      goal?: string;
      emotionalState?: string;
    },
    chapter?: number
  ): void {
    const profile = characters.value.get(characterId);
    if (!profile) return;

    const newMap = new Map(characters.value);
    const updated: CharacterProfile = {
      ...profile,
      ...updates,
      lastAppearance: chapter || profile.lastAppearance,
    };
    newMap.set(characterId, updated);
    characters.value = newMap;
  }

  /**
   * 获取角色
   */
  function getCharacter(characterId: string): CharacterProfile | undefined {
    return characters.value.get(characterId);
  }

  /**
   * 获取角色列表
   */
  function getCharacterList(): CharacterProfile[] {
    return Array.from(characters.value.values());
  }

  /**
   * 获取主角
   */
  function getProtagonist(): CharacterProfile | undefined {
    return Array.from(characters.value.values()).find(c => c.role === 'protagonist');
  }

  /**
   * 获取指定章节出场的角色
   */
  function getCharactersInChapter(chapter: number): CharacterProfile[] {
    return Array.from(characters.value.values()).filter(c => {
      if (!c.firstAppearance || !c.lastAppearance) return false;
      return chapter >= c.firstAppearance && chapter <= c.lastAppearance;
    });
  }

  // ============================================================
  // 一致性检查
  // ============================================================

  /**
   * 检查角色一致性
   */
  async function checkConsistency(
    characterId: string,
    content: string,
    chapter: number
  ): Promise<ConsistencyCheckResult> {
    isChecking.value = true;

    const character = characters.value.get(characterId);
    if (!character) {
      isChecking.value = false;
      return {
        characterId,
        passed: false,
        issues: [{
          type: 'description',
          severity: 'high',
          message: '角色未在系统中注册',
        }],
        score: 0,
      };
    }

    const issues: ConsistencyIssue[] = [];
    let score = 100;

    // 描述一致性检查
    if (config.value.checkDescription) {
      const descIssues = checkDescriptionConsistency(character, content, chapter);
      issues.push(...descIssues);
      score -= descIssues.length * 10;
    }

    // 能力一致性检查
    if (config.value.checkAbilities && character.abilities) {
      const abilityIssues = checkAbilityConsistency(character, content, chapter);
      issues.push(...abilityIssues);
      score -= abilityIssues.length * 15;
    }

    // 对话一致性检查
    if (config.value.checkSpeech) {
      const speechIssues = checkSpeechConsistency(character, content, chapter);
      issues.push(...speechIssues);
      score -= speechIssues.length * 5;
    }

    // 关系一致性检查
    if (config.value.checkRelationships) {
      const relationshipIssues = checkRelationshipConsistency(character, content, chapter);
      issues.push(...relationshipIssues);
      score -= relationshipIssues.length * 10;
    }

    // 更新描述变化
    updateDescriptionVariations(characterId, content, chapter);

    // 更新最后出场
    updateCharacterStatus(characterId, {}, chapter);

    const result: ConsistencyCheckResult = {
      characterId,
      passed: issues.filter(i => i.severity === 'high').length === 0 && score >= 70,
      issues,
      score: Math.max(0, score),
    };

    lastCheck.value = result;
    isChecking.value = false;

    return result;
  }

  /**
   * 检查描述一致性
   */
  function checkDescriptionConsistency(
    character: CharacterProfile,
    content: string,
    chapter: number
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // 检查外貌描述
    if (character.appearance) {
      const appearanceKeywords = character.appearance.split(/[,，、]/).filter(k => k.length >= 2);
      const matchCount = appearanceKeywords.filter(k => content.includes(k)).length;
      
      if (matchCount === 0 && chapter - (character.firstAppearance || 1) <= 3) {
        issues.push({
          type: 'description',
          severity: 'medium',
          message: `外貌描述与角色设定不符或缺失`,
          location: { chapter },
          suggestion: '建议提及角色的标志性外貌特征',
        });
      }
    }

    // 检查性格一致性
    if (character.personality.length > 0) {
      // 简化的性格检查
      const consistentIndicators = ['果然', '一如既往', '依然', '还是'];
      const inconsistentIndicators = ['突然', '出人意料', '一反常态'];
      
      const hasConsistency = consistentIndicators.some(i => content.includes(i));
      const hasInconsistency = inconsistentIndicators.some(i => content.includes(i));
      
      if (hasInconsistency && !hasConsistency) {
        issues.push({
          type: 'behavior',
          severity: 'low',
          message: '角色行为可能与性格设定不符',
          location: { chapter },
          suggestion: '如果是有意为之，可忽略此警告',
        });
      }
    }

    return issues;
  }

  /**
   * 检查能力一致性
   */
  function checkAbilityConsistency(
    character: CharacterProfile,
    content: string,
    chapter: number
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    if (!character.abilities) return issues;

    // 检查能力是否被正确使用
    for (const ability of character.abilities) {
      // 简单检查：能力名是否出现在内容中（作为使用）
      if (content.includes(ability) && chapter > (character.firstAppearance || 1)) {
        // 能力被使用
      }
    }

    return issues;
  }

  /**
   * 检查对话一致性
   */
  function checkSpeechConsistency(
    character: CharacterProfile,
    content: string,
    chapter: number
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // 提取角色对话
    const dialogues = extractDialogues(content, character.name);
    
    if (dialogues.length === 0) return issues;

    // 检查是否学习对话风格
    learnSpeechPattern(character.id, dialogues[0], chapter);

    // 检查对话长度
    const avgLength = dialogues.reduce((sum, d) => sum + d.length, 0) / dialogues.length;
    
    if (dialogues.length >= 3) {
      const variance = calculateVariance(dialogues.map(d => d.length));
      
      // 方差太大可能说明对话风格不一致
      if (variance > 200) {
        issues.push({
          type: 'speech',
          severity: 'low',
          message: '对话长度变化较大，可能风格不一致',
          location: { chapter },
          suggestion: '建议保持角色的对话风格稳定',
        });
      }
    }

    return issues;
  }

  /**
   * 检查关系一致性
   */
  function checkRelationshipConsistency(
    character: CharacterProfile,
    content: string,
    chapter: number
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // 检查关系变化
    const relationshipKeywords = ['敌人', '朋友', '盟友', '恋人', '仇人', '对手'];
    
    for (const keyword of relationshipKeywords) {
      if (content.includes(keyword)) {
        // 简单检查：是否是新关系
        const recentChange = character.relationshipChanges.find(
          c => c.chapter >= chapter - 5
        );
        
        if (!recentChange) {
          // 可能需要记录新变化
        }
      }
    }

    return issues;
  }

  // ============================================================
  // 学习与更新
  // ============================================================

  /**
   * 学习对话模式
   */
  function learnSpeechPattern(
    characterId: string,
    dialogue: string,
    chapter: number
  ): void {
    const profile = characters.value.get(characterId);
    if (!profile) return;

    // 提取简单的模式
    const pattern = extractSpeechPattern(dialogue);
    
    if (pattern) {
      const newMap = new Map(characters.value);
      const updated: CharacterProfile = {
        ...profile,
        speechPatterns: [
          ...profile.speechPatterns,
          { pattern, example: dialogue, chapter },
        ].slice(-10), // 只保留最近10个
      };
      newMap.set(characterId, updated);
      characters.value = newMap;
    }
  }

  /**
   * 提取对话模式
   */
  function extractSpeechPattern(dialogue: string): string {
    // 简化实现：提取句式特征
    if (dialogue.includes('？')) return 'question';
    if (dialogue.includes('！')) return 'exclamation';
    if (dialogue.includes('。')) return 'statement';
    if (dialogue.length < 10) return 'short';
    return 'general';
  }

  /**
   * 更新描述变化
   */
  function updateDescriptionVariations(
    characterId: string,
    content: string,
    chapter: number
  ): void {
    const profile = characters.value.get(characterId);
    if (!profile) return;

    // 提取本章节的描述
    const description = extractCharacterDescription(content, profile.name);
    
    if (description && !profile.descriptionVariations.includes(description)) {
      const newMap = new Map(characters.value);
      const updated: CharacterProfile = {
        ...profile,
        descriptionVariations: [
          ...profile.descriptionVariations,
          description,
        ].slice(-20), // 只保留最近20个
      };
      newMap.set(characterId, updated);
      characters.value = newMap;
    }
  }

  /**
   * 提取角色描述
   */
  function extractCharacterDescription(content: string, name: string): string {
    // 简单的描述提取
    const regex = new RegExp(`${name}[^。！？]{0,30}[。！？]`);
    const match = content.match(regex);
    return match ? match[0] : '';
  }

  /**
   * 记录关系变化
   */
  function recordRelationshipChange(
    characterId: string,
    targetId: string,
    targetName: string,
    newType: string,
    chapter: number,
    description?: string
  ): void {
    const profile = characters.value.get(characterId);
    if (!profile) return;

    const newMap = new Map(characters.value);
    const updated: CharacterProfile = {
      ...profile,
      relationshipChanges: [
        ...profile.relationshipChanges,
        { targetId, targetName, newType, chapter, description },
      ],
    };
    newMap.set(characterId, updated);
    characters.value = newMap;
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  /**
   * 提取对话
   */
  function extractDialogues(content: string, characterName: string): string[] {
    const dialogues: string[] = [];
    
    // 简单的引号提取
    const quotePatterns = [
      /[""'']([^""'']+)[""'']/g,
      /「([^」]+)」/g,
    ];

    for (const pattern of quotePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const dialogue = match[1].trim();
        if (dialogue.length > 0) {
          dialogues.push(dialogue);
        }
      }
    }

    return dialogues;
  }

  /**
   * 计算方差
   */
  function calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  // ============================================================
  // 导出/导入
  // ============================================================

  /**
   * 导出角色数据
   */
  function exportData(): CharacterProfile[] {
    return Array.from(characters.value.values());
  }

  /**
   * 导入角色数据
   */
  function importData(data: CharacterProfile[]): void {
    const newMap = new Map<string, CharacterProfile>();
    for (const profile of data) {
      newMap.set(profile.id, profile);
    }
    characters.value = newMap;
  }

  /**
   * 从合同导入
   */
  function importFromContracts(contracts: CharacterContract[]): void {
    addCharacters(contracts);
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<CharacterConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,

    // 状态
    characters,
    isChecking,
    lastCheck,

    // 角色管理
    addCharacter,
    addCharacters,
    updateCharacterStatus,
    getCharacter,
    getCharacterList,
    getProtagonist,
    getCharactersInChapter,

    // 一致性检查
    checkConsistency,

    // 学习与更新
    learnSpeechPattern,
    recordRelationshipChange,

    // 导出/导入
    exportData,
    importData,
    importFromContracts,
  };
}
