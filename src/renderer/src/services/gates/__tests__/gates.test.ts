/**
 * @vitest-environment happy-dom
 *
 * L5 门禁层单元测试
 *
 * 重点验证 G3（核心一致性门禁）和流水线智能决策。
 * 这是 M1 里程碑"防幻觉能力质变"的验收依据。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConsistencyGatePipeline,
  Gate1Protocol,
  Gate2Reference,
  Gate3Consistency,
  Gate5Blueprint,
  Gate6Entity,
  Gate7Semantic,
  setGate7LLMClient,
} from '../index';
import { createEmptyChanges } from '../../state/ChangesProtocol';
import type { GateContext } from '../types';
import type { StateSnapshot, ChangesPayload, Change } from '../../state/types';

// ============================================================
// 工具：构建测试上下文
// ============================================================

function makeSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    projectId: 'test',
    chapter: 0,
    characters: {
      char_001: {
        entityId: 'char_001',
        name: '林动',
        powerLevel: '练气一层',
        abilities: [],
        mentalState: '',
        role: '主角',
        alive: true,
        lastUpdatedChapter: 0,
      },
    },
    characterAppearances: {
      char_001: {
        entityId: 'char_001',
        features: ['黑发', '黑瞳'],
        personalityTags: ['热血', '坚韧'],
        speakingStyle: '直接',
      },
    },
    relationships: {},
    characterLocations: { char_001: 'loc_001' },
    conflicts: {},
    foreshadows: {
      fs_001: {
        id: 'fs_001',
        hint: '断剑嗡鸣',
        tier: 'major',
        status: 'setup',
        setupChapter: 1,
        relatedEntities: [],
      },
    },
    plotNodes: [],
    locations: {
      loc_001: { id: 'loc_001', name: '青云宗', status: '正常', lastUpdatedChapter: 0 },
    },
    locationFeatures: {},
    factions: {},
    timeline: { currentTime: '', elapsed: '', currentChapter: 0, anchors: [] },
    worldRules: [
      { id: 'wr_001', name: '凡人不可飞行', rule: '未达筑基不能御空飞行', violationConsequence: '', absolute: true },
    ],
    items: {},
    secrets: {},
    oaths: {},
    deadlines: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    chapter: 1,
    prose: '林动盘膝而坐，开始修炼。',
    changes: createEmptyChanges(1),
    snapshot: makeSnapshot(),
    ...overrides,
  };
}

function makeChange(partial: Partial<Change> & { type: Change['type'] }): Change {
  return partial as Change;
}

// ============================================================
// G1 协议解析
// ============================================================

describe('Gate1Protocol', () => {
  const gate = new Gate1Protocol();

  it('空 CHANGES 通过', async () => {
    const ctx = makeContext();
    const result = await gate.run(ctx, gate['requiresLLM'] as any || {} as any);
    expect(result.passed).toBe(true);
  });

  it('版本不匹配报 high', async () => {
    const ctx = makeContext({
      changes: { version: '0.9' as any, chapter: 1, changes: [] },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.description.includes('版本'))).toBe(true);
  });

  it('章节号不匹配报 medium', async () => {
    const ctx = makeContext({
      chapter: 5,
      changes: { version: '1.0', chapter: 3, changes: [] },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.description.includes('章节号'))).toBe(true);
  });
});

// ============================================================
// G2 引用校验
// ============================================================

describe('Gate2Reference', () => {
  const gate = new Gate2Reference();

  it('引用存在的实体通过', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel', old: '练气一层', new: '练气二层',
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.passed).toBe(true);
  });

  it('引用不存在的实体 ID 报 high', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_999', name: '不存在', type: 'character' },
          field: 'powerLevel', new: '练气二层',
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.description.includes('char_999'))).toBe(true);
  });
});

// ============================================================
// G3 结构一致性（核心门禁）
// ============================================================

describe('Gate3Consistency', () => {
  const gate = new Gate3Consistency();

  it('CHANGES 的 old 与快照一致 → 通过', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '练气一层',
          new: '练气二层',
          evidence: '林动盘膝而坐',
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.passed).toBe(true);
  });

  it('CHANGES 的 old 与快照不符 → critical', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '元婴期',  // 快照实际是练气一层
          new: '化神期',
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.passed).toBe(false);
    const critical = result.issues.find(i => i.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical?.description).toContain('练气一层');
  });

  it('死人复活 → critical', async () => {
    const ctx = makeContext({
      snapshot: makeSnapshot({
        characters: {
          char_001: {
            ...makeSnapshot().characters.char_001,
            alive: false,
          },
        },
      }),
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'alive', old: false, new: true,
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'critical' && i.description.includes('死亡'))).toBe(true);
  });

  it('回收未埋设的伏笔 → critical', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'foreshadow',
          id: 'fs_not_exists',
          hint: '不存在',
          action: 'payoff',
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
  });

  it('evidence 在正文找不到 → medium', async () => {
    const ctx = makeContext({
      prose: '林动开始修炼。',
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel', old: '练气一层', new: '练气二层',
          evidence: '这段正文里根本不存在的描述文字测试',
        })],
      },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'medium' && i.description.includes('evidence'))).toBe(true);
  });
});

// ============================================================
// G5 蓝图出场
// ============================================================

describe('Gate5Blueprint', () => {
  const gate = new Gate5Blueprint();

  it('mustCover 未覆盖 → critical', async () => {
    const ctx = makeContext({
      prose: '林动修炼。',
      blueprint: { mustCover: ['与师父对话', '获得功法'] },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'critical' && i.category === 'blueprint')).toBe(true);
  });

  it('forbiddenZones 出现 → critical', async () => {
    const ctx = makeContext({
      prose: '林动突然圣母心大发，原谅了所有人。',
      blueprint: { forbiddenZones: ['圣母心'] },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'critical' && i.description.includes('圣母心'))).toBe(true);
  });

  it('requiredCharacters 缺席 → high', async () => {
    const ctx = makeContext({
      prose: '林动独自修炼，没有其他人。',
      blueprint: { requiredCharacters: ['林动', '师父'] },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'high' && i.description.includes('师父'))).toBe(true);
  });
});

// ============================================================
// G6 未知实体
// ============================================================

describe('Gate6Entity', () => {
  const gate = new Gate6Entity();

  it('引入少量未知实体通过', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [
          makeChange({
            type: 'character_state',
            entity: { name: '新角色A', type: 'character' },
            field: 'role', new: '配角',
          }),
        ],
      },
    });
    const result = await gate.run(ctx, {} as any);
    // 1 个新实体 < 阈值 5，应该通过（但有 low warning）
    expect(result.passed).toBe(true);
  });

  it('引入过多未知实体 → critical', async () => {
    const newChars = Array.from({ length: 7 }, (_, i) =>
      makeChange({
        type: 'character_state',
        entity: { name: `新角色${i}`, type: 'character' },
        field: 'role', new: '配角',
      }),
    );
    const ctx = makeContext({
      changes: { version: '1.0', chapter: 1, changes: newChars },
    });
    const result = await gate.run(ctx, {} as any);
    expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
  });
});

// ============================================================
// G7 LLM 语义门禁
// ============================================================

describe('Gate7Semantic', () => {
  const gate = new Gate7Semantic();

  afterEach(() => setGate7LLMClient(null));

  it('未注入客户端 → 跳过（通过）', async () => {
    setGate7LLMClient(null);
    const ctx = makeContext();
    const result = await gate.run(ctx, { enableSemanticGate: true } as any);
    expect(result.passed).toBe(true);
    expect(result.stats?.skipped).toBe('no_client');
  });

  it('禁用 G7 → 跳过', async () => {
    const ctx = makeContext();
    const result = await gate.run(ctx, { enableSemanticGate: false } as any);
    expect(result.passed).toBe(true);
    expect(result.stats?.skipped).toBe('disabled');
  });

  it('解析 LLM 输出为问题列表', async () => {
    setGate7LLMClient({
      async review() {
        return JSON.stringify({
          issues: [
            {
              type: 'fact_conflict',
              severity: 'critical',
              location: '第2段',
              description: '林动说自己从没去过京城，但回忆了京城街景',
              evidence: '林动喃喃道：京城的酒楼...',
              fact_reference: '林动位置=青云宗',
            },
          ],
        });
      },
    });
    const ctx = makeContext();
    const result = await gate.run(ctx, { enableSemanticGate: true } as any);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.severity === 'critical' && i.description.includes('京城'))).toBe(true);
  });

  it('LLM 返回空 issues → 通过', async () => {
    setGate7LLMClient({
      async review() {
        return '{"issues":[]}';
      },
    });
    const ctx = makeContext();
    const result = await gate.run(ctx, { enableSemanticGate: true } as any);
    expect(result.passed).toBe(true);
  });

  it('LLM 异常 → 降级通过', async () => {
    setGate7LLMClient({
      async review() {
        throw new Error('LLM 超时');
      },
    });
    const ctx = makeContext();
    const result = await gate.run(ctx, { enableSemanticGate: true } as any);
    expect(result.passed).toBe(true);
    expect(result.error).toBeDefined();
  });

  it('已有 chapterJudgeResult 时复用结果且不调旧 LLM 客户端', async () => {
    const review = vi.fn(async () => '{"issues":[]}');
    setGate7LLMClient({ review });
    const ctx = makeContext({
      chapterJudgeResult: {
        fulfillment: [],
        forbidden: [],
        issues: [
          {
            type: 'ooc',
            severity: 'high',
            location: '对话',
            description: '人设崩坏',
            evidence: ['……'],
          },
        ],
      },
    });
    const result = await gate.run(ctx, { enableSemanticGate: true } as any);
    expect(review).not.toHaveBeenCalled();
    expect(result.stats?.source).toBe('chapter-judge');
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.description.includes('人设崩坏'))).toBe(true);
  });
});

describe('ConsistencyGatePipeline + ChapterJudge 去重', () => {
  it('预跑 ChapterJudge 仅一次，G5 与 G7 共用结果', async () => {
    const judge = {
      judge: vi.fn(async () => ({
        fulfillment: [
          {
            node: '与师父对话',
            fulfilled: true,
            evidence: ['他向玄清请教'],
            reason: '语义兑现',
          },
        ],
        forbidden: [],
        issues: [
          {
            type: 'timeline',
            severity: 'medium',
            location: '结尾',
            description: '时间跨度含糊',
            evidence: [],
          },
        ],
      })),
    };
    const pipeline = new ConsistencyGatePipeline({
      enableSemanticGate: true,
      chapterJudge: judge,
    });
    const ctx = makeContext({
      prose: '他向玄清请教功法，随后离去。'.repeat(80),
      blueprint: { mustCover: ['与师父对话'], forbiddenZones: [] },
      changes: {
        version: '1.0',
        chapter: 1,
        changes: [],
      },
    });
    const result = await pipeline.run(ctx);
    expect(judge.judge).toHaveBeenCalledOnce();
    const g7 = result.gates.find(g => g.gateId === 'G7');
    expect(g7?.stats?.source).toBe('chapter-judge');
    expect(g7?.issues.some(i => i.description.includes('时间跨度'))).toBe(true);
  });
});

// ============================================================
// ConsistencyGatePipeline 流水线
// ============================================================

describe('ConsistencyGatePipeline', () => {
  let pipeline: ConsistencyGatePipeline;

  beforeEach(() => {
    pipeline = new ConsistencyGatePipeline({ enableSemanticGate: false });
  });

  it('全部通过 → accept', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel', old: '练气一层', new: '练气二层',
          evidence: '林动盘膝',
        })],
      },
    });
    const result = await pipeline.run(ctx);
    expect(result.passed).toBe(true);
    expect(result.decision.nextAction).toBe('accept');
  });

  it('G3 critical → rewrite', async () => {
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '错误的旧值',
          new: '练气二层',
        })],
      },
    });
    const result = await pipeline.run(ctx);
    expect(result.passed).toBe(false);
    expect(result.hasBlocking).toBe(true);
    expect(result.decision.nextAction).toBe('rewrite');
  });

  it('G1 协议 critical → 短路后续门禁', async () => {
    const ctx = makeContext({
      changes: { version: '0.5' as any, chapter: 1, changes: [] },
    });
    const result = await pipeline.run(ctx);
    // G1 应该失败，后续门禁标记为 skipped
    const g1 = result.gates.find(g => g.gateId === 'G1');
    expect(g1?.passed).toBe(false);
    const g3 = result.gates.find(g => g.gateId === 'G3');
    expect(g3?.stats?.skipped).toBe('g1_failed');
  });

  it('runDeterministicOnly 跳过 G7', async () => {
    const ctx = makeContext();
    const result = await pipeline.runDeterministicOnly(ctx);
    const gateIds = result.gates.map(g => g.gateId);
    expect(gateIds).not.toContain('G7');
    expect(gateIds).toContain('G1');
    expect(gateIds).toContain('G6');
  });

  it('仅 low 问题 → accept', async () => {
    // 触发 low：缺少 evidence
    const ctx = makeContext({
      changes: {
        version: '1.0', chapter: 1,
        changes: [makeChange({
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel', old: '练气一层', new: '练气二层',
          // 无 evidence → G1 报 low
        })],
      },
    });
    const result = await pipeline.runDeterministicOnly(ctx);
    expect(result.passed).toBe(true);
    // 应该有 low 问题但通过
    expect(result.allIssues.some(i => i.severity === 'low')).toBe(true);
  });
});
