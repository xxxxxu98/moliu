/**
 * Unified Prompt Builder
 * 统一的提示词构建器 - 消除重复代码
 * 
 * 所有 AI 提示词相关的核心原则和构建函数都集中在这里
 */

import type { Project, Character, Foreshadow } from '@/types/project';

// ============================================================
// 第一部分：核心写作原则（常量定义）
// ============================================================

/**
 * 章尾钩子 13 式
 */
export const CHAPTER_HOOKS_13 = [
  {
    id: 1,
    name: '突然揭示',
    description: '抛出改变全局的信息',
    example: '信上的日期，是他死后第七天。',
  },
  {
    id: 2,
    name: '紧急危机',
    description: '下章必须回应的紧迫威胁',
    example: '裂缝在扩大，灵石还差三块。',
  },
  {
    id: 3,
    name: '未完成动作',
    description: '动作被新变量打断',
    example: '他刚伸手——"别动。"身后传来一个声音。',
  },
  {
    id: 4,
    name: '身份反转',
    description: '某人不是我们认为的那个人',
    example: '他摘下口罩。那张脸，和魔王一模一样。',
  },
  {
    id: 5,
    name: '两难抉择',
    description: '被迫在两个坏选项中选一个',
    example: '救生艇只能坐两个人，水里有三个。',
  },
  {
    id: 6,
    name: '神秘物品',
    description: '重要但含义未知的物件',
    example: '包裹里是一把钥匙，附了张纸条："你欠我的。"',
  },
  {
    id: 7,
    name: '倒计时',
    description: '时间不够用',
    example: '炸弹上的数字在跳：02:57。',
  },
  {
    id: 8,
    name: '承诺/威胁',
    description: '有人宣布了行动意图',
    example: '今晚十二点之前，我会告诉所有人你做了什么。',
  },
  {
    id: 9,
    name: '离奇消失',
    description: '不可能的消失',
    example: '手铐还在，人没了。整个房间只有一个门，门没开过。',
  },
  {
    id: 10,
    name: '隐藏含义',
    description: '表面正常，实际暗藏信息',
    example: '他说："你和妹妹真像。"——她是独生女。',
  },
  {
    id: 11,
    name: '意象钩子',
    description: '反复出现的意象在章尾发生变化',
    example: '灯又灭了。但这次，她闻到了烟味。',
  },
  {
    id: 12,
    name: '回声钩子',
    description: '章尾句子呼应开头',
    example: '她说她永远不会原谅他。但她的手，攥得更紧了。',
  },
  {
    id: 13,
    name: '留白钩子',
    description: '故意不揭示发生了什么',
    example: '他看了信。脸色变了。什么也没说，把信叠好放进口袋。',
  },
] as const;

/**
 * 一级禁用词（发现即改）
 */
export const BANNED_WORDS_LEVEL1 = [
  '仿佛', '好像', '犹如', '宛若', '一丝', '一抹', '些许', '隐约',
  '深吸一口气', '缓缓', '不禁', '微微', '轻轻', '淡淡',
  '眼中闪过', '嘴角勾起', '眉头微皱', '心中一动', '心头一震',
  '心下了然', '心中暗道', '不由得', '坚定', '闪烁', '深邃',
  '凛冽', '突然', '瞬间', '不由自主', '情不自禁', '一时间',
  '就在此时', '众所周知', '令人惊讶', '令人意外', '令人费解',
  '事实', '实际上', '实质上', '本质上', '综上所述', '总而言之', '无可否认',
] as const;

/**
 * 二级禁用词（高频出现时替换）
 */
export const BANNED_WORDS_LEVEL2 = [
  '他/她终于明白', '他/她这才意识到', '此刻他/她', '一切都', '只见', '但见',
] as const;

/**
 * 核心信念
 */
export const CORE_BELIEFS = {
  engineering: '网文写作是工程，不是灵感。靠灵感写不了200万字，靠工程可以。',
  dailyMinimum: '稳定日更4000字比单章完美更重要。',
  coolPointDensity: '追读率由爽点密度决定——每3000-5000字必须有一个让读者"爽"的情绪节点。',
  outlineAsMap: '大纲是地图，不是牢笼。粗到能看见全局，细到能坐下就写。',
  writeFirst30: '先写30章，再谈其他的。30章之前不要改大纲。',
} as const;

/**
 * 爽点密度常量
 */
export const COOL_POINT_DENSITY = {
  micro: 3000,  // 微爽点间隔
  small: 9000,  // 小爽点间隔
  big: 21000,    // 大爽点间隔
} as const;

/**
 * 震惊分层写法
 */
export const SHOCK_LAYERS = {
  point: { name: '点震惊', description: '一个人震惊了一下（最弱）' },
  web: { name: '网震惊', description: '震惊关系网——不只一个人震惊，周围人都有反应' },
  depth: { name: '深度震惊', description: '多层震惊叠加——成就递进引爆震惊' },
} as const;

/**
 * 围观者质量层级
 */
export const SPECTATOR_LEVELS = [
  { level: 1, name: '低质量', description: '群演、打杂、实习生' },
  { level: 2, name: '中质量', description: '懂行的技术人员、副手' },
  { level: 3, name: '高质量', description: '行业大佬、领导' },
] as const;

/**
 * 情绪波浪实操模板
 */
export const EMOTION_WAVE_TEMPLATE = [
  '↓ 低落现状（共情建立）',
  '↑ 给出希望（期待感1）',
  '↓ 强调困难/危机（期待感放大）',
  '↑ 给出新希望（期待感2）',
  '↓ 情况恶化/意外（情绪谷底）',
  '↑ 微小进展（小满足 + 新期待）',
  '↑↑ 达成期待（小高潮）',
  '↓ 戛然而止，给出下一个困境（情绪再下拉）',
] as const;

// ============================================================
// 第二部分：提示词片段构建函数
// ============================================================

/**
 * 构建章尾钩子 13 式提示词片段
 */
export function buildChapterHooksPrompt(): string {
  const lines = ['【强制】章尾钩子13式【必须执行】', '', '每章结尾必须使用以下钩子之一：', ''];
  
  for (const hook of CHAPTER_HOOKS_13) {
    lines.push(`### ${hook.id}. ${hook.name}`);
    lines.push(`${hook.description}`);
    lines.push(`示例："${hook.example}"`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 构建震惊分层写法提示词片段
 */
export function buildShockWritingPrompt(): string {
  return `【强制】震惊分层写法【提升爽感的关键】

### 震惊三层结构
1. **点震惊**：一个人震惊了一下（最弱）
2. **网震惊**：震惊关系网 — 不只一个人震惊，周围人都有反应
3. **深度震惊**：多层震惊叠加 — 成就递进引爆震惊

### 围观者质量层级
震惊效果取决于围观者的层次：
${SPECTATOR_LEVELS.map(s => `${s.level}. ${s.name}：${s.description}`).join('\n')}
→ 围观者根据以往经验对比主角表现，越细微的情绪变化和心态差异，读者越爽

### 震惊的递进写法
对面的人手抖了一下，茶杯里的水洒出来。
旁边的人互相看了一眼。有人往后退了一步。角落里有人开始掏手机。
刚才还趾高气扬的女人，脸上的笑僵住了。她张了张嘴，一个字没说出来。
`;
}

/**
 * 构建情绪波浪线节奏提示词片段
 */
export function buildEmotionWavePrompt(): string {
  return `【强制】情绪波浪线节奏【核心四条】

1. **情绪必须不断起伏**：高低交替，峰谷分明，不能一直平
2. **不断给出新期待，不断满足**：满足后立刻给下一个
3. **满足期待时不要直接满足**：可以突然波折一下，再真正满足
4. **氛围描写随剧情高潮同步起伏**

### 情绪波浪实操模板
${EMOTION_WAVE_TEMPLATE.join('\n')}
`;
}

/**
 * 构建主动主角原则提示词片段
 */
export function buildProactiveProtagonistPrompt(): string {
  return `【强制】主动主角原则【代入感核心】
**主角必须有行动和决策，不能只是被动承受。**

❌ 被动主角示例：
"她很害怕，不知道该怎么办，只能等着事情过去。"

✅ 主动主角示例：
"她锁了门，把手机调成静音，打开了录音。"

→ 用行动展示态度，而不是用内心独白
`;
}

/**
 * 构建期待感管理提示词片段
 */
export function buildExpectationManagementPrompt(): string {
  return `【强制】期待感管理：两长一短法则【最重要】
**确保每章读者脑子里有三个好奇的东西：**
- **两个长期目标**：主角的成长方向、大悬念/世界观秘密
- **一个短期目标**：当前正在解决的事件

### 操作要点
- 长期待收回后变成短期爆发，同时拉出新的长期待
- 满足期待时不要直接满足，可以突然波折一下再真正满足
- **断期待是网文最大的毒点**，绝对不能让期待感断裂
`;
}

/**
 * 构建 Show Don't Tell 提示词片段
 */
export function buildShowDontTellPrompt(): string {
  return `【强制】Show, Don't Tell（展示，而非告知）【最重要】
**禁止直接描写人物的情绪状态，必须通过动作、环境、细节来表现。**

❌ 错误示例（直接贴标签）：
"他感到非常愤怒" / "她感到十分惊讶" / "他感到欣慰" / "她感到悲伤"

✅ 正确示例（用动作/细节表现）：
"他一拳砸在桌上，杯子震得跳了起来。" / "她愣住了，半天才回过神来。" / "他嘴角不自觉地扬了起来。"
`;
}

/**
 * 构建掐断升华提示词片段
 */
export function buildCutSublimationPrompt(): string {
  return `【强制】掐断AI式总结与升华【最重要】
**网文讲究"留钩子"或戛然而止，禁止在段落或情节结尾进行总结、说教或情感升华。**

❌ 禁止的升华句式：
"这就是成长" / "这就是人生" / "这就是命运" / "这就是为什么..." / "正因如此..." / "不难发现..."

❌ 禁止的说教句式：
"有时候，放弃也是一种智慧" / "真正的强者，不是从不失败，而是..."

✅ 正确的结尾方式：
停在对话上 / 停在悬念上 / 停在未完成动作上 / 停在意外转折上
`;
}

/**
 * 构建对话口语化提示词片段
 */
export function buildDialoguePrompt(): string {
  return `【强制】对话口语化【最重要】
**网文对话要像真人说话，允许不完美。**

✅ 允许的元素：
语气词：啊、呢、嘛、吧、呀、哦、哈、嗯、呃、卧槽
口语化：咋、咋样、啥、啥情况、干啥、咋办、咋整
打断、抢话、答非所问、口癖

❌ 禁止的书面化对话：
"我认为此事万万不可" / "此言差矣" / "依我之见" / "阁下所言极是"
`;
}

/**
 * 构建对话格式规范提示词片段
 */
export function buildDialogueFormatPrompt(): string {
  return `【强制】对话格式规范【最重要】
- **所有对话必须使用中文引号「"内容"」包裹**
- 禁止用英文引号 "" 或 '' 包裹对话
- 禁止用转述代替直接引语
- 感叹词和情绪要放在引号外面，如：「"太好了！"她高兴得跳了起来。」
`;
}

/**
 * 构建短句比例提示词片段
 */
export function buildShortSentencePrompt(): string {
  return `【强制】短句比例【最重要】
**网文节奏快，必须用短句。**

- 每个自然段不超过3句话
- 紧张、打斗、情绪爆发处必须用短句
- 可以用一句话段落制造节奏感
- 段落之间要有长短变化

✅ 正确示例（长短交错）：
"他走到窗前。
窗外的夜色很黑。
他想起刚才的事，像做梦一样。
但他知道，这不是梦。

他得面对现实。"
`;
}

/**
 * 构建去AI味三遍法提示词片段
 */
export function buildAntiAIPrompt(): string {
  return `【强制】去AI味三遍法【系统化去AI】

### Pass 1：去泛化（Strip Generic）
- 抽象情绪总结句 → 删或替换为具体动作
- 假深度句 → 删
- 意义膨胀 → 缩小到具体影响
- 工整对比句式 → 打散重写
- 装饰性形容词堆砌 → 白描
→ **这一遍去掉80%的AI味**

### Pass 2：去书面化（Cut Professional Diction）
- 分析性用词（"机制""结构""逻辑"）→ 换成日常表达
- 抽象名词滥用 → 直接说事
- 体制内用语（"进一步""深入""推进"）→ 删

### Pass 3：回人味（Restore Human Presence）
- 具体的感官细节（气味、温度、触感）
- 角色说话方式的区分
- 节奏变化（长短句交错）
→ **少即是多，每段加1-2个具体细节就够了**

### 自检四问
1. 读出声来，像人说话吗？
2. 删掉任何一句，会影响理解吗？
3. 不同角色能通过对话区分吗？
4. 有没有一个细节是这个场景特有的？
`;
}

/**
 * 构建禁用词提示词片段
 */
export function buildBannedWordsPrompt(): string {
  return `【强制】去AI味自检清单

### 一级禁用词（发现即改，不要解释）
${BANNED_WORDS_LEVEL1.join('、')}

### 二级禁用词（高频出现时替换）
${BANNED_WORDS_LEVEL2.join('、')}

### 替换对照表
**情绪词 → 具体动作**
- ❌「他感到愤怒」→ ✅「他摔门而出」
- ❌「她心中一惊」→ ✅「她手一抖，杯子差点掉了」
- ❌「他眼中闪过一丝狡黠」→ ✅「他眯起眼睛，笑了」

**AI惯用连接词 → 删除或改用具体事件**
- ❌「就在这时」→ 删除或改写「忽然，」
- ❌「与此同时」→ 「这时候」或直接写事件
`;
}

/**
 * 构建核心写作原则提示词片段（完整版）
 */
export function buildCoreWritingPrinciplesPrompt(): string {
  return `
【核心信念】
${Object.values(CORE_BELIEFS).map((b, i) => `${i + 1}. ${b}`).join('\n')}

【爽点密度要求】
- 微爽点：每${COOL_POINT_DENSITY.micro}字至少1个
- 小爽点：每${COOL_POINT_DENSITY.small}字1个
- 大爽点：每${COOL_POINT_DENSITY.big}字1个

${buildProactiveProtagonistPrompt()}

${buildExpectationManagementPrompt()}

${buildChapterHooksPrompt()}

${buildShockWritingPrompt()}

${buildEmotionWavePrompt()}

${buildShowDontTellPrompt()}

${buildCutSublimationPrompt()}

${buildDialoguePrompt()}

${buildDialogueFormatPrompt()}

${buildShortSentencePrompt()}

${buildAntiAIPrompt()}

${buildBannedWordsPrompt()}
`;
}

// ============================================================
// 第三部分：通用信息构建函数
// ============================================================

/**
 * 构建角色信息字符串
 */
export function buildCharactersInfo(characters: Character[], maxCount: number = 10): string {
  if (!characters || characters.length === 0) {
    return '（暂无角色设定）';
  }

  return characters
    .slice(0, maxCount)
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

/**
 * 构建世界观信息字符串
 */
export function buildWorldInfo(worldSchema: Project['worldSchema']): string {
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

/**
 * 构建伏笔信息字符串
 */
export function buildForeshadowInfo(foreshadows: Foreshadow[]): string {
  if (!foreshadows || foreshadows.length === 0) {
    return '（暂无伏笔设定）';
  }

  const statusMap: Record<string, string> = {
    buried: '已埋设',
    hinted: '已暗示',
    foreshadowed: '已铺垫',
    active: '进行中',
    fulfilled: '已揭晓',
    resolved: '已解决',
  };

  return foreshadows
    .filter(f => f.status !== 'resolved' && f.status !== 'fulfilled')
    .slice(0, 10)
    .map(f => `- ${f.hint}（${statusMap[f.status] || f.status}）`)
    .join('\n');
}

// ============================================================
// 第四部分：统一 PromptBuilder 类
// ============================================================

/**
 * 项目上下文信息
 */
export interface PromptContext {
  project: Project;
  currentChapterId?: string;
  currentChapterIndex?: number;
  currentChapterTitle?: string;
  currentChapterContent: string;
  currentChapterOutline?: string;
  fullOutline?: string;
  recentChaptersFullText?: string;
  adjacentChaptersSummary?: {
    previousChapterTitle?: string;
    previousChapterSummary?: string;
    nextChapterTitle?: string;
    nextChapterSummary?: string;
  };
  customPrompt?: string;
}

/**
 * 统一 PromptBuilder
 * 
 * 统一管理所有 AI 提示词的构建，消除代码重复
 */
export class UnifiedPromptBuilder {
  /**
   * 构建系统提示词 - 网文作家
   */
  static buildNovelWriterSystemPrompt(language: string = 'zh-CN'): string {
    const lang = language === 'en-US' ? '英文' : '中文';

    return `你是一位专业的网文作家，精通网络小说的写作技巧与读者心理。

## 【核心信念】网文写作是工程，不是灵感
${Object.values(CORE_BELIEFS).map((b, i) => `${i + 1}. ${b}`).join('\n')}

## 【核心原则】写得真实，而非写得正确
**AI追求完美和完整，真人追求有效和真实。**
- 不要写出"正确"的文章，要写出"像那么回事"的文章
- 有脾气、有漏洞、有意外才是真人写作
- 宁可有一点瑕疵，也不要过度完美的机械感

${buildCoreWritingPrinciplesPrompt()}

## 禁止事项
1. 不要生成任何可能导致版权问题的内容
2. 不要添加任何色情、暴力、歧视等不当内容
3. 不要在输出中添加任何解释、说明或标记
4. **【禁止】对话不用「"」引号包裹**

## 输出格式
请直接输出续写/润色后的内容，不要添加任何前缀说明。
只输出纯文本内容，不要使用 markdown 格式。`;
  }

  /**
   * 构建续写提示词
   */
  static buildContinuePrompt(
    context: PromptContext,
    mode: 'smartContinue' | 'polish',
    targetWordCount: number = 3000
  ): { systemPrompt: string; userPrompt: string } {
    const {
      project,
      currentChapterContent,
      customPrompt,
      adjacentChaptersSummary,
      currentChapterIndex,
      currentChapterTitle,
      currentChapterOutline,
      fullOutline,
      recentChaptersFullText,
    } = context;

    const isFirstChapter = (currentChapterIndex === 0 || currentChapterIndex === undefined) && !currentChapterContent;
    const chapterNumber = currentChapterIndex !== undefined ? currentChapterIndex + 1 : undefined;

    let modeInstruction: string;
    if (mode === 'smartContinue') {
      if (currentChapterOutline) {
        modeInstruction = this.buildOutlineBasedInstruction(currentChapterOutline, targetWordCount);
      } else if (isFirstChapter) {
        modeInstruction = this.buildFirstChapterInstruction(targetWordCount);
      } else {
        modeInstruction = this.buildNormalChapterInstruction(targetWordCount);
      }
    } else {
      modeInstruction = this.buildPolishInstruction();
    }

    // 构建用户提示词
    let userPrompt = `# 当前作品信息
作品名称：${project.name}
作品简介：${project.description || '暂无'}
类型标签：${project.genre.map(g => g.name).join('、')}`;

    if (chapterNumber !== undefined) {
      userPrompt += `\n\n## 当前章节信息
章节序号：第 ${chapterNumber} 章
章节标题：${currentChapterTitle || '未命名'}`;
    }

    if (currentChapterOutline) {
      userPrompt += `\n\n## 本章大纲【本章核心任务】
${currentChapterOutline}`;
    }

    if (adjacentChaptersSummary) {
      if (adjacentChaptersSummary.previousChapterTitle && adjacentChaptersSummary.previousChapterSummary) {
        userPrompt += `\n\n## 前章回顾
上一章「${adjacentChaptersSummary.previousChapterTitle}」：
${adjacentChaptersSummary.previousChapterSummary}\n`;
      }
      if (adjacentChaptersSummary.nextChapterTitle && adjacentChaptersSummary.nextChapterSummary) {
        userPrompt += `\n## 下章预告
下一章「${adjacentChaptersSummary.nextChapterTitle}」：
${adjacentChaptersSummary.nextChapterSummary}\n`;
      }
    }

    if (fullOutline) {
      userPrompt += `\n\n## 完整大纲参考
${fullOutline}`;
    }

    if (recentChaptersFullText) {
      userPrompt += `\n\n## 【重要】近期章节完整原文（请仔细阅读，确保续写风格与前文一致）
==========
${recentChaptersFullText}
==========`;
    }

    userPrompt += `
# 作品世界观设定
${buildWorldInfo(project.worldSchema)}

# 角色设定
${buildCharactersInfo(project.characters)}

# 伏笔设定
${buildForeshadowInfo(project.foreshadows)}

# 待续写/润色的内容
${currentChapterContent || '(当前章节为空，请根据本章大纲创作)'}`;

    if (customPrompt) {
      userPrompt += `\n\n# 用户补充要求
${customPrompt}`;
    }

    userPrompt += `
# 任务要求
${modeInstruction}

### 篇幅要求【强制】
- 续写：必须生成至少 ${Math.floor(targetWordCount * 0.9)} 字，最多 ${Math.ceil(targetWordCount * 1.1)} 字

## 【强制】输出格式【最重要】
1. 第一行：章节标题（如："第X章 标题内容"），单独一行
2. 第二行：空行
3. 第三行起：正文内容

## 【强制】章节标题要求【最重要】
- 标题2-15个字
- **通俗易懂，口语化优先**，像普通人说话一样
- 可以偶尔用成语，但不要文绉绉的

${buildDialogueFormatPrompt()}
`;

    return {
      systemPrompt: this.buildNovelWriterSystemPrompt(),
      userPrompt,
    };
  }

  /**
   * 构建基于大纲的续写指令
   */
  private static buildOutlineBasedInstruction(outline: string, targetWordCount: number): string {
    return `请续写以下故事内容。根据本章大纲完成任务：

### 本章任务（来自大纲）【必须完成】
${outline}

### 任务执行原则
1. **严格按照大纲**：本章的所有内容都必须围绕上述大纲展开
2. **完成大纲后再结束**：即使字数达到要求，如果大纲任务未完成，应继续完成
3. **自然衔接**：如果已有内容，要从结尾处自然衔接

${buildChapterHooksPrompt()}

绝对不能在结尾写总结、说教或情感升华。`;
  }

  /**
   * 构建第一章续写指令
   */
  private static buildFirstChapterInstruction(targetWordCount: number): string {
    return `请续写以下故事内容。这是小说的第一章，需要特别注意：

### 第一章特殊要求【重要】
1. **世界观介绍【强制】**：本章必须详细介绍故事发生的世界背景
2. **自然融入**：世界观信息要通过人物视角、场景描写自然带出
3. **引入主角**：第一章应同时引入主角，让读者快速代入
4. **建立基调**：通过场景和氛围建立整部作品的基调

### 【强制】开头五要素【第一章必须交代】
1. **谁** → 主角信息（身份、处境）
2. **在哪里** → 世界背景（地点、环境）
3. **有什么** → 金手指/特殊能力（让读者期待）
4. **因为什么** → 矛盾冲突（危机/困境/目标受阻）
5. **要做什么** → 主线方向（解决冲突的路径）

### 【强制】开头五条铁律
1. **简单点**：忌云里雾里、打哑谜的楔子
2. **不能偏**：开头剧情必须符合主线核心卖点
3. **要快**：切入剧情的速度要快，起因部分要略写
4. **要爽**：五章之内没有震惊就是失败
5. **不能平**：没有冲突矛盾就是失败

${buildProactiveProtagonistPrompt()}

${buildChapterHooksPrompt()}

绝对不能在结尾写总结、说教或情感升华。`;
  }

  /**
   * 构建普通章节续写指令
   */
  private static buildNormalChapterInstruction(targetWordCount: number): string {
    return `请续写以下故事内容。注意以下要点：

### 衔接要求
1. **从结尾继续**：仔细阅读原文结尾，从那里自然衔接续写
2. **风格匹配**：保持与前文一致的文风、语气和叙事节奏
3. **角色一致**：确保角色的语言风格、行为方式与设定一致

${buildProactiveProtagonistPrompt()}

${buildExpectationManagementPrompt()}

${buildChapterHooksPrompt()}

绝对不能在结尾写总结、说教或情感升华。`;
  }

  /**
   * 构建润色指令
   */
  private static buildPolishInstruction(): string {
    return `请润色优化以下内容。注意以下要点：

### 润色要求
1. **保持原意**：不改变原文的核心内容、情节走向和情感基调
2. **改善流畅度**：改善句子的流畅度和可读性
3. **提升文笔**：丰富修辞手法，增强文字感染力

${buildAntiAIPrompt()}

${buildBannedWordsPrompt()}
`;
  }

  /**
   * 构建章节分析提示词
   */
  static buildAnalysisPrompt(context: PromptContext): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的小说编辑，擅长分析文本中的问题并提供改进建议。

## 分析原则
1. **客观公正**：以专业的编辑视角审视文本
2. **重点突出**：优先指出最影响阅读体验的问题
3. **可操作性**：每条建议都应具有可执行的修改方向
4. **适度建议**：最多返回 5 条最重要的建议`;

    const userPrompt = `作品名称：${context.project.name}
作品简介：${context.project.description || '暂无'}

角色设定：
${buildCharactersInfo(context.project.characters)}

当前章节内容：
${context.currentChapterContent || '(当前章节为空)'}

请分析以上内容，返回 JSON 格式的建议。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建记忆上下文提取提示词
   */
  static buildMemoryContextPrompt(context: PromptContext): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的叙事分析师，擅长从文本中提取关键场景信息。

## 提取维度
1. **出场角色**：从文本中明确出现或被明确提及的角色
2. **地点**：场景发生的具体位置
3. **时间**：场景发生的时间
4. **氛围**：场景的整体情绪基调

## 输出要求
1. 严格按照 JSON 格式输出
2. charactersInScene 返回角色名数组，精确匹配作品中的角色名`;

    const userPrompt = `可用角色列表（请精确匹配角色名）：
${context.project.characters.map(c => `- ${c.name}`).join('\n')}

当前章节内容：
${context.currentChapterContent || '(当前章节为空)'}

请提取场景信息，严格按照以下 JSON 格式输出：
{
  "charactersInScene": ["角色名1", "角色名2"],
  "location": "地点描述",
  "time": "时间描述",
  "mood": "氛围描述"
}`;

    return { systemPrompt, userPrompt };
  }
}
