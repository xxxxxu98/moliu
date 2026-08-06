import type {
  ChapterJudge,
  ChapterJudgeIssueType,
  ContinuityDomain,
  ContinuityIssue,
  ContinuityReport,
  ContractPack,
  ExtractedFacts,
  FulfillmentJudge,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
  ValidationSeverity,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';
import { isForbiddenExemptForFulfillment } from './contractHealth';
import { stripOpeningCbnPrefix } from './chapterBlueprintNormalize';

export interface ContinuityValidationInput {
  contracts: ContractPack;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  drafts: SceneDraft[];
  facts: ExtractedFacts;
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
          addIssue('entity', `事件 ${event.id} 引用了未知实体 ${participant}`, event.evidence, event.sceneId);
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

    await this.validateSemanticGates(
      input.contracts,
      state,
      chapterText(input.drafts),
      input.facts,
      addIssue
    );

    const blockingCount = issues.filter(issue => issue.severity === 'blocking').length;
    const warningCount = issues.filter(issue => issue.severity === 'warning').length;
    return {
      accepted:
        blockingCount === 0 && warningCount <= input.contracts.review.maxWarnings,
      issues,
      checkedDomains,
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
    ) => void
  ): Promise<void> {
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
          facts,
          checkDeepSemantic: enableDeepSemantic,
          stateDigest: {
            entities: Object.values(state.entities).slice(0, 20).map(entity => ({
              id: entity.id,
              name: entity.name,
              kind: entity.kind,
            })),
            knowledge: state.knowledge,
            openForeshadows: state.openForeshadows.slice(0, 20),
          },
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
          const domain = mapJudgeIssueDomain(item.type);
          // fact_conflict（与状态摘要/事实冲突）一律视为 blocking，
          // 不依赖 blockingDomains 配置——跨章事实矛盾（如人物生死前后不一）属硬伤，
          // 必须触发重写/拒收，避免让读者看到「上章已死角色本章复活」类连续性断裂。
          const severity: ValidationSeverity =
            item.type === 'fact_conflict'
              ? 'blocking'
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
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const isTransientNetwork =
          /socket hang up|ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch\(\)|Too Many Requests|429|network|TLS|disconnected/iu.test(
            detail
          );
        if (isTransientNetwork) {
          // 瞬时网络失败：只记一条 warning，避免 N 个 pending 节点把 warning 顶破上限
          addIssue(
            'fulfillment',
            `语义审查暂时不可用（${detail}）；已回退字面履约，pending=${pendingNodes.length}`,
            pendingNodes.slice(0, 3),
            undefined,
            'warning'
          );
        } else {
          for (const node of pendingNodes) {
            addIssue('fulfillment', `未履约节点：${node}（语义审查失败：${detail}）`);
          }
          if (pendingNodes.length === 0 && enableDeepSemantic) {
            addIssue('fulfillment', `语义审查失败：${detail}`, [], undefined, 'warning');
          }
        }
      }
      return;
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
  }
}
