/**
 * @vitest-environment happy-dom
 *
 * 网文排版：轻量规范化（尊重模型分段）
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWebnovelParagraphs,
  analyzeParagraphDensity,
  buildTypesettingIssues,
  buildWritingRulesWithTypesetting,
  repairOrphanClosingQuotes,
  repairUnbalancedQuotes,
  TYPESETTING_HARD_RULES,
  EXTREME_PARAGRAPH_CHARS,
} from '../typesetting';

describe('normalizeWebnovelParagraphs（少动刀）', () => {
  it('不主动拆没有换行的超长单段，保留模型原文结构', () => {
    const dense =
      '他走到窗前看着夜色。心里想着刚才发生的一切。觉得这一切都像是一场梦。但他知道这不是梦。他得面对现实。门外传来脚步声。有人在敲门。';
    const result = normalizeWebnovelParagraphs(dense);
    expect(result.split(/\n\s*\n/).filter(Boolean).length).toBe(1);
    expect(result).toContain('门外传来脚步声');
  });

  it('保留模型已有空行分段', () => {
    const text = '他走到窗前。\n\n窗外很黑。';
    expect(normalizeWebnovelParagraphs(text)).toBe(text);
  });

  it('把模型单换行提升为标准空行，并清理受限标点', () => {
    const text = '他看见四个字——“粮税私记”。\n“下官……下官冤枉。”';
    expect(normalizeWebnovelParagraphs(text)).toBe(
      '他看见四个字：“粮税私记”。\n\n“下官，下官冤枉。”'
    );
  });

  it('不主动合并过碎叙述', () => {
    const sparse = ['天亮了。', '鸟在叫。', '他起床洗了把脸。'].join('\n\n');
    const result = normalizeWebnovelParagraphs(sparse);
    expect(result.split(/\n\s*\n/).filter(Boolean).length).toBe(3);
  });

  it('压缩多余空行', () => {
    const text = '第一段。\n\n\n\n第二段。';
    expect(normalizeWebnovelParagraphs(text)).toBe('第一段。\n\n第二段。');
  });

  it('修补段首误置的收引号', () => {
    const qR = '\u201D';
    const broken = [`公子是想瞒天过海？`, `${qR}此言一出，满堂哗然。`];
    const repaired = repairOrphanClosingQuotes(broken);
    expect(repaired).toEqual([`公子是想瞒天过海？${qR}此言一出，满堂哗然。`]);

    const normalized = normalizeWebnovelParagraphs(broken.join('\n\n'));
    expect(normalized.startsWith(qR)).toBe(false);
    expect(normalized).toContain(`瞒天过海？${qR}`);
  });

  it('场景短拍保持原样', () => {
    const text = ['他回到屋里。', '翌日', '晨光透过窗棂。', '他沉默了。'].join('\n\n');
    expect(normalizeWebnovelParagraphs(text)).toBe(text);
  });

  it('整章 ASCII 直引号归一为中文弯引号（2026-08-26 绝症当虫治第 6 章实测形态）', () => {
    const straight = `"把枪拿开，别挡着我救人。"林舟语气平静。
"快住手！生石灰遇水放热！"老医生尖叫着阻拦。
他说完了，转身就走。`;
    const normalized = normalizeWebnovelParagraphs(straight);
    expect(normalized).toContain('\u201C把枪拿开，别挡着我救人。\u201D');
    expect(normalized).toContain('\u201C快住手！生石灰遇水放热！\u201D');
    // 叙述段不受影响
    expect(normalized).toContain('他说完了，转身就走。');
    // 归一后引号配平,门禁不再失衡
    const openCount = (normalized.match(/\u201C/gu) ?? []).length;
    const closeCount = (normalized.match(/\u201D/gu) ?? []).length;
    expect(openCount).toBe(closeCount);
  });

  it('段内对话丢闭引号时在段末补齐（免整章重写）', () => {
    const qL = '\u201C';
    const qR = '\u201D';
    const unterminated = `${qL}快住手！你这是在用杀树虫的强碱土农药活活烧穿赵总的食道和胃壁！`;
    const normalized = normalizeWebnovelParagraphs(unterminated);
    expect(normalized.endsWith(qR)).toBe(true);
    expect(normalized.startsWith(qL)).toBe(true);

    // 非对话段（不以开引号起头）不补
    const narration = '老医生吓得魂飞魄散，连滚带爬地冲上前想要抢夺药碗。';
    expect(normalizeWebnovelParagraphs(narration)).toBe(narration);
  });

  it('已有弯引号的正文同样转换直引号对话（混排形态，2026-09-10 glm 45 章 868 处实测）', () => {
    const mixed = '\u201C他说什么？\u201D\n他低声问："裴大人怎么说？"随后又补了句 "知道了"。';
    const normalized = normalizeWebnovelParagraphs(mixed);
    // 混排章的直引号对话按位置判定转为中文引号，不再因存在弯引号整章跳过
    expect(normalized).toContain('问：\u201C裴大人怎么说？\u201D');
    expect(normalized).not.toContain('"');
    // 取舍：叙述里的成对直引号（如英文缩写）也会被归一为中文引号——网文语境
    // 下直引号泄漏的 868 处实锤远重于罕见英文缩写被转的观感损失
    const abbr = '英文缩写 "OK" 出现在叙述里。';
    expect(normalizeWebnovelParagraphs(abbr)).toContain('\u201COK\u201D');
  });
});

describe('analyzeParagraphDensity / buildTypesettingIssues', () => {
  it('识别过密段落', () => {
    const wall = '甲'.repeat(EXTREME_PARAGRAPH_CHARS + 20) + '。';
    const stats = analyzeParagraphDensity(wall);
    expect(stats.extremeParagraphCount).toBe(1);
    const issues = buildTypesettingIssues(wall);
    expect(issues.some(i => i.severity === 'high')).toBe(true);
  });

  it('轻量 normalize 不改变段数', () => {
    const dense =
      '他走到窗前看着夜色。心里想着刚才发生的一切。觉得这一切都像是一场梦。但他知道这不是梦。他得面对现实。门外传来脚步声。有人在敲门。';
    const before = analyzeParagraphDensity(dense);
    const after = analyzeParagraphDensity(normalizeWebnovelParagraphs(dense));
    expect(after.paragraphCount).toBe(before.paragraphCount);
  });

  it('paragraphLengthCV：均匀中长段趋近 0，长短交错明显偏大', () => {
    // 14 段每段约 170 字（矩阵实测的 AI 腔形态）
    const uniform = Array.from({ length: 14 }, (_, i) => '字'.repeat(168 + (i % 3))).join('\n\n');
    const uniformStats = analyzeParagraphDensity(normalizeWebnovelParagraphs(uniform));
    expect(uniformStats.paragraphLengthCV).toBeLessThan(0.05);

    // 短拍与长段交错（人类网文节奏）
    const mixed = [
      '“你敢！”周砚猛地起身。',
      '长叙述段。'.repeat(40),
      '他没接话。',
      '长叙述段。'.repeat(45),
      '“按律，这个字不能签。”',
      '长叙述段。'.repeat(38),
      '灯花爆了一声。',
      '长叙述段。'.repeat(42),
      '“那就换个写法。”',
      '长叙述段。'.repeat(40),
      '他搁下笔。',
      '长叙述段。'.repeat(44),
      '“明日再来。”',
      '长叙述段。'.repeat(39),
    ].join('\n\n');
    const mixedStats = analyzeParagraphDensity(normalizeWebnovelParagraphs(mixed));
    expect(mixedStats.paragraphLengthCV).toBeGreaterThan(0.25);
  });

  it('段落均匀化（段数够、平均中长、cv 过低）报 medium 段落节奏信号', () => {
    // 2026-08-18 双 gemini 矩阵实测形态：13-18 段、均值 150-190 字、cv 0.07-0.13
    const uniform = Array.from({ length: 14 }, () => '字'.repeat(170)).join('\n\n');
    const issues = buildTypesettingIssues(uniform);
    expect(
      issues.some(i => i.severity === 'medium' && i.description.includes('段落节奏均匀化'))
    ).toBe(true);
  });

  it('长短交错的正常节奏不报均匀化', () => {
    const mixed = [
      '“你敢！”周砚猛地起身。',
      '长叙述段。'.repeat(40),
      '他没接话。',
      '长叙述段。'.repeat(45),
      '“按律，这个字不能签。”',
      '长叙述段。'.repeat(38),
      '灯花爆了一声。',
      '长叙述段。'.repeat(42),
      '“那就换个写法。”',
      '长叙述段。'.repeat(40),
      '他搁下笔。',
      '长叙述段。'.repeat(44),
      '“明日再来。”',
      '长叙述段。'.repeat(39),
    ].join('\n\n');
    const issues = buildTypesettingIssues(mixed);
    expect(issues.some(i => i.description.includes('段落节奏均匀化'))).toBe(false);
  });

  it('段数不足或平均过短时不报均匀化（碎段问题归既有检测）', () => {
    // 8 段均匀中长段：段数不够，统计无意义
    const few = Array.from({ length: 8 }, () => '字'.repeat(170)).join('\n\n');
    expect(buildTypesettingIssues(few).some(i => i.description.includes('段落节奏均匀化'))).toBe(false);

    // 14 段均匀但平均只有 60 字：碎段问题，不是均匀化节奏问题
    const shortUniform = Array.from({ length: 14 }, () => '字'.repeat(60)).join('\n\n');
    expect(
      buildTypesettingIssues(shortUniform).some(i => i.description.includes('段落节奏均匀化'))
    ).toBe(false);
  });
});

describe('叙述段过重（对话段拉低均值/CV 的盲区，2026-09-27 新维度）', () => {
  it('叙述段全是 200 字墙时，即使长短交错、无超 280 长段、均值不过线，也必须报过重', () => {
    // 2026-09-27 用户实测样章形态：9 段 190～210 字叙述墙与短对话段交错——
    // CV≈0.9（远超 0.25）、无 >280 段、均值 <120（均匀化下限），旧三处门禁全绿，
    // 但移动端读感沉重。叙述段单列后中位 ≈200 必须命中
    const heavy = [
      '“你敢！”周砚猛地起身。',
      '墙'.repeat(200),
      '他没接话。',
      '墙'.repeat(210),
      '“按律，这个字不能签。”',
      '墙'.repeat(190),
      '灯花爆了一声。',
      '墙'.repeat(205),
      '“那就换个写法。”',
      '墙'.repeat(195),
      '他搁下笔。',
      '墙'.repeat(200),
    ].join('\n\n');
    const stats = analyzeParagraphDensity(heavy);
    expect(stats.longParagraphCount).toBe(0); // 旧绝对长度门禁不触发（无 >280 段）
    expect(stats.avgParagraphChars).toBeLessThan(120); // 均匀化门禁下限未达
    expect(stats.narrativeParagraphCount).toBeGreaterThanOrEqual(8);
    const issues = buildTypesettingIssues(heavy);
    expect(issues.some(i => i.severity === 'high')).toBe(false); // 旧 high 门禁全绿
    expect(issues.some(i => i.severity === 'medium' && i.description.includes('叙述段过重'))).toBe(true);
  });

  it('叙述段基准 1～3 句（30～120 字）的健康章不报过重', () => {
    const healthy = [
      '“你敢！”周砚猛地起身。',
      '火盆里的炭噼啪炸了一声，他数到第七声。'.repeat(2),
      '他没接话。',
      '门外脚步声近了，停在门边，又退开半步。'.repeat(2),
      '“按律，这个字不能签。”',
      '灯花爆了一声。',
      '他把笔搁回笔山，墨迹在纸上洇开一小团。'.repeat(2),
      '他把灯芯拨亮了些。',
      '“那就换个写法。”',
      '他搁下笔。',
      '值房的更鼓敲过三巡，夜还长。'.repeat(2),
    ].join('\n\n');
    const stats = analyzeParagraphDensity(healthy);
    expect(stats.narrativeParagraphCount).toBe(8); // 样本足够，靠中位数放行而非段数
    expect(buildTypesettingIssues(healthy).some(i => i.description.includes('叙述段过重'))).toBe(false);
  });

  it('叙述段不足 8 个时统计无意义，不报过重', () => {
    const few = ['墙'.repeat(200), '墙'.repeat(200), '短拍。', '墙'.repeat(190)].join('\n\n');
    expect(buildTypesettingIssues(few).some(i => i.description.includes('叙述段过重'))).toBe(false);
  });

  it('散点墙形态（中位正常但 200+ 墙成片 ≥15%）由墙占比线命中——2026-09-27 用户样章形态', () => {
    // 样章实测：21 个叙述段中位仅 93 字，但 4 段 210～330 字墙占 19%；旧三处门禁
    // （无 >280 段、均值 <120、CV 健康）与中位线全部放行，读者仍会在墙上撞墙。
    // 真实存书 731 章实测墙占比 p90≤0.13，0.15 为分离线
    const short = '他把伞收了抖了抖水，靠着廊柱站定，数檐角的雨。'.repeat(1); // 23 字
    const medium = '他把伞收了抖了抖水，靠着廊柱站定，数檐角的雨滴一声一声落进石阶的凹坑里。'.repeat(1); // 38 字
    const scattered = [
      '“你还在等谁？”',
      medium + short, // 61
      '墙'.repeat(210),
      short + medium, // 61
      medium + medium, // 76
      '墙'.repeat(230),
      short + medium,
      medium + medium,
      medium + short,
      '墙'.repeat(245),
      short + medium,
      medium + medium,
      '墙'.repeat(260),
      short + medium,
      medium + medium,
      medium + short,
      '“不等了。”',
      short + medium,
      medium + medium,
      medium + short,
      '“走吧。”',
      short + medium,
      medium + medium,
    ].join('\n\n');
    const stats = analyzeParagraphDensity(scattered);
    expect(stats.longParagraphCount).toBe(0); // 无 >280 段，旧绝对长度门禁不触发
    expect(stats.narrativeMedianParagraphChars).toBeLessThan(120); // 中位线不触发（2026-09-29 市场收紧 140→120）
    expect(stats.narrativeLongParagraphRatio).toBeGreaterThanOrEqual(0.15); // 墙占比线命中
    const issues = buildTypesettingIssues(scattered);
    expect(issues.some(i => i.severity === 'high')).toBe(false);
    const heavy = issues.find(
      i => i.severity === 'medium' && i.description.includes('叙述段过重')
    );
    expect(heavy).toBeDefined();
    expect(heavy?.description).toContain('中位正常'); // 明示走的是墙占比分支
  });
});

describe('buildTypesettingIssues 生产硬门禁', () => {
  it('有标点的超长墙被 normalize 确定性拆解；无标点墙仍报 high（2026-10-01 拆分器落地）', () => {
    // '长段内容。'×90 = 450 字墙,句末标点充足 → 拆分器按句末切成多段,
    // 门禁不再见到超长段(确定性修复取代报high→烧预算整章重写)
    const wall = '长段内容。'.repeat(90);
    const normalized = normalizeWebnovelParagraphs(wall);
    const stats = analyzeParagraphDensity(normalized);
    expect(stats.extremeParagraphCount).toBe(0);
    expect(stats.paragraphCount).toBeGreaterThan(1);

    // 无句末标点的极端墙(拆分器无从下刀)仍由 HARD_MAX 门禁报 high
    const noPunct = '他'.repeat(EXTREME_PARAGRAPH_CHARS + 50);
    expect(
      buildTypesettingIssues(noPunct).some(issue => issue.severity === 'high')
    ).toBe(true);
  });

  it('中文对话引号失配先被 normalize 确定性补齐，门禁不再报（fix2 ch39 回归）', () => {
    // 段中开引号未闭合曾连续 5 次重写全败于本门禁；repairUnbalancedQuotes 落地后
    // normalize 层直接补齐，失配在源头消失，门禁保持「配对即放行」语义
    const broken = '他没有回答，只把账本合上，低声说：“你到底看见了什么？\n\n风把灯吹灭了。';
    const normalized = normalizeWebnovelParagraphs(broken);
    const issues = buildTypesettingIssues(normalized);
    expect(issues.some(issue => issue.severity === 'high' && issue.description.includes('引号未闭合'))).toBe(false);
    expect((normalized.match(/“/gu) ?? []).length).toBe((normalized.match(/”/gu) ?? []).length);
  });

  it('模板字段指令残句被 normalize 确定性剔除（r14 ch21 终稿实锤）', () => {
    // 2026-09-28 luna 50 章 ch21 末行混入「candidateEvents 只填 id 列表」存活到终稿；
    // 属级特征=段落以 camelCase 标识符/标识符+中文指令词起段，中文正文不会如此起段
    const polluted = [
      '封纸压住文书时，那道陌生朱痕仍从边角露出半寸。',
      'candidateEvents 只填 id 列表',
      'sceneId 必须与 beatId 对应',
      'Output format: array of paragraph strings',
      '他垂下眼，把朱痕的位置记进心里。',
    ].join('\n\n');
    const normalized = normalizeWebnovelParagraphs(polluted);
    expect(normalized).toContain('封纸压住文书');
    expect(normalized).toContain('记进心里');
    expect(normalized).not.toContain('candidateEvents');
    expect(normalized).not.toContain('sceneId');
    expect(normalized).not.toContain('Output format');
  });

  it('正常英文内容不被模板残句消毒误杀（负例）', () => {
    const legit = [
      '“WHO ARE YOU？”他低声念出帽檐下的那行字。',
      '沈砚在账页边缘描下一串编号：XJ-2046。',
      '老吏咳了一声，缓缓开口。',
    ].join('\n\n');
    const normalized = normalizeWebnovelParagraphs(legit);
    expect(normalized).toContain('WHO ARE YOU');
    expect(normalized).toContain('XJ-2046');
    expect(normalized).toContain('缓缓开口');
  });

  it('通篇一句一段刷屏（80%+ 段落不足 20 字且段数够多）报告 high', () => {
    const spam = Array.from({ length: 24 }, () => '他抬头。');
    const issues = buildTypesettingIssues(spam.join('\n\n'));
    expect(issues.some(i => i.severity === 'high' && i.description.includes('通篇碎段'))).toBe(true);
  });

  it('市场形态章（56% 段≤40、连续 6 段≤40、连续 5 段≤20）不误杀——2026-09-29 番茄#1书实测形态', () => {
    // 《苍陆纪元》ch3 实测：241 段、中位 36 字、56% ≤40、最长段 126、连续≤40 游程 6。
    // 连续短段是当前市场常态；旧「连续 5 段<40 字」守卫会误杀爆款形态（reg20 ch3 五连拒成洞）
    const short = n => '他'.repeat(n - 1) + '。';
    const paras = [
      short(8), short(37), short(45), short(60), short(12), short(38), short(110),
      short(22), short(33), short(88), short(41), short(26), short(95), short(36),
      // 连续 6 段 ≤40（含 5 段 ≤20）——市场爆款里真实存在的节奏
      short(8), short(15), short(12), short(18), short(9), short(14),
      short(52), short(78), short(40), short(63), short(31), short(120),
      short(44), short(70), short(39), short(58), short(85), short(48),
      short(100), short(66), short(42), short(90), short(75), short(126),
    ];
    const issues = buildTypesettingIssues(paras.join('\n\n'));
    expect(issues.some(i => i.severity === 'high' && i.description.includes('通篇碎段'))).toBe(false);
    expect(issues.some(i => i.severity === 'high')).toBe(false); // 无任何 high 门禁误报
  });

  it('段数不足 20 时不判通篇碎段（样本无统计意义）', () => {
    const few = Array.from({ length: 10 }, () => '他抬头。').join('\n\n');
    expect(buildTypesettingIssues(few).some(i => i.description.includes('通篇碎段'))).toBe(false);
  });

  it('通篇裸台词（提示语加冒号、全章无引号）报告 high', () => {
    const issues = buildTypesettingIssues(
      [
        '一个压低的嗓音凑到他耳边，带着一股子哄人的意味：陛下，太医说了，这参汤要趁热用。',
        '他忽然笑了一声，声音还带着方才的哑：都慌什么，朕说的是实情。',
        '张嬷嬷端着碗的手一僵，低声道：老奴一个奴婢，怎么敢碰陛下的御药。',
      ].join('\n\n')
    );
    expect(
      issues.some(issue => issue.severity === 'high' && issue.description.includes('对话未使用中文引号'))
    ).toBe(true);
  });

  it('整章用单弯引号写对话时升格为双引号，不再误判为裸台词', () => {
    // smoke:storyflow:real 第 1 章回归：模型整章用 ‘…’ 写对话（成对可读），
    // 旧口径按「全章无引号」阻断并整章重写，白烧一轮真实请求。
    const prose = [
      '狱卒蹲下来，脸凑到栅栏前，咧嘴笑了笑：‘赵书办，醒啦？你按个手印，咱们都省事。’',
      '赵文远没急着答话，先端起碗把那半碗水喝了，才慢慢展开那张纸。',
      '他抬头看向堂上，声音不高不低：‘大人，小人有三处疑问，想请这位老吏答一答。’',
    ].join('\n\n');

    expect(normalizeWebnovelParagraphs(prose)).toContain('“赵书办，醒啦？');
    expect(
      buildTypesettingIssues(prose).some(issue => issue.description.includes('对话未使用中文引号'))
    ).toBe(false);
  });

  it('双引号内嵌套的单引号不被升格', () => {
    const prose = '他压低声音：“顾庸只说了一句‘走’，就再没开口。”';
    expect(normalizeWebnovelParagraphs(prose)).toBe(prose);
  });

  it('正常引号对话与叙述冒号不误报', () => {
    const issues = buildTypesettingIssues(
      [
        '他把三样东西摆在案上：账页的撕口，从外头别过的门闩，还有后颈上那两处伤。',
        '“大人要把这案子按畏罪自尽销掉，得先圆这三件事。”周砚把牛皮纸推过去，语气不高。',
        '司务额上沁出一层细汗，往门口退了半步，扯出个干笑。',
      ].join('\n\n')
    );
    expect(issues.some(issue => issue.description.includes('对话未使用中文引号'))).toBe(false);
  });
});

describe('buildWritingRulesWithTypesetting', () => {
  it('始终包含排版硬约束且声明不自动拆段', () => {
    const rules = buildWritingRulesWithTypesetting(null);
    expect(rules).toContain('手机网文排版');
    expect(rules).toContain('不会替你拆段');
    expect(rules).toContain(TYPESETTING_HARD_RULES.slice(0, 20));
  });

  it('追加任务书段落', () => {
    const rules = buildWritingRulesWithTypesetting('=== 写作任务书 ===\n测试');
    expect(rules).toContain('手机网文排版');
    expect(rules).toContain('写作任务书');
  });
});

describe('buildTypesettingIssues 作为唯一排版门禁（G8 已随 StateDriven 移除）', () => {
  it('正常正文无 high 问题', () => {
    const prose = '他走到窗前。心里很乱。\n\n门外有脚步声。有人敲门。';
    expect(buildTypesettingIssues(prose).some(i => i.severity === 'high')).toBe(false);
  });

  it('超长无标点墙报 high（靠重写反馈，不靠静默拆段）', () => {
    const wall = '他'.repeat(EXTREME_PARAGRAPH_CHARS + 50);
    const issues = buildTypesettingIssues(wall);
    expect(issues.some(i => i.severity === 'high')).toBe(true);
  });
});

// 回归自 fix2-final100 ch39：段中开引号丢闭引号的形态不在窄形态修复器覆盖内，
// 连续 5 次重写全败于 G8 配对门禁、一章卡死全书——通用修复器在句末确定性补齐。
describe('repairUnbalancedQuotes（通用引号失配补齐）', () => {
  it('段中未闭合的 “ 在其后第一个句末标点补 ”', () => {
    const [out] = repairUnbalancedQuotes(['他低声说：“账册在此。随后转身离去。']);
    expect((out.match(/“/gu) ?? []).length).toBe((out.match(/”/gu) ?? []).length);
    expect(out).toContain('账册在此。”');
  });

  it('多处未闭合各自在句末补齐；平衡段不动', () => {
    const [out] = repairUnbalancedQuotes([
      '“第一句。中间“插了一句。收尾句！”后面还有平句。',
    ]);
    expect((out.match(/“/gu) ?? []).length).toBe((out.match(/”/gu) ?? []).length);
  });

  it('已平衡的段原样返回', () => {
    const balanced = '他说：“好的。”她点头。';
    expect(repairUnbalancedQuotes([balanced])).toEqual([balanced]);
  });

  it('无句末标点的未闭合段在段末补', () => {
    const [out] = repairUnbalancedQuotes(['他喊道：“快跑']);
    expect(out.endsWith('快跑”')).toBe(true);
  });
});

describe('智能段落拆分后处理（2026-10-01 用户反馈段落过长根治）', () => {
  it('单段≤280字保持原样', () => {
    const normal = '他走到窗前看着夜色。心里想着刚才发生的一切。觉得这一切都像是一场梦。但他知道这不是梦。';
    const normalized = normalizeWebnovelParagraphs(normal);
    expect(normalized.split(/\n\s*\n/).length).toBe(1);
    expect(normalized).toBe(normal);
  });

  it('叙述墙段(>200字)按视角切换拆分', () => {
    const wall =
      '他站在窗前看着外面的雨。雨下得很大，豆大的雨点砸在玻璃窗上发出噼啪的声响。街上已经没有行人了，只有几辆车偶尔驶过，溅起一片水花。天色越来越暗，乌云压得很低，仿佛随时都会塌下来。远处的山峦隐没在雨雾之中，什么也看不清了。' +
      '她转身走到桌边坐下。桌上放着一盏油灯，灯光摇曳不定。灯光把她的影子投在墙上，影子也跟着摇晃。她拿起桌上的茶杯，茶水已经凉了。她抿了一口，苦涩的味道在口中蔓延开来。' +
      '王五回头看了一眼门口。门外传来脚步声，沉重而缓慢。脚步声越来越近，在走廊里回荡。他的心跳也随之加快，手心开始冒汗。他盯着门把手，不知道门外来的是什么人。';
    const normalized = normalizeWebnovelParagraphs(wall);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    expect(paras.length).toBeGreaterThan(1);
    expect(paras.some(p => p.includes('她转身'))).toBe(true);
    expect(paras.some(p => p.includes('王五回头'))).toBe(true);
  });

  it('对话墙段(>240字)只在话轮边界(句号+闭引号)拆分', () => {
    const qL = '\u201C';
    const qR = '\u201D';
    const dialogueWall =
      `${qL}你听我说完。${qR}他深吸一口气，努力让自己的声音听起来平静一些。${qL}这件事情不是你想的那样。当时的情况很复杂，有很多你不知道的内幕，你只看到了表面的东西。` +
      `我也是被逼无奈，实在没有别的办法了。你要相信我，我做的一切都是为了我们的将来。我从来没有想过要伤害你，你要相信我。真的，我说的都是真话，一个字都没有掺假。${qR}` +
      `她冷笑一声，眼神中满是失望和愤怒。${qL}你以为我还会相信你吗？你已经骗了我太多次了，每次都说是为了我好，结果呢？到头来受伤的还是我自己。` +
      `这次我不会再上当了，我已经看清你的真面目了。你走吧，我不想再看到你，也不想再听你说任何话了，就当我们从来没有认识过。${qR}`;
    const normalized = normalizeWebnovelParagraphs(dialogueWall);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    expect(paras.length).toBeGreaterThan(1);
    // 拆分不破坏引号配对:每段开闭引号数量平衡
    paras.forEach(p => {
      const openCount = (p.match(/\u201C/gu) ?? []).length;
      const closeCount = (p.match(/\u201D/gu) ?? []).length;
      expect(openCount).toBe(closeCount);
    });
  });

  it('拆分后每段≥20字(避免制造碎段)', () => {
    const wall = '他站在那里。' + '思考着。'.repeat(50) + '终于下定决心。';
    const normalized = normalizeWebnovelParagraphs(wall);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    paras.forEach(p => {
      const len = p.replace(/[^\u4e00-\u9fa5]/gu, '').length;
      expect(len).toBeGreaterThanOrEqual(20);
    });
  });

  it('场景边界段(---/翌日等)不拆分', () => {
    const scene = '---';
    expect(normalizeWebnovelParagraphs(scene)).toBe(scene);
    
    const timeMarker = '翌日';
    expect(normalizeWebnovelParagraphs(timeMarker)).toBe(timeMarker);
  });

  it('按感官通道切换拆分', () => {
    const wall = 
      '他看着远处的山峰。山峰在晨雾中若隐若现，云雾缭绕之间仿佛仙境一般。山顶上的积雪在朝阳的照耀下泛着金色的光芒，美得让人移不开眼睛。他就这样静静地看着，心中涌起一种说不出的感动。这样的景色他已经很久没有见过了，仿佛回到了少年时代。' +
      '忽然听见身后传来声音。声音很轻，像是有人在窃窃私语。他竖起耳朵仔细听，似乎是两个人在低声交谈着什么。声音断断续续的，听不太清楚具体的内容。但从语气中能感觉到，他们似乎在商量着什么重要的事情。' +
      '他感觉到一股寒意从背后袭来。寒意让他浑身一颤，鸡皮疙瘩都起来了。这种感觉很奇怪，明明现在是夏天，太阳也很大，但他就是觉得冷。他下意识地裹紧了衣服，但寒意还是从骨子里往外冒。';
    const normalized = normalizeWebnovelParagraphs(wall);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    expect(paras.length).toBeGreaterThan(1);
  });

  it('按时间推进拆分', () => {
    const wall = 
      '他坐在椅子上等待着。时间一分一秒地过去，墙上的挂钟滴答滴答地响着。他的目光一直盯着门口，生怕错过了什么。手心里全是汗，心跳得很快。他不知道自己在紧张什么，但就是无法平静下来。房间里很安静，安静得只能听见自己的呼吸声。' +
      '片刻后，门外响起了敲门声。敲门声很急促，咚咚咚地响个不停。他的心一下子提到了嗓子眼，站起身来却又不敢走过去开门。敲门声越来越急，越来越响，仿佛要把门砸破一般。他深吸一口气，强迫自己镇定下来。' +
      '随即有人推门进来。来人是他等了很久的那个人，正是他日思夜想的故人。他愣在原地，一时间不知道该说什么好。来人看着他，眼神中满是复杂的情绪。两人就这样对视着，谁也没有先开口说话。';
    const normalized = normalizeWebnovelParagraphs(wall);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    expect(paras.length).toBeGreaterThan(1);
  });

  it('拆分优先级:语义边界点(执行者切换)作为切点,新段以语义词开头', () => {
    const wall =
      '他看着窗外。雨还在下，淅淅沥沥地打在窗户上，玻璃上的水痕一道叠着一道。天色越来越暗了，乌云密布，看起来雨一时半会儿停不了。他叹了口气，心中有些烦躁，说不清是因为天气还是因为别的什么。这样的天气让人提不起精神来，只想躲在被窝里睡觉，什么都不想管。天色又暗了几分，几乎伸手不见五指，屋里的轮廓都模糊了。他起身去开灯，房间里顿时明亮起来，暖黄的灯光驱散了阴霾。' +
      '她转身离开。脚步声渐渐远去，在空旷的走廊里回荡，一声比一声轻。他听着那脚步声，心里涌起一种说不出的失落感，像是被人抽走了什么。他想叫住她，想说点什么，但话到嘴边又咽了回去。最终他只是站在那里，看着她的背影消失在拐角处，连一句再见都没说出口。';
    const normalized = normalizeWebnovelParagraphs(wall);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    expect(paras.length).toBeGreaterThan(1);
    // 语义边界(他起身/她转身)是优质切点,新段应以其开头
    expect(paras.some(p => /^(他起身|她转身)/.test(p))).toBe(true);
  });

  it('普通句末累积≥150字才切(无语义边界时不碎切)', () => {
    // 40句×7字=280字无语义边界的叙述墙,只在句末切,每段~150字 → 2段而非碎段流
    const sentences = Array.from({ length: 40 }, (_, i) =>
      `这是第${i + 1}句话。`
    ).join('');
    const normalized = normalizeWebnovelParagraphs(sentences);
    const paras = normalized.split(/\n\s*\n/).filter(Boolean);
    // 应该拆成2段左右,不是40段
    expect(paras.length).toBeLessThan(5);
    expect(paras.length).toBeGreaterThan(1);
    paras.forEach(p => {
      const len = p.replace(/[^\u4e00-\u9fa5]/gu, '').length;
      expect(len).toBeGreaterThanOrEqual(20);
    });
  });
});
