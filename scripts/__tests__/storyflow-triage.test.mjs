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

test('去职/受难入牢 + 朝堂活体出场：B 书反派重置复现（2026-09-01 书审实锤）', () => {
  // B 书 200 章实测：赵元泰 ch157 被削爵枷入天牢，ch181 却「率先跨出队列」
  // 领衔勋贵上朝；旧词表无去职态、进牢形态漏检、ACTIVE_RE 无朝堂动词，
  // 重置矛盾连续 40+ 章零检出
  const chapters = [
    ch(157, '「赵元泰连亲王爵位都被削了，脖子上套着死囚枷进了天牢！」定远侯嘶吼着烧掉暗账。'),
    ch(181, '殿内左侧是以内阁首辅崔景渊为首的重臣，右侧宗人府宗正赵元泰带领的一众皇亲勋贵。肃立在勋贵首位的赵元泰便率先跨出队列，厉声喝斥顾承安谋逆。'),
  ];
  const res = scanProseDeadResurrection(chapters, ['赵元泰', '崔景渊']);
  const zhao = res.find(r => r.name === '赵元泰');
  assert.ok(zhao, '赵元泰应检出下狱/去职后活体出场');
  assert.ok(zhao.state === '下狱' || zhao.state === '去职');
  assert.ok(zhao.activeChapters.includes(181));
});

test('去职直接形态 + 朝堂捧奏折活体：崔景渊形态', () => {
  const chapters = [
    ch(139, '两名校尉上前，崔景渊被当堂停职查办，收缴相印。'),
    ch(181, '金銮殿上，内阁首辅崔景渊双手捧着奏折，伏跪在地。'),
  ];
  const res = scanProseDeadResurrection(chapters, ['崔景渊']);
  const cui = res.find(r => r.name === '崔景渊');
  assert.ok(cui, '停职后上朝应检出');
  assert.equal(cui.state, '去职');
  assert.deepEqual(cui.activeChapters, [181]);
});

test('对照：受难字门控——探监/送物叙述不产生下狱命运', () => {
  const chapters = [
    ch(1, '陆文渊走进大牢探监，给旧友送了些御寒衣物。'),
    ch(2, '陆文渊在公堂朗声陈词。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['陆文渊']).length, 0);
});

test('圣旨跨句处置 + 叙述追认：严嵩林弧线复现（2026-09-01 终验书 ch27/30/34/44 实锤）', () => {
  // 罪状句点名、处置句隔着句号紧随——尾窗通道全漏；该反派其后以工部尚书/
  // 都察院御史/内阁重臣三换身份复位 30+ 章，无任何释放词
  const chapters = [
    ch(27, '“户部郎中严嵩林，侵吞巨额国帑，私刻官印，欺罔君上。着即革去一身官职，剥去顶戴朝服，由刑部差役押入天牢死囚狱，交三法司会同严加看管，择日明正典刑！”'),
    ch(30, '严嵩林虽已被打入天牢，但这户部衙门里盘踞数十年的老吏们并未真正死心。'),
    ch(34, '裴文渊好大的雅兴！严嵩林跨进大堂，嗓音如滚雷般炸响。严嵩林怒目圆睁，指着陆衡厉声呵斥：「区区一个正六品度支主事，也敢擅改大胤祖制成法！」'),
    ch(44, '立在下首的严嵩林虽然已被夺职，此刻仍战战兢兢地低声道：「殿下，两淮盐商总会的阴阳账本，恐怕全要暴露。」'),
    ch(50, '朝堂之上，严嵩林朗声出列，厉声驳斥陆衡的条陈，满殿哗然。'),
  ];
  const res = scanProseDeadResurrection(chapters, ['严嵩林', '陆衡']);
  const yan = res.find(r => r.name === '严嵩林');
  assert.ok(yan, '严嵩林应检出下狱/去职后活体出场');
  assert.ok(yan.state === '下狱' || yan.state === '去职');
  assert.ok(yan.chapter <= 44);
  assert.ok(yan.activeChapters.includes(50));
});

test('圣旨宣告误报守卫：宣读者不背处置（「着即将闹事者锁拿」）', () => {
  const chapters = [
    ch(1, '裴文渊展开告示朗声宣读：着即将闹事者锁拿下狱，严加审讯。'),
    ch(2, '裴文渊在公堂朗声陈词。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['裴文渊']).length, 0);
});

test('圣旨宣告误报守卫：宣读者/执法者不背处置（终验书 ch160/161、B 书 ch196 实锤）', () => {
  const chapters = [
    ch(1, '温见山神色冷峻，声音在大殿内回荡：「大理寺与都察院依律联名签发拘押令！将管库太监及涉案一十八名内监当场革职锁拿，打入大理寺死牢严加看管！」'),
    ch(2, '「传本尚书令！将这欺君罔上的江南粮道转运使当场革去官职，打入刑部死牢严加看管！」裴文渊掷下手签。'),
    ch(3, '「河南道监察御史赵林等三人考核垫底，即刻褫夺官身，革职查办！」顾承安的声音清冷而洪亮。'),
    ch(4, '温见山在公堂朗声陈词。裴文渊拂袖转身。顾承安提笔批示。'),
  ];
  assert.equal(scanProseDeadResurrection(chapters, ['温见山', '裴文渊', '顾承安']).length, 0);
});

test('尾窗直捕：名字紧邻处置动词（「将严嵩林革职拿问」）仍登记去职', () => {
  // 「将+名+革职」名动紧邻是最高置信形态，与已撤销的段落归一通道无关
  const chapters = [
    ch(25, '老皇帝冷哼一声，拂袖下旨：「准奏。着三法司将严嵩林革职拿问，严加审讯。」'),
    ch(30, '朝堂之上，严嵩林朗声出列，厉声驳斥陆衡的条陈。'),
  ];
  const res = scanProseDeadResurrection(chapters, ['严嵩林', '陆衡']);
  const yan = res.find(r => r.name === '严嵩林');
  assert.ok(yan, '紧邻革职应登记去职');
  assert.equal(yan.state, '去职');
  assert.ok(yan.activeChapters.includes(30));
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
