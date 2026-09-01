// storyflow-triage 死而复活扫描回归测试（node --test）
// 覆盖 2026-08-27/28 六轮反噬演化的全部受害/漏报样本，防止守卫互删回退。
// 运行：npm run test:storyflow-triage
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanProseDeadResurrection } from '../storyflow-triage.mjs';

const ch = (n, text) => ({ n, text });

test('漏报形态：处决完成体与主语隔十余字仍登记死亡并报复活', () => {
  // 2026-08-27 首轮《大理寺财务稽查》ch60 受害样本
  const chapters = [
    ch(60, '「按大齐律，着即斩立决！」刀光凌空划过一道刺目的匹练，严世宽等十余名贪官的头颅骨碌碌滚落高台。'),
    ch(61, '沈淮安说：「严世宽一案至此完结。」'),
    ch(82, '严嵩平……不对，严世宽迈步走进大堂，朗声道：「本官有话要说。」'),
  ];
  const res = scanProseDeadResurrection(chapters, ['严世宽', '沈淮安']);
  const death = res.find(r => r.name === '严世宽');
  assert.ok(death, '应登记死亡并检出复活');
  assert.equal(death.state, '死亡');
  assert.equal(death.chapter, 60);
  assert.ok(death.activeChapters.includes(82));
});

test('误报形态：祈使威胁「给我杀了顾青舟」不登记', () => {
  const chapters = [
    ch(1, '「给我杀了顾青舟！」赵老账房狞吼。顾青舟冷汗涔涔。'),
    ch(2, '顾青舟整了整衣冠，朗声道：「升堂。」'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['顾青舟']).length, 0);
});

test('误报形态：战场呐喊「宰了督战队！杀了李泰！」不登记（2026-08-31 反重力 200 章双开 A 书 ch196 实锤）', () => {
  // 倒戈士兵的呐喊 lead 窗口以「杀了」结尾命中 deathRev，被当成既成处决；
  // 实际李泰 ch198 被擒、ch199 判终身圈禁——死亡系台词误报
  const chapters = [
    ch(196, '愤怒的吼声如同山洪暴发，数千名倒戈的前锋营士兵目眦欲裂。「宰了督战队！杀了李泰！」他们疯了一样扑向督战中军！'),
    ch(198, '一身金丝软甲已被扯得残破不堪的二皇子李泰，正被金万两与钱四海合力死死按在冰冷的青石砖上。'),
    ch(199, '景泰帝沉声道：「李泰大逆不道，削去亲王爵位，交宗人府终身圈禁。」'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['李泰']).length, 0);
});

test('误报形态：反派意图叙述「唯有强冲斩杀陆安方有一线生路」不登记（2026-09-01 20 章修复回归 ch17 实锤）', () => {
  // 死士的目的叙述不在引语内、也无私有条件词，lead 以「斩杀」结尾命中 deathRev；
  // 实际陆安 ch17 重伤逃脱，ch18-20 正常出庭
  const chapters = [
    ch(17, '死士首领十分清楚，哨卡一旦合围便再无生机，唯有强冲斩杀陆安方有一线生路。'),
    ch(18, '陆安字字如刀，目光逼视着堂上的严成礼。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['陆安']).length, 0);
});

test('对照：叙述处决「当阵斩杀了李泰」仍正常登记死亡并报复活', () => {
  // 台词守卫只拦引语内的杀式；叙述事实不能被误伤（漏报方向对照）
  const chapters = [
    ch(1, '裴行舟手起刀落，当阵斩杀了李泰。三军肃然。'),
    ch(2, '乱军之中，李泰夺得一匹快马，沉声道：「撤。」'),
  ];
  const res = scanProseDeadResurrection(chapters, ['李泰']);
  assert.equal(res.length, 1);
  assert.equal(res[0].state, '死亡');
  assert.equal(res[0].chapter, 1);
  assert.deepEqual(res[0].activeChapters, [2]);
});

test('误报形态：求刑台词「斩杀顾成舟以谢天下」不登记', () => {
  const chapters = [
    ch(75, '崔道远颤声道：「求陛下明察，即刻废止新法，斩杀顾成舟以谢天下清流！」'),
    ch(76, '顾成舟怀抱尚方天子剑，稳步走下台阶。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['顾成舟']).length, 0);
});

test('误报形态：悬赏句「斩杀裴修远者赏万金」不登记', () => {
  const chapters = [ch(3, '「斩杀裴修远者，赏银万两！」叛军头目嘶吼。')];
  assert.equal(scanProseDeadResurrection(chapters, ['裴修远']).length, 0);
});

test('误报形态：假设盘算句「杀了陆承安不过是交差抵罪」不登记', () => {
  const chapters = [
    ch(2, '久历官场的算计在脑海中飞速转动，如今局势已烂到根子里，杀了陆承安不过是向上头交差抵罪，但三日后淮西彻底淹没，自己照样人头落地。'),
    ch(3, '陆承安在营房中核算账目。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['陆承安']).length, 0);
});

test('误报形态：条件句「今夜若是强行在此处杀了陆云铮」不登记', () => {
  const chapters = [
    ch(4, '的致命绞索。今夜若是强行在此处杀了陆云铮，一旦逼得对方临死前把所有贪墨证据公之于众，这局就满盘皆输。'),
    ch(5, '陆云铮在度支司正堂指挥分工。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['陆云铮']).length, 0);
});

test('误报形态：目的句「杀了周茂就能翻盘」不登记', () => {
  const chapters = [ch(9, '他咬着牙低语：「杀了周茂就能翻盘，你懂吗？」')];
  assert.equal(scanProseDeadResurrection(chapters, ['周茂']).length, 0);
});

test('解除章覆盖：保释/候勘后的活体出场不再计红（严嵩平形态）', () => {
  const chapters = [
    ch(57, '两名金甲侍卫将严嵩平押解进诏狱，满朝哗然。'),
    ch(70, '待罪保释在外的严嵩平倚坐在太师椅上，冷笑着开口说道：「诸位的算盘打错了。」'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['严嵩平']).length, 0);
});

test('下狱后无解除信号、后续仍指挥说话：报复活（崔弘道形态）', () => {
  const chapters = [
    ch(13, '朝野上下都在议论：崔弘道被打入诏狱的消息早已传开。'),
    ch(18, '崔弘道在侍郎府密室内沉声下令：「备轿，去首辅相府。」'),
  ];
  const res = scanProseDeadResurrection(chapters, ['崔弘道']);
  assert.equal(res.length, 1);
  assert.equal(res[0].state, '下狱');
  assert.deepEqual(res[0].activeChapters, [18]);
});

test('白名单过滤：名单外名字的命运句不产生签名', () => {
  const chapters = [ch(1, '小卒甲当场毙命，无人过问。'), ch(2, '小卒甲又出现在街口叫喊。')];
  assert.equal(scanProseDeadResurrection(chapters, ['陆准']).length, 0);
});

test('驾崩/定罪主语式正常登记', () => {
  const chapters = [
    ch(10, '崇仁帝驾崩，丧钟响彻九城。'),
    ch(11, '齐王被满门抄斩，家产籍没。'),
    ch(12, '新君登基，大赦天下。'),
  ];
  const res = scanProseDeadResurrection(chapters, ['崇仁帝', '齐王']);
  assert.equal(res.length, 0, '无后续活体出场时不报');
});
