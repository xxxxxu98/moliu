/**
 * Prompt 构建器
 * 负责构建各种写作场景的 Prompt
 */

import type { 
  ChapterWritingContext, 
  WritingStyle,
  WritingConfig,
  ChapterType,
  GenerateChapterResponse
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
function formatWorldRules(rules: Array<{ name: string; description?: string }>): string {
  if (!rules || rules.length === 0) return '（未设定特殊规则）';
  
  return rules.map((r: { name: string; description?: string }) => `- ${r.name}：${r.description || ''}`).join('\n');
}

/**
 * 世界观地点转为字符串
 */
function formatWorldLocations(locations: Array<{ name: string; description?: string; level?: string }>): string {
  if (!locations || locations.length === 0) return '（未设定地点）';

  // 按层级分组
  const byLevel = locations.reduce((acc: Record<string, typeof locations>, loc: { name: string; description?: string; level?: string }) => {
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

  Object.entries(byLevel).forEach(([level, locs]: [string, typeof locations]) => {
    lines.push(`【${levelNames[level] || level}】`);
    locs.forEach((loc: { name: string; description?: string }) => {
      lines.push(`- ${loc.name}：${loc.description || ''}`);
    });
  });

  return lines.join('\n');
}

/**
 * 世界观势力转为字符串
 */
function formatWorldFactions(factions: Array<{ name: string; description?: string }>): string {
  if (!factions || factions.length === 0) return '（未设定势力）';

  return factions.map((f: { name: string; description?: string }) => `- ${f.name}：${f.description || ''}`).join('\n');
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
 * 章节类型描述（用于 prompt 中）
 */
const CHAPTER_TYPE_HINTS = `【章节类型说明】
- world_intro: 世界观/背景介绍 - 需要详细介绍故事发生的世界、历史、社会结构等
- character_intro: 人物登场/介绍 - 重点描写新角色的外貌、性格、能力、背景
- plot_setup: 情节铺陈 - 故事开端，建立冲突种子，为后续做铺垫
- conflict: 冲突展开 - 矛盾逐渐激化，情节推进
- climax: 高潮 - 故事最激烈部分，核心冲突达到顶点
- resolution: 冲突解决 - 矛盾化解，问题解决
- transitional: 过渡章节 - 连接前后情节
- ending: 结尾/收束 - 收束线索，给出结局
- normal: 普通章节 - 正常推进情节`;

/**
 * 章节类型文本转枚举
 */
function parseChapterType(typeStr: string): ChapterType {
  const typeMap: Record<string, ChapterType> = {
    'world_intro': 'world_intro',
    'worldintro': 'world_intro',
    '世界观': 'world_intro',
    '背景介绍': 'world_intro',
    'character_intro': 'character_intro',
    'characterintro': 'character_intro',
    '人物': 'character_intro',
    '人物介绍': 'character_intro',
    'plot_setup': 'plot_setup',
    'plotsetup': 'plot_setup',
    '铺陈': 'plot_setup',
    '开端': 'plot_setup',
    'conflict': 'conflict',
    '冲突': 'conflict',
    '展开': 'conflict',
    'climax': 'climax',
    '高潮': 'climax',
    'resolution': 'resolution',
    '解决': 'resolution',
    '收束': 'resolution',
    'transitional': 'transitional',
    '过渡': 'transitional',
    'ending': 'ending',
    '结尾': 'ending',
    '结局': 'ending',
    'normal': 'normal',
    '普通': 'normal',
  };
  return typeMap[typeStr.toLowerCase()] || 'normal';
}
export class PromptBuilder {
  /**
   * 根据章节类型生成写作策略
   */
  static getChapterTypeStrategy(
    chapterType: ChapterType | undefined,
    orderIndex: number,
    hasExistingContent: boolean
  ): string {
    // 判断是否为第一章（没有已有内容）
    const isFirstChapter = orderIndex === 0 && !hasExistingContent;
    const effectiveType = chapterType || (isFirstChapter ? 'world_intro' : 'normal');

    const strategies: Record<ChapterType, string> = {
      world_intro: `【本章写作策略：世界观/背景介绍】
这是本章的核心任务。请按以下顺序展开：
1. 时代背景：首先介绍故事发生的时代或时间背景
2. 世界概览：描述故事世界的基本格局（国家、地区、势力分布等）
3. 社会结构：介绍社会阶层、组织门派、势力划分等
4. 核心规则：阐释这个世界的重要规则（如修炼体系、法律、社会习俗等）
5. 自然环境：描写故事主要发生地的地理环境
请注意：背景描写要与故事情节自然融合，避免大段说明文，通过人物视角和事件自然带出世界观信息。`,

      character_intro: `【本章写作策略：人物登场/介绍】
本章需要重点介绍角色。请按以下方式展开：
1. 首次亮相：通过具体场景展现角色（如登场方式、与环境的互动）
2. 外貌描写：简洁有力地描绘角色外貌特征
3. 性格展现：通过言行举止、决策方式展现角色性格
4. 背景交代：通过回忆、对话或内心独白交代角色背景
5. 能力展示：通过具体事件展现角色的能力或特长
请注意：人物介绍要与情节推进相结合，避免孤立的人物描写。`,

      plot_setup: `【本章写作策略：情节铺陈/故事开端】
本章是故事的开端，需要建立故事的框架：
1. 开篇引人：以一个吸引人的场景或事件开篇
2. 主角处境：明确主角当前的生活状态和处境
3. 埋下伏笔：在故事早期埋设后续发展的重要伏笔
4. 冲突种子：建立故事的核心矛盾或冲突
5. 目标建立：为主角建立明确的目标或动机
请注意：开篇要简洁有力，尽快进入故事节奏。`,

      conflict: `【本章写作策略：冲突展开】
本章是冲突发展的阶段：
1. 矛盾升级：逐步推进冲突的规模和激烈程度
2. 障碍增加：为主角设置更多障碍和困难
3. 人物关系：发展和深化人物之间的矛盾或对立
4. 节奏加快：适当加快叙事节奏
5. 悬念保持：在关键处设置悬念，吸引继续阅读
请注意：冲突要有层次感，避免一步到位。`,

      climax: `【本章写作策略：高潮】
这是故事最激烈的部分：
1. 核心对决：最核心的冲突或对决在本章达到顶点
2. 情感高潮：角色情感达到最强点
3. 重大转折：可能发生重大剧情转折
4. 牺牲/代价：可能需要付出重大代价
5. 悬念高潮：故事张力达到最大
请注意：高潮要集中、激烈、不可预测。`,

      resolution: `【本章写作策略：冲突解决】
本章是矛盾化解的阶段：
1. 问题解决：核心冲突得到解决
2. 情感收尾：角色情感得到释放或升华
3. 逻辑自洽：结局要符合前面的铺垫和逻辑
4. 留有余味：可以留下一些悬念为后续做铺垫
请注意：结局要自然流畅，水到渠成。`,

      transitional: `【本章写作策略：过渡章节】
本章是连接前后情节的过渡段落：
1. 节奏放缓：可以适当放缓叙事节奏
2. 伏笔铺垫：为后续情节做铺垫
3. 人物休整：让角色有时间休整和思考
4. 细节填充：可以填充一些支线细节
请注意：过渡不等于平淡，仍需保持故事的可读性。`,

      ending: `【本章写作策略：结尾/收束】
本章是故事的结尾：
1. 收束线索：将之前埋设的伏笔和线索收拢
2. 情感落幕：给主要情感线一个交代
3. 结局明确：给出明确的结局
4. 余韵悠长：可以留下一些余味让人回味
请注意：结尾要给人满足感，同时保持故事的整体性。`,

      normal: `【本章写作策略：普通章节】
本章是正常推进情节的章节：
1. 情节推进：自然推进故事发展
2. 人物成长：展现角色的成长或变化
3. 关系发展：推进人物关系的发展
4. 节奏适中：保持合理的叙事节奏
请注意：普通章节也需要有看点，避免流水账。`,
    };

    return strategies[effectiveType];
  }

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

    // 判断是否为第一章（没有已有内容）
    const isFirstChapter = context.chapter.orderIndex === 0 && !existingContent;

    // 获取章节类型策略
    const chapterTypeStrategy = this.getChapterTypeStrategy(
      context.chapter.chapterType,
      context.chapter.orderIndex,
      !!existingContent
    );

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

    // ========== 记忆系统相关 ==========
    const memorySection = this.buildMemorySection(context);

    return `# 小说续写任务

## 章节信息
- **章节序号**：第 ${context.chapter.orderIndex + 1} 章
- **章节标题**：${context.chapter.title}
${isFirstChapter ? '- **重要提示**：这是小说的第一章，需要介绍故事背景和世界观！' : ''}

${chapterTypeStrategy}

${memorySection}

## 任务要求
请续写以下小说内容，要求：
1. **字数要求**：约 ${targetWordCount} 字
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
   * 构建记忆系统相关的 prompt 部分
   */
  static buildMemorySection(context: ChapterWritingContext): string {
    const memoryData = context.memoryData;
    
    if (!memoryData) {
      return ''; // 没有记忆数据时返回空
    }

    const sections: string[] = [];

    // 1. 情节进度（最重要，放最前面）
    if (memoryData.plotProgressTable) {
      sections.push(`## 【情节进度】故事已发展到哪了？
最近情节进展：
${memoryData.plotProgressTable}

请确保本章续写与上述情节保持连贯！`);
    }

    // 2. 角色当前状态
    if (memoryData.characterStateTable) {
      sections.push(`## 【角色状态】角色现在是什么状态？
${memoryData.characterStateTable}

请确保角色表现与上述状态一致！`);
    }

    // 3. 短期记忆（最近几章的完整原文）
    if (memoryData.shortTermFullText) {
      sections.push(`## 【近期章节原文】（最近${(memoryData.shortTermMemories as any[])?.length || 0}章）
请仔细阅读以下近期章节原文，确保续写与前文保持风格和内容的一致性：

==========

${memoryData.shortTermFullText}

==========
`);
    }

    // 4. 中期记忆（更早章节的摘要）
    if (memoryData.mediumTermMemories && memoryData.mediumTermMemories.length > 0) {
      const mediumTermContent = memoryData.mediumTermMemories.map((m: any) => {
        return `- 第${m.chapterIndex}章【${m.chapterTitle}】：${m.corePlot}`;
      }).join('\n');

      sections.push(`## 【中期回顾】（更早章节）
${mediumTermContent}`);
    }

    // 5. 长期记忆摘要
    if (memoryData.longTermSummary) {
      const { allKeyEvents, allLocations, activeForeshadows } = memoryData.longTermSummary as any;
      
      if (allKeyEvents?.length > 0) {
        const recentKeyEvents = allKeyEvents.slice(-10).join('、');
        sections.push(`## 【已发生的关键事件】
${recentKeyEvents}`);
      }
      
      if (allLocations?.length > 0) {
        sections.push(`## 【已涉及的场景】
${allLocations.join('、')}`);
      }
      
      if (activeForeshadows?.length > 0) {
        sections.push(`## 【进行中的悬念】
${activeForeshadows.join('、')}`);
      }
    }

    if (sections.length === 0) {
      return '';
    }

    return sections.join('\n\n');
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

## 章节类型说明
${CHAPTER_TYPE_HINTS}

## 任务要求
请根据上述信息，生成详细的章节目录，包括：
1. 每章的标题
2. 每章的类型（请从上述类型中选择最合适的）
3. 每章的大纲概述（200-500字）
4. 每章需要完成的关键事件
5. 每章需要埋设或揭示的伏笔（如果有）

**重要提醒**：
- **第一章必须是 'world_intro' 或 'plot_setup' 类型**，用于介绍故事背景和世界观
- 如果是玄幻/奇幻题材，前2-3章应包含 world_intro 类型，介绍世界观设定
- 如果是都市/现实题材，前1-2章应包含 world_intro 或 character_intro 类型，介绍社会背景或主角
- 故事中段可以有 transitional 类型作为节奏调节
- 高潮章节使用 climax 类型
- 结局章节使用 ending 类型

## 输出格式
请按以下 JSON 格式输出：
\`\`\`json
{
  "chapters": [
    {
      "title": "第一章：xxx",
      "chapterType": "world_intro",
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
- 每章有明确的目标和冲突
- **第一章必须包含世界观/背景介绍内容**`;
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
