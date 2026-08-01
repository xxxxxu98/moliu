import { isAdvancePrefixedCen, stripAdvancePrefix } from './chapterBlueprintNormalize';

export class PromptInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptInvariantError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePromptJson(prompt: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(prompt);
  const record = asRecord(parsed);
  if (!record) {
    throw new PromptInvariantError('起草 prompt 不是 JSON 对象');
  }
  return record;
}

/** 起草 prompt：无 beat 三份拷贝，候选只传 id */
export function assertDraftPromptShape(prompt: string): void {
  const payload = parsePromptJson(prompt);
  if (!('primaryBeatId' in payload) || typeof payload.primaryBeatId !== 'string') {
    throw new PromptInvariantError('缺少 primaryBeatId');
  }
  if ('beat' in payload) {
    throw new PromptInvariantError('不应再传完整 beat 字段（与 primaryBeat/chapterBeats 重复）');
  }
  if ('allowedCandidateEvents' in payload) {
    throw new PromptInvariantError('不应再传全量 allowedCandidateEvents');
  }
  if (!Array.isArray(payload.allowedCandidateEventIds)) {
    throw new PromptInvariantError('缺少 allowedCandidateEventIds');
  }
  const writingRules = asRecord(payload.writingRules);
  if (writingRules && 'mustCoverInOrder' in writingRules) {
    throw new PromptInvariantError('writingRules 不应再含 mustCoverInOrder 冗余列表');
  }
}

export function assertNoDuplicateBeatFields(prompt: string): void {
  assertDraftPromptShape(prompt);
}

/** 章 beats / 合同：CEN 不得塌成「推进至：」+ 同一 CPN */
export function assertCenNotAdvancePrefix(input: {
  CEN: string;
  CPNs: string[];
  chapterBeats?: Array<{ kind: string; summary: string }>;
}): void {
  const body = stripAdvancePrefix(input.CEN);
  if (isAdvancePrefixedCen(input.CEN) && input.CPNs.some(cpn => cpn === body)) {
    throw new PromptInvariantError(`CEN 畸形塌缩为推进至：${body}`);
  }
  const cenBeat = input.chapterBeats?.find(beat => beat.kind === 'CEN');
  if (cenBeat && isAdvancePrefixedCen(cenBeat.summary)) {
    const beatBody = stripAdvancePrefix(cenBeat.summary);
    const cpnSummaries = (input.chapterBeats ?? [])
      .filter(beat => beat.kind === 'CPN')
      .map(beat => beat.summary);
    if (cpnSummaries.includes(beatBody)) {
      throw new PromptInvariantError(`chapterBeats.CEN 畸形：${cenBeat.summary}`);
    }
  }
}

/** context.blocks：style 不应与 locked-contracts 再重复一份 */
export function assertContractStyleNotDuplicatedInBlocks(prompt: string): void {
  const payload = parsePromptJson(prompt);
  const context = asRecord(payload.context);
  if (!context || !Array.isArray(context.blocks)) return;
  const kinds = context.blocks
    .map(block => asRecord(block)?.kind)
    .filter((kind): kind is string => typeof kind === 'string');
  if (kinds.includes('style') && kinds.includes('locked-contracts')) {
    // 允许 style 块仅含合同未覆盖的增量；若合同 styleGuidance 全量重复则违规
    const styleBlock = context.blocks
      .map(block => asRecord(block))
      .find(block => block?.kind === 'style');
    const contractsBlock = context.blocks
      .map(block => asRecord(block))
      .find(block => block?.kind === 'locked-contracts');
    if (!styleBlock || !contractsBlock || typeof contractsBlock.content !== 'string') return;
    try {
      const contracts = asRecord(JSON.parse(contractsBlock.content));
      const master = asRecord(contracts?.master);
      const contractStyles = new Set(
        Array.isArray(master?.style)
          ? master.style.filter((item): item is string => typeof item === 'string')
          : []
      );
      const styleItems: unknown =
        typeof styleBlock.content === 'string'
          ? JSON.parse(styleBlock.content)
          : styleBlock.content;
      if (Array.isArray(styleItems) && styleItems.length > 0) {
        const allDup = styleItems.every(
          item => typeof item === 'string' && contractStyles.has(item)
        );
        if (allDup) {
          throw new PromptInvariantError('style 块与 locked-contracts.master.style 完全重复');
        }
      }
    } catch (error) {
      if (error instanceof PromptInvariantError) throw error;
    }
  }
}

/** 起草合同角色真相应收敛到本章相关，避免整卷人设灌入 */
export function assertChapterScopedCharacterTruths(
  prompt: string,
  maxCharacters = 6
): void {
  const payload = parsePromptJson(prompt);
  const context = asRecord(payload.context);
  if (!context || !Array.isArray(context.blocks)) return;
  const contractsBlock = context.blocks
    .map(block => asRecord(block))
    .find(block => block?.kind === 'locked-contracts');
  if (!contractsBlock || typeof contractsBlock.content !== 'string') return;
  const contracts = asRecord(JSON.parse(contractsBlock.content));
  const master = asRecord(contracts?.master);
  const truths = asRecord(master?.characterTruths);
  if (!truths) return;
  const count = Object.keys(truths).length;
  if (count > maxCharacters) {
    throw new PromptInvariantError(
      `characterTruths 过多（${count} > ${maxCharacters}），应压缩到本章相关角色`
    );
  }
}

export function assertPurposeSequence(
  purposes: string[],
  expectedSubsequence: string[]
): void {
  let from = 0;
  for (const expected of expectedSubsequence) {
    const idx = purposes.indexOf(expected, from);
    if (idx < 0) {
      throw new PromptInvariantError(
        `请求序列缺少 ${expected}（实际：${purposes.join(' → ')}）`
      );
    }
    from = idx + 1;
  }
}
