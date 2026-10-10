import { describe, expect, it } from 'vitest';

import { coerceIdString, extractedFactsSchema, parseSchema, storyStateSchema } from '../schemas';
import { makeState } from './testFixtures';

describe('extractedFactsSchema 顶层裸数组容错', () => {
  it('模型返回裸数组（元素像 event）时分类包装为 {events, deltas, evidence}', () => {
    const raw = [
      {
        id: 'chapter-2:event:1',
        chapter: 2,
        sceneId: 'chapter-2:CBN:scene',
        type: 'conflict',
        summary: '主角夺路而逃',
        participants: ['char-hero'],
        causes: [],
        effects: ['逃脱'],
        evidence: ['主角夺路而逃'],
      },
    ];

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].summary).toBe('主角夺路而逃');
    expect(parsed.deltas).toEqual([]);
    expect(parsed.evidence).toEqual([]);
  });

  it('裸数组元素是 delta（含 operation/path）时归入 deltas', () => {
    const raw = [
      {
        operation: 'set',
        path: 'inventory.char-1.银两',
        value: 5,
        evidence: '清点银两',
      },
    ];

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.deltas).toHaveLength(1);
    expect(parsed.deltas[0].path).toBe('inventory.char-1.银两');
    expect(parsed.events).toEqual([]);
  });

  it('裸数组元素是字符串时归入 evidence', () => {
    const raw = ['正文原句一', '正文原句二', '   '];

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toEqual([]);
    expect(parsed.deltas).toEqual([]);
    expect(parsed.evidence).toEqual(['正文原句一', '正文原句二']);
  });

  it('混合裸数组按元素特征分流', () => {
    const raw = [
      { summary: '事件A', id: 'e1', chapter: 1, sceneId: 's1', type: 't', participants: [], causes: [], effects: [], evidence: [] },
      { operation: 'set', path: 'inventory.hero.银两', value: 3, evidence: 'x' },
      '一段正文证据',
      { 无特征对象: true },
    ];

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.deltas).toHaveLength(1);
    expect(parsed.evidence).toEqual(['一段正文证据']);
  });
});

describe('extractedFactsSchema participants 容错', () => {
  it('coerceIdString 支持字符串与 {id,name} 对象', () => {
    expect(coerceIdString('主角')).toBe('主角');
    expect(coerceIdString({ id: 'char-1', name: '主角' })).toBe('char-1');
    expect(coerceIdString({ name: '反派甲' })).toBe('反派甲');
    expect(coerceIdString({})).toBeUndefined();
  });

  it('participants / causes 为对象数组时仍可通过校验', () => {
    const raw = {
      events: [
        {
          id: 'chapter-3:event:1',
          chapter: 3,
          sceneId: 'chapter-3:CBN:scene',
          type: 'conflict',
          summary: '主角被栽赃财物失窃再次入狱',
          participants: [
            { id: 'char-hero', name: '主角' },
            { name: '爪牙甲' },
            '反派甲',
          ],
          causes: [{ id: 'chapter-2:CBN:event:11' }, 'chapter-2:CBN:event:10'],
          effects: ['再次入狱'],
          evidence: ['爪牙甲冷笑一声：“无罪？你偷了库房'],
        },
      ],
      deltas: [],
      evidence: ['爪牙甲冷笑一声：“无罪？你偷了库房'],
    };

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].participants).toEqual(['char-hero', '爪牙甲', '反派甲']);
    expect(parsed.events[0].causes).toEqual([
      'chapter-2:CBN:event:11',
      'chapter-2:CBN:event:10',
    ]);
  });
});

describe('extractedFactsSchema 顶层缺失字段软兜底', () => {
  it('模型只返回 events（缺 deltas/evidence）不再抛错，缺失数组回填 []', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'conflict',
          summary: '主角入狱',
          participants: ['char-hero'],
          causes: [],
          effects: ['入狱'],
          evidence: ['正文原句'],
        },
      ],
      // 缺 deltas 和 evidence
    };

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.deltas).toEqual([]); // 软兜底为空数组
    expect(parsed.evidence).toEqual([]); // 软兜底为空数组
  });

  it('完全空对象 {} 能通过校验，全部字段回填 []', () => {
    const parsed = parseSchema(extractedFactsSchema, {}, '事实提取结果');
    expect(parsed.events).toEqual([]);
    expect(parsed.deltas).toEqual([]);
    expect(parsed.evidence).toEqual([]);
  });

  it('字段值为非数组（如 null/string）也回填 []', () => {
    const raw = {
      events: null,
      deltas: 'not an array',
      evidence: undefined,
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toEqual([]);
    expect(parsed.deltas).toEqual([]);
    expect(parsed.evidence).toEqual([]);
  });

  it('内层 event 缺核心字段（无 summary）时丢弃该元素，不再整章崩', () => {
    // 语义升级（2026-08-17）：元素级缺陷从「整章抛错靠重试碰运气」降级为
    // 「丢弃/修复该元素」——弱模型（gemini 矩阵实测）会偶发返回缺字段的元素，
    // 整章失败会拖垮批量续写的持久错误重试额度。
    const raw = {
      events: [
        {
          // 缺 id/sceneId/summary 等必填字段
          chapter: 1,
          summary: '',
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toEqual([]);
  });

  it('内层 event 缺 type/participants 等非核心字段时补默认值救回（gemini ch3 真实回归）', () => {
    // 2026-08-17 矩阵实测：gemini ch3 事实提取返回 events[0] 缺 type/summary/participants，
    // zod 硬拒「expected string, received undefined」→ 持久错误重试。
    // 有 summary 的元素应被救回（补 type='event'、participants=[] 等），
    // 只有 summary 也缺的才丢弃。
    const raw = {
      events: [
        {
          id: 'chapter-3:event:1',
          chapter: 3,
          sceneId: 'chapter-3:CBN:scene',
          // 缺 type / participants / causes / effects / evidence
          summary: '陆渊识破绝笔信夹层中的底单',
        },
        {
          // 这条连 summary 都缺 → 丢弃
          id: 'chapter-3:event:2',
          chapter: 3,
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].summary).toBe('陆渊识破绝笔信夹层中的底单');
    expect(parsed.events[0].type).toBe('event');
    expect(parsed.events[0].participants).toEqual([]);
  });

  it('内层 delta 缺 operation/evidence 时补默认值，缺 path 时丢弃', () => {
    const raw = {
      events: [],
      deltas: [
        { path: 'inventory.hero.银两', value: 5 }, // 缺 operation/evidence → 救回
        { operation: 'set', value: 1 }, // 缺 path → 丢弃
      ],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.deltas).toHaveLength(1);
    expect(parsed.deltas[0].operation).toBe('set');
    expect(typeof parsed.deltas[0].evidence).toBe('string');
  });

  it('delta.transition 只保留合法枚举，非法值丢弃且不拒整条', () => {
    const raw = {
      events: [],
      deltas: [
        {
          operation: 'set',
          path: 'characters.hero.attributes.status',
          value: '下狱',
          transition: 'recapture',
          evidence: '再次收监',
        },
        {
          operation: 'set',
          path: 'characters.hero.attributes.status',
          value: '死亡',
          transition: '随便写',
          evidence: '气绝',
        },
        {
          operation: 'set',
          path: 'characters.hero.attributes.identity',
          value: '当朝三皇子恭王',
          transition: 'reveal-identity',
          evidence: '当众揭晓',
        },
      ],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.deltas[0].transition).toBe('recapture');
    expect(parsed.deltas[1].transition).toBeUndefined();
    expect(parsed.deltas[2].transition).toBe('reveal-identity');
  });
});

describe('extractedFactsSchema evidence 嵌套数组容错', () => {
  it('event.evidence 含嵌套数组时递归展平，不再整章崩', () => {
    // 真实回归：smoke:storyflow:real 实测——fact-extraction 偶发返回
    // events[4].evidence[4] 为 array（而非 string），触发
    // ✖ Invalid input: expected string, received array → 持久错误重试。
    // 这里把 evidence 写成嵌套数组，coerceStringArray 应递归展平为 string[]。
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'conflict',
          summary: '主角入狱',
          participants: ['char-hero'],
          causes: [],
          effects: ['入狱'],
          evidence: [
            '正文原句一',
            ['正文原句二', '正文原句三'], // 嵌套数组
            '正文原句四',
            [['深度嵌套原句']], // 双层嵌套
          ],
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].evidence).toEqual([
      '正文原句一',
      '正文原句二',
      '正文原句三',
      '正文原句四',
      '深度嵌套原句',
    ]);
  });

  it('event.evidence 为字符串（非数组）时容错为单元素数组', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'conflict',
          summary: 'x',
          participants: [],
          causes: [],
          effects: [],
          evidence: '一段正文原句', // 模型偶发写成裸字符串
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].evidence).toEqual(['一段正文原句']);
  });

  it('event.effects 含嵌套数组也展平（同型字段同样风险）', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'conflict',
          summary: 'x',
          participants: [],
          causes: [],
          effects: ['入狱', ['失忆', ['改名']]],
          evidence: [],
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].effects).toEqual(['入狱', '失忆', '改名']);
  });

  it('evidence 数组中的对象元素被丢弃（不字符串化为 [object Object]）', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'conflict',
          summary: 'x',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['有效原句', { bad: 'object' }, 42, null, ''],
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    // 字符串保留、数字转字符串保留、对象/null/空串丢弃
    expect(parsed.events[0].evidence).toEqual(['有效原句', '42']);
  });
});

describe('storyStateSchema inventory 叶子容错', () => {
  function stateWith(inventory: unknown) {
    const state = makeState();
    // 覆盖 inventory 字段，绕过 TS 类型用 unknown 注入非法形态
    return { ...state, inventory } as unknown as Parameters<typeof parseSchema>[1];
  }

  it('叶子为数字字符串时转为 number', () => {
    const parsed = parseSchema(
      storyStateSchema,
      stateWith({ hero: { 银两: '5', 丹药: '3.5' } }),
      'Story Runtime 状态'
    );
    expect(parsed.inventory.hero?.银两).toBe(5);
    expect(parsed.inventory.hero?.丹药).toBe(3.5);
  });

  it('叶子为带 quantity 字段的对象时提取数字（救回 {quantity,unit}）', () => {
    const parsed = parseSchema(
      storyStateSchema,
      stateWith({ hero: { 晶核: { quantity: 7, unit: '颗' } } }),
      'Story Runtime 状态'
    );
    expect(parsed.inventory.hero?.晶核).toBe(7);
  });

  it('叶子为纯描述对象（无任何数字字段）时丢弃该 item', () => {
    const parsed = parseSchema(
      storyStateSchema,
      stateWith({ hero: { 晶核: { unit: '颗', note: '灵力结晶' }, 银两: 5 } }),
      'Story Runtime 状态'
    );
    expect(parsed.inventory.hero?.晶核).toBeUndefined();
    expect(parsed.inventory.hero?.银两).toBe(5);
  });

  it('owner 下所有 item 都无效时整个 owner 被删除', () => {
    const parsed = parseSchema(
      storyStateSchema,
      stateWith({ hero: { 晶核: { unit: '颗' } }, villain: { 银两: 5 } }),
      'Story Runtime 状态'
    );
    expect(parsed.inventory.hero).toBeUndefined();
    expect(parsed.inventory.villain?.银两).toBe(5);
  });

  it('owner 值不是对象（如 number/string）时丢弃整个 owner', () => {
    const parsed = parseSchema(
      storyStateSchema,
      stateWith({ hero: '不该是字符串', villain: { 银两: 5 } }),
      'Story Runtime 状态'
    );
    expect(parsed.inventory.hero).toBeUndefined();
    expect(parsed.inventory.villain?.银两).toBe(5);
  });

  it('纯数字 inventory 不受影响（回归）', () => {
    const parsed = parseSchema(
      storyStateSchema,
      stateWith({ hero: { 银两: 5, 丹药: 3 } }),
      'Story Runtime 状态'
    );
    expect(parsed.inventory.hero).toEqual({ 银两: 5, 丹药: 3 });
  });

  it('已损坏的 inventory 不再导致 loadState 整体崩溃', () => {
    // 复刻线上报错：inventory["晶核"] = {unit:"颗", note:"灵力结晶"} 全字符串
    expect(() =>
      parseSchema(
        storyStateSchema,
        stateWith({ hero: { 晶核: { unit: '颗', note: '灵力结晶' } } }),
        'Story Runtime 状态'
      )
    ).not.toThrow();
  });
});

describe('契约 15/17 结构化字段透传（2026-10-05 数字/时间台账）', () => {
  it('事件携带 numeric/time 可选字段时 parseSchema 不剥离，供台账投影消费', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 10,
          sceneId: 's1',
          type: 'numeric-fact',
          summary: '周巡家欠金刚重工债务连本带利共计三百万信用点',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['连本带利，三百万信用点'],
          numeric: { object: '周巡家欠金刚重工债务总额', amount: 3000000, unit: '信用点', nature: '连本带利总额', revision: 'establish' },
        },
        {
          id: 'e2',
          chapter: 11,
          sceneId: 's1',
          type: 'time-promise',
          summary: '赵莽限三天后十六强开赛前还清债务',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['三天之后，就是全校联考十六强晋级赛'],
          time: { promise: '十六强开赛前还清三百万债务', due: '三天后', action: 'open' },
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].numeric).toEqual({
      object: '周巡家欠金刚重工债务总额',
      amount: 3000000,
      unit: '信用点',
      nature: '连本带利总额',
      revision: 'establish',
    });
    expect(parsed.events[1].time).toEqual({
      promise: '十六强开赛前还清三百万债务',
      due: '三天后',
      action: 'open',
    });
  });

  it('numeric 字段形态损坏（amount 非数字）时事件本体仍通过，结构化字段剥离', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 3,
          sceneId: 's1',
          type: 'numeric-fact',
          summary: '债务总额三十万',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['三十万巨额债务'],
          numeric: { object: '债务', amount: '三十万', unit: '信用点' },
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].summary).toBe('债务总额三十万');
    // zod optional 失配 → 字段被剥离而非整事件/整章失败（元素级软兜底语义不变）
    expect(parsed.events[0].numeric).toBeUndefined();
  });
});

describe('契约 19 纪年字段透传', () => {
  it('era-fact 的合法 era 保留，非法年份剥离且不拒整条事件', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 12,
          sceneId: 's1',
          type: 'era-fact',
          summary: '天兴二十一年',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['天兴二十一年春'],
          era: { name: '天兴', year: 21, revision: 'establish' },
        },
        {
          id: 'e2',
          chapter: 13,
          sceneId: 's1',
          type: 'era-fact',
          summary: '坏年份',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['坏年份'],
          era: { name: '天兴', year: 0 },
        },
      ],
      deltas: [],
      evidence: [],
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].era).toEqual({ name: '天兴', year: 21, revision: 'establish' });
    expect(parsed.events[1].summary).toBe('坏年份');
    expect(parsed.events[1].era).toBeUndefined();
  });
});
