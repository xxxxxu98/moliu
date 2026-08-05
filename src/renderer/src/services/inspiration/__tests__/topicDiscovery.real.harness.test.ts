/**
 * 开题中心 REAL AI 冒烟：六模块真实链路（与 smoke:continue-write:real:multi 同型）
 *
 *   npm run smoke:topic-discovery:real
 *
 * 覆盖模块（与开题中心 PlayModeSwitcher 六个 Tab 对齐）：
 *   seeds（灵感种子）/ radar（市场雷达）/ mix（元素混搭）/ dice（命运骰子）/
 *   twist（反套路）/ prompt（一句话开题）
 *
 * 每个模块走真实用户路径：种子（或提示）→ 方向生成（UnifiedOutlineGenerator.generate）
 * → 扩展大纲（expandDirection → ExecutableOutline）→ 应用映射（mapExecutableOutlineToGeneratedOutline），
 * 并做质量断言（开篇钩子长度、必出事件粒度、CBN/CEN 无「推进至」元指令等），
 * 防止「生成时返回的大纲」与「应用派生」再次产出不可续写的项目数据。
 *
 * AI 配置复用 temp/continue-write.real.config.json（resolveContinueWriteRealConfig）。
 *
 * 断言分级（P1-2）：
 *   - hard（任意模块出现即 FAIL）：outline 为 null、启动块为空、派生章节 < 3、
 *     CBN/CEN 含「推进至」元指令、必出事件括号未配对 —— 这些是结构性缺陷，
 *     续写端无法兜底。
 *   - soft（仅记录到 summary，不挂测试）：开篇钩子超长、必出事件过长 ——
 *     reviewer 本就设计了修正回路，单测不应让单点软问题拖垮 34 分钟的整批跑。
 *
 * 调试字段（P0-2）：summary 额外记录 expanded.warnings、reviewer 状态（从 warnings
 * 文案识别：触发/采用/回退/失败/未触发）、429 命中次数（监听 console）、
 * 真实 endpoint，失败时能直接定位根因而非只剩一个 issue 字符串。
 *
 * 模块拆分（P2）：六个模块拆成独立 it，单模块失败不影响其它模块跑完；
 * 每个 it 独立超时，summary 在 afterAll 聚合落盘。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPinia, setActivePinia } from 'pinia';
import { afterAll, describe, expect, it } from 'vitest';

import { AIServiceFactory } from '@/services/ai/factory';
import type { ProviderType } from '@/config/ai-providers';
import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import {
  buildPromptFromSeed,
  insightToSeedConstraints,
  refreshGenreInsights,
  refreshStorySeeds,
} from '@/services/inspiration/topic-discovery.service';
import type { StorySeedCard } from '@/types/topic-discovery';
import { useSettingsStore } from '@/stores/settings.store';
import { resolveContinueWriteRealConfig } from '@/services/writing/__tests__/continueWriteRealConfig';
import { isRealAiEnabled } from '@/services/writing/__tests__/realStructuredAI';

const WORD_COUNT_RANGE = '30万-60万';
/** 单模块超时：实测 ~280-440s（含 429 退避），留 2 倍余量 */
const MODULE_TIMEOUT = 900_000;

/** 软问题阈值（P1-1 统一）：与 outline-reviewer.OPENING_HOOK_LIMIT 对齐 */
const OPENING_HOOK_SOFT_LIMIT = 35;
const MUST_EVENT_SOFT_LIMIT = 40;

interface ModuleResult {
  module: string;
  seedTitle?: string;
  directionTitle?: string;
  chapters: number;
  openingHookLength: number;
  /** 硬问题（结构性缺陷，任意出现即 FAIL） */
  hardIssues: string[];
  /** 软问题（长度类，reviewer 有修正回路，仅记录不挂测试） */
  softIssues: string[];
  /** expandDirection 返回的 warnings（含 reviewer 触发/回退/失败文案） */
  expandWarnings: string[];
  /** reviewer 状态（从 expandWarnings 文案识别） */
  reviewerStatus: 'not-triggered' | 'applied' | 'reverted-no-improve' | 'reverted-parse-fail' | 'failed' | 'unknown';
  error?: string;
  aiMs: number;
  /** 该模块期间命中的 429 次数 */
  rateLimitedCount: number;
}

type ChatFn = (
  system: string,
  user: string,
  temperature: number,
  signal?: AbortSignal
) => Promise<string>;

/** 用 App 已存配置创建真实 AI chatFn（与 refreshStorySeeds 的 ChatFn 签名对齐） */
function createRealChatFn(cfg: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): ChatFn {
  const service = AIServiceFactory.createService(
    cfg.provider as ProviderType,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.model
  );
  return async (system, user, temperature, signal) => {
    const raw = await service.complete(user, { system, temperature, signal });
    return String(raw);
  };
}

/** 注入真实 AI 配置到 settingsStore（UnifiedOutlineGenerator.getAIConfig 依赖它） */
function injectSettingsStore(cfg: {
  providerId?: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): void {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.aiProviders = [
    {
      id: cfg.providerId ?? 'smoke-provider',
      name: 'smoke-real-ai',
      provider: cfg.provider as ProviderType,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      modelName: cfg.model ?? '',
      enabled: true,
    },
  ];
  settings.defaultModel = {
    providerId: cfg.providerId ?? 'smoke-provider',
    modelName: cfg.model ?? '',
  };
}

/**
 * 从 expandDirection 返回的 warnings 文案识别 reviewer 状态。
 * 文案来源：unified-generator.ts expandDirection + outline-reviewer.ts reviewAndFixOutline。
 */
function detectReviewerStatus(warnings: string[]): ModuleResult['reviewerStatus'] {
  if (!warnings || warnings.length === 0) return 'not-triggered';
  const text = warnings.join('\n');
  if (text.includes('大纲审查修正完成')) return 'applied';
  if (text.includes('修正稿质量未提升')) return 'reverted-no-improve';
  if (text.includes('修正稿无法解析')) return 'reverted-parse-fail';
  if (text.includes('大纲审查修正失败')) return 'failed';
  return 'unknown';
}

/**
 * 质量检查：分级产出 hard / soft issues。
 *
 * hard（结构性，续写端无法兜底）：
 *   - 开篇钩子为空
 *   - 必出事件括号未配对
 *   - CBN/CEN 含「推进至」元指令
 *   - 派生章节 < 3
 * soft（长度类，reviewer 有修正回路）：
 *   - 开篇钩子超长（> 45 字）
 *   - 必出事件过长（> 40 字）
 */
function collectQualityIssues(outline: ExecutableOutline): {
  hard: string[];
  soft: string[];
} {
  const hard: string[] = [];
  const soft: string[] = [];
  const pack = outline.startupPack30;

  if (!pack.openingHook) {
    hard.push('开篇钩子为空');
  } else if (pack.openingHook.length > OPENING_HOOK_SOFT_LIMIT) {
    soft.push(`开篇钩子过长（${pack.openingHook.length} 字 > ${OPENING_HOOK_SOFT_LIMIT}）：${pack.openingHook.slice(0, 30)}…`);
  }

  for (const block of pack.chapterBlocks) {
    const events = (block.mustEvents ?? []).map(e => (e ?? '').trim()).filter(Boolean);
    // 逐条判超长（soft）
    for (const event of events) {
      if (event.length > MUST_EVENT_SOFT_LIMIT) {
        soft.push(`[${block.range}] 必出事件过长（${event.length} 字 > ${MUST_EVENT_SOFT_LIMIT}）：${event.slice(0, 30)}…`);
      }
    }
    // block 级括号配对（hard）—— 与 outline-reviewer.inspectOutlineQuality 口径一致，
    // 区分"跨事件拆分"与"真漏括号"，summary 文案可直接定位问题类型
    const perEvent = events.map(text => ({
      opens: (text.match(/（/gu) ?? []).length,
      closes: (text.match(/）/gu) ?? []).length,
      text,
    }));
    const unbalanced = perEvent.filter(s => s.opens !== s.closes);
    if (unbalanced.length > 0) {
      const totalOpens = perEvent.reduce((sum, s) => sum + s.opens, 0);
      const totalCloses = perEvent.reduce((sum, s) => sum + s.closes, 0);
      const isCrossEvent = totalOpens === totalCloses && totalOpens > 0;
      const hint = isCrossEvent
        ? `括号跨事件拆分（block 合并后配平，须把括号内容并入同一条或删除括号）`
        : `括号未配对（block 合并后仍不匹配）`;
      for (const s of unbalanced) {
        hard.push(`[${block.range}] 必出事件${hint}：${s.text.slice(0, 30)}…`);
      }
    }
  }

  const generated = mapExecutableOutlineToGeneratedOutline(outline, {
    targetWordCountRange: WORD_COUNT_RANGE,
  });
  for (const chapter of generated.chapters) {
    if ((chapter.CBN ?? '').includes('推进至')) {
      hard.push(`[${chapter.title}] CBN 含「推进至」元指令`);
    }
    if ((chapter.CEN ?? '').includes('推进至')) {
      hard.push(`[${chapter.title}] CEN 含「推进至」元指令`);
    }
  }
  if (generated.chapters.length < 3) {
    hard.push(`派生章节过少（${generated.chapters.length} < 3）`);
  }

  return { hard, soft };
}

/**
 * 安装 429 计数器：监听 console.warn/error 中的限流文案，
 * 返回 [计数, 卸载函数]。用于诊断 provider 限流是否拖慢整体耗时。
 */
function installRateLimitCounter(): [() => number, () => void] {
  let count = 0;
  const originalWarn = console.warn;
  const originalError = console.error;
  const RATE_LIMIT_RE = /\b429\b|Too Many Requests|rate.?limit/iu;
  const wrapper = (...args: unknown[]): void => {
    const text = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
    if (RATE_LIMIT_RE.test(text)) count += 1;
  };
  console.warn = wrapper as typeof console.warn;
  console.error = wrapper as typeof console.error;
  return [
    () => count,
    () => {
      console.warn = originalWarn;
      console.error = originalError;
    },
  ];
}

/** 单模块真实链路：种子（可选）→ 方向 → 扩展大纲 → 应用映射 */
async function runModule(
  module: string,
  seed: StorySeedCard | null,
  promptText: string,
  chatFn: ChatFn,
  generator: UnifiedOutlineGenerator
): Promise<ModuleResult> {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[REAL_AI_TOPIC] module=${module} 开始...`);
  const result: ModuleResult = {
    module,
    chapters: 0,
    openingHookLength: 0,
    hardIssues: [],
    softIssues: [],
    expandWarnings: [],
    reviewerStatus: 'not-triggered',
    aiMs: 0,
    rateLimitedCount: 0,
  };

  const [getRateLimitedCount, uninstallCounter] = installRateLimitCounter();
  try {
    const prompt = seed ? buildPromptFromSeed(seed) : promptText;
    result.seedTitle = seed?.title;

    // 每个模块独立 trace 文件，含时间戳避免覆盖
    const traceRunId = `outline-topic-${module}-${Date.now()}`;

    const genResult = await generator.generateDirections(prompt, {
      count: 1,
      wordCountRange: WORD_COUNT_RANGE,
      maxRetries: 2,
      trace: { runId: traceRunId, model: cfg.model, provider: cfg.provider },
    });
    expect(genResult.directions.length, `[${module}] 方向生成失败`).toBeGreaterThan(0);
    const direction = genResult.directions[0];
    result.directionTitle = direction.title;

    const expanded = await generator.expandDirection(prompt, direction, {
      wordCountRange: WORD_COUNT_RANGE,
      maxRetries: 2,
      trace: { runId: traceRunId, model: cfg.model, provider: cfg.provider },
    });
    expect(expanded.outline, `[${module}] 扩展大纲失败`).not.toBeNull();
    const outline = expanded.outline!;
    expect(outline.startupPack30.chapterBlocks.length, `[${module}] 启动块为空`).toBeGreaterThan(0);

    result.openingHookLength = outline.startupPack30.openingHook?.length ?? 0;
    result.chapters = mapExecutableOutlineToGeneratedOutline(outline, {
      targetWordCountRange: WORD_COUNT_RANGE,
    }).chapters.length;
    const issues = collectQualityIssues(outline);
    result.hardIssues = issues.hard;
    result.softIssues = issues.soft;
    result.expandWarnings = expanded.warnings ?? [];
    result.reviewerStatus = detectReviewerStatus(result.expandWarnings);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    uninstallCounter();
  }
  result.rateLimitedCount = getRateLimitedCount();
  result.aiMs = Date.now() - startedAt;
  // eslint-disable-next-line no-console
  console.log(
    `[REAL_AI_TOPIC] module=${module} 完成 aiMs=${result.aiMs} 429=${result.rateLimitedCount} ` +
      `hard=${result.hardIssues.length} soft=${result.softIssues.length} ` +
      `reviewer=${result.reviewerStatus} error=${result.error ?? '-'}`
  );
  return result;
}

// 六模块共享的上下文（resolveContinueWriteRealConfig 只读一次，结果聚合到 moduleResults）
const cfg = resolveContinueWriteRealConfig();
injectSettingsStore(cfg);
const chatFn = createRealChatFn(cfg);
const generator = new UnifiedOutlineGenerator({ temperature: 0.7, topP: 0.9, maxRetries: 2 });
const moduleResults: ModuleResult[] = [];

describe.skipIf(!isRealAiEnabled())('开题中心 REAL AI · 六模块真实链路', () => {
  afterAll(async () => {
    // 等待所有 trace 落盘完成（P1-2：失败排查用）
    await generator.flushTrace();
    // 汇总落盘（无论成功失败都保留，便于排查）
    const summary = {
      at: new Date().toISOString(),
      provider: cfg.provider,
      providerId: cfg.providerId,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      wordCountRange: WORD_COUNT_RANGE,
      modules: moduleResults,
      hardFailCount: moduleResults.filter(r => r.hardIssues.length > 0 || r.error).length,
      softIssueCount: moduleResults.reduce((sum, r) => sum + r.softIssues.length, 0),
      totalRateLimited: moduleResults.reduce((sum, r) => sum + r.rateLimitedCount, 0),
      totalAiMs: moduleResults.reduce((sum, r) => sum + r.aiMs, 0),
    };
    const summaryPath = join(process.cwd(), 'temp', 'topic-discovery.real.summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[REAL_AI_TOPIC] summary=${summaryPath}`);
    for (const item of moduleResults) {
      // eslint-disable-next-line no-console
      console.log(
        `[REAL_AI_TOPIC] module=${item.module} seed=${item.seedTitle ?? '-'} dir=${item.directionTitle ?? '-'} ` +
          `chapters=${item.chapters} hookLen=${item.openingHookLength} ` +
          `hard=${item.hardIssues.length} soft=${item.softIssues.length} ` +
          `reviewer=${item.reviewerStatus} 429=${item.rateLimitedCount} ` +
          `error=${item.error ?? '-'} aiMs=${item.aiMs}`
      );
      for (const issue of item.hardIssues) {
        // eslint-disable-next-line no-console
        console.log(`  ✗ [${item.module}] ${issue}`);
      }
      for (const issue of item.softIssues) {
        // eslint-disable-next-line no-console
        console.log(`  ⚠ [${item.module}] ${issue}`);
      }
      for (const warn of item.expandWarnings) {
        // eslint-disable-next-line no-console
        console.log(`  ℹ [${item.module}] ${warn}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[REAL_AI_TOPIC] 汇总 hardFail=${summary.hardFailCount} softIssues=${summary.softIssueCount} ` +
        `total429=${summary.totalRateLimited} totalAiMs=${summary.totalAiMs}`
    );
  }, 60_000);

  // 1) 灵感种子（standard）
  it(
    'seeds：灵感种子 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const seeds = await refreshStorySeeds({ count: 3, playStyle: 'standard' }, chatFn);
      expect(seeds.source, '[seeds] 未命中真实 AI（回退本地池）').toBe('ai');
      const result = await runModule('seeds', seeds.items[0] ?? null, '', chatFn, generator);
      moduleResults.push(result);
      expect(result.error, '[seeds] 模块异常').toBeUndefined();
      expect(result.hardIssues, '[seeds] 硬性问题').toEqual([]);
    },
    MODULE_TIMEOUT
  );

  // 2) 市场雷达 → 洞察 → 种子
  it(
    'radar：市场雷达 → 洞察 → 种子 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const insights = await refreshGenreInsights({ count: 3 }, chatFn);
      expect(insights.source, '[radar] 未命中真实 AI（回退本地池）').toBe('ai');
      const radarSeed = await refreshStorySeeds(
        insightToSeedConstraints(insights.items[0]),
        chatFn
      );
      expect(radarSeed.source, '[radar] 洞察转种子未命中真实 AI').toBe('ai');
      const result = await runModule('radar', radarSeed.items[0] ?? null, '', chatFn, generator);
      moduleResults.push(result);
      expect(result.error, '[radar] 模块异常').toBeUndefined();
      expect(result.hardIssues, '[radar] 硬性问题').toEqual([]);
    },
    MODULE_TIMEOUT
  );

  // 3) 元素混搭
  it(
    'mix：元素混搭 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const mix = await refreshStorySeeds(
        { count: 3, playStyle: 'mix', mixTags: ['悬疑', '都市'], mixElements: ['直播', '鉴宝'] },
        chatFn
      );
      expect(mix.source, '[mix] 未命中真实 AI（回退本地池）').toBe('ai');
      const result = await runModule('mix', mix.items[0] ?? null, '', chatFn, generator);
      moduleResults.push(result);
      expect(result.error, '[mix] 模块异常').toBeUndefined();
      expect(result.hardIssues, '[mix] 硬性问题').toEqual([]);
    },
    MODULE_TIMEOUT
  );

  // 4) 命运骰子
  it(
    'dice：命运骰子 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const dice = await refreshStorySeeds(
        {
          count: 3,
          playStyle: 'dice',
          diceRoll: { genre: '悬疑灵异', hook: '穿越成仵作', twist: '现代法医知识碾压' },
        },
        chatFn
      );
      expect(dice.source, '[dice] 未命中真实 AI（回退本地池）').toBe('ai');
      const result = await runModule('dice', dice.items[0] ?? null, '', chatFn, generator);
      moduleResults.push(result);
      expect(result.error, '[dice] 模块异常').toBeUndefined();
      expect(result.hardIssues, '[dice] 硬性问题').toEqual([]);
    },
    MODULE_TIMEOUT
  );

  // 5) 反套路
  it(
    'twist：反套路 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const twist = await refreshStorySeeds({ count: 3, playStyle: 'twist' }, chatFn);
      expect(twist.source, '[twist] 未命中真实 AI（回退本地池）').toBe('ai');
      const result = await runModule('twist', twist.items[0] ?? null, '', chatFn, generator);
      moduleResults.push(result);
      expect(result.error, '[twist] 模块异常').toBeUndefined();
      expect(result.hardIssues, '[twist] 硬性问题').toEqual([]);
    },
    MODULE_TIMEOUT
  );

  // 6) 一句话开题（无种子，直接提示）
  it(
    'prompt：一句话开题 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const result = await runModule(
        'prompt',
        null,
        '都市降妖人+直播打假：男主是体制内特勤，用科学手段拆穿民间灵异骗局，长篇爽文。',
        chatFn,
        generator
      );
      moduleResults.push(result);
      expect(result.error, '[prompt] 模块异常').toBeUndefined();
      expect(result.hardIssues, '[prompt] 硬性问题').toEqual([]);
    },
    MODULE_TIMEOUT
  );
});
