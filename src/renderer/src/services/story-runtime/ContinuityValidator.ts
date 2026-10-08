import type {
  ChapterJudge,
  ChapterJudgeIssueType,
  ContinuityDomain,
  ContinuityIssue,
  ContinuityReport,
  ContractPack,
  ExtractedFacts,
  FulfillmentJudge,
  JsonValue,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
  ValidationSeverity,
} from '@/types/story-runtime';

import { classifyError } from '@/utils/ai-error-classify';

import { applyProvisionalOverlay } from './stateOverlay';
import { isForbiddenExemptForFulfillment } from './contractHealth';
import { stripOpeningCbnPrefix } from './chapterBlueprintNormalize';

export interface ContinuityValidationInput {
  contracts: ContractPack;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  drafts: SceneDraft[];
  facts: ExtractedFacts;
  /** 上章结尾原文：传给章节判官做「重置登场」类在场连续性判定 */
  prevChapterTail?: string;
  /** 本章到达回收时点的伏笔候选；传入后 report.resolvedForeshadowIds 带出证据确认的回收 id */
  payoffCandidates?: Array<{ id: string; hint: string }>;
  /** 全书既成纪年锚：透传判官做年号一致性校验（锚外年号=自创年号） */
  eraAnchors?: string[];
  /** 近章既成数字叙述：透传判官做跨章数字一致性校验（无勘误剧情改写既成数值） */
  numericFacts?: string[];
  /** 待兑现时间承诺清单：透传判官做期限一致校验（越期未兑现未改期） */
  timePromises?: string[];
  /** 近章时间标记：透传判官做时间流逝连续性校验（回退/跳跃无交代） */
  timelineMarks?: string[];
  /** 本章为呼吸拍章：透传判官做生理锚点 warning 级闭环校验 */
  breathBeatRequired?: boolean;
  /** 相关角色更早章节原文片段：判官跨章仲裁的逐字证据（台账漏账兜底） */
  mentionEvidence?: string[];
  /** 作者正典（locked 规则）：正文与正典冲突时判官报 critical */
  authorCanon?: string[];
  /** 假死在册角色：透传判官做假死例外（活体活动合法，不报复活类冲突） */
  fakedDeathCharacters?: Array<{ name: string; chapterIndex: number }>;
}

export interface ContinuityValidatorOptions {
  /** 统一语义审查（履约+禁区+连贯），至多 1 次 AI */
  chapterJudge?: ChapterJudge;
  /**
   * @deprecated 仅履约子集；若同时提供 chapterJudge 则忽略本项
   */
  fulfillmentJudge?: FulfillmentJudge;
  /**
   * 是否在字面履约已通过时仍做深度语义审查（默认 true；有 chapterJudge 时生效）
   */
  enableDeepSemantic?: boolean;
}

function chapterText(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n');
}

/**
 * 字面快路径：整句命中或片语覆盖 ≥70% 即视为履约，避免无谓 AI 调用。
 */
export function fulfilledLexically(node: string, text: string, facts: ExtractedFacts): boolean {
  const normalized = stripOpeningCbnPrefix(node) || node.trim();
  if (!normalized) return true;
  if (text.includes(normalized) || text.includes(node.trim())) return true;
  if (
    facts.events.some(
      event =>
        event.summary.includes(normalized) ||
        event.effects.some(effect => effect.includes(normalized)) ||
        event.evidence.some(evidence => evidence.includes(normalized))
    )
  ) {
    return true;
  }

  const quoted = [...normalized.matchAll(/[“"‘']([^”"'’]+)[”"'’]/gu)].map(match => match[1].trim());
  const segments = normalized
    .split(/[，,。；;：:\s]/u)
    .map(part => part.trim())
    .filter(part => part.length >= 2);
  const tokens = [...new Set([...quoted, ...segments])].filter(token => token.length >= 2);
  if (tokens.length === 0) return false;

  const haystack = [
    text,
    ...facts.events.flatMap(event => [event.summary, ...event.effects, ...event.evidence]),
  ].join('\n');
  const hitCount = tokens.filter(token => haystack.includes(token)).length;
  return hitCount >= Math.ceil(tokens.length * 0.7);
}

function parseInventoryPath(path: string): { owner: string; item: string } | undefined {
  const [root, owner, item] = path.split('.');
  return root === 'inventory' && owner && item ? { owner, item } : undefined;
}

/**
 * 压缩实体 attributes 供判官 stateDigest 使用：字符串超长截断到 80 字，避免 prompt 膨胀；
 * 非字符串原样保留。空 attributes 返回 undefined（不进 digest）。
 */
function compactAttributesForDigest(
  attributes: Record<string, JsonValue> | undefined
): Record<string, unknown> | undefined {
  if (!attributes || Object.keys(attributes).length === 0) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string') {
      out[key] = value.length > 80 ? `${value.slice(0, 80)}…` : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * 状态摘要侧的押地残留兜底（2026-09-30 g38f r16 ch114 成洞实证）：
 * status 已是逆转族（获释/复职/平反等）却仍带 custody 属性时，判官会把
 * 「custody:天牢」读作在押并连拒正确章节。提取侧已补伴随 remove delta
 * （FactExtractor.implyCustodyClearOnReversal），此处兜住旧 store 回放与
 * 任何绕过提取层的写入路径。读取侧归一化，不改状态本体。
 */
const DIGEST_RELEASED_STATUS_VALUES = new Set([
  '获释', '保释', '平反', '复职', '复位', '赦免', '起复', '揭晓',
]);

export function dropStaleCustodyForDigest(
  attributes: Record<string, JsonValue> | undefined
): Record<string, JsonValue> | undefined {
  if (!attributes) return attributes;
  if (!DIGEST_RELEASED_STATUS_VALUES.has(String(attributes.status ?? ''))) return attributes;
  if (!('custody' in attributes)) return attributes;
  const { custody: _stale, ...rest } = attributes;
  return rest;
}

function mapJudgeIssueDomain(type: ChapterJudgeIssueType): ContinuityDomain {
  switch (type) {
    case 'fact_conflict':
    case 'power':
      return 'entity';
    case 'logic_gap':
      return 'causality';
    case 'timeline':
      return 'timeline';
    case 'ooc':
      return 'knowledge';
    case 'foreshadow':
      return 'fulfillment';
    default:
      return 'fulfillment';
  }
}

export class ContinuityValidator {
  constructor(private readonly options: ContinuityValidatorOptions = {}) {}

  async validate(input: ContinuityValidationInput): Promise<ContinuityReport> {
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const issues: ContinuityIssue[] = [];
    const checkedDomains: ContinuityDomain[] = [
      'entity',
      'knowledge',
      'inventory',
      'timeline',
      'causality',
      'fulfillment',
      'evidence',
    ];
    let issueIndex = 0;
    const addIssue = (
      domain: ContinuityDomain,
      message: string,
      evidence: string[] = [],
      sceneId?: string,
      severityOverride?: ValidationSeverity
    ): void => {
      issueIndex += 1;
      issues.push({
        id: `${domain}-${issueIndex}`,
        domain,
        severity:
          severityOverride ??
          (input.contracts.review.blockingDomains.includes(domain) ? 'blocking' : 'warning'),
        message,
        evidence,
        sceneId,
      });
    };

    const eventIds = new Set([...state.events, ...input.facts.events].map(event => event.id));
    for (const event of input.facts.events) {
      for (const participant of event.participants) {
        if (!state.entities[participant]) {
          // 降级为 warning：未登记实体多为功能性临时配角（斥候/伤兵/路人）或抽取层的形近字，
          // 重写几乎无法收敛（正文未必有错）。语义层连续性由 AIChapterJudge（fact_conflict 仍硬阻塞）兜底。
          addIssue(
            'entity',
            `事件 ${event.id} 引用了未知实体 ${participant}`,
            event.evidence,
            event.sceneId,
            'warning',
          );
        }
      }
      for (const cause of event.causes) {
        if (!eventIds.has(cause)) {
          addIssue('causality', `事件 ${event.id} 缺少因果前件 ${cause}`, event.evidence, event.sceneId);
        }
      }
      for (const effect of event.effects.filter(value => value.startsWith('knowledge:'))) {
        const [, knower, ...factParts] = effect.split(':');
        const fact = factParts.join(':');
        const isPresent = event.participants.includes(knower);
        const wasKnown = (state.knowledge[knower] ?? []).includes(fact);
        if (!isPresent && !wasKnown) {
          addIssue(
            'knowledge',
            `${knower} 无在场或既有知识证据却获得“${fact}”`,
            event.evidence,
            event.sceneId
          );
        }
      }
      if (input.contracts.review.requiredEvidence && event.evidence.length === 0) {
        addIssue('evidence', `事件 ${event.id} 缺少正文证据`, [], event.sceneId);
      }
    }

    const inventory = structuredClone(state.inventory);
    for (const delta of input.facts.deltas) {
      const path = parseInventoryPath(delta.path);
      if (path && delta.operation === 'increment') {
        inventory[path.owner] ??= {};
        const amount = typeof delta.value === 'number' ? delta.value : 1;
        inventory[path.owner][path.item] = (inventory[path.owner][path.item] ?? 0) + amount;
        if (inventory[path.owner][path.item] < 0) {
          addIssue('inventory', `${path.owner} 的物品 ${path.item} 数量不能为负`, [delta.evidence]);
        }
      }
      if (input.contracts.review.requiredEvidence && delta.evidence.trim().length === 0) {
        addIssue('evidence', `状态变化 ${delta.path} 缺少证据`);
      }
    }

    let previousTime = Number.NEGATIVE_INFINITY;
    for (const event of input.facts.events) {
      if (!event.timestamp) continue;
      const currentTime = Date.parse(event.timestamp);
      if (!Number.isNaN(currentTime)) {
        if (currentTime < previousTime) {
          addIssue('timeline', `事件 ${event.id} 的时间早于前序事件`, event.evidence, event.sceneId);
        }
        previousTime = currentTime;
      }
    }

    const gateOutcome = await this.validateSemanticGates(
      input.contracts,
      state,
      chapterText(input.drafts),
      input.facts,
      addIssue,
      input.payoffCandidates ?? [],
      input.prevChapterTail,
      input.eraAnchors ?? [],
      input.numericFacts ?? [],
      input.fakedDeathCharacters ?? [],
      input.timePromises ?? [],
      input.timelineMarks ?? [],
      input.breathBeatRequired ?? false,
      input.mentionEvidence ?? [],
      input.authorCanon ?? []
    );

    const blockingCount = issues.filter(issue => issue.severity === 'blocking').length;
    const warningCount = issues.filter(
      issue =>
        issue.severity === 'warning' &&
        !/^事件\s+\S+\s+引用了未知实体\s+/u.test(issue.message)
    ).length;
    return {
      accepted:
        blockingCount === 0 && warningCount <= input.contracts.review.maxWarnings,
      issues,
      checkedDomains,
      ...(gateOutcome.resolvedForeshadowIds.length > 0
        ? { resolvedForeshadowIds: gateOutcome.resolvedForeshadowIds }
        : {}),
      ...(gateOutcome.resolvedTimePromiseTexts.length > 0
        ? { resolvedTimePromiseTexts: gateOutcome.resolvedTimePromiseTexts }
        : {}),
    };
  }

  private async validateSemanticGates(
    contracts: ContractPack,
    state: StoryState,
    text: string,
    facts: ExtractedFacts,
    addIssue: (
      domain: ContinuityDomain,
      message: string,
      evidence?: string[],
      sceneId?: string,
      severityOverride?: ValidationSeverity
    ) => void,
    payoffCandidates: Array<{ id: string; hint: string }> = [],
    prevChapterTail?: string,
    eraAnchors: string[] = [],
    numericFacts: string[] = [],
    fakedDeathCharacters: Array<{ name: string; chapterIndex: number }> = [],
    timePromises: string[] = [],
    timelineMarks: string[] = [],
    breathBeatRequired = false,
    mentionEvidence: string[] = [],
    authorCanon: string[] = []
  ): Promise<{ resolvedForeshadowIds: string[]; resolvedTimePromiseTexts: string[] }> {
    // 判官确认已回收的伏笔 id / 已兑现的承诺文本（严证据门：判官未列出/判定
    // 失败一律返回空，让进度统计保持 buried/open 而非误标）
    let resolvedForeshadowIds: string[] = [];
    let resolvedTimePromiseTexts: string[] = [];
    const contract = contracts.chapter;
    const pendingNodes = contract.mustCover.filter(
      node => !fulfilledLexically(node, text, facts)
    );
    const literalForbiddenHits = contract.forbidden.filter(
      zone => zone && text.includes(zone)
    );
    for (const forbidden of literalForbiddenHits) {
      addIssue('fulfillment', `触发本章禁区：${forbidden}`, [forbidden]);
    }
    const semanticForbidden = contract.forbidden.filter(
      zone => zone && !text.includes(zone)
    );

    const enableDeepSemantic = this.options.enableDeepSemantic !== false;
    const chapterJudge = this.options.chapterJudge;

    const shouldCallChapterJudge =
      Boolean(chapterJudge) &&
      (pendingNodes.length > 0 ||
        semanticForbidden.length > 0 ||
        enableDeepSemantic);

    if (chapterJudge && shouldCallChapterJudge) {
      try {
        const judgment = await chapterJudge.judge({
          mustCover: pendingNodes,
          forbiddenZones: semanticForbidden,
          chapterText: text,
          prevChapterTail,
          facts,
          checkDeepSemantic: enableDeepSemantic,
          chapterNumber: contract.chapterNumber,
          allowedCharacterNames: contract.allowedCharacterNames,
          futureReveals: contract.futureReveals,
          payoffCandidates,
          stateDigest: {
            entities: Object.values(state.entities).slice(0, 20).map(entity => ({
              id: entity.id,
              name: entity.name,
              kind: entity.kind,
              // 补全 attributes（生死/位置/状态等）：AIChapterJudge 的 prompt 已声明
              // 「依据状态摘要里的实体生死/位置/持有物判定 fact_conflict」，此前 stateDigest
              // 只给 id/name/kind，判官缺判据 → 既会误报也会漏报。补上后弥合口径断层。
              attributes: compactAttributesForDigest(dropStaleCustodyForDigest(entity.attributes)),
            })),
            knowledge: state.knowledge,
            inventory: state.inventory,
            openForeshadows: state.openForeshadows.slice(0, 20),
          },
          ...(eraAnchors.length > 0 ? { eraAnchors } : {}),
          ...(numericFacts.length > 0 ? { numericFacts } : {}),
          ...(timePromises.length > 0 ? { timePromises } : {}),
          ...(timelineMarks.length > 0 ? { timelineMarks } : {}),
          ...(breathBeatRequired ? { breathBeatRequired: true } : {}),
          ...(mentionEvidence.length > 0 ? { mentionEvidence } : {}),
          ...(authorCanon.length > 0 ? { authorCanon } : {}),
          ...(fakedDeathCharacters.length > 0
            ? { fakedDeathNames: fakedDeathCharacters.map(item => item.name) }
            : {}),
        });

        for (const item of judgment.fulfillment) {
          if (!item.fulfilled) {
            const suffix = item.reason.trim() ? `（${item.reason.trim()}）` : '';
            addIssue('fulfillment', `未履约节点：${item.node}${suffix}`, item.evidence);
          }
        }
        for (const item of judgment.forbidden) {
          if (item.violated) {
            if (
              isForbiddenExemptForFulfillment(
                item.zone,
                contract.mustCover,
                `${item.reason} ${item.evidence.join(' ')}`
              )
            ) {
              continue;
            }
            const suffix = item.reason.trim() ? `（${item.reason.trim()}）` : '';
            addIssue('fulfillment', `触发本章禁区：${item.zone}${suffix}`, item.evidence);
          }
        }
        for (const item of judgment.issues) {
          const isNodeVerbatim =
            item.description.includes('节点原句照抄') ||
            item.description.includes('节点抄用');
          const domain = isNodeVerbatim ? 'fulfillment' : mapJudgeIssueDomain(item.type);
          // fact_conflict（与状态摘要/事实冲突）一律视为 blocking，
          // 不依赖 blockingDomains 配置——跨章事实矛盾（如人物生死前后不一）属硬伤，
          // 必须触发重写/拒收，避免让读者看到「上章已死角色本章复活」类连续性断裂。
          // 节点原句照抄/节点抄用按 node-verbatim-survived 哲学：保持 warning 级驱动定向改写，
          // 绝不升 blocking 防死章成洞（与 contractHealth.ts 确定性门禁同口径）。
          const severity: ValidationSeverity =
            item.type === 'fact_conflict'
              ? 'blocking'
              : isNodeVerbatim
                ? 'warning'
                : item.severity === 'critical' || item.severity === 'high'
                  ? contracts.review.blockingDomains.includes(domain)
                    ? 'blocking'
                    : 'warning'
                  : 'warning';
          addIssue(
            domain,
            `语义问题[${item.type}] ${item.location}: ${item.description}`,
            item.evidence,
            undefined,
            severity
          );
        }
        resolvedForeshadowIds = judgment.resolvedForeshadowIds ?? [];
        resolvedTimePromiseTexts = judgment.resolvedTimePromiseTexts ?? [];
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof Error && error.name === 'AbortError') throw error;
        // 瞬态失败（空响应/截断/网络/限流/5xx）原样抛出，让 LongFormWritingEngine 的
        // 步骤级重试真正生效——包成 [review-unavailable] 会被 classifyError 判为
        // transient=false，重试预算形同虚设，一次空响应就终止整批续写。
        // 重试耗尽后由引擎统一包成 review-unavailable，语义不变。
        if (classifyError(error).transient) {
          throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        // 审查基础设施失败不是正文内容结论。向上抛后由 LongFormWritingEngine
        // 只重试 validate 阶段，绝不能转换成“未履约”驱动整章重写。
        throw new Error(`[review-unavailable] 语义审查不可用：${detail}`, { cause: error });
      }
      return { resolvedForeshadowIds, resolvedTimePromiseTexts };
    }

    // 无 chapterJudge：旧履约适配或纯字面
    if (pendingNodes.length > 0) {
      const legacy = this.options.fulfillmentJudge;
      if (legacy) {
        try {
          const judgment = await legacy.judge({
            mustCover: pendingNodes,
            chapterText: text,
            facts,
          });
          for (const item of judgment.results) {
            if (!item.fulfilled) {
              const suffix = item.reason.trim() ? `（${item.reason.trim()}）` : '';
              addIssue('fulfillment', `未履约节点：${item.node}${suffix}`, item.evidence);
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          for (const node of pendingNodes) {
            addIssue(
              'fulfillment',
              `未履约节点：${node}（语义履约判定失败：${detail}）`
            );
          }
        }
      } else {
        for (const node of pendingNodes) {
          addIssue('fulfillment', `未履约节点：${node}`);
        }
      }
    }
    return { resolvedForeshadowIds, resolvedTimePromiseTexts };
  }
}
