/**
 * L1 状态层 - CHANGES 协议处理
 *
 * 职责：
 * 1. 从正文里提取 CHANGES 载荷（容错解析 AI 的不规范输出）
 * 2. 用 Zod schema 校验 CHANGES
 * 3. 序列化 CHANGES 为 prompt 友好的格式
 * 4. 生成 CHANGES 协议的 prompt 模板（教 AI 如何输出）
 *
 * 这是连接"AI 自由生成"和"状态确定性回写"的桥梁。
 */

import {
  CHANGES_DELIMITER,
  CHANGES_PROTOCOL_VERSION,
  ChangeSchema,
  ChangesPayloadSchema,
  type Change,
  type ChangesPayload,
  type EntityRef,
  ALL_CHANGE_TYPES,
} from './types';
import type { z } from 'zod';

// ============================================================
// 正文提取：从 AI 输出里分离"散文"和"CHANGES"
// ============================================================

export interface ExtractResult {
  /** 正文散文（已剥离 CHANGES 部分） */
  prose: string;
  /** 解析出的 CHANGES 载荷（解析失败为 null） */
  changes: ChangesPayload | null;
  /** 提取/解析过程的诊断信息 */
  diagnostics: ChangesDiagnostics;
}

export interface ChangesDiagnostics {
  /** 是否找到分隔符 */
  found: boolean;
  /** 是否成功解析为有效 JSON */
  parsed: boolean;
  /** 是否通过 schema 校验 */
  valid: boolean;
  /** 解析/校验错误（若失败） */
  errors: string[];
  /** 识别到的变更条数 */
  changeCount: number;
}

/**
 * 从 AI 的完整输出里提取散文 + CHANGES。
 *
 * 容错策略（AI 输出常不规范）：
 * 1. 找 `---CHANGES---` 分隔符，分隔符前为散文
 * 2. 分隔符后可能是裸 JSON、```json 代码块、或带前后说明文字
 * 3. 用宽松提取（正则定位第一个 `{` 到最后一个 `}`）+ JSON 容错修复
 * 4. Zod 校验，失败时尝试逐条丢弃坏条目
 */
export function extractChanges(rawOutput: string): ExtractResult {
  const diagnostics: ChangesDiagnostics = {
    found: false,
    parsed: false,
    valid: false,
    errors: [],
    changeCount: 0,
  };

  if (!rawOutput) {
    return { prose: '', changes: null, diagnostics };
  }

  // 1. 定位分隔符（严格：必须独占一行，避免误匹配正文里的 "CHANGES" 字样）
  // 支持 ---CHANGES--- / [CHANGES] 两种形式，且必须在行首行尾（仅有空白/破折号包裹）
  const delimiterPattern = /^[ \t]*(?:-{2,}\s*CHANGES\s*-{2,}|\[\s*CHANGES\s*\])[ \t]*$/m;
  const delimiterMatch = rawOutput.match(delimiterPattern);

  if (!delimiterMatch || delimiterMatch.index === undefined) {
    // 无分隔符：整段当散文
    diagnostics.found = false;
    diagnostics.errors.push('未找到 CHANGES 分隔符');
    return { prose: rawOutput.trim(), changes: null, diagnostics };
  }

  diagnostics.found = true;
  const prose = rawOutput.slice(0, delimiterMatch.index).trim();
  const changesSection = rawOutput.slice(delimiterMatch.index + delimiterMatch[0].length).trim();

  // 2. 从 changesSection 里提取 JSON
  const jsonText = extractJsonBlock(changesSection);
  if (!jsonText) {
    diagnostics.errors.push('CHANGES 区域未找到 JSON 对象');
    return { prose, changes: null, diagnostics };
  }

  // 3. 解析 JSON（带容错修复）
  let parsed: unknown;
  try {
    parsed = JSON.parse(repairJson(jsonText));
    diagnostics.parsed = true;
  } catch (err) {
    diagnostics.errors.push(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    return { prose, changes: null, diagnostics };
  }

  // 4. Zod 校验，失败时尝试逐条修复
  const result = validateWithRepair(parsed);
  if (!result.success) {
    diagnostics.errors.push(...result.errors);
    return { prose, changes: null, diagnostics };
  }

  diagnostics.valid = true;
  diagnostics.changeCount = result.payload.changes.length;
  // 部分恢复时把 repair 过程的 warning 也记入（便于 debug 与 G1 门禁复核）
  diagnostics.errors.push(...result.errors);
  return { prose, changes: result.payload, diagnostics };
}

/**
 * 从文本里提取第一个完整的 JSON 对象。
 * 处理 ```json 代码块包裹、前后多余文字。
 */
function extractJsonBlock(text: string): string | null {
  // 去掉 markdown 代码块标记
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 定位第一个 `{` 到最后一个 `}`（贪心到末尾闭合）
  const start = text.indexOf('{');
  if (start === -1) return null;
  // 简单的括号匹配
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  return text.slice(start, end + 1);
}

/**
 * 容错修复常见的 JSON 格式问题。
 * - 尾随逗号
 * - 单引号 → 双引号
 * - 中文标点引号
 */
function repairJson(text: string): string {
  let fixed = text;
  // 中文引号 → 英文引号
  fixed = fixed.replace(/[""]/g, '"').replace(/['']/g, "'");
  // 单引号字符串 → 双引号（简单场景）
  fixed = fixed.replace(/'([^']*)'(\s*:)/g, '"$1"$2');
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');
  // 尾随逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  return fixed;
}

/**
 * 用 Zod 校验，失败时逐条丢弃坏条目（部分恢复）。
 */
function validateWithRepair(parsed: unknown): {
  success: boolean;
  payload: ChangesPayload;
  errors: string[];
} {
  const errors: string[] = [];

  // 顶层先校验一次
  const fullResult = ChangesPayloadSchema.safeParse(parsed);
  if (fullResult.success) {
    return { success: true, payload: fullResult.data, errors };
  }

  // 顶层失败：尝试只校验 changes 数组的每一项
  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, payload: emptyPayload(), errors: [formatZodError(fullResult.error)] };
  }

  const obj = parsed as Record<string, unknown>;
  const chapter = typeof obj.chapter === 'number' ? obj.chapter : 0;
  const rawChanges = Array.isArray(obj.changes) ? obj.changes : [];

  // 逐条校验
  const validChanges: Change[] = [];
  let dropped = 0;
  for (let i = 0; i < rawChanges.length; i++) {
    // 动态导入 ChangeSchema 的单条校验（避免循环依赖）
    const itemResult = singleChangeParse(rawChanges[i]);
    if (itemResult.success) {
      validChanges.push(itemResult.value);
    } else {
      dropped++;
      errors.push(`第 ${i + 1} 条变更无效（type=${(rawChanges[i] as any)?.type ?? '未知'}）: ${itemResult.error}`);
    }
  }

  if (validChanges.length === 0) {
    return { success: false, payload: emptyPayload(), errors };
  }

  errors.push(`丢弃 ${dropped} 条无效变更，保留 ${validChanges.length} 条`);
  return {
    success: true,
    payload: { version: CHANGES_PROTOCOL_VERSION, chapter, changes: validChanges },
    errors,
  };
}

// 单条变更校验（ChangeSchema 静态导入，types.ts 无循环依赖）
function singleChangeParse(raw: unknown): { success: true; value: Change } | { success: false; error: string } {
  try {
    const result = ChangeSchema.safeParse(raw);
    if (result.success) return { success: true, value: result.data };
    return { success: false, error: formatZodError(result.error) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function formatZodError(error: z.ZodError): string {
  const issues = error.issues.slice(0, 3);
  return issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function emptyPayload(): ChangesPayload {
  return { version: CHANGES_PROTOCOL_VERSION, chapter: 0, changes: [] };
}

// ============================================================
// 序列化：CHANGES → 人可读 / prompt 友好
// ============================================================

/**
 * 把单条 Change 序列化为人可读字符串（用于 prompt 注入示例、报告展示）。
 */
export function formatChange(change: Change): string {
  switch (change.type) {
    case 'character_state':
      return `[角色状态] ${ref(change.entity)} 的 ${change.field}: ${fmt(change.old)} → ${fmt(change.new)}`;
    case 'character_location':
      return `[角色移动] ${ref(change.entity)}: ${change.from ? ref(change.from) + ' → ' : ''}${ref(change.to)}`;
    case 'character_appearance':
      return `[外貌变化] ${ref(change.entity)} 的 ${change.field}: ${fmt(change.old)} → ${fmt(change.new)}`;
    case 'relationship':
      return `[关系变化] ${ref(change.from)} → ${ref(change.to)}: ${change.relationType}${change.delta !== undefined ? ` (${change.delta > 0 ? '+' : ''}${change.delta})` : ''}`;
    case 'conflict_progress':
      return `[冲突推进] ${change.name || change.conflictId}: ${change.newStatus ?? ''}${change.progressDelta !== undefined ? ` (+${change.progressDelta})` : ''}`;
    case 'foreshadow':
      return `[伏笔] ${change.action} #${change.id}: ${change.hint}`;
    case 'plot_node':
      return `[剧情节点] [${change.strand}] ${change.summary}`;
    case 'location_state':
      return `[地点状态] ${ref(change.entity)}: ${change.newStatus ?? ''}`;
    case 'faction_state':
      return `[势力状态] ${ref(change.entity)}: ${change.newStatus ?? ''}${change.newAttitude ? ` (对主角:${change.newAttitude})` : ''}`;
    case 'timeline':
      return `[时间推进] ${change.currentTime} ${change.event ? '— ' + change.event : ''}`;
    case 'item_transfer':
      return `[物品流转] ${ref(change.item)}: ${change.fromOwner ? ref(change.fromOwner) + ' → ' : ''}${ref(change.toOwner)}`;
    case 'secret_reveal':
      return `[秘密揭示] #${change.id}: 通知 ${change.newlyInformed.map(ref).join(', ') || '（无）'}`;
    case 'oath_change':
      return `[誓约] #${change.id}: ${change.newStatus ?? change.content}`;
    case 'deadline_change':
      return `[截止] #${change.id} ${change.event}: ${change.newStatus ?? ''}${change.remaining ? ` (剩余 ${change.remaining})` : ''}`;
    default:
      return `[未知变更] ${JSON.stringify(change)}`;
  }
}

function ref(entity: EntityRef): string {
  return entity.name + (entity.id ? `[${entity.id}]` : '');
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return '∅';
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  return String(value);
}

/**
 * 把整个 ChangesPayload 序列化为 prompt 友好的多行文本。
 * 用于：审查报告、debug 展示、向用户解释"AI 改了哪些状态"。
 */
export function formatChangesPayload(payload: ChangesPayload): string {
  if (payload.changes.length === 0) return '（无状态变更）';
  const lines = payload.changes.map((c, i) => `${i + 1}. ${formatChange(c)}`);
  return `第 ${payload.chapter} 章状态变更（共 ${payload.changes.length} 条）：\n${lines.join('\n')}`;
}

// ============================================================
// 序列化：CHANGES → JSON 字符串（用于落库/回放）
// ============================================================

export function serializeChanges(payload: ChangesPayload): string {
  return JSON.stringify(payload, null, 2);
}

// ============================================================
// Prompt 模板：教 AI 如何输出 CHANGES
// ============================================================

/**
 * 生成 CHANGES 协议的 prompt 片段。
 * 注入到 draft prompt 末尾，要求 AI 在正文后输出结构化 diff。
 */
export function buildChangesProtocolPrompt(options?: {
  /** 是否包含完整示例（首次调用建议含，省 token 时可省） */
  includeExamples?: boolean;
}): string {
  const includeExamples = options?.includeExamples ?? true;

  const header = `## 【强制】状态变更声明协议（CHANGES）

你必须在正文之后、以 \`${CHANGES_DELIMITER}\` 分隔符开头，输出本章对世界状态造成的所有变化。
这些变更将作为下一章的"事实依据"，**写错或漏报会导致后续章节产生剧情矛盾**。

### 必须遵守的规则
1. 只报告本章**实际发生**的变化，不要臆测。
2. 每条变更必须能在正文里找到出处（填入 evidence 字段，引用原文片段）。
3. 实体优先用 ID（如 \`char_001\`），无 ID 时用 name + type。
4. 值变化必须同时给出 old 和 new。
5. 宁可多报（门禁会校验），不可漏报（漏报导致下一章基于错误事实）。

### 支持的变更类型（共 ${ALL_CHANGE_TYPES.length} 种）
${ALL_CHANGE_TYPES.map(t => `- \`${t}\``).join('\n')}`;

  const example = includeExamples ? `

### 输出示例
\`\`\`
（这里是正文散文……）

${CHANGES_DELIMITER}
{
  "version": "${CHANGES_PROTOCOL_VERSION}",
  "chapter": 5,
  "changes": [
    {
      "type": "character_state",
      "entity": { "id": "char_001", "name": "林动", "type": "character" },
      "field": "powerLevel",
      "old": "练气三层",
      "new": "练气四层",
      "evidence": "掌心灵气漩涡凝聚，经脉中传来突破的轰鸣……",
      "reason": "闭关突破"
    },
    {
      "type": "character_location",
      "entity": { "id": "char_001", "name": "林动", "type": "character" },
      "from": { "id": "loc_001", "name": "青云宗", "type": "location" },
      "to": { "id": "loc_005", "name": "万妖谷", "type": "location" },
      "reason": "奉师命下山除妖"
    },
    {
      "type": "foreshadow",
      "id": "fs_007",
      "hint": "断剑在月圆夜嗡鸣",
      "action": "setup",
      "tier": "major",
      "plannedPayoffChapter": 30
    }
  ]
}
\`\`\`` : '';

  return header + example;
}

// ============================================================
// 空载荷工厂
// ============================================================

export function createEmptyChanges(chapter: number): ChangesPayload {
  return {
    version: CHANGES_PROTOCOL_VERSION,
    chapter,
    changes: [],
  };
}

/**
 * 手动构造一条变更（用于兜底提取、测试、用户手动修正）。
 */
export function makeChange(change: Change): Change {
  return change;
}
