const VOLUME_SCOPED_OBJECTIVE_RE =
  /(?:打败|击败|扳倒|铲除|消灭|清除).{0,12}(?:党|派|集团|势力|反派|boss)/u;
const VOLUME_SCOPED_REWARD_RE =
  /(?:通过|拿下|取得|获得|完成).{0,8}(?:考绩|考核|验收|述职|复审|评定)/u;
const VOLUME_SCOPED_TRANSFORM_RE =
  /(?:治理成|打造成|建设成|做成|变成).{0,8}(?:模范|示范|标杆|样板|第一)/u;
const VOLUME_SCOPED_PROMOTION_RE =
  /(?:获得|取得|拿到|赢得).{0,8}(?:进京|晋升|封爵|升任|提拔|入阁|入朝)/u;
const VOLUME_SCOPED_BULK_RE =
  /(?:平定|肃清|统一|收复|荡平|剿灭).{0,8}(?:叛乱|边患|匪患|全国|全境|全境)/u;

function isLikelyVolumeScopedObjective(text) {
  const t = (text ?? '').trim();
  if (!t) return false;
  return (
    VOLUME_SCOPED_OBJECTIVE_RE.test(t) ||
    VOLUME_SCOPED_REWARD_RE.test(t) ||
    VOLUME_SCOPED_TRANSFORM_RE.test(t) ||
    VOLUME_SCOPED_PROMOTION_RE.test(t) ||
    VOLUME_SCOPED_BULK_RE.test(t)
  );
}

console.log('--- Should be TRUE (volume-scoped objectives) ---');
// 来自 smoke 实测卷1 objective 的实际写法
const trueCases = [
  '完成临水县从空壳穷县到模范县的逆转，打败钱四海，通过考绩并获得进京机会。',
  '打败钱四海并通过考绩',
  '击败清流党集团',
  '拿下考绩优等',
  '治理成模范县',
  '打造成行业标杆',
  '获得进京机会',
  '取得晋升',
  '平定齐王叛乱',
  '肃清全境匪患',
];
for (const t of trueCases) {
  console.log(`  ${isLikelyVolumeScopedObjective(t) ? 'PASS' : 'FAIL'} | ${t}`);
}

console.log('\n--- Should be FALSE (single-chapter selling points / climax scenes) ---');
const falseCases = [
  // 单章爽点：具体场景动作
  '厉鬼群自动让开一条路',
  '当众拆穿旧党首领的贪污证据',
  '本章破局靠的是数据',
  '当堂翻案',
  '翻身打脸',
  '逆转劣势',
  // 单章冲突推进
  '主角在现场发现关键线索',
  '收集证词，锁定真凶，公堂对峙',
  // payoffForeshadows（伏笔回收，可能是单章场景）
  '羊皮卷预言应验',
  '密室机关启动',
];
for (const t of falseCases) {
  console.log(`  ${!isLikelyVolumeScopedObjective(t) ? 'PASS' : 'FAIL'} | ${t}`);
}
