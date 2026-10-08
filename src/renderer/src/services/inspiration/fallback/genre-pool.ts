/**
 * 本地创意引擎题材池（fallback / genre-pool）
 *
 * 与 data/inspirations.ts 的 genreTags（老分类）互补：
 * 这里收录近 3 年有市场辨识度的「脑洞题材」，并为每个题材预置
 * 开局处境 / 核心机制 / 首次兑现素材，供 local-engine 组合生成。
 *
 * 约束：keywords 会被 findBrainGenre 做子串匹配，必须足够专属，
 * 否则普通题材名（如「灵异」「职场」）会误拿到脑洞素材。
 */

import type { TopicAudience } from '@/types/topic-discovery';

export interface BrainGenreEntry {
  id: string;
  name: string;
  /** 主要读者向 */
  audience: TopicAudience;
  /** 对应 GENRE_PROFILES 的 id */
  profileId?: string;
  /** 题材一句话钩子（进 oneLiner） */
  premise: string;
  /** 典型开局处境素材 */
  openings: string[];
  /** 金手指/核心机制素材 */
  mechanisms: string[];
  /** 首次兑现/爽点素材 */
  payoffs: string[];
  /** 题材关键词（防重复判断用） */
  keywords: string[];
}

export const BRAIN_GENRES: BrainGenreEntry[] = [
  {
    id: 'bg-rule-horror',
    name: '规则怪谈',
    audience: 'general',
    profileId: 'rule-horror',
    premise: '诡异规则笼罩的都市，违反规则就消失',
    openings: ['开局就收到写着诡异规则的门卫手册', '开局撞见不符合规则清单的"人"', '开局被困在必须守规则的办公楼'],
    mechanisms: ['靠解读规则卡漏洞反杀', '把规则当攻略逐条利用', '靠记忆规则获得"守规者"身份'],
    payoffs: ['第一次反杀就揭穿规则背后的真相', '用规则反将诡异一军', '守规者身份曝光全场哗然'],
    keywords: ['规则', '怪谈', '诡异'],
  },
  {
    id: 'bg-simulator',
    name: '模拟器',
    audience: 'male',
    profileId: 'system',
    premise: '人生模拟器开局，每次重开都带出隐藏线索',
    openings: ['开局绑定人生模拟器，提示"本次人生时长：3天"', '开局模拟器弹出红色警告：上次重开你死在第7章', '开局发现模拟器里的人生可以带出技能'],
    mechanisms: ['靠无限重开积累情报差', '每次模拟结局都解锁一个隐藏身份', '把模拟器当攻略外挂但每次都有代价'],
    payoffs: ['第N次重开直接掀翻死局', '模拟出的结局与现实对上的瞬间', '隐藏身份在现实揭晓全场震惊'],
    keywords: ['模拟', '重开', '读档'],
  },
  {
    id: 'bg-infinite',
    name: '无限流',
    audience: 'general',
    profileId: 'infinite',
    premise: '被拉入轮回副本，每个世界都是生死考题',
    openings: ['开局被拉进第一个副本：全员只能活一个', '开局副本任务写着"找出你身边的玩家"', '开局就在恐怖副本里被队友卖了'],
    mechanisms: ['靠观察副本规则吃透机制', '把上一个副本的奖励带进下一个', '靠"不按攻略走"走出隐藏线'],
    payoffs: ['副本首通让全体玩家记住这个名字', '隐藏线通关奖励震惊所有人', '反杀卖队友的玩家一战成名'],
    keywords: ['副本', '轮回', '无限'],
  },
  {
    id: 'bg-tamer',
    name: '御兽',
    audience: 'male',
    profileId: 'fantasy',
    premise: '契约灵兽的养成世界，人人以兽为尊',
    openings: ['开局契约到一只被所有人嫌弃的"废物"灵兽', '开局灵兽蛋裂开一只前所未见的品种', '开局御兽学院测试垫底'],
    mechanisms: ['靠喂食冷门食材解锁灵兽隐藏进化', '灵兽越"废"进化越离谱', '靠灵兽的隐藏天赋反向碾压'],
    payoffs: ['第一次进化就刷新学院记录', '隐藏品种曝光全校围观', '废物灵兽进化形态惊呆裁判'],
    keywords: ['灵兽', '御兽', '契约'],
  },
  {
    id: 'bg-cthulhu',
    name: '克苏鲁',
    audience: 'general',
    profileId: 'cthulhu',
    premise: '不可名状的恐惧渗透现实，理智是唯一货币',
    openings: ['开局梦里见到不可名状的存在，醒来多了个标记', '开局入职一家"禁止直视同事"的公司', '开局捡到一本越读越不对劲的日记'],
    mechanisms: ['靠控制理智值卡SAN操作', '用"不能直视"规则反向利用', '靠观测不可名状之物换取力量'],
    payoffs: ['第一次直视真相却没疯，全场惊惧', '标记反转救下全队', '理智归零的瞬间成为新的"存在"'],
    keywords: ['克苏鲁', '理智', '不可名状'],
  },
  {
    id: 'bg-qi-recovery',
    name: '灵气复苏',
    audience: 'male',
    profileId: 'urban-power',
    premise: '灵气回归现代都市，全民觉醒超凡',
    openings: ['开局全城灵气复苏，觉醒名单里没有他', '开局灵气爆发，普通人一夜变强', '开局被认定为"觉醒失败者"'],
    mechanisms: ['靠"觉醒失败"体质免疫灵气副作用', '把现代知识当修行外挂', '靠抢在所有人前面摸清复苏规律'],
    payoffs: ['第一次出手就碾压觉醒榜前十', '"失败者"身份揭晓震惊全城', '灵气规律曝光引发全网热议'],
    keywords: ['灵气', '复苏', '觉醒'],
  },
  {
    id: 'bg-multiverse',
    name: '诸天万界',
    audience: 'male',
    profileId: 'fantasy',
    premise: '万界通道开启，诸天宇宙互相连通',
    openings: ['开局万界通道开启，异界大军兵临城下', '开局被选中为"万界摆渡人"', '开局连通的世界是修仙界'],
    mechanisms: ['靠倒卖诸天特产发家', '把现代知识卖给修仙界', '靠万界信息差抢占先机'],
    payoffs: ['第一次跨世界交易就赚翻', '万界排名榜上突然出现他的名字', '通道秘密曝光引发诸天震动'],
    keywords: ['诸天', '万界', '位面'],
  },
  {
    id: 'bg-stockpile',
    name: '末世囤货',
    audience: 'general',
    profileId: 'apocalypse',
    premise: '末日倒计时，囤货是唯一的生存法则',
    openings: ['开局末世倒计时30天，没人相信他', '开局末日降临，只有他的地下室堆满物资', '开局就面临断水断电断粮'],
    mechanisms: ['靠超前囤货建立安全区', '把超市当自家仓库搬空', '靠物资兑换人脉与忠诚'],
    payoffs: ['第一次交易就换来救命物资', '安全区雏形曝光引来投奔潮', '预言应验那天他成了救世主'],
    keywords: ['末世', '囤货', '末日'],
  },
  {
    id: 'bg-food-business',
    name: '美食经营',
    audience: 'general',
    profileId: 'farming',
    premise: '一家小店养出整个江湖的胃',
    openings: ['开局接手一家濒临倒闭的小吃摊', '开局穿成恶毒女配后开起烧烤摊', '开局用一碗面收服了全城的嘴'],
    mechanisms: ['靠秘方菜品锁死回头客', '把修炼资源做成菜', '靠美食治愈人心换机缘'],
    payoffs: ['第一次营业就排起长队', '神秘食客身份曝光震惊全城', '一碗面换来一位大佬的承诺'],
    keywords: ['美食', '经营', '小吃'],
  },
  {
    id: 'bg-slice-brain',
    name: '脑洞日常',
    audience: 'general',
    profileId: 'urban',
    premise: '平凡日常里藏着离谱设定，越离谱越合理',
    openings: ['开局发现邻居是上古剑仙', '开局发现自己家的猫在统治世界', '开局收到"世界重启"的短信提醒'],
    mechanisms: ['把超凡当日常处变不惊', '用日常逻辑拆解超凡事件', '靠"假装看不见"活到最后'],
    payoffs: ['第一次淡定处理超凡事件惊呆旁观者', '世界真相揭晓的那天他照常上班', '全宇宙最离谱的日常被拍成纪录片'],
    keywords: ['脑洞', '离谱'],
  },
  {
    id: 'bg-space-farming',
    name: '星际种田',
    audience: 'general',
    profileId: 'farming',
    premise: '流落荒星，把废土开垦成星际粮仓',
    openings: ['开局流落荒芜星球，只有一袋种子', '开局接手濒临破产的星际农场', '开局被放逐到"种不出东西"的废星'],
    mechanisms: ['靠现代农学吊打星际农业', '把荒星特产卖向全星系', '靠作物变异培育出逆天品种'],
    payoffs: ['第一次丰收震惊星际农业协会', '废星变粮仓的新闻传遍全星系', '他的农场成为星际必打卡地'],
    keywords: ['星际', '种田', '农场'],
  },
  {
    id: 'bg-supernaturals',
    name: '灵异职场',
    audience: 'general',
    profileId: 'supernatural',
    premise: '加班最狠的公司，员工全是"前辈"',
    openings: ['开局入职一家全员"下班后消失"的公司', '开局工位隔壁坐着上周离职的同事', '开局发现老板不是人'],
    mechanisms: ['靠职场规则反制灵异事件', '把加班文化用在驱鬼上', '靠"摸鱼"躲过诡异事件'],
    payoffs: ['第一次让"前辈"加班到崩溃', '公司真相曝光后他升职加薪', '阴阳两界都怕他的KPI'],
    keywords: ['灵异', '职场', '公司'],
  },
  {
    id: 'bg-job-class',
    name: '全民转职',
    audience: 'male',
    profileId: 'high-martial',
    premise: '十八岁觉醒职业，职业决定一生上限',
    openings: ['开局转职成全服公认的废柴职业', '开局转职仪式上觉醒了从未记载的隐藏职业', '开局觉醒失败，却多出一个只有自己能看见的面板'],
    mechanisms: ['废柴职业叠满被动反而无敌', '隐藏职业每升一级解锁一条禁忌技能', '靠职业搭配的冷门组合越级反杀'],
    payoffs: ['第一次野外刷怪就打破新手纪录', '隐藏职业曝光引来各大公会抢人', '废柴职业在擂台上一招秒杀天才'],
    keywords: ['转职', '职业觉醒'],
  },
  {
    id: 'bg-national-fate',
    name: '国运',
    audience: 'male',
    profileId: 'high-martial',
    premise: '个人输赢直接挂钩国运，全国都在看你',
    openings: ['开局被选为国运之战的代表，全网不看好', '开局国运直播开启，第一个出场的就是他', '开局得知输一场国家就要割让一座城'],
    mechanisms: ['把传统文化化作国运战的底牌', '每赢一场国运提升，自身也随之变强', '靠信息差在规则内为国家抢到最大收益'],
    payoffs: ['第一场国运战逆转，全国弹幕刷屏', '国运加持让全民实力集体上涨', '外国代表看完他的操作当场破防'],
    keywords: ['国运'],
  },
  {
    id: 'bg-lord',
    name: '领主',
    audience: 'male',
    profileId: 'fantasy',
    premise: '全民穿越成领主，一块荒地起家争霸',
    openings: ['开局只分到一块寸草不生的荒地', '开局领地旁边就是高等级怪物巢穴', '开局抽到全服唯一的特殊兵种'],
    mechanisms: ['靠每日情报提前布局领地发展', '把冷门建筑升到顶级解锁奇观', '用现代管理把小领地经营成要塞'],
    payoffs: ['第一次守城战全歼兽潮', '领地等级登顶全服排行榜', '其他领主争相来投奔结盟'],
    keywords: ['领主', '领地'],
  },
  {
    id: 'bg-disaster',
    name: '天灾求生',
    audience: 'general',
    profileId: 'apocalypse',
    premise: '极寒、酷暑、洪水轮番降临，活下去就是赢',
    openings: ['开局得知三天后全球进入极寒', '开局洪水淹城，只有他提前租下了顶楼', '开局重生回天灾前一周，手里只有一万块'],
    mechanisms: ['靠前世记忆精准预判每一轮天灾', '把出租屋改造成堡垒级避难所', '用物资差在灾后重建新秩序'],
    payoffs: ['第一轮天灾全楼只有他家灯火通明', '曾经嘲笑他的邻居跪求一口热饭', '避难所成了全城最安全的地方'],
    keywords: ['天灾', '极寒', '酷暑'],
  },
  {
    id: 'bg-folk-horror',
    name: '民俗怪谈',
    audience: 'general',
    profileId: 'supernatural',
    premise: '中式民俗禁忌全部成真，老规矩就是保命符',
    openings: ['开局回乡奔丧，撞见纸人自己转了头', '开局继承一家扎纸铺，第一单就是阴婚', '开局夜里有人在门外喊他的小名'],
    mechanisms: ['靠爷爷留下的禁忌手册破解邪祟', '用出马、扎纸、守夜等老手艺对付怪异', '把民俗规则反过来设局'],
    payoffs: ['第一次破局救下全村', '老手艺让城里来的大师当场服气', '揭开村子百年禁忌的真相'],
    keywords: ['民俗', '扎纸', '出马'],
  },
  {
    id: 'bg-appraisal',
    name: '鉴宝',
    audience: 'male',
    profileId: 'urban',
    premise: '一双眼看穿真伪，古玩街上捡漏翻身',
    openings: ['开局被古董店老板当众羞辱，眼睛却突然能看穿真伪', '开局在地摊上花五十块买到国宝', '开局受邀鉴定一件价值千万的赝品'],
    mechanisms: ['靠透视真伪的眼力一路捡漏', '把冷门历史知识变成鉴宝底牌', '用捡漏资本撬动更大的古玩圈'],
    payoffs: ['第一次捡漏转手翻百倍', '当众揭穿专家的走眼', '捡到的国宝引来博物馆亲自上门'],
    keywords: ['鉴宝', '捡漏', '古玩'],
  },
  {
    id: 'bg-sea-fishing',
    name: '赶海',
    audience: 'general',
    profileId: 'farming',
    premise: '回到海边渔村，每次赶海都有大货',
    openings: ['开局失业回到海边老家', '开局第一次赶海就挖到一窝顶级海货', '开局继承一艘快要报废的渔船'],
    mechanisms: ['靠海洋感知找到别人找不到的渔获', '把赶海日常拍成爆款视频', '用渔获带动全村致富'],
    payoffs: ['第一次出海就捕到天价大鱼', '赶海视频全网爆火', '曾经看不起他的亲戚上门求合作'],
    keywords: ['赶海', '渔村', '出海'],
  },
  {
    id: 'bg-into-book',
    name: '穿书',
    audience: 'female',
    profileId: 'romance',
    premise: '穿进看过的书里，成了注定惨死的角色',
    openings: ['开局穿成书里的恶毒女配，离领盒饭只剩三章', '开局发现自己是男主的炮灰前妻', '开局穿进书里，剧情线已经崩了'],
    mechanisms: ['靠熟知原著剧情提前规避死亡节点', '抢走女主的机缘改写命运', '和书里的反派联手对抗剧情惯性'],
    payoffs: ['第一个死亡节点被她轻松躲过', '原女主的光环第一次失效', '男主和反派都开始注意到她'],
    keywords: ['穿书', '原著'],
  },
];

/** 按名称/关键词匹配脑洞题材，无匹配返回 null */
export function findBrainGenre(name: string): BrainGenreEntry | null {
  const lower = name.toLowerCase();
  return (
    BRAIN_GENRES.find(g => g.name === name) ??
    BRAIN_GENRES.find(g => g.keywords.some(k => lower.includes(k))) ??
    null
  );
}
