import type {
  ExtractedFacts,
  FactExtractor,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
  StructuredAI,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';
import { extractedFactsSchema, fateRecheckResultSchema, parseSchema } from './schemas';

export type { FactExtractor } from '@/types/story-runtime';

/**
 * 命运完成体触发词族（仅作「是否值得花一次复检调用」的触发信号，语义判定归
 * 复检 AI——遵守禁止正则塔铁律）。词表直接取自合同契约 7/11/14 已公开族词。
 * 2026-09-23 g38f 500ch 全文书审实证：ch30 events 明写「绞断颈骨悬梁气绝毙命」、
 * ch66 明写「冯保义于诏狱被赐死」，deltas 却为 []——契约 8b 的同响应自检在
 * gemini-3.8-flash-high 上失效，命运账漏登后死人复活全程无人拦截（S1×5 源头）。
 */
const FATE_CUE_RE =
  /伏诛|伏法|处决|枭首|斩首|斩讫|气绝|毙命|身亡|丧命|人头落地|被正法|已处决|驾崩|晏驾|赐死|自尽|灭口|悬梁|缢死|绞断|溺亡|暴毙|下狱|收监|锁拿|收押|押入|打入死牢|打入大牢|革职|罢免|削爵|夺爵|贬为庶民|越狱|获释|出狱|复职|官复原职|平反|昭雪|劫狱|救出|定谳|满门抄斩|洞穿[^。；，]{0,8}喉|割喉|归于死寂|殒命|断了气|咽了气|没了声息|没了气息|再无声息/u;

interface FateCueEntity {
  id: string;
  name: string;
}

/** 找「events 命中命运词族但账面无对应 status/title delta」的疑似漏登事件。
 *  participants 可能是实体 id 或人名，统一经 entityCatalog 归一到 id 后比对。 */
export function detectUnledgeredFateEvents(
  facts: ExtractedFacts,
  entities: Record<string, { id: string; name: string; aliases?: string[] }> = {}
): { suspectEvents: ExtractedFacts['events']; suspectEntityIds: Set<string> } {
  const nameToId = new Map<string, string>();
  for (const entity of Object.values(entities)) {
    nameToId.set(entity.name, entity.id);
    for (const alias of entity.aliases ?? []) {
      if (alias.trim()) nameToId.set(alias, entity.id);
    }
  }
  const resolve = (participant: string): string | null =>
    participant.startsWith('char-') || entities[participant] ? participant : (nameToId.get(participant) ?? null);

  const ledgered = new Set(
    facts.deltas
      .map(delta => {
        const parts = String(delta.path ?? '').split('.');
        return parts[0] === 'characters' ? parts[1] : null;
      })
      .filter((x): x is string => Boolean(x))
  );

  const suspectEvents: ExtractedFacts['events'] = [];
  const suspectEntityIds = new Set<string>();
  for (const event of facts.events) {
    if (!FATE_CUE_RE.test(event.summary ?? '')) continue;
    const participants = (event.participants ?? [])
      .map(resolve)
      .filter((x): x is string => Boolean(x));
    // 命中事件里至少一名可归一参与者不在账上，才视为疑似漏登
    const missing = participants.filter(id => !ledgered.has(id));
    if (missing.length === 0) continue;
    suspectEvents.push(event);
    for (const id of missing) suspectEntityIds.add(id);
  }
  return { suspectEvents, suspectEntityIds };
}

/** 合并复检补登：同实体已有同族 status 账时跳过，避免重复入账 */
function mergeRecheckedDeltas(facts: ExtractedFacts, extra: ExtractedFacts['deltas']): ExtractedFacts {
  if (extra.length === 0) return facts;
  const keyOf = (delta: ExtractedFacts['deltas'][number]) => `${delta.path}|${String(delta.value ?? '')}`;
  const existing = new Set(facts.deltas.map(keyOf));
  const additions = extra.filter(delta => !existing.has(keyOf(delta)));
  if (additions.length === 0) return facts;
  return { ...facts, deltas: [...facts.deltas, ...additions] };
}

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
        + '死亡族（暴毙/伏诛/伏法/处决/枭首/枭首示众/斩首处决/首级悬于X/斩讫/灭口/畏罪自尽/气绝/毙命/身亡/人头落地/被正法/斩讫/已处决→value「死亡」；驾崩/晏驾→「驾崩」。注意：问斩/下旨处斩是判决不是行刑，行刑完成以伏法/斩讫/已处决/斩首处决/首级悬门等完成体为准——2026-09-03 反重力 100 章实证：ch59「严嵩之在京城刚伏法」一句带过未入账，ch99-100 死人复活为首辅无人拦截；2026-09-19 g38f r7 实证：ch189「被斩首处决且首级悬于正阳门阙楼」教科书完成体仍零入账，ch191 死人被劫出无人拦）；'
        + '下狱族（押入/打入/关进天牢/大牢/死牢/诏狱/宗人府/收监/锁拿/收押/扣押看管/关入地窖柴房行辕/抄家下狱→「下狱」。族词表是示例而非白名单：凡正文既成宣告剥夺人身自由的关押，即使用词不在列表（如「锁拿关在行辕地窖」「押往后仓看管」）也必须出账——2026-09-05 g38f 200 章实测：徐文壁 ch78 锁拿入行辕地窖未入账，ch84 即以自由身督烧底账无人拦截）。画押/认供/被擒只是供述不是羁押，但其后「拖入X监/押入死字监/打入大牢」等押解完成句是下狱既成，必须出账——2026-09-15 g38f r4 全文通读实证：崔显 ch60「拖入北镇抚司死字监」、ch121「押在刑部死字监」两次完成体均未入账，ch129 即以自由身现身朝班自辩，禁入/裁剪防线因账面无终态全程空转。'
        + '下狱族完成体门槛（2026-09-12 g38f 200 章实测：严开礼 ch29-162 五次「待罪/软禁值房」被误登「下狱」，与正文自由行走打架成 19 处终稿冲突）：「待罪/待勘/候勘/取保候审/戴罪留任/戴罪立功/闭门思过/听候发落/闭门待罪」是程序中间态，不算下狱既成，禁止出账；下令拿问/奉旨查办/下旨究问是判决宣布不是收监完成，行刑收监完成以「人已在押」既成为准；软禁/圈禁仅当实际被关押于特定处所且失去行动自由（不得外出理事、不得自由出入）才登「下狱」，软禁值房仍照常办公议事的不算；'
        + '去职族（革职/罢免/削爵/夺爵/废黜/贬为庶民/剥去官服/摘去顶戴→「去职」）；'
        + '定罪族（被定罪/被定谳/满门抄斩→「定罪」）。定罪完成体门槛（2026-09-20 r8 ledger-error 实证：ch189「三法司审结，顾宪诚贪墨通敌罪状共计一百零八款」纯转述句被登定罪）：审结/定谳宣告须有可感知的定谳场面（宣判/画押/锁拿入册任一）才登「定罪」；纯旁白转述句「三法司审结X罪状共计N款」只产 event 不登 delta。'
        + '假死族（与死亡严格区分，2026-09-20 g38f r8 实证：ch152 同章实写「咽下毒酒气绝倒地」与「施针放血唤醒、猛咳瘀血」却只登「死亡」——死亡禁令/陈旧度裁剪/判官三道防线随即锁死主角，其后 48 章蓝图活体节点全部过不了审，写手被迫发明衣冠道具，滚纲也按死人写「生前密信」）：正文实写假死装置（蜡衣药丸/龟息/闭气假息/替身/诈死药）或同章/近章实写唤醒复活（施针放血/咳血睁眼/解药救回）的，登 value「假死」而非「死亡」——假死是活着的隐匿状态，不是死亡。判据：正文同时可见「死亡表象」与「存活实写/装置铺垫」二者时必登「假死」。'
        + 'evidence 直接引用该宣告原句（含摘要句），不需要血腥结果词也可出账。',
        '8) 群像命运逐个入账：「顾成化全族伏诛」「齐王一党亦已伏诛」「当堂剥去X一品补服」等集体宣告，角色表名单内每个被波及者各出一条 status delta，禁止只写 event 不写 delta。同章多个角色各有独立的命运宣告句时同样逐一扫描：每个具名角色都要各出一条 delta，禁止只登主犯或合并登账（2026-09-17 g38f r6 实证：ch102 赵宣与孙茂才同章各自画押收监，只登了赵宣，孙茂才 ch111 即自由持刀出场无人拦截；ch80 江万贯「四十斤死囚重枷套死、塞入囚车直奔行辕大牢羁押」完成体在文却整章零 delta，ch88 抄家被重复执行）',
        '8b) 事件-账目一致性自检（2026-09-19 g38f r7 实证：ch189 事件摘要明写「周文彬在西市口被斩首处决且首级悬于正阳门阙楼」却零 delta——死亡账未登，两章后「死士救出周文彬」全程无人拦截，死刑无声回滚）：输出前逐条核对你自己的 events——任何 summary 含死亡族（斩首/处决/枭首/伏诛/毙命/气绝/驾崩等完成体，含物理描写形态「洞穿喉管」「割喉」「归于死寂」「殒命」「断了气/没了声息」）、下狱族（收监/押入/枷锁/囚车等）、去职族（革职/罢免/削爵等）语汇的，必须确认 deltas 中已存在该角色的对应 status delta；事件有而账无是最优先级错误，发现即补 delta。首级悬门/枭首示众/斩首处决都是死亡的教科书完成体，必须登「死亡」（2026-09-27 g38f r12 实证：ch158「洞穿了周德安高高仰起的喉管…彻底归于死寂」漏登死亡，ch172 死人复活活到完本无人拦）。',
        '9) 禁止出账的情形只有三类：假设/盘算/条件（只要/若是/一旦…便会）、威胁/命令/判决宣布（给我杀了他/判斩立决——判决宣布≠行刑完成）、修辞转喻（勘合上的「人头落地」）。此外一律出账；「只是叙述带过」「只是摘要」「拿不准」都不是不出账的理由——拿不准时重读原句判断是否既成，仍拿不准才只产 event。',
        '10) 死者归属以宣告主语为准：「X发现Y已气绝」只登记Y；发现者/转述者/报信人不登记。同句出现的活人不连带登记。',
        '11) 逆转宣告必检必出账（2026-09-03 反重力 100 章实测：主角第9章「打入死牢」正常出账，第13章正文「迈出死牢大门」获释却不入账，状态摘要永远停留「下狱」，ch33/94 连续 fact_conflict 重试耗尽拖死全跑——逆向命运只进不出是台账单向阀）：此前处于死亡以外逆境终态（下狱/去职/定罪）的角色出现【既成逆转】时必须出 status delta 覆盖旧值，一句带过也算：'
        + '获释族（获释/出狱/放出/开释/无罪开释/走出牢门/迈出死牢/解除监禁→value「获释」）；'
        + '越狱族（越狱/逃出大牢/潜逃在外/脱逃/劫狱救出/从押解中走脱→value「越狱」，2026-09-04 r6 ch66 实证：崔明德 ch57 下狱、ch66 藏匿密室密谋潜逃、ch68 再被收押，逃亡环节不入账则状态摘要与正文持续打架）；'
        + '复职族（复职/起复/官复原职/重新起用/再度出仕→value「复职」）；'
        + '平反族（平反/昭雪/洗清冤屈/沉冤得雪→value「平反」）；'
        + '保释族（保释在外/取保候审/候勘/闭门待勘/戴罪出狱听用→value「保释」）：离开牢狱但罪责未了的合法中间态，同样必须出账。'
        + '逆转 delta 只登给逆转句的主语本人：同章他人获释/戴罪/平反不得连带给其他在押者出账；否定、假设、防范语境（「防其劫狱」「若获赦免」）不是既成逆转。'
        + '假死揭晓族（假死揭晓/当众揭穿假死/真相大白其未死/假死者现身→value「揭晓」）：假死角色公开现身、世人知晓其未死时必出「揭晓」delta；「假死」不适用死亡无逆转条款——揭晓不是复活，是身份公开。'
        + '押地变更账（2026-09-16 r5 实证：汪伯庸 ch124 同日上午在「刑部死牢（神京）」、ch125 又在「扬州按察司牢」被提审——在押角色的关押地转移必须出账）：在押角色出现还押/解往/移押/转押至新关押地（含明示提审后关押地变化）时，出 characters.<实体id>.attributes.custody 的 delta（value=新关押地全称），无转移交代不得让角色出现在另一地牢狱。'
        + '死亡无逆转：真复活属剧情缺陷，禁止用 delta 洗白，交由 fate-adjudicate 裁决。「假死」及其「揭晓」不受此条约束——假死本来就活着。evidence 直接引用逆转原句。'
        + '已在账且未变化的终态（如仍在狱中的复述性提及）不必重复出账，只有状态实际改变才出 delta。',
        '12) 追认/回述句不是新宣告（2026-09-06 g38f-200chr2 实证：ch188「太上皇早已驾崩」被当作新宣告二次出账，终态章号被顶到 188，遮蔽了更早死亡与后文提及的复活检测窗口；2026-09-20 r8 ledger-error 实证：ch141「崔显虽已收押」旁白回溯被当新宣告，章号顶歪成 ledger-error）：「早已/当年/此前/临终前/咽气时/大丧期间/虽已/既已」等回溯措辞描述的命运，若角色表或事件目录中该角色已有同族终态，禁止再次出 status delta——回述最多产一条 event 供检索，不得改状态；「虽已X」「既已X」引导的让步从句永远是回溯，不是新宣告。',
        '13) 角色名卫生：participants 与 status delta 指向的角色必须使用角色表（entityCatalog）中的登记名或其别名，逐字一致；禁止把动作/描写片段当人名（「沈怀安快步」「沈怀安反手」不是角色）；登记角色不得产出「首次出场」类条目。',
        '14) 头衔宣告必检必出账（2026-09-15 g38f 200 章全文通读实证：主角官职五重漂移+拜相爽点被 ch200 重复兑现，200 章长程无头衔锚定）：本章出现既成头衔/职务/品级变更时必须出 characters.<实体id>.attributes.title 的 status delta（value=新头衔全称含品级，如「文渊阁大学士·正二品」），一句带过也算：'
        + '任命族（拜/授/升任/擢升/晋/封为/任命为/调任/转任/署理/接任/接掌/出任/补为→新头衔）；'
        + '晋升链（升X品/加衔/进爵/擢X官→新头衔）；'
        + '降黜族（降为/贬为/降X品/改授/削去X衔→新头衔）。'
        + '完成体门槛与命运族一致：圣旨已宣/任命已成/官印已接为准，「拟擢」「议升」「或将拜相」类传闻盘算不出账。回述句（早已官至/当年曾任）不重复出账，遵守契约 12。'
        + '覆盖范围是本章出场的每一个角色，不只主角（2026-09-19 g38f r7 实证：配角温廷翰全书 ≥6 次换职——翰林修撰/通政使/东宫侍读学士/都察院右副都御史往返横跳——零入账，头衔锚全程空转）：凡本章任何角色（含配角）被以与既有头衔不同的官职/职务/品级称呼（对白称呼/自称/旁白头衔均算），即视为头衔变更信号，必须出该角色的 title delta。'
        + 'evidence 直接引用任命原句。此台账供写作侧头衔锚注入——正文头衔必须与最近一次入账头衔一致。',
        '15) 关键数字既成宣告必出 event（2026-09-17 g38f r6 全文通读实证：同一笔盐税五套口径、太仓存粮四万石无解释改写为四十万石、押运车队八十箱变八百辆——长程数字漂移是书审最大 S1 簇，写作侧数字锚需要既成数字源）：本章正文中首次确立或勘误更正的大额数字宣告（银两/粮饷/绢匹/引目/兵额/箱笼车船数等，数额达万级及以上，以及任何首次公布的账目总数、编制数、存粮存银数）必须产出一条 event：type 固定 "numeric-fact"，summary 必须写成「对象＋数值＋单位＋性质」的完整可引用句（如「两淮盐税岁入实征二百二十万两」「太仓存粮仅剩四万石」），evidence 引宣告原句。同一数字的复述性提及不必重复出；勘误更正（清点后与旧数不符）必须再出一条 numeric-fact 并在 summary 注明勘误后新值。',
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
    const facts = ensureTopLevelEvidence(
      sanitizeUnconfirmedDeathDeltas(parseSchema(extractedFactsSchema, raw, '事实提取结果'), state.entities)
    );
    return this.recheckUnledgeredFate(facts, input, state.entities, entityCatalog);
  }

  /**
   * 命运漏登复检闸（2026-09-23 g38f 500ch S1×5 根因修复）：首轮 events 命中
   * 命运完成体而账面缺对应 delta 时，把疑似事件交给 AI 复检回合逐条裁决补登。
   * 复检失败静默降级返回原 facts——防线增强不允许成为新的故障点。
   */
  private async recheckUnledgeredFate(
    facts: ExtractedFacts,
    input: FactExtractionInput,
    entities: Record<string, { id: string; name: string; aliases?: string[] }>,
    entityCatalog: FateCueEntity[]
  ): Promise<ExtractedFacts> {
    const { suspectEvents, suspectEntityIds } = detectUnledgeredFateEvents(facts, entities);
    if (suspectEvents.length === 0) return facts;
    try {
      const rechecked = await this.ai.generate<{ deltas: ExtractedFacts['deltas'] }>({
        purpose: 'fact-extraction-recheck',
        schemaName: 'FateRecheckResult',
        system: [
          '你是命运台账审计员。下列事件摘要命中命运词族，但首轮提取的 deltas 中缺少对应角色的 status 账。逐条重读事件与证据原句，判定哪些确实构成既成命运宣告，补出 status delta。',
          '规则（与提取合同同源）：',
          '1) 死亡族完成体（气绝/毙命/悬梁/枭首/人头落地/伏诛/伏法/已处决/赐死已执行等）→ path "characters.<实体id>.attributes.status"，value「死亡」；判决宣布（判斩立决/问斩）不是行刑，不出账。',
          '2) 下狱族完成体（押入/打入/收监/锁拿入牢且人已在押）→ value「下狱」；待罪/候勘/闭门思过等中间态不出账。',
          '3) 去职族（革职/罢免/削爵既成）→ value「去职」；定罪族（定谳有场面）→ value「定罪」。',
          '4) 逆转族（越狱/获释/出狱/复职/平反既成）→ 对应 value；假设/盘算/威胁句不出账。',
          '5) 回述句（早已/当年/虽已 X）若该角色已有同族终态，不重复出账。',
          '6) 只有确实漏登的才补；全部无漏时返回 {"deltas":[]}。禁止改写既有 deltas，只输出补充项。',
          '输出一个 JSON 对象：{"deltas":[{"operation":"set","path":"characters.<实体id>.attributes.status","value":"死亡","evidence":"宣告原句"}]}',
        ].join('\n'),
        prompt: JSON.stringify({
          chapterNumber: input.chapterNumber,
          suspectEvents: suspectEvents.map(event => ({
            id: event.id,
            summary: event.summary,
            participants: event.participants,
            evidence: event.evidence,
          })),
          suspectEntityIds: [...suspectEntityIds],
          entityCatalog,
          currentDeltas: facts.deltas,
        }),
        parse: value => parseSchema(fateRecheckResultSchema, value, '命运复检结果'),
      });
      const cleaned = sanitizeUnconfirmedDeathDeltas(
        { events: [], deltas: rechecked.deltas ?? [], evidence: [] } as unknown as ExtractedFacts,
        entities
      );
      const merged = mergeRecheckedDeltas(facts, cleaned.deltas);
      if (merged.deltas.length > facts.deltas.length) {
        console.info(
          `[FactExtractor] 命运漏登复检补账 ${merged.deltas.length - facts.deltas.length} 条（ch${input.chapterNumber}，疑似事件 ${suspectEvents.length} 条）`
        );
      }
      return ensureTopLevelEvidence(merged);
    } catch (error) {
      console.warn(
        `[FactExtractor] 命运漏登复检失败（降级返回首轮结果，ch${input.chapterNumber}）：`,
        error instanceof Error ? error.message : error
      );
      return facts;
    }
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
