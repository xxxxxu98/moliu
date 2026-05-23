/**
 * 起草 Agent
 * 基于 oh-story 和 webnovel-writer 架构
 * 
 * 核心职责：
 * - 根据任务书构建 Prompt
 * - 调用 AI 生成正文
 * - 融合网文写作技法（章尾钩子、震惊写法、爽点节奏等）
 * - 支持审查反馈注入，实现智能重试
 */

import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import type { TaskBook, ChapterHookType } from './types';
import { CHAPTER_END_HOOKS, CHAPTER_START_HOOKS } from '@/config/writing-knowledge';
import type { RevisionHints } from '../review/RevisionHintBuilder';

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
// 章尾钩子 13 式
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

export class DraftAgent {
  private aiProvider = useActiveAIProvider();
  
  /**
   * 起草正文（基础版）
   */
  async draft(
    taskBook: TaskBook,
    context: any
  ): Promise<{ content: string; wordCount: number }> {
    return this.draftWithHints(taskBook, context);
  }

  /**
   * 起草正文（支持审查反馈版）
   * 
   * @param taskBook 任务书
   * @param context 上下文
   * @param revisionHints 审查反馈提示（可选）
   */
  async draftWithHints(
    taskBook: TaskBook,
    context: any,
    revisionHints?: RevisionHints
  ): Promise<{ content: string; wordCount: number }> {
    const systemPrompt = this.buildSystemPrompt(taskBook, context, revisionHints);
    const userPrompt = this.buildUserPrompt(taskBook, context, revisionHints);
    
    // 调用 AI
    const result = await this.callAI(systemPrompt, userPrompt);
    
    // 提取正文（去掉标题行）
    const content = this.extractDraft(result);
    const wordCount = this.countWords(content);
    
    return { content, wordCount };
  }
  
  /**
   * 构建系统 Prompt（支持审查反馈）
   */
  private buildSystemPrompt(
    taskBook: TaskBook,
    context: any,
    revisionHints?: RevisionHints
  ): string {
    const { opening, story, characters, writingGuidance, ending, antiAIReminders } = taskBook;
    
    // 如果有审查反馈，生成反馈补充
    const revisionSupplement = this.buildRevisionSupplement(revisionHints);
    
    let prompt = `# 小说续写任务

你是专业网文作家，擅长写吸引人的网络小说。你的任务是续写第${opening.chapterNumber}章。`;

## 核心原则
${WRITING_PRINCIPLES}

## 本章信息
**书名**: ${opening.bookTitle}
**章节**: 第 ${opening.chapterNumber} 章
**标题**: ${opening.chapterTitle}
**一句话目标**: ${opening.oneLineGoal}

## 上章结尾（必须衔接）
${story.previousChapterEnding || story.previousSummary.slice(-500)}

## 本章目标
${story.goal}

## 障碍与压力
${story.obstacles.map(o => `- ${o}`).join('\n')}

## 情节节点（必须遵循）
- **CBN（开始节点）**: ${story.cbn}
- **CPNs（中间节点）**:
${story.cpns.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}
- **CEN（结束节点）**: ${story.cen}

## 必须覆盖
${story.mustCover.map(m => `- ${m}`).join('\n')}

## 禁区（禁止出现）
${story.forbiddenZones.map(f => `- ${f}`).join('\n')}

## 时间线
- 时间锚点: ${story.timeAnchor}
- 章节跨度: ${story.chapterSpan}

## 人物设定

${characters.map(c => `### ${c.name}（${c.role}）
- 当前状态: ${c.state}
- 驱动力: ${c.motivation}
- 本章作用: ${c.chapterRole}
- 说话风格: ${c.speakingStyle}
${c.appearance ? `- 外貌特征: ${c.appearance}` : ''}
`).join('\n')}

## 怎么写（来自 oh-story 技法）

### 风格策略
${writingGuidance.stylePriority.map(s => `- ${s}`).join('\n')}

### 节奏策略
${writingGuidance.pacingStrategy === 'build_up' ? '铺压为主，优先做威胁与代价的铺垫' :
  writingGuidance.pacingStrategy === 'confront' ? '正面对抗，确保破局路径清晰' :
  writingGuidance.pacingStrategy === 'release' ? '释放与余波，给出实质收益并引出下一问' :
  '保持压力-破局-余波的完整链路'}

### 震惊写法
- **点震惊**：一个人震惊了一下（最弱）
- **网震惊**：震惊关系网 — 不只一个人震惊，周围人都有反应
- **深度震惊**：多层震惊叠加 — 成就递进引爆震惊

### 爽点节奏
每 ${writingGuidance.coolPointDensity || 3000} 字至少一个爽点

${writingGuidance.hookStrategy ? `### 钩子策略
章首钩子类型: ${writingGuidance.hookStrategy.chapterStartHooks.join('、')}
章尾钩子类型: ${writingGuidance.hookStrategy.chapterEndHook}
张力等级: ${writingGuidance.hookStrategy.tensionLevel}
` : ''}

## 结尾设计
**本章结尾目标**: ${ending.target}
**未完问题**: ${ending.unfinishedQuestions.join('、')}
**章尾钩子**: ${CHAPTER_END_HOOK_TEMPLATES[ending.hookType]}

## Anti-AI 提醒 ⚠️
${antiAIReminders.map(r => `- ${r}`).join('\n')}
${ANTI_AI_REMINDERS}

## 输出格式

请严格按以下格式输出：

**第一行**：章节标题（格式："第X章 标题"）

**第二行起**：续写正文

### 标题要求
- 2-15个字
- 通俗易懂，口语化优先
- 参考网络小说风格：《斗破苍穹》《赘婿》那种接地气的

### 正文要求
- 对话必须用中文引号「"内容"」
- 禁止在正文中添加任何前缀说明
- 字数要求：${context.targetWordCount || 3000} 字左右
- **避免错别字**：检查"的/地/得"、"在/再"、"那/哪"等常见错误
${revisionSupplement}`;
  }

  /**
   * 构建审查反馈补充
   */
  private buildRevisionSupplement(revisionHints?: RevisionHints): string {
    if (!revisionHints || revisionHints.issues.length === 0) {
      return '';
    }

    const parts: string[] = [];

    // 警告标题
    parts.push(`\n\n## ⚠️ 上次审查未通过，请务必修复以下问题\n`);

    // 优先级问题
    if (revisionHints.topPriority.length > 0) {
      parts.push(`### 🔴 必须修复（优先级最高）`);
      revisionHints.topPriority.forEach((issue, i) => {
        parts.push(`${i + 1}. ${issue}`);
      });
      parts.push('');
    }

    // 必须修复
    if (revisionHints.mustFix.length > 0) {
      parts.push(`### ✅ 本次必须覆盖`);
      revisionHints.mustFix.forEach((item, i) => {
        parts.push(`${i + 1}. ${item}`);
      });
      parts.push('');
    }

    // 必须避免
    if (revisionHints.mustAvoid.length > 0) {
      parts.push(`### 🚫 本次必须避免`);
      revisionHints.mustAvoid.forEach((item, i) => {
        parts.push(`${i + 1}. ${item}`);
      });
      parts.push('');
    }

    // 修改建议
    if (revisionHints.suggestions.length > 0) {
      parts.push(`### 💡 修改建议`);
      revisionHints.suggestions.forEach((suggestion, i) => {
        parts.push(`${i + 1}. ${suggestion}`);
      });
      parts.push('');
    }

    // 重点区域
    if (revisionHints.focusAreas.length > 0) {
      parts.push(`### 🎯 重点关注区域`);
      revisionHints.focusAreas.forEach((area) => {
        parts.push(`- **${area.location}**: ${area.reason}`);
      });
      parts.push('');
    }

    // 重写说明
    if (revisionHints.shouldRewrite && revisionHints.rewriteReason) {
      parts.push(`### 📝 重要说明\n`);
      parts.push(`上次输出存在以下严重问题，需要重新起草：\n`);
      parts.push(`${revisionHints.rewriteReason}\n`);
    }

    parts.push(`---\n`);
    parts.push(`请根据以上反馈，重新撰写本章内容，确保所有问题得到修复。`);

    return parts.join('\n');
  }
  
  /**
   * 构建用户 Prompt（支持审查反馈）
   */
  private buildUserPrompt(
    taskBook: TaskBook,
    context: any,
    revisionHints?: RevisionHints
  ): string {
    const { story, ending } = taskBook;

    let prompt = `请续写第${story.previousSummary.includes('第') ? story.previousSummary.match(/第(\d+)章/)?.[1] || taskBook.opening.chapterNumber : taskBook.opening.chapterNumber}章。

【本章章纲】
${story.goal}

【必须覆盖的情节节点】
${story.cpns.map((n, i) => `${i + 1}. ${n}`).join('\n')}

【跨章线索】
${story.crossChapterClues.map(c => `- ${c}`).join('\n')}

【本章结尾设计】
${ending.target}
留一个未完问题让读者想翻下一章：${ending.unfinishedQuestions[0] || '本章结束时主角面临什么困境/选择/危机？'}`;

    // 如果有审查反馈，添加额外说明
    if (revisionHints && revisionHints.issues.length > 0) {
      prompt += `\n\n【审查反馈】\n`;
      prompt += `上次审查发现 ${revisionHints.issues.length} 个问题，请特别注意：\n`;
      revisionHints.topPriority.slice(0, 3).forEach((issue, i) => {
        prompt += `${i + 1}. ${issue}\n`;
      });
    }

    prompt += `\n请直接输出续写内容。`;

    return prompt;
  }
  
  /**
   * 调用 AI
   */
  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const { requireAIService } = this.aiProvider;
    const client = requireAIService();
    
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
    
    try {
      // 尝试流式调用
      if ((client as any).continueWritingStream) {
        return await this.callStream((client as any), messages);
      }
      
      // 非流式调用
      const response = await (client as any).chat?.(messages) || 
        (client as any).generate?.(messages);
      
      if (typeof response === 'string') {
        return response;
      }
      if (response?.content) {
        return response.content;
      }
      return JSON.stringify(response);
    } catch (error) {
      console.error('[DraftAgent] AI 调用失败:', error);
      throw error;
    }
  }
  
  /**
   * 流式调用
   */
  private async callStream(client: any, messages: any[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let content = '';
      const abortController = new AbortController();
      
      client.continueWritingStream(
        messages,
        (chunk: string) => {
          content += chunk;
        },
        () => {
          resolve(content);
        },
        (error: string) => {
          reject(new Error(error));
        },
        abortController.signal
      );
    });
  }
  
  /**
   * 提取正文
   */
  private extractDraft(text: string): string {
    // 去掉可能的 markdown 代码块标记
    let cleaned = text
      .replace(/^```(?:markdown|text)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    
    // 如果第一行是章节标题格式（"第X章 xxx"），跳过第一行
    if (/^第[一二三四五六七八九十百千万\d]+章\s/.test(cleaned)) {
      const lines = cleaned.split('\n');
      cleaned = lines.slice(1).join('\n').trim();
    }
    
    return cleaned;
  }
  
  /**
   * 统计字数
   */
  private countWords(text: string): number {
    // 中文字符 + 英文单词
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    
    return chineseChars + englishWords;
  }
}
