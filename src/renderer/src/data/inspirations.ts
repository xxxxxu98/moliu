export interface GenreTagConfig {
  id: string;
  name: string;
  color: string;
  icon: string;
  gradient: string;
  description?: string;
}

export interface SettingElementConfig {
  id: string;
  name: string;
  icon: string;
  description?: string;
  category?: 'character' | 'plot' | 'world' | 'conflict';
}

export interface StoryCharacter {
  role: string;
  name: string;
  traits: string[];
}

export interface StoryNucleusConfig {
  id: string;
  title: string;
  premise: string;
  conflict: string;
  characters: StoryCharacter[];
  foreshadows: string[];
  genreTags: string[];
  gradient: string;
}

export interface WritingTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompt: string;
  category: 'fantasy' | 'scifi' | 'urban' | 'romance' | 'mystery' | 'historical';
  gradient: string;
}

export const genreTags: GenreTagConfig[] = [
  // 玄幻仙侠类
  { id: '1', name: '修仙', color: '#6366f1', icon: '⚡', gradient: 'from-indigo-500 to-purple-600', description: '仙侠世界，飞升成仙' },
  { id: '2', name: '玄幻', color: '#8b5cf6', icon: '🔥', gradient: 'from-purple-500 to-pink-600', description: '异世大陆，热血冒险' },
  { id: '3', name: '奇幻', color: '#a855f7', icon: '🧙', gradient: 'from-violet-500 to-purple-600', description: '魔法世界，奇迹之地' },
  { id: '4', name: '洪荒', color: '#9333ea', icon: '🌋', gradient: 'from-fuchsia-500 to-purple-600', description: '上古神话，蛮荒时代' },
  { id: '5', name: '武侠', color: '#10b981', icon: '⚔️', gradient: 'from-emerald-500 to-teal-600', description: '江湖侠义，刀光剑影' },
  { id: '6', name: '仙侠', color: '#7c3aed', icon: '🌟', gradient: 'from-violet-600 to-indigo-600', description: '仙剑奇缘，御剑飞行' },
  
  // 都市现实类
  { id: '7', name: '都市', color: '#ec4899', icon: '🌆', gradient: 'from-pink-500 to-rose-600', description: '现代都市，生活百态' },
  { id: '8', name: '职场', color: '#f43f5e', icon: '💼', gradient: 'from-rose-500 to-pink-600', description: '职场风云，拼搏奋斗' },
  { id: '9', name: '校园', color: '#f97316', icon: '🎓', gradient: 'from-orange-500 to-amber-600', description: '青春校园，青涩回忆' },
  { id: '10', name: '言情', color: '#f472b6', icon: '💕', gradient: 'from-pink-400 to-rose-500', description: '爱恨情仇，缠绵悱恻' },
  { id: '11', name: '总裁', color: '#db2777', icon: '👔', gradient: 'from-pink-600 to-rose-600', description: '豪门总裁，霸道宠溺' },
  { id: '12', name: '甜宠', color: '#fb7185', icon: '🍬', gradient: 'from-rose-400 to-pink-500', description: '甜蜜温馨，宠溺无度' },
  
  // 科幻未来类
  { id: '13', name: '科幻', color: '#06b6d4', icon: '🚀', gradient: 'from-cyan-500 to-blue-600', description: '未来世界，星际探索' },
  { id: '14', name: '星际', color: '#0ea5e9', icon: '🌌', gradient: 'from-sky-500 to-blue-600', description: '星际文明，星辰大海' },
  { id: '15', name: '末世', color: '#84cc16', icon: '☢️', gradient: 'from-lime-500 to-green-600', description: '末日降临，生存挣扎' },
  { id: '16', name: '废土', color: '#a3e635', icon: '🏜️', gradient: 'from-lime-400 to-emerald-500', description: '废土世界，资源争夺' },
  { id: '17', name: '赛博朋克', color: '#22d3ee', icon: '🤖', gradient: 'from-cyan-400 to-blue-500', description: '赛博世界，高科技低生活' },
  
  // 悬疑惊悚类
  { id: '18', name: '悬疑', color: '#64748b', icon: '🔍', gradient: 'from-slate-500 to-gray-600', description: '迷雾重重，层层推理' },
  { id: '19', name: '推理', color: '#475569', icon: '🕵️', gradient: 'from-slate-600 to-zinc-700', description: '逻辑推理，智慧博弈' },
  { id: '20', name: '惊悚', color: '#1e293b', icon: '👻', gradient: 'from-gray-700 to-slate-800', description: '恐怖氛围，心跳加速' },
  { id: '21', name: '灵异', color: '#7c2d12', icon: '🌙', gradient: 'from-orange-900 to-red-900', description: '鬼神传说，阴阳两界' },
  
  // 历史穿越类
  { id: '22', name: '历史', color: '#f59e0b', icon: '🏯', gradient: 'from-amber-500 to-orange-600', description: '古代王朝，风云变幻' },
  { id: '23', name: '穿越', color: '#ea580c', icon: '🌀', gradient: 'from-orange-500 to-red-600', description: '时空交错，命运改变' },
  { id: '24', name: '种田', color: '#65a30d', icon: '🌾', gradient: 'from-green-500 to-emerald-600', description: '田园生活，悠然自得' },
  { id: '25', name: '宫斗', color: '#dc2626', icon: '👑', gradient: 'from-red-500 to-rose-600', description: '后宫争斗，权谋算计' },
  { id: '26', name: '宅斗', color: '#b91c1c', icon: '🏠', gradient: 'from-red-600 to-rose-700', description: '家族内斗，嫡庶之争' },
  
  // 竞技游戏类
  { id: '27', name: '游戏', color: '#8b5cf6', icon: '🎮', gradient: 'from-violet-500 to-purple-600', description: '虚拟世界，游戏人生' },
  { id: '28', name: '电竞', color: '#6366f1', icon: '🏆', gradient: 'from-indigo-500 to-blue-600', description: '电子竞技，巅峰对决' },
  { id: '29', name: '直播', color: '#f59e0b', icon: '📺', gradient: 'from-amber-400 to-orange-500', description: '直播网红，粉丝经济' },
  { id: '30', name: '娱乐', color: '#ec4899', icon: '🎭', gradient: 'from-pink-500 to-rose-500', description: '娱乐圈，星光璀璨' },
  
  // 军旅战争类
  { id: '31', name: '军旅', color: '#15803d', icon: '🎖️', gradient: 'from-green-600 to-emerald-700', description: '铁血军营，战友深情' },
  { id: '32', name: '战争', color: '#991b1b', icon: '💥', gradient: 'from-red-700 to-orange-800', description: '硝烟弥漫，战火纷飞' },
  { id: '33', name: '特种兵', color: '#166534', icon: '🗡️', gradient: 'from-green-700 to-emerald-800', description: '特种作战，王者之师' },
  
  // 其他类型
  { id: '34', name: '同人', color: '#be185d', icon: '📝', gradient: 'from-pink-600 to-rose-700', description: '经典再创，情怀延续' },
  { id: '35', name: '衍生', color: '#9d174d', icon: '🔄', gradient: 'from-rose-600 to-pink-700', description: '世界衍生，创意拓展' },
  { id: '36', name: '轻小说', color: '#2563eb', icon: '📖', gradient: 'from-blue-500 to-indigo-600', description: '轻松阅读，愉悦享受' },
];

export const settingElements: SettingElementConfig[] = [
  // 角色设定 - 主角特质
  { id: '1', name: '资质平平', icon: '💫', description: '起点低，逆袭空间大', category: 'character' },
  { id: '2', name: '天才流', icon: '⭐', description: '天赋异禀，碾压众人', category: 'character' },
  { id: '3', name: '废物流', icon: '🌱', description: '被低估的隐藏天才', category: 'character' },
  { id: '4', name: '神秘导师', icon: '👴', description: '金手指引导，快速成长', category: 'character' },
  { id: '5', name: '系统流', icon: '🎮', description: '游戏化设定，任务驱动', category: 'character' },
  { id: '6', name: '重生者', icon: '⏰', description: '知晓未来，改变命运', category: 'character' },
  { id: '7', name: '穿越者', icon: '🌀', description: '异世来客，独具优势', category: 'character' },
  { id: '8', name: '失忆设定', icon: '❓', description: '身世成谜，慢慢揭开', category: 'character' },
  { id: '9', name: '双重人格', icon: '😈', description: '人格切换，性格反差', category: 'character' },
  { id: '10', name: '隐藏血脉', icon: '🩸', description: '特殊血统，潜力无限', category: 'character' },
  { id: '11', name: '退婚/休妻', icon: '📜', description: '经典冲突，激发斗志', category: 'character' },
  { id: '12', name: '校花/总裁', icon: '👑', description: '都市言情经典搭配', category: 'character' },
  { id: '13', name: '青梅竹马', icon: '🌸', description: '从小相识，感情深厚', category: 'character' },
  { id: '14', name: '师尊/师父', icon: '🧘', description: '亦师亦友，引领成长', category: 'character' },
  { id: '15', name: '萌宠/灵兽', icon: '🐉', description: '可爱搭档，共同冒险', category: 'character' },
  
  // 剧情元素 - 冲突与转折
  { id: '16', name: '家族测试', icon: '📊', description: '展示实力的舞台', category: 'plot' },
  { id: '17', name: '退婚羞辱', icon: '💔', description: '经典冲突，激发斗志', category: 'plot' },
  { id: '18', name: '逆袭打脸', icon: '👏', description: '华丽反转，扬眉吐气', category: 'plot' },
  { id: '19', name: '传承觉醒', icon: '💥', description: '获得传承，实力暴涨', category: 'plot' },
  { id: '20', name: '秘境探险', icon: '🗺️', description: '危险与机遇并存', category: 'plot' },
  { id: '21', name: '宗门大比', icon: '🏆', description: '实力比拼，一战成名', category: 'plot' },
  { id: '22', name: '势力崛起', icon: '📈', description: '从小到大，称霸一方', category: 'plot' },
  { id: '23', name: '红颜知己', icon: '💕', description: '情感纠葛，缠绵悱恻', category: 'plot' },
  { id: '24', name: '兄弟情义', icon: '🤝', description: '生死之交，患难与共', category: 'plot' },
  { id: '25', name: '背叛陷害', icon: '🗡️', description: '人心叵测，绝地反击', category: 'plot' },
  { id: '26', name: '身世之谜', icon: '🔮', description: '隐藏真相，逐步揭开', category: 'plot' },
  { id: '27', name: '灭门惨案', icon: '🔥', description: '血海深仇，必报之仇', category: 'plot' },
  { id: '28', name: '夺宝奇兵', icon: '💎', description: '奇珍异宝，争夺大战', category: 'plot' },
  { id: '29', name: '势力对决', icon: '⚔️', description: '门派争斗，胜者为王', category: 'plot' },
  
  // 世界观设定 - 环境与背景
  { id: '30', name: '宗门崛起', icon: '🏯', description: '势力发展，版图扩张', category: 'world' },
  { id: '31', name: '星际争霸', icon: '🌌', description: '宇宙文明，星辰大海', category: 'world' },
  { id: '32', name: '穿越异界', icon: '🌀', description: '跨时空冒险，新世界探索', category: 'world' },
  { id: '33', name: '末日生存', icon: '☢️', description: '绝境求生，资源争夺', category: 'world' },
  { id: '34', name: '都市修仙', icon: '🌃', description: '现代都市，灵气复苏', category: 'world' },
  { id: '35', name: '游戏世界', icon: '🎲', description: '虚拟现实，沉浸体验', category: 'world' },
  { id: '36', name: '废土末世', icon: '🏚️', description: '文明废墟，重建家园', category: 'world' },
  { id: '37', name: '魔法学院', icon: '🏰', description: '奇幻校园，学习魔法', category: 'world' },
  { id: '38', name: '赛博都市', icon: '🤖', description: '高科技与低生活的碰撞', category: 'world' },
  { id: '39', name: '古代王朝', icon: '👑', description: '封建社会，皇权至上', category: 'world' },
  { id: '40', name: '江湖武林', icon: '⚔️', description: '武林门派，刀光剑影', category: 'world' },
  { id: '41', name: '深海异界', icon: '🐚', description: '海底世界，未知探索', category: 'world' },
  { id: '42', name: '异星殖民', icon: '🪐', description: '外星领地，艰难开拓', category: 'world' },
  { id: '43', name: '灵气复苏', icon: '✨', description: '天地异变，修炼重来', category: 'world' },
  
  // 核心冲突 - 矛盾与对立
  { id: '44', name: '正邪对立', icon: '☯️', description: '光明与黑暗的永恒之战', category: 'conflict' },
  { id: '45', name: '门派之争', icon: '⚔️', description: '不同势力的生存博弈', category: 'conflict' },
  { id: '46', name: '种族矛盾', icon: '🐉', description: '人与异族的生存冲突', category: 'conflict' },
  { id: '47', name: '权力斗争', icon: '👑', description: '皇位争夺，权谋算计', category: 'conflict' },
  { id: '48', name: '爱恨情仇', icon: '💔', description: '情感的纠葛与抉择', category: 'conflict' },
  { id: '49', name: '道义抉择', icon: '⚖️', description: '在正义与情义间徘徊', category: 'conflict' },
  { id: '50', name: '生存危机', icon: '💀', description: '生死存亡的极限挑战', category: 'conflict' },
  { id: '51', name: '身份认同', icon: '🎭', description: '自我认知的迷茫与突破', category: 'conflict' },
  { id: '52', name: '世代仇恨', icon: '🩸', description: '家族恩怨，世代相传', category: 'conflict' },
  { id: '53', name: '理想信念', icon: '🌟', description: '坚持初心还是随波逐流', category: 'conflict' },
];

export const storyNuclei: StoryNucleusConfig[] = [
  // 修仙玄幻类
  {
    id: '1',
    title: '废物流的逆袭之路',
    premise: '在一个以灵根资质论英雄的修仙世界，主角天生废灵根，被所有人嘲笑...',
    conflict: '主角必须在被所有人看不起的情况下，找到属于自己的修炼之路，同时揭开灵根测试的秘密...',
    characters: [
      { role: '主角', name: '林风', traits: ['坚韧', '善良', '不屈'] },
      { role: '导师', name: '神秘老者', traits: ['神秘', '强大', '智慧'] },
      { role: '对手', name: '李天骄', traits: ['傲慢', '嫉妒', '阴险'] },
    ],
    foreshadows: ['隐藏的血脉', '上古传承', '灵根真相'],
    genreTags: ['修仙', '热血', '逆袭'],
    gradient: 'from-indigo-500/20 to-purple-500/20',
  },
  {
    id: '2',
    title: '系统觉醒的修仙传奇',
    premise: '现代青年意外穿越到修仙界，还附带一个自称来自未来的超级系统...',
    conflict: '在系统的帮助下快速成长，却发现系统背后隐藏着惊天秘密，同时面临修仙界的各种势力争夺...',
    characters: [
      { role: '主角', name: '陈轩', traits: ['冷静', '腹黑', '果断'] },
      { role: '系统', name: '小灵', traits: ['可爱', '毒舌', '忠诚'] },
      { role: '女主', name: '苏婉儿', traits: ['温柔', '聪慧', '坚强'] },
    ],
    foreshadows: ['系统的真相', '隐藏的敌人', '前世的羁绊'],
    genreTags: ['修仙', '系统流', '穿越'],
    gradient: 'from-violet-500/20 to-purple-500/20',
  },
  {
    id: '3',
    title: '剑道独尊',
    premise: '剑修没落的时代，主角意外获得上古剑仙传承，开启剑道新时代...',
    conflict: '在各大剑宗的打压下，主角如何以一剑之威，重振剑道荣光...',
    characters: [
      { role: '主角', name: '叶尘', traits: ['孤傲', '专注', '热血'] },
      { role: '剑灵', name: '青莲', traits: ['高冷', '傲娇', '深情'] },
      { role: '宿敌', name: '萧无极', traits: ['阴狠', '野心', '执着'] },
    ],
    foreshadows: ['上古剑冢', '剑道起源', '宿命对决'],
    genreTags: ['玄幻', '剑道', '热血'],
    gradient: 'from-slate-500/20 to-indigo-500/20',
  },
  {
    id: '4',
    title: '洪荒开局',
    premise: '重生到洪荒世界，成为巫妖量劫中的一个小巫族，看主角如何在夹缝中求存...',
    conflict: '巫妖两族的生死较量中，主角如何带领族人走出困境，开辟新的道路...',
    characters: [
      { role: '主角', name: '玄冥', traits: ['智慧', '沉稳', '谋略'] },
      { role: '兄长', name: '后羿', traits: ['豪爽', '勇猛', '义气'] },
      { role: '对手', name: '帝俊', traits: ['霸道', '野心', '权谋'] },
    ],
    foreshadows: ['十二祖巫', '周天星斗', '妖族天庭'],
    genreTags: ['洪荒', '穿越', '巫族'],
    gradient: 'from-amber-500/20 to-red-500/20',
  },
  
  // 都市类
  {
    id: '5',
    title: '都市兵王归来',
    premise: '佣兵之王回归都市，本想低调生活，却被卷入各种纷争...',
    conflict: '在保护亲人和对抗敌人的过程中，主角展现兵王本色，却发现自己背负的使命远不止于此...',
    characters: [
      { role: '主角', name: '龙傲天', traits: ['冷酷', '深情', '正义'] },
      { role: '女主', name: '叶轻眉', traits: ['知性', '独立', '坚强'] },
      { role: '兄弟', name: '狼牙', traits: ['忠诚', '热血', '幽默'] },
    ],
    foreshadows: ['佣兵团的过去', '神秘的雇主', '隐藏的身份'],
    genreTags: ['都市', '兵王', '热血'],
    gradient: 'from-slate-600/20 to-gray-700/20',
  },
  {
    id: '6',
    title: '重生之我在都市当首富',
    premise: '商业精英重生回到二十岁，带着前世记忆和商业帝国计划...',
    conflict: '面对曾经的对手和错过的机会，主角能否改写人生，同时揭开前世失败的真相...',
    characters: [
      { role: '主角', name: '周明', traits: ['精明', '果断', '重情'] },
      { role: '女主', name: '苏晴', traits: ['温柔', '独立', '聪慧'] },
      { role: '宿敌', name: '王浩', traits: ['阴险', '贪婪', '狠辣'] },
    ],
    foreshadows: ['前世的遗憾', '隐藏的身份', '商业阴谋'],
    genreTags: ['都市', '重生', '商战'],
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    id: '7',
    title: '超级神豪系统',
    premise: '普通青年获得神豪系统，只要花钱就能变强，从此走上人生巅峰...',
    conflict: '在挥金如土的同时，主角发现系统背后隐藏的秘密，以及金钱买不到的东西...',
    characters: [
      { role: '主角', name: '李逸', traits: ['低调', '腹黑', '善良'] },
      { role: '女主', name: '林诗雨', traits: ['清新', '纯真', '努力'] },
      { role: '闺蜜', name: '赵雪', traits: ['八卦', '热心', '机智'] },
    ],
    foreshadows: ['系统的来历', '隐藏任务', '真实身份'],
    genreTags: ['都市', '系统流', '爽文'],
    gradient: 'from-yellow-500/20 to-amber-500/20',
  },
  {
    id: '8',
    title: '医武双绝',
    premise: '古武世家的传人来到都市，一手绝世医术，一身高强武功，治病救人快意恩仇...',
    conflict: '在现代医学与传统武学的碰撞中，主角如何找到自己的道路，同时应对各路势力的威胁...',
    characters: [
      { role: '主角', name: '秦风', traits: ['正直', '洒脱', '重情'] },
      { role: '女主', name: '沈若兰', traits: ['温婉', '坚强', '独立'] },
      { role: '世家子弟', name: '陈玉龙', traits: ['跋扈', '阴险', '嫉妒'] },
    ],
    foreshadows: ['古武传承', '医术秘籍', '身世之谜'],
    genreTags: ['都市', '医术', '古武'],
    gradient: 'from-emerald-500/20 to-teal-500/20',
  },
  
  // 科幻星际类
  {
    id: '9',
    title: '星际移民者的新家园',
    premise: '人类殖民舰队抵达新星系，却发现这个星球隐藏着古老文明的秘密...',
    conflict: '在探索与生存之间，殖民者面临前所未有的抉择，而主角发现了改变人类命运的关键...',
    characters: [
      { role: '主角', name: '艾伦', traits: ['勇敢', '智慧', '领导力'] },
      { role: '科学家', name: '艾琳', traits: ['理性', '执着', '善良'] },
      { role: '反派', name: '议长', traits: ['野心', '阴谋', '冷酷'] },
    ],
    foreshadows: ['远古遗迹', '外星智慧', '人类的起源'],
    genreTags: ['科幻', '星际', '探索'],
    gradient: 'from-cyan-500/20 to-blue-500/20',
  },
  {
    id: '10',
    title: '废土霸主',
    premise: '核战后的废土世界，资源匮乏，人类在废墟中挣扎求存...',
    conflict: '主角在废土中崛起，建立势力，却发现了核战的真正原因...',
    characters: [
      { role: '主角', name: '雷霆', traits: ['狠辣', '果断', '义气'] },
      { role: '女主', name: '雪儿', traits: ['坚强', '聪慧', '纯真'] },
      { role: '变异兽', name: '铁甲', traits: ['忠诚', '凶猛', '智慧'] },
    ],
    foreshadows: ['核战真相', '变异起源', '新的威胁'],
    genreTags: ['末世', '废土', '生存'],
    gradient: 'from-lime-500/20 to-green-500/20',
  },
  {
    id: '11',
    title: '赛博朋克之机械心脏',
    premise: '在高科技与低生活并存的未来都市，主角装上了改造的机械心脏...',
    conflict: '在企业巨头的阴影下，主角如何利用机械力量揭露真相，改变这座城市的命运...',
    characters: [
      { role: '主角', name: '凯', traits: ['叛逆', '正义', '孤独'] },
      { role: '黑客', name: '零点', traits: ['神秘', '机智', '热情'] },
      { role: '反派', name: '总裁', traits: ['冷酷', '野心', '疯狂'] },
    ],
    foreshadows: ['机械心脏的秘密', '企业的阴谋', '意识的觉醒'],
    genreTags: ['赛博朋克', '科幻', '反乌托邦'],
    gradient: 'from-cyan-400/20 to-blue-400/20',
  },
  
  // 悬疑推理类
  {
    id: '12',
    title: '心理罪者',
    premise: '天才心理侧写师卷入一连串离奇案件，每一个凶手都像是冲着他来的...',
    conflict: '在追查凶手的过程中，主角发现自己的过去与案件有着千丝万缕的联系...',
    characters: [
      { role: '主角', name: '沈夜', traits: ['敏锐', '冷静', '复杂'] },
      { role: '搭档', name: '林雨', traits: ['热血', '正直', '执着'] },
      { role: '神秘人', name: 'X', traits: ['疯狂', '智慧', '扭曲'] },
    ],
    foreshadows: ['主角的过去', '案件的关联', '真正的幕后黑手'],
    genreTags: ['悬疑', '推理', '心理'],
    gradient: 'from-gray-600/20 to-slate-600/20',
  },
  {
    id: '13',
    title: '灵异事务所',
    premise: '普通人意外继承了一家灵异事务所，从此踏入阴阳两界的边缘...',
    conflict: '在处理各种灵异事件的同时，主角发现自己与灵界有着不为人知的联系...',
    characters: [
      { role: '主角', name: '林远', traits: ['正义', '幽默', '成长'] },
      { role: '鬼魂', name: '小青', traits: ['可爱', '傲娇', '善良'] },
      { role: '神秘人', name: '阴阳师', traits: ['神秘', '强大', '深沉'] },
    ],
    foreshadows: ['事务所的秘密', '主角的体质', '阴阳界的战争'],
    genreTags: ['灵异', '都市', '奇幻'],
    gradient: 'from-purple-500/20 to-indigo-500/20',
  },
  
  // 历史穿越类
  {
    id: '14',
    title: '回到古代当王爷',
    premise: '现代人穿越成同名同姓的废物王爷，看他如何逆袭成为一代明君...',
    conflict: '在波诡云谲的朝堂中，主角如何运用现代知识化解危机，同时赢得美人心...',
    characters: [
      { role: '主角', name: '李煜', traits: ['睿智', '幽默', '重情'] },
      { role: '女主', name: '慕容雪', traits: ['才女', '聪慧', '独立'] },
      { role: '谋士', name: '刘伯温', traits: ['智慧', '忠诚', '远见'] },
    ],
    foreshadows: ['皇位争夺', '身世之谜', '历史的秘密'],
    genreTags: ['穿越', '历史', '权谋'],
    gradient: 'from-amber-600/20 to-orange-600/20',
  },
  {
    id: '15',
    title: '逃荒种田记',
    premise: '穿越到古代灾年，看主角如何带领村民逃荒求生，最终建成世外桃源...',
    conflict: '在天灾人祸的双重压力下，主角如何带领村民活下去，并建立起理想的家园...',
    characters: [
      { role: '主角', name: '田七', traits: ['机智', '善良', '有担当'] },
      { role: '女主', name: '柳絮', traits: ['温柔', '能干', '坚强'] },
      { role: '村长', name: '老田头', traits: ['固执', '善良', '经验'] },
    ],
    foreshadows: ['灾荒真相', '隐藏的富矿', '更大的危机'],
    genreTags: ['种田', '穿越', '生存'],
    gradient: 'from-green-500/20 to-emerald-500/20',
  },
  {
    id: '16',
    title: '宫墙之内',
    premise: '现代法医穿越成后宫嫔妃，且看她如何用专业知识在宫廷中站稳脚跟...',
    conflict: '在尔虞我诈的后宫中，主角不仅要生存下去，还要查明母亲死亡的真相...',
    characters: [
      { role: '主角', name: '沈云瑶', traits: ['冷静', '聪慧', '正义'] },
      { role: '皇帝', name: '萧衍', traits: ['多疑', '深情', '复杂'] },
      { role: '闺蜜', name: '苏雅', traits: ['善良', '单纯', '悲剧'] },
    ],
    foreshadows: ['母亲的死', '皇帝的真心', '隐藏的势力'],
    genreTags: ['宫斗', '穿越', '悬疑'],
    gradient: 'from-red-500/20 to-rose-500/20',
  },
  
  // 游戏电竞类
  {
    id: '17',
    title: '全职高手',
    premise: '被俱乐部驱逐的职业选手，在网吧重新开始，用实力证明自己...',
    conflict: '在证明自己的道路上，主角不仅要面对老东家的打压，还要重新组建战队冲击冠军...',
    characters: [
      { role: '主角', name: '叶修', traits: ['专注', '执着', '傲骨'] },
      { role: '搭档', name: '苏沐橙', traits: ['温柔', '坚强', '忠诚'] },
      { role: '宿敌', name: '韩文清', traits: ['强硬', '公正', '执着'] },
    ],
    foreshadows: ['退役的真相', '叶秋的秘密', '冠军的意义'],
    genreTags: ['电竞', '游戏', '热血'],
    gradient: 'from-indigo-500/20 to-blue-500/20',
  },
  {
    id: '18',
    title: '我在游戏里养妖怪',
    premise: '全息游戏《仙侠世界》中，主角意外获得了可以捕捉妖怪的特殊能力...',
    conflict: '在虚拟与现实的边界模糊之际，主角发现游戏中的妖怪竟然会影响现实...',
    characters: [
      { role: '主角', name: '顾长安', traits: ['善良', '机智', '成长'] },
      { role: '妖怪', name: '小狐狸', traits: ['可爱', '傲娇', '忠诚'] },
      { role: '对手', name: '黑狐', traits: ['阴险', '强大', '野心'] },
    ],
    foreshadows: ['游戏的秘密', '妖怪的起源', '现实的影响'],
    genreTags: ['游戏', '奇幻', '都市'],
    gradient: 'from-pink-500/20 to-violet-500/20',
  },
];

export const writingTemplates: WritingTemplate[] = [
  {
    id: '1',
    name: '废物流崛起',
    icon: '📚',
    description: '资质平庸的主角在逆境中成长，最终逆袭成功',
    prompt: '一个资质平庸的少年，在家族测试中被嘲讽，后来意外获得上古传承，开始了逆袭之路',
    category: 'fantasy',
    gradient: 'from-indigo-500 to-purple-600',
  },
  {
    id: '2',
    name: '都市兵王',
    icon: '💂',
    description: '回归都市的特种兵王，纵横职场与战场',
    prompt: '退役特种兵回到都市，保护总裁安全的同时揭开身世之谜',
    category: 'urban',
    gradient: 'from-slate-600 to-gray-700',
  },
  {
    id: '3',
    name: '星际探索',
    icon: '🚀',
    description: '人类征服星辰大海的壮阔史诗',
    prompt: '星际探险队在未知星系发现了一颗神秘星球，上面存在着失落的文明',
    category: 'scifi',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    id: '4',
    name: '校园青春',
    icon: '🎓',
    description: '青涩校园时光的甜蜜与成长',
    prompt: '转学生来到重点高中，与天才同桌之间发生的青春故事',
    category: 'romance',
    gradient: 'from-pink-400 to-rose-500',
  },
  {
    id: '5',
    name: '古风江湖',
    icon: '⚔️',
    description: '刀光剑影的武侠世界',
    prompt: '江湖门派争斗，主角意外获得失传剑法，在江湖上扬名立万',
    category: 'historical',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: '6',
    name: '悬疑推理',
    icon: '🔍',
    description: '层层迷雾中的真相',
    prompt: '私家侦探接手一桩离奇失踪案，随着调查深入发现案件背后隐藏着惊人秘密',
    category: 'mystery',
    gradient: 'from-slate-500 to-zinc-600',
  },
];
