/**
 * Markdown Outline Generator
 * Generates outlines in Markdown format for better model compatibility
 */

import { extractPureText } from '../utils';
import { AIClient, type Message } from 'multi-ai-sdk';
import { getSDKProvider, type ProviderType } from '@/config/ai-providers';

/**
 * 生成选项
 */
export interface MarkdownGenerateOptions {
  temperature?: number;
  topP?: number;
  wordCountRange?: string;
}

/**
 * Markdown 生成器
 * 负责生成 Markdown 格式的大纲
 */
export class MarkdownOutlineGenerator {
  private client: AIClient | null = null;
  private provider: ProviderType;
  private model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) {
    this.provider = provider;
    this.model = model || '';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || '';
    this.initClient();
  }

  private initClient() {
    const sdkProvider = getSDKProvider(this.provider);

    const config: {
      provider: any;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      contextWindowSafe?: boolean;
    } = {
      provider: sdkProvider,
      contextWindowSafe: true,
    };

    if (sdkProvider !== 'ollama' && this.apiKey) {
      config.apiKey = this.apiKey;
    }

    if (this.model) {
      config.model = this.model;
    }

    this.client = new AIClient(config);

    if (this.client && this.baseUrl) {
      (this.client as any).adapter.baseUrl = this.baseUrl.replace(/\/$/, '');
    }
  }

  /**
   * 生成 Markdown 大纲
   */
  async generate(
    prompt: string,
    options: MarkdownGenerateOptions = {},
    onProgress?: (message: string) => void,
  ): Promise<string> {
    const {
      temperature = 0.7,
      topP = 0.9,
      wordCountRange = '50万-100万字',
    } = options;

    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `用户的创意种子：${prompt}` },
    ];

    onProgress?.('正在生成大纲...');

    try {
      const response = await this.client!.chat(messages, {
        temperature,
        topP,
      } as any);

      const rawContent = extractPureText(
        typeof response === 'string' ? response : JSON.stringify(response),
      );

      onProgress?.('大纲生成完成，正在解析...');
      return rawContent;
    } catch (error) {
      console.error('[MarkdownOutlineGenerator] Generation failed:', error);
      throw error;
    }
  }

  /**
   * 流式生成 Markdown 大纲
   */
  async *generateStream(
    prompt: string,
    options: MarkdownGenerateOptions = {},
  ): AsyncGenerator<{ chunk: string; fullContent: string }> {
    const {
      temperature = 0.7,
      topP = 0.9,
      wordCountRange = '50万-100万字',
    } = options;

    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `用户的创意种子：${prompt}` },
    ];

    let fullContent = '';

    try {
      const stream = this.client!.stream(messages, {
        temperature,
        topP,
      } as any);

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield { chunk: chunk.content, fullContent };
        }
        if (chunk.done) {
          break;
        }
      }
    } catch (error) {
      console.error('[MarkdownOutlineGenerator] Stream generation failed:', error);
      throw error;
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(wordCountRange: string): string {
    // 解析字数范围
    const wordCountNum = this.parseWordCount(wordCountRange);
    const totalChapters = Math.ceil(wordCountNum / 3000);
    const chaptersPerVolume = Math.ceil(wordCountNum / 150000);

    return `你是一位专业的网文小说创作顾问，精通网络小说的写作技巧与读者心理。

## 【核心信念】网文写作是工程，不是灵感
**网文写作是工程，不是灵感。靠灵感写不了长篇，靠工程可以。**

### 核心指标
1. **爽点密度**：每3000-5000字必须有一个让读者"爽"的情绪节点
2. **追读率**：网文的核心是追读率，不是单章完美
3. **节奏稳定**：日更的节奏感比单章完美更重要
4. **期待管理**：让读者"想看下一章"比什么都重要

## 【核心原则】大纲是地图，不是牢笼
- 大纲告诉你方向，但具体走哪条路可以灵活调整
- 没有大纲的长篇100%会崩，大纲太细的长篇会失去弹性
- 目标是「粗到能看见全局，细到能坐下就写」

## 【字数要求】
目标字数：${wordCountRange}（约${wordCountNum.toLocaleString()}字）
建议总章节数：${totalChapters}章
建议卷数：${chaptersPerVolume}卷
每卷字数：约${Math.round(wordCountNum / chaptersPerVolume / 10000)}万字

## 【必须参考】网文写作核心技法

### 期待感管理：两长一短法则
确保每章有：
- **两个长期目标**：主角的成长方向、大悬念/世界观秘密
- **一个短期目标**：当前正在解决的事件

### 章尾钩子设计原则
每章结尾必须留钩子，常用方式：
1. **突然揭示**：抛出改变全局的信息
2. **紧急危机**：下章必须回应的紧迫威胁
3. **未完成动作**：动作被新变量打断
4. **身份反转**：某人不是我们认为的那个人
5. **两难抉择**：被迫在两个坏选项中选一个
6. **倒计时**：时间不够用
7. **承诺/威胁**：有人宣布了行动意图

### 震惊分层写法
- **点震惊**：一个人震惊了一下
- **网震惊**：震惊关系网 — 不只一个人震惊，周围人都有反应
- **深度震惊**：多层震惊叠加 — 成就1震惊 → 成就2震惊 → 更厉害的成就3引爆震惊

### 围观者质量层级
震惊效果取决于围观者的层次：
1. 低质量：群演、打杂、实习生
2. 中质量：懂行的技术人员、副手
3. 高质量：行业大佬、领导

### 情绪波浪线节奏
1. 情绪必须不断起伏：高低交替，峰谷分明
2. 不断给出新期待，不断满足
3. 满足期待时不要直接满足，可以突然波折一下再真正满足
4. 氛围描写随剧情高潮同步起伏

### 三线交织原则
优秀网文通常三条线交织进行：
1. **Quest线（主线）**：55-65%，核心任务、升级、战斗、夺宝
2. **Fire线（感情线）**：20-30%，情感关系发展
3. **Constellation线（世界观线）**：10-20%，扩展设定、新势力

→ 注意不要连续5章以上只有一条线，会造成节奏单调

### 反派冲突五要素
设计反派时参考：
1. **反派人设**：地位、实力、性格标签
2. **动机**：想得到什么 / 想逃避什么
3. **行为**：掠夺、威逼、做局、陷害
4. **态度**：理所应当 / 趾高气昂 / 为你好 / 大义凛然
5. **主角受伤害程度**：传家宝、最后200块、费尽辛苦的道具、可能会死

## 【重要】章节大纲设计原则

### 章节数量参考（按字数范围）
- **30万字以下**：${Math.ceil(300000 / 3000)}-${Math.ceil(300000 / 2000)}章
- **50万-100万字**：${Math.ceil(500000 / 3000)}-${Math.ceil(1000000 / 3000)}章
- **100万字以上**：${Math.ceil(1000000 / 3000)}-${Math.ceil(2000000 / 3000)}章

### 当前目标章节数：${totalChapters}章

### 每章大纲必含要素
1. **核心事件**：本章要解决什么问题
2. **钩子设计**：章尾用什么方式留钩子
3. **爽点安排**：本章有没有爽点，安排在哪里
4. **伏笔推进**：推进哪些伏笔，是否有新伏笔

### 章节节奏分布建议
- 前3章：全力打磨，钩子 + 人设 + 爽点 + 悬念四管齐下
- 4-10章：快速推进，每章有明确进展
- 11-30章：稳定节奏，开始铺设中长线伏笔
- 30章后：进入中长篇节奏

### 章节标题风格
- 通俗易懂，口语化优先，像普通人说话一样
- 参考网络小说风格：《斗破苍穹》《赘婿》那种接地气的
- 反面例子：龙啸九天、风云际会、江湖再见、岁月如梭（太文绉绉）
- 正面例子：拜师学艺、打败小BOSS、第一次赚钱、遇到麻烦、被骗了

## 【输出格式】请严格按照以下 Markdown 格式输出大纲

# 标题
[故事标题]

## 简介
[60-80字的核心冲突和主题，必须包含主角、目标、阻碍]

## 题材标签
- 标签1（必须是热门网文标签，如：穿越、系统流、玄幻、都市、修仙等）
- 标签2

## 字数预估
${wordCountRange}

## 核心卖点/爽点设计
[一句话说明本书的核心爽点是什么]
[这个爽点如何在章节中反复出现和升级]

## 四幕结构
### 第一幕：建置（10-15%）
[40-60字，介绍主角和世界观，建立读者代入感]
核心任务：
- 介绍主角现状和核心特质
- 建立世界观基础
- 抛出第一个冲突/危机

### 第二幕A：对抗（上）（25-30%）
[40-60字，主角遭遇冲突，尝试解决问题]
核心任务：
- 主角开始行动
- 引入第一个主要对手
- 金手指/核心能力首次展示

### 第二幕B：对抗（下）（40-45%）
[40-60字，冲突升级，主角成长]
核心任务：
- 冲突升级
- 主角获得成长
- 多个爽点释放

### 第三幕：结局（15-20%）
[40-60字，问题解决，核心悬念揭晓]
核心任务：
- 解决核心矛盾
- 揭晓核心悬念
- 留好结局钩子（如果有续作）

## 世界观设定
### 地点（列出3-5个核心地点）
- [地点名]：[描述15-30字，说明这个地点在故事中的作用]

### 势力（列出3-5个核心势力）
- [势力名]：[描述20字，说明势力间的利益关系]

### 规则/力量体系
- [规则名]：[描述20字]

## 角色（重点角色3-5个）
### [角色名]（主角/反派/导师/女主等）
[20-40字的角色描述，包括身份和核心特质]

### [角色名]
[20-40字]

## 章节大纲（每章必须包含：核心事件 + 章尾钩子）

### 第1章：章节标题
[一句话概括本章内容，说明本章要解决什么问题]
- 核心事件：[本章核心冲突/行动]
- 爽点安排：[本章有没有爽点]
- 章尾钩子：[本章结尾留什么钩子]

### 第2章：章节标题
[同上格式]

[继续列出章节，每章都按此格式]

## 伏笔布局
### 早期伏笔（1-10章埋下）
- [伏笔1]

### 中期伏笔（11-30章）
- [伏笔2]

### 长期伏笔（30章后或全篇）
- [伏笔3]

## 子情节（如有）
- [子情节1]

## 【输出要求】
1. 语言简洁，避免冗长描写
2. 严格遵循上述 Markdown 格式
3. 章节数控制在合理范围内（按字数预估）
4. 每个章节都要有明确的"核心事件"和"章尾钩子"
5. 章节标题要接地气，口语化
6. 确保有完整的伏笔布局`;
  }

  /**
   * 更新配置
   */
  updateConfig(
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) {
    this.apiKey = apiKey;
    if (baseUrl) this.baseUrl = baseUrl;
    if (model) this.model = model;
    this.initClient();
  }

  /**
   * 获取端点
   */
  getEndpoint(): string {
    return this.baseUrl;
  }

  /**
   * 获取请求头
   */
  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * 解析字数范围为数字
   */
  private parseWordCount(wordCountRange: string): number {
    // 匹配 "50万-100万字" 或 "50-100万字" 等格式
    const match = wordCountRange.match(/(\d+(?:\.\d+)?)\s*万/);
    if (match) {
      const wan = parseFloat(match[1]);
      // 如果有范围，取中间值
      if (wordCountRange.includes('-')) {
        return Math.round(wan * 5000); // 取范围中间值，估算为万字的0.5倍
      }
      return Math.round(wan * 10000);
    }
    // 默认返回50万字
    return 500000;
  }
}
