/**
 * 写作提示词模板 - 增强版
 * 基于 webnovel-writer 分场景模板系统
 * 
 * 三种场景模板：
 * 1. 第一章模板 (first_chapter)
 * 2. 有大纲章节模板 (with_outline)  
 * 3. 普通章节模板 (normal_chapter)
 */

import type { TaskBook, ChapterHookType } from '@/services/writing/orchestrator/types';
import type { ReaderSignals } from '@/services/writing/memory/types';

// ============================================================
// 类型定义
// ============================================================

export type SceneTemplate = 'first_chapter' | 'with_outline' | 'normal_chapter';

export interface PromptTemplateContext {
  /** 场景模板类型 */
  template: SceneTemplate;
  /** 章节号 (1-based) */
  chapterNumber: number;
  /** 章节标题 */
  chapterTitle: string;
  /** 任务书 */
  taskBook?: TaskBook;
  /** 追读力信号 */
  readerSignals?: ReaderSignals;
  /** 目标字数 */
  targetWordCount: number;
  /** 写作风格 */
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  /** 前章内容 */
  previousChapterEnding?: string;
  /** 前章摘要 */
  previousChapterSummary?: string;
}

export interface PromptTemplates {
  systemPrompt: string;
  userPrompt: string;
}

// ============================================================
// 核心写作原则（来自 oh-story）
// ============================================================

const WRITING_PRINCIPLES = `
1. **写得真实，而非写得正确** - 有脾气、有漏洞、有意外才是真人写作
2. **Show, Don't Tell** - 禁止直接描写情绪，用动作和对话展示
3. **掐断升华** - 禁止结尾说教、总结感悟
4. **短句优先** - 紧张时用短句，平静时可用长句
5. **对话占30%-50%** - 纯叙述太干，AI味十足
6. **动作代替心理** - 别写"他很紧张"，写"他手心全是汗"
7. **少用形容词** - 少说"温暖的阳光"，说"阳光晒得人懒洋洋的"
`;

// ============================================================
// Anti-AI 提醒
// ============================================================

const ANTI_AI_REMINDERS = `
【Anti-AI 提醒】⚠️ 强制执行 ⚠️

1. **情绪词 → 必须改为具体动作、表情、行为**
   - ❌「他感到愤怒」→ ✅「他摔门而出」
   - ❌「她心中一惊」→ ✅「她手一抖，杯子差点掉了」

2. **抽象描写 → 改为具体感官细节**
   - ❌「房间里一片寂静」→ ✅「安静得能听见墙上时钟的滴答声」
   - ❌「她的心在狂跳」→ ✅「她捂着胸口，感觉心脏要蹦出来」

3. **AI惯用连接词 → 删除或改用具体事件**
   - ❌「就在这时」「就在此时」→ 改用具体时间或事件衔接
   - ❌「众所周知」「令人惊讶的是」→ 删除

4. **连续排比 → 只保留最有力的一条**
   - ❌「他聪明、勇敢、善良、幽默」→ ✅「这小子脑子灵光，胆子大，嘴还欠」

5. **章末禁止安全着陆，留未解决的问题**
   - ❌「这就是成长」、「这就是人生」→ 直接停在对话/悬念/未完成动作上

6. **对话用中文引号，禁止转述**
   - ✅「"你疯了吗？"他说。」
   - ❌ 他表示这个问题很难解决。（转述代替对话）
`;

// ============================================================
// 章尾钩子模板
// ============================================================

const CHAPTER_END_HOOK_TEMPLATES: Record<ChapterHookType, string> = {
  sudden_reveal: '突然揭示 - 抛出改变全局的信息',
  urgent_crisis: '紧急危机 - 下章必须回应的紧迫威胁',
  unfinished_action: '未完成动作 - 动作被新变量打断',
  identity_reveal: '身份反转 - 某人不是我们认为的那个人',
  tough_choice: '两难抉择 - 被迫在两个坏选项中选一个',
  mysterious_item: '神秘物品 - 重要但含义未知的物件',
  countdown: '倒计时 - 时间不够用',
  promise_threat: '承诺/威胁 - 有人宣布了行动意图',
  strange_disappear: '离奇消失 - 不可能的消失',
  hidden_meaning: '隐藏含义 - 表面正常，实际暗藏信息',
  imagery: '意象钩子 - 反复出现的意象在章尾发生变化',
  echo: '回声钩子 - 章尾句子呼应开头',
  blank: '留白钩子 - 故意不揭示发生了什么',
};

// ============================================================
// 模板生成器
// ============================================================

export class SmartContinuePromptBuilder {
  
  /**
   * 构建提示词
   */
  static build(context: PromptTemplateContext): PromptTemplates {
    const { template, chapterNumber, chapterTitle, taskBook, readerSignals, targetWordCount, writingStyle, previousChapterEnding } = context;
    
    // 根据模板类型生成不同的指令
    let modeInstruction: string;
    switch (template) {
      case 'first_chapter':
        modeInstruction = this.buildFirstChapterInstruction(targetWordCount);
        break;
      case 'with_outline':
        modeInstruction = this.buildWithOutlineInstruction(taskBook, targetWordCount);
        break;
      default:
        modeInstruction = this.buildNormalChapterInstruction(targetWordCount);
    }
    
    // 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(
      chapterNumber,
      chapterTitle,
      taskBook,
      readerSignals,
      writingStyle
    );
    
    // 构建用户提示词
    const userPrompt = this.buildUserPrompt(context, modeInstruction);
    
    return { systemPrompt, userPrompt };
  }
  
  /**
   * 构建系统提示词
   */
  private static buildSystemPrompt(
    chapterNumber: number,
    chapterTitle: string,
    taskBook: TaskBook | undefined,
    readerSignals: ReaderSignals | undefined,
    writingStyle?: string
  ): string {
    // 从追读力信号获取写作建议
    const signals = readerSignals?.getSignals?.() || readerSignals;
    const writingGuidance = signals?.recentTrends?.slice(-3) || [];
    
    return `# 小说续写任务

你是专业网文作家，擅长写吸引人的网络小说。你的任务是续写第${chapterNumber}章。

## 核心原则
${WRITING_PRINCIPLES}

${taskBook ? this.buildTaskBookSection(taskBook) : ''}

## 追读力建议
${writingGuidance.length > 0 
  ? writingGuidance.map((g: any) => `- ${g}`).join('\n')
  : '保持稳定的更新节奏和情节推进'}

## Anti-AI 提醒 ⚠️
${ANTI_AI_REMINDERS}

## 输出格式
请严格按以下格式输出：
**第一行**：章节标题（格式："第X章 标题"）
**第二行起**：续写正文
对话必须用中文引号「"内容"」`;
  }
  
  /**
   * 构建任务书章节
   */
  private static buildTaskBookSection(taskBook: TaskBook): string {
    const { opening, story, characters, writingGuidance, ending, antiAIReminders } = taskBook;
    
    return `
## 本章信息
**书名**: ${opening.bookTitle}
**章节**: 第 ${opening.chapterNumber} 章
**标题**: ${opening.chapterTitle}
**一句话目标**: ${opening.oneLineGoal}

## 上章结尾（必须衔接）
${story.previousChapterEnding || story.previousSummary?.slice(-500) || '（无前章）'}

## 本章目标
${story.goal}

## 障碍与压力
${story.obstacles?.map((o: string) => `- ${o}`).join('\n') || '（无特定障碍）'}

## 情节节点（必须遵循）
- **CBN（开始节点）**: ${story.cbn}
- **CPNs（中间节点）**:
${story.cpns?.map((n: string, i: number) => `  ${i + 1}. ${n}`).join('\n') || '（无特定节点）'}
- **CEN（结束节点）**: ${story.cen}

## 必须覆盖
${story.mustCover?.map((m: string) => `- ${m}`).join('\n') || '（无特定要求）'}

## 禁区（禁止出现）
${story.forbiddenZones?.map((f: string) => `- ${f}`).join('\n') || '（无禁区）'}

## 人物设定
${characters?.map((c: any) => `### ${c.name}（${c.role}）
- 当前状态: ${c.state}
- 驱动力: ${c.motivation}
- 本章作用: ${c.chapterRole}
- 说话风格: ${c.speakingStyle}
`).join('\n') || '（无特定人物要求）'}

## 怎么写（来自 oh-story 技法）
${writingGuidance ? `
### 风格策略
${writingGuidance.stylePriority?.map((s: string) => `- ${s}`).join('\n') || '保持当前风格'}

### 节奏策略
${writingGuidance.pacingStrategy || 'normal'}

### 震惊写法
- **点震惊**：一个人震惊了一下（最弱）
- **网震惊**：震惊关系网 — 不只一个人震惊，周围人都有反应
- **深度震惊**：多层震惊叠加 — 成就递进引爆震惊

### 爽点节奏
每 ${writingGuidance.coolPointDensity || 3000} 字至少一个爽点
` : ''}

## 结尾设计
**本章结尾目标**: ${ending?.target || '自然收尾，设置悬念'}
**未完问题**: ${ending?.unfinishedQuestions?.join('、') || '本章结束时主角面临什么困境/选择/危机？'}
**章尾钩子**: ${ending?.hookType ? CHAPTER_END_HOOK_TEMPLATES[ending.hookType] : '选择合适的钩子'}

## Anti-AI 提醒 ⚠️
${antiAIReminders?.map((r: string) => `- ${r}`).join('\n') || '见下方 Anti-AI 提醒'}
`;
  }
  
  /**
   * 第一章指令
   */
  private static buildFirstChapterInstruction(targetWordCount: number): string {
    return `
这是小说的第一章，需要特别注意：

### 【强制】开头五要素
1. **谁** → 主角信息（身份、处境）
2. **在哪里** → 世界背景（地点、环境）
3. **有什么** → 金手指/特殊能力（让读者期待）
4. **因为什么** → 矛盾冲突（危机/困境/目标受阻）
5. **要做什么** → 主线方向（解决冲突的路径）

### 【强制】世界观介绍
- 时代背景（朝代/纪元/时间线等）
- 世界格局（国家分布、势力划分、地理环境）
- 社会结构（阶层、组织门派、社会规则等）
- 核心设定（修炼体系、魔法规则等）

### 【强制】开头五条铁律
1. **简单点**：忌云里雾里、打哑谜的楔子
2. **不能偏**：开头剧情必须符合主线核心卖点
3. **要快**：切入剧情的速度要快，起因部分要略写
4. **要爽**：五章之内没有震惊就是失败
5. **不能平**：没有冲突矛盾就是失败

### 结尾要求【必须使用章尾钩子】
→ 绝对不能在结尾写总结、说教或情感升华`;
  }
  
  /**
   * 有大纲章节指令
   */
  private static buildWithOutlineInstruction(taskBook: TaskBook | undefined, targetWordCount: number): string {
    if (!taskBook) {
      return this.buildNormalChapterInstruction(targetWordCount);
    }
    
    return `
根据本章大纲完成任务：

### 本章任务（来自大纲）【必须完成】
${taskBook.story?.goal || taskBook.opening?.oneLineGoal || '按大纲续写'}

### 任务执行原则
1. **严格按照大纲**：本章的所有内容都必须围绕上述大纲展开
2. **完成大纲后再结束**：即使字数达到要求，如果大纲任务未完成，应继续完成
3. **自然衔接**：从结尾处自然衔接，不要重复已写内容
4. **动态调整**：如果大纲任务简单可提前完成，可适当扩展细节

### 结尾要求【必须使用章尾钩子】`;
  }
  
  /**
   * 普通章节指令
   */
  private static buildNormalChapterInstruction(targetWordCount: number): string {
    return `
### 衔接要求
1. **从结尾继续**：仔细阅读原文结尾，从那里自然衔接续写
2. **风格匹配**：保持与前文一致的文风、语气和叙事节奏
3. **角色一致**：确保角色的语言风格、行为方式与设定一致

### 【重要】主动主角
主角必须有行动和决策，不能只是被动承受。

### 结尾要求【必须使用章尾钩子13式】
1. 突然揭示 - 抛出改变全局的信息
2. 紧急危机 - 下章必须回应的紧迫威胁
3. 未完成动作 - 动作被新变量打断
4. 身份反转 - 某人不是我们认为的那个人
5. 两难抉择 - 被迫在两个坏选项中选一个
→ 绝对不能在结尾写总结、说教或情感升华`;
  }
  
  /**
   * 构建用户提示词
   */
  private static buildUserPrompt(context: PromptTemplateContext, modeInstruction: string): string {
    const { chapterNumber, chapterTitle, taskBook, previousChapterEnding, previousChapterSummary, targetWordCount } = context;
    
    let prompt = `# 当前任务
请续写第${chapterNumber}章「${chapterTitle}」

${modeInstruction}

### 篇幅要求【强制】
续写内容约 ${targetWordCount} 字，允许±15%的偏差`;
    
    if (previousChapterEnding) {
      prompt += `

### 前章结尾（必须衔接）
${previousChapterEnding}`;
    }
    
    if (previousChapterSummary) {
      prompt += `

### 前章摘要
${previousChapterSummary}`;
    }
    
    if (taskBook?.story?.mustCover?.length) {
      prompt += `

### 必须覆盖的情节节点
${taskBook.story.mustCover.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}`;
    }
    
    if (taskBook?.story?.forbiddenZones?.length) {
      prompt += `

### 禁区（禁止出现）
${taskBook.story.forbiddenZones.map((f: string) => `- ${f}`).join('\n')}`;
    }
    
    if (taskBook?.characters?.length) {
      prompt += `

### 本章主要角色
${taskBook.characters.map((c: any) => `- ${c.name}（${c.role}）：${c.chapterRole}`).join('\n')}`;
    }
    
    if (taskBook?.ending) {
      prompt += `

### 本章结尾设计
${taskBook.ending.target}
留一个未完问题让读者想翻下一章：${taskBook.ending.unfinishedQuestions?.[0] || '本章结束时主角面临什么困境/选择/危机？'}`;
    }
    
    prompt += `

请直接输出续写内容。`;

    return prompt;
  }
  
  // ============================================================
  // 便捷方法
  // ============================================================
  
  /**
   * 构建第一章提示词
   */
  static buildFirstChapter(
    chapterTitle: string,
    worldSchema?: string,
    targetWordCount: number = 3000
  ): PromptTemplates {
    return this.build({
      template: 'first_chapter',
      chapterNumber: 1,
      chapterTitle,
      targetWordCount,
    });
  }
  
  /**
   * 构建有大纲章节提示词
   */
  static buildWithOutline(
    chapterNumber: number,
    chapterTitle: string,
    outline: string,
    taskBook: TaskBook,
    previousChapterEnding: string,
    targetWordCount: number = 3000
  ): PromptTemplates {
    return this.build({
      template: 'with_outline',
      chapterNumber,
      chapterTitle,
      taskBook,
      previousChapterEnding,
      targetWordCount,
    });
  }
  
  /**
   * 构建普通章节提示词
   */
  static buildNormalChapter(
    chapterNumber: number,
    chapterTitle: string,
    previousChapterEnding: string,
    previousChapterSummary: string,
    targetWordCount: number = 3000
  ): PromptTemplates {
    return this.build({
      template: 'normal_chapter',
      chapterNumber,
      chapterTitle,
      previousChapterEnding,
      previousChapterSummary,
      targetWordCount,
    });
  }
}

// ============================================================
// 导出
// ============================================================

export { SmartContinuePromptBuilder as PromptBuilder };
export type { PromptTemplateContext, SceneTemplate, PromptTemplates };

// ============================================================
// Composable 导出
// ============================================================

export function usePromptBuilder() {
  return {
    /**
     * 构建提示词
     */
    build: (context: PromptTemplateContext) => SmartContinuePromptBuilder.build(context),
    
    /**
     * 构建第一章提示词
     */
    buildFirstChapter: (title: string, worldSchema?: string, wordCount?: number) =>
      SmartContinuePromptBuilder.buildFirstChapter(title, worldSchema, wordCount),
    
    /**
     * 构建有大纲章节提示词
     */
    buildWithOutline: (
      chapterNumber: number,
      title: string,
      outline: string,
      taskBook: import('./orchestrator/types').TaskBook,
      prevEnding: string,
      wordCount?: number
    ) => SmartContinuePromptBuilder.buildWithOutline(chapterNumber, title, outline, taskBook, prevEnding, wordCount),
    
    /**
     * 构建普通章节提示词
     */
    buildNormalChapter: (
      chapterNumber: number,
      title: string,
      prevEnding: string,
      prevSummary: string,
      wordCount?: number
    ) => SmartContinuePromptBuilder.buildNormalChapter(chapterNumber, title, prevEnding, prevSummary, wordCount),
  };
}
