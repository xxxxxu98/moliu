/**
 * L5 门禁层 - G1~G6 确定性门禁
 *
 * 这六道门禁都是代码可判定的（毫秒级，0 成本），
 * 在 LLM 调用前拦截 80% 的明显幻觉。
 *
 *   G1 协议解析  CHANGES 格式合规
 *   G2 引用校验  实体 ID 真实存在
 *   G3 结构一致性  CHANGES 与快照矛盾（核心）
 *   G4 描写一致性  外貌/地点描写 vs 档案
 *   G5 蓝图出场    大纲要求的角色/事件都出现了
 *   G6 未知实体    新实体/龙套计数阈值
 */

import type {
  Gate,
  GateContext,
  GateResult,
  GateIssue,
  GateConfig,
  GateCategory,
} from './types';
import { DEFAULT_GATE_CONFIG } from './types';
import type { Change, ChangesPayload, StateSnapshot, EntityRef } from '../state/types';

/** config 兜底合并：门禁可被独立调用（测试），缺失字段用默认值。 */
function withDefaults(config: Partial<GateConfig>): GateConfig {
  return { ...DEFAULT_GATE_CONFIG, ...config };
}

// ============================================================
// 工具
// ============================================================

function countWords(text: string): number {
  if (!text) return 0;
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

/** 收集 CHANGES 里出现的所有实体引用。 */
function collectEntityRefs(changes: ChangesPayload): Array<{ ref: EntityRef; changeType: string }> {
  const refs: Array<{ ref: EntityRef; changeType: string }> = [];
  for (const change of changes.changes) {
    const c = change as Change;
    switch (c.type) {
      case 'character_state':
      case 'character_appearance':
      case 'location_state':
      case 'faction_state':
        refs.push({ ref: c.entity, changeType: c.type });
        break;
      case 'character_location':
        refs.push({ ref: c.entity, changeType: c.type });
        refs.push({ ref: c.to, changeType: c.type });
        if (c.from) refs.push({ ref: c.from, changeType: c.type });
        break;
      case 'relationship':
        refs.push({ ref: c.from, changeType: c.type });
        refs.push({ ref: c.to, changeType: c.type });
        break;
      case 'item_transfer':
        refs.push({ ref: c.item, changeType: c.type });
        if (c.toOwner) refs.push({ ref: c.toOwner, changeType: c.type });
        if (c.fromOwner) refs.push({ ref: c.fromOwner, changeType: c.type });
        break;
      case 'secret_reveal':
        for (const n of c.newlyInformed) refs.push({ ref: n, changeType: c.type });
        if (c.oathMaker) refs.push({ ref: c.oathMaker, changeType: c.type });
        break;
      default:
        break;
    }
  }
  return refs;
}

function makeIssue(
  category: GateCategory,
  severity: GateIssue['severity'],
  location: string,
  description: string,
  opts: { evidence?: string; suggestion?: string; autoFixable?: boolean } = {},
): GateIssue {
  return {
    category,
    severity,
    location,
    description,
    evidence: opts.evidence,
    suggestion: opts.suggestion,
    autoFixable: opts.autoFixable ?? false,
  };
}

// ============================================================
// G1 协议解析门禁
// ============================================================

export class Gate1Protocol implements Gate {
  id = 'G1' as const;
  name = '协议解析';
  requiresLLM = false;

  async run(ctx: GateContext, _config: GateConfig): Promise<GateResult> {
    const start = Date.now();
    const issues: GateIssue[] = [];

    // 1. CHANGES 必须存在且有 version
    if (!ctx.changes) {
      issues.push(makeIssue('protocol', 'critical', 'CHANGES', '未输出 CHANGES 协议载荷'));
    } else {
      if (ctx.changes.version !== '1.0') {
        issues.push(makeIssue('protocol', 'high', 'CHANGES.version',
          `协议版本不匹配：期望 1.0，实际 ${ctx.changes.version}`));
      }
      if (ctx.changes.chapter !== ctx.chapter) {
        issues.push(makeIssue('protocol', 'medium', 'CHANGES.chapter',
          `章节号不匹配：期望 ${ctx.chapter}，实际 ${ctx.changes.chapter}`));
      }
    }

    // 2. 字段完整性抽查（每条 change 必须有 type）
    if (ctx.changes?.changes) {
      for (let i = 0; i < ctx.changes.changes.length; i++) {
        const c = ctx.changes.changes[i] as any;
        if (!c.type) {
          issues.push(makeIssue('protocol', 'critical', `CHANGES.changes[${i}]`,
            `第 ${i + 1} 条变更缺少 type 字段`));
        }
        // evidence 字段强烈推荐（G3 回查依赖）
        if (!c.evidence && c.type !== 'timeline' && c.type !== 'plot_node') {
          issues.push(makeIssue('protocol', 'low', `CHANGES.changes[${i}]`,
            `第 ${i + 1} 条变更缺少 evidence 字段，门禁无法回查正文出处`,
            { suggestion: '补上 evidence 字段，引用正文片段' }));
        }
      }
    }

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
      issues,
      durationMs: Date.now() - start,
      stats: { changeCount: ctx.changes?.changes.length ?? 0 },
    };
  }
}

// ============================================================
// G2 引用校验门禁
// ============================================================

export class Gate2Reference implements Gate {
  id = 'G2' as const;
  name = '引用校验';
  requiresLLM = false;

  async run(ctx: GateContext, _config: GateConfig): Promise<GateResult> {
    const start = Date.now();
    const issues: GateIssue[] = [];
    const snap = ctx.snapshot;

    if (!ctx.changes?.changes.length) {
      return {
        gateId: this.id, gateName: this.name, passed: true,
        issues, durationMs: Date.now() - start, stats: { checkedRefs: 0 },
      };
    }

    const refs = collectEntityRefs(ctx.changes);
    let invalidCount = 0;

    for (const { ref, changeType } of refs) {
      // ID 优先校验
      if (ref.id) {
        const exists = snap.characters[ref.id]
          || snap.locations[ref.id]
          || snap.factions[ref.id]
          || snap.items[ref.id]
          || snap.characterAppearances[ref.id];
        if (!exists) {
          invalidCount++;
          issues.push(makeIssue('reference', 'high',
            `CHANGES.${changeType}`,
            `引用的实体 ID "${ref.id}"（${ref.name}）在快照中不存在`,
            { suggestion: '检查 ID 拼写，或改用 name 让系统自动创建' }));
        }
      }
    }

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
      issues,
      durationMs: Date.now() - start,
      stats: { checkedRefs: refs.length, invalidRefs: invalidCount },
    };
  }
}

// ============================================================
// G3 结构一致性门禁（核心）
// ============================================================

export class Gate3Consistency implements Gate {
  id = 'G3' as const;
  name = '结构一致性';
  requiresLLM = false;

  async run(ctx: GateContext, _config: GateConfig): Promise<GateResult> {
    const start = Date.now();
    const issues: GateIssue[] = [];
    const snap = ctx.snapshot;
    const prose = ctx.prose;

    if (!ctx.changes?.changes.length) {
      return {
        gateId: this.id, gateName: this.name, passed: true,
        issues, durationMs: Date.now() - start,
      };
    }

    for (const change of ctx.changes.changes) {
      const c = change as Change;

      // 1. character_state：old 必须与快照一致；evidence 必须能在正文找到
      if (c.type === 'character_state') {
        const entityId = c.entity.id || resolveByName(snap, c.entity.name);
        if (entityId && snap.characters[entityId]) {
          const charState = snap.characters[entityId];
          if (c.old !== undefined) {
            const actualOld = (charState as any)[c.field];
            if (!looselyEqual(c.old, actualOld)) {
              issues.push(makeIssue('consistency', 'critical',
                `CHANGES.${c.type}`,
                `${c.entity.name} 的 ${c.field}：CHANGES 声称旧值 "${fmt(c.old)}"，快照实际为 "${fmt(actualOld)}"`,
                { evidence: c.evidence, suggestion: '修正 CHANGES 的 old 字段，或确认正文确实发生了变化' }));
            }
          }
          // 死人状态校验
          if (c.field === 'alive' && c.new === true && charState.alive === false) {
            issues.push(makeIssue('consistency', 'critical',
              `正文`,
              `${c.entity.name} 在第 ${snap.chapter} 章已死亡，不能复活`));
          }
        }
      }

      // 2. character_location：from 必须与快照一致
      if (c.type === 'character_location' && c.from) {
        const entityId = c.entity.id || resolveByName(snap, c.entity.name);
        if (entityId) {
          const currentLoc = snap.characterLocations[entityId];
          const fromId = c.from.id || resolveByName(snap, c.from.name);
          if (currentLoc && fromId && currentLoc !== fromId) {
            issues.push(makeIssue('consistency', 'high',
              `CHANGES.${c.type}`,
              `${c.entity.name} 出发地声明为 "${c.from.name}"，但快照显示在 "${locName(snap, currentLoc)}"`));
          }
        }
      }

      // 3. foreshadow payoff 必须先 setup
      if (c.type === 'foreshadow' && (c.action === 'payoff' || c.action === 'reinforce')) {
        if (!snap.foreshadows[c.id]) {
          issues.push(makeIssue('consistency', 'critical',
            `CHANGES.foreshadow`,
            `伏笔 #${c.id} 从未埋设，不能 ${c.action === 'payoff' ? '回收' : '强化'}`));
        }
      }

      // 4. evidence 回查：evidence 字段必须能在正文找到（防 AI 编造 evidence）
      if (c.evidence && c.evidence.length > 10) {
        // 提取 evidence 的关键片段（前 20 字）检查是否在正文
        const snippet = c.evidence.slice(0, 20).trim();
        if (snippet && !prose.includes(snippet)) {
          issues.push(makeIssue('consistency', 'medium',
            `CHANGES.${c.type}.evidence`,
            `evidence 片段 "${snippet}..." 在正文中找不到，可能是编造`,
            { suggestion: '确保 evidence 直接引用正文原文' }));
        }
      }
    }

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
      issues,
      durationMs: Date.now() - start,
      stats: { consistencyIssues: issues.length },
    };
  }
}

// ============================================================
// G4 描写一致性门禁
// ============================================================

export class Gate4Description implements Gate {
  id = 'G4' as const;
  name = '描写一致性';
  requiresLLM = false;

  async run(ctx: GateContext, _config: GateConfig): Promise<GateResult> {
    const start = Date.now();
    const issues: GateIssue[] = [];
    const snap = ctx.snapshot;
    const prose = ctx.prose;

    // 1. 外貌变化必须有 character_appearance CHANGES（防止正文私自改外貌）
    //    遍历角色外貌档案，检查正文是否出现与档案冲突的描写
    for (const [entityId, appearance] of Object.entries(snap.characterAppearances)) {
      const char = snap.characters[entityId];
      if (!char || !appearance.features.length) continue;

      // 简化检测：检查档案里的特征关键词是否被矛盾描写
      // （完整实现需要 NLP，这里用关键词近似）
      for (const feature of appearance.features) {
        const contradictions = detectFeatureContradiction(prose, char.name, feature);
        for (const contra of contradictions) {
          issues.push(makeIssue('description', 'high',
            '正文',
            `${char.name} 的外貌描写与档案冲突：${contra}`,
            { evidence: feature, suggestion: `档案记录：${feature}` }));
        }
      }
    }

    // 2. 地点描写一致性：地点特征冲突
    for (const [locId, feature] of Object.entries(snap.locationFeatures)) {
      const loc = snap.locations[locId];
      if (!loc) continue;
      const contradictions = detectLocationContradiction(prose, loc.name, feature.atmosphere);
      for (const contra of contradictions) {
        issues.push(makeIssue('description', 'medium',
          '正文',
          `${loc.name} 的环境描写与档案冲突：${contra}`));
      }
    }

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
      issues,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================
// G5 蓝图出场门禁
// ============================================================

export class Gate5Blueprint implements Gate {
  id = 'G5' as const;
  name = '蓝图出场';
  requiresLLM = false;

  async run(ctx: GateContext, config: Partial<GateConfig> = {}): Promise<GateResult> {
    const cfg = withDefaults(config);
    const start = Date.now();
    const issues: GateIssue[] = [];
    const prose = ctx.prose;
    const blueprint = ctx.blueprint;

    if (!blueprint) {
      return {
        gateId: this.id, gateName: this.name, passed: true,
        issues, durationMs: Date.now() - start,
        stats: { skipped: true },
      };
    }

    // 1. mustCover：有统一审查结果时用语义履约；否则回退关键词
    if (blueprint.mustCover) {
      const fulfillmentByNode = new Map(
        (ctx.chapterJudgeResult?.fulfillment ?? []).map(item => [item.node, item])
      );
      for (const must of blueprint.mustCover) {
        const lexicalOrKeyword =
          prose.includes(must) || extractKeywords(must).some(k => prose.includes(k));
        if (lexicalOrKeyword) continue;

        const judged = fulfillmentByNode.get(must);
        if (judged) {
          if (!judged.fulfilled) {
            issues.push(makeIssue('blueprint', 'critical',
              '全文',
              `未覆盖必须内容：${must}${judged.reason ? `（${judged.reason}）` : ''}`,
              {
                evidence: judged.evidence[0],
                suggestion: '在正文中显式体现此内容',
              }));
          }
          continue;
        }

        // 无统一审查结果：关键词回退
        const keywords = extractKeywords(must);
        if (keywords.length > 0) {
          issues.push(makeIssue('blueprint', 'critical',
            '全文',
            `未覆盖必须内容：${must}`,
            { suggestion: '在正文中显式体现此内容' }));
        }
      }
    }

    // 2. forbiddenZones：字面命中 + 统一审查语义触发
    if (blueprint.forbiddenZones) {
      const forbiddenByZone = new Map(
        (ctx.chapterJudgeResult?.forbidden ?? []).map(item => [item.zone, item])
      );
      for (const forbidden of blueprint.forbiddenZones) {
        if (prose.includes(forbidden)) {
          issues.push(makeIssue('blueprint', 'critical',
            '全文',
            `包含禁止内容：${forbidden}`,
            { suggestion: '删除或改写此内容', autoFixable: true }));
          continue;
        }
        const judged = forbiddenByZone.get(forbidden);
        if (judged?.violated) {
          issues.push(makeIssue('blueprint', 'critical',
            '全文',
            `包含禁止内容：${forbidden}${judged.reason ? `（${judged.reason}）` : ''}`,
            {
              evidence: judged.evidence[0],
              suggestion: '删除或改写此内容',
            }));
        }
      }
    }

    // 3. requiredCharacters 必须出场
    if (blueprint.requiredCharacters) {
      let missing = 0;
      for (const charName of blueprint.requiredCharacters) {
        if (!prose.includes(charName)) {
          missing++;
          issues.push(makeIssue('blueprint', 'high',
            '全文',
            `大纲要求出场的角色 "${charName}" 未在正文出现`));
        }
      }
      if (missing > cfg.maxMissingBlueprintRoles) {
        // 已逐条 high，这里不重复升级
      }
    }

    // 4. CEN 结束节点校验
    if (blueprint.cen) {
      const lastPart = prose.slice(-500);
      const keywords = extractKeywords(blueprint.cen);
      const hit = keywords.some(k => lastPart.includes(k));
      if (!hit && keywords.length > 0) {
        issues.push(makeIssue('blueprint', 'medium',
          '结尾',
          `未体现结束节点：${blueprint.cen}`));
      }
    }

    // 5. 短章节警告
    const wordCount = countWords(prose);
    if (wordCount < cfg.minChapterWords) {
      issues.push(makeIssue('blueprint', 'low',
        '全文',
        `章节字数偏少（${wordCount} 字 < ${cfg.minChapterWords}）`));
    }

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
      issues,
      durationMs: Date.now() - start,
      stats: { wordCount },
    };
  }
}

// ============================================================
// G6 未知实体门禁
// ============================================================

export class Gate6Entity implements Gate {
  id = 'G6' as const;
  name = '未知实体检测';
  requiresLLM = false;

  async run(ctx: GateContext, config: Partial<GateConfig> = {}): Promise<GateResult> {
    const cfg = withDefaults(config);
    const start = Date.now();
    const issues: GateIssue[] = [];
    const snap = ctx.snapshot;
    const prose = ctx.prose;

    // 1. CHANGES 里引用了未登记实体的总数
    const refs = collectEntityRefs(ctx.changes);
    const unknownRefs = new Set<string>();
    for (const { ref } of refs) {
      const id = ref.id;
      const name = ref.name;
      if (id) {
        const exists = snap.characters[id] || snap.locations[id] || snap.factions[id] || snap.items[id];
        if (!exists) unknownRefs.add(`${name}[${id}]`);
      } else if (name) {
        // 无 ID 的纯名称引用，检查快照里有无此名
        const resolved = resolveByName(snap, name);
        if (!resolved) unknownRefs.add(name);
      }
    }

    if (unknownRefs.size > cfg.maxUnknownEntities) {
      issues.push(makeIssue('entity', 'critical',
        'CHANGES',
        `引入 ${unknownRefs.size} 个未登记实体（阈值 ${cfg.maxUnknownEntities}）：${[...unknownRefs].slice(0, 5).join(', ')}`,
        { suggestion: '减少新实体，或在项目设定里预先登记' }));
    } else if (unknownRefs.size > 0) {
      issues.push(makeIssue('entity', 'low',
        'CHANGES',
        `引入 ${unknownRefs.size} 个新实体：${[...unknownRefs].join(', ')}`));
    }

    // 2. 正文里的"龙套"实体（出现但无 CHANGES 记录的人名）
    //    简化检测：从对话引号前提取说话者
    const speakersInProse = extractSpeakers(prose);
    const extras = speakersInProse.filter(name => {
      // 排除已登记角色
      if (resolveByName(snap, name)) return false;
      // 排除 CHANGES 里提到的（即将登记的）
      const inChanges = refs.some(r => r.ref.name === name);
      return !inChanges;
    });
    const uniqueExtras = [...new Set(extras)];

    if (uniqueExtras.length > cfg.maxUnnamedExtras) {
      issues.push(makeIssue('entity', 'high',
        '正文',
        `出现 ${uniqueExtras.length} 个无 CHANGES 记录的龙套角色（阈值 ${cfg.maxUnnamedExtras}）：${uniqueExtras.slice(0, 5).join(', ')}`,
        { suggestion: '重要角色补 CHANGES，纯龙套减少戏份' }));
    }

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
      issues,
      durationMs: Date.now() - start,
      stats: {
        unknownInChanges: unknownRefs.size,
        extrasInProse: uniqueExtras.length,
      },
    };
  }
}

// ============================================================
// 辅助函数
// ============================================================

function resolveByName(snap: StateSnapshot, name: string): string | null {
  if (!name) return null;
  // 在角色/地点/势力里找名称匹配
  for (const [id, c] of Object.entries(snap.characters)) {
    if (c.name === name) return id;
  }
  for (const [id, l] of Object.entries(snap.locations)) {
    if (l.name === name) return id;
  }
  for (const [id, f] of Object.entries(snap.factions)) {
    if (f.name === name) return id;
  }
  for (const [id, it] of Object.entries(snap.items)) {
    if (it.name === name) return id;
  }
  return null;
}

function looselyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  return false;
}

function fmt(v: unknown): string {
  if (v == null) return '∅';
  return String(v);
}

function locName(snap: StateSnapshot, id: string): string {
  return snap.locations[id]?.name || id;
}

function extractKeywords(text: string): string[] {
  if (!text) return [];
  // 提取 2 字以上的中文词组
  return (text.match(/[\u4e00-\u9fa5]{2,}/g) || []).filter(w => w.length >= 2);
}

/** 检测外貌特征矛盾（简化版：基于颜色/特征词的反义词检测）。 */
function detectFeatureContradiction(prose: string, charName: string, feature: string): string[] {
  const contradictions: string[] = [];
  // 提取特征里的颜色词
  const colorPairs: Record<string, string[]> = {
    '黑': ['白', '金', '红', '银'],
    '白': ['黑', '金', '红'],
    '金': ['黑', '白'],
    '红': ['黑', '白', '蓝'],
    '蓝': ['红', '黑'],
    '绿': ['红'],
  };
  for (const [color, opposites] of Object.entries(colorPairs)) {
    if (feature.includes(color)) {
      // 在角色附近的描写里找反色
      const charContext = extractCharContext(prose, charName, 100);
      for (const opp of opposites) {
        // 检测"X发"、"X瞳"等模式
        const pattern = new RegExp(`${opp}(?:发|瞳|眼|眉)`, 'g');
        if (pattern.test(charContext)) {
          contradictions.push(`档案为"${color}"，正文出现"${opp}"`);
          break;
        }
      }
    }
  }
  return contradictions;
}

function detectLocationContradiction(prose: string, locName: string, atmosphere: string): string[] {
  // 简化：暂不做细粒度检测，留给 G7
  return [];
}

/** 提取角色名附近的上下文文本。 */
function extractCharContext(prose: string, charName: string, windowSize: number): string {
  const idx = prose.indexOf(charName);
  if (idx === -1) return '';
  const start = Math.max(0, idx - windowSize);
  const end = Math.min(prose.length, idx + windowSize);
  return prose.slice(start, end);
}

/** 从对话引号前提取说话者名称。 */
function extractSpeakers(prose: string): string[] {
  const speakers: string[] = [];
  // 匹配 "XX说"/"XX道"/"XX笑" 等
  const pattern = /([\u4e00-\u9fa5]{2,4})(?:说道?|道|笑道?|喊道?|叫道?|问|答|怒道|冷笑|沉声|低声)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prose)) !== null) {
    speakers.push(match[1]);
  }
  return speakers;
}
