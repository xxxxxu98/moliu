/**
 * Prompt 构建器
 * 负责构建各种写作场景的 Prompt
 */

import type { 
  ChapterWritingContext, 
  WritingStyle,
  WritingConfig 
} from '@/types/writing';
import type { Character } from '@/types/project';
import type { WorldSchema } from '@/types/project';

/**
 * Token 估算（中文约 1 token ≈ 1-2 字符，英文约 1 token ≈ 0.75 词）
 */
const CHINESE_CHARS_PER_TOKEN = 1.5;
const ENGLISH_WORDS_PER_TOKEN = 0.75;

/**
 * 风格描述映射
 */
const STYLE_DESCRIPTIONS: Record<WritingStyle, string> = {
  concise: '简洁有力，惜字如金，描写精准，对话利落',
  elegant: '文笔华丽，辞藻优美，描写细腻，意境深远',
  humorous: '幽默风趣，轻松诙谐，妙语连珠，引人入胜',
  ancient: '古风典雅，用词典雅，韵味悠长，意象丰富',
  custom: '', // 自定义风格由用户指定
};

/**
 * 角色信息转为字符串
 */
function formatCharacter(char: ChapterWritingContext['characters'][0]): string {
  const lines = [
    `- 姓名：${char.name}`,
    `- 身份：${char.role}`,
    `- 性格特点：${char.personality.join('、')}`,
  ];

  if (char.appearance) {
    lines.push(`- 外貌：${char.appearance}`);
  }

  if (char.speakingStyle) {
    lines.push(`- 说话风格：${char.speakingStyle}`);
  }

  if (char.currentStatus) {
    lines.push(`- 当前状态：${char.currentStatus}`);
  }

  if (char.relationships && char.relationships.length > 0) {
    lines.push(`- 人物关系：`);
    char.relationships.forEach(r => {
      lines.push(`  · ${char.name}与${r.targetName}：${r.type} - ${r.description}`);
    });
  }

  return lines.join('\n');
}

/**
 * 世界观规则转为字符串
 */
function formatWorldRules(rules: ChapterWritingContext['worldSetting']['rules']): string {
  if (!rules || rules.length === 0) return '（未设定特殊规则）';
  
  return rules.map(r => `- ${r.name}：${r.description}`).join('\n');
}

/**
 * 世界观地点转为字符串
 */
function formatWorldLocations(locations: ChapterWritingContext['worldSetting']['locations']): string {
  if (!locations || locations.length === 0) return '（未设定地点）';

  // 按层级分组
  const byLevel = locations.reduce((acc, loc) => {
    const level = loc.level || 'other';
    if (!acc[level]) acc[level] = [];
    acc[level].push(loc);
    return acc;
  }, {} as Record<string, typeof locations>);

  const lines: string[] = [];
  
  const levelNames: Record<string, string> = {
    world: '世界级',
    continent: '大陆级',
    country: '国家',
    city: '城市',
    town: '城镇',
    other: '其他',
  };

  Object.entries(byLevel).forEach(([level, locs]) => {
    lines.push(`【${levelNames[level] || level}】`);
    locs.forEach(loc => {
      lines.push(`- ${loc.name}：${loc.description}`);
    });
  });

  return lines.join('\n');
}

/**
 * 世界观势力转为字符串
 */
function formatWorldFactions(factions: ChapterWritingContext['worldSetting']['factions']): string {
  if (!factions || factions.length === 0) return '（未设定势力）';

  return factions.map(f => `- ${f.name}：${f.description}`).join('\n');
}

/**
 * 伏笔转为字符串
 */
function formatForeshadows(foreshadows: ChapterWritingContext['foreshadows']): string {
  if (!foreshadows || foreshadows.length === 0) return '（无伏笔）';

  return foreshadows.map(f => {
    const statusText = {
      buried: '已埋设',
      hinted: '已暗示',
      foreshadowed: '已铺垫',
      resolved: '已揭示',
    }[f.status] || f.status;

    const suggested = f.suggestedChapter ? `（建议在第${f.suggestedChapter}章揭示）` : '';
    return `- ${f.hint} [${statusText}]${suggested}`;
  }).join('\n');
}

/**
 * Prompt 构建器类
 */
export class PromptBuilder {
  /**
   * 构建章节续写 Prompt
   */
  static buildChapterContinuePrompt(
    context: ChapterWritingContext,
    existingContent: string,
    targetWordCount: number,
    additionalInstructions?: string
  ): string {
    const styleDesc = context.requirements.customStyle 
      || STYLE_DESCRIPTIONS[context.requirements.style];

    // 主角信息
    const protagonist = context.characters.find(c => 
      c.role.includes('主角') || c.role.includes('男主') || c.role.includes('女主')
    );

    // 本章出场角色
    const charactersInScene = context.characters.filter(c => 
      context.charactersInScene.includes(c.id)
    );

    // 活跃伏笔（未揭示的）
    const activeForeshadows = context.foreshadows.filter(f => f.status !== 'resolved');

    // 构建约束规则
    const constraints: string[] = [];
    
    if (protagonist) {
      constraints.push(`【主角约束】${protagonist.name}的性格特点：${protagonist.personality.join('、')}。请确保对话和行为符合其性格设定。`);
    }

    if (context.worldSetting?.rules && context.worldSetting.rules.length > 0) {
      constraints.push(`【世界观约束】当前世界的核心规则：\n${formatWorldRules(context.worldSetting.rules)}`);
    }

    // 构建伏笔提醒
    const foreshadowReminder = activeForeshadows.length > 0
      ? `【伏笔提醒】当前故事中有以下伏笔尚未揭示：\n${activeForeshadows.map(f => `- ${f.hint}`).join('\n')}\n请根据剧情发展适当铺垫或揭示。`
      : '';

    // 构建埋设/揭示任务
    const foreshadowTasks: string[] = [];
    if (context.requirements.foreshadowToBury && context.requirements.foreshadowToBury.length > 0) {
      foreshadowTasks.push(`【本章需要埋设伏笔】\n${context.requirements.foreshadowToBury.map(f => `- ${f}`).join('\n')}`);
    }
    if (context.requirements.foreshadowToReveal && context.requirements.foreshadowToReveal.length > 0) {
      foreshadowTasks.push(`【本章需要揭示伏笔】\n${context.requirements.foreshadowToReveal.map(f => `- ${f}`).join('\n')}`);
    }

    const foreshadowSection = foreshadowTasks.length > 0
      ? foreshadowTasks.join('\n\n')
      : '';

    return `# 小说续写任务

## 任务要求
请续写以下小说内容，要求：
1. **字数要求**：${targetWordCount} 字左右
2. **风格要求**：${styleDesc}
3. **章节任务**：${context.chapter.outline || '延续当前情节，自然推进故事发展'}

## 已写内容
${existingContent || '（空，当前为章节开头）'}

${context.previousChapter ? `## 前情概要
**上一章：《${context.previousChapter.title}》结尾**
${context.previousChapter.ending || context.previousChapter.summary}
` : ''}

## 角色设定
${protagonist ? `### 主角
${formatCharacter(protagonist)}
` : ''}

### 本章出场角色
${charactersInScene.length > 0 
  ? charactersInScene.map(c => formatCharacter(c)).join('\n\n')
  : '（本章暂无特定角色要求）'
}

${context.worldSetting ? `## 世界观设定
### 地点
${formatWorldLocations(context.worldSetting.locations || [])}

### 势力
${formatWorldFactions(context.worldSetting.factions || [])}

### 规则
${formatWorldRules(context.worldSetting.rules || [])}
` : ''}

${foreshadowReminder}

${foreshadowSection}

## 约束规则
${constraints.join('\n\n')}

${additionalInstructions ? `## 额外指令
${additionalInstructions}
` : ''}

## 输出要求
请直接输出续写内容，不需要任何前缀说明。`;
  }

  /**
   * 构建章节生成 Prompt（用于从大纲生成章节目录）
   */
  static buildChapterOutlinePrompt(
    projectTitle: string,
    synopsis: string,
    chapterCount: number,
    wordsPerChapter: number,
    style: WritingStyle,
    worldSetting?: ChapterWritingContext['worldSetting'],
    characters?: ChapterWritingContext['characters']
  ): string {
    const styleDesc = STYLE_DESCRIPTIONS[style];
    const totalWordCount = chapterCount * wordsPerChapter;

    return `# 小说章节目录生成任务

## 项目信息
- **书名**：${projectTitle}
- **故事梗概**：${synopsis}
- **目标章节数**：${chapterCount} 章
- **每章目标字数**：约 ${wordsPerChapter} 字
- **预估总字数**：约 ${totalWordCount.toLocaleString()} 字
- **写作风格**：${styleDesc}

${worldSetting ? `## 世界观设定
### 地点
${formatWorldLocations(worldSetting.locations || [])}

### 势力
${formatWorldFactions(worldSetting.factions || [])}

### 规则
${formatWorldRules(worldSetting.rules || [])}
` : ''}

${characters && characters.length > 0 ? `## 核心角色
${characters.slice(0, 5).map(c => `- ${c.name}（${c.role}）：${c.description}`).join('\n')}
` : ''}

## 任务要求
请根据上述信息，生成详细的章节目录，包括：
1. 每章的标题
2. 每章的大纲概述（200-500字）
3. 每章需要完成的关键事件
4. 每章需要埋设或揭示的伏笔（如果有）

## 输出格式
请按以下 JSON 格式输出：
\`\`\`json
{
  "chapters": [
    {
      "title": "第一章：xxx",
      "outline": "本章大纲概述...",
      "keyEvents": ["关键事件1", "关键事件2"],
      "foreshadows": ["伏笔1", "伏笔2"]
    }
  ]
}
\`\`\`

请确保：
- 章节安排符合故事节奏（开端、发展、高潮、结局）
- 伏笔埋设有层次感，前后呼应
- 每章有明确的目标和冲突`;
  }

  /**
   * 构建章节润色 Prompt
   */
  static buildPolishPrompt(
    content: string,
    style: WritingStyle,
    focus?: 'grammar' | 'style' | 'consistency'
  ): string {
    const styleDesc = STYLE_DESCRIPTIONS[style];

    const focusInstructions: Record<string, string> = {
      grammar: '重点检查语法错误、错别字、病句等基础问题',
      style: '重点优化文笔，使语言更加流畅优美，符合' + styleDesc + '的风格',
      consistency: '重点检查前后一致性，包括人物称呼、时间线、地理设定等',
    };

    return `# 文章润色任务

## 润色要求
- **目标风格**：${styleDesc}
- **重点方向**：${focusInstructions[focus || 'style']}

## 待润色内容
${content}

## 任务
请对上述内容进行润色，输出修改后的完整内容。
如有任何重大改动，请在改动处添加【注释】说明改动原因。

## 输出
请直接输出润色后的内容，不需要任何前缀说明。`;
  }

  /**
   * 构建角色一致性检查 Prompt
   */
  static buildCharacterConsistencyPrompt(
    content: string,
    characters: ChapterWritingContext['characters']
  ): string {
    const characterList = characters.map(c => 
      `【${c.name}】\n角色定位：${c.role}\n性格特点：${c.personality.join('、')}\n${c.currentStatus ? `当前状态：${c.currentStatus}` : ''}`
    ).join('\n\n');

    return `# 角色一致性检查

## 角色设定
${characterList}

## 待检查内容
${content}

## 任务
请检查待检查内容中是否存在以下问题：
1. 角色性格表现前后矛盾
2. 角色行为不符合其性格设定
3. 角色外貌/特征描述前后不一致
4. 角色说话风格与设定不符

## 输出格式
请按以下格式输出检查结果：
\`\`\`
【检查结果】
符合一致性：✓
或
发现以下问题：
1. [问题描述] - 涉及角色：[角色名] - 建议修改：[修改建议]
...
\`\`\`

如没有问题，请输出"未发现角色一致性问题"。`;
  }

  /**
   * 构建战力体系检查 Prompt
   */
  static buildPowerSystemPrompt(
    content: string,
    powerSystem?: string,
    characterPowerLevels?: Record<string, string>
  ): string {
    const powerInfo = powerSystem 
      ? `【战力体系】\n${powerSystem}\n`
      : '';
    
    const characterPowers = characterPowerLevels
      ? `【人物当前战力】\n${Object.entries(characterPowerLevels).map(([name, level]) => `- ${name}：${level}`).join('\n')}\n`
      : '';

    return `# 战力一致性检查

${powerInfo}
${characterPowers}

## 待检查内容
${content}

## 任务
请检查待检查内容中是否存在以下战力相关问题：
1. 越级战斗（低战力战胜高战力但无合理解释）
2. 战力表现忽高忽低
3. 与已建立的战力规则冲突
4. 能力使用条件/代价被忽略

## 输出格式
请按以下格式输出检查结果：
\`\`\`
【检查结果】
未发现战力问题
或
发现以下问题：
1. [问题描述] - 涉及角色：[角色名] - 战力情况：[说明]
\`\`\``;
  }

  /**
   * 估算文本 Token 数量
   */
  static estimateTokens(text: string): number {
    // 简单估算：中文按字符数 / CHINESE_CHARS_PER_TOKEN，英文按空格分隔的词数 / ENGLISH_WORDS_PER_TOKEN
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - chineseChars - englishWords;

    return Math.ceil(chineseChars / CHINESE_CHARS_PER_TOKEN + 
                     englishWords / ENGLISH_WORDS_PER_TOKEN + 
                     otherChars / 4);
  }

  /**
   * 检查 Token 是否超限
   */
  static isOverTokenLimit(text: string, maxTokens: number): boolean {
    return this.estimateTokens(text) > maxTokens;
  }

  /**
   * 截断文本以符合 Token 限制
   */
  static truncateToTokenLimit(text: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(text);
    if (currentTokens <= maxTokens) return text;

    // 估算每字符对应的 token 数
    const tokenPerChar = currentTokens / text.length;
    const targetLength = Math.floor(maxTokens / tokenPerChar);
    
    return text.slice(0, targetLength);
  }
}
