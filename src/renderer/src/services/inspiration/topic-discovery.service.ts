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
  LENGTH_LABEL,
  PLATFORM_LABEL,
} from './prompts/topic-discovery-prompts';
import { buildGenreSeedHint } from './genre-seed-context';
import type {
  EntryDifficulty,
  GenreInsightCard,
  GenreLifecycleHint,
  GenreSeedHint,
  InsightSeedContext,
  RefreshGenreInsightsOptions,
  RefreshStorySeedsOptions,
  RiskLevel,
  StorySeedCard,
  TopicAudience,
  TopicDiscoveryBatch,
  TopicDiscoveryProjectSeed,
  TopicDiscoveryTab,
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';

const DEFAULT_SEED_COUNT = 4;
const DEFAULT_INSIGHT_COUNT = 4;
const DEFAULT_TEMPERATURE = 0.9;

const PLATFORM_VALUES: TopicPlatform[] = [
  'qidian',
  'fanqie',
  'jinjiang',
  'qimao',
  'zhihu',
  'general',
];

type ChatFn = (
  system: string,
  user: string,
  temperature: number,
  signal?: AbortSignal,
) => Promise<string>;

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAudience(value: unknown): TopicAudience {
  if (value === 'male' || value === 'female' || value === 'general') {
    return value;
  }
  return 'general';
}

export function normalizePlatform(value: unknown, fallback: TopicPlatform = 'general'): TopicPlatform {
  if (typeof value === 'string' && PLATFORM_VALUES.includes(value as TopicPlatform)) {
    return value as TopicPlatform;
  }
  return fallback;
}

export function normalizeLength(value: unknown, fallback: TopicLength = 'long'): TopicLength {
  if (value === 'long' || value === 'short') {
    return value;
  }
  return fallback;
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

export function normalizeEntryDifficulty(
  value: unknown,
  fallback: EntryDifficulty = 'medium',
): EntryDifficulty {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return fallback;
}

export function inferEntryDifficulty(
  lifecycle: GenreLifecycleHint,
  riskLevel: RiskLevel,
): EntryDifficulty {
  if (riskLevel === 'high' || lifecycle === 'saturated' || lifecycle === 'declining') {
    return 'high';
  }
  if (riskLevel === 'low' && (lifecycle === 'emerging' || lifecycle === 'rising')) {
    return 'low';
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

function resolveSeedDefaults(options: RefreshStorySeedsOptions): {
  platform: TopicPlatform;
  length: TopicLength;
} {
  return {
    platform: options.lockedSlots?.platform || options.platform || 'general',
    length: options.lockedSlots?.length || options.length || 'long',
  };
}

/** 从锁定题材 / 洞察 / 骰子 / 混搭解析 Profile hint */
export function resolveGenreSeedHint(
  options: RefreshStorySeedsOptions,
): GenreSeedHint | null {
  if (options.genreSeedHint) {
    return options.genreSeedHint;
  }
  const genreName =
    options.lockedSlots?.genre ||
    options.genre ||
    options.insightContext?.name ||
    options.diceRoll?.genre ||
    options.mixTags?.[0];
  return genreName ? buildGenreSeedHint(genreName) : null;
}

function applySeedDefaults(
  seeds: StorySeedCard[],
  defaults: {
    platform: TopicPlatform;
    length: TopicLength;
    genreProfileId?: string;
  },
): StorySeedCard[] {
  return seeds.map(seed => ({
    ...seed,
    platform: seed.platform ?? defaults.platform,
    length: seed.length ?? defaults.length,
    genreProfileId: seed.genreProfileId ?? defaults.genreProfileId,
  }));
}

function mapPlatformBiasToTopicPlatform(bias: string[] | undefined): TopicPlatform | undefined {
  const list = mapPlatformBiasList(bias);
  return list[0];
}

/** 将中文/英文平台偏向映射为 TopicPlatform 列表 */
export function mapPlatformBiasList(bias: string[] | undefined): TopicPlatform[] {
  if (!bias || bias.length === 0) return [];
  const result: TopicPlatform[] = [];
  for (const item of bias) {
    const lower = item.toLowerCase();
    let mapped: TopicPlatform | null = null;
    if (lower.includes('起点') || lower.includes('qidian')) mapped = 'qidian';
    else if (lower.includes('番茄') || lower.includes('fanqie')) mapped = 'fanqie';
    else if (lower.includes('晋江') || lower.includes('jinjiang')) mapped = 'jinjiang';
    else if (lower.includes('七猫') || lower.includes('qimao')) mapped = 'qimao';
    else if (
      lower.includes('盐言') ||
      lower.includes('知乎') ||
      lower.includes('zhihu')
    ) {
      mapped = 'zhihu';
    } else if (PLATFORM_VALUES.includes(item as TopicPlatform)) {
      mapped = item as TopicPlatform;
    }
    if (mapped && mapped !== 'general' && !result.includes(mapped)) {
      result.push(mapped);
    }
  }
  return result.slice(0, 3);
}

function parseStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean).slice(0, max);
}

function parsePlatformBiasField(
  value: unknown,
  fallback: TopicPlatform[],
): TopicPlatform[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }
  const mapped = mapPlatformBiasList(value.map(item => String(item)));
  return mapped.length > 0 ? mapped : fallback;
}

/** 解析 AI 返回的灵感种子（导出供单测） */
export function parseStorySeeds(
  raw: string,
  count: number = DEFAULT_SEED_COUNT,
  defaults: { platform?: TopicPlatform; length?: TopicLength } = {},
): StorySeedCard[] {
  const parsed = robustJsonParse<{ seeds?: unknown[] }>(raw, {
    expectedType: 'object',
    enableCompletion: true,
  });

  if (!parsed.success || !parsed.data) {
    return [];
  }

  const list = Array.isArray(parsed.data.seeds) ? parsed.data.seeds : [];
  const seeds: StorySeedCard[] = [];
  const fallbackPlatform = defaults.platform ?? 'general';
  const fallbackLength = defaults.length ?? 'long';

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
      platform: normalizePlatform(row.platform, fallbackPlatform),
      length: normalizeLength(row.length, fallbackLength),
      riskNote: row.riskNote ? String(row.riskNote) : undefined,
      sellPoint: row.sellPoint
        ? String(row.sellPoint).trim()
        : row.sell_point
          ? String(row.sell_point).trim()
          : undefined,
      mechanism: row.mechanism ? String(row.mechanism).trim() : undefined,
      brokenTrope: row.brokenTrope
        ? String(row.brokenTrope).trim()
        : row.broken_trope
          ? String(row.broken_trope).trim()
          : undefined,
    });

    if (seeds.length >= count) break;
  }

  return seeds;
}

/** 解析 AI 返回的题材洞察（导出供单测） */
export function parseGenreInsights(
  raw: string,
  count: number = DEFAULT_INSIGHT_COUNT,
  defaults: { platform?: TopicPlatform; length?: TopicLength } = {},
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
  const fallbackPlatform = defaults.platform ?? 'general';
  const fallbackLength = defaults.length ?? 'long';

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) continue;

    const hotTags = Array.isArray(row.hotTags)
      ? row.hotTags.map(t => String(t)).filter(Boolean).slice(0, 4)
      : [];
    const lifecycle = normalizeLifecycle(row.lifecycle);
    const riskLevel = normalizeRisk(row.riskLevel);
    const platformBias = parsePlatformBiasField(
      row.platformBias ?? row.platform_bias,
      fallbackPlatform !== 'general' ? [fallbackPlatform] : [],
    );
    const primaryPlatform =
      normalizePlatform(row.platform, platformBias[0] || fallbackPlatform);
    const namePatterns = parseStringList(row.namePatterns ?? row.name_patterns, 2);
    const entryDifficulty = normalizeEntryDifficulty(
      row.entryDifficulty ?? row.entry_difficulty,
      inferEntryDifficulty(lifecycle, riskLevel),
    );

    insights.push({
      id: createId('insight'),
      name,
      lifecycle,
      audience: normalizeAudience(row.audience),
      reason: String(row.reason ?? '').trim() || '市场仍有讨论度',
      opportunity: String(row.opportunity ?? '').trim() || '找准差异化切入点再开题',
      hotTags: hotTags.length > 0 ? hotTags : [name],
      riskLevel,
      riskNote: row.riskNote ? String(row.riskNote) : undefined,
      platform: primaryPlatform,
      length: normalizeLength(row.length, fallbackLength),
      platformBias: platformBias.length > 0 ? platformBias : [primaryPlatform],
      entryDifficulty,
      namePatterns: namePatterns.length > 0 ? namePatterns : undefined,
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
  const exclude = new Set((options.excludeTitles ?? []).map(t => t.toLowerCase()));
  const playStyle = options.playStyle ?? 'standard';
  const lockedGenre =
    options.lockedSlots?.genre ||
    options.genre ||
    options.insightContext?.name ||
    options.diceRoll?.genre ||
    options.mixTags?.[0];
  const lockedAudience =
    options.lockedSlots?.audience ||
    options.audience ||
    options.insightContext?.audience ||
    'general';
  const { platform, length } = resolveSeedDefaults(options);
  const mixHint =
    [...(options.mixTags ?? []), ...(options.mixElements ?? [])].filter(Boolean).join('×') ||
    '';
  const dice = options.diceRoll;
  const insight = options.insightContext;
  const hotTagHint = insight?.hotTags?.slice(0, 2).join('×') || '';
  const genreHint = resolveGenreSeedHint(options);

  const preferred = lockedGenre
    ? genreTags.filter(tag => tag.name === lockedGenre || tag.name.includes(lockedGenre))
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
    let sellPoint: string | undefined = '读者想看被低估后的第一次漂亮翻盘';
    let mechanism: string | undefined = tag.description || '独特金手指改写命运';
    let brokenTrope: string | undefined;

    if (genreHint) {
      hook = `以「${genreHint.preferredHooks[0] || '冲突钩子'}」开篇，迅速抛出${tag.name}核心矛盾`;
      coolPoint = genreHint.preferredCoolPoints[0] || coolPoint;
      sellPoint = `兑现${genreHint.preferredCoolPoints.slice(0, 2).join('/')}期待`;
      if (genreHint.typicalOpening) {
        mechanism = genreHint.typicalOpening;
      }
    }

    if (insight?.opportunity) {
      oneLiner = `围绕「${insight.opportunity}」：在${tag.name}背景下，主角用${hotTagHint || tag.description || '差异化设定'}撕开困局，兑现第一次反转。`;
      hook = insight.opportunity.slice(0, 40);
      coolPoint = hotTagHint || coolPoint;
      sellPoint = insight.opportunity;
    }

    if (playStyle === 'twist') {
      oneLiner = `看似经典的${tag.name}开局，却在读者期待打脸时突然翻盘：主角必须用「不按套路」的方式赢得第一次胜利。`;
      hook = '先诱导套路期待，再在关键节点反向兑现';
      coolPoint = '破梗后的新期待被持续放大';
      brokenTrope = '无脑打脸/无代价金手指';
      sellPoint = '破梗后建立新的可持续期待';
    } else if (playStyle === 'mix' && mixHint) {
      oneLiner = `把「${mixHint}」硬核碰撞：主角在${tag.name}背景下被迫同时消化互相冲突的设定，靠第一次漂亮翻盘站稳脚跟。`;
      hook = `开篇三章同时抛出混搭冲突：${mixHint}`;
      coolPoint = '混搭元素化学反应带来的独特爽感';
      mechanism = mixHint;
    } else if (playStyle === 'dice' && dice) {
      oneLiner = `【${dice.genre}】世界里，以「${dice.hook}」开篇，并植入「${dice.twist}」：主角必须在第一次危机中兑现差异化优势。`;
      hook = dice.hook;
      coolPoint = `${dice.twist}带来的持续爽点`;
      mechanism = dice.twist;
    }

    if (length === 'short') {
      oneLiner = `${oneLiner.replace(/。$/, '')}；故事在一次强反转后收束完结。`;
      hook = `开篇即抛核心情绪冲突：${hook}`;
    }

    seeds.push({
      id: createId('seed-fb'),
      title,
      oneLiner,
      genre: lockedGenre || tag.name,
      hook,
      coolPoint,
      audience: lockedAudience,
      platform,
      length,
      riskNote:
        insight?.riskNote ||
        genreHint?.commonRisks[0] ||
        '离线降级灵感，建议配置 AI 后刷新获得更多样点子',
      sellPoint,
      mechanism,
      brokenTrope,
      genreProfileId: genreHint?.profileId,
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
          : insight?.opportunity
            ? `切入「${insight.opportunity}」，用有限篇幅完成第一次漂亮翻盘。`
            : '普通人意外卷入超常事件，必须在有限时间内完成第一次漂亮翻盘。',
      genre: lockedGenre || dice?.genre || insight?.name || '都市',
      hook: dice?.hook || insight?.opportunity?.slice(0, 40) || '开篇三章给足危机与第一次小兑现',
      coolPoint: dice?.twist || hotTagHint || genreHint?.preferredCoolPoints[0] || '信息差打脸',
      audience: lockedAudience,
      platform,
      length,
      riskNote: '离线降级灵感',
      sellPoint: insight?.opportunity || sellPointFallback(genreHint),
      mechanism: dice?.twist || genreHint?.typicalOpening,
      brokenTrope: playStyle === 'twist' ? '经典套路无代价兑现' : undefined,
      genreProfileId: genreHint?.profileId,
    });
  }

  return seeds;
}

function sellPointFallback(hint: GenreSeedHint | null): string {
  if (!hint) return '被低估后的第一次反转兑现';
  return `兑现${hint.preferredCoolPoints.slice(0, 2).join('/')}期待`;
}

/** 本地降级：从 market-trends 拼装题材洞察 */
export function buildFallbackGenreInsights(
  options: RefreshGenreInsightsOptions = {},
): GenreInsightCard[] {
  const count = options.count ?? DEFAULT_INSIGHT_COUNT;
  const exclude = new Set((options.excludeNames ?? []).map(n => n.toLowerCase()));
  const audience = options.audience || 'general';
  const platform = options.platform || 'general';
  const length = options.length || 'long';

  const pool = shuffle(genreTrends).filter(t => !exclude.has(t.name.toLowerCase()));

  return pool.slice(0, count).map(trend => {
    const platformBias = mapPlatformBiasList(trend.platformBias);
    const primary =
      (platform !== 'general' ? platform : undefined) ||
      platformBias[0] ||
      mapPlatformBiasToTopicPlatform(trend.platformBias) ||
      'general';
    const entryDifficulty = inferEntryDifficulty(trend.lifecycle, trend.riskLevel);
    const namePatterns =
      trend.hotTags.length > 0
        ? [`「${trend.hotTags[0]}」卖点开篇`, `${trend.name}差异化金手指`]
        : [`${trend.name}差异化切入`];

    return {
      id: createId('insight-fb'),
      name: trend.name,
      lifecycle: trend.lifecycle,
      audience,
      reason: trend.description,
      opportunity: trend.suggestion,
      hotTags: trend.hotTags.slice(0, 4),
      riskLevel: trend.riskLevel,
      riskNote: '离线题材数据（非实时榜单），配置 AI 后可刷新生成新风向',
      platform: primary,
      length,
      platformBias: platformBias.length > 0 ? platformBias : primary !== 'general' ? [primary] : [],
      entryDifficulty,
      namePatterns,
    };
  });
}

function hasActiveProvider(): boolean {
  const settingsStore = useSettingsStore();
  const providers = settingsStore.aiProviders;
  const defaultModel = settingsStore.defaultModel;

  if (defaultModel) {
    const matched = providers.find(
      p =>
        p.id === defaultModel.providerId &&
        p.modelName === defaultModel.modelName &&
        p.enabled &&
        !!p.apiKey,
    );
    if (matched) return true;
  }

  return providers.some(p => p.enabled && !!p.apiKey);
}

async function defaultChat(
  system: string,
  user: string,
  temperature: number,
  signal?: AbortSignal,
): Promise<string> {
  const settingsStore = useSettingsStore();
  const providers = settingsStore.aiProviders;
  const defaultModel = settingsStore.defaultModel;

  let providerConfig =
    (defaultModel &&
      providers.find(
        p =>
          p.id === defaultModel.providerId &&
          p.modelName === defaultModel.modelName &&
          p.enabled &&
          !!p.apiKey,
      )) ||
    providers.find(p => p.enabled && !!p.apiKey) ||
    null;

  if (!providerConfig) {
    throw new Error('NO_AI_PROVIDER');
  }

  const service = AIServiceFactory.createService(
    providerConfig.provider as ProviderType,
    providerConfig.apiKey,
    providerConfig.baseUrl || getBaseUrl(providerConfig.provider as ProviderType),
    providerConfig.modelName,
    undefined,
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
    signal,
  });
}

export async function refreshStorySeeds(
  options: RefreshStorySeedsOptions = {},
  chatFn: ChatFn = defaultChat,
): Promise<TopicDiscoveryBatch<StorySeedCard>> {
  const count = options.count ?? DEFAULT_SEED_COUNT;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const generatedAt = new Date().toISOString();
  const defaults = resolveSeedDefaults(options);
  const genreSeedHint = resolveGenreSeedHint(options);
  const enrichedOptions: RefreshStorySeedsOptions = {
    ...options,
    genreSeedHint: genreSeedHint ?? undefined,
  };

  if (!hasActiveProvider()) {
    return {
      items: buildFallbackStorySeeds(enrichedOptions),
      source: 'fallback',
      generatedAt,
      warning: '未配置 AI，已使用本地灵感池。配置后可刷新获得更多样点子。',
    };
  }

  try {
    const playStyle = enrichedOptions.playStyle ?? 'standard';
    const raw = await chatFn(
      buildStorySeedsSystemPrompt(playStyle),
      buildStorySeedsUserPrompt(enrichedOptions),
      temperature,
      options.signal,
    );
    const items = applySeedDefaults(parseStorySeeds(raw, count, defaults), {
      ...defaults,
      genreProfileId: genreSeedHint?.profileId,
    });
    if (items.length === 0) {
      return {
        items: buildFallbackStorySeeds(enrichedOptions),
        source: 'fallback',
        generatedAt,
        warning: 'AI 返回无法解析，已降级为本地灵感。',
      };
    }
    return { items, source: 'ai', generatedAt };
  } catch (err) {
    // 主动取消：向上抛出，避免被当成失败而降级本地池
    if (isAbortError(err) || options.signal?.aborted) {
      throw err instanceof Error ? err : new DOMException('Aborted', 'AbortError');
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      items: buildFallbackStorySeeds(enrichedOptions),
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
  const defaults = {
    platform: options.platform || 'general',
    length: options.length || 'long',
  };

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
      options.signal,
    );
    const items = parseGenreInsights(raw, count, defaults).map(item => ({
      ...item,
      platform: item.platform ?? defaults.platform,
      length: item.length ?? defaults.length,
    }));
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
    if (isAbortError(err) || options.signal?.aborted) {
      throw err instanceof Error ? err : new DOMException('Aborted', 'AbortError');
    }
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
  const platform = seed.platform ?? 'general';
  const length = seed.length ?? 'long';
  const lengthHint =
    length === 'short'
      ? '请基于以上种子生成适合短篇完结的创作方向（强情绪弧、可快速兑现）。'
      : '请基于以上种子生成可长篇连载的创作方向。';

  return [
    `【开题种子】${seed.title}`,
    `【一句话故事核】${seed.oneLiner}`,
    `【题材】${seed.genre}`,
    `【受众】${seed.audience}`,
    `【目标平台】${PLATFORM_LABEL[platform]}（${platform}）`,
    `【篇幅】${LENGTH_LABEL[length]}（${length}）`,
    `【开篇钩子】${seed.hook}`,
    `【核心爽点】${seed.coolPoint}`,
    seed.sellPoint ? `【核心卖点】${seed.sellPoint}` : '',
    seed.mechanism ? `【核心机制】${seed.mechanism}` : '',
    seed.brokenTrope ? `【破套路】${seed.brokenTrope}` : '',
    seed.genreProfileId ? `【题材Profile】${seed.genreProfileId}` : '',
    seed.riskNote ? `【注意】${seed.riskNote}` : '',
    lengthHint,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 将题材洞察转为完整种子刷新约束（含切入建议 / 热标签） */
export function insightToSeedConstraints(insight: GenreInsightCard): RefreshStorySeedsOptions {
  const insightContext: InsightSeedContext = {
    name: insight.name,
    audience: insight.audience,
    opportunity: insight.opportunity,
    reason: insight.reason,
    hotTags: [...insight.hotTags],
    riskLevel: insight.riskLevel,
    riskNote: insight.riskNote,
    lifecycle: insight.lifecycle,
    platform: insight.platform,
    length: insight.length,
    entryDifficulty: insight.entryDifficulty,
    namePatterns: insight.namePatterns ? [...insight.namePatterns] : undefined,
  };

  return {
    genre: insight.name,
    audience: insight.audience,
    platform: insight.platform,
    length: insight.length,
    lockedSlots: {
      genre: insight.name,
      audience: insight.audience,
      ...(insight.platform ? { platform: insight.platform } : {}),
      ...(insight.length ? { length: insight.length } : {}),
    },
    insightContext,
  };
}

/** 将开题种子整理为可写入项目 metadata 的合同种子 */
export function buildTopicDiscoveryProjectSeed(
  seed: StorySeedCard,
  sourceTab: TopicDiscoveryTab,
): TopicDiscoveryProjectSeed {
  const hint = buildGenreSeedHint(seed.genre);
  return {
    seedId: seed.id,
    title: seed.title,
    genre: seed.genre,
    audience: seed.audience,
    platform: seed.platform,
    length: seed.length,
    sellPoint: seed.sellPoint,
    mechanism: seed.mechanism,
    brokenTrope: seed.brokenTrope,
    hook: seed.hook,
    coolPoint: seed.coolPoint,
    genreProfileId: seed.genreProfileId ?? hint?.profileId,
    sourceTab,
    capturedAt: new Date().toISOString(),
  };
}
