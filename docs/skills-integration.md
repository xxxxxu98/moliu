# 墨流AI写作助手 — Skills 集成文档

> 本文档说明如何将 `skills/oh-story-claudecode-main` 中的网文写作方法论集成到墨流软件中。

---

## 1. 集成概述

### 1.1 集成目标

将专业的网文写作技法（来自 `oh-story-claudecode` skills）深度融入墨流的 AI 辅助写作流程，包括：

- **大纲生成**：利用八节点故事结构、章尾钩子等技法生成更专业的章节大纲
- **AI 续写**：在续写 prompt 中注入写作原则、爽点节奏公式、去AI味词表
- **去AI味**：自动检测并修复 AI 生成文本中的"AI味"
- **拆文分析**：分析爆款作品，学习写作技巧

### 1.2 核心文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/renderer/src/config/writing-knowledge.ts` | 写作知识库配置 |
| `src/renderer/src/services/writing/prompt-builder.ts` | Prompt 构建器（已增强） |
| `src/renderer/src/services/writing/de-ai-service.ts` | 去AI味服务 |
| `src/renderer/src/services/writing/text-analysis-service.ts` | 拆文分析服务 |
| `src/renderer/src/components/editor/AIPanel.vue` | AI 面板（已增加去AI味入口） |
| `src/renderer/src/components/home/InspirationPanel.vue` | 灵感面板（已增加拆文分析入口） |

---

## 2. 知识库配置

### 2.1 文件位置

`src/renderer/src/config/writing-knowledge.ts`

### 2.2 内容结构

```typescript
export const WRITING_PRINCIPLES = {
  outline: [...],  // 大纲生成原则
  chapter: [...],  // 章节写作原则
  hook: [...],     // 钩子技法原则
};

export const BANNED_WORDS = {
  level1: [...],   // 一级禁用词（出现即替换）
  level2: [...],   // 二级禁用词（高频出现才标记）
  patterns: [...], // 禁用句式模板
};

export const CHAPTER_END_HOOKS = [
  "紧急危机",
  "命运转折",
  // ... 共13种章尾钩子
];

export const CHAPTER_START_HOOKS = [
  "倒叙开场",
  "悬念前置",
  // ... 共7种章首钩子
];

export const EIGHT_NODES = [
  { name: "起始事件", ratio: "0%", keyPoints: [...] },
  // ... 八节点故事结构
];

export const PACE_FORMULAS = {
  microPerChapter: "每章至少1个微爽点",
  conflictPerThreeChapters: "每3章一个冲突",
  // ...
};
```

### 2.3 数据来源

数据提取自 `skills/oh-story-claudecode-main/` 下的各个 SKILL.md 和 references/*.md 文件：

- `skills/story-long-write/SKILL.md` → 大纲和写作原则
- `skills/story-long-write/references/hook-techniques.md` → 章尾/章首钩子
- `skills/story-long-write/references/outline-arrangement.md` → 八节点结构
- `skills/story-deslop/SKILL.md` → 去AI味方法论
- `skills/story-deslop/references/banned-words.md` → 禁用词表

---

## 3. Prompt 构建器增强

### 3.1 文件位置

`src/renderer/src/services/writing/prompt-builder.ts`

### 3.2 新增方法

| 方法名 | 说明 |
|--------|------|
| `getWritingPrinciples()` | 获取网文写作核心原则 |
| `getChapterEndHooks()` | 获取章尾钩子13式 |
| `getChapterStartHooks()` | 获取章首钩子7式 |
| `getPaceFormulas()` | 获取爽点节奏公式 |
| `getBannedWords()` | 获取AI味禁用词表 |
| `getEightNodesStructure()` | 获取八节点故事结构 |
| `buildAIDetectionPrompt()` | 构建AI味检测专用 prompt |

### 3.3 增强的 Prompt

#### 大纲生成 Prompt

现在包含：
- 网文写作核心原则
- 八节点故事结构
- 章节类型说明

#### 章节续写 Prompt

现在包含：
- 网文写作核心原则
- 章尾钩子13式
- 爽点节奏公式
- AI味禁用词表
- 章节类型对应的写作策略

#### 去AI味 Prompt

新增 `buildPolishPrompt(..., 'deai')` 模式：
- 包含禁用词表
- 包含具体去味操作步骤

---

## 4. 去AI味服务

### 4.1 文件位置

`src/renderer/src/services/writing/de-ai-service.ts`

### 4.2 核心功能

```typescript
class DeAIService {
  // 检测文本的AI味
  static async detect(text: string): Promise<DeAIDetectionResult>;

  // 自动修复文本的AI味（基于规则）
  static async fix(text: string): Promise<DeAIFixResult>;

  // 使用AI模型深度检测并修复
  static async detectAndFixWithAI(
    text: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<{ detection: DeAIDetectionResult; fixedContent: string }>;
}
```

### 4.3 检测维度

| 维度 | 说明 |
|------|------|
| `banned_word` | 禁用词（一级/二级） |
| `ai_pattern` | AI惯用句式 |
| `over_explanation` | 过度解释性描写 |
| `rhythm_issue` | 节奏问题（连续短句、排比） |

### 4.4 AI味等级

| 等级 | 说明 |
|------|------|
| `none` | 无AI味 |
| `mild` | 轻度 |
| `moderate` | 中度 |
| `severe` | 重度 |

---

## 5. 拆文分析服务

### 5.1 文件位置

`src/renderer/src/services/writing/text-analysis-service.ts`

### 5.2 核心功能

```typescript
class TextAnalysisService {
  // 执行文本分析
  static async analyze(
    input: TextAnalysisInput,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<TextAnalysisReport>;
}
```

### 5.3 分析维度

| 分析重点 | 说明 |
|----------|------|
| `golden3` | 黄金三章分析 |
| `structure` | 整体结构分析 |
| `character` | 人物架构分析 |
| `plot` | 情节设计分析 |
| `all` | 完整分析报告 |

### 5.4 输出报告结构

```typescript
interface TextAnalysisReport {
  basicInfo: {
    title: string;
    genre: string;
    estimatedChapters: number;
    estimatedWords: number;
  };
  goldenThreeChapters: GoldenChapterAnalysis[];
  characterArchitecture: CharacterAnalysis[];
  plotStructure: PlotStructureAnalysis;
  highlightDesign: HighlightDesign;
  writingTechniques: WritingTechniques;
  keyLearnings: string[];
}
```

---

## 6. UI 入口

### 6.1 AIPanel — 去AI味标签页

位置：`src/renderer/src/components/editor/AIPanel.vue`

新增标签页：**去AI味**

功能：
1. 选择编辑器文本
2. 检测AI味（显示问题统计）
3. 一键去味（自动修复）
4. 应用/复制修复结果

### 6.2 InspirationPanel — 拆文分析入口

位置：`src/renderer/src/components/home/InspirationPanel.vue`

新增功能区：**拆文分析**（位于灵感面板底部）

功能：
1. 输入书名和题材
2. 选择分析重点（全部/黄金三章/结构/人物/情节）
3. 粘贴原文内容
4. 生成结构化分析报告
5. 复制报告

---

## 7. 使用示例

### 7.1 大纲生成（已自动集成）

```typescript
const prompt = PromptBuilder.buildChapterOutlinePrompt(
  projectTitle,
  synopsis,
  chapterCount,
  wordsPerChapter,
  style,
  worldSetting,
  characters
);
// prompt 已包含八节点结构、写作原则等
```

### 7.2 章节续写（已自动集成）

```typescript
const prompt = PromptBuilder.buildChapterContinuePrompt(
  context,
  existingContent,
  targetWordCount,
  additionalInstructions
);
// prompt 已包含章尾钩子、爽点公式、禁用词表等
```

### 7.3 去AI味

```typescript
// 检测
const result = await DeAIService.detect(selectedText);
console.log(`AI味等级: ${result.level}`);
console.log(`问题数量: ${result.issues.length}`);

// 自动修复
const fixed = await DeAIService.fix(selectedText);
console.log(`修复 ${fixed.fixedCount} 处问题`);
```

### 7.4 拆文分析

```typescript
const report = await TextAnalysisService.analyze(
  {
    title: "斗破苍穹",
    content: "前三章原文...",
    mode: "quick",
    focus: "golden3",
    genre: "玄幻"
  },
  aiClient
);
```

---

## 8. 更新日志

### 2026-04-29

- ✅ 创建写作知识库配置文件 (`writing-knowledge.ts`)
- ✅ 增强 PromptBuilder，集成大纲生成方法论
- ✅ 增强 PromptBuilder，集成续写写作技法
- ✅ 创建去AI味检测服务 (`de-ai-service.ts`)
- ✅ 创建拆文分析服务 (`text-analysis-service.ts`)
- ✅ 新增去AI味功能入口到 AIPanel
- ✅ 新增拆文分析功能入口到 InspirationPanel
- ✅ 更新本文档

---

## 9. 后续优化建议

1. **更多钩子技法**：可继续从 references 文件中提取更多写作技法
2. **市场扫描**：集成 `story-long-scan` 的扫榜方法论
3. **短篇支持**：集成 `story-short-write` 的情感写法
4. **质量检查清单**：集成 `quality-checklist.md` 中的检查项

---

## 10. 参考资料

- [oh-story-claudecode Skills 文档](../../skills/oh-story-claudecode-main/README.md)
- [长篇写作技法](../../skills/oh-story-claudecode-main/skills/story-long-write/SKILL.md)
- [去AI味方法论](../../skills/oh-story-claudecode-main/skills/story-deslop/SKILL.md)
- [拆文分析技能](../../skills/oh-story-claudecode-main/skills/story-long-analyze/SKILL.md)
