/**
 * 本地组合式创意引擎（local-engine）
 *
 * 替代旧的「题材名·逆袭」模板拼接式降级：
 * 从脑洞题材池 + 开篇手法池 + 意外设定池 + 书名技法库中组合生成，
 * 保证离线降级时仍能产出有网感的脑洞点子。
 *
 * 行为契约（与旧 buildFallbackStorySeeds 对齐，供单测依赖）：
 *  - count / excludeTitles 去重
 *  - platform / length / audience 透传；short 时 oneLiner 含「完结/反转」
 *  - insightContext 锁题材并融入 opportunity / hotTags
 *  - diceRoll 三面全部入核
 *  - mixTags/mixElements 碰撞提示入核
 *  - twist 玩法输出 brokenTrope
 */

import type {
  GenreSeedHint,
  InsightSeedContext,
  SeedPlayStyle,
  StorySeedCard,
  TopicAudience,
  TopicDiceRoll,
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';
import { buildLocalTitle } from '../prompts/title-craft';
import { BRAIN_GENRES, findBrainGenre } from '../fallback/genre-pool';
import {
  MECHANISM_STRANDS,
  OPENING_HOOKS,
  PAYOFF_STRANDS,
  PROTAGONIST_IDENTITIES,
  UNEXPECTED_TWISTS,
} from '../fallback/hook-twist-pool';
import { genreTags } from '@/data/inspirations';

export interface LocalCreativeSeedContext {
  count: number;
  playStyle: SeedPlayStyle;
  genre?: string;
  audience: TopicAudience;
  platform: TopicPlatform;
  length: TopicLength;
  diceRoll?: TopicDiceRoll;
  mixTags?: string[];
  mixElements?: string[];
  insight?: InsightSeedContext;
  genreHint?: GenreSeedHint | null;
  /** 已出现标题（小写），用于换一批去重 */
  exclude: Set<string>;
}

type PickFn = <T>(pool: readonly T[]) => T;

function createPick(exclude: ReadonlySet<string>): PickFn {
  return pool => {
    // 最多尝试 5 次取未用过素材，避免同批重复
    for (let i = 0; i < 5; i += 1) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      if (item === undefined) break;
      const key = String(item);
      if (!exclude.has(key)) {
        return item;
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  };
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildOneLiner(parts: {
  genre: string;
  hook: string;
  subject: string;
  mechanism: string;
  payoff: string;
}): string {
  return `${parts.genre}世界里，${parts.hook}，${parts.subject}却${parts.mechanism}，第一次兑现就${parts.payoff}。`;
}

function applyLengthSuffix(oneLiner: string, length: TopicLength): string {
  if (length !== 'short') return oneLiner;
  return `${oneLiner.replace(/。$/, '')}；故事在一次强反转后收束完结。`;
}

/** 生成一批脑洞种子（同批素材不重复） */
export function buildCreativeSeeds(ctx: LocalCreativeSeedContext): StorySeedCard[] {
  const count = Math.max(1, ctx.count);
  const exclude = new Set(ctx.exclude);
  const used = new Set<string>();
  const pick = createPick(used);
  const seeds: StorySeedCard[] = [];

  const lockedGenre = ctx.genre?.trim() || undefined;
  const lockedBrain = lockedGenre ? findBrainGenre(lockedGenre) : null;

  // 候选池：锁题材时优先用该题材素材，否则全池混洗（脑洞池 + 老分类池）
  const candidates = lockedGenre
    ? lockedBrain
      ? [lockedBrain.name]
      : genreTags
          .filter(t => t.name === lockedGenre || t.name.includes(lockedGenre))
          .map(t => t.name)
    : shuffle([...BRAIN_GENRES.map(g => g.name), ...genreTags.map(t => t.name)]);

  const mixHint =
    [...(ctx.mixTags ?? []), ...(ctx.mixElements ?? [])].filter(Boolean).join('×') || '';

  for (const genreName of candidates) {
    if (seeds.length >= count) break;
    const brain = findBrainGenre(genreName) ?? lockedBrain;

    let hook =
      brain && brain.openings.length > 0
        ? pick(brain.openings)
        : pick(OPENING_HOOKS);
    const mechanism =
      brain && brain.mechanisms.length > 0
        ? pick(brain.mechanisms)
        : pick(MECHANISM_STRANDS);
    const payoff =
      brain && brain.payoffs.length > 0 ? pick(brain.payoffs) : pick(PAYOFF_STRANDS);
    const subject = pick(PROTAGONIST_IDENTITIES);
    const twist = pick(UNEXPECTED_TWISTS);

    used.add(String(hook));
    used.add(String(mechanism));
    used.add(String(payoff));

    let oneLiner: string = buildOneLiner({ genre: genreName, hook, subject, mechanism, payoff });
    let coolPoint = String(payoff);
    let sellPoint: string | undefined;
    let brokenTrope: string | undefined;
    let mechanismField = String(mechanism);

    // 洞察约束先应用（与旧版顺序一致）：后续玩法分支可覆盖 oneLiner，但保留洞察的题材锁定
    if (ctx.insight) {
      const hotTagHint = ctx.insight.hotTags.slice(0, 2).join('×') || genreName;
      oneLiner = `围绕「${ctx.insight.opportunity}」：在${genreName}背景下，${subject}${mechanism}，靠${hotTagHint}撕开困局，第一次兑现就${payoff}。`;
      coolPoint = hotTagHint || coolPoint;
      sellPoint = ctx.insight.opportunity;
      hook = ctx.insight.opportunity.slice(0, 40);
    }

    if (ctx.playStyle === 'twist') {
      oneLiner = `${genreName}开局看似经典套路，但${twist}：${subject}${mechanism}，第一场胜利就不按剧本走。`;
      brokenTrope = '无脑打脸/无代价金手指';
      coolPoint = '破梗后的新期待被持续放大';
      sellPoint = '破梗后建立新的可持续期待';
    } else if (ctx.playStyle === 'dice' && ctx.diceRoll) {
      oneLiner = `【${ctx.diceRoll.genre}】以「${ctx.diceRoll.hook}」开篇，意外设定「${ctx.diceRoll.twist}」：${subject}${mechanism}，第一次危机就兑现差异化优势。`;
      coolPoint = `${ctx.diceRoll.twist}带来的持续爽点`;
      mechanismField = ctx.diceRoll.twist;
      hook = ctx.diceRoll.hook;
    } else if (ctx.playStyle === 'mix' && mixHint) {
      oneLiner = `把「${mixHint}」硬核碰撞：${subject}在${genreName}背景下${mechanism}，第一次兑现就${payoff}。`;
      mechanismField = mixHint;
    } else if (!ctx.insight) {
      oneLiner = buildOneLiner({ genre: genreName, hook, subject, mechanism, payoff });
      sellPoint = '读者想看被低估后的第一次漂亮翻盘';
    }

    oneLiner = applyLengthSuffix(oneLiner, ctx.length);

    let title = buildLocalTitle(pick, { genre: genreName });
    // 标题去重：同批内不重复 + 不命中历史 exclude
    let retry = 0;
    while ((exclude.has(title.toLowerCase()) || used.has(`title:${title}`)) && retry < 5) {
      title = buildLocalTitle(pick, { genre: genreName });
      retry += 1;
    }
    used.add(`title:${title}`);
    exclude.add(title.toLowerCase());

    seeds.push({
      id: `seed-fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      oneLiner,
      genre: lockedGenre || genreName,
      hook: String(hook).slice(0, 60),
      coolPoint,
      audience: ctx.audience,
      platform: ctx.platform,
      length: ctx.length,
      riskNote:
        ctx.insight?.riskNote ||
        ctx.genreHint?.commonRisks[0] ||
        '离线降级灵感，建议配置 AI 后刷新获得更多样点子',
      sellPoint,
      mechanism: mechanismField,
      brokenTrope,
      genreProfileId: ctx.genreHint?.profileId,
    });
  }

  // 候选池不够时兜底
  while (seeds.length < count) {
    const genreName = lockedGenre || '脑洞日常';
    const subject = pick(PROTAGONIST_IDENTITIES);
    const mechanism = pick(MECHANISM_STRANDS);
    const payoff = pick(PAYOFF_STRANDS);
    let oneLiner: string;
    if (ctx.diceRoll) {
      oneLiner = `【${ctx.diceRoll.genre}】以「${ctx.diceRoll.hook}」开场，意外设定「${ctx.diceRoll.twist}」改写命运。`;
    } else if (ctx.insight?.opportunity) {
      oneLiner = `切入「${ctx.insight.opportunity}」，${subject}${mechanism}，在有限篇幅内完成第一次漂亮翻盘。`;
    } else {
      oneLiner = `${genreName}世界里，${pick(OPENING_HOOKS)}，${subject}却${mechanism}，第一次兑现就${payoff}。`;
    }
    oneLiner = applyLengthSuffix(oneLiner, ctx.length);
    used.add(String(subject));
    used.add(String(mechanism));
    used.add(String(payoff));
    let fallbackTitle = buildLocalTitle(pick, { genre: genreName });
    let retry = 0;
    while (exclude.has(fallbackTitle.toLowerCase()) && retry < 5) {
      fallbackTitle = buildLocalTitle(pick, { genre: genreName });
      retry += 1;
    }
    exclude.add(fallbackTitle.toLowerCase());
    seeds.push({
      id: `seed-fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: fallbackTitle,
      oneLiner,
      genre: lockedGenre || ctx.diceRoll?.genre || ctx.insight?.name || genreName,
      hook: ctx.diceRoll?.hook || ctx.insight?.opportunity?.slice(0, 40) || '开篇三章给足危机与第一次小兑现',
      coolPoint: ctx.diceRoll?.twist || ctx.insight?.hotTags?.[0] || String(payoff),
      audience: ctx.audience,
      platform: ctx.platform,
      length: ctx.length,
      riskNote: '离线降级灵感',
      sellPoint: ctx.insight?.opportunity,
      mechanism: ctx.diceRoll?.twist || ctx.genreHint?.typicalOpening || mechanism,
      brokenTrope: ctx.playStyle === 'twist' ? '经典套路无代价兑现' : undefined,
      genreProfileId: ctx.genreHint?.profileId,
    });
  }

  return seeds;
}
