/**
 * 合同管理器
 * 基于 webnovel-writer 架构
 * 
 * 负责：
 * - 加载和保存各层级合同
 * - 生成章节合同
 * - 验证章节是否符合合同
 * - 管理合同的锁定状态
 */

import { ref, computed } from 'vue';
import type {
  MasterContract,
  VolumeContract,
  ChapterContract,
  ReviewContract,
  ContractManager as IContractManager,
  ContractValidationResult,
  ContractViolation,
} from './types';
import { ContractLevel, ChapterType } from './types';
import { useProjectStore } from '@/stores/project.store';

export class ContractManager implements IContractManager {
  // 状态
  private masterContract = ref<MasterContract | null>(null);
  private volumeContracts = ref<Map<number, VolumeContract>>(new Map());
  private chapterContracts = ref<Map<number, ChapterContract>>(new Map());
  private lockedChapters = ref<Set<number>>(new Set());
  
  // Store
  private projectStore = useProjectStore();
  
  // ============================================================
  // 加载合同
  // ============================================================
  
  async loadMasterContract(): Promise<MasterContract | null> {
    if (this.masterContract.value) {
      return this.masterContract.value;
    }
    
    const project = this.projectStore.currentProject;
    if (!project) return null;
    
    // 从项目数据中构建主合同
    this.masterContract.value = this.buildMasterContract(project);
    return this.masterContract.value;
  }
  
  async loadVolumeContract(volumeNumber: number): Promise<VolumeContract | null> {
    if (this.volumeContracts.value.has(volumeNumber)) {
      return this.volumeContracts.value.get(volumeNumber)!;
    }
    
    const project = this.projectStore.currentProject;
    if (!project) return null;
    
    const volume = project.volumes?.find(v => v.orderIndex + 1 === volumeNumber);
    if (!volume) return null;
    
    const contract = this.buildVolumeContract(volume, project);
    this.volumeContracts.value.set(volumeNumber, contract);
    return contract;
  }
  
  async loadChapterContract(chapterNumber: number): Promise<ChapterContract | null> {
    if (this.chapterContracts.value.has(chapterNumber)) {
      return this.chapterContracts.value.get(chapterNumber)!;
    }
    
    const project = this.projectStore.currentProject;
    if (!project) return null;
    
    const chapter = project.sortedChapters?.find(
      c => c.orderIndex + 1 === chapterNumber
    );
    
    if (!chapter) return null;
    
    const contract = await this.generateChapterContract(chapterNumber);
    this.chapterContracts.value.set(chapterNumber, contract);
    return contract;
  }
  
  // ============================================================
  // 保存合同
  // ============================================================
  
  async saveMasterContract(contract: MasterContract): Promise<void> {
    this.masterContract.value = contract;
    // TODO: 持久化到文件/数据库
  }
  
  async saveVolumeContract(contract: VolumeContract): Promise<void> {
    this.volumeContracts.value.set(contract.volumeNumber, contract);
    // TODO: 持久化
  }
  
  async saveChapterContract(contract: ChapterContract): Promise<void> {
    this.chapterContracts.value.set(contract.chapterNumber, contract);
    // TODO: 持久化
  }
  
  // ============================================================
  // 生成合同
  // ============================================================
  
  async generateChapterContract(chapterNumber: number): Promise<ChapterContract> {
    const project = this.projectStore.currentProject;
    const chapter = project?.sortedChapters?.find(
      c => c.orderIndex + 1 === chapterNumber
    );
    
    // 确定章节类型
    const chapterType = this.determineChapterType(chapterNumber, chapter?.plotSummary || '');
    
    // 构建情节节点
    const nodes = this.buildPlotNodes(chapterNumber, chapter);
    
    // 构建指令
    const directive = this.buildDirective(chapterNumber, chapter, project);
    
    // 构建约束
    const constraints = this.buildConstraints(chapterNumber, project);
    
    // 构建推理
    const reasoning = this.buildReasoning(project);
    
    // 构建时间线
    const timeline = this.buildTimeline(chapterNumber, chapter);
    
    const contract: ChapterContract = {
      id: `chapter_${chapterNumber}`,
      level: ContractLevel.CHAPTER,
      chapterNumber,
      title: chapter?.title || `第${chapterNumber}章`,
      chapterType,
      directive,
      nodes,
      constraints,
      reasoning,
      timeline,
      source: 'outline',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    return contract;
  }
  
  async generateRuntimeContract(
    chapterNumber: number,
    genre: string
  ): Promise<ChapterContract> {
    // 运行时合同基于详细大纲生成，包含更详细的节点信息
    const baseContract = await this.generateChapterContract(chapterNumber);
    
    // 添加运行时特定的调整
    baseContract.source = 'runtime';
    baseContract.updatedAt = new Date().toISOString();
    
    return baseContract;
  }
  
  // ============================================================
  // 锁定/解锁
  // ============================================================
  
  lockChapter(chapterNumber: number): void {
    this.lockedChapters.value.add(chapterNumber);
  }
  
  unlockChapter(chapterNumber: number): void {
    this.lockedChapters.value.delete(chapterNumber);
  }
  
  isChapterLocked(chapterNumber: number): boolean {
    return this.lockedChapters.value.has(chapterNumber);
  }
  
  // ============================================================
  // 验证
  // ============================================================
  
  validateChapterContract(
    chapterNumber: number,
    content: string
  ): ContractValidationResult {
    const contract = this.chapterContracts.value.get(chapterNumber);
    if (!contract) {
      return { valid: true, violations: [], warnings: ['未找到合同'] };
    }
    
    const violations: ContractViolation[] = [];
    const warnings: string[] = [];
    
    // 检查 mustCover
    for (const mustCover of contract.constraints.mustCover) {
      if (!content.includes(mustCover)) {
        violations.push({
          type: 'must_cover',
          description: `未包含必须内容: ${mustCover}`,
          severity: 'critical',
        });
      }
    }
    
    // 检查 forbiddenZones
    for (const forbidden of contract.constraints.forbiddenZones) {
      if (content.includes(forbidden)) {
        violations.push({
          type: 'forbidden',
          description: `包含禁止内容: ${forbidden}`,
          severity: 'critical',
        });
      }
    }
    
    // 检查情节节点
    if (contract.nodes.cbn && !this.containsNode(content, contract.nodes.cbn)) {
      warnings.push(`未明确包含开始节点: ${contract.nodes.cbn}`);
    }
    
    if (contract.nodes.cen && !this.containsNode(content, contract.nodes.cen)) {
      warnings.push(`未明确包含结束节点: ${contract.nodes.cen}`);
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private buildMasterContract(project: any): MasterContract {
    return {
      id: `master_${project.id}`,
      level: ContractLevel.MASTER,
      projectTitle: project.title,
      genre: project.genre || '通用',
      subGenres: project.subGenres || [],
      targetWordCount: project.targetWordCount || 800000,
      estimatedWordCount: project.estimatedWordCount || 800000,
      synopsis: project.synopsis || '',
      coreConflict: project.coreConflict || '',
      worldSetting: {
        type: '玄幻',
        locations: project.locations || [],
        factions: project.factions || [],
        rules: project.rules || [],
        timeline: '',
      },
      powerSystem: project.powerSystem,
      protagonist: this.buildProtagonist(project),
      antagonists: project.antagonists || [],
      supportingCharacters: project.supportingCharacters || [],
      mainQuest: project.mainQuest || { title: '', description: '', milestones: [], rewards: [] },
      romanceLine: project.romanceLine,
      antiPatterns: project.antiPatterns || [],
      forbiddenContent: project.forbiddenContent || [],
      writingStyle: project.writingStyle || {
        tone: '热血',
        pacing: 'fast',
        dialogueRatio: 0.3,
        descriptionDensity: 'medium',
      },
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  private buildProtagonist(project: any) {
    const protagonist = project.characters?.find(
      (c: any) => c.role === '主角'
    ) || project.characters?.[0];
    
    return protagonist || {
      id: 'protagonist',
      name: '主角',
      role: '主角',
      description: '',
      personality: [],
      relationships: [],
    };
  }
  
  private buildVolumeContract(volume: any, project: any): VolumeContract {
    return {
      id: `volume_${volume.id}`,
      level: ContractLevel.VOLUME,
      volumeNumber: volume.orderIndex + 1,
      volumeTitle: volume.name,
      volumeOutline: volume.outline || '',
      coreEvents: [],
      plannedChapters: 30,
      involvedCharacters: [],
      styleNotes: '',
      tensionLevel: 'medium',
      mustInclude: [],
      mustNotInclude: [],
      startChapter: 1,
      endChapter: 30,
    };
  }
  
  private determineChapterType(chapterNumber: number, plotSummary: string): ChapterType {
    if (chapterNumber === 1) {
      return 'world_intro';
    }
    
    const summary = plotSummary.toLowerCase();
    
    if (summary.includes('高潮') || summary.includes('决战')) {
      return 'climax';
    }
    if (summary.includes('解决') || summary.includes('结局') || summary.includes('收束')) {
      return 'resolution';
    }
    if (summary.includes('终章') || summary.includes('尾声') || summary.includes('完结')) {
      return 'ending';
    }
    if (summary.includes('介绍') || summary.includes('登场')) {
      return 'character_intro';
    }
    if (summary.includes('铺陈') || summary.includes('开端')) {
      return 'plot_setup';
    }
    if (summary.includes('过渡') || summary.includes('转折')) {
      return 'transitional';
    }
    if (summary.includes('冲突') || summary.includes('对抗')) {
      return 'conflict';
    }
    
    return 'normal';
  }
  
  private buildPlotNodes(chapterNumber: number, chapter: any): ChapterContract['nodes'] {
    const summary = chapter?.plotSummary || '';
    const lines = summary.split(/[。\n]/).filter(Boolean);
    
    if (lines.length === 0) {
      return {
        cbn: '开始本章情节',
        cpns: [],
        cen: '留下悬念',
      };
    }
    
    // 简单解析：第一句作为 CBN，最后一句作为 CEN，中间作为 CPNs
    return {
      cbn: lines[0] || '开始情节',
      cpns: lines.slice(1, -1),
      cen: lines[lines.length - 1] || '留下悬念',
    };
  }
  
  private buildDirective(
    chapterNumber: number,
    chapter: any,
    project: any
  ): ChapterContract['directive'] {
    const previousChapter = project.sortedChapters?.find(
      c => c.orderIndex + 1 === chapterNumber - 1
    );
    
    // 提取前章结尾
    let previousEnding = '';
    if (previousChapter?.content) {
      const content = previousChapter.content;
      const lastPara = content.split('\n\n').pop() || '';
      const sentences = lastPara.split(/[。！？]/);
      previousEnding = sentences[sentences.length - 2]?.trim() || lastPara.slice(-100);
    }
    
    return {
      goal: chapter?.plotSummary || `续写第${chapterNumber}章`,
      timeAnchor: '继续上文',
      chapterSpan: '正常时间流逝',
      previousChapterEnding: previousEnding,
      chapterEndOpenQuestion: `第${chapterNumber}章结尾留下什么问题？`,
    };
  }
  
  private buildConstraints(
    chapterNumber: number,
    project: any
  ): ChapterContract['constraints'] {
    // 从伏笔中获取需要在本章埋设或揭示的内容
    const foreshadows = project.foreshadows || [];
    const activeForeshadows = foreshadows.filter(
      (f: any) => f.status !== 'resolved'
    );
    
    const toBury: string[] = [];
    const toReveal: string[] = [];
    
    for (const fs of activeForeshadows) {
      if (fs.suggestedChapter === chapterNumber) {
        toReveal.push(fs.hint);
      } else if (chapterNumber <= 10) {
        // 前十章优先埋设伏笔
        toBury.push(fs.hint);
      }
    }
    
    return {
      mustCover: [],
      mustInclude: [],
      forbiddenZones: project.antiPatterns || [],
      mustNotInclude: [],
      foreshadowsToBury: toBury,
      foreshadowsToReveal: toReveal,
    };
  }
  
  private buildReasoning(project: any): ChapterContract['reasoning'] {
    const genre = project.genre || '通用';
    
    // 题材特定的风格和反模式
    const genreConfigs: Record<string, { style: string[]; anti: string[] }> = {
      '玄幻': {
        style: ['热血', '爽', '节奏快', '装逼打脸'],
        anti: ['境界崩塌', '升级太容易', '女主工具人'],
      },
      '都市': {
        style: ['现实感', '代入感', '爽', '逆袭'],
        anti: ['过于YY', '脱离现实', '配角降智'],
      },
      '仙侠': {
        style: ['飘逸', '意境', '修为递进', '道法自然'],
        anti: ['战力崩', '套路老旧', '感情线拖沓'],
      },
      '悬疑': {
        style: ['紧张', '悬念', '逻辑严密', '推理'],
        anti: ['逻辑漏洞', '强行反转', '虎头蛇尾'],
      },
      '轻小说': {
        style: ['轻松', '有趣', '人物鲜明', '日常'],
        anti: ['过于严肃', '说教味', '人设OOC'],
      },
      '通用': {
        style: ['情节紧凑', '人物鲜活', '有爽点'],
        anti: ['主角圣母', '剧情拖沓', '人设崩塌'],
      },
    };
    
    const config = genreConfigs[genre] || genreConfigs['通用'];
    
    return {
      stylePriority: config.style,
      pacingStrategy: 'normal',
      genreHints: [genre],
      antiPatterns: config.anti,
    };
  }
  
  private buildTimeline(
    chapterNumber: number,
    chapter: any
  ): ChapterContract['timeline'] {
    const summary = chapter?.plotSummary || '';
    
    let position = `第${chapterNumber}章`;
    let relationToPrevious: ChapterContract['timeline']['relationToPrevious'] = 'same_time';
    
    if (summary.includes('第二天') || summary.includes('次日')) {
      position = `第${chapterNumber}章（次日）`;
      relationToPrevious = 'next_day';
    } else if (summary.includes('一月') || summary.includes('一个月后')) {
      position = `第${chapterNumber}章（一个月后）`;
      relationToPrevious = 'later';
    } else if (summary.includes('回忆') || summary.includes('倒叙')) {
      position = `第${chapterNumber}章（回忆）`;
      relationToPrevious = 'flashback';
    }
    
    return {
      position,
      relationToPrevious,
      span: '正常时间流逝',
      isTimeJump: relationToPrevious !== 'same_time',
    };
  }
  
  private containsNode(content: string, node: string): boolean {
    if (!node || node.length < 5) return true;
    
    // 检查关键词
    const keywords = node.split(/[|]/).filter(Boolean);
    const contentLower = content.toLowerCase();
    
    return keywords.some(keyword => 
      contentLower.includes(keyword.toLowerCase())
    );
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useContractManager() {
  const manager = new ContractManager();
  
  return {
    manager,
    
    // 状态
    masterContract: manager.masterContract,
    lockedChapters: manager.lockedChapters,
    
    // 方法
    loadMasterContract: () => manager.loadMasterContract(),
    loadVolumeContract: (n: number) => manager.loadVolumeContract(n),
    loadChapterContract: (n: number) => manager.loadChapterContract(n),
    saveMasterContract: (c: MasterContract) => manager.saveMasterContract(c),
    saveVolumeContract: (c: VolumeContract) => manager.saveVolumeContract(c),
    saveChapterContract: (c: ChapterContract) => manager.saveChapterContract(c),
    generateChapterContract: (n: number) => manager.generateChapterContract(n),
    generateRuntimeContract: (n: number, genre: string) => 
      manager.generateRuntimeContract(n, genre),
    lockChapter: (n: number) => manager.lockChapter(n),
    unlockChapter: (n: number) => manager.unlockChapter(n),
    isChapterLocked: (n: number) => manager.isChapterLocked(n),
    validateChapterContract: (n: number, content: string) => 
      manager.validateChapterContract(n, content),
  };
}
