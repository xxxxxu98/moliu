/**
 * 市场趋势分析数据
 * 基于 webnovel-writer-master 的市场扫描指南
 */

/**
 * 题材生命周期状态
 */
export type GenreLifecycle = 'emerging' | 'rising' | 'peak' | 'declining' | 'saturated';

/**
 * 题材趋势信息
 */
export interface GenreTrend {
  id: string;
  name: string;
  icon: string;
  lifecycle: GenreLifecycle;
  description: string;
  hotTags: string[];
  platformBias: string[];
  riskLevel: 'low' | 'medium' | 'high';
  suggestion: string;
}

/**
 * 平台信息
 */
export interface PlatformInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  readerBase: string;
  monetization: string;
  hotGenres: string[];
  characteristics: string;
}

/**
 * 热门标签组合
 */
export interface TagCombo {
  id: string;
  tags: string[];
  name: string;
  description: string;
  example: string;
  potential: 'high' | 'medium' | 'low';
}

/**
 * 读者偏好变化趋势
 */
export interface ReaderTrend {
  trend: string;
  description: string;
  example: string;
  impact: 'positive' | 'negative';
}

/**
 * 平台列表
 */
export const platforms: PlatformInfo[] = [
  {
    id: 'qidian',
    name: '起点中文网',
    icon: '📚',
    description: '国内最大的付费阅读平台',
    readerBase: '付费意愿强，追求高质量内容',
    monetization: '订阅+打赏+月票',
    hotGenres: ['玄幻', '都市', '仙侠', '科幻'],
    characteristics: '适合长篇连载，有完整的等级体系和榜单机制',
  },
  {
    id: '番茄',
    name: '番茄小说',
    icon: '🍅',
    description: '免费阅读+广告分成模式',
    readerBase: '追求爽感，阅读节奏快',
    monetization: '广告分成+听读',
    hotGenres: ['都市', '现言', '玄幻', '脑洞'],
    characteristics: '适合快节奏爽文，前三章决定生死',
  },
  {
    id: '七猫',
    name: '七猫中文网',
    icon: '🐱',
    description: '免费阅读模式',
    readerBase: '下沉市场，中老年读者多',
    monetization: '广告分成',
    hotGenres: ['总裁', '甜宠', '穿越', '军婚'],
    characteristics: '适合强情节、强反转、结局美好',
  },
  {
    id: '晋江',
    name: '晋江文学城',
    icon: '🌸',
    description: '女性向原创文学基地',
    readerBase: '女性读者为主，粘性高',
    monetization: '订阅+打赏',
    hotGenres: ['纯爱', '言情', '衍生', '无CP'],
    characteristics: '适合细腻情感描写，人物塑造要出彩',
  },
  {
    id: '飞卢',
    name: '飞卢小说网',
    icon: '✈️',
    description: '盗版出身，天榜制度',
    readerBase: '追求爽点，日更要求高',
    monetization: 'VIP订阅',
    hotGenres: ['同人', '脑洞', '都市', '洪荒'],
    characteristics: '日更要求高，前几万字决定生死',
  },
];

/**
 * 题材趋势数据
 */
export const genreTrends: GenreTrend[] = [
  {
    id: 'urban-rebirth',
    name: '都市重生/穿越',
    icon: '🔄',
    lifecycle: 'peak',
    description: '经典套路，通过预知未来改变命运',
    hotTags: ['重生', '都市', '逆袭', '首富', '医生'],
    platformBias: ['起点', '番茄', '七猫'],
    riskLevel: 'medium',
    suggestion: '市场饱和，需要创新切入点或独特的金手指设定',
  },
  {
    id: 'system-stream',
    name: '系统流',
    icon: '🎮',
    lifecycle: 'peak',
    description: '游戏化设定，任务驱动成长',
    hotTags: ['系统', '流', '游戏', '任务', '积分'],
    platformBias: ['起点', '番茄', '飞卢'],
    riskLevel: 'medium',
    suggestion: '系统设定要有新意，避免同质化',
  },
  {
    id: 'xianxia',
    name: '修仙/仙侠',
    icon: '⚔️',
    lifecycle: 'declining',
    description: '传统热门，但创新难度大',
    hotTags: ['修仙', '玄幻', '飞升', '宗门', '丹药'],
    platformBias: ['起点', '晋江'],
    riskLevel: 'high',
    suggestion: '创新难度大，建议从世界观或修炼体系创新',
  },
  {
    id: 'urban-sweet',
    name: '都市甜宠',
    icon: '💕',
    lifecycle: 'rising',
    description: '市场稳定，女性向持续热门',
    hotTags: ['甜宠', '总裁', '闪婚', '豪门', '合约'],
    platformBias: ['七猫', '番茄', '晋江'],
    riskLevel: 'low',
    suggestion: '节奏要快，甜要直接，避免过多虐心',
  },
  {
    id: 'brain-hole',
    name: '脑洞/创意',
    icon: '🧠',
    lifecycle: 'rising',
    description: '创意取胜，设定新颖吸引眼球',
    hotTags: ['脑洞', '创意', '反套路', '直播', '玩梗'],
    platformBias: ['番茄', '飞卢'],
    riskLevel: 'medium',
    suggestion: '创意要足够惊艳，简介决定点击率',
  },
  {
    id: 'doomsday',
    name: '末世/废土',
    icon: '☢️',
    lifecycle: 'rising',
    description: '生存危机设定，持续有市场',
    hotTags: ['末世', '废土', '丧尸', '囤货', '变异'],
    platformBias: ['起点', '番茄'],
    riskLevel: 'medium',
    suggestion: '要有独特的世界观设定，避免套路化',
  },
  {
    id: 'fan-fiction',
    name: '同人创作',
    icon: '🎭',
    lifecycle: 'peak',
    description: '借势热门IP，天然有流量',
    hotTags: ['同人', '综漫', '综影视', '原神', '原耽'],
    platformBias: ['晋江', '飞卢'],
    riskLevel: 'medium',
    suggestion: '需注意版权问题，二创有风险也有机遇',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    icon: '🤖',
    lifecycle: 'emerging',
    description: '新兴题材，科技与人文的思考',
    hotTags: ['赛博', '星际', '机甲', 'AI', '虚拟现实'],
    platformBias: ['起点'],
    riskLevel: 'medium',
    suggestion: '适合有一定科幻素养的作者，有门槛也有蓝海',
  },
  {
    id: 'ancient-palace',
    name: '古言宫斗/宅斗',
    icon: '🏯',
    lifecycle: 'peak',
    description: '传统热门，女性向经典',
    hotTags: ['宫斗', '宅斗', '穿越', '重生', '权谋'],
    platformBias: ['晋江', '七猫', '番茄'],
    riskLevel: 'low',
    suggestion: '宫斗要有精彩的反派和升级打怪感，宅斗要家长里短有烟火气',
  },
  {
    id: 'farming',
    name: '种田/经营',
    icon: '🌾',
    lifecycle: 'rising',
    description: '慢节奏，享受养成乐趣',
    hotTags: ['种田', '经营', '系统', '空间', '美食'],
    platformBias: ['晋江', '起点'],
    riskLevel: 'low',
    suggestion: '适合有耐心、注重细节描写的作者',
  },
];

/**
 * 热门标签组合
 */
export const tagCombos: TagCombo[] = [
  {
    id: 'urban-rebirth-rich',
    tags: ['都市', '重生', '首富'],
    name: '都市重生首富流',
    description: '重生回过去，凭借先知优势成为首富',
    example: '《重生之金融首富》《重回1988当首富》',
    potential: 'high',
  },
  {
    id: 'urban-rebirth-doctor',
    tags: ['都市', '重生', '医生'],
    name: '都市重生神医流',
    description: '重生后成为神医，治病救人又扮猪吃虎',
    example: '《都市最强神医》《重生之妙手回春》',
    potential: 'high',
  },
  {
    id: 'system-game',
    tags: ['都市', '系统', '游戏'],
    name: '都市系统游戏流',
    description: '获得游戏系统，现实与游戏结合',
    example: '《我有一个游戏世界》《我有 HyperOS 游戏系统》',
    potential: 'high',
  },
  {
    id: 'sweet-ceo',
    tags: ['甜宠', '总裁', '闪婚'],
    name: '总裁闪婚甜宠',
    description: '霸道总裁与独立女性，先婚后爱',
    example: '《闪婚老公太霸道》《契约甜妻》',
    potential: 'high',
  },
  {
    id: 'ancient-rebirth',
    tags: ['古言', '重生', '复仇'],
    name: '古言重生复仇',
    description: '重生后手撕白莲花，报复渣男',
    example: '《重生之嫡女复仇》《重生后我嫁给了渣男的死对头》',
    potential: 'medium',
  },
  {
    id: 'xianxia-cultivation',
    tags: ['仙侠', '穿越', '废物流'],
    name: '仙侠废物流',
    description: '穿越修仙世界，从废柴逆袭成大佬',
    example: '《穿越修仙之废物流》《我欲成仙》',
    potential: 'medium',
  },
  {
    id: 'farming-space',
    tags: ['种田', '空间', '美食'],
    name: '种田空间美食',
    description: '获得随身空间，靠美食发家致富',
    example: '《携带空间去逃荒》《空间灵泉好种田》',
    potential: 'medium',
  },
  {
    id: 'doomsday-subscribe',
    tags: ['末世', '囤货', '空间'],
    name: '末世囤货空间',
    description: '末日降临，提前囤货空间异能',
    example: '《末世囤货求生》《我在末世有空间》',
    potential: 'medium',
  },
];

/**
 * 读者偏好变化趋势
 */
export const readerTrends: ReaderTrend[] = [
  {
    trend: '快节奏',
    description: '读者耐心下降，前三章决定去留',
    example: '开篇即冲突，不要大段背景介绍',
    impact: 'positive',
  },
  {
    trend: '反套路',
    description: '对老套路审美疲劳，喜欢新鲜感',
    example: '《赘婿》反套路出圈，《庆余年》智斗吸引人',
    impact: 'positive',
  },
  {
    trend: '女性意识',
    description: '女性读者更看重女主独立自主',
    example: '女主不再等待救赎，主动掌握命运',
    impact: 'positive',
  },
  {
    trend: 'BE接受度',
    description: '悲剧结局接受度提高，虐文也有市场',
    example: '《东宫》《琉璃》悲剧结局引发热议',
    impact: 'positive',
  },
  {
    trend: '短平快',
    description: '追求即时满足，不喜欢拖沓',
    example: '信息密度要高，每章要有钩子',
    impact: 'negative',
  },
  {
    trend: '同质化',
    description: '跟风作品泛滥，读者识别度高',
    example: '系统流泛滥后，读者对无脑系统文无感',
    impact: 'negative',
  },
];

/**
 * 获取题材生命周期的中文名称
 */
export function getLifecycleName(lifecycle: GenreLifecycle): string {
  const names = {
    emerging: '新兴',
    rising: '上升',
    peak: '巅峰',
    declining: '下滑',
    saturated: '饱和',
  };
  return names[lifecycle];
}

/**
 * 获取题材生命周期的颜色
 */
export function getLifecycleColor(lifecycle: GenreLifecycle): string {
  const colors = {
    emerging: 'bg-teal-100 text-teal-700',
    rising: 'bg-emerald-100 text-emerald-700',
    peak: 'bg-amber-100 text-amber-700',
    declining: 'bg-orange-100 text-orange-700',
    saturated: 'bg-red-100 text-red-700',
  };
  return colors[lifecycle];
}

/**
 * 获取风险等级的颜色
 */
export function getRiskColor(risk: 'low' | 'medium' | 'high'): string {
  const colors = {
    low: 'text-emerald-600 bg-emerald-100',
    medium: 'text-amber-600 bg-amber-100',
    high: 'text-red-600 bg-red-100',
  };
  return colors[risk];
}

/**
 * 获取潜力等级的颜色
 */
export function getPotentialColor(potential: 'high' | 'medium' | 'low'): string {
  const colors = {
    high: 'text-emerald-600 bg-emerald-100',
    medium: 'text-amber-600 bg-amber-100',
    low: 'text-gray-600 bg-gray-100',
  };
  return colors[potential];
}
