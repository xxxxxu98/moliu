/**
 * L3 上下文层 - 上下文组装器
 *
 * 把 L1 状态快照 + L2 检索片段 + 大纲 + 写作规范，
 * 按预算管理和位置感知拼装成最终 prompt。
 *
 * 核心：对抗 Lost-in-the-Middle
 *   [开头] 状态快照 + 当前章细纲 + 硬约束  ← 模型最关注
 *   [中段] 检索召回的历史片段               ← 容忍衰减
 *   [结尾] 写作规范 + CHANGES 协议          ← 模型最关注
 */

import { estimateTokens, getInputTokenBudget } from './TokenEstimator';
import { PriorityPolicy } from './PriorityPolicy';
import type { BlockPriorityConfig, ContextBlockType, InjectionPosition } from './PriorityPolicy';
import type { StateSnapshot, ChangesPayload } from '../state/types';
import { buildChangesProtocolPrompt } from '../state/ChangesProtocol';

// ============================================================
// 输入：待组装的原始材料
// ============================================================

export interface ContextAssemblyInput {
  /** 模型名（决定预算） */
  modelName?: string;
  /** 章节号 */
  chapter: number;
  /** 当前状态快照（来自 L1） */
  snapshot: StateSnapshot;
  /** 当前章细纲文本 */
  currentChapterOutline: string;
  /** 窗口化大纲（来自 OutlineContextBuilder.buildWindowedOutlineText） */
  windowedOutline?: string;
  /** RAG 检索召回的历史片段（来自 L2） */
  retrievedFragments?: RetrievedFragment[];
  /** 写作规范文本（去AI味/对话格式等，来自 prompt-builder） */
  writingRules?: string;
  /** 增强设计段落（来自 buildEnhancedDesignPrompt） */
  enhancedDesign?: string;
  /** 前章衔接信息 */
  previousChapter?: { title: string; summary: string; ending: string };
  /** 用户自定义指令 */
  userInstructions?: string;
  /** 对话历史（如有多轮） */
  history?: string;
  /** 输出预留比例（默认 0.3） */
  outputReserveRatio?: number;
  /** 自定义优先级策略 */
  priorityPolicy?: PriorityPolicy;
}

export interface RetrievedFragment {
  /** 片段文本 */
  text: string;
  /** 来源章节号 */
  chapter: number;
  /** 相关度分数（0-1） */
  score: number;
  /** 来源标签 */
  source?: string;
}

// ============================================================
// 组装结果
// ============================================================

export interface ContextAssemblyResult {
  /** 最终拼装的 prompt */
  prompt: string;
  /** 各块的 token 使用统计 */
  blockStats: BlockStat[];
  /** 总 token 数 */
  totalTokens: number;
  /** 输入预算 */
  budget: number;
  /** 是否有块被截断/淘汰 */
  truncated: boolean;
  /** 淘汰的块类型列表 */
  droppedBlocks: ContextBlockType[];
}

export interface BlockStat {
  type: ContextBlockType;
  label: string;
  position: InjectionPosition;
  allocatedTokens: number;
  actualTokens: number;
  truncated: boolean;
}

// ============================================================
// 组装器
// ============================================================

export class ContextAssembler {
  /**
   * 组装最终 prompt。
   */
  assemble(input: ContextAssemblyInput): ContextAssemblyResult {
    const policy = input.priorityPolicy ?? new PriorityPolicy();
    const budget = getInputTokenBudget(input.modelName, input.outputReserveRatio);
    const allocation = policy.allocateBudget(budget);

    // 1. 准备每个块的原始文本
    const blockTexts = this.prepareBlockTexts(input);

    // 2. 按分配的额度截断每个块
    const blockStats: BlockStat[] = [];
    const truncatedBlocks = new Map<ContextBlockType, string>();
    const droppedBlocks: ContextBlockType[] = [];

    for (const block of policy.getConfig()) {
      const rawText = blockTexts.get(block.type) ?? '';
      const allocated = allocation.get(block.type) ?? 0;

      if (!rawText.trim()) {
        blockStats.push({
          type: block.type, label: block.label, position: block.position,
          allocatedTokens: allocated, actualTokens: 0, truncated: false,
        });
        continue;
      }

      const actualTokens = estimateTokens(rawText);
      let finalText = rawText;
      let truncated = false;

      if (actualTokens > allocated) {
        // 超额度：截断（minTokens 强制保留）
        const minKeep = block.minTokens ?? 0;
        if (allocated < minKeep && actualTokens >= minKeep) {
          // 至少保留 minTokens
          finalText = truncateToTokens(rawText, minKeep);
        } else {
          finalText = truncateToTokens(rawText, allocated);
        }
        truncated = true;
      }

      // 完全为空（截断后）→ 丢弃
      if (!finalText.trim()) {
        droppedBlocks.push(block.type);
      } else {
        truncatedBlocks.set(block.type, finalText);
      }

      blockStats.push({
        type: block.type, label: block.label, position: block.position,
        allocatedTokens: allocated,
        actualTokens: estimateTokens(finalText),
        truncated,
      });
    }

    // 3. 按位置分组拼装
    const groups = policy.groupByPosition();
    const headText = this.joinBlocks(groups.head, truncatedBlocks);
    const middleText = this.joinBlocks(groups.middle, truncatedBlocks);
    const tailText = this.joinBlocks(groups.tail, truncatedBlocks);

    // 4. 组装最终 prompt（head → middle → tail）
    const parts: string[] = [];
    if (headText) parts.push(headText);
    if (middleText) parts.push(middleText);
    if (tailText) parts.push(tailText);

    const prompt = parts.join('\n\n---\n\n');
    const totalTokens = estimateTokens(prompt);
    const truncated = blockStats.some(s => s.truncated) || droppedBlocks.length > 0;

    return {
      prompt,
      blockStats,
      totalTokens,
      budget,
      truncated,
      droppedBlocks,
    };
  }

  // ============================================================
  // 块文本准备
  // ============================================================

  private prepareBlockTexts(input: ContextAssemblyInput): Map<ContextBlockType, string> {
    const map = new Map<ContextBlockType, string>();

    // 1. 状态快照
    map.set('state_snapshot', this.renderSnapshot(input.snapshot));

    // 2. 当前章细纲
    const outlineParts: string[] = [];
    if (input.currentChapterOutline) {
      outlineParts.push(`## 本章大纲\n${input.currentChapterOutline}`);
    }
    if (input.windowedOutline) {
      outlineParts.push(`## 邻章细纲（窗口）\n${input.windowedOutline}`);
    }
    map.set('current_outline', outlineParts.join('\n\n'));

    // 3. RAG 检索片段
    map.set('retrieved_fragments', this.renderRetrievedFragments(input.retrievedFragments ?? []));

    // 4. 写作规范
    map.set('writing_rules', input.writingRules ?? '');

    // 5. 增强设计
    map.set('enhanced_design', input.enhancedDesign ?? '');

    // 6. 前章衔接
    if (input.previousChapter) {
      const pc = input.previousChapter;
      map.set('previous_chapter',
        `## 前章衔接\n- 前章标题：${pc.title}\n- 前章摘要：${pc.summary}\n- 前章结尾：${pc.ending}\n\n**请在开头 300 字内衔接前章结尾。**`);
    }

    // 7. 活跃伏笔（从快照提取）
    map.set('foreshadows', this.renderActiveForeshadows(input.snapshot));

    // 8. 用户指令
    map.set('user_instructions',
      input.userInstructions ? `## 用户额外指令\n${input.userInstructions}` : '');

    // 9. CHANGES 协议
    map.set('changes_protocol', buildChangesProtocolPrompt({ includeExamples: false }));

    // 10. 历史
    map.set('history', input.history ?? '');

    return map;
  }

  /** 把状态快照渲染为 prompt 友好的事实表。 */
  private renderSnapshot(snapshot: StateSnapshot): string {
    const sections: string[] = ['## 权威事实快照（第 ' + snapshot.chapter + ' 章后的状态）'];
    sections.push('**与下方原文冲突时，以此事实表为准。**\n');

    // 角色状态
    const chars = Object.values(snapshot.characters);
    if (chars.length > 0) {
      sections.push('### 角色状态');
      for (const c of chars.slice(0, 15)) {
        const loc = snapshot.characterLocations[c.entityId];
        const locName = loc ? snapshot.locations[loc]?.name ?? loc : '位置未知';
        const state = [
          `${c.name}（${c.role || '角色'}）`,
          `境界=${c.powerLevel || '未定'}`,
          `位置=${locName}`,
          c.alive ? '存活' : '已故',
        ];
        if (c.mentalState) state.push(`心理=${c.mentalState}`);
        if (c.abilities.length > 0) state.push(`能力=[${c.abilities.join(',')}]`);
        sections.push(`- ${state.join(' | ')}`);
      }
    }

    // 世界规则
    if (snapshot.worldRules.length > 0) {
      sections.push('\n### 世界观硬约束（不可违反）');
      for (const r of snapshot.worldRules.slice(0, 10)) {
        sections.push(`- ${r.name}：${r.rule}`);
      }
    }

    // 势力
    const factions = Object.values(snapshot.factions);
    if (factions.length > 0) {
      sections.push('\n### 势力状态');
      for (const f of factions.slice(0, 8)) {
        sections.push(`- ${f.name}：${f.status}（对主角：${f.attitudeToProtagonist}）`);
      }
    }

    // 时间线
    if (snapshot.timeline.currentTime || snapshot.timeline.elapsed) {
      sections.push('\n### 时间线');
      sections.push(`- 当前：${snapshot.timeline.currentTime || '未定'}`);
      if (snapshot.timeline.elapsed) sections.push(`- 经过：${snapshot.timeline.elapsed}`);
    }

    return sections.join('\n');
  }

  /** 渲染 RAG 检索片段。 */
  private renderRetrievedFragments(fragments: RetrievedFragment[]): string {
    if (fragments.length === 0) return '';
    const sections = ['## 历史相关片段（检索召回）'];
    for (const f of fragments.slice(0, 8)) {
      const scoreLabel = f.score > 0.8 ? '（高度相关）' : f.score > 0.6 ? '（相关）' : '';
      sections.push(`### 第 ${f.chapter} 章${f.source ? ' · ' + f.source : ''} ${scoreLabel}`);
      sections.push(f.text);
    }
    sections.push('\n**以上为历史检索片段，仅供参考，不得直接复制。**');
    return sections.join('\n');
  }

  /** 渲染活跃伏笔。 */
  private renderActiveForeshadows(snapshot: StateSnapshot): string {
    const active = Object.values(snapshot.foreshadows)
      .filter(f => f.status !== 'resolved' && f.status !== 'abandoned' && f.status !== 'payoff')
      .sort((a, b) => {
        const tierOrder = { series: 0, arc: 1, major: 2, minor: 3, micro: 4 };
        return (tierOrder[a.tier] ?? 5) - (tierOrder[b.tier] ?? 5);
      });

    if (active.length === 0) return '';

    const sections = ['## 活跃伏笔（请勿遗忘，适时铺垫或回收）'];
    for (const f of active.slice(0, 10)) {
      const planned = f.plannedPayoffChapter ? `（计划第 ${f.plannedPayoffChapter} 章回收）` : '';
      sections.push(`- [${f.tier}] ${f.hint} ${planned}`);
    }
    return sections.join('\n');
  }

  /** 按位置组拼接块文本。 */
  private joinBlocks(
    blocks: BlockPriorityConfig[],
    texts: Map<ContextBlockType, string>,
  ): string {
    const parts: string[] = [];
    for (const block of blocks) {
      const text = texts.get(block.type);
      if (text && text.trim()) parts.push(text);
    }
    return parts.join('\n\n');
  }
}

// ============================================================
// 辅助：按 token 数截断文本
// ============================================================

/** 截断文本到不超过 maxTokens。尽量在段落/句子边界截断。 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;

  // 估算字符数（中文为主时 token ≈ chars/1.5）
  const approxChars = Math.floor(maxTokens * 1.5);
  if (text.length <= approxChars) return text;

  // 在段落边界截断
  const paragraphs = text.split(/\n\s*\n/);
  let result = '';
  for (const para of paragraphs) {
    const candidate = result ? result + '\n\n' + para : para;
    if (estimateTokens(candidate) > maxTokens) break;
    result = candidate;
  }

  // 如果段落级截断后还为空（单个段落超长），按字符硬截断
  if (!result) {
    const sentenceEnd = text.slice(0, approxChars).lastIndexOf('。');
    const cut = sentenceEnd > approxChars * 0.5 ? sentenceEnd + 1 : approxChars;
    result = text.slice(0, cut) + '…';
  }

  return result;
}
