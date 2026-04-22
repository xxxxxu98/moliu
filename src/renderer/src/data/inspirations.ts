export interface GenreTagConfig {
  id: string;
  name: string;
  color: string;
  icon: string;
  gradient: string;
}

export interface SettingElementConfig {
  id: string;
  name: string;
  icon: string;
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

export const genreTags: GenreTagConfig[] = [
  { id: '1', name: '修仙', color: '#6366f1', icon: '⚡', gradient: 'from-indigo-500 to-purple-600' },
  { id: '2', name: '玄幻', color: '#8b5cf6', icon: '🔥', gradient: 'from-purple-500 to-pink-600' },
  { id: '3', name: '都市', color: '#ec4899', icon: '🌆', gradient: 'from-pink-500 to-rose-600' },
  { id: '4', name: '科幻', color: '#06b6d4', icon: '🚀', gradient: 'from-cyan-500 to-blue-600' },
  { id: '5', name: '历史', color: '#f59e0b', icon: '🏯', gradient: 'from-amber-500 to-orange-600' },
  { id: '6', name: '武侠', color: '#10b981', icon: '⚔️', gradient: 'from-emerald-500 to-teal-600' },
];

export const settingElements: SettingElementConfig[] = [
  { id: '1', name: '资质平平的主角', icon: '💫' },
  { id: '2', name: '退婚羞辱', icon: '💔' },
  { id: '3', name: '神秘老爷爷', icon: '👴' },
  { id: '4', name: '家族测试', icon: '📊' },
  { id: '5', name: '宗门崛起', icon: '🏯' },
  { id: '6', name: '天才流', icon: '⭐' },
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
];
