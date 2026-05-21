/**
 * Placeholder Scanner
 * 占位符扫描器
 */

import type { Violation, Warning, ValidationResult } from '../contracts';
import { createValidationResult, createViolation } from '../contracts';

/**
 * 占位符类型
 */
export interface Placeholder {
  type: string;
  value: string;
  line: number;
  column: number;
  context: string;
}

/**
 * 占位符模式
 */
const PLACEHOLDER_PATTERNS = [
  // 中文化位符
  { pattern: /\[待[^\]]*\]/g, type: '待填充' },
  { pattern: /\{[^}]*\}/g, type: '大括号占位' },
  { pattern: /<[^>]*>/g, type: '尖括号占位' },
  { pattern: /【[^】]*】/g, type: '方框占位' },
  { pattern: /\{占位\}/g, type: '明确占位' },
  { pattern: /\{placeholder\}/gi, type: '英文占位' },
  { pattern: /\[PLACEHOLDER\]/gi, type: '大写占位' },
  
  // 通用占位符
  { pattern: /xxx/gi, type: 'X占位' },
  { pattern: /\.\.\./g, type: '省略号占位' },
  { pattern: /待定/g, type: '待定' },
  { pattern: /暂定/g, type: '暂定' },
  { pattern: /未设定/g, type: '未设定' },
  { pattern: /TBD/gi, type: 'TBD' },
  { pattern: /TODO/gi, type: 'TODO' },
];

/**
 * 占位符扫描器
 */
export class PlaceholderScanner {
  
  /**
   * 扫描内容中的占位符
   */
  scan(content: string): Placeholder[] {
    const placeholders: Placeholder[] = [];
    const lines = content.split('\n');
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      for (const { pattern, type } of PLACEHOLDER_PATTERNS) {
        pattern.lastIndex = 0; // 重置正则
        let match;
        
        while ((match = pattern.exec(line)) !== null) {
          placeholders.push({
            type,
            value: match[0],
            line: lineNum + 1,
            column: match.index + 1,
            context: this.getContext(line, match.index),
          });
        }
      }
    }
    
    return placeholders;
  }
  
  /**
   * 验证内容是否包含占位符
   */
  validate(content: string): ValidationResult {
    const placeholders = this.scan(content);
    
    if (placeholders.length === 0) {
      return createValidationResult({ isValid: true });
    }
    
    const violations: Violation[] = placeholders.map(p => createViolation({
      type: 'PLACEHOLDER_EXISTS',
      description: `第${p.line}行第${p.column}列存在占位符: ${p.value}`,
      severity: 'warning',
      suggestion: `请替换为具体内容`,
    }));
    
    return createValidationResult({
      isValid: false,
      violations,
    });
  }
  
  /**
   * 检查是否有硬占位符（必须修复）
   */
  hasHardPlaceholders(content: string): boolean {
    const hardPatterns = [
      /\[待[^\]]*\]/,
      /\{占位\}/,
      /\{placeholder\}/gi,
      /\[PLACEHOLDER\]/gi,
    ];
    
    for (const pattern of hardPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 获取上下文
   */
  private getContext(line: string, matchIndex: number): string {
    const start = Math.max(0, matchIndex - 20);
    const end = Math.min(line.length, matchIndex + 40);
    const context = line.slice(start, end);
    return (start > 0 ? '...' : '') + context + (end < line.length ? '...' : '');
  }
  
  /**
   * 生成占位符报告
   */
  generateReport(placeholders: Placeholder[]): string {
    if (placeholders.length === 0) {
      return '✓ 未发现占位符';
    }
    
    const grouped = this.groupByLine(placeholders);
    let report = `✗ 发现 ${placeholders.length} 个占位符：\n\n`;
    
    for (const [line, items] of Object.entries(grouped)) {
      report += `第${line}行:\n`;
      for (const p of items) {
        report += `  - ${p.type}: "${p.value}"\n`;
        report += `    上下文: ${p.context}\n`;
      }
      report += '\n';
    }
    
    return report;
  }
  
  /**
   * 按行分组
   */
  private groupByLine(placeholders: Placeholder[]): Record<string, Placeholder[]> {
    const grouped: Record<string, Placeholder[]> = {};
    
    for (const p of placeholders) {
      const key = String(p.line);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(p);
    }
    
    return grouped;
  }
  
  /**
   * 自动替换占位符（简单版本）
   */
  autoReplace(content: string): string {
    let result = content;
    
    // 替换明确的占位符
    result = result.replace(/\{占位\}/g, '___');
    result = result.replace(/\{placeholder\}/gi, '___');
    result = result.replace(/\[PLACEHOLDER\]/gi, '___');
    result = result.replace(/TODO/gi, '___');
    
    return result;
  }
}

// 导出单例
export const placeholderScanner = new PlaceholderScanner();
