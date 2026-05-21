/**
 * Consistency Validator
 * 一致性验证器 - 验证章节间、伏笔、能力体系的一致性
 */

import type { ChapterCommit, Violation, Warning, ValidationResult, StoryContract } from '../contracts';
import { createValidationResult, createViolation, createWarning } from '../contracts';

/**
 * 一致性验证器
 */
export class ConsistencyValidator {
  
  /**
   * 验证章节过渡
   */
  validateChapterTransition(
    current: ChapterCommit,
    previous?: ChapterCommit,
    next?: ChapterCommit
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    // 1. CBN承接CEN验证
    if (previous && current.nodes.cbn) {
      const cbnSubject = current.nodes.cbn.statement.split('|')[0]?.trim() || '';
      const cenSubject = previous.nodes.cen.statement.split('|')[0]?.trim() || '';
      
      // 检查主体是否连续
      if (cbnSubject && cenSubject && cbnSubject !== cenSubject) {
        warnings.push(createWarning({
          type: 'SUBJECT_DISCONTINUITY',
          description: `CEN主体(${cenSubject})与CBN主体(${cbnSubject})不一致`,
        }));
      }
      
      // 检查时间连续性
      if (previous.requirements.timeAnchor && current.requirements.timeAnchor) {
        const timeValidation = this.validateTimeConsistency(
          previous.requirements.timeAnchor,
          current.requirements.timeAnchor
        );
        if (!timeValidation.valid) {
          violations.push(createViolation({
            type: 'TIME_INCONSISTENCY',
            description: `第${current.chapterId}章与第${previous.chapterId}章时间不连续`,
            severity: 'warning',
          }));
        }
      }
    }
    
    // 2. 情绪延续验证
    if (previous && current.nodes.cbn?.情绪延续) {
      // 检查情绪是否断崖式变化
    }
    
    // 3. 伏笔回收验证
    if (current.foreshadow.fulfilled.length > 0 && previous) {
      // 检查上章是否埋了这些伏笔
      for (const fsId of current.foreshadow.fulfilled) {
        const buried = previous.foreshadow.new.find(f => f.id === fsId);
        if (!buried) {
          violations.push(createViolation({
            type: 'FORESHAWDOW_NOT_BURIED',
            description: `第${current.chapterId}章尝试回收未埋设的伏笔: ${fsId}`,
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
   * 验证时间连续性
   */
  validateTimeConsistency(prev: string, curr: string): { valid: boolean; reason?: string } {
    // 简单验证：时间不应该完全相同
    if (prev === curr) {
      return { valid: false, reason: '时间相同' };
    }
    
    // 解析时间并比较
    const prevTime = this.parseTime(prev);
    const currTime = this.parseTime(curr);
    
    if (prevTime.absolute > currTime.absolute) {
      return { valid: false, reason: '时间倒流' };
    }
    
    return { valid: true };
  }
  
  /**
   * 解析时间
   */
  private parseTime(timeStr: string): { absolute: number; raw: string } {
    // 尝试匹配各种格式
    const dayMatch = timeStr.match(/第?(\d+)天/);
    if (dayMatch) {
      return { absolute: parseInt(dayMatch[1], 10), raw: timeStr };
    }
    
    const yearMatch = timeStr.match(/(\d+)年/);
    if (yearMatch) {
      return { absolute: parseInt(yearMatch[1], 10) * 10000, raw: timeStr };
    }
    
    const chapterMatch = timeStr.match(/第(\d+)章/);
    if (chapterMatch) {
      return { absolute: parseInt(chapterMatch[1], 10) * 1000, raw: timeStr };
    }
    
    return { absolute: 0, raw: timeStr };
  }
  
  /**
   * 验证伏笔一致性
   */
  validateForeshadowConsistency(
    newForeshadows: { id: string; content: string; payoffChapter?: number }[],
    fulfilledForeshadows: string[],
    allForeshadows: Map<string, { buriedChapter: number; content: string }>
  ): ValidationResult {
    const violations: Violation[] = [];
    const warnings: Warning[] = [];
    
    for (const fsId of fulfilledForeshadows) {
      const fs = allForeshadows.get(fsId);
      if (!fs) {
        violations.push(createViolation({
          type: 'FORESHAWDOW_NOT_FOUND',
          description: `尝试回收未存在的伏笔: ${fsId}`,
          severity: 'warning',
        }));
      }
    }
    
    // 检查伏笔回收太晚
    for (const fs of newForeshadows) {
      if (fs.payoffChapter) {
        const chaptersBetween = fs.payoffChapter - 1; // 从第1章开始
        if (chaptersBetween > 50) {
          warnings.push(createWarning({
            type: 'FORESHAWDOW_PAYOFF_TOO_FAR',
            description: `伏笔"${fs.content.slice(0, 20)}..."计划在第${fs.payoffChapter}章回收，等待时间较长`,
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
   * 验证能力体系一致性
   */
  validateAbilityConsistency(
    currentLevel: string,
    maxAllowedLevel: string,
    forbiddenCombinations: string[][],
    characterAbilities: string[]
  ): ValidationResult {
    const violations: Violation[] = [];
    
    // 检查等级是否超过允许值
    if (this.compareLevels(currentLevel, maxAllowedLevel) > 0) {
      violations.push(createViolation({
        type: 'LEVEL_EXCEEDED',
        description: `角色等级(${currentLevel})超过允许最大值(${maxAllowedLevel})`,
        severity: 'blocking',
      }));
    }
    
    // 检查禁止组合
    for (const combo of forbiddenCombinations) {
      const hasCombo = combo.every(item => characterAbilities.includes(item));
      if (hasCombo) {
        violations.push(createViolation({
          type: 'FORBIDDEN_COMBINATION',
          description: `角色拥有禁止的能力组合: ${combo.join(' + ')}`,
          severity: 'blocking',
        }));
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  /**
   * 比较等级
   */
  private compareLevels(a: string, b: string): number {
    // 尝试解析等级数字
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    
    return 0;
  }
  
  /**
   * 验证爽点密度
   */
  validateCoolPointDensity(
    chapters: ChapterCommit[],
    expectedDensity: { micro: number; small: number; big: number }
  ): ValidationResult {
    const warnings: Warning[] = [];
    
    const chapterCount = chapters.length;
    
    // 统计爽点
    let missingMicroCoolPoints = 0;
    let totalMicroCoolPoints = 0;
    
    for (const ch of chapters) {
      if (ch.requirements.coolPoint?.trim()) {
        totalMicroCoolPoints++;
      } else {
        missingMicroCoolPoints++;
      }
    }
    
    // 微爽点检查
    if (missingMicroCoolPoints > chapterCount * 0.2) {
      warnings.push(createWarning({
        type: 'MICRO_COOL_POINT_SPARSE',
        description: `${missingMicroCoolPoints}章节（${(missingMicroCoolPoints / chapterCount * 100).toFixed(1)}%）缺少微爽点`,
      }));
    }
    
    return createValidationResult({
      isValid: true,
      warnings,
    });
  }
  
  /**
   * 验证禁止区域
   */
  validateForbiddenZones(
    content: string,
    forbiddenZones: ChapterCommit['forbiddenZones']
  ): ValidationResult {
    const violations: Violation[] = [];
    
    for (const zone of forbiddenZones) {
      switch (zone.type) {
        case 'character_death':
          if (content.includes(zone.target) && this.isDeathContext(content, zone.target)) {
            violations.push(createViolation({
              type: 'FORBIDDEN_CHARACTER_DEATH',
              description: `正文包含禁止的角色死亡: ${zone.target}`,
              severity: 'warning',
            }));
          }
          break;
        case 'power_reveal':
          if (content.includes(zone.target) && this.isRevealContext(content, zone.target)) {
            violations.push(createViolation({
              type: 'FORBIDDEN_POWER_REVEAL',
              description: `正文包含禁止的能力揭示: ${zone.target}`,
              severity: 'warning',
            }));
          }
          break;
      }
    }
    
    return createValidationResult({
      isValid: violations.filter(v => v.severity === 'blocking').length === 0,
      violations,
    });
  }
  
  /**
   * 检查死亡上下文
   */
  private isDeathContext(content: string, target: string): boolean {
    const deathKeywords = ['死了', '死亡', '被杀', '陨落', '倒下'];
    return deathKeywords.some(kw => content.includes(kw));
  }
  
  /**
   * 检查揭示上下文
   */
  private isRevealContext(content: string, target: string): boolean {
    const revealKeywords = ['原来是', '暴露了', '揭示了', '展示了'];
    return revealKeywords.some(kw => content.includes(kw));
  }
}

// 导出单例
export const consistencyValidator = new ConsistencyValidator();
