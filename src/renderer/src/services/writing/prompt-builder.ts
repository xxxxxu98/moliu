/**
 * Prompt 构建器
 * 负责构建各种写作场景的 Prompt
 * 集成了 oh-story-claudecode skills 的核心方法论
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
import {
  BANNED_WORDS,
  CHAPTER_END_HOOKS,
  CHAPTER_START_HOOKS,
  EIGHT_NODES,
  PACE_FORMULAS,
  WRITING_PRINCIPLES
} from '@/config/writing-knowledge';

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
  
  return rules.map((r) => `- ${r.name}：${r.description || ''}`).join('\n');
}

/**
 * 世界观地点转为字符串
 */
function formatWorldLocations(locations: Array<{ name: string; description?: string; level?: string }>): string {
  if (!locations || locations.length === 0) return '（未设定地点）';

  const byLevel = locations.reduce((acc: Record<string, typeof locations>, loc) => {
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
   * 获取写作核心原则
   */
  static getWritingPrinciples(): string {
    return `# 【网文写作核心原则】来自 oh-story-claudecode skills

${WRITING_PRINCIPLES.outline.map(p => `- ${p}`).join('\n')}
`;
  }

  /**
   * 获取章尾钩子技法
   */
  static getChapterEndHooks(): string {
    return `## 【章尾钩子13式】来自 oh-story-claudecode skills

${CHAPTER_END_HOOKS.map((hook, i) => `${i + 1}. ${hook}`).join('\n')}
`;
  }

  /**
   * 获取章首钩子技法
   */
  static getChapterStartHooks(): string {
    return `## 【章首钩子7式】来自 oh-story-claudecode skills

${CHAPTER_START_HOOKS.map((hook, i) => `${i + 1}. ${hook}`).join('\n')}
`;
  }

  /**
   * 获取爽点节奏公式
   */
  static getPaceFormulas(): string {
    return `## 【爽点节奏公式】来自 oh-story-claudecode skills

- ${PACE_FORMULAS.microPerChapter}
- ${PACE_FORMULAS.conflictPerThreeChapters}
- ${PACE_FORMULAS.climaxPerSevenChapters}
- 情绪拉扯：${PACE_FORMULAS.emotionalPull}
- 逼格塑造：${PACE_FORMULAS.bage}
`;
  }

  /**
   * 获取AI味禁用词表（增强版：带替换示例）
   */
  static getBannedWords(): string {
    const examples = BANNED_WORDS.replacementExamples.map(
      ([bad, good]) => `【AI味】${bad}\n【自然】${good}`
    ).join('\n\n');

    return `## 【去AI味自检清单】⚠️ 每写完一段必须自检 ⚠️

### 一级禁用词（发现即改，不要解释）
${BANNED_WORDS.level1.join('、')}

### 二级禁用词（高频出现时替换）
${BANNED_WORDS.level2.join('、')}

### 禁用句式模板
${BANNED_WORDS.patterns.map(p => `- ${p}`).join('\n')}

### 替换对照示例【必须遵循】
${examples}

### 核心检查规则【必须执行】

**1. 情绪词 → 必须改为具体动作、表情、行为**
- ❌「他感到愤怒」→ ✅「他摔门而出」
- ❌「她心中一惊」→ ✅「她手一抖，杯子差点掉了」
- ❌「他眼中闪过一丝狡黠」→ ✅「他眯起眼睛，笑了」
- ❌「她不禁流下眼泪」→ ✅「她的眼泪砸在地上」

**2. 抽象描写 → 改为具体感官细节**
- ❌「房间里一片寂静」→ ✅「安静得能听见墙上时钟的滴答声」
- ❌「气氛十分紧张」→ ✅「没人敢喘气」
- ❌「她的心在狂跳」→ ✅「她捂着胸口，感觉心脏要蹦出来」

**3. AI惯用连接词 → 删除或改用具体事件**
- ❌「就在这时」「就在此时」「与此同时」→ 改用具体时间或事件衔接
- ❌「众所周知」→ 删除
- ❌「令人惊讶的是」→ 删除

**4. 连续排比 → 只保留最有力的一条**
- ❌「他聪明、勇敢、善良、幽默」→ ✅「这小子脑子灵光，胆子大，嘴还欠」
- ❌「她貌美如花、气质出众、才华横溢」→ ✅「追她的人从这儿排到巴黎」

**5. 总结升华句 → 直接删除，不说教**
- ❌「这次经历让他明白了一个道理」→ 直接写他做了什么
- ❌「她终于意识到……」→ 删除，行动说明一切

**6. 心理描写 → 用动作和对话展示**
- ❌「他心想这事不能就这么算了」→ ✅「这事没完。」他攥紧拳头。
- ❌「她有些害怕」→ ✅「她往后退了一步」

### 自检五问【每段必须】
1. 这句话像真人说出来/做出来的吗？
2. 对话用了"引号了吗？（这是强制要求！）
3. 有没有连续3个以上的四字词？（AI味的重灾区！）
4. 短句够不够多？（感叹、情绪爆发处必须用短句！）
5. 有没有在用一级禁用词？（列表在上面，一经发现立即替换）

### 写作风格提醒
- **短句！短句！短句！** 重要的事情说三遍
- **对话占30%-50%** 纯叙述太干
- **动作代替心理**：别写"他很紧张"，写"他手心全是汗"
- **少用形容词**：少说"温暖的阳光"，说"阳光晒得人懒洋洋的"
- **节奏变化**：紧张时短句连发，平静时可以用长句`;
  }

  /**
   * 获取八节点故事结构
   */
  static getEightNodesStructure(): string {
    return `## 【八节点故事结构】来自 oh-story-claudecode skills

${EIGHT_NODES.map(node => `### ${node.name}（${node.ratio}）
${node.keyPoints.map(p => `- ${p}`).join('\n')}`).join('\n\n')}
`;
  }

  /**
   * 根据章节类型生成写作策略（增强版）
   */
  static getChapterTypeStrategy(
    chapterType: ChapterType | undefined,
    orderIndex: number,
    hasExistingContent: boolean
  ): string {
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
请注意：背景描写要与故事情节自然融合，避免大段说明文，通过人物视角和事件自然带出世界观信息。

【黄金五章开篇公式】来自 skills
- 第1章：穿越/世界背景/主角人设/金手指/建立欲望
- 第2章：明确主线（获取力量/金钱/地位）
- 第3章：展示金手指强大，获得行动能力
- 第4章：拉仇恨/设立正方反方/安排信息差/铺垫期待
- 第5章：装逼成功/获得接下来装逼资格/触发新事件`,

      character_intro: `【本章写作策略：人物登场/介绍】
本章需要重点介绍角色。请按以下方式展开：
1. 首次亮相：通过具体场景展现角色（如登场方式、与环境的互动）
2. 外貌描写：简洁有力地描绘角色外貌特征
3. 性格展现：通过言行举止、决策方式展现角色性格
4. 背景交代：通过回忆、对话或内心独白交代角色背景
5. 能力展示：通过具体事件展现角色的能力或特长
请注意：人物介绍要与情节推进相结合，避免孤立的人物描写。

【人物设计要点】
- 给角色贴标签，让读者一看到某个特征就想起这个角色
- 性格特点：勇敢/机智/腹黑/热血等关键词
- 外貌特征：与性格相符的独特标志`,

      plot_setup: `【本章写作策略：情节铺陈/故事开端】
本章是故事的开端，需要建立故事的框架：
1. 开篇引人：以一个吸引人的场景或事件开篇（in media res）
2. 主角处境：明确主角当前的生活状态和处境
3. 埋下伏笔：在故事早期埋设后续发展的重要伏笔
4. 冲突种子：建立故事的核心矛盾或冲突
5. 目标建立：为主角建立明确的目标或动机
请注意：开篇要简洁有力，尽快进入故事节奏。

【开头危机五词法则】
开头的事件必须足够简单，让读者一眼看懂：
- 用五个以内的词讲清楚事件是什么
- 不需要额外解释，读者就能产生情绪`,

      conflict: `【本章写作策略：冲突展开】
本章是冲突发展的阶段：
1. 矛盾升级：逐步推进冲突的规模和激烈程度
2. 障碍增加：为主角设置更多障碍和困难
3. 人物关系：发展和深化人物之间的矛盾或对立
4. 节奏加快：适当加快叙事节奏
5. 悬念保持：在关键处设置悬念，吸引继续阅读
请注意：冲突要有层次感，避免一步到位。

【冲突设计要点】
- 冲突必须升级：言语冲突→行动冲突→激烈对抗→决定胜负
- 冲突本质是"有人阻止主角得到他想要的东西"
- 主角行动力：突破常规的能力，做别人不敢/做不到/没想到的事`,

      climax: `【本章写作策略：高潮】
这是故事最激烈的部分：
1. 核心对决：最核心的冲突或对决在本章达到顶点
2. 情感高潮：角色情感达到最强点
3. 重大转折：可能发生重大剧情转折
4. 牺牲/代价：可能需要付出重大代价
5. 悬念高潮：故事张力达到最大
请注意：高潮要集中、激烈、不可预测。

【高潮写作要点】
- 快节奏，短句为主，动作+对话+情绪密集交织
- 回合制卡牌思路：每个回合一般只能使用一张"牌"
- 震惊三层结构：点震惊→网震惊→深度震惊
- 逼格塑造：歇斯底里解决→不爽；风轻云淡一指灭杀→爽`,

      resolution: `【本章写作策略：冲突解决】
本章是矛盾化解的阶段：
1. 问题解决：核心冲突得到解决
2. 情感收尾：角色情感得到释放或升华
3. 逻辑自洽：结局要符合前面的铺垫和逻辑
4. 留有余味：可以留下一些悬念为后续做铺垫
请注意：结局要自然流畅，水到渠成。

【收获盘点要点】
- 超额收获是万能技巧：当场收获+额外收获
- 收获要通过情节展现而非罗列清单`,

      transitional: `【本章写作策略：过渡章节】
本章是连接前后情节的过渡段落：
1. 节奏放缓：可以适当放缓叙事节奏
2. 伏笔铺垫：为后续情节做铺垫
3. 人物休整：让角色有时间休整和思考
4. 细节填充：可以填充一些支线细节
请注意：过渡不等于平淡，仍需保持故事的可读性。

【期待感维持】
- 当前目标完成前，提前铺设下一目标线索
- 满足当前期待后迅速给出新期待
- 同一核心梗做好差异化`,

      ending: `【本章写作策略：结尾/收束】
本章是故事的结尾：
1. 收束线索：将之前埋设的伏笔和线索收拢
2. 情感落幕：给主要情感线一个交代
3. 结局明确：给出明确的结局
4. 余韵悠长：可以留下一些余味让人回味
请注意：结尾要给人满足感，同时保持故事的整体性。

【结尾处理】
- 不要所有伏笔都回收，保持自然感
- 避免突然说教/总结人生感悟
- 风格统一，不突然变调`,

      normal: `【本章写作策略：普通章节】
本章是正常推进情节的章节：
1. 情节推进：自然推进故事发展
2. 人物成长：展现角色的成长或变化
3. 关系发展：推进人物关系的发展
4. 节奏适中：保持合理的叙事节奏
请注意：普通章节也需要有看点，避免流水账。

【每章必做】
- 每章至少1个微爽点
- 每章结尾必须设置钩子（从章尾钩子13式中选择）
- 确保读者脑中有"两长一短"：两个长期目标+一个短期目标`,
    };

    return strategies[effectiveType];
  }

  /**
   * 获取对话格式规范（强制要求）
   */
  static getDialogueFormatSpec(): string {
    return `## 【对话格式规范】⚠️ 强制要求，违反视为不合格 ⚠️

### 中文引号使用规则【最重要】
- **所有对话必须使用中文引号「"内容"」包裹**
- " 是中文左引号， 是中文右引号
- 禁止使用英文引号 "Hello" 或 'Hello'
- 禁止使用书名号《》代替引号

### 正确示例
"你疯了吗？"他说。
"我没听错吧，"她冷笑一声，"你居然敢来？"
"我……"他欲言又止，拳头攥得咯咯响。
"这事我管定了，"他站起身，"谁也别想拦我。"
"太好了！"她高兴得跳了起来。

### 错误示例（AI最爱犯的错误！禁止出现）
- "You are crazy." （英文引号 ❌）
- "今天天气真好"，他说。（逗号在引号内 ❌ 应为："今天天气真好。"他说。）
- 他表示这个问题很难解决。（转述代替对话 ❌）
- 他心想这事不简单。（心理活动放引号内 ❌）
- 她高兴地说："太好了！"（感叹词在引号内 ❌）
- "这也太离谱了吧！"（感叹词在引号内 ❌）

### 对话写作核心技巧
1. **口语化**：角色说的话要像真实的人在说话，不是播音员在念稿
2. **角色性格**：急躁的人说话短快，腹黑的人说话绕弯子，文人说话文绉绉
3. **简短有力**：不是每句话都要很长，有时候一个"滚！"字更有力量
4. **动作配合**：重要对话前加动作/神态描写（用短句），后接引号内容
5. **反驳质问用短句**：震惊、愤怒、质问的对话要短，制造节奏感
6. **省略号慎用**：不是所有犹豫都要用"……"，有时候沉默更有力

### 对话与叙述的比例
- 优秀的小说：对话占30%-50%
- 纯叙述太干巴巴，AI味十足
- 用对话推进情节，展现性格，比大段描写更生动`;
  }

  /**
   * 构建章节续写 Prompt（增强版，集成 skills 方法论）
   */
  static buildChapterContinuePrompt(
    context: ChapterWritingContext,
    existingContent: string,
    targetWordCount: number,
    additionalInstructions?: string
  ): string {
    const styleDesc = context.requirements.customStyle
      || STYLE_DESCRIPTIONS[context.requirements.style];

    const protagonist = context.characters.find(c =>
      c.role.includes('主角') || c.role.includes('男主') || c.role.includes('女主')
    );

    const charactersInScene = context.characters.filter(c =>
      context.charactersInScene.includes(c.id)
    );

    const activeForeshadows = context.foreshadows.filter(f => f.status !== 'resolved');

    const isFirstChapter = context.chapter.orderIndex === 0 && !existingContent;

    const chapterTypeStrategy = this.getChapterTypeStrategy(
      context.chapter.chapterType,
      context.chapter.orderIndex,
      !!existingContent
    );

    const constraints: string[] = [];

    if (protagonist) {
      constraints.push(`【主角约束】${protagonist.name}的性格特点：${protagonist.personality.join('、')}。请确保对话和行为符合其性格设定。`);
    }

    if (context.worldSetting?.rules && context.worldSetting.rules.length > 0) {
      constraints.push(`【世界观约束】当前世界的核心规则：\n${formatWorldRules(context.worldSetting.rules)}`);
    }

    const foreshadowReminder = activeForeshadows.length > 0
      ? `【伏笔提醒】当前故事中有以下伏笔尚未揭示：\n${activeForeshadows.map(f => `- ${f.hint}`).join('\n')}\n请根据剧情发展适当铺垫或揭示。`
      : '';

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

    const memorySection = this.buildMemorySection(context);

    return `# 小说续写任务

${this.getWritingPrinciples()}

## 章节信息
- **章节序号**：第 ${context.chapter.orderIndex + 1} 章
- **章节标题**：${context.chapter.title}
${isFirstChapter ? '- **重要提示**：这是小说的第一章，需要介绍故事背景和世界观！' : ''}

${chapterTypeStrategy}

${this.getChapterEndHooks()}

${memorySection}

${this.getDialogueFormatSpec()}

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

${this.getPaceFormulas()}

## 约束规则
${constraints.join('\n\n')}

${this.getBannedWords()}

${additionalInstructions ? `## 额外指令
${additionalInstructions}
` : ''}

## 输出要求
请按以下格式输出：
1. **第一行**：章节标题，格式为"第X章 标题"（如"第1章 穿越异世"）
2. **第二行起**：续写正文内容

**重要提醒**：
- 标题必须简洁，控制在2-15个字之间
- 对话必须用"引号，禁止转述！`;
  }

  /**
   * 构建记忆系统相关的 prompt 部分
   */
  static buildMemorySection(context: ChapterWritingContext): string {
    const memoryData = context.memoryData;
    
    if (!memoryData) {
      return '';
    }

    const sections: string[] = [];

    if (memoryData.plotProgressTable) {
      sections.push(`## 【情节进度】故事已发展到哪了？
最近情节进展：
${memoryData.plotProgressTable}

请确保本章续写与上述情节保持连贯！`);
    }

    if (memoryData.characterStateTable) {
      sections.push(`## 【角色状态】角色现在是什么状态？
${memoryData.characterStateTable}

请确保角色表现与上述状态一致！`);
    }

    if (memoryData.shortTermFullText) {
      sections.push(`## 【近期章节原文】（最近${(memoryData.shortTermMemories as any[])?.length || 0}章）
请仔细阅读以下近期章节原文，确保续写与前文保持风格和内容的一致性：

==========

${memoryData.shortTermFullText}

==========
`);
    }

    if (memoryData.mediumTermMemories && memoryData.mediumTermMemories.length > 0) {
      const mediumTermContent = memoryData.mediumTermMemories.map((m: any) => {
        return `- 第${m.chapterIndex}章【${m.chapterTitle}】：${m.corePlot}`;
      }).join('\n');

      sections.push(`## 【中期回顾】（更早章节）
${mediumTermContent}`);
    }

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
   * 构建章节生成 Prompt（增强版，集成八节点结构）
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

${this.getWritingPrinciples()}

${this.getEightNodesStructure()}

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
- 如果是都市/现实题材，前1-2章应包含 world_intro 或 character_intro 类型
- 故事中段可以有 transitional 类型作为节奏调节
- 高潮章节使用 climax 类型
- 结局章节使用 ending 类型
- **每章结尾必须设计钩子**

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
      "foreshadows": ["伏笔1", "伏笔2"],
      "hookType": "紧急危机"
    }
  ]
}
\`\`\`

请确保：
- 章节安排符合八节点故事结构
- 伏笔埋设有层次感，前后呼应
- 每章有明确的钩子设计
- 每章有明确的目标和冲突`;
  }

  /**
   * 构建章节润色 Prompt（增强版，集成去AI味方法论）
   */
  static buildPolishPrompt(
    content: string,
    style: WritingStyle,
    focus?: 'grammar' | 'style' | 'consistency' | 'deai'
  ): string {
    const styleDesc = STYLE_DESCRIPTIONS[style];

    let focusInstructions: Record<string, string>;
    
    if (focus === 'deai') {
      focusInstructions = {
        deai: '**重点：去AI味！** 检查并替换AI高频词和句式，让文字回归自然。'
      };
    } else {
      focusInstructions = {
        grammar: '重点检查语法错误、错别字、病句等基础问题',
        style: `重点优化文笔，使语言更加流畅优美，符合${styleDesc}的风格`,
        consistency: '重点检查前后一致性，包括人物称呼、时间线、地理设定等',
      };
    }

    return `# 文章润色任务

## 润色要求
- **目标风格**：${styleDesc}
- **重点方向**：${focusInstructions[focus || 'style']}

${focus === 'deai' ? this.getBannedWords() : ''}

## 待润色内容
${content}

## 任务
请对上述内容进行润色，输出修改后的完整内容。
${focus === 'deai' ? '### 去AI味操作步骤\n1. 逐句检查禁用词表中的词汇，有则替换\n2. 检查禁用句式模板，有则改写\n3. 抽象心理描写改为具体动作展示\n4. 删除总结升华句和排比句' : ''}

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
   * 构建AI味检测 Prompt
   */
  static buildAIDetectionPrompt(content: string): string {
    return `# AI味检测任务

${this.getBannedWords()}

## 待检测内容
${content}

## 检测要求
请检测上述内容中的AI味程度，并标记需要修改的位置：

### AI味检测报告格式
\`\`\`
## AI味检测报告

### 整体评估
- AI味等级：{轻度/中度/重度}
- 主要问题：{1-3 个关键词}

### 问题标记
| 位置 | 类型 | 原文 | 问题 |
|------|------|------|------|
| 第X段 | 禁用词 | "眼中闪过一丝..." | 典型AI高频词 |
| 第Y段 | 句式 | "...，带着..." | AI惯用句式 |
| 第Z段 | 节奏 | 连续3句排比 | 过于工整 |
\`\`\`
`;
  }

  /**
   * 估算文本 Token 数量
   */
  static estimateTokens(text: string): number {
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

    const tokenPerChar = currentTokens / text.length;
    const targetLength = Math.floor(maxTokens / tokenPerChar);
    
    return text.slice(0, targetLength);
  }
}
