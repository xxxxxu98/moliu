/**
 * Outline Post-Processor
 * Orchestrates Markdown parsing, validation, and normalization
 */

import {
  OutlineSchema,
  type Outline,
  type Chapter,
  type Character,
} from '../schemas/outline.schema';
import { remarkParser, type ParseResult } from '../parser/remark-parser';
import { markdownExtractor } from '../parser/markdown-extractor';
import {
  normalizeCharacterName as normalizeOutlineCharacterName,
  normalizeCharacterRole as normalizeOutlineCharacterRole,
  normalizeForeshadowType as normalizeOutlineForeshadowType,
} from '../utils';

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
   * 将包含多个大纲的 Markdown 拆分为独立块
   */
  private splitMarkdownIntoOutlineBlocks(markdown: string): Array<{ content: string; title?: string }> {
    const normalized = markdown.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const blocks: Array<{ content: string; title?: string }> = [];
    let current: string[] = [];
    let currentTitle: string | undefined;
    let started = false;

    const outlineStartPatterns = [
      // 常见：# 大纲1：xxx / ## 方案二 / ### 故事大纲3
      /^\s*#+\s*(?:大纲|方案|故事方案|故事大纲)\s*(?:[0-9]+|[一二三四五六七八九十百千]+)?\s*[：:]?.*$/,
      // 常见：# 第1套大纲 / # 第三版方案 / ## 第2稿故事大纲
      /^\s*#+\s*第\s*(?:[0-9]+|[一二三四五六七八九十百千]+)\s*(?:套|版|稿|轮)?\s*(?:大纲|方案|故事大纲|故事方案)\s*[：:]?.*$/,
      // 常见：# 一、大纲 / ## 二、方案 / ### 三、故事
      /^\s*#+\s*(?:[0-9]+|[一二三四五六七八九十百千]+)\s*[、.．]\s*.*(?:大纲|方案|故事|设定).*$/,
      // 常见：# 方案A / # 大纲-B / # 故事方案C
      /^\s*#+\s*(?:大纲|方案|故事方案|故事大纲)\s*[-_—]?[A-Za-z]+\s*[：:]?.*$/,
      // 更泛化：# 第一套 / # 第二版 / # 方案甲 / ## 第三轮（依赖后续上下文标题语义）
      /^\s*#+\s*(?:第\s*)?(?:[0-9]+|[一二三四五六七八九十百千]+|[甲乙丙丁戊己庚辛壬癸])\s*(?:套|版|稿|轮)?(?:\s*[：:].*)?$/,
    ];

    const isOutlineStart = (line: string) => outlineStartPatterns.some(pattern => pattern.test(line));

    const extractTitle = (line: string) => line.replace(/^\s*#+\s*/, '').trim();

    const pushCurrent = () => {
      const content = current.join('\n').trim();
      if (started && content) {
        blocks.push({ content, title: currentTitle });
      }
      current = [];
      currentTitle = undefined;
    };

    for (const line of lines) {
      if (isOutlineStart(line)) {
        started = true;
        if (current.length > 0) pushCurrent();
        currentTitle = extractTitle(line);
        console.debug('[OutlinePostProcessor] outline block start', {
          title: currentTitle,
          linePreview: line.slice(0, 120),
          lineIndex: blocks.length + current.length,
        });
        current.push(line);
        continue;
      }

      if (!started) continue;
      current.push(line);
    }

    pushCurrent();

    return blocks.length > 0 ? blocks : [{ content: markdown }];
  }

  /**
   * 处理 Markdown 文本
   */
  process(markdown: string): PostProcessResult {
    const blocks = this.splitMarkdownIntoOutlineBlocks(markdown);
    console.debug('[OutlinePostProcessor] process start', {
      markdownLength: markdown.length,
      outlineBlocks: blocks.length,
      remarkEnabled: this.remarkEnabled,
      regexEnabled: this.regexEnabled,
      blockTitles: blocks.map(block => block.title || 'unknown').slice(0, 10),
      preview: markdown.slice(0, 300),
    });

    const aggregateWarnings: string[] = [];
    const aggregateErrors: string[] = [];
    const outlines: Outline[] = [];
    let strategy: PostProcessResult['strategy'] = 'remark';

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      console.debug('[OutlinePostProcessor] process block', {
        blockIndex: i,
        blockCount: blocks.length,
        title: block.title,
        contentLength: block.content.length,
        preview: block.content.slice(0, 220),
      });
      const result = this.processSingleMarkdown(block.content, i, blocks.length);
      aggregateWarnings.push(...result.warnings);
      aggregateErrors.push(...result.errors);
      strategy = result.strategy;
      outlines.push(...result.outlines);
      console.debug('[OutlinePostProcessor] block finished', {
        blockIndex: i,
        success: result.success,
        strategy: result.strategy,
        outlineCount: result.outlines.length,
        warnings: result.warnings,
        errors: result.errors,
      });
    }

    if (outlines.length > 0) {
      return {
        success: true,
        outlines,
        warnings: aggregateWarnings,
        errors: [],
        strategy,
        rawMarkdown: markdown,
      };
    }

    aggregateErrors.push('无法从 Markdown 中提取有效大纲数据');
    return {
      success: false,
      outlines: [],
      warnings: aggregateWarnings,
      errors: aggregateErrors,
      strategy: 'regex',
      rawMarkdown: markdown,
    };
  }

  private processSingleMarkdown(markdown: string, blockIndex: number, blockCount: number): PostProcessResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const blockPrefix = blockCount > 1 ? `[block ${blockIndex + 1}/${blockCount}] ` : '';

    if (this.remarkEnabled) {
      try {
        const parseResult = remarkParser.parse(markdown);
        console.debug('[OutlinePostProcessor] remark parse result', {
          blockIndex,
          blockCount,
          title: parseResult.title,
          synopsisLength: parseResult.synopsis?.length || 0,
          genres: parseResult.genres,
          chapters: parseResult.chapters?.length || 0,
          characters: parseResult.characters?.length || 0,
          foreshadows: parseResult.foreshadows?.length || 0,
          firstChapter: parseResult.chapters?.[0],
          firstCharacter: parseResult.characters?.[0],
          firstForeshadow: parseResult.foreshadows?.[0],
        });
        console.debug('[OutlinePostProcessor] remark parse raw snapshot', {
          blockIndex,
          title: parseResult.title,
          structureKeys: parseResult.structure ? Object.keys(parseResult.structure as Record<string, unknown>) : [],
          worldSetting: parseResult.worldSetting,
          emotionGoal: parseResult.emotionGoal,
          coolPointDesign: parseResult.coolPointDesign,
          conflictDesign: parseResult.conflictDesign,
          storyLineKeys: parseResult.storyLines ? Object.keys(parseResult.storyLines as Record<string, unknown>) : [],
        });

        const { valid, outlines, validationWarnings } = this.validateAndNormalizeFromParse(parseResult);
        warnings.push(...validationWarnings.map(w => `${blockPrefix}${w}`));

        if (valid && outlines.length > 0) {
          return {
            success: true,
            outlines,
            warnings,
            errors: [],
            strategy: 'remark',
          };
        }

        warnings.push(`${blockPrefix}Remark 解析结果验证失败，尝试正则提取...`);
      } catch (e) {
        const msg = `${blockPrefix}Remark 解析出错: ${e instanceof Error ? e.message : String(e)}`;
        console.warn('[OutlinePostProcessor]', msg, e);
        warnings.push(msg);
      }
    }

    if (this.regexEnabled) {
      try {
        const extracted = markdownExtractor.extract(markdown);
        console.debug('[OutlinePostProcessor] regex extract result', {
          blockIndex,
          blockCount,
          title: extracted.title,
          synopsisLength: extracted.synopsis?.length || 0,
          genres: extracted.genres,
          chapters: extracted.chapters?.length || 0,
          characters: extracted.characters?.length || 0,
          foreshadows: extracted.foreshadows?.length || 0,
          firstChapter: extracted.chapters?.[0],
          firstCharacter: extracted.characters?.[0],
          firstForeshadow: extracted.foreshadows?.[0],
        });

        const { valid, outlines, validationWarnings } = this.validateAndNormalizeFromExtracted(extracted);
        warnings.push(...validationWarnings.map(w => `${blockPrefix}${w}`));

        if (valid && outlines.length > 0) {
          return {
            success: true,
            outlines,
            warnings,
            errors: [],
            strategy: 'regex',
          };
        }

        warnings.push(`${blockPrefix}正则提取结果验证失败...`);
      } catch (e) {
        const msg = `${blockPrefix}正则提取出错: ${e instanceof Error ? e.message : String(e)}`;
        console.warn('[OutlinePostProcessor]', msg, e);
        warnings.push(msg);
      }
    }

    const jsonResult = this.extractJsonFromMarkdown(markdown);
    if (jsonResult.success && jsonResult.json) {
      return this.processJSON(jsonResult.json);
    }

    errors.push(`${blockPrefix}无法从 Markdown 中提取有效大纲数据`);
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
      const cleaned = this.cleanJsonString(jsonString || '');
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
      // 转换 ChapterEnhanced[] -> Chapter[]，确保 number 字段
      chapters: (parseResult.chapters || []).map(ch => ({
        id: ch.id,
        number: ch.number,
        title: ch.title,
        summary: ch.summary || '',
        objectives: ch.objectives || [],
        coolPoints: ch.coolPoints || [],
        foreshadows: ch.foreshadows || [],
        strand: ch.strand || 'quest',
        timeAnchor: ch.timeAnchor,
        status: ch.status || 'outline',
        keyEvents: ch.keyEvents || [],
        involvedCharacters: ch.involvedCharacters || [],
        coreEvent: ch.coreEvent,
        hook: ch.hook,
      })),
      // 转换角色，确保 identity 字段（schema required）
      characters: this.augmentCharactersFromStoryLines(
        (parseResult.characters || []).map(c => ({
          name: c.name || '未知角色',
          role: normalizeOutlineCharacterRole(c.role || '配角'),
          identity: (c as any).identity || '',
          description: (c as any).description || (c as any).identity || '',
          personality: c.personality || [],
          goldenFinger: (c as any).goldenFinger,
          strengths: (c as any).strengths || [],
          weaknesses: (c as any).weaknesses || [],
          goals: (c as any).goals || [],
          currentDilemma: (c as any).currentDilemma || '',
          appearance: (c as any).appearance,
          speechStyle: (c as any).speechStyle,
          relationships: this.normalizeRelationships((c as any).relationships || []),
        })),
        parseResult.storyLines,
      ),
      structure: parseResult.structure,
      foreshadows: (parseResult.foreshadows || []).map(f => ({
        id: f.id,
        hint: f.hint,
        type: normalizeOutlineForeshadowType(f.type || 'event'),
        suggestedChapter: f.suggestedChapter,
        status: f.status || 'active',
        phase: f.phase,
      })),
      // 规范化 worldSetting（确保 category 字段有效）
      worldSetting: this.normalizeWorldSetting(parseResult.worldSetting),
      estimatedWordCount: parseResult.estimatedWordCount,
      coreSellingPoints: parseResult.coreSellingPoints,
      // 规范化情绪目标
      emotionGoal: this.normalizeEmotionGoal(parseResult.emotionGoal),
      // 确保 coolPointDesign 有 density 字段
      coolPointDesign: parseResult.coolPointDesign
        ? {
            density: (parseResult.coolPointDesign as any).density || {
              micro: 3000,
              small: 9000,
              big: 21000,
            },
            patterns: parseResult.coolPointDesign.patterns || [],
            arranged: (parseResult.coolPointDesign.arranged || []).map((cp: any) => ({
              chapter: cp.suggestedChapter || 0,
              type: cp.type || '',
              description: cp.description || '',
            })),
          }
        : undefined,
      // 规范化八条故事线（字符串 -> 对象）
      storyLines: this.normalizeStoryLines(parseResult.storyLines),
      // 规范化矛盾设计
      conflictDesign: this.normalizeConflictDesign(parseResult.conflictDesign),
    };

    console.debug('[OutlinePostProcessor] parse normalized raw', {
      title: outline.title,
      characters: outline.characters?.length || 0,
      chapters: outline.chapters?.length || 0,
      foreshadows: outline.foreshadows?.length || 0,
      firstCharacter: outline.characters?.[0],
      firstForeshadow: outline.foreshadows?.[0],
      coolPointDesign: outline.coolPointDesign,
      storyLines: outline.storyLines,
    });
    this.logCharacterCoverage(outline.characters || [], 'remark');
    this.logChapterAlignment(outline.chapters || [], outline.foreshadows || [], 'remark');

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
    if (
      outline.title &&
      outline.title.trim() &&
      outline.title !== '标题' &&
      outline.title.length > 1
    ) {
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
      const protagonist = parseResult.characters.find(
        c => c.role?.includes('主角') || c.role?.includes('主')
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
  private validateAndNormalizeFromExtracted(
    extracted: ReturnType<typeof markdownExtractor.extract>
  ): {
    valid: boolean;
    outlines: Outline[];
    validationWarnings: string[];
  } {
    const warnings: string[] = [];

    let outline: Partial<Outline> = {
      title: extracted.title,
      synopsis: extracted.synopsis,
      genres: extracted.genres,
      chapters: (extracted.chapters || []).map(ch => ({
        number: (ch as any).number || 0,
        title: ch.title || '未命名章节',
        summary: ch.summary || '',
        objectives: [],
        coolPoints: ch.coolPoints || [],
        foreshadows: [],
        strand: 'quest' as const,
        status: 'outline' as const,
        keyEvents: ch.keyEvents || [],
        involvedCharacters: ch.involvedCharacters || [],
        coreEvent: ch.coreEvent,
        hook: ch.hook,
      })),
      characters: (extracted.characters || []).map(c => ({
        name: c.name || '未知角色',
        role: normalizeOutlineCharacterRole(c.role || '配角'),
        identity: c.description || '',
        description: c.description || '',
        personality: c.personality || [],
        goldenFinger: undefined,
        strengths: [],
        weaknesses: [],
        goals: [],
        currentDilemma: '',
        appearance: undefined,
        speechStyle: undefined,
        relationships: [],
      })),
      structure: extracted.structure,
      foreshadows: (extracted.foreshadows || []).map(f => ({
        hint: f.hint,
        type: normalizeOutlineForeshadowType(f.type || 'mystery'),
        suggestedChapter: undefined,
        status: 'active' as const,
        phase: f.phase,
      })),
      worldSetting: this.normalizeWorldSetting(extracted.worldSetting),
      estimatedWordCount: extracted.estimatedWordCount,
      coreSellingPoints: extracted.coreSellingPoints?.map(sp =>
        typeof sp === 'string' ? sp : (sp as any).name || ''
      ),
      emotionGoal: this.normalizeEmotionGoal(extracted.emotionGoal),
      // 确保 coolPointDesign 有 density 字段
      coolPointDesign: extracted.coolPointDesign
        ? {
            density: (extracted.coolPointDesign as any).density || {
              micro: 3000,
              small: 9000,
              big: 21000,
            },
            patterns: extracted.coolPointDesign.patterns || [],
            arranged: (extracted.coolPointDesign.arranged || []).map((cp: any) => ({
              chapter: cp.suggestedChapter || 0,
              type: cp.type || '',
              description: cp.description || '',
            })),
          }
        : undefined,
      storyLines: this.normalizeStoryLines(extracted.storyLines),
      conflictDesign: this.normalizeConflictDesign(extracted.conflictDesign),
    };

    console.debug('[OutlinePostProcessor] extracted normalized raw', {
      title: outline.title,
      characters: outline.characters?.length || 0,
      chapters: outline.chapters?.length || 0,
      foreshadows: outline.foreshadows?.length || 0,
      firstCharacter: outline.characters?.[0],
      firstForeshadow: outline.foreshadows?.[0],
      coolPointDesign: outline.coolPointDesign,
      storyLines: outline.storyLines,
    });
    this.logCharacterCoverage(outline.characters || [], 'regex');
    this.logChapterAlignment(outline.chapters || [], outline.foreshadows || [], 'regex');

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
  private smartExtractTitleFromExtracted(
    outline: Partial<Outline>,
    extracted: ReturnType<typeof markdownExtractor.extract>
  ): Partial<Outline> {
    // 如果标题有效，直接返回
    if (
      outline.title &&
      outline.title.trim() &&
      outline.title !== '标题' &&
      outline.title.length > 1
    ) {
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
      const protagonist = extracted.characters.find(
        c => c.role?.includes('主角') || c.role?.includes('主')
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
    return data.map(item => this.normalizeRawOutline(item));
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
      structure: this.normalizeStructure(raw.structure),
      foreshadows: this.normalizeForeshadows(raw.foreshadows || raw.hints || []),
      worldSetting: this.normalizeWorldSetting(raw.worldSetting || raw.world),
      estimatedWordCount: raw.estimatedWordCount || raw.wordCount || undefined,

      // 新增：情绪目标
      emotionGoal: raw.emotionGoal
        ? this.normalizeEmotionGoal({
            primary: raw.emotionGoal.primary || '',
            secondary: raw.emotionGoal.secondary,
            arc: raw.emotionGoal.arc || 'rising',
            density: raw.emotionGoal.density,
            highPoints: this.normalizeArray(raw.emotionGoal.highPoints || []),
            lowPoints: this.normalizeArray(raw.emotionGoal.lowPoints || []),
          })
        : undefined,

      // 新增：爽点设计
      coolPointDesign: raw.coolPointDesign
        ? {
            density: { micro: 3000, small: 9000, big: 21000 },
            patterns: this.normalizeArray(raw.coolPointDesign.patterns || []),
            arranged: (raw.coolPointDesign.arranged || []).map((cp: any) => ({
              chapter: cp.chapter || cp.suggestedChapter || 0,
              type: cp.type || '',
              description: cp.description || '',
            })),
          }
        : undefined,

      // 新增：核心卖点
      coreSellingPoints: (raw.coreSellingPoints || []).map((cp: any) => ({
        name: typeof cp === 'string' ? cp : cp.name || '',
        description: typeof cp === 'string' ? '' : cp.description || '',
        priority: typeof cp === 'string' ? 1 : cp.priority || 1,
      })),

      // 新增：矛盾设计
      conflictDesign: raw.conflictDesign
        ? this.normalizeConflictDesign({
            source: raw.conflictDesign.source || '资源/利益',
            escalation: this.normalizeArray(raw.conflictDesign.escalation || []),
            majorConflicts: this.normalizeArray(raw.conflictDesign.majorConflicts || []),
          })
        : undefined,

      // 新增：八条故事线
      storyLines: raw.storyLines ? this.normalizeStoryLines(raw.storyLines) : undefined,
    } as Partial<Outline>;
  }

  /**
   * 规范化章节列表
   */
  private normalizeChapters(chapters: any[]): Chapter[] {
    return chapters.map((ch, idx) => ({
      number: ch.number ?? idx + 1,
      title: ch.title || ch.name || '未命名章节',
      summary: ch.summary || ch.description || ch.content || '',
      objectives: this.normalizeArray(ch.objectives || []),
      coolPoints: this.normalizeArray(ch.coolPoints || []),
      foreshadows: this.normalizeArray(ch.foreshadows || []),
      strand: ch.strand || 'quest',
      timeAnchor: ch.timeAnchor || undefined,
      status: ch.status || 'outline',
      keyEvents: this.normalizeArray(ch.keyEvents || ch.events || []),
      involvedCharacters: this.normalizeArray(ch.involvedCharacters || ch.characters || []),
      coreEvent: ch.coreEvent || undefined,
      hook: ch.hook || undefined,
    }));
  }

  private logChapterAlignment(chapters: any[], foreshadows: any[], source: string): void {
    const chapterNumbers = chapters.map((ch, idx) => ch.number ?? idx + 1);
    const foreshadowChapters = foreshadows.map((f: any) => f.suggestedChapter ?? f.chapter ?? null);
    console.debug('[OutlinePostProcessor] chapter alignment', {
      source,
      chapterNumbers,
      foreshadowChapters,
      chapterCount: chapters.length,
      foreshadowCount: foreshadows.length,
      firstChapters: chapters.slice(0, 5),
      firstForeshadows: foreshadows.slice(0, 5),
    });
  }

  private logCharacterCoverage(characters: any[], source: string): void {
    const roleCounts = characters.reduce((acc: Record<string, number>, char: any) => {
      const role = char?.role || 'undefined';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    console.debug('[OutlinePostProcessor] character coverage', {
      source,
      characterCount: characters.length,
      roleCounts,
      sampleCharacters: characters.slice(0, 5),
    });
  }

  /**
   * 规范化角色列表
   */
  private normalizeCharacters(characters: any[]): Character[] {
    return characters.map(char => ({
      name: normalizeOutlineCharacterName(char.name || '未知角色'),
      role: normalizeOutlineCharacterRole(char.role || char.type || 'supporting'),
      identity: char.identity || char.description || char.desc || '',
      description: char.description || char.desc || '',
      personality: this.normalizeArray(char.personality || char.traits || []),
      appearance: char.appearance || undefined,
      abilities: this.normalizeArray(char.abilities || char.skills || []),
      background: char.background || undefined,
      relationships: this.normalizeRelationships(char.relationships || []),
      goldenFinger: char.goldenFinger || char.golden_finger || undefined,
      strengths: this.normalizeArray(char.strengths || []),
      weaknesses: this.normalizeArray(char.weaknesses || []),
      goals: this.normalizeArray(char.goals || []),
      currentDilemma: char.currentDilemma || '',
      speechStyle: char.speechStyle || undefined,
    }));
  }


  /**
   * 规范化角色关系
   */
  private normalizeRelationships(relationships: any[]): any[] {
    return relationships.map((r: any) => {
      if (typeof r === 'string') {
        return { targetName: r, type: 'neutral', description: '' };
      }
      return {
        targetName: r.targetName || r.name || '',
        type: r.type || 'neutral',
        description: r.description || '',
      };
    });
  }

  /**
   * 规范化角色名
   */
  private normalizeForeshadows(foreshadows: any[]): any[] {
    return foreshadows.map(fs => ({
      hint: fs.hint || fs.content || fs.description || String(fs),
      type: normalizeOutlineForeshadowType(fs.type || 'event'),
      suggestedChapter: fs.suggestedChapter || fs.chapter || undefined,
      phase: fs.phase || undefined,
    }));
  }

  /**
   * 规范化伏笔类型
   */
  private normalizeForeshadowType(type: string): 'item' | 'dialogue' | 'event' | 'mystery' {
    if (!type) return 'mystery';
    const t = type.toLowerCase();
    if (t.includes('道具') || t.includes('物品') || t.includes('item')) return 'item';
    if (t.includes('对话') || t.includes('dialogue')) return 'dialogue';
    if (t.includes('事件') || t.includes('event')) return 'event';
    // 悬念/mystery 作为默认值
    return 'mystery';
  }

  /**
   * 规范化数组
   */
  private normalizeArray(arr: any): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => (typeof item === 'string' ? item : String(item))).filter(Boolean);
  }

  /**
   * 规范化结构（处理 JSON 中纯字符串的情况）
   */
  private normalizeStructure(structure: any): Outline['structure'] {
    if (!structure) {
      return {
        act1: { title: '第一幕：建置', content: '', wordCountRatio: 0.2 },
        act2a: { title: '第二幕A：对抗（上）', content: '', wordCountRatio: 0.25 },
        act2b: { title: '第二幕B：对抗（下）', content: '', wordCountRatio: 0.25 },
        act3: { title: '第三幕：结局', content: '', wordCountRatio: 0.3 },
      };
    }
    // 如果已经是正确格式
    if (structure.act1?.content !== undefined) {
      return structure;
    }
    // 处理纯字符串格式
    return {
      act1: {
        title: '第一幕：建置',
        content: typeof structure.act1 === 'string' ? structure.act1 : '',
        wordCountRatio: 0.2,
      },
      act2a: {
        title: '第二幕A：对抗（上）',
        content: typeof structure.act2a === 'string' ? structure.act2a : '',
        wordCountRatio: 0.25,
      },
      act2b: {
        title: '第二幕B：对抗（下）',
        content: typeof structure.act2b === 'string' ? structure.act2b : '',
        wordCountRatio: 0.25,
      },
      act3: {
        title: '第三幕：结局',
        content: typeof structure.act3 === 'string' ? structure.act3 : '',
        wordCountRatio: 0.3,
      },
    };
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
      structure: outline.structure || {
        act1: { title: '第一幕：建置', content: '', wordCountRatio: 0.2 },
        act2a: { title: '第二幕A：对抗（上）', content: '', wordCountRatio: 0.25 },
        act2b: { title: '第二幕B：对抗（下）', content: '', wordCountRatio: 0.25 },
        act3: { title: '第三幕：结局', content: '', wordCountRatio: 0.3 },
      },
      foreshadows: outline.foreshadows || [],
      subplots: outline.subplots || [],
      worldSetting: outline.worldSetting,
      estimatedWordCount: outline.estimatedWordCount || 300000,
      coreSellingPoints: outline.coreSellingPoints || [],
      emotionGoal: outline.emotionGoal,
      coolPointDesign: outline.coolPointDesign,
      storyLines: outline.storyLines,
      conflictDesign: outline.conflictDesign,
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
   * 规范化世界设定中的 category 字段
   */
  private normalizeWorldSetting(worldSetting: any): any {
    if (!worldSetting) return undefined;

    const validCategories = ['cultivation', 'magic', 'social', 'physics', 'custom', '修炼', '魔法', '社会', '科技', 'custom'] as const;
    const categoryMap: Record<string, string> = {
      修炼: 'cultivation',
      魔法: 'magic',
      社会: 'social',
      科技: 'physics',
      custom: 'custom',
      新手村: 'city',
      主城: 'district',
      禁地: 'special',
    };

    const normalized = { ...worldSetting };

    if (normalized.rules) {
      normalized.rules = normalized.rules.map((rule: any) => {
        if (rule.category) {
          const normalizedCategory = categoryMap[rule.category] || rule.category;
          // 如果不是有效值，设置为 custom
          if (!['cultivation', 'magic', 'social', 'physics', 'custom'].includes(normalizedCategory)) {
            return { ...rule, category: 'custom' };
          }
          return { ...rule, category: normalizedCategory };
        }
        return rule;
      });
    }

    if (normalized.locations) {
      normalized.locations = normalized.locations.map((loc: any) => {
        if (loc.level) {
          const normalizedLevel = categoryMap[loc.level] || loc.level;
          if (!['world', 'continent', 'country', 'city', 'district', 'special'].includes(normalizedLevel)) {
            return { ...loc, level: 'city' };
          }
          return { ...loc, level: normalizedLevel };
        }
        return loc;
      });
    }

    return normalized;
  }

  /**
   * 从故事线补充角色，尽量把重要人物纳入角色列表
   */
  private augmentCharactersFromStoryLines(characters: Character[], storyLines: any): Character[] {
    if (!storyLines) return characters;

    const existingMap = new Map(
      characters.map(c => [normalizeOutlineCharacterName(c.name), c])
    );

    const addCandidate = (name: string, role: string, description = '') => {
      const cleanName = normalizeOutlineCharacterName(name);
      if (!cleanName || cleanName === '未知角色') return;
      const key = cleanName;
      if (existingMap.has(key)) return;

      const char: Character = {
        name: cleanName,
        role: normalizeOutlineCharacterRole(role || '配角'),
        identity: description || '',
        description: description || '',
        personality: [],
        strengths: [],
        weaknesses: [],
        goals: [],
        currentDilemma: '',
        relationships: [],
      };
      existingMap.set(key, char);
      characters.push(char);
    };

    const extractNames = (text: string) => {
      if (!text) return [] as Array<{ name: string; role: string }>;
      const parts = text.split(/[→,，、/｜|]+/).map(s => s.trim()).filter(Boolean);
      return parts
        .map(part => {
          const match = part.match(/^(.+?)[（(]([^）)]+)[）)]$/);
          if (match) return { name: match[1].trim(), role: match[2].trim() };
          return { name: part, role: '配角' };
        })
        .filter(item => item.name.length > 1 && !/^(孤身|学生|普通世界|市井生活|古玩街|苏氏集团|地下赌石场|国际拍卖会)$/.test(item.name));
    };

    const storyCharacter = (storyLines.character as any)?.planned || [];
    for (const item of storyCharacter) {
      if (typeof item === 'string') {
        addCandidate(item, '配角');
      } else {
        addCandidate(item.id || item.name || '', item.role || '配角');
      }
    }

    const chainTexts = [
      storyLines.map?.planned,
      storyLines.faction?.planned,
      storyLines.worldRules?.revealed,
      storyLines.conflict?.chains?.map((c: any) => c.name),
      storyLines.collection?.target,
      storyLines.romance?.progression,
    ];

    for (const value of chainTexts) {
      for (const item of value || []) {
        if (typeof item === 'string') {
          for (const candidate of extractNames(item)) {
            addCandidate(candidate.name, candidate.role || '配角');
          }
        } else if (item?.name) {
          addCandidate(item.name, item.role || '配角');
        }
      }
    }

    return Array.from(existingMap.values());
  }

  /**
   * 规范化八条故事线（字符串 -> 对象格式）
   */
  private normalizeStoryLines(storyLines: any): any {
    if (!storyLines) return undefined;

    // 如果已经是正确格式，直接返回
    if (storyLines.map?.planned !== undefined) {
      return storyLines;
    }

    // 字符串格式转换为对象格式
    const defaultStoryLines: any = {
      map: { planned: [], introduced: [], current: '', chaptersPerLocation: 50 },
      faction: { planned: [], introduced: [], currentLevel: 1, escalationChapters: [] },
      character: { planned: [], introduced: [], keyRelationships: [] },
      goldenfinger: { type: '', currentStage: 1, upgrades: [] },
      worldRules: { revealed: [], pending: [], nextReveal: undefined },
      conflict: { chains: [], activeConflict: '' },
      collection: { target: [], progress: [] },
      romance: { currentStage: 'cold', progression: [] },
    };

    // 辅助函数：分割字符串列表
    const parseListString = (str: string): string[] => {
      if (!str) return [];
      const normalized = str.replace(/→/g, '|||').replace(/->/g, '|||');
      return normalized.split(/[,，、|||]+/).map(s => s.trim()).filter(Boolean);
    };

    // 辅助函数：解析冲突链
    const parseConflictChains = (conflictStr: string): any[] => {
      if (!conflictStr) return [];
      const parts = parseListString(conflictStr);
      return parts.map((part, i) => {
        // 匹配 "名称（章节）" 格式
        const match = part.match(/^(.+?)[（(](.+?)[）)]$/);
        let name = part;
        let chapters: number[] = [];

        if (match) {
          name = match[1].trim();
          const desc = match[2].trim();
          const rangeMatch = desc.match(/^(\d+)-(\d+)$/);
          if (rangeMatch) {
            chapters = [parseInt(rangeMatch[1], 10)];
          } else {
            const num = parseInt(desc, 10);
            if (!isNaN(num)) chapters = [num];
          }
        }

        return {
          level: i + 1,
          name,
          description: name,
          chapters,
          status: 'pending' as const,
        };
      });
    };

    // 辅助函数：解析人物线
    const parseCharacterPlanned = (charStr: string): any[] => {
      if (!charStr) return [];
      const parts = parseListString(charStr);
      return parts.map(part => {
        const match = part.match(/^(.+?)[（(](.+?)[）)]$/);
        if (match) {
          const name = match[1].trim();
          const desc = match[2].trim();
          return { id: name, role: /^\d[\d-]*$/.test(desc) ? '' : desc };
        }
        return { id: part, role: '' };
      });
    };

    // 转换各字段
    if (typeof storyLines.map === 'string') {
      const parts = parseListString(storyLines.map);
      defaultStoryLines.map.planned = parts;
      defaultStoryLines.map.current = parts[0] || '';
    }
    if (typeof storyLines.faction === 'string') {
      defaultStoryLines.faction.planned = parseListString(storyLines.faction);
    }
    if (typeof storyLines.character === 'string') {
      defaultStoryLines.character.planned = parseCharacterPlanned(storyLines.character);
    }
    if (typeof storyLines.goldenfinger === 'string') {
      defaultStoryLines.goldenfinger.type = storyLines.goldenfinger || '';
    }
    if (typeof storyLines.worldRules === 'string') {
      defaultStoryLines.worldRules.revealed = parseListString(storyLines.worldRules);
    }
    if (typeof storyLines.conflict === 'string') {
      // 解析冲突链
      defaultStoryLines.conflict.chains = parseConflictChains(storyLines.conflict);
      // 设置当前活跃冲突为首个
      const chains = defaultStoryLines.conflict.chains;
      defaultStoryLines.conflict.activeConflict = chains.length > 0 ? chains[0].name : '';
    }
    if (typeof storyLines.collection === 'string') {
      defaultStoryLines.collection.target = parseListString(storyLines.collection);
    }
    if (typeof storyLines.romance === 'string') {
      defaultStoryLines.romance.currentStage = storyLines.romance || 'cold';
    }

    return defaultStoryLines;
  }

  /**
   * 规范化矛盾设计
   */
  private normalizeConflictDesign(conflictDesign: any): any {
    if (!conflictDesign) return undefined;

    const validSources = [
      '资源/利益',
      '阵营/种族',
      '超凡途径',
      '信仰/宗教',
      '派系之争',
      '理念/三观',
    ] as const;

    // 如果 source 不在有效值列表中，设置为默认值
    if (conflictDesign.source && !validSources.includes(conflictDesign.source)) {
      return {
        ...conflictDesign,
        source: '资源/利益',
      };
    }

    return conflictDesign;
  }

  /**
   * 规范化情绪目标
   */
  private normalizeEmotionGoal(emotionGoal: any): any {
    if (!emotionGoal) return undefined;

    const validArcs = ['rising', 'falling', 'wave', 'mixed', '上升', '下降', '波动', '混合'];
    const arcMap: Record<string, string> = {
      上升: 'rising',
      下降: 'falling',
      波动: 'wave',
      混合: 'mixed',
      rising: 'rising',
      falling: 'falling',
      wave: 'wave',
      mixed: 'mixed',
    };

    if (emotionGoal.arc) {
      const normalizedArc = arcMap[emotionGoal.arc] || emotionGoal.arc;
      if (!validArcs.includes(normalizedArc)) {
        return {
          ...emotionGoal,
          arc: 'rising',
        };
      }
      return {
        ...emotionGoal,
        arc: normalizedArc,
      };
    }

    return emotionGoal;
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
