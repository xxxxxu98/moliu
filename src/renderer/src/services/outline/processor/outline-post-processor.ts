/**
 * Outline Post-Processor
 * Orchestrates Markdown parsing, validation, and normalization
 */

import { OutlineSchema, type Outline, type Chapter, type Character } from '../schemas/outline.schema';
import { remarkParser, type ParseResult } from '../parser/remark-parser';
import { markdownExtractor } from '../parser/markdown-extractor';

/**
 * 后处理结果
 */
export interface PostProcessResult {
  success: boolean;
  outlines: Outline[];
  warnings: string[];
  errors: string[];
  strategy: 'remark' | 'regex' | 'json';
  rawMarkdown?: string;
}

/**
 * 后处理器
 * 负责 Markdown 解析、验证和规范化
 */
export class OutlinePostProcessor {
  private remarkEnabled = true;
  private regexEnabled = true;

  /**
   * 处理 Markdown 文本
   */
  process(markdown: string): PostProcessResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // 1. 尝试 Remark AST 解析
    if (this.remarkEnabled) {
      try {
        const parseResult = remarkParser.parse(markdown);
        const { valid, outlines, validationWarnings } = this.validateAndNormalizeFromParse(parseResult);
        warnings.push(...validationWarnings);

        if (valid && outlines.length > 0) {
          return {
            success: true,
            outlines,
            warnings,
            errors: [],
            strategy: 'remark',
          };
        }

        warnings.push('Remark 解析结果验证失败，尝试正则提取...');
      } catch (e) {
        warnings.push(`Remark 解析出错: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2. 尝试正则提取
    if (this.regexEnabled) {
      try {
        const extracted = markdownExtractor.extract(markdown);
        const { valid, outlines, validationWarnings } = this.validateAndNormalizeFromExtracted(extracted);
        warnings.push(...validationWarnings);

        if (valid && outlines.length > 0) {
          return {
            success: true,
            outlines,
            warnings,
            errors: [],
            strategy: 'regex',
          };
        }

        warnings.push('正则提取结果验证失败...');
      } catch (e) {
        warnings.push(`正则提取出错: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 3. 尝试从原始 Markdown 中提取 JSON
    const jsonResult = this.extractJsonFromMarkdown(markdown);
    if (jsonResult.success) {
      return this.processJSON(jsonResult.json);
    }

    // 4. 所有方法都失败
    errors.push('无法从 Markdown 中提取有效大纲数据');
    return {
      success: false,
      outlines: [],
      warnings,
      errors,
      strategy: 'regex',
      rawMarkdown: markdown,
    };
  }

  /**
   * 处理 JSON 字符串
   */
  processJSON(jsonString: string): PostProcessResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // 清理 JSON 字符串
      const cleaned = this.cleanJsonString(jsonString);
      const parsed = JSON.parse(cleaned);

      // 处理单个对象或数组
      const data = Array.isArray(parsed) ? parsed : [parsed];

      const outlines = this.normalizeRawOutlines(data);
      const validationResult = this.validateOutlines(outlines);

      if (validationResult.valid) {
        return {
          success: true,
          outlines: validationResult.outlines,
          warnings,
          errors: [],
          strategy: 'json',
        };
      }

      warnings.push(...validationResult.warnings);
      errors.push(...validationResult.errors);
    } catch (e) {
      errors.push(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      success: false,
      outlines: [],
      warnings,
      errors,
      strategy: 'json',
    };
  }

  /**
   * 从 Remark 解析结果验证和规范化
   */
  private validateAndNormalizeFromParse(parseResult: ParseResult): {
    valid: boolean;
    outlines: Outline[];
    validationWarnings: string[];
  } {
    const warnings: string[] = [];

    // 构建大纲对象
    let outline: Partial<Outline> = {
      title: parseResult.title,
      synopsis: parseResult.synopsis,
      genres: parseResult.genres,
      chapters: parseResult.chapters,
      characters: parseResult.characters,
      structure: parseResult.structure,
      foreshadows: parseResult.foreshadows,
      worldSetting: parseResult.worldSetting,
      estimatedWordCount: parseResult.estimatedWordCount,
    };

    // 智能补全标题：如果标题为空或无效，尝试从其他字段提取
    outline = this.smartExtractTitle(outline, parseResult);
    if (!outline.title || outline.title === '标题') {
      warnings.push('标题提取失败，已尝试从简介和章节中提取');
    }

    // 生成 ID
    outline.id = this.generateId();

    // 验证
    const result = OutlineSchema.safeParse(outline);

    if (!result.success) {
      warnings.push('部分字段验证失败，使用默认值填充...');
      const filled = this.fillDefaults(outline);
      return {
        valid: this.hasMinimumData(filled),
        outlines: [filled as Outline],
        validationWarnings: warnings,
      };
    }

    return {
      valid: true,
      outlines: [result.data],
      validationWarnings: warnings,
    };
  }

  /**
   * 智能提取标题 - 多层级兜底
   * 如果主标题为空或无效，尝试从其他字段提取
   */
  private smartExtractTitle(outline: Partial<Outline>, parseResult: ParseResult): Partial<Outline> {
    // 如果标题有效，直接返回
    if (outline.title && outline.title.trim() && outline.title !== '标题' && outline.title.length > 1) {
      return outline;
    }

    const candidates: string[] = [];

    // 1. 从简介中提取（取前 20 个字符作为候选）
    if (parseResult.synopsis) {
      const firstPart = parseResult.synopsis.substring(0, 20).trim();
      if (firstPart && firstPart.length > 2) {
        candidates.push(firstPart);
      }
    }

    // 2. 从章节标题中提取（第一个章节的标题）
    if (parseResult.chapters && parseResult.chapters.length > 0) {
      const firstChapter = parseResult.chapters[0];
      if (firstChapter.title) {
        // 去掉 "第X章：" 前缀
        const chapterTitle = firstChapter.title.replace(/^第\s*\d+\s*章[：:]\s*/, '');
        if (chapterTitle && chapterTitle.length > 2) {
          candidates.push(chapterTitle);
        }
      }
    }

    // 3. 从角色名中提取（如果有主角）
    if (parseResult.characters && parseResult.characters.length > 0) {
      const protagonist = parseResult.characters.find(c =>
        c.role?.includes('主角') || c.role?.includes('主')
      );
      if (protagonist?.name && protagonist.name.length > 1) {
        candidates.push(`${protagonist.name}的传奇`); // 组合一个标题
      }
    }

    // 选择最佳候选（最短的、可能是标题的）
    const validCandidates = candidates.filter(c => c.length >= 2 && c.length <= 30);
    if (validCandidates.length > 0) {
      // 选择最短的（通常标题比描述短）
      outline.title = validCandidates.sort((a, b) => a.length - b.length)[0];
    }

    return outline;
  }

  /**
   * 从正则提取结果验证和规范化
   */
  private validateAndNormalizeFromExtracted(extracted: ReturnType<typeof markdownExtractor.extract>): {
    valid: boolean;
    outlines: Outline[];
    validationWarnings: string[];
  } {
    const warnings: string[] = [];

    let outline: Partial<Outline> = {
      title: extracted.title,
      synopsis: extracted.synopsis,
      genres: extracted.genres,
      chapters: extracted.chapters,
      characters: extracted.characters,
      structure: extracted.structure,
      foreshadows: extracted.foreshadows as any,
      worldSetting: extracted.worldSetting,
      estimatedWordCount: extracted.estimatedWordCount,
      // 新增：支持核心卖点
      coreSellingPoints: extracted.coreSellingPoints,
    };

    // 智能补全标题
    outline = this.smartExtractTitleFromExtracted(outline, extracted);

    outline.id = this.generateId();

    const result = OutlineSchema.safeParse(outline);

    if (!result.success) {
      warnings.push('正则提取结果部分字段验证失败...');
      const filled = this.fillDefaults(outline);
      return {
        valid: this.hasMinimumData(filled),
        outlines: [filled as Outline],
        validationWarnings: warnings,
      };
    }

    return {
      valid: true,
      outlines: [result.data],
      validationWarnings: warnings,
    };
  }

  /**
   * 从提取结果智能提取标题
   */
  private smartExtractTitleFromExtracted(outline: Partial<Outline>, extracted: ReturnType<typeof markdownExtractor.extract>): Partial<Outline> {
    // 如果标题有效，直接返回
    if (outline.title && outline.title.trim() && outline.title !== '标题' && outline.title.length > 1) {
      return outline;
    }

    const candidates: string[] = [];

    // 1. 从简介中提取
    if (extracted.synopsis) {
      const firstPart = extracted.synopsis.substring(0, 20).trim();
      if (firstPart && firstPart.length > 2) {
        candidates.push(firstPart);
      }
    }

    // 2. 从章节标题中提取
    if (extracted.chapters && extracted.chapters.length > 0) {
      const firstChapter = extracted.chapters[0];
      if (firstChapter.title) {
        const chapterTitle = firstChapter.title.replace(/^第\s*\d+\s*章[：:]\s*/, '');
        if (chapterTitle && chapterTitle.length > 2) {
          candidates.push(chapterTitle);
        }
      }
    }

    // 3. 从角色名中提取
    if (extracted.characters && extracted.characters.length > 0) {
      const protagonist = extracted.characters.find(c =>
        c.role?.includes('主角') || c.role?.includes('主')
      );
      if (protagonist?.name && protagonist.name.length > 1) {
        candidates.push(`${protagonist.name}的传奇`);
      }
    }

    const validCandidates = candidates.filter(c => c.length >= 2 && c.length <= 30);
    if (validCandidates.length > 0) {
      outline.title = validCandidates.sort((a, b) => a.length - b.length)[0];
    }

    return outline;
  }

  /**
   * 验证大纲列表
   */
  private validateOutlines(outlines: Partial<Outline>[]): {
    valid: boolean;
    outlines: Outline[];
    warnings: string[];
    errors: string[];
  } {
    const validOutlines: Outline[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < outlines.length; i++) {
      const outline = outlines[i];
      const result = OutlineSchema.safeParse(outline);

      if (result.success) {
        validOutlines.push(result.data);
      } else {
        const filled = this.fillDefaults(outline);
        if (this.hasMinimumData(filled)) {
          validOutlines.push(filled as Outline);
          warnings.push(`大纲 ${i + 1}: 使用填充的默认值`);
        } else {
          errors.push(`大纲 ${i + 1}: 缺少必要字段`);
        }
      }
    }

    return {
      valid: validOutlines.length > 0,
      outlines: validOutlines,
      warnings,
      errors,
    };
  }

  /**
   * 规范化原始大纲数据
   */
  private normalizeRawOutlines(data: any[]): Partial<Outline>[] {
    return data.map((item) => this.normalizeRawOutline(item));
  }

  /**
   * 规范化单个原始大纲
   */
  private normalizeRawOutline(raw: any): Partial<Outline> {
    return {
      id: raw.id || this.generateId(),
      title: raw.title || raw.name || '未命名大纲',
      synopsis: raw.synopsis || raw.summary || raw.description || '',
      genres: this.normalizeArray(raw.genres || raw.tags || []),
      chapters: this.normalizeChapters(raw.chapters || raw.sections || []),
      characters: this.normalizeCharacters(raw.characters || raw.roles || []),
      structure: raw.structure || undefined,
      foreshadows: this.normalizeForeshadows(raw.foreshadows || raw.hints || []),
      worldSetting: raw.worldSetting || raw.world || undefined,
      estimatedWordCount: raw.estimatedWordCount || raw.wordCount || undefined,
    };
  }

  /**
   * 规范化章节列表
   */
  private normalizeChapters(chapters: any[]): Chapter[] {
    return chapters.map((ch) => ({
      title: ch.title || ch.name || '未命名章节',
      summary: ch.summary || ch.description || ch.content || '',
      keyEvents: this.normalizeArray(ch.keyEvents || ch.events || []),
      involvedCharacters: this.normalizeArray(ch.involvedCharacters || ch.characters || []),
      // 新增：支持章节核心元素
      coreEvent: ch.coreEvent || undefined,
      hook: ch.hook || undefined,
      coolPoints: this.normalizeArray(ch.coolPoints || []),
      foreshadows: this.normalizeArray(ch.foreshadows || []),
    }));
  }

  /**
   * 规范化角色列表
   */
  private normalizeCharacters(characters: any[]): Character[] {
    return characters.map((char) => ({
      name: char.name || '未知角色',
      role: char.role || char.type || '角色',
      description: char.description || char.desc || '',
      personality: this.normalizeArray(char.personality || char.traits || []),
      appearance: char.appearance || undefined,
      abilities: this.normalizeArray(char.abilities || char.skills || []),
      background: char.background || undefined,
      relationships: this.normalizeArray(char.relationships || []),
    }));
  }

  /**
   * 规范化伏笔列表
   */
  private normalizeForeshadows(foreshadows: any[]): any[] {
    return foreshadows.map((fs) => ({
      hint: fs.hint || fs.content || fs.description || String(fs),
      type: fs.type || 'event',
      suggestedChapter: fs.suggestedChapter || fs.chapter || undefined,
      // 新增：支持伏笔分期
      phase: fs.phase || undefined,
    }));
  }

  /**
   * 规范化数组
   */
  private normalizeArray(arr: any): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean);
  }

  /**
   * 填充默认值
   */
  private fillDefaults(outline: Partial<Outline>): Partial<Outline> {
    return {
      id: outline.id || this.generateId(),
      title: outline.title || '未命名大纲',
      synopsis: outline.synopsis || outline.synopsis || '',
      genres: outline.genres || [],
      chapters: outline.chapters || [],
      characters: outline.characters || [],
      structure: outline.structure || { act1: '', act2a: '', act2b: '', act3: '' },
      foreshadows: outline.foreshadows || [],
      worldSetting: outline.worldSetting || undefined,
      estimatedWordCount: outline.estimatedWordCount || 300000,
    };
  }

  /**
   * 检查是否有最低数据
   */
  private hasMinimumData(outline: Partial<Outline>): boolean {
    return !!(outline.title && outline.synopsis);
  }

  /**
   * 清理 JSON 字符串
   */
  private cleanJsonString(json: string): string {
    // 移除代码块标记
    let cleaned = json.replace(/```(?:json)?\s*/gi, '');
    cleaned = cleaned.replace(/```\s*$/gi, '');

    // 移除 markdown 标记
    cleaned = cleaned.replace(/^\s*[-*]\s+/gm, '');

    // 尝试找到 JSON 对象的开始和结束
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    } else {
      // 尝试数组
      const arrayStartIdx = cleaned.indexOf('[');
      const arrayEndIdx = cleaned.lastIndexOf(']');

      if (arrayStartIdx !== -1 && arrayEndIdx !== -1 && arrayEndIdx > arrayStartIdx) {
        cleaned = cleaned.substring(arrayStartIdx, arrayEndIdx + 1);
      }
    }

    return cleaned.trim();
  }

  /**
   * 从 Markdown 中提取 JSON
   */
  private extractJsonFromMarkdown(markdown: string): { success: boolean; json?: string } {
    // 尝试匹配 JSON 代码块
    const jsonBlockMatch = markdown.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/i);

    if (jsonBlockMatch) {
      return { success: true, json: jsonBlockMatch[1] };
    }

    // 尝试直接解析
    const jsonStartIdx = markdown.indexOf('{');
    const jsonEndIdx = markdown.lastIndexOf('}');

    if (jsonStartIdx !== -1 && jsonEndIdx !== -1 && jsonEndIdx > jsonStartIdx) {
      const potential = markdown.substring(jsonStartIdx, jsonEndIdx + 1);
      try {
        JSON.parse(potential);
        return { success: true, json: potential };
      } catch {
        // 尝试作为数组
      }
    }

    const arrayStartIdx = markdown.indexOf('[');
    const arrayEndIdx = markdown.lastIndexOf(']');

    if (arrayStartIdx !== -1 && arrayEndIdx !== -1 && arrayEndIdx > arrayStartIdx) {
      const potential = markdown.substring(arrayStartIdx, arrayEndIdx + 1);
      try {
        JSON.parse(potential);
        return { success: true, json: potential };
      } catch {
        // 尝试失败
      }
    }

    return { success: false };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `outline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// 导出单例
export const outlinePostProcessor = new OutlinePostProcessor();
