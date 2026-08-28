import { z } from 'zod';

import type { StructuredAI } from '@/types/story-runtime';

export const READER_EVALUATION_VERSION = 'reader-eval-v1';

export type ReaderIssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReaderIssueCategory =
  | 'readability'
  | 'hook'
  | 'conflict'
  | 'emotion'
  | 'character'
  | 'payoff'
  | 'pacing'
  | 'dialogue'
  | 'originality'
  | 'continuity'
  | 'genre-promise'
  | 'repetition'
  | 'other';

export interface ReaderQualityIssue {
  id: string;
  severity: ReaderIssueSeverity;
  category: ReaderIssueCategory;
  location: string;
  description: string;
  evidence: string[];
  suggestion: string;
  blocking: boolean;
  confidence: number;
}

export interface ReaderOutlineDimensions {
  openingAttraction: number;
  coreSellingPoint: number;
  protagonistDrive: number;
  conflictEscalation: number;
  payoffPlanning: number;
  characterRelations: number;
  suspensePlanning: number;
  audienceFit: number;
}

export interface ReaderChapterDimensions {
  readability: number;
  openingHook: number;
  conflictEffectiveness: number;
  emotionalDrive: number;
  characterVoice: number;
  payoffValue: number;
  pacing: number;
  endingPull: number;
}

export interface ReaderWindowDimensions {
  mainlineProgress: number;
  patternVariation: number;
  suspensePayoff: number;
  characterArc: number;
  emotionalArc: number;
  payoffEscalation: number;
  genrePromise: number;
  continuationDesire: number;
}

export interface ReaderOutlineEvaluation {
  version: string;
  score: number;
  wouldStartReading: boolean;
  confidence: number;
  dimensions: ReaderOutlineDimensions;
  issues: ReaderQualityIssue[];
  summary: string;
}

export interface ReaderChapterEvaluation {
  version: string;
  chapter: number;
  score: number;
  continueReading: boolean;
  confidence: number;
  dimensions: ReaderChapterDimensions;
  issues: ReaderQualityIssue[];
  summary: string;
}

export interface ReaderWindowEvaluation {
  version: string;
  fromChapter: number;
  toChapter: number;
  score: number;
  continueReading: boolean;
  confidence: number;
  dimensions: ReaderWindowDimensions;
  issues: ReaderQualityIssue[];
  summary: string;
}

export interface ReaderEvaluationContext {
  title: string;
  genre: string;
  targetReader: string;
  positioning?: string;
}

export interface ReaderWindowChapter {
  chapter: number;
  title: string;
  summary?: string;
  head: string;
  tail: string;
  prose?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: unknown[]): string {
  return (
    values
      .find(value => typeof value === 'string' && value.trim())
      ?.toString()
      .trim() ?? ''
  );
}

function normalizeConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.7;
  return Math.min(1, Math.max(0, numeric > 1 ? numeric / 100 : numeric));
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return /^(?:1|true|yes|y|是|愿意|继续)$/iu.test(String(value ?? '').trim());
}

function normalizeSeverity(value: unknown): ReaderIssueSeverity {
  const text = String(value ?? '').toLowerCase();
  if (/critical|block|致命|阻断|严重/iu.test(text)) return 'critical';
  if (/high|高/iu.test(text)) return 'high';
  if (/low|低|轻微/iu.test(text)) return 'low';
  return 'medium';
}

function normalizeCategory(value: unknown): ReaderIssueCategory {
  const text = String(value ?? '').toLowerCase();
  const mappings: Array<[RegExp, ReaderIssueCategory]> = [
    [/read|可读|理解/iu, 'readability'],
    [/hook|钩子|追读|悬念/iu, 'hook'],
    [/conflict|冲突/iu, 'conflict'],
    [/emotion|情绪|情感/iu, 'emotion'],
    [/character|人物|角色/iu, 'character'],
    [/payoff|兑现|爽点|回报/iu, 'payoff'],
    [/pacing|节奏/iu, 'pacing'],
    [/dialogue|对话/iu, 'dialogue'],
    [/original|原创|套路/iu, 'originality'],
    [/continu|连贯|主线|伏笔/iu, 'continuity'],
    [/genre|题材|类型承诺/iu, 'genre-promise'],
    [/repeat|重复|同质/iu, 'repetition'],
  ];
  return mappings.find(([pattern]) => pattern.test(text))?.[1] ?? 'other';
}

function normalizeIssueInput(value: unknown): Record<string, unknown> {
  const issue = asRecord(value);
  // evidence 空串/空白项会让 issueSchema 的 min(1) 拒掉整份评审结果
  // （2026-08-28 r2 百章实测 1-5 窗口评审整体失败），此处先软兜底过滤；
  // 字符串形态（evidence/quote 直给一句）先包数组，避免丢给 zod 前被误清
  const rawEvidence = issue.evidence ?? issue.quote ?? issue.example ?? [];
  const evidence =
    typeof rawEvidence === 'string'
      ? [rawEvidence.trim()].filter(Boolean)
      : Array.isArray(rawEvidence)
        ? rawEvidence.map(item => String(item ?? '').trim()).filter(Boolean).slice(0, 3)
        : [];
  return {
    ...issue,
    severity: normalizeSeverity(issue.severity ?? issue.level),
    category: normalizeCategory(issue.category ?? issue.type),
    location: firstText(issue.location, issue.position, issue.scope, '全文'),
    description: firstText(
      issue.description,
      issue.problem,
      issue.issue,
      issue.reason,
      issue.detail,
      issue.message,
      '模型指出读者体验问题'
    ),
    evidence,
    suggestion: firstText(issue.suggestion, issue.advice, issue.fix),
    confidence: normalizeConfidence(issue.confidence),
  };
}

const scoreSchema = z.coerce.number().min(0).max(100);
const confidenceSchema = z.preprocess(normalizeConfidence, z.number().min(0).max(1));
const booleanSchema = z.preprocess(normalizeBoolean, z.boolean());
const issueSchema = z.preprocess(
  normalizeIssueInput,
  z.object({
    id: z.string().trim().optional().default(''),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.enum([
      'readability',
      'hook',
      'conflict',
      'emotion',
      'character',
      'payoff',
      'pacing',
      'dialogue',
      'originality',
      'continuity',
      'genre-promise',
      'repetition',
      'other',
    ]),
    location: z.string().trim().min(1),
    description: z.string().trim().min(1),
    evidence: z
      .preprocess(
        value => (typeof value === 'string' ? [value] : value),
        z.array(z.string().trim().min(1)).max(3)
      )
      .default([]),
    suggestion: z.string().trim().optional().default(''),
    blocking: z.boolean().optional().default(false),
    confidence: confidenceSchema.optional().default(0.7),
  })
);

const outlineResultSchema = z.object({
  dimensions: z.object({
    openingAttraction: scoreSchema,
    coreSellingPoint: scoreSchema,
    protagonistDrive: scoreSchema,
    conflictEscalation: scoreSchema,
    payoffPlanning: scoreSchema,
    characterRelations: scoreSchema,
    suspensePlanning: scoreSchema,
    audienceFit: scoreSchema,
  }),
  wouldStartReading: booleanSchema,
  confidence: confidenceSchema,
  issues: z.array(issueSchema).max(20),
  summary: z.string().trim().min(1),
});

const chapterResultSchema = z.object({
  dimensions: z.object({
    readability: scoreSchema,
    openingHook: scoreSchema,
    conflictEffectiveness: scoreSchema,
    emotionalDrive: scoreSchema,
    characterVoice: scoreSchema,
    payoffValue: scoreSchema,
    pacing: scoreSchema,
    endingPull: scoreSchema,
  }),
  continueReading: booleanSchema,
  confidence: confidenceSchema,
  issues: z.array(issueSchema).max(20),
  summary: z.string().trim().min(1),
});

const windowResultSchema = z.object({
  dimensions: z.object({
    mainlineProgress: scoreSchema,
    patternVariation: scoreSchema,
    suspensePayoff: scoreSchema,
    characterArc: scoreSchema,
    emotionalArc: scoreSchema,
    payoffEscalation: scoreSchema,
    genrePromise: scoreSchema,
    continuationDesire: scoreSchema,
  }),
  continueReading: booleanSchema,
  confidence: confidenceSchema,
  issues: z.array(issueSchema).max(20),
  summary: z.string().trim().min(1),
});

/** 顶层单元素数组拆包：个别模型把评审结果包成 [{…}] 返回（2026-08-28 终验
 *  ch21 实测整份章节评审被 zod 以 expected object 拒掉），校验前先拆包 */
function unwrapTopLevelArray(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

const OUTLINE_WEIGHTS: Record<keyof ReaderOutlineDimensions, number> = {
  openingAttraction: 0.15,
  coreSellingPoint: 0.15,
  protagonistDrive: 0.1,
  conflictEscalation: 0.15,
  payoffPlanning: 0.15,
  characterRelations: 0.1,
  suspensePlanning: 0.1,
  audienceFit: 0.1,
};

const CHAPTER_WEIGHTS: Record<keyof ReaderChapterDimensions, number> = {
  readability: 0.15,
  openingHook: 0.1,
  conflictEffectiveness: 0.15,
  emotionalDrive: 0.15,
  characterVoice: 0.1,
  payoffValue: 0.15,
  pacing: 0.1,
  endingPull: 0.1,
};

const WINDOW_WEIGHTS: Record<keyof ReaderWindowDimensions, number> = {
  mainlineProgress: 0.15,
  patternVariation: 0.1,
  suspensePayoff: 0.15,
  characterArc: 0.1,
  emotionalArc: 0.15,
  payoffEscalation: 0.15,
  genrePromise: 0.1,
  continuationDesire: 0.1,
};

function weightedScore<T extends Record<string, number>>(
  dimensions: T,
  weights: Record<keyof T, number>
): number {
  const total = (Object.keys(weights) as Array<keyof T>).reduce(
    (sum, key) => sum + dimensions[key] * weights[key],
    0
  );
  return Math.round(total * 10) / 10;
}

function normalizeIssue(issue: z.infer<typeof issueSchema>, index: number): ReaderQualityIssue {
  const safeCategory = issue.category.replace(/[^a-z-]/gu, '') || 'other';
  const suppliedId = issue.id.replace(/[^a-z0-9._-]/giu, '').toLowerCase();
  const stableId = suppliedId
    ? suppliedId.startsWith('reader.')
      ? suppliedId
      : `reader.${suppliedId}`
    : `reader.${safeCategory}-${index + 1}`;
  return {
    ...issue,
    id: stableId,
    blocking: issue.blocking || issue.severity === 'critical',
  };
}

function normalizeIssues(issues: Array<z.infer<typeof issueSchema>>): ReaderQualityIssue[] {
  return issues.map(normalizeIssue);
}

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headChars = Math.floor(maxChars * 0.65);
  const tailChars = maxChars - headChars;
  return `${text.slice(0, headChars)}\n\n……【中间内容因评审输入预算省略】……\n\n${text.slice(-tailChars)}`;
}

const COMMON_REVIEW_RULES = [
  `评审协议版本：${READER_EVALUATION_VERSION}`,
  '你是目标读者代表，不是写作模型的辩护者，也不是只查格式的校对员。',
  '判断读者实际获得的体验，不因文本出现“突然、震惊、问号、悬念”等关键词就认定钩子有效。',
  '慢热、悬疑公平性、人物可信度和题材惯例可以构成合理例外；不要把所有题材都按打脸爽文评判。',
  'critical 只用于：看不懂发生了什么、上章明确承诺完全不回应、连续剧情无推进、整章冲突真空等读者底线。',
  '所有 high/critical 问题必须提供输入中的原句证据；没有证据时降低严重度和置信度。',
  'issues 是事实源；不要输出 overallScore，总分由程序按固定权重计算。',
  '只输出 JSON，不要 Markdown，不要解释。',
].join('\n');

export class ReaderQualityJudge {
  constructor(private readonly ai: StructuredAI) {}

  async evaluateOutline(input: {
    context: ReaderEvaluationContext;
    outline: unknown;
  }): Promise<ReaderOutlineEvaluation> {
    const raw = await this.ai.generate({
      purpose: 'reader-outline-judge',
      schemaName: 'ReaderOutlineEvaluationV1',
      system: [
        COMMON_REVIEW_RULES,
        '从准备开书的真实读者角度评估整份大纲。重点检查黄金三章、核心卖点、主角驱动力、冲突升级、爽点/情绪回报、人物关系、悬念回收计划和目标读者匹配。',
        '输出字段：dimensions、wouldStartReading、confidence、issues、summary。dimensions 必须包含 openingAttraction/coreSellingPoint/protagonistDrive/conflictEscalation/payoffPlanning/characterRelations/suspensePlanning/audienceFit，均为0-100。',
      ].join('\n'),
      prompt: JSON.stringify({
        context: input.context,
        outline: clipText(JSON.stringify(input.outline), 60_000),
      }),
      parse: value => outlineResultSchema.parse(unwrapTopLevelArray(value)),
    });
    const parsed = outlineResultSchema.parse(unwrapTopLevelArray(raw));
    return {
      version: READER_EVALUATION_VERSION,
      score: weightedScore(parsed.dimensions, OUTLINE_WEIGHTS),
      wouldStartReading: parsed.wouldStartReading,
      confidence: parsed.confidence,
      dimensions: parsed.dimensions,
      issues: normalizeIssues(parsed.issues),
      summary: parsed.summary,
    };
  }

  async evaluateChapter(input: {
    context: ReaderEvaluationContext;
    chapter: number;
    title: string;
    previousTail?: string;
    prose: string;
  }): Promise<ReaderChapterEvaluation> {
    const raw = await this.ai.generate({
      purpose: 'reader-chapter-judge',
      schemaName: 'ReaderChapterEvaluationV1',
      system: [
        COMMON_REVIEW_RULES,
        '以连续追更读者视角评估单章，不重复合同履约检查。判断可读性、章首吸引力、冲突是否产生局势变化、情绪推动、人物声音、微兑现/爽点回报、节奏和章尾追读力。',
        '输出字段：dimensions、continueReading、confidence、issues、summary。dimensions 必须包含 readability/openingHook/conflictEffectiveness/emotionalDrive/characterVoice/payoffValue/pacing/endingPull，均为0-100。',
      ].join('\n'),
      prompt: JSON.stringify({
        context: input.context,
        chapter: input.chapter,
        title: input.title,
        previousTail: input.previousTail ? clipText(input.previousTail, 1_500) : undefined,
        prose: clipText(input.prose, 24_000),
      }),
      parse: value => chapterResultSchema.parse(unwrapTopLevelArray(value)),
    });
    const parsed = chapterResultSchema.parse(unwrapTopLevelArray(raw));
    return {
      version: READER_EVALUATION_VERSION,
      chapter: input.chapter,
      score: weightedScore(parsed.dimensions, CHAPTER_WEIGHTS),
      continueReading: parsed.continueReading,
      confidence: parsed.confidence,
      dimensions: parsed.dimensions,
      issues: normalizeIssues(parsed.issues),
      summary: parsed.summary,
    };
  }

  async evaluateWindow(input: {
    context: ReaderEvaluationContext;
    chapters: ReaderWindowChapter[];
  }): Promise<ReaderWindowEvaluation> {
    if (input.chapters.length === 0) {
      throw new Error('跨章读者评审至少需要一章');
    }
    const fromChapter = input.chapters[0].chapter;
    const toChapter = input.chapters[input.chapters.length - 1].chapter;
    const raw = await this.ai.generate({
      purpose: 'reader-window-judge',
      schemaName: 'ReaderWindowEvaluationV1',
      system: [
        COMMON_REVIEW_RULES,
        '以连续读完这一窗口的读者视角评估跨章体验。重点发现单章检查看不到的主线停滞、结构重复、悬念只挖不填、人物关系不动、情绪曲线平直、爽点没有升级和题材承诺丢失。',
        '输出字段：dimensions、continueReading、confidence、issues、summary。dimensions 必须包含 mainlineProgress/patternVariation/suspensePayoff/characterArc/emotionalArc/payoffEscalation/genrePromise/continuationDesire，均为0-100。',
      ].join('\n'),
      prompt: JSON.stringify({
        context: input.context,
        fromChapter,
        toChapter,
        chapters: input.chapters.map(chapter => ({
          ...chapter,
          prose: chapter.prose ? clipText(chapter.prose, 8_000) : undefined,
        })),
      }),
      parse: value => windowResultSchema.parse(unwrapTopLevelArray(value)),
    });
    const parsed = windowResultSchema.parse(unwrapTopLevelArray(raw));
    return {
      version: READER_EVALUATION_VERSION,
      fromChapter,
      toChapter,
      score: weightedScore(parsed.dimensions, WINDOW_WEIGHTS),
      continueReading: parsed.continueReading,
      confidence: parsed.confidence,
      dimensions: parsed.dimensions,
      issues: normalizeIssues(parsed.issues),
      summary: parsed.summary,
    };
  }
}
