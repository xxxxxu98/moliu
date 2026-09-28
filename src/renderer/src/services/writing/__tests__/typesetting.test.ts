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
    expect(stats.narrativeMedianParagraphChars).toBeLessThan(140); // 中位线不触发
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
  it('单段超过 420 字时直接报告 high', () => {
    const issues = buildTypesettingIssues(`${'长段内容。'.repeat(90)}\n\n正常收束。`);
    expect(issues.some(issue => issue.severity === 'high' && issue.description.includes('段落过密'))).toBe(true);
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

  it('连续五个碎段时报告 high', () => {
    const issues = buildTypesettingIssues(['他抬头。', '门响了。', '风停了。', '灯灭了。', '脚步近了。'].join('\n\n'));
    expect(issues.some(issue => issue.severity === 'high' && issue.description.includes('连续碎段'))).toBe(true);
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
