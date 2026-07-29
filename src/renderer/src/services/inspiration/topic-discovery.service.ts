/**
 * 开题中心服务：AI 刷新灵感种子 / 题材洞察，失败时本地降级
 */

import { robustJsonParse } from '@/utils/json-parser';
import { genreTrends } from '@/data/market-trends';
import { genreTags } from '@/data/inspirations';
import { useSettingsStore } from '@/stores/settings.store';
import { AIServiceFactory } from '@/services/ai/factory';
import { getBaseUrl, type ProviderType } from '@/config/ai-providers';
import {
  buildGenreInsightsSystemPrompt,
  buildGenreInsightsUserPrompt,
  buildStorySeedsSystemPrompt,
  buildStorySeedsUserPrompt,
} from './prompts/topic-discovery-prompts';
import type {
  GenreInsightCard,
  GenreLifecycleHint,
  RefreshGenreInsightsOptions,
  RefreshStorySeedsOptions,
  RiskLevel,
  StorySeedCard,
  TopicAudience,
  TopicDiscoveryBatch,
} from '@/types/topic-discovery';

const DEFAULT_SEED_COUNT = 4;
const DEFAULT_INSIGHT_COUNT = 4;
const DEFAULT_TEMPERATURE = 0.9;

type ChatFn = (system: string, user: string, temperature: number) => Promise<string>;

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAudience(value: unknown): TopicAudience {
  if (value === 'male' || value === 'female' || value === 'general') {
    return value;
  }
  return 'general';
}

function normalizeLifecycle(value: unknown): GenreLifecycleHint {
  const allowed: GenreLifecycleHint[] = [
    'emerging',
    'rising',
    'peak',
    'declining',
    'saturated',
  ];
  if (typeof value === 'string' && allowed.includes(value as GenreLifecycleHint)) {
    return value as GenreLifecycleHint;
  }
  return 'rising';
}

function normalizeRisk(value: unknown): RiskLevel {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return 'medium';
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 解析 AI 返回的灵感种子（导出供单测） */
export function parseStorySeeds(raw: string, count: number = DEFAULT_SEED_COUNT): StorySeedCard[] {
  const parsed = robustJsonParse<{ seeds?: unknown[] }>(raw, {
    expectedType: 'object',
    enableCompletion: true,
  });

  if (!parsed.success || !parsed.data) {
    return [];
  }

  const list = Array.isArray(parsed.data.seeds) ? parsed.data.seeds : [];
  const seeds: StorySeedCard[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? '').trim();
    const oneLiner = String(row.oneLiner ?? row.one_liner ?? '').trim();
    if (!title || !oneLiner) continue;

    seeds.push({
      id: createId('seed'),
      title,
      oneLiner,
      genre: String(row.genre ?? '都市').trim() || '都市',
      hook: String(row.hook ?? '').trim() || oneLiner.slice(0, 40),
      coolPoint: String(row.coolPoint ?? row.cool_point ?? '').trim() || '期待兑现',
      audience: normalizeAudience(row.audience),
      riskNote: row.riskNote ? String(row.riskNote) : undefined,
    });

    if (seeds.length >= count) break;
  }

  return seeds;
}

/** 解析 AI 返回的题材洞察（导出供单测） */
export function parseGenreInsights(
  raw: string,
  count: number = DEFAULT_INSIGHT_COUNT,
): GenreInsightCard[] {
  const parsed = robustJsonParse<{ insights?: unknown[] }>(raw, {
    expectedType: 'object',
    enableCompletion: true,
  });

  if (!parsed.success || !parsed.data) {
    return [];
  }

  const list = Array.isArray(parsed.data.insights) ? parsed.data.insights : [];
  const insights: GenreInsightCard[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) continue;

    const hotTags = Array.isArray(row.hotTags)
      ? row.hotTags.map((t) => String(t)).filter(Boolean).slice(0, 4)
      : [];

    insights.push({
      id: createId('insight'),
      name,
      lifecycle: normalizeLifecycle(row.lifecycle),
      audience: normalizeAudience(row.audience),
      reason: String(row.reason ?? '').trim() || '市场仍有讨论度',
      opportunity: String(row.opportunity ?? '').trim() || '找准差异化切入点再开题',
      hotTags: hotTags.length > 0 ? hotTags : [name],
      riskLevel: normalizeRisk(row.riskLevel),
      riskNote: row.riskNote ? String(row.riskNote) : undefined,
    });

    if (insights.length >= count) break;
  }

  return insights;
}

const TWIST_SUFFIXES = ['破局', '反向', '翻盘', '代价', '错位'] as const;
const STANDARD_SUFFIXES = ['逆袭', '觉醒', '重生', '破局', '登顶'] as const;

/** 本地降级：从静态数据拼装灵感种子 */
export function buildFallbackStorySeeds(
  options: RefreshStorySeedsOptions = {},
): StorySeedCard[] {
  const count = options.count ?? DEFAULT_SEED_COUNT;
  const exclude = new Set((options.excludeTitles ?? []).map((t) => t.toLowerCase()));
  const playStyle = options.playStyle ?? 'standard';
  const lockedGenre =
    options.lockedSlots?.genre ||
    options.genre ||
    options.diceRoll?.genre ||
    options.mixTags?.[0];
  const lockedAudience = options.lockedSlots?.audience || options.audience || 'general';
  const mixHint =
    [...(options.mixTags ?? []), ...(options.mixElements ?? [])].filter(Boolean).join('×') ||
    '';
  const dice = options.diceRoll;

  const preferred = lockedGenre
    ? genreTags.filter((tag) => tag.name === lockedGenre || tag.name.includes(lockedGenre))
    : genreTags;
  const pool = shuffle(preferred.length > 0 ? preferred : genreTags);
  const suffixes = playStyle === 'twist' ? TWIST_SUFFIXES : STANDARD_SUFFIXES;

  const seeds: StorySeedCard[] = [];
  for (const tag of pool) {
    const title = `${tag.name}·${suffixes[seeds.length % suffixes.length]}`;
    if (exclude.has(title.toLowerCase())) continue;

    let oneLiner = `在${tag.name}世界里，主角凭借${tag.description || '独特机遇'}撕开困境，从被低估走向掌控全局。`;
    let hook = `开篇即陷入${tag.name}核心冲突，立刻给出反差与悬念`;
    let coolPoint = '身份/能力反转带来的打脸兑现';

    if (playStyle === 'twist') {
      oneLiner = `看似经典的${tag.name}开局，却在读者期待打脸时突然翻盘：主角必须用「不按套路」的方式赢得第一次胜利。`;
      hook = '先诱导套路期待，再在关键节点反向兑现';
      coolPoint = '破梗后的新期待被持续放大';
    } else if (playStyle === 'mix' && mixHint) {
      oneLiner = `把「${mixHint}」硬核碰撞：主角在${tag.name}背景下被迫同时消化互相冲突的设定，靠第一次漂亮翻盘站稳脚跟。`;
      hook = `开篇三章同时抛出混搭冲突：${mixHint}`;
      coolPoint = '混搭元素化学反应带来的独特爽感';
    } else if (playStyle === 'dice' && dice) {
      oneLiner = `【${dice.genre}】世界里，以「${dice.hook}」开篇，并植入「${dice.twist}」：主角必须在第一次危机中兑现差异化优势。`;
      hook = dice.hook;
      coolPoint = `${dice.twist}带来的持续爽点`;
    }

    seeds.push({
      id: createId('seed-fb'),
      title,
      oneLiner,
      genre: lockedGenre || tag.name,
      hook,
      coolPoint,
      audience: lockedAudience,
      riskNote: '离线降级灵感，建议配置 AI 后刷新获得更多样点子',
    });
    if (seeds.length >= count) break;
  }

  while (seeds.length < count) {
    seeds.push({
      id: createId('seed-fb'),
      title: `开题火花 ${seeds.length + 1}`,
      oneLiner:
        dice != null
          ? `【${dice.genre}】以「${dice.hook}」开场，意外设定「${dice.twist}」改写命运。`
          : '普通人意外卷入超常事件，必须在有限时间内完成第一次漂亮翻盘。',
      genre: lockedGenre || dice?.genre || '都市',
      hook: dice?.hook || '开篇三章给足危机与第一次小兑现',
      coolPoint: dice?.twist || '信息差打脸',
      audience: lockedAudience,
      riskNote: '离线降级灵感',
    });
  }

  return seeds;
}

/** 本地降级：从 market-trends 拼装题材洞察 */
export function buildFallbackGenreInsights(
  options: RefreshGenreInsightsOptions = {},
): GenreInsightCard[] {
  const count = options.count ?? DEFAULT_INSIGHT_COUNT;
  const exclude = new Set((options.excludeNames ?? []).map((n) => n.toLowerCase()));
  const audience = options.audience || 'general';

  const pool = shuffle(genreTrends).filter((t) => !exclude.has(t.name.toLowerCase()));

  return pool.slice(0, count).map((trend) => ({
    id: createId('insight-fb'),
    name: trend.name,
    lifecycle: trend.lifecycle,
    audience,
    reason: trend.description,
    opportunity: trend.suggestion,
    hotTags: trend.hotTags.slice(0, 4),
    riskLevel: trend.riskLevel,
    riskNote: '离线题材数据，配置 AI 后可刷新生成新风向',
  }));
}

function hasActiveProvider(): boolean {
  const settingsStore = useSettingsStore();
  const providers = settingsStore.aiProviders;
  const defaultModel = settingsStore.defaultModel;

  if (defaultModel) {
    const matched = providers.find(
      (p) =>
        p.id === defaultModel.providerId &&
        p.modelName === defaultModel.modelName &&
        p.enabled &&
        !!p.apiKey,
    );
    if (matched) return true;
  }

  return providers.some((p) => p.enabled && !!p.apiKey);
}

async function defaultChat(system: string, user: string, temperature: number): Promise<string> {
  const settingsStore = useSettingsStore();
  const providers = settingsStore.aiProviders;
  const defaultModel = settingsStore.defaultModel;

  let providerConfig =
    (defaultModel &&
      providers.find(
        (p) =>
          p.id === defaultModel.providerId &&
          p.modelName === defaultModel.modelName &&
          p.enabled &&
          !!p.apiKey,
      )) ||
    providers.find((p) => p.enabled && !!p.apiKey) ||
    null;

  if (!providerConfig) {
    throw new Error('NO_AI_PROVIDER');
  }

  const service = AIServiceFactory.createService(
    providerConfig.provider as ProviderType,
    providerConfig.apiKey,
    providerConfig.baseUrl || getBaseUrl(providerConfig.provider as ProviderType),
    providerConfig.modelName,
    2500,
    {
      temperature,
      topP: 0.95,
      frequencyPenalty: 0.2,
      presencePenalty: 0.2,
    },
  );

  return service.complete(user, {
    system,
    temperature,
    maxTokens: 2500,
  });
}

export async function refreshStorySeeds(
  options: RefreshStorySeedsOptions = {},
  chatFn: ChatFn = defaultChat,
): Promise<TopicDiscoveryBatch<StorySeedCard>> {
  const count = options.count ?? DEFAULT_SEED_COUNT;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const generatedAt = new Date().toISOString();

  if (!hasActiveProvider()) {
    return {
      items: buildFallbackStorySeeds(options),
      source: 'fallback',
      generatedAt,
      warning: '未配置 AI，已使用本地灵感池。配置后可刷新获得更多样点子。',
    };
  }

  try {
    const playStyle = options.playStyle ?? 'standard';
    const raw = await chatFn(
      buildStorySeedsSystemPrompt(playStyle),
      buildStorySeedsUserPrompt(options),
      temperature,
    );
    const items = parseStorySeeds(raw, count);
    if (items.length === 0) {
      return {
        items: buildFallbackStorySeeds(options),
        source: 'fallback',
        generatedAt,
        warning: 'AI 返回无法解析，已降级为本地灵感。',
      };
    }
    return { items, source: 'ai', generatedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      items: buildFallbackStorySeeds(options),
      source: 'fallback',
      generatedAt,
      warning: `AI 刷新失败（${message}），已使用本地灵感池。`,
    };
  }
}

export async function refreshGenreInsights(
  options: RefreshGenreInsightsOptions = {},
  chatFn: ChatFn = defaultChat,
): Promise<TopicDiscoveryBatch<GenreInsightCard>> {
  const count = options.count ?? DEFAULT_INSIGHT_COUNT;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const generatedAt = new Date().toISOString();

  if (!hasActiveProvider()) {
    return {
      items: buildFallbackGenreInsights(options),
      source: 'fallback',
      generatedAt,
      warning: '未配置 AI，已使用本地题材风向。配置后可刷新生成新洞察。',
    };
  }

  try {
    const raw = await chatFn(
      buildGenreInsightsSystemPrompt(),
      buildGenreInsightsUserPrompt(options),
      temperature,
    );
    const items = parseGenreInsights(raw, count);
    if (items.length === 0) {
      return {
        items: buildFallbackGenreInsights(options),
        source: 'fallback',
        generatedAt,
        warning: 'AI 返回无法解析，已降级为本地题材数据。',
      };
    }
    return { items, source: 'ai', generatedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      items: buildFallbackGenreInsights(options),
      source: 'fallback',
      generatedAt,
      warning: `AI 刷新失败（${message}），已使用本地题材数据。`,
    };
  }
}

/** 将种子拼成方向生成用的 prompt */
export function buildPromptFromSeed(seed: StorySeedCard): string {
  return [
    `【开题种子】${seed.title}`,
    `【一句话故事核】${seed.oneLiner}`,
    `【题材】${seed.genre}`,
    `【受众】${seed.audience}`,
    `【开篇钩子】${seed.hook}`,
    `【核心爽点】${seed.coolPoint}`,
    seed.riskNote ? `【注意】${seed.riskNote}` : '',
    '请基于以上种子生成可长篇连载的创作方向。',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 将题材洞察转为种子刷新约束 */
export function insightToSeedConstraints(insight: GenreInsightCard): RefreshStorySeedsOptions {
  return {
    genre: insight.name,
    audience: insight.audience,
    lockedSlots: {
      genre: insight.name,
      audience: insight.audience,
    },
  };
}
