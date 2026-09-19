import { describe, expect, it, vi } from 'vitest';

import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';

import { AIChapterJudge } from '../AIChapterJudge';
import { AIFulfillmentJudge } from '../AIFulfillmentJudge';

describe('AIChapterJudge', () => {
  it('一次请求覆盖履约/禁区/深度语义，并归一化漏回节点', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        expect(request.purpose).toBe('chapter-judge');
        return {
          fulfillment: [
            {
              node: '节点A',
              fulfilled: true,
              evidence: ['……'],
              reason: '已写到',
            },
          ],
          forbidden: [
            {
              zone: '禁区1',
              violated: false,
              evidence: [],
              reason: '未触发',
            },
          ],
          issues: [
            {
              type: 'logic_gap',
              severity: 'medium',
              location: '中段',
              description: '前后口径不一致',
              evidence: ['……'],
            },
          ],
        };
      }),
    };

    const judge = new AIChapterJudge(ai);
    const result = await judge.judge({
      mustCover: ['节点A', '节点B'],
      forbiddenZones: ['禁区1'],
      chapterText: '正文',
      checkDeepSemantic: true,
    });

    expect(ai.generate).toHaveBeenCalledOnce();
    expect(result.fulfillment).toHaveLength(2);
    expect(result.fulfillment[0]).toMatchObject({ node: '节点A', fulfilled: true });
    expect(result.fulfillment[1]).toMatchObject({
      node: '节点B',
      fulfilled: false,
      reason: '模型未返回该节点的履约判定',
    });
    expect(result.forbidden[0]).toMatchObject({ zone: '禁区1', violated: false });
    expect(result.issues).toHaveLength(1);
  });

  it('判官合同包含重置登场与节点抄用检查规则，且 prevChapterTail 进入 prompt', async () => {
    // 2026-08-28 r2 百章实测：ch8 在场角色 ch9 被按初次登场重写（重置登场），
    // ch20 大纲节点原句逐字抄进正文（节点抄用）——两类都是章内裁判此前不查的盲区
    let capturedSystem = '';
    let capturedPrompt = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        capturedPrompt = String(request.prompt ?? '');
        return { fulfillment: [], forbidden: [], issues: [] };
      }),
    };

    await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      prevChapterTail: '…上章结尾：沈青舟亲手验看了私印。',
      checkDeepSemantic: true,
    });

    expect(capturedSystem).toContain('【重置登场】');
    expect(capturedSystem).toContain('【节点抄用】');
    expect(capturedPrompt).toContain('沈青舟亲手验看了私印');
  });

  it('提示词声明未来揭示护的是核心信息本身，换载体同样算提前揭示', async () => {
    // 实测缺陷：伏笔约定「死者密纸上有绩效二字」，第 2 章照写被拦下，
    // 第 1 章改成主角自己包袱里的纸写同样两字却放行——判官把载体当成了事实边界。
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return { fulfillment: [], forbidden: [], issues: [] };
      }),
    };

    await new AIChapterJudge(ai).judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
      chapterNumber: 1,
      futureReveals: [{ description: '死者官员的密纸上有绩效二字', notBeforeChapter: 4 }],
    });

    expect(capturedSystem).toContain('保护的是该事实的核心信息本身，不是它的载体');
    expect(capturedSystem).toContain('换了承载物');
  });

  it('无待审项且关闭深度语义时不调用 AI', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => emptyJudgePayload()),
    };
    const judge = new AIChapterJudge(ai);
    const result = await judge.judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: false,
    });
    expect(ai.generate).not.toHaveBeenCalled();
    expect(result).toEqual({ fulfillment: [], forbidden: [], issues: [] });
  });

  it('模型漏写或多写句末标点时仍能匹配原始合同节点', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [
          {
            node: '埋下户部侍郎的线索',
            fulfilled: true,
            evidence: ['私账签押指向户部侍郎'],
            reason: '已埋线索',
          },
        ],
        forbidden: [
          {
            zone: '不得公开户部侍郎姓名。',
            violated: false,
            evidence: [],
            reason: '未公开',
          },
        ],
        issues: [],
      })),
    };
    const judge = new AIChapterJudge(ai);

    const result = await judge.judge({
      mustCover: ['埋下户部侍郎的线索。'],
      forbiddenZones: ['不得公开户部侍郎姓名'],
      chapterText: '私账签押指向户部侍郎，但没有姓名。',
      checkDeepSemantic: true,
    });

    expect(result.fulfillment[0]).toMatchObject({
      node: '埋下户部侍郎的线索。',
      fulfilled: true,
    });
    expect(result.forbidden[0]).toMatchObject({
      zone: '不得公开户部侍郎姓名',
      violated: false,
    });
  });

  it('mustCover 节点混入零宽字符（如 U+200B）时仍能匹配模型回显', async () => {
    // 2026-08-16 冒烟实测：大纲 mustCover 尾部带 U+200B，判定模型回显不带，
    // normalizeContractKey 剥标点剥不掉它 → 每章误判「模型未返回履约判定」触发整章重写。
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [
          {
            node: '张洞发现鬼手自主动作并锁死地窖疑点。',
            fulfilled: true,
            evidence: ['右掌里的鬼手自己攥成了拳'],
            reason: '已写到',
          },
        ],
        forbidden: [],
        issues: [],
      })),
    };
    const judge = new AIChapterJudge(ai);

    const result = await judge.judge({
      mustCover: ['张洞发现鬼手自主动作并锁死地窖疑点。\u200b'],
      forbiddenZones: [],
      chapterText: '右掌里的鬼手自己攥成了拳，张洞盯着它看了很久。',
      checkDeepSemantic: true,
    });

    expect(result.fulfillment[0]).toMatchObject({ fulfilled: true });
  });

  it('不得把未具名职位脑补成 mustCover 点名的具体角色', async () => {
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return {
          fulfillment: [{
            node: '郑伯昭当堂扣下账册并威胁沈砚',
            fulfilled: true,
            evidence: ['主事把账册扣在袖中，冷声威胁沈砚。'],
            reason: '主事即郑伯昭',
          }],
          forbidden: [],
          issues: [],
        };
      }),
    };

    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['郑伯昭当堂扣下账册并威胁沈砚'],
      forbiddenZones: [],
      chapterText: '主事把账册扣在袖中，冷声威胁沈砚。',
      allowedCharacterNames: ['沈砚', '郑伯昭'],
      checkDeepSemantic: true,
    });

    expect(capturedSystem).toContain('禁止身份脑补');
    expect(result.fulfillment[0]).toMatchObject({
      fulfilled: false,
      evidence: [],
    });
    expect(result.fulfillment[0].reason).toContain('郑伯昭');
  });

  it('点名角色守卫只认 character 实体，地点实体名混入不再误判未履约', async () => {
    // 2026-08-31 反重力 200 章双开冒烟 ch8 实锤：蓝图句「苏清婉登场并提供黑市
    // 粮价情报」被地点补登记切成脏实体「登场并提供黑市」混入 stateDigest，
    // 守卫要求正文逐字出现该动词短语碎片 → 误判未履约 → 3 轮停滞整章 0 字。
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        const prompt = JSON.parse(request.prompt) as { stateDigest: { entities: Array<{ name: string }> } };
        expect(prompt.stateDigest.entities.map(entity => entity.name)).toContain('登场并提供黑市');
        return {
          fulfillment: [{
            node: '苏清婉登场并提供黑市粮价情报',
            fulfilled: true,
            evidence: ['苏清婉掀帘而入，报出了今日黑市的粮价。'],
            reason: '已写到',
          }],
          forbidden: [],
          issues: [],
        };
      }),
    };

    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['苏清婉登场并提供黑市粮价情报'],
      forbiddenZones: [],
      chapterText: '苏清婉掀帘而入，报出了今日黑市的粮价。',
      stateDigest: {
        entities: [
          { id: 'char-1', name: '苏清婉', kind: 'character' },
          { id: 'loc-2', name: '登场并提供黑市', kind: 'location' },
        ],
      },
      checkDeepSemantic: true,
    });

    expect(result.fulfillment[0]).toMatchObject({ fulfilled: true });
  });
});

describe('AIFulfillmentJudge 兼容封装', () => {
  it('转调 chapter-judge 且关闭深度语义', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        expect(request.purpose).toBe('chapter-judge');
        const prompt = JSON.parse(request.prompt) as { checkDeepSemantic: boolean };
        expect(prompt.checkDeepSemantic).toBe(false);
        return {
          fulfillment: [
            { node: '节点A', fulfilled: true, evidence: [], reason: 'ok' },
          ],
          forbidden: [],
          issues: [],
        };
      }),
    };
    const judge = new AIFulfillmentJudge(ai);
    const result = await judge.judge({
      mustCover: ['节点A'],
      chapterText: '正文',
      facts: { events: [], deltas: [], evidence: [] },
    });
    expect(ai.generate).toHaveBeenCalledOnce();
    expect(result.results[0]?.fulfilled).toBe(true);
  });
});

describe('chapter-judge 响应软兜底（2026-08-18 gemini-3.6 20 章矩阵 ch2 实测）', () => {
  it('只返回 fulfillment、缺 forbidden/issues 时软兜底为空数组，不再 schema 硬拒终止整批', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [{ node: '节点A', fulfilled: true, evidence: ['正文原句'], reason: '已写到' }],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['节点A', '节点B'],
      forbiddenZones: ['禁区1'],
      chapterText: '正文原句',
      checkDeepSemantic: true,
    });
    expect(result.fulfillment[0]).toMatchObject({ node: '节点A', fulfilled: true });
    // 漏回的节点/禁区按既有 normalize 语义补默认判定，而非抛错停批
    expect(result.fulfillment[1]).toMatchObject({ node: '节点B', fulfilled: false });
    expect(result.forbidden[0]).toMatchObject({ zone: '禁区1', violated: false });
    expect(result.issues).toEqual([]);
  });

  it('数组内缺核心字段的元素被剔除，保留可解析部分', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [
          { node: '节点A', fulfilled: true, evidence: [], reason: 'ok' },
          { node: 123, fulfilled: true },
        ],
        forbidden: [
          { zone: '禁区1', violated: false, evidence: [], reason: 'ok' },
          { zone: '禁区2' },
        ],
        issues: [
          { type: 'logic_gap', severity: 'high', location: '第2段', description: '矛盾', evidence: [] },
          { type: '未知类型', description: '枚举外，剔除' },
        ],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: ['禁区1'],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(result.fulfillment).toHaveLength(1);
    expect(result.forbidden).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.type).toBe('logic_gap');
  });

  it('空字符串等非对象输入仍走硬失败（由上层 truncated 重试兜住）', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ''),
    };
    await expect(
      new AIChapterJudge(ai).judge({
        mustCover: ['节点A'],
        forbiddenZones: [],
        chapterText: '正文',
        checkDeepSemantic: true,
      }),
    ).rejects.toThrow('结构校验失败');
  });

  it('模型把对象裹一层数组返回时解包，不再硬拒终止整批', async () => {
    // 2026-08-21 生产实测 proj-1787300146075 ch31 + 2026-08-31 反重力 200 章双开
    // 冒烟 ch72：审查模型返回 [{…}]，expected object, received array 硬拒 →
    // review-unavailable 烧光重试预算整章 0 字。历史版本的用例 mock 返回的是
    // 裸对象，从未真正覆盖数组形状（假阳性），此处以真实形状回归。
    const ai: StructuredAI = {
      generate: vi.fn(async () => [
        {
          fulfillment: [{ node: '节点A', fulfilled: true, evidence: ['正文原句'], reason: '已写到' }],
          forbidden: [],
          issues: [],
        },
      ]),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文原句',
      checkDeepSemantic: true,
    });
    expect(result.fulfillment[0]).toMatchObject({ node: '节点A', fulfilled: true });
  });

  it('对象被拆进数组多个元素时按顶层键拼接归一化，不丢任何判定', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => [
        { fulfillment: [{ node: '节点A', fulfilled: true, evidence: ['正文原句'], reason: '已写到' }] },
        { forbidden: [{ zone: '禁区1', violated: false, evidence: [], reason: '未触发' }] },
        { issues: [{ type: 'logic_gap', severity: 'high', location: '章末', description: '矛盾', evidence: [] }] },
      ]),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: ['禁区1'],
      chapterText: '正文原句',
      checkDeepSemantic: true,
    });
    expect(result.fulfillment).toHaveLength(1);
    expect(result.fulfillment[0]).toMatchObject({ node: '节点A', fulfilled: true });
    expect(result.forbidden[0]).toMatchObject({ zone: '禁区1', violated: false });
    expect(result.issues).toHaveLength(1);
  });

  it('元素全是裸 issues 项的顶层数组包装成审查包（glm ch147 形态）', async () => {
    // 2026-09-10 受害样本：glm-5.3-flash ch147 judge 返回顶层数组且元素不带
    // 顶层键、而是 severity+location/quote 的 issue 形状——两层归一都放行 →
    // schema 硬拒 → review-unavailable 烧光整章预算成洞
    const ai: StructuredAI = {
      generate: vi.fn(async () => [
        { type: 'logic_gap', severity: 'medium', location: '章末', description: '节奏偏慢', evidence: [] },
        { type: 'logic_gap', severity: 'low', location: '开头', description: '铺垫略长', evidence: [] },
      ]),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文原句',
      checkDeepSemantic: true,
    });
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({ severity: 'medium' });
  });

  it('无法识别审查包形状的裸数组（如段落字符串）仍走硬失败', async () => {
    // ch72 同一尝试里 scene-draft 也返回过段落字符串数组——那是草稿形状，
    // 不是审查结论，归一化不能瞎兜
    const ai: StructuredAI = {
      generate: vi.fn(async () => ['第一段正文。', '第二段正文。']),
    };
    await expect(
      new AIChapterJudge(ai).judge({
        mustCover: ['节点A'],
        forbiddenZones: [],
        chapterText: '正文',
        checkDeepSemantic: true,
      }),
    ).rejects.toThrow('结构校验失败');
  });

  it('系统提示词明确禁止顶层数组返回', async () => {
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return { fulfillment: [], forbidden: [], issues: [] };
      }),
    };
    await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(capturedSystem).toContain('禁止返回数组');
    expect(capturedSystem).toContain('一个都不能省略');
    expect(capturedSystem).toContain('reason 必填');
  });

  it('履约/禁区项漏写 reason 时补空串放行，不再硬拒终止整批', async () => {
    // 2026-08-21 生产实测 proj-1787300146075 ch38：fulfillment[1] 漏写 reason，
    // expected string, received undefined → review-unavailable 停整批。
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [
          { node: '节点A', fulfilled: true, evidence: ['正文原句'] },
          { node: '节点B', fulfilled: false },
        ],
        forbidden: [{ zone: '禁区1', violated: false }],
        issues: [],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['节点A', '节点B'],
      forbiddenZones: ['禁区1'],
      chapterText: '正文原句',
      checkDeepSemantic: true,
    });
    expect(result.fulfillment[0]).toMatchObject({ node: '节点A', fulfilled: true, reason: '' });
    expect(result.fulfillment[1]).toMatchObject({ node: '节点B', fulfilled: false, reason: '' });
    expect(result.forbidden[0]).toMatchObject({ zone: '禁区1', violated: false, reason: '' });
  });

  it('issues 项漏写 location 时补空串放行', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [],
        forbidden: [],
        issues: [
          { type: 'logic_gap', severity: 'high', description: '前后矛盾', evidence: [] },
        ],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(result.issues[0]).toMatchObject({ type: 'logic_gap', severity: 'high', location: '' });
  });

  it('issues 项 type/severity 枚举外时剔除该项而非硬拒整批', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [],
        forbidden: [],
        issues: [
          { type: 'logic_gap', severity: 'high', location: '第2段', description: '矛盾', evidence: [] },
          { type: '未知类型', severity: 'high', location: '第3段', description: 'type 枚举外剔除', evidence: [] },
          { type: 'ooc', severity: '超高', location: '第4段', description: 'severity 枚举外剔除', evidence: [] },
        ],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.type).toBe('logic_gap');
  });

  it('payoffCandidates 存在时判定伏笔回收：候选内的 id 透传，候选外的幻觉 id 丢弃', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [],
        forbidden: [],
        issues: [],
        // fs-1 在候选内（正文有回收证据）；fs-99 是模型幻觉，不在候选内必须丢弃
        resolvedForeshadowIds: ['fs-1', 'fs-99'],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '真相揭晓：断角玉佩内的齿轮暗刻正是当年灭门案的关键物证。',
      checkDeepSemantic: true,
      payoffCandidates: [
        { id: 'fs-1', hint: '断角玉佩内部有齿轮暗刻与微缩编号' },
      ],
    });
    expect(result.resolvedForeshadowIds).toEqual(['fs-1']);

    const prompt = JSON.parse((ai.generate as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt);
    expect(prompt.payoffCandidates).toHaveLength(1);
  });

  it('无 payoffCandidates 输入时不做回收判定（旧调用方零影响）', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [],
        forbidden: [],
        issues: [],
        resolvedForeshadowIds: ['fs-1'],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    // 无候选输入：不带回收字段（消费方 ?? [] 兜底），prompt 也不注入候选
    expect(result.resolvedForeshadowIds ?? []).toEqual([]);
    const prompt = JSON.parse((ai.generate as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt);
    expect(prompt.payoffCandidates).toBeUndefined();
  });
  it('判官证据跨段换行/引号宽度漂移不再误杀履约（2026-09-05 g38f ch34/131 守卫对挤死锁）', async () => {
    // 判官给出的证据逐字来自正文，但把段界换行并成一句、直引号代替了全角引号——
    // 旧 includes 全等校验必失配 → 整组证据报废翻转未履约 → 与防抄守卫对挤熬死两章。
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [{
          node: '沈砚截获万裕钱庄转移现银的绝密蜡丸书信',
          fulfilled: true,
          evidence: ['沈砚截获蜡丸，拆出万裕钱庄转移现银的绝密书信。"当夜交割。"'],
          reason: '已写到',
        }],
        forbidden: [],
        issues: [],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['沈砚截获万裕钱庄转移现银的绝密蜡丸书信'],
      forbiddenZones: [],
      chapterText: '沈砚截获蜡丸，拆出万裕钱庄转移现银的绝密书信。\n\n“当夜交割。”信使低声道。',
      allowedCharacterNames: ['沈砚'],
      checkDeepSemantic: true,
    });
    expect(result.fulfillment[0]).toMatchObject({ fulfilled: true });
  });

  it('证据确实是模型改写自创（非正文原句）时仍翻转为未履约——归一化不放松语义防线', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [{
          node: '沈砚截获万裕钱庄转移现银的绝密蜡丸书信',
          fulfilled: true,
          evidence: ['沈砚从信使手中取得了钱庄转移银两的密信'],
          reason: '已写到',
        }],
        forbidden: [],
        issues: [],
      })),
    };
    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['沈砚截获万裕钱庄转移现银的绝密蜡丸书信'],
      forbiddenZones: [],
      chapterText: '沈砚截获蜡丸，拆出万裕钱庄转移现银的绝密书信。',
      allowedCharacterNames: ['沈砚'],
      checkDeepSemantic: true,
    });
    expect(result.fulfillment[0]).toMatchObject({ fulfilled: false, evidence: [] });
    expect(result.fulfillment[0].reason).toContain('履约证据均不是正文原句');
  });

  it('系统词含证据逐字摘录要求与羁押状态矛盾的 fact_conflict 规则', async () => {
    // g38f ch84：徐文壁 ch78 锁拿地窖不入状态摘要 → ch84 自由督烧底账无人拦
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return { fulfillment: [], forbidden: [], issues: [] };
      }),
    };
    await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(capturedSystem).toContain('逐字摘录');
    expect(capturedSystem).toContain('已下狱/被关押/被软禁的角色本章以自由身出现');
  });

  it('系统词含终态完成体与章界动线规则（g38f r6 ch31/44/70 实证）', async () => {
    // r6 全文通读：ch44 章题「御旨抄家入狱」正文只演到认罪画押即过审，
    // 下游两章侍郎自由出场；ch30 末主角随车队押运、ch31 无交代瞬移回京师值房
    // 且三十八箱车队蒸发（读者评分 47.4 全书最低）——履约域与章界域双双漏判
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return emptyJudgePayload();
      }),
    };
    await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(capturedSystem).toContain('【终态完成体】');
    expect(capturedSystem).toContain('全凭陛下发落');
    expect(capturedSystem).toContain('【章界动线】');
    expect(capturedSystem).toContain('章界动线断裂');
  });

  it('eraAnchors/numericFacts 传入时注入纪年一致与数字一致规则及锚值（g38f r6 建元分裂/盐税五套口径实证）', async () => {
    // r6 全文通读：后 50 章自创建元/建昭平行纪年 9 章、同一笔盐税五套口径——
    // 写作侧锚之外判官缺第二道校验输入，年号与数字的跨章一致性无人终审
    let capturedSystem = '';
    let capturedPrompt = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        capturedPrompt = String(request.prompt ?? '');
        return emptyJudgePayload();
      }),
    };
    await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
      eraAnchors: ['第150章纪年「天兴二十一年」'],
      numericFacts: ['第99章既成「两淮盐税岁入实征二百二十万两」'],
    });
    expect(capturedSystem).toContain('【纪年一致】');
    expect(capturedSystem).toContain('自创年号');
    expect(capturedSystem).toContain('【数字一致】');
    expect(capturedSystem).toContain('数字蒸发/改写');
    expect(capturedPrompt).toContain('天兴二十一年');
    expect(capturedPrompt).toContain('二百二十万两');

    // 未传锚时规则不注入（避免空锚误报）
    let bareSystem = '';
    const ai2: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        bareSystem = request.system ?? '';
        return emptyJudgePayload();
      }),
    };
    await new AIChapterJudge(ai2).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(bareSystem).not.toContain('【纪年一致】');
    expect(bareSystem).not.toContain('【数字一致】');
  });

  it('系统词含算术自洽、称谓漂移与世系称谓规则（g38f r7 四缺口实证）', async () => {
    // r7 全文通读：ch177 一箱六十锭×五十万箱=15亿两 vs 声明三千万两（差500倍且
    // 蓝图标题自带错误被照抄）；温廷翰全书≥6 职横跳零拦截；老皇帝在位五处被称
    // 先帝、ch194 驾崩零叙述直接跳即位诏、「自嘉定三年起七年」当年仅嘉定四年
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return emptyJudgePayload();
      }),
    };
    await new AIChapterJudge(ai).judge({
      mustCover: ['节点A'],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
    });
    expect(capturedSystem).toContain('【算术自洽】');
    expect(capturedSystem).toContain('验算过程');
    expect(capturedSystem).toContain('【称谓漂移】');
    expect(capturedSystem).toContain('称谓漂移：X 由A变B无任免');
    expect(capturedSystem).toContain('【世系称谓】');
    expect(capturedSystem).toContain('驾崩零叙述');
    expect(capturedSystem).toContain('自嘉定三年起整整七年');
  });
});

function emptyJudgePayload() {
  return { fulfillment: [], forbidden: [], issues: [] };
}
