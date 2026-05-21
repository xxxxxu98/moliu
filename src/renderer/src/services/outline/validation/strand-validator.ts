/**
 * Strand Validator
 * 三线交织验证器
 */

import type { StrandConfig, StrandStatus, StoryContract, VolumeContract, ChapterCommit } from '../contracts';
import { createValidationResult, createViolation, createWarning } from '../contracts';

/**
 * 三线交织验证器
 */
export class StrandValidator {
  
  /**
   * 验证三线比例
   */
  validateStrandRatio(strands: StrandConfig): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    const total = strands.quest.ratio + 
                  strands.fire.ratio + 
                  strands.constellation.ratio;
    
    if (Math.abs(total - 1.0) > 0.01) {
      violations.push(createViolation({
        type: 'STRAND_RATIO_INVALID',
        description: `三线比例总和不等于100%，当前为${(total * 100).toFixed(1)}%`,
        severity: 'blocking',
        suggestion: '确保 quest + fire + constellation = 100%',
      }));
    }
    
    // 检查比例是否合理
    if (strands.quest.ratio < 0.4) {
      warnings.push(createWarning({
        type: 'QUEST_RATIO_TOO_LOW',
        description: `Quest线比例${(strands.quest.ratio * 100).toFixed(0)}%可能过低，建议不低于40%`,
      }));
    }
    
    if (strands.fire.ratio > 0.4) {
      warnings.push(createWarning({
        type: 'FIRE_RATIO_TOO_HIGH',
        description: `Fire线比例${(strands.fire.ratio * 100).toFixed(0)}%可能过高`,
      }));
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证卷的三线状态
   */
  validateVolumeStrandStatus(
    volumeStatus: StrandStatus,
    storyStrands: StrandConfig
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 检查状态一致性
    if (storyStrands.quest.status === 'completed' && volumeStatus.quest.status === 'active') {
      warnings.push(createWarning({
        type: 'STRAND_STATUS_MISMATCH',
        description: `Story中Quest线已完成，但Volume中仍标记为active`,
      }));
    }
    
    if (storyStrands.fire.status === 'completed' && volumeStatus.fire.status === 'active') {
      warnings.push(createWarning({
        type: 'STRAND_STATUS_MISMATCH',
        description: `Story中Fire线已完成，但Volume中仍标记为active`,
      }));
    }
    
    if (storyStrands.constellation.status === 'completed' && volumeStatus.constellation.status === 'active') {
      warnings.push(createWarning({
        type: 'STRAND_STATUS_MISMATCH',
        description: `Story中Constellation线已完成，但Volume中仍标记为active`,
      }));
    }
    
    return createValidationResult({
      isValid: true,
      violations,
      warnings,
    });
  }
  
  /**
   * 验证章节的故事线归属
   */
  validateChapterStrand(
    chapterStrand: string,
    volumeStatus: StrandStatus
  ): ValidationResult {
    const violations: Violation[] = [];
    
    switch (chapterStrand) {
      case 'Quest':
        if (volumeStatus.quest.status === 'completed') {
          violations.push(createViolation({
            type: 'STRAND_COMPLETED',
            description: `Quest线已完成，本章不应再标记为Quest`,
            severity: 'warning',
          }));
        }
        break;
      case 'Fire':
        if (volumeStatus.fire.status === 'completed') {
          violations.push(createViolation({
            type: 'STRAND_COMPLETED',
            description: `Fire线已完成，本章不应再标记为Fire`,
            severity: 'warning',
          }));
        }
        break;
      case 'Constellation':
        if (volumeStatus.constellation.status === 'completed') {
          violations.push(createViolation({
            type: 'STRAND_COMPLETED',
            description: `Constellation线已完成，本章不应再标记为Constellation`,
            severity: 'warning',
          }));
        }
        break;
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  /**
   * 验证三线平衡
   */
  validateStrandBalance(
    chapters: ChapterCommit[],
    strandConfig: StrandConfig
  ): ValidationResult {
    const warnings: Warning[] = [];
    
    // 统计各条线的章节数
    const strandCounts = { Quest: 0, Fire: 0, Constellation: 0 };
    for (const ch of chapters) {
      const strand = ch.requirements.strand;
      if (strandCounts[strand] !== undefined) {
        strandCounts[strand]++;
      }
    }
    
    const total = chapters.length;
    if (total === 0) {
      return createValidationResult({ isValid: true, warnings: [] });
    }
    
    // 计算实际比例
    const actualRatios = {
      Quest: strandCounts.Quest / total,
      Fire: strandCounts.Fire / total,
      Constellation: strandCounts.Constellation / total,
    };
    
    // 检查偏差
    const tolerance = 0.15; // 15%容差
    
    if (Math.abs(actualRatios.Quest - strandConfig.quest.ratio) > tolerance) {
      warnings.push(createWarning({
        type: 'STRAND_RATIO_DEVIATION',
        description: `Quest线实际比例${(actualRatios.Quest * 100).toFixed(0)}%与预期${(strandConfig.quest.ratio * 100).toFixed(0)}%偏差较大`,
      }));
    }
    
    if (Math.abs(actualRatios.Fire - strandConfig.fire.ratio) > tolerance) {
      warnings.push(createWarning({
        type: 'STRAND_RATIO_DEVIATION',
        description: `Fire线实际比例${(actualRatios.Fire * 100).toFixed(0)}%与预期${(strandConfig.fire.ratio * 100).toFixed(0)}%偏差较大`,
      }));
    }
    
    if (Math.abs(actualRatios.Constellation - strandConfig.constellation.ratio) > tolerance) {
      warnings.push(createWarning({
        type: 'STRAND_RATIO_DEVIATION',
        description: `Constellation线实际比例${(actualRatios.Constellation * 100).toFixed(0)}%与预期${(strandConfig.constellation.ratio * 100).toFixed(0)}%偏差较大`,
      }));
    }
    
    return createValidationResult({
      isValid: true,
      warnings,
    });
  }
  
  /**
   * 获取三线汇总
   */
  getStrandSummary(chapters: ChapterCommit[]): string {
    const counts = { Quest: 0, Fire: 0, Constellation: 0 };
    for (const ch of chapters) {
      const strand = ch.requirements.strand;
      if (counts[strand] !== undefined) {
        counts[strand]++;
      }
    }
    
    const total = chapters.length || 1;
    return `Quest: ${counts.Quest}章(${(counts.Quest / total * 100).toFixed(0)}%) / Fire: ${counts.Fire}章(${(counts.Fire / total * 100).toFixed(0)}%) / Constellation: ${counts.Constellation}章(${(counts.Constellation / total * 100).toFixed(0)}%)`;
  }
}

// 导出单例
export const strandValidator = new StrandValidator();
