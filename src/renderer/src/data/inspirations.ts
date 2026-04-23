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
  { id: '1', name: '修仙', color: '#6366f1', icon: '⚡', gradient: 'from-indigo-500 to-purple-600', description: '仙侠世界，飞升成仙' },
  { id: '2', name: '玄幻', color: '#8b5cf6', icon: '🔥', gradient: 'from-purple-500 to-pink-600', description: '异世大陆，热血冒险' },
  { id: '3', name: '都市', color: '#ec4899', icon: '🌆', gradient: 'from-pink-500 to-rose-600', description: '现代都市，生活百态' },
  { id: '4', name: '科幻', color: '#06b6d4', icon: '🚀', gradient: 'from-cyan-500 to-blue-600', description: '未来世界，星际探索' },
  { id: '5', name: '历史', color: '#f59e0b', icon: '🏯', gradient: 'from-amber-500 to-orange-600', description: '古代王朝，风云变幻' },
  { id: '6', name: '武侠', color: '#10b981', icon: '⚔️', gradient: 'from-emerald-500 to-teal-600', description: '江湖侠义，刀光剑影' },
  { id: '7', name: '悬疑', color: '#64748b', icon: '🔍', gradient: 'from-slate-500 to-gray-600', description: '迷雾重重，层层推理' },
  { id: '8', name: '言情', color: '#f472b6', icon: '💕', gradient: 'from-pink-400 to-rose-500', description: '爱恨情仇，缠绵悱恻' },
];

export const settingElements: SettingElementConfig[] = [
  { id: '1', name: '资质平平', icon: '💫', description: '起点低，逆袭空间大', category: 'character' },
  { id: '2', name: '退婚羞辱', icon: '💔', description: '经典冲突，激发斗志', category: 'plot' },
  { id: '3', name: '神秘导师', icon: '👴', description: '金手指引导，快速成长', category: 'character' },
  { id: '4', name: '家族测试', icon: '📊', description: '展示实力的舞台', category: 'plot' },
  { id: '5', name: '宗门崛起', icon: '🏯', description: '势力发展，版图扩张', category: 'world' },
  { id: '6', name: '天才流', icon: '⭐', description: '天赋异禀，碾压众人', category: 'character' },
  { id: '7', name: '系统流', icon: '🎮', description: '游戏化设定，任务驱动', category: 'world' },
  { id: '8', name: '重生复仇', icon: '⏰', description: '知晓未来，改变命运', category: 'plot' },
  { id: '9', name: '穿越异界', icon: '🌀', description: '跨时空冒险，新世界探索', category: 'world' },
  { id: '10', name: '校花/总裁', icon: '👑', description: '都市言情经典搭配', category: 'character' },
  { id: '11', name: '末日生存', icon: '☢️', description: '绝境求生，资源争夺', category: 'conflict' },
  { id: '12', name: '星际争霸', icon: '🌌', description: '宇宙文明，星辰大海', category: 'world' },
];

export const storyNuclei: StoryNucleusConfig[] = [
  {
    id: '1',
    title: '废物流的逆袭之路',
    premise: '在一个以灵根资质论英雄的修仙世界，主角天生废灵根，被所有人嘲笑...',
    conflict: '主角必须在被所有人看不起的情况下，找到属于自己的修炼之路...',
    characters: [
      { role: '主角', name: '林风', traits: ['坚韧', '善良'] },
      { role: '导师', name: '神秘老者', traits: ['神秘', '强大'] },
    ],
    foreshadows: ['隐藏的血脉', '上古传承'],
    genreTags: ['修仙', '热血'],
    gradient: 'from-indigo-500/20 to-purple-500/20',
  },
  {
    id: '2',
    title: '系统觉醒的都市传奇',
    premise: '普通大学生意外获得超级系统，从此人生逆袭，走上巅峰...',
    conflict: '在都市的暗流涌动中，主角如何平衡力量与道德的考验...',
    characters: [
      { role: '主角', name: '陈昊', traits: ['冷静', '腹黑'] },
    ],
    foreshadows: ['系统的真相', '隐藏的敌人'],
    genreTags: ['都市', '系统流'],
    gradient: 'from-emerald-500/20 to-cyan-500/20',
  },
  {
    id: '3',
    title: '重生之我在都市当首富',
    premise: '商业精英重生回到二十岁，带着前世记忆和商业帝国计划...',
    conflict: '面对曾经的对手和错过的机会，主角能否改写人生...',
    characters: [
      { role: '主角', name: '周明', traits: ['精明', '果断'] },
      { role: '女主', name: '苏晴', traits: ['温柔', '独立'] },
    ],
    foreshadows: ['前世的遗憾', '隐藏的身份'],
    genreTags: ['都市', '重生'],
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    id: '4',
    title: '星际移民者的新家园',
    premise: '人类殖民舰队抵达新星系，却发现这个星球隐藏着古老文明的秘密...',
    conflict: '在探索与生存之间，殖民者面临前所未有的抉择...',
    characters: [
      { role: '主角', name: '艾伦', traits: ['勇敢', '智慧'] },
      { role: '反派', name: '议长', traits: ['野心', '阴谋'] },
    ],
    foreshadows: ['远古遗迹', '外星智慧'],
    genreTags: ['科幻', '星际'],
    gradient: 'from-cyan-500/20 to-blue-500/20',
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
