/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseStorySeeds,
  parseGenreInsights,
  buildFallbackStorySeeds,
  buildFallbackGenreInsights,
  buildPromptFromSeed,
  insightToSeedConstraints,
  refreshStorySeeds,
  refreshGenreInsights,
  inferEntryDifficulty,
  mapPlatformBiasList,
  buildTopicDiscoveryProjectSeed,
} from '@/services/inspiration/topic-discovery.service';
import {
  buildStorySeedsUserPrompt,
  buildGenreInsightsUserPrompt,
  buildGenreInsightsSystemPrompt,
} from '@/services/inspiration/prompts/topic-discovery-prompts';
import type { GenreInsightCard, StorySeedCard } from '@/types/topic-discovery';
import type { RankScanResult } from '@/types/rank-scan';

const scanPublicRanksMock = vi.hoisted(() =>
  vi.fn(async () => ({
    availability: 'unavailable' as const,
    fetchedAt: 't',
    sampleCount: 0,
    boards: [],
    failure: 'no-channel' as const,
  })),
);

vi.mock('@/services/inspiration/rank-scan-client', () => ({
  scanPublicRanks: scanPublicRanksMock,
}));

const settingsState: {
  aiProviders: Array<{
    id: string;
    provider: string;
    modelName: string;
    enabled: boolean;
    apiKey: string;
    baseUrl?: string;
  }>;
  defaultModel: { providerId: string; modelName: string } | null;
} = {
  aiProviders: [],
  defaultModel: null,
};

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => settingsState,
}));

vi.mock('@/services/ai/factory', () => ({
  AIServiceFactory: {
    createService: vi.fn(),
  },
}));

describe('topic-discovery.service', () => {
  beforeEach(() => {
    settingsState.aiProviders = [];
    settingsState.defaultModel = null;
  });
  describe('parseStorySeeds', () => {
    it('parses valid JSON seeds', () => {
      const raw = JSON.stringify({
        seeds: [
          {
            title: '凡骨登仙',
            oneLiner: '资质平庸的少年在宗门大比前夜觉醒上古传承，被迫与世家子弟对赌生死。',
            genre: '修仙',
            hook: '开篇退婚羞辱',
            coolPoint: '当众打脸',
            audience: 'male',
            platform: 'qidian',
            length: 'long',
          },
        ],
      });

      const seeds = parseStorySeeds(raw, 3);
      expect(seeds).toHaveLength(1);
      expect(seeds[0].title).toBe('凡骨登仙');
      expect(seeds[0].audience).toBe('male');
      expect(seeds[0].genre).toBe('修仙');
      expect(seeds[0].platform).toBe('qidian');
      expect(seeds[0].length).toBe('long');
    });

    it('applies platform/length defaults when AI omits them', () => {
      const raw = JSON.stringify({
        seeds: [
          {
            title: '都市回响',
            oneLiner: '重生回到高考前夜的程序员，必须在七天内阻止公司被做空。',
            genre: '都市',
            hook: '倒计时',
            coolPoint: '信息差',
            audience: 'general',
          },
        ],
      });

      const seeds = parseStorySeeds(raw, 1, { platform: 'fanqie', length: 'short' });
      expect(seeds[0].platform).toBe('fanqie');
      expect(seeds[0].length).toBe('short');
    });

    it('parses markdown-wrapped JSON', () => {
      const raw = `\`\`\`json
{"seeds":[{"title":"都市回响","oneLiner":"重生回到高考前夜的程序员，必须在七天内阻止公司被做空。","genre":"都市","hook":"倒计时","coolPoint":"信息差","audience":"general"}]}
\`\`\``;

      const seeds = parseStorySeeds(raw);
      expect(seeds.length).toBeGreaterThanOrEqual(1);
      expect(seeds[0].title).toBe('都市回响');
    });

    it('returns empty for invalid payload', () => {
      expect(parseStorySeeds('not json')).toEqual([]);
    });
  });

  describe('parseGenreInsights', () => {
    it('parses insight cards', () => {
      const raw = JSON.stringify({
        insights: [
          {
            name: '脑洞直播',
            lifecycle: 'rising',
            audience: 'general',
            reason: '短视频时代读者偏好强设定',
            opportunity: '用直播规则做持续冲突引擎',
            hotTags: ['直播', '脑洞'],
            riskLevel: 'medium',
            platform: 'fanqie',
            length: 'short',
            platformBias: ['fanqie', 'qimao'],
            entryDifficulty: 'low',
            namePatterns: ['直播间规则怪谈式书名'],
          },
        ],
      });

      const insights = parseGenreInsights(raw);
      expect(insights).toHaveLength(1);
      expect(insights[0].name).toBe('脑洞直播');
      expect(insights[0].lifecycle).toBe('rising');
      expect(insights[0].hotTags).toContain('直播');
      expect(insights[0].platform).toBe('fanqie');
      expect(insights[0].length).toBe('short');
      expect(insights[0].platformBias).toEqual(['fanqie', 'qimao']);
      expect(insights[0].entryDifficulty).toBe('low');
      expect(insights[0].namePatterns?.[0]).toContain('直播间');
    });

    it('infers entryDifficulty when omitted', () => {
      const raw = JSON.stringify({
        insights: [
          {
            name: '饱和题材',
            lifecycle: 'saturated',
            audience: 'male',
            reason: '同质化严重',
            opportunity: '换皮难出头，建议观望',
            hotTags: ['系统'],
            riskLevel: 'high',
          },
        ],
      });
      const insights = parseGenreInsights(raw);
      expect(insights[0].entryDifficulty).toBe('high');
    });
  });

  describe('fallback builders', () => {
    it('builds local story seeds with exclude', () => {
      const first = buildFallbackStorySeeds({ count: 3 });
      expect(first.length).toBe(3);

      const second = buildFallbackStorySeeds({
        count: 3,
        excludeTitles: first.map(s => s.title),
        genre: '都市',
      });
      expect(second.length).toBe(3);
      const overlap = second.filter(s => first.some(f => f.title === s.title));
      expect(second.every(s => s.oneLiner.length > 0)).toBe(true);
      expect(overlap.length).toBeLessThanOrEqual(3);
    });

    it('applies platform and short length in fallback seeds', () => {
      const seeds = buildFallbackStorySeeds({
        count: 2,
        platform: 'fanqie',
        length: 'short',
        genre: '都市',
      });
      expect(seeds).toHaveLength(2);
      expect(seeds.every(s => s.platform === 'fanqie')).toBe(true);
      expect(seeds.every(s => s.length === 'short')).toBe(true);
      expect(seeds[0].oneLiner).toMatch(/完结|反转/);
    });

    it('eats insightContext into fallback seeds', () => {
      const seeds = buildFallbackStorySeeds({
        count: 1,
        insightContext: {
          name: '规则怪谈',
          audience: 'general',
          opportunity: '用职场规则做生存副本',
          reason: '短视频传播强',
          hotTags: ['规则', '职场'],
          riskLevel: 'medium',
          lifecycle: 'rising',
        },
      });
      expect(seeds[0].genre).toBe('规则怪谈');
      expect(seeds[0].oneLiner).toMatch(/职场规则|规则|职场/);
    });

    it('builds local genre insights', () => {
      const insights = buildFallbackGenreInsights({
        count: 4,
        audience: 'female',
        platform: 'jinjiang',
        length: 'long',
      });
      expect(insights).toHaveLength(4);
      expect(insights.every(i => i.audience === 'female')).toBe(true);
      expect(insights.every(i => i.length === 'long')).toBe(true);
      expect(insights.every(i => !!i.platform)).toBe(true);
      expect(insights.every(i => !!i.entryDifficulty)).toBe(true);
      expect(insights.every(i => (i.namePatterns?.length ?? 0) > 0)).toBe(true);
      expect(insights.every(i => (i.platformBias?.length ?? 0) >= 0)).toBe(true);
    });
  });

  describe('buildPromptFromSeed', () => {
    it('includes core seed fields and platform/length', () => {
      const seed: StorySeedCard = {
        id: '1',
        title: '测试',
        oneLiner: '一句话',
        genre: '玄幻',
        hook: '钩子',
        coolPoint: '爽点',
        audience: 'general',
        platform: 'qidian',
        length: 'long',
        sellPoint: '读者期待装逼打脸',
        mechanism: '血脉觉醒',
      };
      const prompt = buildPromptFromSeed(seed);
      expect(prompt).toContain('测试');
      expect(prompt).toContain('玄幻');
      expect(prompt).toContain('钩子');
      expect(prompt).toContain('起点');
      expect(prompt).toContain('长篇');
      expect(prompt).toContain('核心卖点');
      expect(prompt).toContain('血脉觉醒');
      expect(prompt).toContain('题材专属约束');
      expect(prompt).toContain('【题材Profile】fantasy');
    });

    it('uses short-form direction hint for short seeds', () => {
      const seed: StorySeedCard = {
        id: '2',
        title: '短篇',
        oneLiner: '一句话',
        genre: '言情',
        hook: '钩子',
        coolPoint: '爽点',
        audience: 'female',
        length: 'short',
      };
      expect(buildPromptFromSeed(seed)).toContain('短篇完结');
    });
  });

  describe('insightToSeedConstraints', () => {
    it('passes full radar context', () => {
      const insight: GenreInsightCard = {
        id: 'i1',
        name: '脑洞直播',
        lifecycle: 'rising',
        audience: 'general',
        reason: '短视频时代读者偏好强设定',
        opportunity: '用直播规则做持续冲突引擎',
        hotTags: ['直播', '脑洞'],
        riskLevel: 'medium',
        riskNote: '同质化快',
        platform: 'fanqie',
        length: 'short',
        entryDifficulty: 'low',
        namePatterns: ['规则怪谈式书名'],
      };

      const constraints = insightToSeedConstraints(insight);
      expect(constraints.genre).toBe('脑洞直播');
      expect(constraints.platform).toBe('fanqie');
      expect(constraints.length).toBe('short');
      expect(constraints.insightContext?.opportunity).toContain('直播规则');
      expect(constraints.insightContext?.hotTags).toEqual(['直播', '脑洞']);
      expect(constraints.lockedSlots?.genre).toBe('脑洞直播');
      expect(constraints.insightContext?.entryDifficulty).toBe('low');
      expect(constraints.insightContext?.namePatterns?.[0]).toContain('规则');
    });
  });

  describe('prompt builders', () => {
    it('injects platform, length and insight context into seed user prompt', () => {
      const prompt = buildStorySeedsUserPrompt({
        count: 2,
        platform: 'fanqie',
        length: 'short',
        insightContext: {
          name: '规则怪谈',
          audience: 'general',
          opportunity: '用职场规则做生存副本',
          reason: '传播强',
          hotTags: ['规则', '职场'],
          riskLevel: 'medium',
          lifecycle: 'rising',
        },
      });
      expect(prompt).toContain('番茄');
      expect(prompt).toContain('短篇完结');
      expect(prompt).toContain('用职场规则做生存副本');
      expect(prompt).toContain('规则、职场');
    });

    it('injects genre profile hint into seed user prompt', () => {
      const prompt = buildStorySeedsUserPrompt({
        count: 2,
        genre: '修仙',
        genreSeedHint: {
          profileId: 'xianxia',
          name: '修仙',
          preferredHooks: ['神秘钩子', '冲突钩子'],
          preferredCoolPoints: ['境界突破', '打脸'],
          typicalOpening: '资质检测：开场资质检测引发冲突',
          commonRisks: ['战力崩塌（严格遵循战力表）'],
        },
      });
      expect(prompt).toContain('题材专属约束');
      expect(prompt).toContain('神秘钩子');
      expect(prompt).toContain('境界突破');
      expect(prompt).toContain('战力崩塌');
    });

    it('injects platform and length into radar user prompt', () => {
      const prompt = buildGenreInsightsUserPrompt({
        count: 3,
        platform: 'jinjiang',
        length: 'long',
        audience: 'female',
      });
      expect(prompt).toContain('晋江');
      expect(prompt).toContain('长篇连载');
      expect(prompt).toContain('女生向');
      expect(prompt).toContain('扫榜报告');
      expect(prompt).toContain('非实时榜单');
    });

    it('radar system prompt asks for scan-report fields', () => {
      const prompt = buildGenreInsightsSystemPrompt();
      expect(prompt).toContain('entryDifficulty');
      expect(prompt).toContain('platformBias');
      expect(prompt).toContain('namePatterns');
      expect(prompt).toContain('非实时榜单');
    });

    it('puts live ranking rows into the radar prompt and stops calling them non-live', () => {
      const rankScan: RankScanResult = {
        availability: 'live',
        fetchedAt: '2026-10-10T03:28:00.000Z',
        sampleCount: 1,
        boards: [
          {
            site: 'qidian',
            boardId: 'qidian-yuepiao',
            channel: 'male',
            status: 'ok',
            entries: [
              {
                rank: 1,
                title: '夜无疆',
                author: '辰东',
                genre: '玄幻',
                tags: ['玄幻', '东方玄幻'],
                wordCount: '413万字',
                blurb: '太阳落下',
              },
            ],
          },
        ],
      };
      const user = buildGenreInsightsUserPrompt({ count: 2, platform: 'qidian', rankScan });
      const system = buildGenreInsightsSystemPrompt({ useLiveRanks: true });
      expect(user).toContain('夜无疆');
      expect(user).toContain('起点月票榜');
      expect(user).not.toContain('非实时榜单');
      expect(system).toContain('公开榜单样本');
      expect(system).not.toContain('非实时榜单');
    });
  });

  describe('refreshGenreInsights rank samples', () => {
    const liveScan: RankScanResult = {
      availability: 'live',
      fetchedAt: '2026-10-10T03:28:00.000Z',
      sampleCount: 1,
      boards: [
        {
          site: 'qidian',
          boardId: 'qidian-yuepiao',
          channel: 'male',
          status: 'ok',
          entries: [
            {
              rank: 1,
              title: '夜无疆',
              author: '辰东',
              genre: '玄幻',
              tags: ['玄幻'],
              wordCount: '1万字',
              blurb: '',
            },
          ],
        },
      ],
    };

    beforeEach(() => {
      scanPublicRanksMock.mockClear();
      settingsState.aiProviders = [
        {
          id: 'p1',
          provider: 'openai',
          modelName: 'gpt-4o',
          enabled: true,
          apiKey: 'test-key',
        },
      ];
      settingsState.defaultModel = { providerId: 'p1', modelName: 'gpt-4o' };
    });

    it('feeds collected titles to the model and marks the batch as rank-backed', async () => {
      const chat = vi.fn(async (_system: string, user: string) => {
        expect(user).toContain('夜无疆');
        return JSON.stringify({
          insights: [
            {
              name: '东方玄幻',
              lifecycle: 'peak',
              audience: 'male',
              reason: '月票榜反复出现东方玄幻',
              opportunity: '用家族修仙做差异',
              hotTags: ['东方玄幻'],
              riskLevel: 'medium',
            },
          ],
        });
      });

      const batch = await refreshGenreInsights({ rankScan: liveScan, platform: 'qidian' }, chat);
      expect(batch.rankScanApplied).toBe(true);
      expect(batch.source).toBe('ai');
      expect(scanPublicRanksMock).not.toHaveBeenCalled();
    });

    it('does not scan when no model is configured', async () => {
      settingsState.aiProviders = [];
      settingsState.defaultModel = null;
      const batch = await refreshGenreInsights({ platform: 'qidian' });
      expect(batch.source).toBe('fallback');
      expect(batch.rankScanApplied).toBe(false);
      expect(scanPublicRanksMock).not.toHaveBeenCalled();
    });
  });

  describe('refreshStorySeeds without AI', () => {
    it('falls back when no provider configured', async () => {
      const batch = await refreshStorySeeds({ count: 3 });
      expect(batch.source).toBe('fallback');
      expect(batch.items.length).toBe(3);
      expect(batch.warning).toBeTruthy();
    });

    it('uses injected chat and exclude titles', async () => {
      const chat = vi.fn(async () =>
        JSON.stringify({
          seeds: [
            {
              title: '新种子A',
              oneLiner: '全新点子A',
              genre: '科幻',
              hook: 'hook',
              coolPoint: 'cool',
              audience: 'general',
            },
            {
              title: '新种子B',
              oneLiner: '全新点子B',
              genre: '悬疑',
              hook: 'hook',
              coolPoint: 'cool',
              audience: 'male',
            },
            {
              title: '新种子C',
              oneLiner: '全新点子C',
              genre: '言情',
              hook: 'hook',
              coolPoint: 'cool',
              audience: 'female',
            },
          ],
        }),
      );

      const batch = await refreshStorySeeds({ excludeTitles: ['旧标题'] }, chat);
      expect(batch.items.length).toBe(4);
      expect(chat).not.toHaveBeenCalled();
    });

    it('rethrows AbortError instead of falling back to local pool', async () => {
      settingsState.aiProviders = [
        {
          id: 'p1',
          provider: 'openai',
          modelName: 'gpt-4o',
          enabled: true,
          apiKey: 'test-key',
        },
      ];
      settingsState.defaultModel = { providerId: 'p1', modelName: 'gpt-4o' };

      const chat = vi.fn(async (_system: string, _user: string, _temp: number, signal?: AbortSignal) => {
        expect(signal).toBeDefined();
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      });

      const controller = new AbortController();
      await expect(
        refreshStorySeeds({ count: 2, signal: controller.signal }, chat),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(chat).toHaveBeenCalled();
    });

    it('按每条种子自己的题材匹配 Profile', async () => {
      settingsState.aiProviders = [
        {
          id: 'p1',
          provider: 'openai',
          modelName: 'gpt-4o',
          enabled: true,
          apiKey: 'test-key',
        },
      ];
      settingsState.defaultModel = { providerId: 'p1', modelName: 'gpt-4o' };
      const chat = vi.fn(async () =>
        JSON.stringify({
          seeds: [
            {
              title: '凡骨登仙',
              oneLiner: '资质平庸的少年在宗门大比前夜被迫对赌。',
              genre: '玄幻',
              hook: '退婚当场',
              coolPoint: '当众打脸',
              audience: 'male',
            },
            {
              title: '深夜出租屋',
              oneLiner: '程序员在加班夜发现公司账本能改写现实。',
              genre: '都市',
              hook: '加班夜',
              coolPoint: '当众揭账',
              audience: 'male',
            },
          ],
        }),
      );

      const batch = await refreshStorySeeds({ count: 2, genre: '玄幻' }, chat);
      expect(batch.source).toBe('ai');
      expect(batch.items.find(item => item.genre === '玄幻')?.genreProfileId).toBe('fantasy');
      expect(batch.items.find(item => item.genre === '都市')?.genreProfileId).toBe('urban');
    });
  });

  describe('playStyle fallbacks and prompts', () => {
    it('builds mix fallback seeds with collision hint', () => {
      const seeds = buildFallbackStorySeeds({
        count: 2,
        playStyle: 'mix',
        mixTags: ['修仙'],
        mixElements: ['系统流'],
      });
      expect(seeds).toHaveLength(2);
      expect(seeds[0].oneLiner).toMatch(/修仙|系统流/);
    });

    it('injects secondary mix genre hints into the AI user prompt', async () => {
      settingsState.aiProviders = [
        { id: 'p1', provider: 'openai', modelName: 'gpt-4o', enabled: true, apiKey: 'test-key' },
      ];
      settingsState.defaultModel = { providerId: 'p1', modelName: 'gpt-4o' };
      const userPrompts: string[] = [];
      const chat = vi.fn(async (_system: string, user: string) => {
        userPrompts.push(user);
        return JSON.stringify({
          seeds: [
            {
              title: '宗门守则',
              oneLiner: '外门弟子发现宗门守则第七条会吃人。',
              genre: '修仙',
              hook: '守则',
              coolPoint: '破解规则',
              audience: 'male',
            },
          ],
        });
      });

      await refreshStorySeeds(
        {
          count: 1,
          playStyle: 'mix',
          genre: '修仙',
          mixTags: ['修仙', '规则怪谈'],
          mixElements: ['任务系统'],
        },
        chat
      );

      expect(chat).toHaveBeenCalled();
      const prompt = userPrompts[0];
      expect(prompt).toContain('首个为主题材');
      expect(prompt).toContain('混搭副题材读者预期');
      expect(prompt).toContain('「规则怪谈」偏好钩子');
      expect(prompt).not.toContain('「修仙」偏好钩子');
    });

    it('builds dice fallback seeds from roll faces', () => {
      const seeds = buildFallbackStorySeeds({
        count: 2,
        playStyle: 'dice',
        diceRoll: { genre: '末世', hook: '倒计时危机', twist: '系统坏掉了' },
      });
      expect(seeds).toHaveLength(2);
      expect(seeds[0].hook).toContain('倒计时危机');
    });

    it('attaches profile-driven fields when genre is locked', () => {
      const seeds = buildFallbackStorySeeds({
        count: 1,
        genre: '修仙',
      });
      expect(seeds[0].genreProfileId).toBe('xianxia');
      expect(seeds[0].sellPoint).toBeTruthy();
      expect(seeds[0].mechanism).toBeTruthy();
    });

    it('fills brokenTrope for twist style', () => {
      const seeds = buildFallbackStorySeeds({
        count: 1,
        playStyle: 'twist',
        genre: '都市',
      });
      expect(seeds[0].brokenTrope).toBeTruthy();
    });

    it('twist style keeps anti-trope oneLiner when insight is locked', () => {
      const seeds = buildFallbackStorySeeds({
        count: 1,
        playStyle: 'twist',
        insightContext: {
          name: '规则怪谈',
          audience: 'general',
          opportunity: '用职场规则做生存副本',
          reason: '传播强',
          hotTags: ['规则', '职场'],
          riskLevel: 'medium',
          lifecycle: 'rising',
        },
      });
      expect(seeds[0].genre).toBe('规则怪谈');
      // 反套路特征保留（修复前 insight 分支后置会覆盖掉 twist 文案）
      expect(seeds[0].oneLiner).toMatch(/不按剧本|反套路|看似经典/);
      expect(seeds[0].brokenTrope).toBeTruthy();
    });
  });

  describe('buildTopicDiscoveryProjectSeed', () => {
    it('captures seed fields and resolves genreProfileId', () => {
      const seed: StorySeedCard = {
        id: 'seed-1',
        title: '凡骨登仙',
        oneLiner: '一句话故事核',
        genre: '修仙',
        hook: '开篇冲突',
        coolPoint: '打脸',
        audience: 'male',
        platform: 'qidian',
        length: 'long',
        sellPoint: '资质翻盘',
        mechanism: '上古传承',
      };
      const projectSeed = buildTopicDiscoveryProjectSeed(seed, 'seeds');
      expect(projectSeed.seedId).toBe('seed-1');
      expect(projectSeed.genre).toBe('修仙');
      expect(projectSeed.platform).toBe('qidian');
      expect(projectSeed.sellPoint).toBe('资质翻盘');
      expect(projectSeed.mechanism).toBe('上古传承');
      expect(projectSeed.genreProfileId).toBe('xianxia');
      expect(projectSeed.sourceTab).toBe('seeds');
      expect(projectSeed.capturedAt).toBeTruthy();
    });
  });

  describe('scan helpers', () => {
    it('maps Chinese platform bias list', () => {
      expect(mapPlatformBiasList(['起点', '番茄', '飞卢'])).toEqual(['qidian', 'fanqie']);
    });

    it('infers entry difficulty from lifecycle and risk', () => {
      expect(inferEntryDifficulty('saturated', 'high')).toBe('high');
      expect(inferEntryDifficulty('rising', 'low')).toBe('low');
      expect(inferEntryDifficulty('peak', 'medium')).toBe('medium');
    });
  });
});
