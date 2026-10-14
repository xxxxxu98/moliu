/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest';
import { sanitizeUnconfirmedDeathDeltas, sanitizeUnconfirmedVerdictDeltas } from '../FactExtractor';
import type { ExtractedFacts } from '@/types/story-runtime';

function makeFacts(
  deltas: Array<{ path: string; value: unknown; evidence: string | string[] }>,
  evidence: string[] = []
): ExtractedFacts {
  return {
    events: [],
    deltas: deltas as ExtractedFacts['deltas'],
    evidence,
  } as unknown as ExtractedFacts;
}

const ENTITIES = {
  'char-hero': { id: 'char-hero', name: '顾青舟', aliases: [] },
  'char-villain': { id: 'char-villain', name: '严世宽', aliases: ['严运使'] },
};

describe('sanitizeUnconfirmedDeathDeltas', () => {
  it('判词/威胁语境的死亡 status 被丢弃（替死鬼开局反噬回归样本）', () => {
    const facts = makeFacts([
      {
        path: 'characters.char-hero.attributes.status',
        value: '死亡',
        evidence: ['监斩官宣读：判斩立决，午时三刻行刑！'],
      },
    ]);
    const out = sanitizeUnconfirmedDeathDeltas(facts, ENTITIES);
    expect(out.deltas).toHaveLength(0);
  });

  it('假设/盘算语气的结果句不作为死亡证据（第五轮治水书ch2受害样本）', () => {
    const facts = makeFacts([
      {
        path: 'characters.char-hero.attributes.status',
        value: '死亡',
        evidence: ['杀了陆承安不过是向上头交差抵罪，但三日后淮西彻底淹没，自己照样人头落地。'],
      },
    ]);
    const out = sanitizeUnconfirmedDeathDeltas(facts, ENTITIES);
    expect(out.deltas).toHaveLength(0);
  });

  it('只要/便会型条件句的结果词不作为死亡证据（百章双开r1 ch13受害样本）', () => {
    const facts = makeFacts([
      {
        path: 'characters.char-hero.attributes.status',
        value: '死亡',
        evidence: ['只要统领手腕稍一用力，顾青舟的头颅便会当场落地。'],
      },
    ]);
    const out = sanitizeUnconfirmedDeathDeltas(facts, ENTITIES);
    expect(out.deltas).toHaveLength(0);
  });

  it('带结果完成体证据的死亡 status 保留（头颅滚落/气绝）', () => {
    const facts = makeFacts([
      {
        path: 'characters.char-villain.attributes.status',
        value: '死亡',
        evidence: ['刀光落下，严世宽的头颅滚落高台。'],
      },
      {
        path: 'characters.char-hero.attributes.status',
        value: '死亡',
        evidence: ['老者收殓了顾青舟的遗体。'],
      },
    ]);
    const out = sanitizeUnconfirmedDeathDeltas(facts, ENTITIES);
    expect(out.deltas).toHaveLength(2);
  });

  it('自身证据无结果词但顶层证据中角色名邻近完成体信号时保留', () => {
    const facts = makeFacts(
      [
        {
          path: 'characters.char-villain.attributes.status',
          value: '死亡',
          evidence: ['被押赴刑场'],
        },
      ],
      ['监斩官喝令行刑，严运使当场毙命于万民围观之下。']
    );
    const out = sanitizeUnconfirmedDeathDeltas(facts, ENTITIES);
    // 别名「严运使」→ char-villain；毙命在名字 ±30 字窗口内
    expect(out.deltas).toHaveLength(1);
  });

  it('顶层证据里他人死亡的完成体不 rescuing 另一角色的无证据 delta', () => {
    const facts = makeFacts(
      [
        {
          path: 'characters.char-hero.attributes.status',
          value: '死亡',
          evidence: ['被判死刑'],
        },
      ],
      ['乱军之中一名小卒暴毙身亡。']
    );
    const out = sanitizeUnconfirmedDeathDeltas(facts, ENTITIES);
    expect(out.deltas).toHaveLength(0);
  });
});

describe('sanitizeUnconfirmedVerdictDeltas（定罪完成体判据）', () => {
  const verdictDelta = (value: string, evidence: string) => ({
    operation: 'set' as const,
    path: 'characters.char-1.attributes.status',
    value,
    evidence,
  });

  it('r22a ch1 形态：斩立决朱批（过程态）→ 定罪 delta 被丢弃', () => {
    const facts = makeFacts([
      verdictDelta('定罪', '今三法司勘核无误，请得朱批，斩立决'),
    ]);
    const out = sanitizeUnconfirmedVerdictDeltas(facts);
    expect(out.deltas).toHaveLength(0);
  });

  it('当堂定谳完成体 → 保留', () => {
    const facts = makeFacts([
      verdictDelta('定罪', '三法司当堂定谳，罪名成立，即行收监'),
    ]);
    const out = sanitizeUnconfirmedVerdictDeltas(facts);
    expect(out.deltas).toHaveLength(1);
  });

  it('非定罪 value 与无证据定罪（不确定保守保留）不受影响', () => {
    const facts = makeFacts([
      verdictDelta('下狱', '押入死牢'),
      verdictDelta('定罪', ''),
    ]);
    const out = sanitizeUnconfirmedVerdictDeltas(facts);
    expect(out.deltas).toHaveLength(2);
  });
});
