import type { Project, Character, Foreshadow } from '@/types/project';
import { useSettingsStore } from '@/stores/settings.store';

/**
 * 项目上下文信息，用于构建 AI 提示词
 */
export interface ProjectContext {
  /** 当前项目 */
  project: Project;
  /** 当前章节 ID */
  currentChapterId: string;
  /** 当前章节内容 */
  currentChapterContent: string;
  /** 当前章节前后的章节内容摘要 */
  adjacentChaptersSummary?: {
    previousChapterTitle?: string;
    previousChapterSummary?: string;
    nextChapterTitle?: string;
    nextChapterSummary?: string;
  };
  /** 当前场景中出现的角色列表 */
  charactersInScene?: Character[];
  /** 当前章节的伏笔 */
  relatedForeshadows?: Foreshadow[];
  /** 用户的自定义提示词 */
  customPrompt?: string;
}

/**
 * AI 建议类型
 */
export interface AISuggestion {
  id: string;
  type: 'characterConsistency' | 'foreshadowReminder' | 'foreshadowManagement' | 'paceSuggestion' | 'logicGap' | 'logicConsistency' | 'styleConsistency' | 'dialogueQuality' | 'descriptionDensity' | 'emotionCurve';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  position?: {
    startLine: number;
    endLine: number;
  };
  suggestion?: string;
}

/**
 * AI 续写/润色结果
 */
export interface AIWriteResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  reasoning?: string;
}

/**
 * 提示词构建工具
 */
export class PromptBuilder {
  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(language: string = 'zh-CN'): string {
    const languageMap: Record<string, string> = {
      'zh-CN': '中文',
      'en-US': '英文',
    };
    const lang = languageMap[language] || '中文';

    return `你是一位专业的${lang}小说作家，拥有丰富的创作经验。你的任务是帮助用户续写和润色小说内容。

## 创作原则
1. **文风一致**：保持与原文一致的文风、语气和叙事节奏，包括句式长短、修辞偏好
2. **角色真实**：深入理解人物性格，确保人物行为、语言、决策符合角色设定
3. **逻辑自洽**：注重情节的合理性和逻辑性，避免前后矛盾
4. **细节生动**：善用细节描写来增强画面感，让场景栩栩如生
5. **创新表达**：避免使用重复的表达和俗套的桥段，追求新颖的叙述方式
6. **悬念自然**：伏笔和悬念的处理要自然，不要过于刻意或明显
7. **情感共鸣**：注重情感描写，让读者能够与角色产生共鸣

## 续写要求
1. 仔细阅读用户提供的上下文，理解当前情节走向和写作风格
2. 续写内容要与前文自然衔接，从内容结尾处继续，不可重复已写内容
3. 篇幅控制在 300-500 字为宜，避免过长或过短
4. 可以添加适当的环境描写、人物对话和心理活动，丰富故事层次
5. 结尾要有吸引力，设置悬念或自然过渡，为下一段情节做好铺垫
6. 合理运用叙述、描写、对话等手法，保持文本的可读性

## 润色要求
1. 改善句子的流畅度和可读性，使文章更加通顺自然
2. 消除语法错误、错别字和表达不当之处
3. 丰富修辞手法，增强文字感染力和表现力
4. 优化段落结构，增强节奏感和阅读体验
5. 保持原文的风格和意图，不可改变核心内容
6. 如有小标题，保持原样不动

## 禁止事项
1. 不要生成任何可能导致版权问题的内容
2. 不要添加任何色情、暴力、歧视等不当内容
3. 不要在输出中添加任何解释、说明或标记
4. 不要超出用户指定的内容范围进行创作

## 输出格式
请直接输出续写/润色后的内容，不要添加任何前缀说明（如"以下是续写内容："、"润色结果如下："等）。
只输出纯文本内容，不要使用 markdown 格式。`;
  }

  /**
   * 构建续写提示词
   */
  static buildContinuePrompt(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish'
  ): { systemPrompt: string; userPrompt: string } {
    const { project, currentChapterContent, customPrompt, adjacentChaptersSummary } = context;

    // 构建角色信息
    const charactersInfo = this.buildCharactersInfo(project.characters);

    // 构建世界观信息
    const worldInfo = this.buildWorldInfo(project.worldSchema);

    // 构建伏笔信息
    const foreshadowInfo = this.buildForeshadowInfo(project.foreshadows);

    // 构建上下文摘要
    let contextSummary = '';
    if (adjacentChaptersSummary) {
      if (adjacentChaptersSummary.previousChapterTitle && adjacentChaptersSummary.previousChapterSummary) {
        contextSummary += `## 前章回顾\n上一章「${adjacentChaptersSummary.previousChapterTitle}」：\n${adjacentChaptersSummary.previousChapterSummary}\n\n`;
      }
      if (adjacentChaptersSummary.nextChapterTitle && adjacentChaptersSummary.nextChapterSummary) {
        contextSummary += `## 下章预告\n下一章「${adjacentChaptersSummary.nextChapterTitle}」：\n${adjacentChaptersSummary.nextChapterSummary}\n\n`;
      }
    }

    // 构建续写/润色指令
    let modeInstruction: string;
    if (mode === 'smartContinue') {
      modeInstruction = `请续写以下故事内容。注意以下要点：

### 衔接要求
1. **从结尾继续**：仔细阅读原文结尾，从那里自然衔接续写，不要重复已写内容
2. **风格匹配**：保持与前文一致的文风、语气和叙事节奏
3. **角色一致**：确保角色的语言风格、行为方式与设定一致

### 内容要求
1. **篇幅控制**：续写内容控制在 300-500 字左右
2. **元素丰富**：可以包含对话、动作、心理描写、环境描写等多种元素
3. **节奏把控**：合理安排情节发展，不要过于平淡或突兀

### 结尾要求
1. 设置适当的悬念或转折，吸引读者继续阅读
2. 自然过渡，为下一段情节做好铺垫
3. 避免戛然而止或草率收尾`;
    } else {
      modeInstruction = `请润色优化以下内容。注意以下要点：

### 润色要求
1. **保持原意**：不改变原文的核心内容、情节走向和情感基调
2. **改善流畅度**：改善句子的流畅度和可读性
3. **提升文笔**：丰富修辞手法，增强文字感染力

### 修改范围
1. 修正错别字、语病和标点错误
2. 优化用词，使表达更加精准生动
3. 调整句子结构，增强节奏感
4. 如有重复表达，进行修改
5. **不要修改或添加小标题**

### 输出要求
直接输出润色后的完整内容，不要添加任何说明。`;
    }

    // 构建字数控制说明
    const wordCountInstruction = mode === 'smartContinue'
      ? '\n\n### 篇幅参考\n- 续写：300-500 字'
      : '\n\n### 篇幅参考\n- 润色：保持与原文相近的长度';

    let userPrompt = `# 当前作品信息
作品名称：${project.name}
作品简介：${project.description || '暂无'}
类型标签：${project.genre.map(g => g.name).join('、')}`

    if (contextSummary) {
      userPrompt += `\n\n${contextSummary}`;
    }

    userPrompt += `# 作品世界观设定
${worldInfo}

# 角色设定
${charactersInfo}

# 伏笔设定
${foreshadowInfo}

# 待续写/润色的内容
${currentChapterContent || '(当前章节为空)'}`;

    if (customPrompt) {
      userPrompt += `\n\n# 用户补充要求
${customPrompt}`;
    }

    userPrompt += `\n\n# 任务要求
${modeInstruction}${wordCountInstruction}`;

    return {
      systemPrompt: this.buildSystemPrompt(getContentLanguage()),
      userPrompt,
    };
  }

  /**
   * 构建分析章节的提示词
   */
  static buildAnalysisPrompt(context: ProjectContext): { systemPrompt: string; userPrompt: string } {
    const { project, currentChapterContent, relatedForeshadows } = context;

    const systemPrompt = `你是一位专业的小说编辑，擅长分析文本中的问题并提供改进建议。

## 分析原则
1. **客观公正**：以专业的编辑视角审视文本，不要受限于作者意图
2. **重点突出**：优先指出最影响阅读体验的问题
3. **可操作性**：每条建议都应具有可执行的修改方向
4. **适度建议**：最多返回 5 条最重要的建议，避免信息过载

## 分析维度（按重要性排序）
1. **人物一致性**：检查角色行为、语言风格、决策是否符合其性格设定
2. **伏笔管理**：检查已埋设的伏笔是否有暗示或可以推进
3. **逻辑自洽**：检查情节是否有前后矛盾、不合理之处
4. **节奏把控**：分析情节推进是否合理，高潮是否足够有力
5. **对话质量**：检查对话是否自然、符合角色性格、推进情节
6. **描写密度**：检查是否有过渡描写不足或堆砌描写
7. **情感曲线**：检查情感铺垫是否到位，高潮是否感人

## 严重程度定义
- **error（严重）**：明显影响阅读体验的问题，如逻辑矛盾、角色行为严重不符
- **warning（警告）**：需要改进但不影响理解的问题，如节奏拖沓、表达不清
- **info（提示）**：锦上添花的建议，如文笔提升、细节优化

## 输出要求
1. 严格按照 JSON 格式输出，不要包含 markdown 代码块
2. 如果没有发现问题，返回空的 suggestions 数组：{"suggestions": []}
3. 确保 JSON 格式正确，可以被解析`;

    const userPrompt = `作品名称：${project.name}
作品简介：${project.description || '暂无'}
作品类型：${project.genre.map(g => g.name).join('、')}

角色设定：
${this.buildCharactersInfo(project.characters)}

当前章节内容：
${currentChapterContent || '(当前章节为空)'}`;

    const foreshadowSection = relatedForeshadows && relatedForeshadows.length > 0
      ? `\n\n相关伏笔：\n${relatedForeshadows.map(f => `- ${f.hint}`).join('\n')}`
      : '';

    return {
      systemPrompt,
      userPrompt: userPrompt + foreshadowSection + '\n\n请分析以上内容，返回 JSON 格式的建议：\n{\n  "suggestions": [\n    {\n      "type": "人物一致性" | "伏笔管理" | "逻辑自洽" | "节奏把控" | "对话质量" | "描写密度" | "情感曲线",\n      "severity": "info" | "warning" | "error",\n      "title": "简洁的标题（不超过20字）",\n      "description": "问题描述：具体说明问题所在",\n      "suggestion": "修改建议：如何改进（可选）"\n    }\n  ]\n}',
    };
  }

  /**
   * 构建记忆上下文提取的提示词
   */
  static buildMemoryContextPrompt(context: ProjectContext): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的叙事分析师，擅长从文本中提取关键场景信息。

## 提取维度
1. **出场角色**：从文本中明确出现或被明确提及的角色（排除只在对话中被提到的）
2. **地点**：场景发生的具体位置（优先提取明确的地点名词）
3. **时间**：场景发生的时间（白天/夜晚/季节/具体时间等）
4. **氛围**：场景的整体情绪基调（如：紧张、温馨、悲伤、悬疑等）

## 识别技巧
- **对话**：对话内容可以推断出角色关系和情绪
- **动作**：角色动作可以反映心理状态
- **环境描写**：环境描写可以推断出地点和氛围
- **时间词**：注意时间副词和季节描写

## 输出要求
1. 严格按照 JSON 格式输出，不要包含 markdown 代码块
2. charactersInScene 返回角色名数组，精确匹配作品中的角色名
3. location、time、mood 返回描述性字符串，不要返回空字符串
4. 如果无法确定某项，返回"未明确"
5. 不要添加任何解释说明`;

    const userPrompt = `可用角色列表（请精确匹配角色名）：
${context.project.characters.map(c => {
  const info = [`${c.name}`];
  if (c.profile.personality && c.profile.personality.length > 0) {
    info.push(`性格：${c.profile.personality.join('、')}`);
  }
  if (c.profile.background) {
    info.push(`背景：${c.profile.background}`);
  }
  return `- ${info.join(' | ')}`;
}).join('\n')}

当前章节内容：
${context.currentChapterContent || '(当前章节为空)'}

请提取场景信息，严格按照以下 JSON 格式输出（不要包含 markdown 代码块）：
{
  "charactersInScene": ["角色名1", "角色名2"],
  "location": "地点描述",
  "time": "时间描述",
  "mood": "氛围描述"
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建润色专用提示词
   * 专注于文本的修饰和优化，与续写分开
   */
  static buildPolishPrompt(
    context: ProjectContext,
    selectedText?: string
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的中文小说润色编辑，精通各种文风和修辞手法。

## 润色原则
1. **保持原意** - 不改变原文的核心内容、情节走向和情感
2. **提升质量** - 改善表达方式，增强文字感染力
3. **风格统一** - 保持与整体作品的文风统一
4. **适度调整** - 不要过度修改，保持作者的个人风格

## 润色范围
1. **语言层面**：
   - 修正错别字、语病和标点错误
   - 改善句子流畅度和可读性
   - 优化用词，使表达更加精准生动
   
2. **修辞层面**：
   - 丰富修辞手法（比喻、拟人、排比等）
   - 增强文字的画面感和感染力
   
3. **结构层面**：
   - 优化段落结构，增强节奏感
   - 调整句子长短，创造阅读节奏

## 禁止事项
1. 不要添加或删除关键信息
2. 不要修改小标题（如有）
3. 不要改变原文的叙事视角
4. 不要添加任何说明或标记
5. 不要输出 markdown 格式

## 输出要求
直接输出润色后的完整内容，不要添加任何说明。`;

    const userPrompt = `作品信息：
- 名称：${context.project.name}
- 类型：${context.project.genre.map(g => g.name).join('、')}
- 简介：${context.project.description || '暂无'}

待润色内容：
${selectedText || context.currentChapterContent}

请润色以上内容，直接输出结果。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建对话生成提示词
   * 用于生成符合角色性格的对话内容
   */
  static buildDialoguePrompt(
    context: ProjectContext,
    options: {
      speaker?: string;
      situation?: string;
      emotion?: string;
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { speaker, situation, emotion } = options;

    const systemPrompt = `你是一位专业的小说对话写作专家，擅长创作符合角色性格的精彩对白。

## 对话原则
1. **性格一致** - 每句台词都要符合说话者的性格、身份和受教育程度
2. **信息传递** - 对话要传递必要的信息，推动情节发展
3. **潜台词** - 好的对话有言外之意，暗示人物心理和关系
4. **自然流畅** - 对话要像真实的人说话，避免过于书面化
5. **简洁有力** - 避免冗长废话，每句都要有意义

## 对话技巧
- 口语化表达，使用日常用语
- 适当的停顿和省略
- 通过对话展现角色性格
- 避免对话过于直白

## 输出格式
直接输出对话内容，格式如下：
角色A：台词内容
角色B：台词内容
（动作描写）

不要添加任何说明，不要使用 markdown 格式。`;

    const charactersInfo = context.project.characters
      .slice(0, 8)
      .map(c => {
        let info = `【${c.name}】`;
        if (c.profile.personality && c.profile.personality.length > 0) {
          info += `性格：${c.profile.personality.join('、')}`;
        }
        if (c.profile.background) {
          info += ` | 背景：${c.profile.background}`;
        }
        return info;
      })
      .join('\n');

    let userPrompt = `可用角色：
${charactersInfo}`;

    if (speaker) {
      userPrompt += `\n\n主要发言角色：${speaker}`;
    }

    if (situation) {
      userPrompt += `\n\n当前情境：${situation}`;
    }

    if (emotion) {
      userPrompt += `\n\n期望情绪：${emotion}`;
    }

    userPrompt += `\n\n请创作符合以上情境的对话。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建情节发展提示词
   * 用于生成情节大纲或发展建议
   */
  static buildPlotPrompt(
    context: ProjectContext,
    options: {
      plotPoint?: string;
      targetChapter?: string;
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { plotPoint, targetChapter } = options;

    const systemPrompt = `你是一位专业的小说情节设计师，擅长设计扣人心弦的故事发展。

## 情节设计原则
1. **冲突驱动** - 每个情节点都要有明确的冲突或悬念
2. **悬念保持** - 在解决旧问题的同时引出新问题
3. **角色成长** - 情节要推动角色成长或展现角色特质
4. **伏笔呼应** - 可以适当呼应之前埋下的伏笔
5. **节奏变化** - 张弛有度，不要一直紧张或平淡

## 情节结构建议
- **开端**：建立背景，引入冲突
- **发展**：层层递进，增加阻碍
- **高潮**：矛盾激化，爆发点
- **结局**：解决冲突，留下回味

## 输出格式
请提供：
1. 情节发展方向建议
2. 关键情节点设计
3. 可能的转折点
4. 角色反应预设

使用清晰的列表格式，便于阅读和参考。`;

    const foreshadowSection = context.project.foreshadows && context.project.foreshadows.length > 0
      ? `\n\n## 未解决的伏笔
${context.project.foreshadows
  .filter(f => f.status !== 'resolved')
  .slice(0, 5)
  .map(f => `- ${f.hint}`)
  .join('\n')}`
      : '';

    let userPrompt = `## 当前作品
- 名称：${context.project.name}
- 类型：${context.project.genre.map(g => g.name).join('、')}
- 简介：${context.project.description || '暂无'}

## 角色设定
${this.buildCharactersInfo(context.project.characters)}${foreshadowSection}`;

    if (plotPoint) {
      userPrompt += `\n\n## 当前情节
${plotPoint}`;
    }

    if (targetChapter) {
      userPrompt += `\n\n## 目标章节
${targetChapter}`;
    }

    userPrompt += `\n\n请设计接下来 2-3 个情节点的发展。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建场景描写提示词
   * 用于生成环境描写或氛围渲染
   */
  static buildScenePrompt(
    context: ProjectContext,
    options: {
      location?: string;
      time?: string;
      mood?: string;
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { location, time, mood } = options;

    const systemPrompt = `你是一位专业的小说环境描写专家，擅长营造场景氛围。

## 描写原则
1. **感官多样** - 调动视觉、听觉、嗅觉、触觉等多种感官
2. **氛围统一** - 景物描写要与整体情绪基调一致
3. **细节选择** - 选择有代表性的细节，避免堆砌
4. **动静结合** - 动静态描写交替使用
5. **情感投射** - 通过景物反映人物心理

## 描写技巧
- 使用具体而生动的形容词
- 运用比喻、拟人等修辞手法
- 注意光影、色彩的变化
- 融入文化或地域特色

## 输出要求
1. 描写篇幅控制在 100-200 字
2. 直接输出描写内容，不要添加说明
3. 不要使用 markdown 格式`;

    const worldInfo = this.buildWorldInfo(context.project.worldSchema);

    let userPrompt = `## 世界观设定
${worldInfo}`;

    if (location) {
      userPrompt += `\n\n指定地点：${location}`;
    }

    if (time) {
      userPrompt += `\n\n指定时间：${time}`;
    }

    if (mood) {
      userPrompt += `\n\n期望氛围：${mood}`;
    }

    userPrompt += `\n\n请根据以上设定，创作一段场景描写。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建角色描写提示词
   * 用于生成人物外貌、动作、心理描写
   */
  static buildCharacterDescriptionPrompt(
    context: ProjectContext,
    options: {
      characterName?: string;
      descriptionType?: 'appearance' | 'action' | 'psychology' | 'dialogue';
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { characterName, descriptionType = 'appearance' } = options;

    const systemPrompt = `你是一位专业的小说人物描写专家，擅长塑造立体的人物形象。

## 描写原则
1. **特点鲜明** - 突出人物的独特之处，避免千篇一律
2. **性格一致** - 描写方式要符合人物性格
3. **生动具体** - 使用具体细节，而非抽象描述
4. **视角得当** - 明确叙事视角，合理选择描写角度

## 描写类型
- **外貌描写**：突出特点，注意整体印象
- **动作描写**：细节动作，展现性格特征
- **心理描写**：内心活动，揭示深层动机
- **对话描写**：符合性格，展现人际互动

## 输出要求
1. 描写篇幅控制在 50-150 字
2. 直接输出描写内容，不要添加说明
3. 不要使用 markdown 格式`;

    const targetCharacter = characterName
      ? context.project.characters.find(c => c.name === characterName)
      : null;

    let userPrompt = `## 目标角色`;

    if (targetCharacter) {
      userPrompt += `
- 名称：${targetCharacter.name}
- 性格：${targetCharacter.profile.personality?.join('、') || '暂无'}
- 背景：${targetCharacter.profile.background || '暂无'}
- 外貌：${targetCharacter.profile.appearance || '暂无'}`;
    } else {
      userPrompt += `：${characterName || '请根据上下文选择合适的角色'}`;
    }

    userPrompt += `\n\n## 描写类型
${descriptionType === 'appearance' ? '外貌描写' :
      descriptionType === 'action' ? '动作描写' :
      descriptionType === 'psychology' ? '心理描写' : '对话描写'}

请创作一段描写。`;

    return { systemPrompt, userPrompt };
  }

  private static buildCharactersInfo(characters: Character[]): string {
    if (!characters || characters.length === 0) {
      return '（暂无角色设定）';
    }

    return characters
      .slice(0, 10) // 限制角色数量
      .map(c => {
        let info = `【${c.name}】`;
        if (c.profile.personality && c.profile.personality.length > 0) {
          info += `性格特点：${c.profile.personality.join('、')}`;
        }
        if (c.profile.background) {
          info += ` | 背景：${c.profile.background}`;
        }
        if (c.profile.appearance) {
          info += ` | 外貌：${c.profile.appearance}`;
        }
        return info;
      })
      .join('\n');
  }

  private static buildWorldInfo(worldSchema: Project['worldSchema']): string {
    if (!worldSchema) {
      return '（暂无世界观设定）';
    }

    let info = '';

    if (worldSchema.locations && worldSchema.locations.length > 0) {
      info += '## 地点\n';
      info += worldSchema.locations
        .slice(0, 5)
        .map(l => `- ${l.name}：${l.description || '暂无描述'}`)
        .join('\n');
      info += '\n';
    }

    if (worldSchema.rules && worldSchema.rules.length > 0) {
      info += '## 世界规则\n';
      info += worldSchema.rules
        .filter(r => !r.locked)
        .slice(0, 5)
        .map(r => `- ${r.name}：${r.description}`)
        .join('\n');
      info += '\n';
    }

    if (worldSchema.factions && worldSchema.factions.length > 0) {
      info += '## 势力\n';
      info += worldSchema.factions
        .slice(0, 5)
        .map(f => `- ${f.name}：${f.description || '暂无描述'}`)
        .join('\n');
      info += '\n';
    }

    return info || '（暂无详细世界观设定）';
  }

  private static buildForeshadowInfo(foreshadows: Foreshadow[]): string {
    if (!foreshadows || foreshadows.length === 0) {
      return '（暂无伏笔设定）';
    }

    return foreshadows
      .filter(f => f.status !== 'resolved')
      .slice(0, 10)
      .map(f => {
        const statusMap: Record<string, string> = {
          buried: '已埋设',
          hinted: '已暗示',
          foreshadowed: '已铺垫',
        };
        return `- ${f.hint}（${statusMap[f.status] || f.status}）`;
      })
      .join('\n');
  }
}

/**
 * 获取内容语言设置
 */
export function getContentLanguage(): string {
  try {
    // 在客户端代码中动态获取 settings store
    const settingsStore = useSettingsStore();
    return settingsStore.contentLanguage || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export type { AIWriteMode } from './types';
