import { describe, expect, it } from 'vitest';

import {
  buildChainedCbn,
  sanitizeInheritedCbn,
} from '../chapterBlueprintNormalize';
import {
  detectMustCoverForbiddenConflicts,
  enrichRevisionHint,
  healChapterContract,
  isForbiddenExemptForFulfillment,
  pruneFulfilledNodes,
  softenConflictingForbidden,
} from '../contractHealth';
import { makeContracts, makeState } from './testFixtures';

describe('contractHealth', () => {
  it('检测 mustCover×禁区揭示冲突并软化', () => {
    const mustCover = ['当众指出凶手是县令公子'];
    const forbidden = [
      '不能揭示盐铁走私网的全貌',
      '不能让主角提前获得外界帮助',
      '不能提前展示秋月案的全部真相',
    ];
    const conflicts = detectMustCoverForbiddenConflicts(mustCover, forbidden);
    expect(conflicts.some(item => item.kind === 'reveal')).toBe(true);
    expect(conflicts.some(item => item.forbidden.includes('全部真相'))).toBe(true);

    const { forbidden: softened, softened: changed } = softenConflictingForbidden(
      forbidden,
      conflicts
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(softened.some(zone => zone.includes('允许必要指认'))).toBe(true);
    expect(softened.some(zone => zone.includes('盐铁'))).toBe(true);
  });

  it('清洗套娃 CBN：承接上章结尾：推进至：…', () => {
    const result = sanitizeInheritedCbn('承接上章结尾：推进至：穿越醒来正在验尸', {
      cpns: ['当众指出凶手是县令公子'],
    });
    expect(result.changed).toBe(true);
    expect(result.cbn).not.toMatch(/推进至[：:]/u);
    expect(result.cbn).toContain('当众指出凶手是县令公子');
  });

  it('buildChainedCbn 剥离推进至前缀', () => {
    expect(buildChainedCbn('推进至：穿越醒来正在验尸', '清河翻案')).toBe(
      '承接上章结尾：穿越醒来正在验尸'
    );
    expect(buildChainedCbn('', '清河翻案')).toBe('承接前段：清河翻案');
  });

  it('按上章事件去重 mustCover', () => {
    const { kept, pruned } = pruneFulfilledNodes(
      ['当众指出凶手是县令公子', '被反诬入狱'],
      {
        priorEventSummaries: [
          '宋辞当众指出凶手是刘文韬，刘文韬反诬宋辞，命家丁将其拿下并送入大牢',
        ],
      }
    );
    expect(pruned).toContain('当众指出凶手是县令公子');
    expect(kept).toContain('被反诬入狱');
  });

  it('healChapterContract 综合清洗', () => {
    const contracts = makeContracts();
    contracts.chapter.CBN = '承接上章结尾：推进至：穿越醒来正在验尸';
    contracts.chapter.CPNs = ['当众指出凶手是县令公子'];
    contracts.chapter.mustCover = ['当众指出凶手是县令公子'];
    contracts.chapter.forbidden = [
      '不能提前展示秋月案的全部真相',
      '不能让主角提前获得外界帮助',
    ];

    const state = makeState();
    state.events = [
      {
        id: 'chapter-1:event:2',
        chapter: 1,
        sceneId: 'chapter-1:scene',
        type: '指控冲突',
        summary: '宋辞当众指出凶手是刘文韬，刘文韬反诬宋辞，命家丁将其拿下并送入大牢',
        participants: [],
        causes: [],
        effects: [],
        evidence: [],
      },
    ];

    const { chapter, report } = healChapterContract(contracts.chapter, { state });
    expect(report.cbnSanitized).toBe(true);
    expect(chapter.CBN).not.toMatch(/推进至[：:]/u);
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(chapter.forbidden.some(zone => zone.includes('允许必要指认'))).toBe(true);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it('enrichRevisionHint 给出负例与正向替代', () => {
    const hint = enrichRevisionHint('触发本章禁区：不能让主角提前获得外界帮助', [
      '黑衣人递进干粮和金疮药',
    ]);
    expect(hint).toContain('【禁止】');
    expect(hint).toContain('【改为】');
  });

  it('履约豁免：指认类禁区触发可放过', () => {
    expect(
      isForbiddenExemptForFulfillment(
        '不能提前展示秋月案的全部真相（本章为履约「当众指出凶手是县令公子」允许必要指认与证据展示；禁止提前完结翻案）',
        ['当众指出凶手是县令公子'],
        '通过验尸证据当众指出刘文韬是凶手'
      )
    ).toBe(true);
  });
});
