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
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

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

interface ModuleResult {
  module: string;
  seedTitle?: string;
  directionTitle?: string;
  chapters: number;
  openingHookLength: number;
  qualityIssues: string[];
  error?: string;
  aiMs: number;
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

/** 质量检查：开篇钩子长度、必出事件粒度、括号配对 */
function collectQualityIssues(outline: ExecutableOutline): string[] {
  const issues: string[] = [];
  const pack = outline.startupPack30;

  if (pack.openingHook && pack.openingHook.length > 45) {
    issues.push(`开篇钩子过长（${pack.openingHook.length} 字 > 45）：${pack.openingHook.slice(0, 30)}…`);
  }
  if (!pack.openingHook) {
    issues.push('开篇钩子为空');
  }

  for (const block of pack.chapterBlocks) {
    for (const event of block.mustEvents ?? []) {
      if (event.length > 40) {
        issues.push(`[${block.range}] 必出事件过长（${event.length} 字 > 40）：${event.slice(0, 30)}…`);
      }
      const opens = (event.match(/（/g) ?? []).length;
      const closes = (event.match(/）/g) ?? []).length;
      if (opens !== closes) {
        issues.push(`[${block.range}] 必出事件括号未配对：${event.slice(0, 30)}…`);
      }
    }
  }

  const generated = mapExecutableOutlineToGeneratedOutline(outline, {
    targetWordCountRange: WORD_COUNT_RANGE,
  });
  for (const chapter of generated.chapters) {
    if ((chapter.CBN ?? '').includes('推进至')) {
      issues.push(`[${chapter.title}] CBN 含「推进至」元指令`);
    }
    if ((chapter.CEN ?? '').includes('推进至')) {
      issues.push(`[${chapter.title}] CEN 含「推进至」元指令`);
    }
  }
  if (generated.chapters.length < 3) {
    issues.push(`派生章节过少（${generated.chapters.length} < 3）`);
  }

  return issues;
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
  const result: ModuleResult = {
    module,
    chapters: 0,
    openingHookLength: 0,
    qualityIssues: [],
    aiMs: 0,
  };
  try {
    const prompt = seed ? buildPromptFromSeed(seed) : promptText;
    result.seedTitle = seed?.title;

    const genResult = await generator.generateDirections(prompt, {
      count: 1,
      wordCountRange: WORD_COUNT_RANGE,
      maxRetries: 2,
    });
    expect(genResult.directions.length, `[${module}] 方向生成失败`).toBeGreaterThan(0);
    const direction = genResult.directions[0];
    result.directionTitle = direction.title;

    const expanded = await generator.expandDirection(prompt, direction, {
      wordCountRange: WORD_COUNT_RANGE,
      maxRetries: 2,
    });
    expect(expanded.outline, `[${module}] 扩展大纲失败`).not.toBeNull();
    const outline = expanded.outline!;
    expect(outline.startupPack30.chapterBlocks.length, `[${module}] 启动块为空`).toBeGreaterThan(0);

    result.openingHookLength = outline.startupPack30.openingHook?.length ?? 0;
    result.chapters = mapExecutableOutlineToGeneratedOutline(outline, {
      targetWordCountRange: WORD_COUNT_RANGE,
    }).chapters.length;
    result.qualityIssues = collectQualityIssues(outline);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  result.aiMs = Date.now() - startedAt;
  return result;
}

describe.skipIf(!isRealAiEnabled())('开题中心 REAL AI · 六模块真实链路', () => {
  it(
    '六模块：种子/雷达/混搭/骰子/反套路/一句话 → 方向 → 扩展大纲（真实 AI）',
    async () => {
      const cfg = resolveContinueWriteRealConfig();
      injectSettingsStore(cfg);

      const chatFn = createRealChatFn(cfg);
      const generator = new UnifiedOutlineGenerator({ temperature: 0.7, topP: 0.9, maxRetries: 2 });

      const results: ModuleResult[] = [];

      // 1) 灵感种子（standard）
      const seeds = await refreshStorySeeds({ count: 3, playStyle: 'standard' }, chatFn);
      expect(seeds.source, '[seeds] 未命中真实 AI（回退本地池）').toBe('ai');
      results.push(await runModule('seeds', seeds.items[0] ?? null, '', chatFn, generator));

      // 2) 市场雷达 → 洞察 → 种子
      const insights = await refreshGenreInsights({ count: 3 }, chatFn);
      expect(insights.source, '[radar] 未命中真实 AI（回退本地池）').toBe('ai');
      const radarSeed = await refreshStorySeeds(
        insightToSeedConstraints(insights.items[0]),
        chatFn
      );
      expect(radarSeed.source, '[radar] 洞察转种子未命中真实 AI').toBe('ai');
      results.push(await runModule('radar', radarSeed.items[0] ?? null, '', chatFn, generator));

      // 3) 元素混搭
      const mix = await refreshStorySeeds(
        { count: 3, playStyle: 'mix', mixTags: ['悬疑', '都市'], mixElements: ['直播', '鉴宝'] },
        chatFn
      );
      expect(mix.source, '[mix] 未命中真实 AI（回退本地池）').toBe('ai');
      results.push(await runModule('mix', mix.items[0] ?? null, '', chatFn, generator));

      // 4) 命运骰子
      const dice = await refreshStorySeeds(
        {
          count: 3,
          playStyle: 'dice',
          diceRoll: { genre: '悬疑灵异', hook: '穿越成仵作', twist: '现代法医知识碾压' },
        },
        chatFn
      );
      expect(dice.source, '[dice] 未命中真实 AI（回退本地池）').toBe('ai');
      results.push(await runModule('dice', dice.items[0] ?? null, '', chatFn, generator));

      // 5) 反套路
      const twist = await refreshStorySeeds({ count: 3, playStyle: 'twist' }, chatFn);
      expect(twist.source, '[twist] 未命中真实 AI（回退本地池）').toBe('ai');
      results.push(await runModule('twist', twist.items[0] ?? null, '', chatFn, generator));

      // 6) 一句话开题（无种子，直接提示）
      results.push(
        await runModule(
          'prompt',
          null,
          '都市降妖人+直播打假：男主是体制内特勤，用科学手段拆穿民间灵异骗局，长篇爽文。',
          chatFn,
          generator
        )
      );

      // 汇总落盘（失败模块也保留，便于排查）
      const summary = {
        at: new Date().toISOString(),
        provider: cfg.provider,
        model: cfg.model,
        wordCountRange: WORD_COUNT_RANGE,
        modules: results,
      };
      const summaryPath = join(process.cwd(), 'temp', 'topic-discovery.real.summary.json');
      writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[REAL_AI_TOPIC] summary=${summaryPath}`);
      for (const item of results) {
        // eslint-disable-next-line no-console
        console.log(
          `[REAL_AI_TOPIC] module=${item.module} seed=${item.seedTitle ?? '-'} dir=${item.directionTitle ?? '-'} ` +
            `chapters=${item.chapters} hookLen=${item.openingHookLength} ` +
            `issues=${item.qualityIssues.length} error=${item.error ?? '-'} aiMs=${item.aiMs}`
        );
        for (const issue of item.qualityIssues) {
          // eslint-disable-next-line no-console
          console.log(`  ⚠ [${item.module}] ${issue}`);
        }
      }

      // 断言：全部模块无错误、无质量问题
      const failed = results.filter(item => item.error);
      expect(failed.map(item => `[${item.module}] ${item.error}`).join('\n'), '存在失败的模块').toBe('');
      for (const item of results) {
        expect(item.qualityIssues, `[${item.module}] 大纲质量检查`).toEqual([]);
      }
    },
    1_500_000
  );
});
