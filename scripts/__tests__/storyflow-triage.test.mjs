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
  const chapters = [ch(1, '「给我杀了顾青舟！」赵老账房狞吼。顾青舟冷汗涔涔。')];
  assert.equal(scanProseDeadResurrection(chapters, ['顾青舟']).length, 0);
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
