/**
 * Enhanced Contract Validator
 * 增强版契约验证器 - 验证故事契约、卷契约和章承诺
 */

import type {
  StoryContract,
  VolumeContract,
  ChapterCommit,
  Violation,
  Warning,
  ValidationResult,
  StrandConfig,
  TimeAnchor,
  PriorityLevel,
} from './story-contract';
import {
  createValidationResult,
  createViolation,
  createWarning,
  validateStrandRatio,
} from './story-contract';
import {
  BEAT_NODE_ORDER,
  type Timeline,
} from './volume-contract';
import {
  STORY_CONTRACT_HARD_FAILS,
  VOLUME_CONTRACT_HARD_FAILS,
  CHAPTER_COMMIT_HARD_FAILS,
  validateHardFails,
} from './hard-fails';
import {
  priorityManager,
  type PrioritySummary,
} from '../validation/priority-manager';

/**
 * 增强版契约验证器
 */
export class EnhancedContractValidator {
  
  // ====== 故事契约验证 ======
  
  /**
   * 验证故事契约
   */
  validateStoryContract(contract: StoryContract): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. 硬失败条件检查
    const hardFailResult = validateHardFails(contract, STORY_CONTRACT_HARD_FAILS);
    if (!hardFailResult.passed) {
      for (const id of hardFailResult.failedIds) {
        const condition = STORY_CONTRACT_HARD_FAILS.find(c => c.id === id);
        if (condition) {
          violations.push(createViolation({
            type: id,
            description: condition.description,
            severity: 'blocking',
            priority: 'critical',
            quickFixes: condition.quickFixes,
          }));
        }
      }
    }
    
    // 2. 三线比例验证
    const strandValidation = validateStrandRatio(contract.strands);
    if (!strandValidation.valid) {
      violations.push(createViolation({
        type: 'STRAND_RATIO_INVALID',
        description: `三线比例总和不等于100%，当前为${(strandValidation.total * 100).toFixed(1)}%`,
        severity: 'blocking',
        priority: 'critical',
        suggestion: '确保 quest + fire + constellation = 100%',
      }));
    }
    
    // 3. 矛盾递进层级验证
    const conflictValidation = this.validateConflictEscalation(contract.conflictEscalation);
    violations.push(...conflictValidation.violations);
    warnings.push(...conflictValidation.warnings);
    
    // 4. 爽点密度验证
    const coolPointValidation = this.validateCoolPointDensity(contract);
    warnings.push(...coolPointValidation.warnings);
    
    // 5. 伏笔回收验证
    const foreshadowValidation = this.validateForeshadowTracking(contract);
    violations.push(...foreshadowValidation.violations);
    warnings.push(...foreshadowValidation.warnings);
    
    // 6. 卷规划验证
    if (contract.volumes && contract.volumes.length > 0) {
      const volumeValidation = this.validateVolumePlans(contract.volumes, contract.basic.targetWordCount);
      violations.push(...volumeValidation.violations);
      warnings.push(...volumeValidation.warnings);
    }
    
    // 为没有优先级的项添加默认优先级
    this.enrichPriorities(violations, warnings, 'story');

    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }

  /**
   * 丰富优先级信息
   */
  private enrichPriorities(
    violations: Violation[],
    warnings: Warning[],
    contractType: 'story' | 'volume' | 'chapter'
  ): void {
    for (const v of violations) {
      if (!v.priority) {
        const decision = priorityManager.evaluate(v.type, { contractType });
        v.priority = decision.level;
      }
    }

    for (const w of warnings) {
      if (!w.priority) {
        w.priority = 'medium';
      }
    }
  }

  /**
   * 获取优先级摘要
   */
  getPrioritySummary(violations: Violation[], warnings: Warning[]): PrioritySummary {
    return priorityManager.generateSummary(violations, warnings);
  }

  /**
   * 创建优先级决策树
   */
  createPriorityTree(violations: Violation[]): any {
    return priorityManager.createDecisionTree(violations);
  }
  
  /**
   * 验证矛盾递进
   */
  private validateConflictEscalation(
    conflicts: StoryContract['conflictEscalation']
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    if (!conflicts || conflicts.length === 0) {
      warnings.push(createWarning({
        type: 'NO_CONFLICT_ESCALATION',
        description: '缺少矛盾递进设计',
        suggestion: '建议添加 3-4 层矛盾递进',
      }));
      return createValidationResult({ isValid: true, violations, warnings });
    }
    
    // 检查层级是否递增
    for (let i = 1; i < conflicts.length; i++) {
      if (conflicts[i].level <= conflicts[i - 1].level) {
        violations.push(createViolation({
          type: 'CONFLICT_NOT_ESCALATING',
          description: `矛盾层级应递增，但第 ${i + 1} 层 (${conflicts[i].level}) 不大于第 ${i} 层 (${conflicts[i - 1].level})`,
          severity: 'warning',
        }));
      }
    }
    
    // 检查是否至少有 3 层
    if (conflicts.length < 3) {
      warnings.push(createWarning({
        type: 'INSUFFICIENT_CONFLICT_LEVELS',
        description: `矛盾只有 ${conflicts.length} 层，建议至少 3 层以保证节奏`,
      }));
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证爽点密度
   */
  private validateCoolPointDensity(contract: StoryContract): ValidationResult {
    const warnings: Warning[] = [];
    const { density } = contract.coolPointDesign;
    
    if (density.micro > 5000) {
      warnings.push(createWarning({
        type: 'COOL_POINT_DENSITY_LOW',
        description: `微爽点间隔${density.micro}字可能过稀，建议不超过3000字`,
        suggestion: '网文需要密集的爽点轰炸',
      }));
    }
    
    if (density.small > 15000) {
      warnings.push(createWarning({
        type: 'SMALL_COOL_POINT_SPARSE',
        description: `小爽点间隔${density.small}字可能过稀，建议不超过9000字`,
      }));
    }
    
    return createValidationResult({ isValid: true, warnings });
  }
  
  /**
   * 验证伏笔追踪
   */
  private validateForeshadowTracking(contract: StoryContract): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    const estimatedChapters = Math.ceil(contract.basic.targetWordCount / 2000);
    
    for (const fs of contract.foreshadowTable) {
      if (fs.status === 'fulfilled' && fs.payoffChapter > estimatedChapters) {
        warnings.push(createWarning({
          type: 'FORESHAWDOW_PAYOFF_TOO_FAR',
          description: `伏笔"${fs.content.slice(0, 20)}..."计划在第${fs.payoffChapter}章回收，但预计全书只有${estimatedChapters}章`,
        }));
      }
    }
    
    return createValidationResult({ isValid: true, violations, warnings });
  }
  
  /**
   * 验证卷规划
   */
  private validateVolumePlans(
    volumes: StoryContract['volumes'],
    totalWordCount: number
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    if (volumes.length === 0) {
      return createValidationResult({ isValid: true, violations, warnings });
    }
    
    // 检查卷序号连续性
    const sortedVolumes = [...volumes].sort((a, b) => a.volumeId - b.volumeId);
    for (let i = 1; i < sortedVolumes.length; i++) {
      if (sortedVolumes[i].volumeId !== sortedVolumes[i - 1].volumeId + 1) {
        violations.push(createViolation({
          type: 'VOLUME_SEQUENCE_ERROR',
          description: `卷序号不连续：第${sortedVolumes[i - 1].volumeId}卷后应该是第${sortedVolumes[i - 1].volumeId + 1}卷`,
          severity: 'warning',
        }));
      }
    }
    
    // 检查章节范围
    for (const volume of volumes) {
      if (volume.chapterRange[0] >= volume.chapterRange[1]) {
        violations.push(createViolation({
          type: 'INVALID_CHAPTER_RANGE',
          description: `第${volume.volumeId}卷章节范围无效`,
          severity: 'warning',
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  // ====== 卷契约验证 ======
  
  /**
   * 验证卷契约
   */
  validateVolumeContract(
    volume: VolumeContract,
    story?: StoryContract
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. 硬失败条件检查
    const hardFailResult = validateHardFails(volume, VOLUME_CONTRACT_HARD_FAILS);
    if (!hardFailResult.passed) {
      for (const id of hardFailResult.failedIds) {
        const condition = VOLUME_CONTRACT_HARD_FAILS.find(c => c.id === id);
        if (condition) {
          violations.push(createViolation({
            type: id,
            description: condition.description,
            severity: 'blocking',
            priority: 'critical',
            quickFixes: condition.quickFixes,
          }));
        }
      }
    }
    
    // 2. 节拍完整性
    const requiredNodes = ['Opening', 'Development', 'Climax', 'ConflictResolution', 'Ending'];
    const actualNodes = volume.beats.map(b => b.node);
    for (const required of requiredNodes) {
      if (!actualNodes.includes(required as any)) {
        violations.push(createViolation({
          type: 'MISSING_REQUIRED_BEAT',
          description: `第${volume.volumeId}卷缺少${required}节拍`,
          severity: 'blocking',
          priority: 'critical',
          metadata: { missingBeat: required, volumeId: volume.volumeId },
        }));
      }
    }
    
    // 3. 节拍顺序
    const beatValidation = this.validateBeatSequence(volume.beats);
    violations.push(...beatValidation.violations);
    
    // 4. 时间线验证
    const timeValidation = this.validateTimeline(volume.timeline);
    violations.push(...timeValidation.violations);
    warnings.push(...timeValidation.warnings);
    
    // 5. 与故事契约的一致性
    if (story) {
      const consistencyValidation = this.validateVolumeStoryConsistency(volume, story);
      violations.push(...consistencyValidation.violations);
    }
    
    // 为没有优先级的项添加默认优先级
    this.enrichPriorities(violations, warnings, 'volume');

    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }

  /**
   * 验证节拍顺序
   */
  private validateBeatSequence(beats: VolumeContract['beats']): ValidationResult {
    const violations: Violation[] = [];
    
    if (!beats || beats.length === 0) {
      return createValidationResult({ isValid: true, violations });
    }
    
    // 按正确顺序排序
    const sortedBeats = [...beats].sort(
      (a, b) => BEAT_NODE_ORDER.indexOf(a.node) - BEAT_NODE_ORDER.indexOf(b.node)
    );
    
    // 检查章节范围
    for (let i = 1; i < sortedBeats.length; i++) {
      const prevEnd = sortedBeats[i - 1].chapterRange[1];
      const currStart = sortedBeats[i].chapterRange[0];
      
      if (currStart > prevEnd + 1) {
        violations.push(createViolation({
          type: 'BEAT_GAP',
          description: `节拍之间有章节缺口：第${prevEnd}章后到第${currStart}章`,
          severity: 'warning',
          priority: 'medium',
        }));
      }
      
      if (currStart < prevEnd) {
        violations.push(createViolation({
          type: 'BEAT_OVERLAP',
          description: `节拍之间有章节重叠：第${sortedBeats[i].node}与上一节拍重叠`,
          severity: 'warning',
          priority: 'high',
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  /**
   * 验证时间线
   */
  validateTimeline(timeline: Timeline): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    if (!timeline.anchors || timeline.anchors.length === 0) {
      warnings.push(createWarning({
        type: 'NO_TIME_ANCHORS',
        description: '时间线缺少锚点',
        priority: 'medium',
      }));
      return createValidationResult({ isValid: true, warnings });
    }
    
    const sorted = [...timeline.anchors].sort((a, b) => a.chapter - b.chapter);
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      // 章节序号连续性
      if (curr.chapter !== prev.chapter + 1) {
        violations.push(createViolation({
          type: 'CHAPTER_SEQUENCE_BREAK',
          description: `章节序号不连续：第${prev.chapter}章后应该是第${prev.chapter + 1}章`,
          severity: 'warning',
          priority: 'medium',
        }));
      }
      
      // 倒计时递减验证
      if (prev.countdown.active && curr.countdown.active) {
        const prevDays = prev.countdown.daysRemaining || 0;
        const currDays = curr.countdown.daysRemaining || 0;
        
        if (currDays > prevDays) {
          violations.push(createViolation({
            type: 'COUNTDOWN_INCREASING',
            description: `倒计时应递减，但第${curr.chapter}章的剩余天数(${currDays})大于第${prev.chapter}章(${prevDays})`,
            severity: 'blocking',
            priority: 'critical',
          }));
        }
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证卷与故事契约的一致性
   */
  private validateVolumeStoryConsistency(
    volume: VolumeContract,
    story: StoryContract
  ): ValidationResult {
    const violations: Violation[] = [];
    
    // 验证三线比例
    const strandTotal = story.strands.quest.ratio + 
                       story.strands.fire.ratio + 
                       story.strands.constellation.ratio;
    if (Math.abs(strandTotal - 1.0) > 0.01) {
      violations.push(createViolation({
        type: 'STRAND_RATIO_INVALID',
        description: '故事契约三线比例总和不等于100%',
        severity: 'blocking',
        priority: 'critical',
      }));
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  // ====== 章承诺验证 ======
  
  /**
   * 验证章承诺
   */
  validateChapterCommit(
    commit: ChapterCommit,
    volume?: VolumeContract,
    previousCommit?: ChapterCommit
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. 硬失败条件检查
    const hardFailResult = validateHardFails(commit, CHAPTER_COMMIT_HARD_FAILS);
    if (!hardFailResult.passed) {
      for (const id of hardFailResult.failedIds) {
        const condition = CHAPTER_COMMIT_HARD_FAILS.find(c => c.id === id);
        if (condition) {
          violations.push(createViolation({
            type: id,
            description: condition.description,
            severity: 'blocking',
            priority: 'critical',
            quickFixes: condition.quickFixes,
          }));
        }
      }
    }
    
    // 2. 节点格式验证
    const nodeFormatValidation = this.validateNodeFormat(commit);
    violations.push(...nodeFormatValidation.violations);
    
    // 3. 时间连续性
    if (previousCommit) {
      const timeValidation = this.validateChapterTimeConsistency(
        previousCommit.requirements.timeAnchor,
        commit.requirements.timeAnchor
      );
      if (!timeValidation.valid) {
        violations.push(createViolation({
          type: 'TIME_INCONSISTENCY',
          description: `第${commit.chapterId}章与第${previousCommit.chapterId}章时间不连续`,
          severity: 'warning',
          priority: 'medium',
        }));
      }
    }
    
    // 4. CBN-CEN衔接验证
    if (previousCommit) {
      const transitionValidation = this.validateChapterTransition(commit, previousCommit);
      violations.push(...transitionValidation.violations);
    }
    
    // 5. 与卷契约的一致性
    if (volume) {
      const consistencyValidation = this.validateChapterVolumeConsistency(commit, volume);
      violations.push(...consistencyValidation.violations);
    }
    
    // 为没有优先级的项添加默认优先级
    this.enrichPriorities(violations, warnings, 'chapter');

    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证节点格式
   */
  private validateNodeFormat(commit: ChapterCommit): ValidationResult {
    const violations: Violation[] = [];
    const pattern = /^.+?\s*\|\s*.+?\s*\|\s*.+$/;
    
    if (!pattern.test(commit.nodes.cbn?.statement || '')) {
      violations.push(createViolation({
        type: 'INVALID_CBN_FORMAT',
        description: `CBN格式错误，应为「主体 | 动作 | 结果」`,
        severity: 'warning',
        priority: 'high',
        quickFixes: [{
          type: 'auto_fix',
          description: '使用默认格式填充',
          params: { node: 'cbn' },
        }],
      }));
    }
    
    if (!pattern.test(commit.nodes.cen?.statement || '')) {
      violations.push(createViolation({
        type: 'INVALID_CEN_FORMAT',
        description: `CEN格式错误，应为「主体 | 动作 | 结果 + 悬念」`,
        severity: 'warning',
        priority: 'high',
        quickFixes: [{
          type: 'auto_fix',
          description: '添加悬念结尾',
          params: { node: 'cen' },
        }],
      }));
    }
    
    for (let i = 0; i < (commit.nodes.cpns || []).length; i++) {
      const cpn = commit.nodes.cpns[i];
      if (!pattern.test(cpn.statement)) {
        violations.push(createViolation({
          type: 'INVALID_CPN_FORMAT',
          description: `CPN${i + 1}格式错误，应为「主体 | 动作 | 结果」`,
          severity: 'warning',
          priority: 'medium',
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  /**
   * 验证章节时间连续性
   */
  private validateChapterTimeConsistency(
    prev: string | undefined,
    curr: string | undefined
  ): { valid: boolean } {
    if (!prev || !curr) {
      return { valid: true }; // 缺少时间信息时跳过
    }
    
    // 简单验证：时间不应该完全相同
    if (prev === curr) {
      return { valid: false };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证章节过渡
   */
  private validateChapterTransition(
    current: ChapterCommit,
    previous: ChapterCommit
  ): ValidationResult {
    const violations: Violation[] = [];
    
    // 验证CEN和CBN的主体连续性
    const cbnSubject = current.nodes.cbn?.statement?.split('|')[0]?.trim() || '';
    const cenSubject = previous.nodes.cen?.statement?.split('|')[0]?.trim() || '';
    
    // 如果主体不同，给出警告
    if (cbnSubject && cenSubject && cbnSubject !== cenSubject) {
      violations.push(createViolation({
        type: 'SUBJECT_CHANGE',
        description: `CEN主体(${cenSubject})与CBN主体(${cbnSubject})不一致`,
        severity: 'warning',
        priority: 'medium',
        suggestion: '检查是否需要过渡说明',
      }));
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  /**
   * 验证章节与卷的一致性
   */
  private validateChapterVolumeConsistency(
    commit: ChapterCommit,
    volume: VolumeContract
  ): ValidationResult {
    const violations: Violation[] = [];
    
    // 验证章节在卷范围内
    const [start, end] = volume.chapterRange;
    if (commit.chapterId < start || commit.chapterId > end) {
      violations.push(createViolation({
        type: 'CHAPTER_OUTSIDE_VOLUME',
        description: `第${commit.chapterId}章不在卷范围内（第${start}-${end}章）`,
        severity: 'warning',
        priority: 'high',
      }));
    }
    
    // 验证故事线一致性
    const strandStatus = volume.strandStatus;
    if (commit.requirements.strand === 'Quest' && strandStatus.quest.status === 'completed') {
      violations.push(createViolation({
        type: 'STRAND_COMPLETED',
        description: `Quest线已完成，但第${commit.chapterId}章仍标记为Quest`,
        severity: 'warning',
        priority: 'medium',
      }));
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }

  /**
   * 批量验证多个章节（带优先级排序）
   */
  validateChapterBatch(
    commits: ChapterCommit[],
    volume?: VolumeContract
  ): {
    results: Map<number, ValidationResult>;
    sortedByPriority: { chapterId: number; result: ValidationResult }[];
    summary: PrioritySummary;
  } {
    const results = new Map<number, ValidationResult>();
    const allViolations: Violation[] = [];
    const allWarnings: Warning[] = [];

    for (let i = 0; i < commits.length; i++) {
      const previousCommit = i > 0 ? commits[i - 1] : undefined;
      const result = this.validateChapterCommit(commits[i], volume, previousCommit);
      results.set(commits[i].chapterId, result);
      allViolations.push(...result.violations);
      allWarnings.push(...result.warnings);
    }

    // 按优先级排序
    const sortedByPriority = [...results.entries()]
      .map(([chapterId, result]) => ({ chapterId, result }))
      .sort((a, b) => {
        const aMaxPriority = Math.max(
          ...a.result.violations.map(v => {
            const weights = { critical: 100, high: 75, medium: 50, low: 25 };
            return weights[v.priority || 'medium'];
          }),
          0
        );
        const bMaxPriority = Math.max(
          ...b.result.violations.map(v => {
            const weights = { critical: 100, high: 75, medium: 50, low: 25 };
            return weights[v.priority || 'medium'];
          }),
          0
        );
        return bMaxPriority - aMaxPriority;
      });

    return {
      results,
      sortedByPriority,
      summary: priorityManager.generateSummary(allViolations, allWarnings),
    };
  }
}

// 导出单例
export const enhancedContractValidator = new EnhancedContractValidator();
