import type {
  ChapterJudge,
  ChapterJudgeInput,
  ChapterJudgeResult,
  FulfillmentNodeJudgment,
  ForbiddenZoneJudgment,
  StructuredAI,
} from '@/types/story-runtime';

import { chapterJudgeResultSchema, parseSchema } from './schemas';

export type { ChapterJudge } from '@/types/story-runtime';

const MAX_CHAPTER_CHARS = 12_000;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…（正文已截断，仅供语义审查）`;
}

function emptyResult(): ChapterJudgeResult {
  return { fulfillment: [], forbidden: [], issues: [] };
}

/**
 * 统一章节语义审查：履约 + 禁区 + 连贯性/人设，单次 AI 请求。
 */
export class AIChapterJudge implements ChapterJudge {
  constructor(private readonly ai: StructuredAI) {}

  async judge(input: ChapterJudgeInput): Promise<ChapterJudgeResult> {
    const mustCover = input.mustCover.map(node => node.trim()).filter(Boolean);
    const forbiddenZones = input.forbiddenZones.map(zone => zone.trim()).filter(Boolean);
    const checkDeepSemantic = input.checkDeepSemantic !== false;

    if (mustCover.length === 0 && forbiddenZones.length === 0 && !checkDeepSemantic) {
      return emptyResult();
    }

    const factDigest = (input.facts?.events ?? []).map(event => ({
      summary: event.summary,
      effects: event.effects,
      evidence: event.evidence,
    }));

    const raw = await this.ai.generate<ChapterJudgeResult>({
      purpose: 'chapter-judge',
      schemaName: 'ChapterJudgeResult',
      system: [
        '你是网文章节语义审查员。一次完成三类检查，只找问题，不改写正文。',
        '',
        '## 1) 履约（fulfillment）',
        '- 判断 mustCover 节点是否已在正文中情节兑现',
        '- 看语义，不要求与节点原文一字不差；同义改写、拆句、换人称均算履约',
        '- 【可见场面】必须有可感知的对话/动作/取证场面；仅一句带过、回忆里提一句、章末口号式表态 → fulfilled=false',
        '- 仅当完全看不到该情节时也判 fulfilled=false',
        '- fulfillment 必须覆盖输入的每一个 mustCover，node 原样回传',
        '- evidence 优先引用正文原句（能看出场面发生）',
        '',
        '## 2) 禁区（forbidden）',
        '- 判断 forbiddenZones 是否被语义触发（不要求字面相同）',
        '- 字面未出现但情节等价泄露/违规 → violated=true',
        '- 【履约豁免】若某禁区与 mustCover 冲突（例如 mustCover=当众指出凶手，禁区=不能提前展示全部真相），则为履约所必需的指认/举证/证据展示不算违禁',
        '- 豁免仅限 mustCover 所需的阶段性揭示；提前完结翻案、幕后全貌、长线身份/盐铁网络等仍算违禁',
        '- forbidden 必须覆盖输入的每一个 zone，zone 原样回传',
        '',
        '## 3) 深度语义（issues，若 checkDeepSemantic=true）',
        '- fact_conflict：与状态摘要/事实冲突',
        '- logic_gap：自相矛盾或隐含逻辑漏洞；含：无视上章终态重复入狱/重复穿越、章末未落到指定钩子',
        '- ooc：人设明显崩坏',
        '- timeline：时间顺序不合理',
        '- power：战力/能力不合理',
        '- foreshadow：伏笔错乱（提前爆/错收）',
        '- 只报真实问题，不挑文笔；critical 留给明显硬伤',
        '- 若无问题，issues 为 []',
        '',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        'JSON 字段必须为：',
        '{"fulfillment":[{"node":"…","fulfilled":true,"evidence":["…"],"reason":"…"}],',
        '"forbidden":[{"zone":"…","violated":false,"evidence":[],"reason":"…"}],',
        '"issues":[{"type":"logic_gap","severity":"high","location":"…","description":"…","evidence":["…"]}]}',
      ].join('\n'),
      prompt: JSON.stringify({
        mustCover,
        forbiddenZones,
        checkDeepSemantic,
        chapterText: truncateText(input.chapterText, MAX_CHAPTER_CHARS),
        extractedFacts: factDigest,
        stateDigest: input.stateDigest ?? null,
      }),
      parse: value => parseSchema(chapterJudgeResultSchema, value, '章节语义审查结果'),
    });

    const parsed = parseSchema(chapterJudgeResultSchema, raw, '章节语义审查结果');
    return this.normalize(mustCover, forbiddenZones, checkDeepSemantic, parsed);
  }

  private normalize(
    mustCover: string[],
    forbiddenZones: string[],
    checkDeepSemantic: boolean,
    parsed: ChapterJudgeResult
  ): ChapterJudgeResult {
    const fulfillmentByNode = new Map(parsed.fulfillment.map(item => [item.node, item]));
    const fulfillment: FulfillmentNodeJudgment[] = mustCover.map(node => {
      const hit = fulfillmentByNode.get(node);
      if (hit) return hit;
      return {
        node,
        fulfilled: false,
        evidence: [],
        reason: '模型未返回该节点的履约判定',
      };
    });

    const forbiddenByZone = new Map(parsed.forbidden.map(item => [item.zone, item]));
    const forbidden: ForbiddenZoneJudgment[] = forbiddenZones.map(zone => {
      const hit = forbiddenByZone.get(zone);
      if (hit) return hit;
      return {
        zone,
        violated: false,
        evidence: [],
        reason: '模型未返回该禁区判定，默认未触发',
      };
    });

    return {
      fulfillment,
      forbidden,
      issues: checkDeepSemantic ? parsed.issues : [],
    };
  }
}
