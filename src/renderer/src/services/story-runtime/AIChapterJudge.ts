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

/**
 * 零宽/控制类不可见字符（ZWSP/ZWNJ/ZWJ/LRM/RLM/word joiner/BOM）。
 * 大纲产出实测在 mustCover 节点末尾混入 U+200B：trim 与 \s 均不匹配它，
 * 判定模型回显的节点文本（不带该字符）永远对不上合同键，
 * 每一章都被误判「模型未返回该节点的履约判定」而触发整章重写。
 */
const INVISIBLE_CHARS_RE = /[\u200b-\u200f\u2060\ufeff]/gu;

function normalizeContractKey(value: string): string {
  return value
    .replace(INVISIBLE_CHARS_RE, '')
    .trim()
    .replace(/[。！？!?；;，,：:\s]+$/gu, '')
    .replace(/\s+/gu, '');
}

/**
 * 顶层对象形状归一化：模型偶发把审查包整个包进数组返回（[{...}]，甚至把对象的
 * 各顶层键拆进数组多个元素）。2026-08-31 反重力 200 章双开冒烟 ch72 实测：
 * 裸数组直达 parseSchema → 「expected object, received array」非瞬态硬拒 →
 * review-unavailable 烧光重试预算，整章 0 字。
 * 三层归一：① 合并数组内含顶层键的对象条目；② 元素全是「裸 issues 项」
 * （severity+location/quote 特征键）的数组包装成 {issues:[...]}（2026-09-10
 * glm ch147 实测形态）；③ 其余识别不出审查包形状的数组维持原样交 schema 报错
 * （如模型误输出段落字符串数组——那是草稿形状，不是审查结论，不能瞎兜）。
 */
function normalizeTopLevelObjectShape(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const TOP_LEVEL_KEYS = new Set([
    'fulfillment',
    'forbidden',
    'issues',
    'resolvedForeshadowIds',
  ]);
  const merged: Record<string, unknown> = {};
  let recognized = false;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
      if (!TOP_LEVEL_KEYS.has(key)) continue;
      recognized = true;
      // 数组值拼接不丢弃（fulfillment/forbidden/issues 全是数组，下游按 node/zone
      // 键归一化天然去重）；标量值首个生效
      if (Array.isArray(val)) {
        const existing = merged[key];
        merged[key] = Array.isArray(existing) ? [...existing, ...val] : val;
      } else if (merged[key] === undefined) {
        merged[key] = val;
      }
    }
  }
  if (recognized) return merged;
  // 2026-09-10 glm-5.3-flash ch147 实测：judge 顶层数组的元素是「裸 issues 项」
  // （对象带 severity/location/quote 等特征键，但不含顶层键），既走不到上面的
  // 合并也过不了 schema 的单元素解包 → review-unavailable 烧光整章预算。
  // 识别出审查 issue 特征形状就包装成 {issues: [...]}——这是审查结论的合法
  // 变体形状；段落字符串数组（草稿形状）仍原样上抛交 schema 报错。
  const looksLikeIssueItem = (item: unknown): boolean => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const keys = Object.keys(item as Record<string, unknown>);
    return (
      (keys.includes('severity') || keys.includes('type')) &&
      keys.some((k) => k === 'location' || k === 'quote' || k === 'issue' || k === 'description')
    );
  };
  if (value.length > 0 && value.every(looksLikeIssueItem)) {
    return { issues: value };
  }
  return value;
}

/**
 * 判官引用证据的确定性核验：容忍空白/换行/全半角引号的轻微漂移。
 * 模型逐字摘录长句时最常见的失配是段间换行与引号宽度（2026-09-05 g38f 200 章实测：
 * ch34/ch131 判官证据实际来自正文却因换行差异 includes 失败 → 整组证据报废翻转成
 * 未履约，与防抄守卫对挤熬死两章）；这里只做格式级归一，不替代语义判定。
 */
function containsVerbatimQuote(text: string, quote: string): boolean {
  if (text.includes(quote)) return true;
  if (!quote.trim()) return false;
  const squash = (s: string): string =>
    s.replace(/\s+/gu, '').replace(/[“”]/gu, '"').replace(/[‘’]/gu, "'");
  return squash(text).includes(squash(quote));
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
    const timePromises = (input.timePromises ?? []).filter(Boolean);

    const payoffCandidates = (input.payoffCandidates ?? []).filter(
      item => item.id.trim() && item.hint.trim(),
    );
    const timePromiseRules =
      timePromises.length > 0
        ? [
            '',
            '## 5) 期限/剧情承诺兑现判定（resolvedTimePromiseTexts）',
            '- timePromises 列出本书已立下且尚未兑现的承诺（期限承诺与剧情预告）',
            '- 判定「已兑现」的标准：正文实写了该承诺的兑现场面（欠款还清/期限事件发生/预告的对手人物事件到场），或显式改期/解除/否定（情报有误/计划取消/当事者变卦）——且能引用正文原句',
            '- 仅口头重申承诺、旁白提及而未发生 → 不算，不要列入',
            '- 宁缺勿滥：拿不准的一律不列（误判兑现会让台账漏掉违约检测）',
            '- resolvedTimePromiseTexts 填能定位到原承诺的关键词句（从 timePromises 行内摘取核心短语即可，系统按文本匹配流转台账）；无兑现时为 []',
          ]
        : [];
    const payoffRules =
      payoffCandidates.length > 0
        ? [
            '',
            '## 4) 伏笔回收判定（resolvedForeshadowIds）',
            '- payoffCandidates 列出本章已到回收时点的伏笔（id + hint）',
            '- 判定某伏笔「已回收」的标准：正文中该伏笔的核心信息已向读者揭晓、兑现或产生实质影响（真相大白/物证现世/承诺兑现），且你能从正文引用支撑证据原句',
            '- 仅被再次提及、只出现载体物品而无信息揭晓 → 不算回收，不要列入',
            '- 宁缺勿滥：拿不准的一律不列（误判已回收会让进度统计漏报未解决伏笔）',
            '- resolvedForeshadowIds 只填 id 字符串数组；无任何回收时为 []',
          ]
        : [];

    // 纪年/数字跨章一致性（写作侧同源锚的判官侧第二道）。eraAnchors 来自纪年台账。
    // 锚外年号=自创年号、
    // 既成数值无勘误剧情改写=数字蒸发，都是 g38f r6 全文通读的最大 S1 簇
    const eraAnchors = (input.eraAnchors ?? []).filter(Boolean);
    const numericFacts = (input.numericFacts ?? []).filter(Boolean);
    const consistencyRules: string[] = [];
    if (eraAnchors.length > 0) {
      consistencyRules.push(
        '- 【纪年一致】输入的 eraAnchors 是本书自始至终唯一一套年号的既成叙述。正文中任何位置（对话/公文/账册/回忆/旁白）出现的年号若与锚中年号名不同（含「X元年」的新组合、把地名府名当年号），必须报 logic_gap 且 severity=critical，description 注明「自创年号：XX」（2026-09-17 g38f r6 实证：全书「天兴」正溯之下后 50 章自创「建元/建昭/宣府元年」平行纪年 9 章）；年数与锚不连续（倒退或跳跃无过渡）报 timeline'
      );
    }
    if (numericFacts.length > 0) {
      consistencyRules.push(
        '- 【数字一致】输入的 numericFacts 是数字台账的正典（对象＝数值单位，同对象以首次确立值为准，未标勘误的后章数值不是正典）。正文引用同一对象的数额/数量与正典不一致，且未写出勘误、清点更正、查实虚报等剧情性修正过程的，必须报 fact_conflict 且 severity=critical，description 注明「数字蒸发/改写：既成X，本章写成Y」（2026-09-17 g38f r6 实证：同一笔盐税五套口径、太仓存粮四万石无解释改四十万石；2026-10-05 都市文实证：债务既成三百万信用点被无勘误写成三十万、战宠既成三十吨前章写两吨；2026-09-30 r16：十二丈溃口填平六丈后无勘误写成十丈并被后章固化）；正文明示了勘误/清点过程的不算'
      );
    }
    consistencyRules.push(
      '- 【数字入账】（2026-10-05 台账反向检查）本章正文首次确立、且对后续剧情有约束力的新数字事实（金额/债务/价格、度量/吨位、数量/编制、期限/天数、比率/赔率——不限题材单位，判据是「后续章节引用它会错」），若既不在 numericFacts 台账中、也不在 extractedFacts 的 numeric-fact 事件里——报 logic_gap 且 severity=medium，description 注明「新数字未入账：对象X＝数值Y」（记账由提取层补齐，此处只提示不要求重写）；纯修辞数字（「一日不见如隔三秋」）与一次性场景描写（「数米深的坑」）不算'
    );
    const timelineMarks = (input.timelineMarks ?? []).filter(Boolean);
    if (timePromises.length > 0) {
      consistencyRules.push(
        '- 【期限一致】输入的 timePromises 是正文已立下且尚未兑现的承诺（期限承诺与剧情预告）。期限承诺：若本章剧情时间已明显到达或越过期限（对照 timelineMarks 与本章正文的天/夜/晨昏标记推断），而正文既未兑现、也未写出显式改期/解除/变故场面——必须报 timeline 且 severity=critical，description 注明「期限承诺违约：X」（2026-10-05 都市文实证：正文三次承诺「三天后十六强开赛」，实际次日凌晨开打零拦截）。剧情预告：若本章已写到某预告的应兑现节点（预告的对手/人物/事件到场时点），正文却与预告矛盾或当其不存在——报 fact_conflict 且 severity=critical，description 注明「剧情预告违约：预告X，正文Y」（同轮实证：第2章预告首轮对手是钛合金巨神象、实际是蛮牛且预告人名全书消失）；正文兑现、显式否定（情报有误/计划取消）或变故交代的不算'
      );
    }
    if (timelineMarks.length > 0) {
      consistencyRules.push(
        '- 【时间轴连续】输入的 timelineMarks 是近章既成时间标记（按章排列）。本章时间流逝与标记序列矛盾——时间回退（上章已次日本章又回到当夜）、跨天零交代、晨昏颠倒且无剧情解释——报 timeline 且 severity=high，description 注明「时间轴断裂：X」（2026-10-05 都市文实证：全书 15 章正文零日期锚，读者无法感知时间流逝）'
      );
    }
    if (input.breathBeatRequired) {
      consistencyRules.push(
        '- 【呼吸拍校验】本章为生理节律呼吸拍章：若全章没有任何生理/生活锚点（进食/饮水/洗漱/睡眠/补眠/疲惫/饥饿/旧伤处理任一），报 ooc 且 severity=low，description 注明「呼吸拍缺生理锚点」（warning 级不阻断，提示补写——2026-10-05 20 章验证 ch17 漏拍无感知的闭环）；已有一处即算达标'
      );
    }
    if ((input.mentionEvidence ?? []).length > 0) {
      consistencyRules.push(
        '- 【提及证据】输入的 mentionEvidence 是相关角色在更早章节的原文片段（逐字摘录）。仲裁跨章 fact_conflict 时以这些原文为准——正文与某角色历史言行/状态矛盾而台账又无账可依时，用原文片段判矛盾（2026-10-05 借鉴 Novelcrafter 提及索引：判官此前只见上章结尾 800 字，跨 5 章矛盾无逐字证据可查）'
      );
    }
    if ((input.authorCanon ?? []).length > 0) {
      consistencyRules.push(
        '- 【作者正典】输入的 authorCanon 是作者锁定的世界观规则，优先级高于一切状态摘要/台账/大纲节点：正文与正典冲突（违反作者设定的规则、改写正典事实），必须报 fact_conflict 且 severity=critical，description 注明「违反作者正典：X」（2026-10-05 人机混写定位：人工设定是最终真相仲裁）'
      );
    }
    const mentionEvidence = (input.mentionEvidence ?? []).filter(Boolean);
    const authorCanon = (input.authorCanon ?? []).filter(Boolean);
    const fakedDeathNames = (input.fakedDeathNames ?? []).filter(Boolean);
    if (fakedDeathNames.length > 0) {
      consistencyRules.push(
        `- 【假死例外】输入的 fakedDeathNames（${fakedDeathNames.join('、')}）处于假死在册状态——假死是活着的隐匿状态，不是死亡：其在本章活体活动、行动、说话一律合法，禁止因「前文已死」报 fact_conflict 或复活类 issue；但其未经揭晓（当众现身/真相大白场面）就以原身份公开现身于公众场合的，报 logic_gap 且 severity=high，description 注明「假死未揭晓公开现身」（2026-09-20 g38f r8 实证：主角假死被当真死，判官连续拦截活体登场，写手被迫写成空袍道具 48 章）`
      );
    }
    const stateCard = (input.stateCard ?? []).map(row => row.trim()).filter(Boolean);
    if (stateCard.length > 0) {
      consistencyRules.push(
        '- 【实体状态卡】输入的 stateCard 与写作侧是同一份账本快照，优先级高于 stateDigest 里被后章记录盖住的单条状态。已死、在押、在逃、保释、去职、现任头衔、公开身份以卡为准：正文让卡上已死者活体出场、在押者无释放或越狱交代就自由行动、去职者行使原职权、称谓与现任头衔不符、公开身份被降格或另造同名姻亲，必须报 fact_conflict 且 severity=critical，description 注明「状态卡冲突：X」。正文写出了释放、越狱、揭晓或任命场面的不算（2026-09-23 r8-S1-05：顾宪诚在押被后章记录洗掉，写手按自由人写，判官当时看不到在押）'
      );
    }
    consistencyRules.push(
      '- 【终态重演】前文（含 prevChapterTail）或本章前文已完整演过的终态仪式/场面（登基/册封/授印/处决/废黜/下狱押解/加封），本章不得再次完整重演同一仪式——后续章只能写该终态的新后果与新进展；若正文把已演过的仪式原样再演一遍（换词不换事），报 logic_gap 且 severity=critical，description 注明「终态重演：X仪式已在前文演过」（2026-09-20 g38f r8 实证：ch190 新帝已登基理政、ch195 正文重演砸镣-更衣-正位大统全套登基典礼；赵恒削籍被演 3 遍）；正文写的是对该终态的后续处置/回响/他人反应的不算'
    );
    consistencyRules.push(
      '- 【押地随行形态】状态摘要里 custody（押地）的值若是随行形态（提调随军/押解随行/戴罪随军/发配军前类描述）而非具体牢狱——该角色处于「合法在押但随队行动」状态：其随军出征、在场行动、受命做事一律合法，禁止按「在押者凭空自由出场」报 fact_conflict（2026-10-08 r19 实证：ch129 正文写明持密旨提调戴罪随军仍被按「天牢在押」三拒成洞）；但其脱离押解/提调管制擅自单独行动且正文无交代的，仍报 fact_conflict'
    );

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
        '- evidence 必须是正文中真实存在的原句：逐字摘录（保留原标点，不改写、不并句拆句、不顺手润色）；引用长句时可截取其中较短、完整、可核对的原句片段。若某节点的证据全部不是正文原句，该节点履约判定会被直接推翻为未履约',
        '- 【可见场面】必须有可感知的对话/动作/取证场面；仅一句带过、回忆里提一句、章末口号式表态 → fulfilled=false',
        '- 仅当完全看不到该情节时也判 fulfilled=false',
        '- 【跨章目标】若节点含限期/倒计时/否则将/「N 天内」等跨章标记（如「必须在三天内翻案，否则将被处斩」），正文做到实质推进（取得关键证据、当众指认、完成阶段对峙）即视为履约，不要求章内完整兑现；不要把「未彻底完结」判为未履约',
        '- 【终态完成体】mustCover 节点（或章题）含下狱/入狱/收监/关押/抄家/革职/罢免/处决/伏法等终态动词时，「认罪/画押/伏地求饶/请旨发落/待勘待勘中」不构成履约——那是供述与哀求，不是终态执行。正文必须写到该终态实际发生的完成动作（收押/上枷/囚车/拖入牢狱/封门贴封条/剥服摘印/行刑完毕）才算 fulfilled=false 的解除；仅停在「全凭陛下发落」即判 fulfilled=false，reason 注明「终态未执行」（2026-09-17 g38f r6 实证：ch44 章题「御旨抄家入狱」，正文只写到两侍郎认罪画押，下狱动作未演，下游两章侍郎自由出场、ch58 才补首次下狱被书审记「重复下狱」断裂）',
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
        '- fact_conflict：与状态摘要/事实冲突。【跨章存在性矛盾必须报此类型且 severity=critical】典型：上章已死/已离开的角色本章复活或活动、上章已销毁/已赠出的物品本章再次出现、上章已揭穿的身份本章当作未知、状态摘要里已下狱/被关押/被软禁的角色本章以自由身出现并行动（除非正文写明了越狱/获释过程）。判定的依据是状态摘要里的实体生死/羁押/位置/持有物，而非本章自述',
        '- logic_gap：自相矛盾或隐含逻辑漏洞；含：无视上章终态重复入狱/重复穿越、章末未落到指定钩子',
        '- ooc：人设明显崩坏',
        '- timeline：时间顺序不合理',
        '- power：战力/能力不合理',
        '- foreshadow：伏笔错乱（提前爆/错收）',
        '- 若 futureReveals 中某事实的 notBeforeChapter 大于当前 chapterNumber，正文却明确点名、确认身份或下结论，必须报 foreshadow 且 severity=critical',
        '- futureReveals 保护的是该事实的核心信息本身，不是它的载体：只要核心信息（关键词句、身份、真相）在正文中对读者揭穿，即使换了承载物、换了持有人、换了出现场合（如约定“死者身上的密信写着 X”，正文改成主角自己包袱里的纸写着 X），同样按提前揭示论处',
        '- 若 allowedCharacterNames 非空，名单外的已登记角色在现场说话、行动或即时反应，必须报 logic_gap 且 severity=critical；仅被回忆或背景提及不算出场',
        '- 【出场豁免】若某角色在 mustCover 节点里被点名要求参与（如节点写「被温伯衡锁走」），则该角色本章允许出场，即使不在 allowedCharacterNames 里也不得报 logic_gap；换成无名身份称呼（如「青袍老者」）同样豁免',
        '- 【重置登场】若 prevChapterTail（上章结尾原文）显示某角色已在本场景登场、行动或与主角共事，本章却将其按初次登场处理（从场外重新通报到场、对已发生案情一无所知、重新自报身份/重新试探主角），必须报 logic_gap 且 severity=critical；正确写法是延续其在场状态与既有认知。此判定以 prevChapterTail 的在场事实为准，状态摘要未登记的在场信息不构成豁免',
        '- 【承接断裂】若 prevChapterTail（上章结尾原文）显示上章末尾已部署或已启动的紧急行动（连夜启程的路线/计策、正在执行的追击/押运/伏击、明确时限的任务、当场宣布的决定），本章正文却将其完全无视——既不兑现也不交代取消/变故/将计就计，直接另起时间线或采取相反行动（2026-09-13 g37f r4 ch70 实证：上章部署"官船为虚、连夜走陆路"，本章却公开长亭送行改乘官船），必须报 logic_gap 且 severity=critical，description 注明「承接断裂：上章部署被无视」；正文写明计划变卦、受阻或有意明修栈道的不算',
        '- 【章界动线】若 prevChapterTail 显示上章末某角色身处甲地或在某队伍/车船途中，本章开头该角色却无任何折返、抵达、中途变故的交代而出现在乙地（人身瞬移）；或上章末在途的押运车队、行军队伍、船队在本章凭空消失/数量级突变且无被劫、散伙、改道的交代——报 logic_gap 且 severity=critical，description 注明「章界动线断裂」（2026-09-17 g38f r6 实证：ch30 末主角随车队押运入峡，ch31 无交代瞬移回京师值房且三十八箱车队蒸发，读者评分 47.4 全书最低）；正文交代了行止（抵达/折返/遇袭失散）的不算',
        '- 【算术自洽】正文中「数量×单位容量」类叙述必须乘积自洽：凡出现「每箱N锭/每车N石/每股N两」与箱数/车数/总数并列的，当场验算乘积与总量声明是否一致（含章名与 mustCover 节点标题里的数字——蓝图标题自带算术错误被正文照抄同样要报）。验算不符报 logic_gap 且 severity=critical，description 必须写出验算过程（如「60锭×50两×50万箱=15亿两，正文称三千万两，差500倍」）（2026-09-19 g38f r7 实证：ch177 一箱六十锭×五十万箱验算 15 亿两 vs 声明三千万两差 500 倍；ch115 五石×400辆=2000石 vs 装走两万石）',
        '- 【推导验算】除乘积外，正文中一切给出完整参数、可当场验算的数字推导链同样必须自洽：收支账（「收入−支出=结余」「各分项相加=总数」）、比率换算（「总落差÷全长=比降」）、时长（「自开始至完毕共X刻/时辰」与场景实际跨度）、单价×数量=总价、余量（「总量−已耗=剩余」）。验算不符报 logic_gap 且 severity=critical，description 必须写出验算过程（如「120000−6048−4100=109852两，正文称结余48000两，差61852两」）。仅当参数与结论都在正文/章名/节点标题中明示时才验算——参数不全的模糊表述不报（2026-09-30 g38f r16 全文通读实证：ch34 三日账宣称结余1280两但三种读法皆不平且爽点恰是「毫厘无差」；ch109 全长580丈落差3.8尺折算比降应≈0.65‰正文写3.2‰差5倍且是当众打脸核心论据；ch114 复式账6万余两无去向却称「平衡如天平」；ch177 同章「一刻钟布设完毕」两段后变「两刻钟」）',
        '- 【时延可行】信息传递与行程耗时必须与本书既定的距离-速度体系自洽：正文已明示两地距离（如「千里之外」）或传递体系（如八百里加急、单程一昼夜以上）时，「发信→对方收到→回令抵达执行地」的全程耗时不允许压缩到物理不可能（2026-09-30 g38f r16 实证：ch127 申时峡口发图、次晨京城拆图、当晨峡口死士行动，千里往返<15小时）；同理「N日后」倒计时与正文已流逝的天数矛盾（七日后大典，五天后却说还有五日）报 timeline 且 severity=critical。仅当距离/时限两侧数字都由正文或纪年/数字锚明示时才报，模糊的「数日后」不报',
        '- 【称谓漂移】同一角色的官职/头衔在本章与 prevChapterTail（或本章前文）中不同（如上章还是翰林修撰、本章成了通政使），而正文没有任何任免场面（圣旨/敕令/尚书当堂宣布/就职交印）——报 logic_gap 且 severity=high，description 注明「称谓漂移：X 由A变B无任免」（2026-09-19 g38f r7 实证：温廷翰同夜由翰林修撰改称通政使，全书 ≥6 职横跳零拦截）；头衔锚（若有）列出的既定头衔与正文称谓冲突同样适用',
        '- 【世系称谓】「先帝/先皇/大行皇帝」只能指已经驾崩的皇帝：若 stateDigest、prevChapterTail 或本章正文显示该皇帝仍在世（仍在颁诏/降旨/视朝/病重但未死），正文却称其先帝/先皇——报 fact_conflict 且 severity=critical（2026-09-19 g38f r7 实证：老皇帝 ch167 尚在位、ch161-175 五处称其先帝/先皇）。驾崩必须有可感知的叙述场面（病榻托孤/遗诏/讣告/丧仪任一），正文从「皇帝在世」直接跳到新帝即位诏而无任何驾崩叙述——报 logic_gap 且 severity=critical，description 注明「驾崩零叙述」（r7 实证：ch194 直接跳即位诏）。年数算术：「自X年起N年」的跨度与当前年份（纪年锚/正文既定年份）矛盾报 timeline（r7 实证：「自嘉定三年起整整七年」而当年仅嘉定四年）',
        '- 【节点抄用】正文与任一 mustCover 节点存在连续 ≥12 字逐字相同（把大纲节点原句直接当正文抄），报 logic_gap 且 severity=high，description 注明「节点原句照抄」；同义改写、拆句、换人称不算',
        '- 只报真实问题，不挑文笔；critical 留给明显硬伤',
        '- 若无问题，issues 为 []',
        ...consistencyRules,
        ...payoffRules,
        ...timePromiseRules,
        '',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        '顶层必须是 { 开头的对象，禁止返回数组（不要把对象包成 [{…}]）；fulfillment/forbidden/issues 的值才是数组。',
        '数组每一项必须包含下列示例的全部字段，一个都不能省略；reason 必填（一句话即可），evidence 无内容时用 []。',
        'JSON 字段必须为：',
        '{"fulfillment":[{"node":"…","fulfilled":true,"evidence":["…"],"reason":"…"}],',
        '"forbidden":[{"zone":"…","violated":false,"evidence":[],"reason":"…"}],',
        '"issues":[{"type":"logic_gap","severity":"high","location":"…","description":"…","evidence":["…"]}]' +
          (payoffCandidates.length > 0 ? ',"resolvedForeshadowIds":["fs-…"]' : '') +
          (timePromises.length > 0 ? ',"resolvedTimePromiseTexts":["承诺关键词句"]' : '') +
          '}',
      ].join('\n'),
      prompt: JSON.stringify({
        mustCover,
        forbiddenZones,
        checkDeepSemantic,
        chapterText: truncateText(input.chapterText, MAX_CHAPTER_CHARS),
        prevChapterTail: input.prevChapterTail
          ? truncateText(input.prevChapterTail, 800)
          : undefined,
        extractedFacts: factDigest,
        stateDigest: input.stateDigest ?? null,
        chapterNumber: input.chapterNumber ?? null,
        allowedCharacterNames: input.allowedCharacterNames ?? [],
        futureReveals: input.futureReveals ?? [],
        payoffCandidates: payoffCandidates.length > 0 ? payoffCandidates : undefined,
        ...(eraAnchors.length > 0 ? { eraAnchors } : {}),
        ...(numericFacts.length > 0 ? { numericFacts } : {}),
        ...(timePromises.length > 0 ? { timePromises } : {}),
        ...(timelineMarks.length > 0 ? { timelineMarks } : {}),
        ...(mentionEvidence.length > 0 ? { mentionEvidence } : {}),
        ...(authorCanon.length > 0 ? { authorCanon } : {}),
        ...(fakedDeathNames.length > 0 ? { fakedDeathNames } : {}),
        ...(stateCard.length > 0 ? { stateCard } : {}),
      }),
      parse: value => parseSchema(chapterJudgeResultSchema, normalizeTopLevelObjectShape(value), '章节语义审查结果'),
    });

    const parsed = parseSchema(chapterJudgeResultSchema, normalizeTopLevelObjectShape(raw), '章节语义审查结果');
    return this.normalize(
      mustCover,
      forbiddenZones,
      checkDeepSemantic,
      parsed,
      input.chapterText,
      [
        ...(input.allowedCharacterNames ?? []),
        // 节点点名角色守卫只认角色实体：stateDigest 里混入的地点/物品实体名一旦
        // 恰好是节点句的动词短语碎片（实测脏地点「登场并提供黑市」⊂ 节点
        // 「苏清婉登场并提供黑市粮价情报」），守卫会要求正文逐字出现它而永远
        // 找不到 → 误判整章未履约（2026-08-31 反重力 200 章双开冒烟 ch8 实锤）。
        ...(input.stateDigest?.entities ?? [])
          .filter(entity => entity.kind === 'character')
          .map(entity => entity.name),
      ],
      payoffCandidates,
    );
  }

  private normalize(
    mustCover: string[],
    forbiddenZones: string[],
    checkDeepSemantic: boolean,
    parsed: ChapterJudgeResult,
    chapterText: string,
    knownCharacterNames: string[],
    payoffCandidates: Array<{ id: string; hint: string }> = [],
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
        const invalidEvidence = hit.evidence.filter(
          evidence => !containsVerbatimQuote(chapterText, evidence),
        );
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
      // 只放行候选集内的 id：模型偶发幻觉出不在 payoffCandidates 里的 id，
      // 或把未到期的伏笔一并列入；按严证据门口径一律丢弃。
      ...(payoffCandidates.length > 0
        ? {
            resolvedForeshadowIds: (parsed.resolvedForeshadowIds ?? []).filter(id =>
              payoffCandidates.some(candidate => candidate.id === id),
            ),
          }
        : {}),
    };
  }
}
