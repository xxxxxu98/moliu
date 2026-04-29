/**
 * 拆文分析服务
 * 集成了 oh-story-claudecode skills 的拆文方法论
 * 
 * 核心信念：看懂别人的爆款，才能写出自己的爆款
 */

import { PromptBuilder } from './prompt-builder';

export type AnalysisMode = 'quick' | 'deep';
export type AnalysisFocus = 'golden3' | 'structure' | 'character' | 'plot' | 'all';

export interface TextAnalysisInput {
  /** 书名 */
  title: string;
  /** 原文内容 */
  content: string;
  /** 分析模式 */
  mode: AnalysisMode;
  /** 分析重点 */
  focus?: AnalysisFocus;
  /** 题材类型（用于辅助分析） */
  genre?: string;
}

export interface GoldenChapterAnalysis {
  chapterNumber: number;
  chapterTitle: string;
  /** 开篇钩子类型 */
  openingHook: string;
  /** 核心冲突 */
  coreConflict: string;
  /** 爽点设计 */
  highlightDesign: string[];
  /** 节奏特点 */
  pacingFeatures: string[];
  /** 值得学习的点 */
  learnings: string[];
}

export interface CharacterAnalysis {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  personalityTraits: string[];
  arcDescription: string;
  memorableMoments: string[];
  relationshipMap: { with: string; type: string; description: string }[];
}

export interface PlotStructureAnalysis {
  overallStructure: string;
  threeActBreakdown: {
    setup: { chapters: string; description: string };
    confrontation: { chapters: string; description: string };
    resolution: { chapters: string; description: string };
  };
  storyArcs: { title: string; chapters: string; summary: string }[];
  pacingMap: { position: string; intensity: string; chapterRange: string }[];
}

export interface TextAnalysisReport {
  basicInfo: {
    title: string;
    genre: string;
    estimatedChapters: number;
    estimatedWords: number;
  };
  goldenThreeChapters: GoldenChapterAnalysis[];
  characterArchitecture: CharacterAnalysis[];
  plotStructure: PlotStructureAnalysis;
  highlightDesign: {
    mainHighlights: { type: string; description: string; frequency: string }[];
    readerEmotions: string[];
  };
  writingTechniques: {
    openingTechniques: string[];
    dialogueTechniques: string[];
    descriptionTechniques: string[];
    tensionTechniques: string[];
  };
  keyLearnings: string[];
}

/**
 * 拆文分析服务类
 */
export class TextAnalysisService {
  /**
   * 执行文本分析
   */
  static async analyze(
    input: TextAnalysisInput,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<TextAnalysisReport> {
    const { title, content, mode, focus = 'all', genre = '都市' } = input;

    // 计算基本信息
    const charCount = content.length;
    const estimatedWords = Math.round(charCount / 2); // 估算字数
    const estimatedChapters = this.estimateChapters(content);

    // 构建分析 prompt
    let analysisPrompt: string;

    if (focus === 'golden3' || focus === 'all') {
      analysisPrompt = this.buildGoldenThreePrompt(title, content, genre);
      const goldenResult = await aiClient(analysisPrompt);
      // 解析黄金三章结果...
    }

    // 根据不同重点构建不同的分析 prompt
    switch (focus) {
      case 'golden3':
        return this.mergeWithGoldenThreeReport(
          await this.analyzeGoldenThree(title, content, genre, aiClient),
          { title, genre, estimatedChapters, estimatedWords }
        );
      
      case 'structure':
        return this.mergeWithStructureReport(
          await this.analyzeStructure(title, content, genre, aiClient),
          { title, genre, estimatedChapters, estimatedWords }
        );
      
      case 'character':
        return this.mergeWithCharacterReport(
          await this.analyzeCharacters(title, content, genre, aiClient),
          { title, genre, estimatedChapters, estimatedWords }
        );
      
      case 'plot':
        return this.mergeWithPlotReport(
          await this.analyzePlot(title, content, genre, aiClient),
          { title, genre, estimatedChapters, estimatedWords }
        );
      
      case 'all':
      default:
        return this.performFullAnalysis(input, aiClient);
    }
  }

  /**
   * 快速分析（黄金三章 + 整体结构）
   */
  private static async performFullAnalysis(
    input: TextAnalysisInput,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<TextAnalysisReport> {
    const { title, content, genre = '都市' } = input;
    const charCount = content.length;
    const estimatedWords = Math.round(charCount / 2);
    const estimatedChapters = this.estimateChapters(content);

    // 1. 分析黄金三章
    const goldenThreePrompt = this.buildGoldenThreePrompt(title, content, genre);
    const goldenThreeResult = await aiClient(goldenThreePrompt);
    const goldenThree = this.parseGoldenThreeAnalysis(goldenThreeResult);

    // 2. 分析人物架构
    const characterPrompt = this.buildCharacterAnalysisPrompt(title, content, genre);
    const characterResult = await aiClient(characterPrompt);
    const characters = this.parseCharacterAnalysis(characterResult);

    // 3. 分析整体结构
    const structurePrompt = this.buildStructurePrompt(title, content, genre);
    const structureResult = await aiClient(structurePrompt);
    const structure = this.parseStructureAnalysis(structureResult);

    // 4. 分析爽点设计
    const highlightPrompt = this.buildHighlightPrompt(title, content, genre);
    const highlightResult = await aiClient(highlightPrompt);
    const highlights = this.parseHighlightAnalysis(highlightResult);

    // 5. 分析写作技法
    const techniquePrompt = this.buildTechniquePrompt(title, content, genre);
    const techniqueResult = await aiClient(techniquePrompt);
    const techniques = this.parseTechniqueAnalysis(techniqueResult);

    return {
      basicInfo: {
        title,
        genre,
        estimatedChapters,
        estimatedWords,
      },
      goldenThreeChapters: goldenThree,
      characterArchitecture: characters,
      plotStructure: structure,
      highlightDesign: highlights,
      writingTechniques: techniques,
      keyLearnings: this.generateKeyLearnings(goldenThree, characters, structure, highlights, techniques),
    };
  }

  /**
   * 构建黄金三章分析 prompt
   */
  private static buildGoldenThreePrompt(title: string, content: string, genre: string): string {
    const excerptLength = 3000; // 取前3000字
    const excerpt = content.substring(0, excerptLength);

    return `# 黄金三章分析任务

## 书名
${title}

## 题材
${genre}

## 内容（前${excerptLength}字）
${excerpt}

## 分析要求
请按以下格式分析这本书的黄金三章（开头三章）：

### 第一章分析
1. **开篇钩子**：用什么方式吸引读者？（具体引用原文开头50字）
2. **核心冲突**：本章建立的主要矛盾是什么？
3. **爽点设计**：本章设计了哪些让读者"爽"的情节？
4. **节奏特点**：本章的叙事节奏有何特点？
5. **值得学习**：本章有哪些值得学习的写作技巧？

### 第二章分析
（同上格式，重点关注：如何推进主线、引出配角、埋设伏笔）

### 第三章分析
（同上格式，重点关注：如何展示金手指、明确目标、建立期待）

### 黄金三章共同特点
总结这三章的共同特点，找出这本书成功的核心要素。

## 输出格式
请用 Markdown 格式输出，包含上述所有分析项。`;
  }

  /**
   * 构建人物架构分析 prompt
   */
  private static buildCharacterAnalysisPrompt(title: string, content: string, genre: string): string {
    const excerptLength = 5000;
    const excerpt = content.substring(0, excerptLength);

    return `# 人物架构分析任务

## 书名
${title}

## 题材
${genre}

## 内容（前${excerptLength}字）
${excerpt}

## 分析要求
请分析这本书的人物架构：

### 主角分析
1. **人物设定**：主角的基本人设（年龄、身份、性格标签）
2. **核心欲望**：主角最想要什么？
3. **核心恐惧**：主角最害怕什么？
4. **金手指设定**：主角有什么特殊能力/优势？
5. **成长弧线**：主角是如何成长的？

### 重要配角分析
分析2-3个重要配角，包括：
- 角色定位（对手/朋友/导师等）
- 与主角的关系
- 独特记忆点

### 人物关系图
用文字描述人物之间的关系网络

### 人物设计亮点
总结这本书人物设计的亮点

## 输出格式
请用 Markdown 格式输出上述分析内容。`;
  }

  /**
   * 构建结构分析 prompt
   */
  private static buildStructurePrompt(title: string, content: string, genre: string): string {
    return `# 故事结构分析任务

## 书名
${title}

## 题材
${genre}

## 分析要求
请分析这本书的整体结构：

### 三幕结构
1. **第一幕（建置）**：故事如何建立？主要冲突何时出现？
2. **第二幕（对抗）**：核心冲突如何升级？有哪些关键转折点？
3. **第三幕（解决）**：冲突如何解决？结局是否令人满意？

### 故事线分析
识别书中的主要故事线（主线、副线、感情线等）

### 节奏地图
绘制这本书的节奏起伏，用文字描述：
- 高潮点位置（大约在百分之几）
- 低谷点位置
- 节奏变化规律

### 伏笔设计
分析书中伏笔的埋设和回收技巧

## 输出格式
请用 Markdown 格式输出上述分析内容。`;
  }

  /**
   * 构建爽点分析 prompt
   */
  private static buildHighlightPrompt(title: string, content: string, genre: string): string {
    const excerptLength = 8000;
    const excerpt = content.substring(0, excerptLength);

    return `# 爽点设计分析任务

## 书名
${title}

## 题材
${genre}

## 内容（前${excerptLength}字）
${excerpt}

## 分析要求
请分析这本书的爽点设计：

### 爽点类型统计
统计书中出现的爽点类型及其频率：
- 打脸爽点（装逼打脸）
- 逆袭爽点（以弱胜强）
- 收获爽点（获得宝物/能力/地位）
- 情感爽点（爱情/友情/师徒情）
- 其他类型

### 爽点密度
分析每个爽点之间的间隔（平均多少字一个爽点）

### 情绪引导
分析作者是如何引导读者情绪的：
- 如何制造期待感
- 如何释放爽感
- 如何维持读者兴趣

### 爽点设计创新
这本书在爽点设计上有什么创新之处？

## 输出格式
请用 Markdown 格式输出上述分析内容。`;
  }

  /**
   * 构建写作技法分析 prompt
   */
  private static buildTechniquePrompt(title: string, content: string, genre: string): string {
    const excerptLength = 5000;
    const excerpt = content.substring(0, excerptLength);

    return `# 写作技法分析任务

## 书名
${title}

## 题材
${genre}

## 内容（前${excerptLength}字）
${excerpt}

## 分析要求
请分析这本书的写作技法：

### 开篇技法
1. 如何在开头吸引读者？
2. 世界观如何介绍？
3. 主角如何登场？

### 对话技法
1. 对话风格有何特点？
2. 如何通过对话展现角色性格？
3. 对话的信息传递效率如何？

### 描写技法
1. 环境描写有何特点？
2. 心理描写如何处理？
3. 动作描写有何亮点？

### 悬念技法
1. 如何设置悬念？
2. 如何保持读者好奇心？
3. 章节结尾如何设计钩子？

### 节奏控制
1. 叙事节奏有何特点？
2. 长短句搭配如何？
3. 场景切换如何处理？

## 输出格式
请用 Markdown 格式输出上述分析内容。`;
  }

  /**
   * 分析黄金三章
   */
  private static async analyzeGoldenThree(
    title: string,
    content: string,
    genre: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<GoldenChapterAnalysis[]> {
    const prompt = this.buildGoldenThreePrompt(title, content, genre);
    const result = await aiClient(prompt);
    return this.parseGoldenThreeAnalysis(result);
  }

  /**
   * 分析人物架构
   */
  private static async analyzeCharacters(
    title: string,
    content: string,
    genre: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<CharacterAnalysis[]> {
    const prompt = this.buildCharacterAnalysisPrompt(title, content, genre);
    const result = await aiClient(prompt);
    return this.parseCharacterAnalysis(result);
  }

  /**
   * 分析整体结构
   */
  private static async analyzeStructure(
    title: string,
    content: string,
    genre: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<PlotStructureAnalysis> {
    const prompt = this.buildStructurePrompt(title, content, genre);
    const result = await aiClient(prompt);
    return this.parseStructureAnalysis(result);
  }

  /**
   * 分析情节设计
   */
  private static async analyzePlot(
    title: string,
    content: string,
    genre: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<PlotStructureAnalysis> {
    const prompt = this.buildStructurePrompt(title, content, genre);
    const result = await aiClient(prompt);
    return this.parseStructureAnalysis(result);
  }

  /**
   * 估算章节数
   */
  private static estimateChapters(content: string): number {
    // 简单估算：假设每章2000-3000字
    const avgWordsPerChapter = 2500;
    const estimatedWords = content.length / 2;
    return Math.max(1, Math.round(estimatedWords / avgWordsPerChapter));
  }

  /**
   * 解析黄金三章分析结果
   */
  private static parseGoldenThreeAnalysis(result: string): GoldenChapterAnalysis[] {
    const chapters: GoldenChapterAnalysis[] = [];
    
    // 简单解析，实际应该更严谨
    const chapterMatches = result.split(/(?=### 第[一二三]章)/g);
    
    for (let i = 0; i < 3 && i < chapterMatches.length; i++) {
      const chapter = chapterMatches[i];
      chapters.push({
        chapterNumber: i + 1,
        chapterTitle: this.extractTitle(chapter) || `第${i + 1}章`,
        openingHook: this.extractSection(chapter, '开篇钩子') || '未识别',
        coreConflict: this.extractSection(chapter, '核心冲突') || '未识别',
        highlightDesign: this.extractList(chapter, '爽点设计'),
        pacingFeatures: this.extractList(chapter, '节奏特点'),
        learnings: this.extractList(chapter, '值得学习'),
      });
    }

    return chapters;
  }

  /**
   * 解析人物分析结果
   */
  private static parseCharacterAnalysis(result: string): CharacterAnalysis[] {
    const characters: CharacterAnalysis[] = [];
    
    // 简单解析
    const protagonistMatch = result.match(/主角[^\n]*\n([\s\S]*?)(?=配角|重要配角|$)/i);
    if (protagonistMatch) {
      characters.push({
        name: '主角',
        role: 'protagonist',
        personalityTraits: this.extractList(protagonistMatch[1], '性格'),
        arcDescription: this.extractSection(protagonistMatch[1], '成长') || '',
        memorableMoments: [],
        relationshipMap: [],
      });
    }

    return characters;
  }

  /**
   * 解析结构分析结果
   */
  private static parseStructureAnalysis(result: string): PlotStructureAnalysis {
    return {
      overallStructure: this.extractSection(result, '三幕结构') || '未识别',
      threeActBreakdown: {
        setup: {
          chapters: this.extractSection(result, '第一幕') || '',
          description: '',
        },
        confrontation: {
          chapters: this.extractSection(result, '第二幕') || '',
          description: '',
        },
        resolution: {
          chapters: this.extractSection(result, '第三幕') || '',
          description: '',
        },
      },
      storyArcs: [],
      pacingMap: [],
    };
  }

  /**
   * 解析爽点分析结果
   */
  private static parseHighlightAnalysis(result: string): TextAnalysisReport['highlightDesign'] {
    return {
      mainHighlights: this.extractList(result, '爽点类型').map(h => ({
        type: h,
        description: h,
        frequency: '待统计',
      })),
      readerEmotions: this.extractList(result, '情绪引导'),
    };
  }

  /**
   * 解析写作技法分析结果
   */
  private static parseTechniqueAnalysis(result: string): TextAnalysisReport['writingTechniques'] {
    return {
      openingTechniques: this.extractList(result, '开篇'),
      dialogueTechniques: this.extractList(result, '对话'),
      descriptionTechniques: this.extractList(result, '描写'),
      tensionTechniques: this.extractList(result, '悬念'),
    };
  }

  /**
   * 提取标题
   */
  private static extractTitle(text: string): string {
    const match = text.match(/第[一二三]章[：:]\s*(.+)/);
    return match ? match[1].trim() : '';
  }

  /**
   * 提取特定章节内容
   */
  private static extractSection(text: string, sectionName: string): string {
    const regex = new RegExp(`${sectionName}[：:]*\\s*([^\\n#]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * 提取列表项
   */
  private static extractList(text: string, sectionName: string): string[] {
    const items: string[] = [];
    const sectionMatch = text.match(new RegExp(`${sectionName}[：:]*[\\s\\S]*?(?=#{1,3} |$)`, 'i'));
    if (sectionMatch) {
      const listMatches = sectionMatch[0].match(/[-*•]\s*(.+)/g);
      if (listMatches) {
        listMatches.forEach(item => {
          const cleaned = item.replace(/^[-*•]\s*/, '').trim();
          if (cleaned) items.push(cleaned);
        });
      }
    }
    return items;
  }

  /**
   * 生成关键学习点
   */
  private static generateKeyLearnings(
    goldenThree: GoldenChapterAnalysis[],
    characters: CharacterAnalysis[],
    structure: PlotStructureAnalysis,
    highlights: TextAnalysisReport['highlightDesign'],
    techniques: TextAnalysisReport['writingTechniques']
  ): string[] {
    const learnings: string[] = [];

    // 从黄金三章提取
    goldenThree.forEach((ch, i) => {
      if (ch.learnings.length > 0) {
        learnings.push(`第${i + 1}章：${ch.learnings[0]}`);
      }
    });

    // 从人物架构提取
    characters.slice(0, 2).forEach(char => {
      if (char.arcDescription) {
        learnings.push(`人物"${char.name}"的设计亮点：${char.arcDescription.substring(0, 50)}...`);
      }
    });

    // 从写作技法提取
    if (techniques.openingTechniques.length > 0) {
      learnings.push(`开篇技法：${techniques.openingTechniques[0]}`);
    }
    if (techniques.tensionTechniques.length > 0) {
      learnings.push(`悬念技法：${techniques.tensionTechniques[0]}`);
    }

    // 从爽点设计提取
    if (highlights.mainHighlights.length > 0) {
      learnings.push(`爽点设计：${highlights.mainHighlights[0].type}（${highlights.mainHighlights[0].frequency}）`);
    }

    return learnings.slice(0, 10); // 最多10条
  }

  /**
   * 合并黄金三章报告
   */
  private static mergeWithGoldenThreeReport(
    goldenThree: GoldenChapterAnalysis[],
    basicInfo: TextAnalysisReport['basicInfo']
  ): TextAnalysisReport {
    return {
      basicInfo,
      goldenThreeChapters: goldenThree,
      characterArchitecture: [],
      plotStructure: {
        overallStructure: '',
        threeActBreakdown: { setup: { chapters: '', description: '' }, confrontation: { chapters: '', description: '' }, resolution: { chapters: '', description: '' } },
        storyArcs: [],
        pacingMap: [],
      },
      highlightDesign: { mainHighlights: [], readerEmotions: [] },
      writingTechniques: { openingTechniques: [], dialogueTechniques: [], descriptionTechniques: [], tensionTechniques: [] },
      keyLearnings: goldenThree.flatMap(ch => ch.learnings),
    };
  }

  /**
   * 合并结构报告
   */
  private static mergeWithStructureReport(
    structure: PlotStructureAnalysis,
    basicInfo: TextAnalysisReport['basicInfo']
  ): TextAnalysisReport {
    return {
      basicInfo,
      goldenThreeChapters: [],
      characterArchitecture: [],
      plotStructure: structure,
      highlightDesign: { mainHighlights: [], readerEmotions: [] },
      writingTechniques: { openingTechniques: [], dialogueTechniques: [], descriptionTechniques: [], tensionTechniques: [] },
      keyLearnings: [],
    };
  }

  /**
   * 合并人物报告
   */
  private static mergeWithCharacterReport(
    characters: CharacterAnalysis[],
    basicInfo: TextAnalysisReport['basicInfo']
  ): TextAnalysisReport {
    return {
      basicInfo,
      goldenThreeChapters: [],
      characterArchitecture: characters,
      plotStructure: {
        overallStructure: '',
        threeActBreakdown: { setup: { chapters: '', description: '' }, confrontation: { chapters: '', description: '' }, resolution: { chapters: '', description: '' } },
        storyArcs: [],
        pacingMap: [],
      },
      highlightDesign: { mainHighlights: [], readerEmotions: [] },
      writingTechniques: { openingTechniques: [], dialogueTechniques: [], descriptionTechniques: [], tensionTechniques: [] },
      keyLearnings: [],
    };
  }

  /**
   * 合并情节报告
   */
  private static mergeWithPlotReport(
    plot: PlotStructureAnalysis,
    basicInfo: TextAnalysisReport['basicInfo']
  ): TextAnalysisReport {
    return {
      basicInfo,
      goldenThreeChapters: [],
      characterArchitecture: [],
      plotStructure: plot,
      highlightDesign: { mainHighlights: [], readerEmotions: [] },
      writingTechniques: { openingTechniques: [], dialogueTechniques: [], descriptionTechniques: [], tensionTechniques: [] },
      keyLearnings: [],
    };
  }
}

export default TextAnalysisService;
