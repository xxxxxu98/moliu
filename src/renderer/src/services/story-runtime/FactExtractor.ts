import type {
  ExtractedFacts,
  FactExtractor,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
  StructuredAI,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';
import { extractedFactsSchema, parseSchema } from './schemas';

export type { FactExtractor } from '@/types/story-runtime';

export interface FactExtractionInput {
  projectId: string;
  chapterNumber: number;
  sceneDrafts: SceneDraft[];
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
}

/** 顶层 evidence 为空时，从 events/deltas 回填，避免结构化证据丢失 */
export function ensureTopLevelEvidence(facts: ExtractedFacts): ExtractedFacts {
  if (facts.evidence.length > 0) return facts;
  const collected = [
    ...facts.events.flatMap(event => event.evidence),
    ...facts.deltas.map(delta => delta.evidence),
  ]
    .map(item => item.trim())
    .filter(Boolean);
  const unique = [...new Set(collected)];
  if (unique.length === 0) return facts;
  return { ...facts, evidence: unique.slice(0, 24) };
}

export class AIFactExtractor implements FactExtractor {
  constructor(private readonly ai: StructuredAI) {}

  async extract(input: FactExtractionInput): Promise<ExtractedFacts> {
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const entityCatalog = Object.values(state.entities).map(entity => ({
      id: entity.id,
      name: entity.name,
      aliases: entity.aliases,
      kind: entity.kind,
    }));
    const eventCatalog = state.events.map(event => ({
      id: event.id,
      summary: event.summary,
    }));

    const raw = await this.ai.generate<ExtractedFacts>({
      purpose: 'fact-extraction',
      schemaName: 'ExtractedFacts',
      system: [
        '仅提取正文中有直接证据的事实、事件和状态变化。不得把推测写成事实，每条变化必须携带证据。',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        '契约约束：',
        '1) participants 必须是字符串数组（实体 id 或人名），禁止写成 {id,name} 对象',
        '2) causes 只能填 eventCatalog / 本章新建事件的 id 字符串，禁止自然语言因果句，禁止对象',
        '3) 找不到合法 cause id 时，causes 填 []，不要编造',
        '4) 顶层 evidence 必须汇总本章关键正文原句，不得为空（可与 events[].evidence 重复）',
        '5) deltas.path 用点分路径写状态变更；inventory 变更必须形如 inventory.<角色实体id>.<物品名>，value 必须是纯数字（数量/件数），禁止写 {unit,note,quantity,描述} 等对象或带单位的字符串',
        '6) 顶层必须输出一个 JSON 对象 {...}，禁止输出裸数组 [...]；events/deltas/evidence 三个字段都要存在',
        '7) 命运宣告必检必出账（2026-09-02 r2 双开 200 章实测：模型在 corePlot 写了「崔炳坤暴毙」却不出账，此后 14 章带死人活动）：本章任何位置——正文、场景摘要、群像收束段——出现命运【既成宣告】时必须同时产出 event 和 status delta，一句带过也算：'
        + '死亡族（暴毙/伏诛/伏法/处决/枭首/灭口/畏罪自尽/气绝/毙命/身亡/人头落地/被正法/斩讫→value「死亡」；驾崩/晏驾→「驾崩」。注意：问斩/下旨处斩是判决不是行刑，行刑完成以伏法/斩讫/已处决等完成体为准——2026-09-03 反重力 100 章实证：ch59「严嵩之在京城刚伏法」一句带过未入账，ch99-100 死人复活为首辅无人拦截）；'
        + '下狱族（押入/打入/关进天牢/大牢/死牢/诏狱/宗人府/收监/锁拿/收押/扣押看管/关入地窖柴房行辕/软禁/圈禁/押上囚车/抄家下狱→「下狱」。族词表是示例而非白名单：凡正文既成宣告剥夺人身自由的关押，即使用词不在列表（如「锁拿关在行辕地窖」「押往后仓看管」）也必须出账——2026-09-05 g38f 200 章实测：徐文壁 ch78 锁拿入行辕地窖未入账，ch84 即以自由身督烧底账无人拦截）；'
        + '去职族（革职/罢免/削爵/夺爵/废黜/贬为庶民/剥去官服/摘去顶戴→「去职」）；'
        + '定罪族（被定罪/被定谳/满门抄斩→「定罪」）。'
        + 'evidence 直接引用该宣告原句（含摘要句），不需要血腥结果词也可出账。',
        '8) 群像命运逐个入账：「顾成化全族伏诛」「齐王一党亦已伏诛」「当堂剥去X一品补服」等集体宣告，角色表名单内每个被波及者各出一条 status delta，禁止只写 event 不写 delta。',
        '9) 禁止出账的情形只有三类：假设/盘算/条件（只要/若是/一旦…便会）、威胁/命令/判决宣布（给我杀了他/判斩立决——判决宣布≠行刑完成）、修辞转喻（勘合上的「人头落地」）。此外一律出账；「只是叙述带过」「只是摘要」「拿不准」都不是不出账的理由——拿不准时重读原句判断是否既成，仍拿不准才只产 event。',
        '10) 死者归属以宣告主语为准：「X发现Y已气绝」只登记Y；发现者/转述者/报信人不登记。同句出现的活人不连带登记。',
        '11) 逆转宣告必检必出账（2026-09-03 反重力 100 章实测：主角第9章「打入死牢」正常出账，第13章正文「迈出死牢大门」获释却不入账，状态摘要永远停留「下狱」，ch33/94 连续 fact_conflict 重试耗尽拖死全跑——逆向命运只进不出是台账单向阀）：此前处于死亡以外逆境终态（下狱/去职/定罪）的角色出现【既成逆转】时必须出 status delta 覆盖旧值，一句带过也算：'
        + '获释族（获释/出狱/放出/开释/无罪开释/走出牢门/迈出死牢/解除监禁→value「获释」）；'
        + '越狱族（越狱/逃出大牢/潜逃在外/脱逃/劫狱救出/从押解中走脱→value「越狱」，2026-09-04 r6 ch66 实证：崔明德 ch57 下狱、ch66 藏匿密室密谋潜逃、ch68 再被收押，逃亡环节不入账则状态摘要与正文持续打架）；'
        + '复职族（复职/起复/官复原职/重新起用/再度出仕→value「复职」）；'
        + '平反族（平反/昭雪/洗清冤屈/沉冤得雪→value「平反」）。'
        + '死亡无逆转：真复活属剧情缺陷，禁止用 delta 洗白，交由 fate-adjudicate 裁决。evidence 直接引用逆转原句。'
        + '已在账且未变化的终态（如仍在狱中的复述性提及）不必重复出账，只有状态实际改变才出 delta。',
        'JSON 字段必须为：',
        '{"events":[{"id":"string","chapter":0,"sceneId":"string","type":"string","summary":"string","participants":["实体id或人名"],"causes":[],"effects":[],"evidence":["正文原句"]}],"deltas":[{"operation":"set|add|remove|increment","path":"characters.<实体id>.attributes.status","value":"死亡|驾崩|下狱|定罪|去职","evidence":"宣告原句"}],"evidence":["正文原句"]' +
          '}',
      ].join('\n'),
      prompt: JSON.stringify({
        projectId: input.projectId,
        chapterNumber: input.chapterNumber,
        sceneDrafts: input.sceneDrafts,
        entityCatalog,
        eventCatalog,
      }),
      parse: value =>
        ensureTopLevelEvidence(
          sanitizeUnconfirmedDeathDeltas(
            parseSchema(extractedFactsSchema, value, '事实提取结果'),
            state.entities
          )
        ),
    });
    return ensureTopLevelEvidence(
      sanitizeUnconfirmedDeathDeltas(parseSchema(extractedFactsSchema, raw, '事实提取结果'), state.entities)
    );
  }
}

/** 死亡结果的不可逆完成体信号。判决词/威胁句均不具备，用于二次拒登 */
const DEATH_RESULT_CUE_RE =
  /人头落地|(?:头颅|首级)[^。"」』]{0,10}(?:滚落|落地)|气绝|毙命|身亡|丧命|殒命|咽气|断气|尸[体首]|收殓|下葬|暴毙|溺亡/;

/** 假设/盘算语气：结果词出现在权衡句里不是事实（与 extract-plot-memory 侧同源）
 *  「杀了陆承安不过是交差抵罪……自己照样人头落地」2026-08-28 第五轮回归实证
 *  「只要统领手腕稍一用力，顾衡的头颅便会当场落地」2026-08-28 百章双开r1 ch13 实证：
 *  只要/便会型条件句漏挡 → 主角被登记死亡 → 下章状态摘要判死，裁判 fact_conflict
 *  连拒 5 次触发 stalled 硬停止，全书中止于 14/100
 *  「一旦断刀被捅到御前，他们背后所有人都要人头落地」2026-08-28 终验 agiffix2 ch45
 *  实证：一旦+都要模态句漏挡，陆衡被锚定登记死亡再卡死 ch45——模态词族一并收口 */
const HYPOTHETICAL_SENTENCE_RE =
  /不过是|无非是|大不了|照样[要会]|便[是要]|便会|就得|要是|若是|如果|倘若|万一|与其|只当|等于|无非|想想|盘算|权衡|只要|一旦|都要|都将|必将|终将|将要|将会|恐怕|难免/u;

/**
 * 死亡 status delta 的确定性防误报闸口（2026-08-27 双轮回归实证）：
 * 「替死鬼被判斩立决」「给我杀了主角」这类判词/威胁会被 flash 模型当事实登记，
 * 主角下一章即被自己的状态摘要判死、评审 fact_conflict 连拒至管线中止。
 * 规则：value 含「死亡」的 attributes.status 变更，其 evidence（或该角色名
 * 邻近 ±30 字的顶层 evidence）必须含完成体结果信号，否则整条丢弃。
 * 下狱/定罪/去职等可逆终态不经此闸：其逆转（获释/复职/平反）由契约 11 的
 * 逆转宣告出账覆盖，死亡保持不可逆（防误报闸 + 真复活走 fate-adjudicate）。
 */
export function sanitizeUnconfirmedDeathDeltas(
  facts: ExtractedFacts,
  entities?: Record<string, { id: string; name: string; aliases?: string[] }>
): ExtractedFacts {
  const idToName = new Map<string, string>();
  const idToAliases = new Map<string, string[]>();
  if (entities) {
    for (const entity of Object.values(entities)) {
      idToName.set(entity.id, entity.name);
      const aliases = (entity.aliases ?? []).filter(a => a.trim());
      if (aliases.length) idToAliases.set(entity.id, aliases);
    }
  }
  const topLevel = facts.evidence ?? [];
  const hasConfirmedResult = (rawEvidence: unknown, entityId: string): boolean => {
    const own = Array.isArray(rawEvidence)
      ? String(rawEvidence.join('\n'))
      : String(rawEvidence ?? '');
    if (HYPOTHETICAL_SENTENCE_RE.test(own)) return false;
    if (DEATH_RESULT_CUE_RE.test(own)) return true;
    // 角色在证据里可能以任一别名出现（证据用「严运使」而登记名是「严世宽」）
    const nameVariants = [
      ...(idToName.get(entityId) ? [idToName.get(entityId)!] : []),
      ...(idToAliases.get(entityId) ?? []),
    ];
    for (const name of nameVariants) {
      for (const line of topLevel) {
        if (HYPOTHETICAL_SENTENCE_RE.test(line)) continue;
        let idx = line.indexOf(name);
        while (idx >= 0) {
          if (
            DEATH_RESULT_CUE_RE.test(line.slice(Math.max(0, idx - 30), idx + name.length + 30))
          ) {
            return true;
          }
          idx = line.indexOf(name, idx + name.length);
        }
      }
    }
    return false;
  };
  const kept = facts.deltas.filter(delta => {
    const isDeathStatus =
      /attributes\.status$/u.test(String(delta.path || '')) &&
      String((delta as unknown as { value?: unknown }).value ?? '').includes('死亡');
    if (!isDeathStatus) return true;
    const entityId = String(delta.path || '').split('.')[1] ?? '';
    return hasConfirmedResult(
      (delta as unknown as { evidence?: string | string[] }).evidence,
      entityId
    );
  });
  if (kept.length === facts.deltas.length) return facts;
  return { ...facts, deltas: kept };
}
