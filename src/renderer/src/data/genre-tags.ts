/**
 * 题材标签数据（元素混搭 / 命运骰子 / 本地灵感池共用）
 *
 * 约束：
 * - name 全局唯一，且不得与 BRAIN_GENRES、settingElements 重名（面板按 name 判定选中）；
 *   由 __tests__/genre-tags.test.ts 守护。
 * - profileId 必须指向 GENRE_PROFILES 中存在的 id；缺省时下游按名称模糊匹配。
 * - 只收录有市场辨识度的题材；体裁（如「网文」）、子类重复项、审核风险项不收录。
 */

import type { GenreTagCategory, GenreTagConfig } from '@/types/inspiration';

/** 分类展示顺序与中文标签 */
export const GENRE_TAG_CATEGORIES: { id: GenreTagCategory; label: string }[] = [
  { id: 'fantasy', label: '玄幻仙侠' },
  { id: 'urban', label: '都市现实' },
  { id: 'romance', label: '女频言情' },
  { id: 'historical', label: '历史古代' },
  { id: 'scifi', label: '科幻末世' },
  { id: 'mystery', label: '悬疑灵异' },
  { id: 'game', label: '游戏竞技' },
  { id: 'military', label: '军事谍战' },
  { id: 'derivative', label: '衍生同人' },
];

/** 题材标签全集 */
export const genreTags: GenreTagConfig[] = [
  // ==================== 玄幻仙侠 ====================
  { id: 'g-fan-xiuxian', name: '修仙', color: '#6366f1', icon: '⚡', gradient: 'from-indigo-500 to-purple-600', description: '仙侠世界，飞升成仙', category: 'fantasy', audience: 'male', profileId: 'xianxia' },
  { id: 'g-fan-xianxia', name: '仙侠', color: '#7c3aed', icon: '🌟', gradient: 'from-violet-600 to-indigo-600', description: '仙剑奇缘，御剑飞行', category: 'fantasy', audience: 'general', profileId: 'xianxia' },
  { id: 'g-fan-xuanhuan', name: '玄幻', color: '#8b5cf6', icon: '🔥', gradient: 'from-purple-500 to-pink-600', description: '异世大陆，热血冒险', category: 'fantasy', audience: 'male', profileId: 'fantasy' },
  { id: 'g-fan-gaowu', name: '高武', color: '#ef4444', icon: '👊', gradient: 'from-red-500 to-orange-600', description: '全民习武，拳头即道理', category: 'fantasy', audience: 'male', profileId: 'high-martial' },
  { id: 'g-fan-honghuang', name: '洪荒', color: '#9333ea', icon: '🌋', gradient: 'from-fuchsia-500 to-purple-600', description: '上古神话，巫妖量劫', category: 'fantasy', audience: 'male', profileId: 'xianxia' },
  { id: 'g-fan-wuxia', name: '武侠', color: '#10b981', icon: '⚔️', gradient: 'from-emerald-500 to-teal-600', description: '江湖侠义，刀光剑影', category: 'fantasy', audience: 'general', profileId: 'wuxia' },
  { id: 'g-his-western', name: '西幻', color: '#7c3aed', icon: '🛡️', gradient: 'from-violet-600 to-indigo-700', description: '神魔体系，骑士与契约', category: 'fantasy', audience: 'male', profileId: 'western-fantasy' },
  { id: 'g-fan-system', name: '系统流', color: '#0ea5e9', icon: '🎮', gradient: 'from-sky-500 to-indigo-600', description: '任务面板驱动成长，可叠加任意题材', category: 'fantasy', audience: 'general', profileId: 'system' },

  // ==================== 都市现实 ====================
  { id: 'g-urb-general', name: '都市', color: '#ec4899', icon: '🌆', gradient: 'from-pink-500 to-rose-600', description: '现代都市，生活百态', category: 'urban', audience: 'general', profileId: 'urban' },
  { id: 'g-urb-power', name: '都市异能', color: '#a855f7', icon: '🌃', gradient: 'from-purple-500 to-indigo-600', description: '超凡力量入侵日常生活', category: 'urban', audience: 'male', profileId: 'urban-power' },
  { id: 'g-urb-daily', name: '都市日常', color: '#f59e0b', icon: '☕', gradient: 'from-amber-400 to-orange-500', description: '小人物的烟火气与逆袭', category: 'urban', audience: 'general', profileId: 'urban' },
  { id: 'g-urb-tycoon', name: '神豪', color: '#eab308', icon: '💰', gradient: 'from-yellow-500 to-amber-600', description: '花钱变强，挥金如土', category: 'urban', audience: 'male', profileId: 'urban' },
  { id: 'g-urb-soninlaw', name: '赘婿', color: '#64748b', icon: '🏠', gradient: 'from-slate-500 to-gray-600', description: '入赘受辱，隐忍翻身', category: 'urban', audience: 'male', profileId: 'urban' },
  { id: 'g-urb-soldier', name: '兵王', color: '#15803d', icon: '🎖️', gradient: 'from-green-600 to-emerald-700', description: '王者归来，低调护短', category: 'urban', audience: 'male', profileId: 'urban' },
  { id: 'g-urb-career', name: '职场', color: '#f43f5e', icon: '💼', gradient: 'from-rose-500 to-pink-600', description: '职场风云，拼搏奋斗', category: 'urban', audience: 'general', profileId: 'urban' },
  { id: 'g-urb-campus', name: '校园', color: '#f97316', icon: '🎓', gradient: 'from-orange-500 to-amber-600', description: '青春校园，青涩回忆', category: 'urban', audience: 'general', profileId: 'sweet-youth' },
  { id: 'g-urb-medic', name: '医疗', color: '#14b8a6', icon: '💉', gradient: 'from-teal-500 to-cyan-600', description: '医院风云，悬壶济世', category: 'urban', audience: 'general', profileId: 'urban' },
  { id: 'g-oth-legal', name: '律政', color: '#1e40af', icon: '⚖️', gradient: 'from-blue-700 to-indigo-800', description: '法庭激辩，正义审判', category: 'urban', audience: 'general', profileId: 'urban' },
  { id: 'g-urb-music', name: '音乐', color: '#a855f7', icon: '🎵', gradient: 'from-violet-500 to-purple-600', description: '音符跳动，梦想启航', category: 'urban', audience: 'general', profileId: 'urban' },
  { id: 'g-urb-technology', name: '科技', color: '#6366f1', icon: '💻', gradient: 'from-indigo-500 to-blue-600', description: '科技创业，改变世界', category: 'urban', audience: 'male', profileId: 'urban' },
  { id: 'g-urb-realistic', name: '现实', color: '#78716c', icon: '🏙️', gradient: 'from-stone-500 to-gray-600', description: '扎根现实，社会共鸣', category: 'urban', audience: 'general', profileId: 'urban' },

  // ==================== 女频言情 ====================
  { id: 'g-urb-romance', name: '言情', color: '#f472b6', icon: '💕', gradient: 'from-pink-400 to-rose-500', description: '爱恨情仇，缠绵悱恻', category: 'romance', audience: 'female', profileId: 'romance' },
  { id: 'g-rom-ancient', name: '古言', color: '#be123c', icon: '🏮', gradient: 'from-rose-700 to-red-800', description: '古风韵味，情深缘浅', category: 'romance', audience: 'female', profileId: 'ancient-romance' },
  { id: 'g-rom-modern', name: '现言', color: '#ec4899', icon: '🌇', gradient: 'from-pink-500 to-fuchsia-600', description: '现代都市里的爱情', category: 'romance', audience: 'female', profileId: 'urban-romance' },
  { id: 'g-urb-ceo', name: '总裁', color: '#db2777', icon: '👔', gradient: 'from-pink-600 to-rose-600', description: '豪门总裁，权力差距', category: 'romance', audience: 'female', profileId: 'ceo-romance' },
  { id: 'g-urb-sweet', name: '甜宠', color: '#fb7185', icon: '🍬', gradient: 'from-rose-400 to-pink-500', description: '甜蜜温馨，宠溺无度', category: 'romance', audience: 'female', profileId: 'sweet-youth' },
  { id: 'g-rom-angst', name: '虐恋', color: '#9f1239', icon: '💔', gradient: 'from-rose-800 to-red-900', description: '情感冲突，虐恋情深', category: 'romance', audience: 'female', profileId: 'dog-blood' },
  { id: 'g-rom-period', name: '年代', color: '#a16207', icon: '📻', gradient: 'from-yellow-700 to-amber-800', description: '特定年代的奋斗与生活', category: 'romance', audience: 'female', profileId: 'period' },
  { id: 'g-rom-republic', name: '民国', color: '#57534e', icon: '🎩', gradient: 'from-stone-600 to-zinc-700', description: '乱世风云，身份隐秘', category: 'romance', audience: 'female', profileId: 'romance' },
  { id: 'g-rom-quickwear', name: '快穿', color: '#8b5cf6', icon: '🔁', gradient: 'from-violet-500 to-fuchsia-600', description: '穿梭小世界完成任务', category: 'romance', audience: 'female', profileId: 'romance' },
  { id: 'g-rom-heroine', name: '大女主', color: '#c026d3', icon: '👑', gradient: 'from-fuchsia-600 to-purple-700', description: '女主事业线为核心', category: 'romance', audience: 'female', profileId: 'romance' },
  { id: 'g-rom-matriarchy', name: '女尊', color: '#e11d48', icon: '♛', gradient: 'from-rose-600 to-pink-700', description: '女性为尊的世界秩序', category: 'romance', audience: 'female', profileId: 'romance' },
  { id: 'g-rom-fantasy', name: '幻想言情', color: '#a78bfa', icon: '🔮', gradient: 'from-violet-400 to-purple-500', description: '异世界规则下的爱情', category: 'romance', audience: 'female', profileId: 'romance' },
  { id: 'g-rom-mystery', name: '女频悬疑', color: '#475569', icon: '🕯️', gradient: 'from-slate-600 to-rose-800', description: '亲密关系迷雾中的真相', category: 'romance', audience: 'female', profileId: 'mystery' },
  { id: 'g-rom-office', name: '职场婚恋', color: '#0891b2', icon: '🏢', gradient: 'from-cyan-600 to-blue-700', description: '事业与爱情的天平', category: 'romance', audience: 'female', profileId: 'urban-romance' },

  // ==================== 历史古代 ====================
  { id: 'g-his-history', name: '历史', color: '#f59e0b', icon: '🏯', gradient: 'from-amber-500 to-orange-600', description: '古代王朝，风云变幻', category: 'historical', audience: 'male', profileId: 'historical' },
  { id: 'g-his-timeless', name: '穿越', color: '#ea580c', icon: '🌀', gradient: 'from-orange-500 to-red-600', description: '时空交错，命运改变', category: 'historical', audience: 'general', profileId: 'historical' },
  { id: 'g-his-intrigue', name: '权谋', color: '#7f1d1d', icon: '♟️', gradient: 'from-red-900 to-stone-800', description: '朝堂博弈，步步为营', category: 'historical', audience: 'general', profileId: 'historical' },
  { id: 'g-his-hegemony', name: '争霸', color: '#b45309', icon: '🚩', gradient: 'from-amber-700 to-red-700', description: '乱世起兵，逐鹿天下', category: 'historical', audience: 'male', profileId: 'historical' },
  { id: 'g-his-exam', name: '科举', color: '#ca8a04', icon: '📜', gradient: 'from-yellow-600 to-amber-700', description: '寒门读书，金榜题名', category: 'historical', audience: 'general', profileId: 'historical' },
  { id: 'g-his-farming', name: '种田', color: '#65a30d', icon: '🌾', gradient: 'from-green-500 to-emerald-600', description: '经营积累，稳步成长', category: 'historical', audience: 'general', profileId: 'farming' },
  { id: 'g-his-palace', name: '宫斗', color: '#dc2626', icon: '👑', gradient: 'from-red-500 to-rose-600', description: '后宫争斗，权谋算计', category: 'historical', audience: 'female', profileId: 'palace' },
  { id: 'g-his-family', name: '宅斗', color: '#b91c1c', icon: '🏠', gradient: 'from-red-600 to-rose-700', description: '家族内斗，嫡庶之争', category: 'historical', audience: 'female', profileId: 'palace' },

  // ==================== 科幻末世 ====================
  { id: 'g-sci-scifi', name: '科幻', color: '#06b6d4', icon: '🚀', gradient: 'from-cyan-500 to-blue-600', description: '未来世界，科技想象', category: 'scifi', audience: 'general', profileId: 'scifi' },
  { id: 'g-sci-space', name: '星际', color: '#0ea5e9', icon: '🌌', gradient: 'from-sky-500 to-blue-600', description: '星际文明，星辰大海', category: 'scifi', audience: 'general', profileId: 'scifi' },
  { id: 'g-sci-mecha', name: '机甲', color: '#64748b', icon: '🤖', gradient: 'from-slate-500 to-blue-700', description: '机甲驾驶，钢铁对决', category: 'scifi', audience: 'male', profileId: 'scifi' },
  { id: 'g-sci-apocalypse', name: '末世', color: '#84cc16', icon: '☢️', gradient: 'from-lime-500 to-green-600', description: '末日降临，生存挣扎', category: 'scifi', audience: 'general', profileId: 'apocalypse' },
  { id: 'g-sci-wasteland', name: '废土', color: '#a3e635', icon: '🏜️', gradient: 'from-lime-400 to-emerald-500', description: '文明废墟，资源争夺', category: 'scifi', audience: 'male', profileId: 'apocalypse' },
  { id: 'g-fan-shenghua', name: '生化', color: '#84cc16', icon: '🦠', gradient: 'from-lime-500 to-green-600', description: '病毒肆虐，变异横行', category: 'scifi', audience: 'male', profileId: 'apocalypse' },
  { id: 'g-sci-cyber', name: '赛博朋克', color: '#22d3ee', icon: '🦾', gradient: 'from-cyan-400 to-blue-500', description: '高科技低生活', category: 'scifi', audience: 'general', profileId: 'scifi' },
  { id: 'g-sci-time', name: '时间旅行', color: '#0ea5e9', icon: '⏰', gradient: 'from-sky-400 to-blue-500', description: '时间循环，因果悖论', category: 'scifi', audience: 'general', profileId: 'scifi' },
  { id: 'g-sci-robot', name: '机器人', color: '#94a3b8', icon: '🔩', gradient: 'from-gray-300 to-slate-400', description: '机械觉醒，情感萌芽', category: 'scifi', audience: 'general', profileId: 'scifi' },
  { id: 'g-sci-alien', name: '外星文明', color: '#a855f7', icon: '👽', gradient: 'from-purple-500 to-fuchsia-600', description: '异星来客，文明碰撞', category: 'scifi', audience: 'general', profileId: 'scifi' },
  { id: 'g-sci-dystopia', name: '反乌托邦', color: '#475569', icon: '⚠️', gradient: 'from-slate-600 to-gray-700', description: '压抑社会，绝望未来', category: 'scifi', audience: 'general', profileId: 'scifi' },

  // ==================== 悬疑灵异 ====================
  { id: 'g-mys-suspense', name: '悬疑', color: '#64748b', icon: '🔍', gradient: 'from-slate-500 to-gray-600', description: '迷雾重重，层层推理', category: 'mystery', audience: 'general', profileId: 'mystery' },
  { id: 'g-mys-detective', name: '推理', color: '#475569', icon: '🕵️', gradient: 'from-slate-600 to-zinc-700', description: '逻辑推理，智慧博弈', category: 'mystery', audience: 'general', profileId: 'mystery' },
  { id: 'g-mys-crime', name: '刑侦', color: '#1d4ed8', icon: '🚔', gradient: 'from-blue-700 to-slate-700', description: '警队办案，追凶缉恶', category: 'mystery', audience: 'general', profileId: 'mystery' },
  { id: 'g-mys-thriller', name: '惊悚', color: '#1e293b', icon: '😱', gradient: 'from-gray-700 to-slate-800', description: '紧张氛围，心跳加速', category: 'mystery', audience: 'general', profileId: 'mystery' },
  { id: 'g-mys-horror', name: '恐怖', color: '#450a0a', icon: '🩸', gradient: 'from-red-950 to-stone-950', description: '直面恐惧，逃生本能', category: 'mystery', audience: 'general', profileId: 'supernatural' },
  { id: 'g-mys-supernatural', name: '灵异', color: '#7c2d12', icon: '🌙', gradient: 'from-orange-900 to-red-900', description: '鬼神传说，阴阳两界', category: 'mystery', audience: 'general', profileId: 'supernatural' },
  { id: 'g-mys-tomb', name: '盗墓', color: '#44403c', icon: '🪦', gradient: 'from-stone-700 to-amber-900', description: '古墓机关，倒斗探秘', category: 'mystery', audience: 'male', profileId: 'supernatural' },
  { id: 'g-mys-escape', name: '逃生', color: '#dc2626', icon: '🚪', gradient: 'from-red-600 to-orange-700', description: '密室逃脱，绝处逢生', category: 'mystery', audience: 'general', profileId: 'infinite' },

  // ==================== 游戏竞技 ====================
  { id: 'g-gam-game', name: '网游', color: '#8b5cf6', icon: '🕹️', gradient: 'from-violet-500 to-purple-600', description: '虚拟世界，游戏人生', category: 'game', audience: 'male', profileId: 'esports' },
  { id: 'g-gam-esports', name: '电竞', color: '#6366f1', icon: '🏆', gradient: 'from-indigo-500 to-blue-600', description: '电子竞技，巅峰对决', category: 'game', audience: 'general', profileId: 'esports' },
  { id: 'g-gam-stream', name: '直播', color: '#f59e0b', icon: '📺', gradient: 'from-amber-400 to-orange-500', description: '实时互动，舆论反转', category: 'game', audience: 'general', profileId: 'livestream' },
  { id: 'g-gam-entertainment', name: '娱乐圈', color: '#ec4899', icon: '🎭', gradient: 'from-pink-500 to-rose-500', description: '星光璀璨，名利场', category: 'game', audience: 'general', profileId: 'urban' },
  { id: 'g-urb-sports', name: '体育竞技', color: '#3b82f6', icon: '⚽', gradient: 'from-blue-500 to-indigo-600', description: '赛场热血，挑战极限', category: 'game', audience: 'male', profileId: 'esports' },

  // ==================== 军事谍战 ====================
  { id: 'g-mil-military', name: '军旅', color: '#15803d', icon: '🪖', gradient: 'from-green-600 to-emerald-700', description: '铁血军营，战友深情', category: 'military', audience: 'male' },
  { id: 'g-mil-special', name: '特种兵', color: '#166534', icon: '🗡️', gradient: 'from-green-700 to-emerald-800', description: '特种作战，王者之师', category: 'military', audience: 'male' },
  { id: 'g-his-warfare', name: '战争', color: '#991b1b', icon: '💥', gradient: 'from-red-700 to-orange-800', description: '金戈铁马，硝烟战火', category: 'military', audience: 'male' },
  { id: 'g-mil-naval', name: '海军', color: '#0ea5e9', icon: '⚓', gradient: 'from-sky-500 to-blue-600', description: '战舰巨炮，征服海洋', category: 'military', audience: 'male' },
  { id: 'g-mil-air', name: '空军', color: '#3b82f6', icon: '✈️', gradient: 'from-blue-500 to-indigo-600', description: '鹰击长空，翱翔天际', category: 'military', audience: 'male' },
  { id: 'g-oth-spy', name: '谍战', color: '#374151', icon: '🕶️', gradient: 'from-gray-600 to-slate-700', description: '身份博弈，刀锋潜伏', category: 'military', audience: 'general', profileId: 'espionage' },

  // ==================== 衍生同人 ====================
  { id: 'g-der-fanfic', name: '同人', color: '#be185d', icon: '📝', gradient: 'from-pink-600 to-rose-700', description: '经典再创，情怀延续', category: 'derivative', audience: 'general' },
  { id: 'g-der-crossover', name: '综漫', color: '#7c3aed', icon: '🌐', gradient: 'from-violet-600 to-indigo-700', description: '多世界联动，无限可能', category: 'derivative', audience: 'male' },
  { id: 'g-der-acg', name: '二次元', color: '#2563eb', icon: '📖', gradient: 'from-blue-500 to-indigo-600', description: '轻快日常，二次元风味', category: 'derivative', audience: 'general' },
  { id: 'g-der-hk', name: '港综', color: '#b91c1c', icon: '🎬', gradient: 'from-red-700 to-amber-700', description: '港片世界，风云再起', category: 'derivative', audience: 'male' },
  { id: 'g-der-comics', name: '美漫', color: '#1d4ed8', icon: '🦸', gradient: 'from-blue-700 to-red-600', description: '超级英雄宇宙', category: 'derivative', audience: 'male' },
];
