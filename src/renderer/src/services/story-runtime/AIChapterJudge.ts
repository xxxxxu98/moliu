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

function normalizeContractKey(value: string): string {
  return value
    .trim()
    .replace(/[。！？!?；;，,：:\s]+$/gu, '')
    .replace(/\s+/gu, '');
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
        '- 【禁止身份脑补】节点点名具体角色时，正文必须有该姓名或无歧义的已建立称谓，并有其动作/对白证据；不得把未具名的“主事/公公/侍卫”等职位自动等同为节点中的具名角色',
        '- evidence 必须是正文中真实存在的原句；不得改写证据、补写姓名或用推断性说明代替原文',
        '- 【可见场面】必须有可感知的对话/动作/取证场面；仅一句带过、回忆里提一句、章末口号式表态 → fulfilled=false',
        '- 仅当完全看不到该情节时也判 fulfilled=false',
        '- 【跨章目标】若节点含限期/倒计时/否则将/「N 天内」等跨章标记（如「必须在三天内翻案，否则将被处斩」），正文做到实质推进（取得关键证据、当众指认、完成阶段对峙）即视为履约，不要求章内完整兑现；不要把「未彻底完结」判为未履约',
        '- fulfillment 必须覆盖输入的每一个 mustCover，node 原样回传',
        '- evidence 优先引用正文原句（能看出场面发生）',
        '',
        '## 2) 禁区（forbidden）',
        '- 判断 forbiddenZones 是否被语义触发（不要求字面相同）',
        '- 字面未出现但情节等价泄露/违规 → violated=true',
        '- 【履约豁免】若某禁区与 mustCover 冲突（例如 mustCover=当众指出凶手，禁区=不能提前展示全部真相），则为履约所必需的指认/举证/证据展示不算违禁',
        '- 豁免仅限 mustCover 所需的阶段性揭示；提前完结翻案、幕后全貌、长线身份等仍算违禁',
        '- forbidden 必须覆盖输入的每一个 zone，zone 原样回传',
        '',
        '## 3) 深度语义（issues，若 checkDeepSemantic=true）',
        '- fact_conflict：与状态摘要/事实冲突。【跨章存在性矛盾必须报此类型且 severity=critical】典型：上章已死/已离开的角色本章复活或活动、上章已销毁/已赠出的物品本章再次出现、上章已揭穿的身份本章当作未知。判定的依据是状态摘要里的实体生死/位置/持有物，而非本章自述',
        '- logic_gap：自相矛盾或隐含逻辑漏洞；含：无视上章终态重复入狱/重复穿越、章末未落到指定钩子',
        '- ooc：人设明显崩坏',
        '- timeline：时间顺序不合理',
        '- power：战力/能力不合理',
        '- foreshadow：伏笔错乱（提前爆/错收）',
        '- 若 futureReveals 中某事实的 notBeforeChapter 大于当前 chapterNumber，正文却明确点名、确认身份或下结论，必须报 foreshadow 且 severity=critical',
        '- futureReveals 保护的是该事实的核心信息本身，不是它的载体：只要核心信息（关键词句、身份、真相）在正文中对读者揭穿，即使换了承载物、换了持有人、换了出现场合（如约定“死者身上的密信写着 X”，正文改成主角自己包袱里的纸写着 X），同样按提前揭示论处',
        '- 若 allowedCharacterNames 非空，名单外的已登记角色在现场说话、行动或即时反应，必须报 logic_gap 且 severity=critical；仅被回忆或背景提及不算出场',
        '- 【出场豁免】若某角色在 mustCover 节点里被点名要求参与（如节点写「被温伯衡锁走」），则该角色本章允许出场，即使不在 allowedCharacterNames 里也不得报 logic_gap；换成无名身份称呼（如「青袍老者」）同样豁免',
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
        chapterNumber: input.chapterNumber ?? null,
        allowedCharacterNames: input.allowedCharacterNames ?? [],
        futureReveals: input.futureReveals ?? [],
      }),
      parse: value => parseSchema(chapterJudgeResultSchema, value, '章节语义审查结果'),
    });

    const parsed = parseSchema(chapterJudgeResultSchema, raw, '章节语义审查结果');
    return this.normalize(
      mustCover,
      forbiddenZones,
      checkDeepSemantic,
      parsed,
      input.chapterText,
      [
        ...(input.allowedCharacterNames ?? []),
        ...(input.stateDigest?.entities ?? []).map(entity => entity.name),
      ],
    );
  }

  private normalize(
    mustCover: string[],
    forbiddenZones: string[],
    checkDeepSemantic: boolean,
    parsed: ChapterJudgeResult,
    chapterText: string,
    knownCharacterNames: string[],
  ): ChapterJudgeResult {
    const fulfillmentByNode = new Map(
      parsed.fulfillment.map(item => [normalizeContractKey(item.node), item]),
    );
    const fulfillment: FulfillmentNodeJudgment[] = mustCover.map(node => {
      const hit = fulfillmentByNode.get(normalizeContractKey(node));
      if (hit) {
        const requiredNames = [...new Set(knownCharacterNames)]
          .map(name => name.trim())
          .filter(name => name.length >= 2 && node.includes(name));
        const missingNames = requiredNames.filter(name => !chapterText.includes(name));
        if (hit.fulfilled && missingNames.length > 0) {
          return {
            node,
            fulfilled: false,
            evidence: [],
            reason: `正文未明确出现节点点名角色：${missingNames.join('、')}；禁止用未具名职位推断履约`,
          };
        }
        const invalidEvidence = hit.evidence.filter(evidence => !chapterText.includes(evidence));
        if (hit.fulfilled && requiredNames.length > 0
          && hit.evidence.length > 0 && invalidEvidence.length === hit.evidence.length) {
          return {
            node,
            fulfilled: false,
            evidence: [],
            reason: '模型返回的履约证据均不是正文原句，无法据此放行',
          };
        }
        return { ...hit, node };
      }
      return {
        node,
        fulfilled: false,
        evidence: [],
        reason: '模型未返回该节点的履约判定',
      };
    });

    const forbiddenByZone = new Map(
      parsed.forbidden.map(item => [normalizeContractKey(item.zone), item]),
    );
    const forbidden: ForbiddenZoneJudgment[] = forbiddenZones.map(zone => {
      const hit = forbiddenByZone.get(normalizeContractKey(zone));
      if (hit) return { ...hit, zone };
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
