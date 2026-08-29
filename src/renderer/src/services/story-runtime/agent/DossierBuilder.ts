import type {
  CoverageSelfAudit,
  ResearchDossier,
  ResearchGap,
  ResearchRunSummary,
} from '@/types/story-runtime';

/**
 * 检索回合的滚动蒸馏档案构建器（docs/agent-loop-refactor.md §6）。
 *
 * 蒸馏是确定性的、不花 AI 调用：工具结果是结构化的，按工具类型归并去重。
 * 写作 prompt 只渲染本档案的紧凑文本形态，不渲染循环原始对话——这是
 * 「循环上下文」与「写作上下文」之间的唯一桥，防多轮工具结果稀释注意力。
 */
export class DossierBuilder {
  private readonly entityMap = new Map<
    string,
    ResearchDossier['entitySnapshots'][number]
  >();
  private readonly foreshadowMap = new Map<
    string,
    ResearchDossier['foreshadowChecks'][number]
  >();
  private readonly sceneRefMap = new Map<string, ResearchDossier['priorSceneRefs'][number]>();
  private readonly timelineFacts: string[] = [];
  private readonly gaps: ResearchGap[] = [];
  private coverage: CoverageSelfAudit | undefined;
  private versionCounter = 0;

  /** 每次新增/覆盖档案条目自增；循环器用前后差值判定「本轮是否带回新信息」 */
  version(): number {
    return this.versionCounter;
  }

  recordEntitySnapshot(
    snapshot: ResearchDossier['entitySnapshots'][number]
  ): void {
    const existing = this.entityMap.get(snapshot.id);
    if (existing) {
      // 同实体后查覆盖前查，sourceRounds 留痕
      existing.statusLine = snapshot.statusLine;
      existing.sourceRounds = [
        ...new Set([...existing.sourceRounds, ...snapshot.sourceRounds]),
      ];
    } else {
      this.entityMap.set(snapshot.id, { ...snapshot, sourceRounds: [...snapshot.sourceRounds] });
    }
    this.versionCounter += 1;
  }

  recordForeshadowCheck(
    check: ResearchDossier['foreshadowChecks'][number]
  ): void {
    const existing = this.foreshadowMap.get(check.id);
    if (existing) {
      existing.status = check.status;
      if (check.note) existing.note = check.note;
    } else {
      this.foreshadowMap.set(check.id, { ...check });
    }
    this.versionCounter += 1;
  }

  recordSceneRef(ref: ResearchDossier['priorSceneRefs'][number]): void {
    const key = `${ref.chapter}|${ref.summary}`;
    if (!this.sceneRefMap.has(key)) {
      this.sceneRefMap.set(key, { ...ref });
      this.versionCounter += 1;
    }
  }

  recordTimelineFact(fact: string): void {
    const trimmed = fact.trim();
    if (trimmed && !this.timelineFacts.includes(trimmed)) {
      this.timelineFacts.push(trimmed);
      this.versionCounter += 1;
    }
  }

  recordGaps(gaps: ResearchGap[] | undefined): void {
    for (const gap of gaps ?? []) {
      const topic = String(gap?.topic ?? '').trim();
      if (!topic) continue;
      if (this.gaps.some(item => item.topic === topic)) continue;
      this.gaps.push({ topic, reason: String(gap?.reason ?? '').trim() });
      this.versionCounter += 1;
    }
  }

  recordCoverage(coverage: CoverageSelfAudit | undefined): void {
    if (!coverage) return;
    this.coverage = coverage;
    this.recordGaps(coverage.gaps);
  }

  build(stats: ResearchRunSummary): ResearchDossier {
    return {
      entitySnapshots: [...this.entityMap.values()],
      foreshadowChecks: [...this.foreshadowMap.values()],
      priorSceneRefs: [...this.sceneRefMap.values()],
      timelineFacts: [...this.timelineFacts],
      gaps: [...this.gaps],
      coverage: this.coverage,
      stats,
    };
  }
}

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * 档案的紧凑文本渲染（进入 ContextPack 的 'research-dossier' block）。
 * 分节限额保证总长可控（默认 ≤4000 字 ≈1000 token），gaps 永远完整保留。
 */
export function renderDossier(dossier: ResearchDossier, maxChars = 4000): string {
  const sections: string[] = [];
  const { stats } = dossier;

  sections.push(
    `【检索档案】(模型自主核查 ${stats.rounds} 轮 / ${stats.toolCalls} 次工具调用 / 收尾方式:${stats.finishReason})`
  );

  const entities = dossier.entitySnapshots.slice(0, 8);
  if (entities.length > 0) {
    sections.push(
      '◆ 角色状态(检索回合核实)\n' +
        entities
          .map(entity => `- ${entity.name}(${entity.kind}): ${clip(entity.statusLine, 120)}`)
          .join('\n')
    );
  }

  const foreshadows = dossier.foreshadowChecks.slice(0, 8);
  if (foreshadows.length > 0) {
    sections.push(
      '◆ 伏笔核对\n' +
        foreshadows
          .map(
            check =>
              `- ${check.id} [${check.status}] ${clip(check.hint, 60)}${check.note ? `(${check.note})` : ''}`
          )
          .join('\n')
    );
  }

  const sceneRefs = dossier.priorSceneRefs.slice(0, 6);
  if (sceneRefs.length > 0) {
    sections.push(
      '◆ 前情锚点\n' +
        sceneRefs.map(ref => `- 第${ref.chapter}章: ${clip(ref.summary, 70)}`).join('\n')
    );
  }

  if (dossier.timelineFacts.length > 0) {
    sections.push(
      '◆ 时间线要点\n' + dossier.timelineFacts.slice(0, 8).map(fact => `- ${clip(fact, 60)}`).join('\n')
    );
  }

  const coverage = dossier.coverage;
  if (coverage) {
    const parts: string[] = [];
    if (coverage.castStatesConfirmed?.length) {
      parts.push(`已确认状态:${coverage.castStatesConfirmed.join('、')}`);
    }
    if (coverage.foreshadowsChecked?.length) {
      parts.push(`已核对伏笔:${coverage.foreshadowsChecked.join('、')}`);
    }
    if (coverage.priorEventsVerified?.length) {
      parts.push(`已核对前情:${coverage.priorEventsVerified.map(item => clip(item, 40)).join('；')}`);
    }
    if (parts.length > 0) sections.push('◆ 覆盖自审\n' + parts.map(part => `- ${part}`).join('\n'));
  }

  if (dossier.gaps.length > 0) {
    sections.push(
      '◆ 信息缺口(以下信息未能确认:写作时不得虚构具体细节,须模糊化或绕开)\n' +
        dossier.gaps
          .slice(0, 6)
          .map(gap => `- ${clip(gap.topic, 60)}——${clip(gap.reason, 50)}`)
          .join('\n')
    );
  }

  let rendered = sections.join('\n\n');
  if (rendered.length > maxChars) {
    rendered = `${rendered.slice(0, maxChars)}\n…(档案超长截断)`;
  }
  return rendered;
}
