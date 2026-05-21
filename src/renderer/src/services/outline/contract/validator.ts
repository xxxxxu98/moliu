/**
 * Contract Validator
 * Validates story contracts, volume contracts, and chapter commits
 */

import type { 
  Outline, 
  Chapter,
  TimeAnchor,
  ChapterCommit,
  Volume,
  Violation,
  Warning,
  ValidationResult,
  StrandConfig,
} from '../types';
import type { StoryContract, VolumeContract } from '../types';
import {
  createValidationResult,
  createViolation,
  createWarning,
  validateStrandRatio,
} from './types';

/**
 * 契约验证器
 */
export class ContractValidator {
  
  /**
   * 验证大纲
   */
  validateOutline(outline: Outline): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. 验证基础必填字段
    if (!outline.title?.trim()) {
      violations.push(createViolation({
        type: 'MISSING_TITLE',
        description: '大纲缺少标题',
        severity: 'blocking',
        suggestion: '请为大纲添加标题',
      }));
    }
    
    if (!outline.synopsis?.trim()) {
      violations.push(createViolation({
        type: 'MISSING_SYNOPSIS',
        description: '大纲缺少简介',
        severity: 'blocking',
        suggestion: '请为大纲添加简介',
      }));
    }
    
    // 2. 验证字数
    if (!outline.estimatedWordCount || outline.estimatedWordCount < 10000) {
      warnings.push(createWarning({
        type: 'UNREASONABLE_WORD_COUNT',
        description: `预估字数 ${outline.estimatedWordCount} 可能过少`,
        suggestion: '网文建议至少 30 万字',
      }));
    }
    
    // 3. 验证章节结构
    if (outline.chapters && outline.chapters.length > 0) {
      const chapterValidation = this.validateChapterStructure(outline.chapters);
      violations.push(...chapterValidation.violations);
      warnings.push(...chapterValidation.warnings);
    }
    
    // 4. 验证角色
    if (outline.characters && outline.characters.length > 0) {
      const protagonist = outline.characters.find(c => c.role === 'protagonist');
      if (!protagonist) {
        warnings.push(createWarning({
          type: 'NO_PROTAGONIST',
          description: '大纲中没有找到主角',
        }));
      }
    }
    
    // 5. 验证故事线平衡 (如果有)
    if (outline.storyLines) {
      const strandValidation = this.validateStrandBalance(outline.storyLines);
      if (!strandValidation.valid) {
        warnings.push(createWarning({
          type: 'STRAND_IMBALANCE',
          description: strandValidation.message || '故事线比例不平衡',
        }));
      }
    }
    
    // 6. 验证矛盾递进 (如果有)
    if (outline.conflictDesign) {
      const conflictValidation = this.validateConflictEscalation(outline.conflictDesign);
      violations.push(...conflictValidation.violations);
      warnings.push(...conflictValidation.warnings);
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证章节结构
   */
  validateChapterStructure(chapters: Chapter[]): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 检查章节序号连续性
    const sortedChapters = [...chapters].sort((a, b) => a.number - b.number);
    for (let i = 1; i < sortedChapters.length; i++) {
      const prev = sortedChapters[i - 1];
      const curr = sortedChapters[i];
      
      if (curr.number !== prev.number + 1) {
        violations.push(createViolation({
          type: 'CHAPTER_SEQUENCE_BREAK',
          description: `章节序号不连续：第 ${prev.number} 章后应该是第 ${prev.number + 1} 章，实际是第 ${curr.number} 章`,
          severity: 'blocking',
          location: { contract: 'outline', path: `chapters[${i}]` },
        }));
      }
    }
    
    // 检查章节标题
    for (const chapter of chapters) {
      if (!chapter.title?.trim()) {
        warnings.push(createWarning({
          type: 'MISSING_CHAPTER_TITLE',
          description: `第 ${chapter.number} 章缺少标题`,
          location: { contract: 'outline', path: `chapters[${chapter.number - 1}].title` },
        }));
      }
      
      if (!chapter.summary?.trim()) {
        warnings.push(createWarning({
          type: 'MISSING_CHAPTER_SUMMARY',
          description: `第 ${chapter.number} 章缺少摘要`,
          location: { contract: 'outline', path: `chapters[${chapter.number - 1}].summary` },
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证故事线平衡
   */
  validateStrandBalance(storyLines: any): { valid: boolean; message?: string } {
    // 计算各故事线的章节数比例
    const total = storyLines.quest?.ratio || 0.6 
      + (storyLines.fire?.ratio || 0.25) 
      + (storyLines.constellation?.ratio || 0.15);
    
    if (Math.abs(total - 1.0) > 0.01) {
      return {
        valid: false,
        message: `三线比例总和为 ${(total * 100).toFixed(1)}%，应等于 100%`,
      };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证矛盾递进
   */
  validateConflictEscalation(conflictDesign: any): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    if (!conflictDesign.escalation || conflictDesign.escalation.length === 0) {
      warnings.push(createWarning({
        type: 'NO_CONFLICT_ESCALATION',
        description: '缺少矛盾递进设计',
        suggestion: '建议添加 3-4 层矛盾递进',
      }));
      return createValidationResult({ isValid: true, warnings });
    }
    
    // 检查层级是否递增
    const levels = conflictDesign.escalation.map((e: any) => e.level);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] <= levels[i - 1]) {
        violations.push(createViolation({
          type: 'CONFLICT_NOT_ESCALATING',
          description: `矛盾层级应递增，但第 ${i + 1} 层 (${levels[i]}) 不大于第 ${i} 层 (${levels[i - 1]})`,
          severity: 'warning',
        }));
      }
    }
    
    // 检查是否至少有 3 层
    if (levels.length < 3) {
      warnings.push(createWarning({
        type: 'INSUFFICIENT_CONFLICT_LEVELS',
        description: `矛盾只有 ${levels.length} 层，建议至少 3 层以保证节奏`,
      }));
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证卷契约
   */
  validateVolumeContract(volume: VolumeContract, storyContract?: StoryContract): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. 验证节拍表
    if (!volume.beats || volume.beats.length === 0) {
      violations.push(createViolation({
        type: 'NO_BEATS',
        description: `第 ${volume.volumeId} 卷缺少节拍表`,
        severity: 'blocking',
      }));
    } else {
      // 检查节拍类型完整性
      const beatTypes = volume.beats.map(b => b.type);
      const requiredTypes = ['promise', 'catalyst', 'climax', 'resolution'];
      
      for (const type of requiredTypes) {
        if (!beatTypes.includes(type)) {
          warnings.push(createWarning({
            type: 'MISSING_BEAT_TYPE',
            description: `第 ${volume.volumeId} 卷缺少 ${type} 节拍`,
          }));
        }
      }
    }
    
    // 2. 验证时间线
    if (volume.timeline) {
      const timeValidation = this.validateTimeLine(volume.timeline.anchors);
      if (!timeValidation.valid) {
        violations.push(...timeValidation.violations);
      }
      warnings.push(...timeValidation.warnings);
    }
    
    // 3. 验证与故事契约的一致性
    if (storyContract) {
      // 检查三线比例
      const storyStrandRatio = storyContract.strands.quest.ratio 
        + storyContract.strands.fire.ratio 
        + storyContract.strands.constellation.ratio;
      
      if (Math.abs(storyStrandRatio - 1.0) > 0.01) {
        violations.push(createViolation({
          type: 'STRAND_RATIO_INVALID',
          description: '故事契约三线比例总和不等于 100%',
          severity: 'blocking',
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证时间线
   */
  validateTimeLine(anchors: TimeAnchor[]): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    if (!anchors || anchors.length === 0) {
      warnings.push(createWarning({
        type: 'NO_TIME_ANCHORS',
        description: '时间线缺少锚点',
      }));
      return createValidationResult({ isValid: true, warnings });
    }
    
    // 检查章节序号连续性
    const sorted = [...anchors].sort((a, b) => a.chapter - b.chapter);
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      // 检查章节序号
      if (curr.chapter !== prev.chapter + 1) {
        violations.push(createViolation({
          type: 'TIME_ANCHOR_SEQUENCE_BREAK',
          description: `时间锚点章节不连续：第 ${prev.chapter} 章后应该是第 ${prev.chapter + 1} 章`,
          severity: 'warning',
        }));
      }
      
      // 检查倒计时逻辑
      if (prev.countdown.active && curr.countdown.active) {
        const prevDays = prev.countdown.daysRemaining || 0;
        const currDays = curr.countdown.daysRemaining || 0;
        
        if (currDays > prevDays) {
          violations.push(createViolation({
            type: 'COUNTDOWN_INCREASING',
            description: `倒计时应递减，但第 ${curr.chapter} 章的剩余天数 (${currDays}) 大于第 ${prev.chapter} 章 (${prevDays})`,
            severity: 'blocking',
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
   * 验证章节承诺
   */
  validateChapterCommit(commit: ChapterCommit, previousCommit?: ChapterCommit): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. 验证节点完整性
    if (!commit.nodes.cbn) {
      violations.push(createViolation({
        type: 'MISSING_CBN',
        description: `第 ${commit.chapterId} 章缺少 CBN (章节起点)`,
        severity: 'blocking',
      }));
    }
    
    if (!commit.nodes.cen) {
      violations.push(createViolation({
        type: 'MISSING_CEN',
        description: `第 ${commit.chapterId} 章缺少 CEN (章节终点)`,
        severity: 'blocking',
      }));
    }
    
    if (!commit.nodes.cpns || commit.nodes.cpns.length < 2) {
      violations.push(createViolation({
        type: 'INSUFFICIENT_CPNS',
        description: `第 ${commit.chapterId} 章需要至少 2 个 CPN (推进节点)`,
        severity: 'blocking',
      }));
    }
    
    // 2. 验证必需字段
    if (!commit.requirements.objective?.trim()) {
      violations.push(createViolation({
        type: 'MISSING_OBJECTIVE',
        description: `第 ${commit.chapterId} 章缺少目标`,
        severity: 'blocking',
      }));
    }
    
    if (!commit.requirements.coolPoint?.trim()) {
      warnings.push(createWarning({
        type: 'MISSING_COOL_POINT',
        description: `第 ${commit.chapterId} 章缺少爽点设计`,
      }));
    }
    
    // 3. 验证与上章的衔接
    if (previousCommit) {
      // 检查时间连续性
      if (previousCommit.requirements.timeAnchor && commit.requirements.timeAnchor) {
        const timeValidation = this.validateTimeConsistency(
          previousCommit.requirements.timeAnchor,
          commit.requirements.timeAnchor
        );
        if (!timeValidation.valid) {
          violations.push(createViolation({
            type: 'TIME_INCONSISTENCY',
            description: `第 ${commit.chapterId} 章与第 ${previousCommit.chapterId} 章时间不连续`,
            severity: 'warning',
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
   * 验证时间一致性
   */
  private validateTimeConsistency(prev: string, curr: string): { valid: boolean } {
    // 简化的时间验证，实际应该更复杂
    // 这里只是检查是否有明显的矛盾
    
    // 如果时间相同，可能有问题
    if (prev === curr) {
      return { valid: false };
    }
    
    return { valid: true };
  }
  
  /**
   * 验证能力边界
   */
  validateAbilityConstraints(
    character: any,
    maxLevel: number,
    forbiddenCombinations: string[][]
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 检查能力等级
    // 这里需要根据具体设定来验证
    
    // 检查禁止组合
    for (const combo of forbiddenCombinations) {
      const hasAll = combo.every(item => character.abilities?.includes(item));
      if (hasAll) {
        violations.push(createViolation({
          type: 'FORBIDDEN_ABILITY_COMBINATION',
          description: `${character.name} 拥有禁止的组合: ${combo.join(' + ')}`,
          severity: 'blocking',
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.length === 0,
      violations,
      warnings,
    });
  }
}

// 导出单例
export const contractValidator = new ContractValidator();
