import type { OutlineDirection } from '../../types/direction';
import type { BuiltPrompt } from './shared';

const AVG_WORDS_PER_CHAPTER = 2500;

export interface ExpandDirectionPromptOptions {
  seed: string;
  direction: OutlineDirection;
  wordCountRange: string;
  enhancementBrief?: string;
}

function parseWordCount(wordCountRange: string): number {
  const normalized = wordCountRange.replace(/[,，\s]/g, '');
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)万?[-~至到](\d+(?:\.\d+)?)万?(?:字)?/);
  if (rangeMatch) {
    const minWan = parseFloat(rangeMatch[1]);
    const maxWan = parseFloat(rangeMatch[2]);
    return Math.round(((minWan + maxWan) / 2) * 10000);
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)万(?:字)?/);
  if (singleMatch) {
    return Math.round(parseFloat(singleMatch[1]) * 10000);
  }

  return 500000;
}

function buildScaleGuidance(wordCountRange: string) {
  const targetWordCount = parseWordCount(wordCountRange);
  const targetChapterCount = Math.max(60, Math.ceil(targetWordCount / AVG_WORDS_PER_CHAPTER));
  const suggestedVolumeCount = Math.max(3, Math.ceil(targetWordCount / 180000));
  const chaptersPerVolume = Math.max(20, Math.round(targetChapterCount / suggestedVolumeCount));

  return {
    targetWordCount,
    targetChapterCount,
    suggestedVolumeCount,
    chaptersPerVolume,
    averageWordsPerChapter: AVG_WORDS_PER_CHAPTER,
    startupRatio: Number((30 / targetChapterCount).toFixed(3)),
  };
}

const SYSTEM_PROMPT = `你是一名擅长中文长篇网文策划的资深故事架构师。现在用户已经从多个方向中选定了一个最值得展开的方向，你的任务是把它扩展成“可执行型长篇方案”。

注意：你的目标不是写成文学赏析稿，也不是写百科设定，而是产出一份适合继续拆卷纲、拆前30章、拆章节蓝图的工程化方案。

请优先满足以下要求：
1. 方案必须具备明确卖点、明确主角路径、明确冲突升级链
2. 方案必须适合长篇网文连载，强调前30章抓读者的能力
3. 所有模块都要服务“后续可继续写”，而不是只服务展示
4. 尽量少写空泛设定，多写冲突、目标、代价、升级、钩子
5. 不要生成完整章节目录，不要展开成100章梗概
6. 必须严格匹配目标字数区间对应的总章节规模，按“平均每章约2500字”估算总章节数，避免前30章就消耗完主线

请严格使用以下固定结构输出，并且字段名保持一致。

# 主方案

## 故事定位
- 标题：
- 一句话卖点：
- premise：
- 目标读者：
- 核心情绪：
- 卖点标签：
- 风格关键词：

## 核心驱动
- 主角姓名：
- 主角初始状态：
- 主角长期目标：
- 主角短期目标：
- 核心冲突：
- 冲突升级链：
- 失败代价：

## 故事规模规划
- 目标字数：
- 预计总章节数：
- 章节平均字数：
- 建议卷数：
- 每卷预计章节数：
- 前30章占比：
- 长线推进说明：

## 卷纲
### 第1卷
- 卷标题：
- 卷目标：
- 卷冲突：
- 卷高潮：
- 卷反转：
- 卷尾钩子：
- 主角成长：
- 关键角色：

### 第2卷
- 卷标题：
- 卷目标：
- 卷冲突：
- 卷高潮：
- 卷反转：
- 卷尾钩子：
- 主角成长：
- 关键角色：

### 第3卷
- 卷标题：
- 卷目标：
- 卷冲突：
- 卷高潮：
- 卷反转：
- 卷尾钩子：
- 主角成长：
- 关键角色：

## 前30章启动包
- 开篇钩子：
- 对读者的承诺：
- 主角第一印象：
- 第一次强记忆爽点：
- 第一轮冲突闭环：

### 1-5章
- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 节奏要求：
- 读者期待：

### 6-10章
- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 节奏要求：
- 读者期待：

### 11-15章
- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 节奏要求：
- 读者期待：

### 16-20章
- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 节奏要求：
- 读者期待：

### 21-25章
- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 节奏要求：
- 读者期待：

### 26-30章
- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 节奏要求：
- 读者期待：

## 关键角色
### 角色1
- 姓名：
- 角色定位：
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：

### 角色2
- 姓名：
- 角色定位：
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：

### 角色3
- 姓名：
- 角色定位：
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：

额外规则：
- 禁止输出 markdown 表格
- 禁止输出完整世界观百科
- 禁止输出完整章节目录
- “目标读者”“核心情绪”“卖点标签”“风格关键词”“关键角色”等字段可用顿号或分号分隔多个短语
- “冲突升级链”请用 3-5 个短语概括，按递进顺序表达
- 必须明确给出“主角姓名”，不能只写“主角”“少年”“她”“他”等泛称
- “关键角色”中必须包含主角本人，且“角色定位”必须明确写为“主角”
- “必出事件”“必出爽点”“必留钩子”尽量具体，不要空泛
- “节奏要求”只用“快”或“中快”
- 总体上更像一个可执行的故事工程方案，而不是抒情式长文
- 如果原始方向信息不足，请主动补足能支撑长篇网文连载的目标链、冲突链和卷级递进结构，但不要脱离已选方向的核心卖点。
- “故事规模规划”必须与目标字数区间一致；“预计总章节数”要按平均每章约2500字估算，误差尽量控制在±10%以内
- “前30章占比”必须体现为总章节数的前期启动比例，并在“长线推进说明”中解释为什么30章后仍有足够篇幅推进主线升级、地图扩展或人物关系递进。`;

export function buildExpandDirectionPrompt(options: ExpandDirectionPromptOptions): BuiltPrompt {
  const { direction, seed, wordCountRange } = options;
  const scale = buildScaleGuidance(wordCountRange);

  return {
    system: SYSTEM_PROMPT,
    user: `请将下面这个已选中的创作方向，展开为可执行型长篇方案。

【目标字数区间】
${wordCountRange}

【规模换算参考】
- 按平均每章约${scale.averageWordsPerChapter}字估算
- 目标总字数约${scale.targetWordCount}字
- 预计总章节数约${scale.targetChapterCount}章
- 建议卷数约${scale.suggestedVolumeCount}卷
- 每卷预计约${scale.chaptersPerVolume}章
- 前30章约占全书${Math.round(scale.startupRatio * 100)}%

【原始创意种子】
${seed}

【已选方向】
标题：${direction.title}
一句话卖点：${direction.oneLiner}
premise：${direction.premise}
主角成长路径：${direction.protagonistArc}
核心冲突：${direction.coreConflict}
爽点风格：${direction.coolPointStyle.join('；')}
目标情绪：${direction.targetEmotions.join('；')}
风险提示：${direction.riskNotes.join('；')}
长篇承载力：${direction.longformCapacityNote || '未提供'}
推荐理由：${direction.recommendedReason}

${options.enhancementBrief ? `【本次增强目标】
${options.enhancementBrief}

` : ''}要求：
1. 优先增强长篇承载力和网文追读动力
2. 把前30章设计成明确可执行的启动包
3. 三卷规划要彼此递进，不能重复
4. 尽量具体，不要空泛设定
5. 输出必须严格遵守指定结构
6. 章节规模必须与目标字数区间匹配，前30章只能完成“开局承诺 + 第一轮冲突闭环 + 更大主线入口”，不能提前耗尽整本书的核心悬念与升级空间
7. 如果提供了“本次增强目标”，必须优先落实这些增强项，重点补强地图扩张线、势力博弈线、人物关系变量、长期悬念中的缺口，但不能偏离当前方向核心卖点`,
  };
}
