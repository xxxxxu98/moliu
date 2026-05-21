/**
 * Master Outline Generator
 * 主大纲生成器 - 生成完整的故事契约
 */

import type { StoryContract, ValidationResult } from '../contracts';
import {
  createDefaultStoryContract,
  createValidationResult,
} from '../contracts';
import { enhancedContractValidator } from '../contracts/validator';
import { buildMasterOutlinePrompt, type FiveStepPromptOptions } from '../prompts';
import { getExtendedGenreTemplate, EXTENDED_GENRE_TEMPLATES } from '../knowledge';
import { placeholderScanner } from '../validation';

/**
 * 进度回调
 */
export type ProgressCallback = (phase: string, progress: number, message: string) => void;

/**
 * 生成结果
 */
export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  validation?: ValidationResult;
  warnings?: string[];
}

/**
 * 主大纲生成选项
 */
export interface MasterGeneratorOptions {
  seed: string;
  genre?: string;
  targetWordCount?: number;
  platform?: string;
  tone?: string[];
  onProgress?: ProgressCallback;
}

/**
 * 主大纲生成器
 */
export class MasterOutlineGenerator {
  private aiClient: any;
  
  constructor(aiClient?: any) {
    this.aiClient = aiClient;
  }
  
  /**
   * 生成主大纲
   */
  async generate(options: MasterGeneratorOptions): Promise<GenerationResult<StoryContract>> {
    const { seed, genre, targetWordCount, platform, tone, onProgress } = options;
    
    const warnings: string[] = [];
    
    try {
      // Phase 1: 准备
      onProgress?.('准备', 0.1, '构建提示词...');
      
      const template = genre ? getExtendedGenreTemplate(genre) : undefined;
      const promptOptions: FiveStepPromptOptions = {
        seed,
        genre,
        targetWordCount: targetWordCount?.toString(),
        platform,
        tone,
        template,
      };
      
      const { system, user } = buildMasterOutlinePrompt(promptOptions);
      
      // Phase 2: 调用AI
      onProgress?.('生成', 0.3, '正在生成大纲...');
      
      if (!this.aiClient) {
        // 没有AI客户端时返回默认值
        onProgress?.('完成', 0.9, '生成完成');
        
        const defaultContract = createDefaultStoryContract({
          title: '待设定',
          genre: genre || '玄幻',
          oneLineSummary: seed,
        });
        
        return {
          success: true,
          data: defaultContract,
          warnings: ['未配置AI客户端，返回默认契约'],
        };
      }
      
      const response = await this.aiClient.complete({
        system,
        user,
        temperature: 0.7,
        maxTokens: 4000,
      });
      
      // Phase 3: 解析
      onProgress?.('解析', 0.6, '解析生成结果...');
      
      const jsonStr = this.extractJson(response.content);
      const parsed = JSON.parse(jsonStr);
      
      // Phase 4: 验证
      onProgress?.('验证', 0.8, '验证契约...');
      
      const validation = enhancedContractValidator.validateStoryContract(parsed);
      
      // 检查占位符
      const jsonContent = JSON.stringify(parsed);
      const placeholders = placeholderScanner.scan(jsonContent);
      if (placeholders.length > 0) {
        warnings.push(`发现 ${placeholders.length} 个占位符`);
      }
      
      if (!validation.isValid) {
        return {
          success: false,
          error: `契约验证失败: ${validation.violations.map(v => v.description).join(', ')}`,
          validation,
          warnings,
        };
      }
      
      // Phase 5: 完成
      onProgress?.('完成', 1.0, '生成完成');
      
      return {
        success: true,
        data: parsed,
        validation,
        warnings,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '生成失败',
        warnings,
      };
    }
  }
  
  /**
   * 增量更新大纲
   */
  async update(
    currentContract: StoryContract,
    updates: Partial<StoryContract>
  ): Promise<GenerationResult<StoryContract>> {
    try {
      const updated = { ...currentContract, ...updates };
      const validation = enhancedContractValidator.validateStoryContract(updated);
      
      return {
        success: validation.isValid,
        data: updated,
        validation,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新失败',
      };
    }
  }
  
  /**
   * 从JSON提取内容
   */
  private extractJson(content: string): string {
    // 尝试提取JSON块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    
    // 尝试提取大括号内的内容
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return braceMatch[0];
    }
    
    return content;
  }
  
  /**
   * 获取可用题材列表
   */
  getAvailableGenres(): string[] {
    return EXTENDED_GENRE_TEMPLATES.map(t => t.name);
  }
  
  /**
   * 获取题材模板
   */
  getGenreTemplate(genre: string) {
    return getExtendedGenreTemplate(genre);
  }
}

// 导出默认实例
export const masterOutlineGenerator = new MasterOutlineGenerator();
