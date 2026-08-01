/**
 * story-runtime 单元测试用的通用情节夹具。
 * 故意不绑定具体书名/人名，便于跨题材复用同一套合同健康度断言。
 */

export const GENERIC_PLOT = {
  openingBeat: '主角在现场发现关键线索',
  accuseBeat: '当众指认真凶',
  framedBeat: '被反诬入狱',
  nextBeat: '狱中梳理证据漏洞',
  altNextBeat: '狱中复验关键证物',
  richCbn:
    '主角在现场发现关键线索，当众指认真凶后反被诬陷入狱，必须在三天内用铁证翻案自证清白，否则将被处斩',
  midCbn: '当众指认真凶后被反诬入狱，三日后处斩',
  chapterEndStakes: '必须在三天内用铁证翻案自证清白，否则将被处斩',
  chapterGoal: '狱中三日，凭证据细节逼迫公堂公开复验',
  priorEventSummary:
    '主角当众指认真凶，反派反诬主角，命人将其拿下并送入大牢',
  priorEventSummaryJail:
    '主角当众指认真凶，反派反诬，官府下令将主角打入死牢，三日后问斩',
  previousEndingAction: '他潜入证物房，银针刺入封条准备明日指认。',
  proseDebris:
    '下来，密信烧成了灰。你指望外援？他天亮前赶不到。”说罢，他起身，将刀尖伸进炭炉里，烧得滋滋作响。',
  readerMetaGoal:
    '完成开篇设定，建立主角权威，制造生死危机，开启三日倒计时，让读者对主角处境产生强烈代入感；读者期待：建立“爽文”预期',
  forbiddenRevealFull: '不能提前展示全案的全部真相',
  forbiddenOutsideHelp: '不能让主角提前获得外界帮助',
  forbiddenFactionFull: '不能揭示幕后势力网的全貌',
  volumeObjective: '主线限期翻案',
} as const;
