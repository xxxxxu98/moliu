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
  // ==================== 玄幻仙侠类 ====================
  { id: 'g-fan-xiuxian', name: '修仙', color: '#6366f1', icon: '⚡', gradient: 'from-indigo-500 to-purple-600', description: '仙侠世界，飞升成仙' },
  { id: 'g-fan-xuanhuan', name: '玄幻', color: '#8b5cf6', icon: '🔥', gradient: 'from-purple-500 to-pink-600', description: '异世大陆，热血冒险' },
  { id: 'g-fan-qihuan', name: '奇幻', color: '#a855f7', icon: '🧙', gradient: 'from-violet-500 to-purple-600', description: '魔法世界，奇迹之地' },
  { id: 'g-fan-honghuang', name: '洪荒', color: '#9333ea', icon: '🌋', gradient: 'from-fuchsia-500 to-purple-600', description: '上古神话，蛮荒时代' },
  { id: 'g-fan-wuxia', name: '武侠', color: '#10b981', icon: '⚔️', gradient: 'from-emerald-500 to-teal-600', description: '江湖侠义，刀光剑影' },
  { id: 'g-fan-xianxia', name: '仙侠', color: '#7c3aed', icon: '🌟', gradient: 'from-violet-600 to-indigo-600', description: '仙剑奇缘，御剑飞行' },
  { id: 'g-fan-douga', name: '斗气', color: '#ec4899', icon: '💥', gradient: 'from-pink-500 to-rose-600', description: '斗气化翼，逆天改命' },
  { id: 'g-fan-dungeon', name: '地牢', color: '#64748b', icon: '🏰', gradient: 'from-slate-500 to-gray-600', description: '地牢探险，资源争夺' },
  { id: 'g-fan-shenghua', name: '生化', color: '#84cc16', icon: '🦠', gradient: 'from-lime-500 to-green-600', description: '病毒肆虐，变异横行' },
  { id: 'g-fan-zhuiyi', name: '追忆', color: '#06b6d4', icon: '⏳', gradient: 'from-cyan-500 to-blue-600', description: '时空穿梭，往事重演' },
  { id: 'g-fan-shenshi', name: '绅士', color: '#f43f5e', icon: '🎭', gradient: 'from-rose-500 to-pink-600', description: '绅士视角，暧昧邂逅' },

  // ==================== 都市现实类 ====================
  { id: 'g-urb-general', name: '都市', color: '#ec4899', icon: '🌆', gradient: 'from-pink-500 to-rose-600', description: '现代都市，生活百态' },
  { id: 'g-urb-career', name: '职场', color: '#f43f5e', icon: '💼', gradient: 'from-rose-500 to-pink-600', description: '职场风云，拼搏奋斗' },
  { id: 'g-urb-campus', name: '校园', color: '#f97316', icon: '🎓', gradient: 'from-orange-500 to-amber-600', description: '青春校园，青涩回忆' },
  { id: 'g-urb-romance', name: '言情', color: '#f472b6', icon: '💕', gradient: 'from-pink-400 to-rose-500', description: '爱恨情仇，缠绵悱恻' },
  { id: 'g-urb-ceo', name: '总裁', color: '#db2777', icon: '👔', gradient: 'from-pink-600 to-rose-600', description: '豪门总裁，霸道宠溺' },
  { id: 'g-urb-sweet', name: '甜宠', color: '#fb7185', icon: '🍬', gradient: 'from-rose-400 to-pink-500', description: '甜蜜温馨，宠溺无度' },
  { id: 'g-urb-medic', name: '医疗', color: '#14b8a6', icon: '💉', gradient: 'from-teal-500 to-cyan-600', description: '医院风云，悬壶济世' },
  { id: 'g-urb-food', name: '美食', color: '#eab308', icon: '🍳', gradient: 'from-yellow-500 to-amber-600', description: '烹饪人生，舌尖上的故事' },
  { id: 'g-urb-music', name: '音乐', color: '#a855f7', icon: '🎵', gradient: 'from-violet-500 to-purple-600', description: '音符跳动，梦想启航' },
  { id: 'g-urb-sports', name: '运动', color: '#3b82f6', icon: '⚽', gradient: 'from-blue-500 to-indigo-600', description: '竞技体育，热血青春' },
  { id: 'g-urb-technology', name: '科技', color: '#6366f1', icon: '💻', gradient: 'from-indigo-500 to-blue-600', description: '科技创业，改变世界' },

  // ==================== 科幻未来类 ====================
  { id: 'g-sci-scifi', name: '科幻', color: '#06b6d4', icon: '🚀', gradient: 'from-cyan-500 to-blue-600', description: '未来世界，星际探索' },
  { id: 'g-sci-space', name: '星际', color: '#0ea5e9', icon: '🌌', gradient: 'from-sky-500 to-blue-600', description: '星际文明，星辰大海' },
  { id: 'g-sci-apocalypse', name: '末世', color: '#84cc16', icon: '☢️', gradient: 'from-lime-500 to-green-600', description: '末日降临，生存挣扎' },
  { id: 'g-sci-wasteland', name: '废土', color: '#a3e635', icon: '🏜️', gradient: 'from-lime-400 to-emerald-500', description: '废土世界，资源争夺' },
  { id: 'g-sci-cyber', name: '赛博朋克', color: '#22d3ee', icon: '🤖', gradient: 'from-cyan-400 to-blue-500', description: '赛博世界，高科技低生活' },
  { id: 'g-sci-virtual', name: '虚拟现实', color: '#818cf8', icon: '🕶️', gradient: 'from-indigo-400 to-purple-500', description: '虚拟世界，真假难辨' },
  { id: 'g-sci-dystopia', name: '反乌托邦', color: '#475569', icon: '⚠️', gradient: 'from-slate-600 to-gray-700', description: '压抑社会，绝望未来' },
  { id: 'g-sci-time', name: '时间旅行', color: '#0ea5e9', icon: '⏰', gradient: 'from-sky-400 to-blue-500', description: '穿越时空，命运交织' },
  { id: 'g-sci-robot', name: '机器人', color: '#e2e8f0', icon: '🦾', gradient: 'from-gray-300 to-slate-400', description: '机械觉醒，情感萌芽' },
  { id: 'g-sci-alien', name: '外星文明', color: '#a855f7', icon: '👽', gradient: 'from-purple-500 to-fuchsia-600', description: '异星来客，文明碰撞' },

  // ==================== 悬疑惊悚类 ====================
  { id: 'g-mys-suspense', name: '悬疑', color: '#64748b', icon: '🔍', gradient: 'from-slate-500 to-gray-600', description: '迷雾重重，层层推理' },
  { id: 'g-mys-detective', name: '推理', color: '#475569', icon: '🕵️', gradient: 'from-slate-600 to-zinc-700', description: '逻辑推理，智慧博弈' },
  { id: 'g-mys-thriller', name: '惊悚', color: '#1e293b', icon: '👻', gradient: 'from-gray-700 to-slate-800', description: '恐怖氛围，心跳加速' },
  { id: 'g-mys-horror', name: '恐怖', color: '#450a0a', icon: '🩸', gradient: 'from-red-950 to-stone-950', description: '直面恐惧，逃生本能' },
  { id: 'g-mys-supernatural', name: '灵异', color: '#7c2d12', icon: '🌙', gradient: 'from-orange-900 to-red-900', description: '鬼神传说，阴阳两界' },
  { id: 'g-mys-conspiracy', name: '阴谋论', color: '#374151', icon: '🎬', gradient: 'from-gray-700 to-zinc-800', description: '隐藏真相，权力核心' },
  { id: 'g-mys-escape', name: '逃生', color: '#dc2626', icon: '🚪', gradient: 'from-red-600 to-orange-700', description: '密室逃脱，绝处逢生' },

  // ==================== 历史穿越类 ====================
  { id: 'g-his-history', name: '历史', color: '#f59e0b', icon: '🏯', gradient: 'from-amber-500 to-orange-600', description: '古代王朝，风云变幻' },
  { id: 'g-his-timeless', name: '穿越', color: '#ea580c', icon: '🌀', gradient: 'from-orange-500 to-red-600', description: '时空交错，命运改变' },
  { id: 'g-his-farming', name: '种田', color: '#65a30d', icon: '🌾', gradient: 'from-green-500 to-emerald-600', description: '田园生活，悠然自得' },
  { id: 'g-his-palace', name: '宫斗', color: '#dc2626', icon: '👑', gradient: 'from-red-500 to-rose-600', description: '后宫争斗，权谋算计' },
  { id: 'g-his-family', name: '宅斗', color: '#b91c1c', icon: '🏠', gradient: 'from-red-600 to-rose-700', description: '家族内斗，嫡庶之争' },
  { id: 'g-his-warfare', name: '战争', color: '#991b1b', icon: '⚔️', gradient: 'from-red-700 to-orange-800', description: '金戈铁马，气吞山河' },
  { id: 'g-his-western', name: '西方奇幻', color: '#7c3aed', icon: '🛡️', gradient: 'from-violet-600 to-indigo-700', description: '骑士魔法，城堡王国' },
  { id: 'g-his-ancient', name: '上古神话', color: '#92400e', icon: '📜', gradient: 'from-amber-700 to-orange-800', description: '诸神之战，命运预言' },

  // ==================== 竞技游戏类 ====================
  { id: 'g-gam-game', name: '游戏', color: '#8b5cf6', icon: '🎮', gradient: 'from-violet-500 to-purple-600', description: '虚拟世界，游戏人生' },
  { id: 'g-gam-esports', name: '电竞', color: '#6366f1', icon: '🏆', gradient: 'from-indigo-500 to-blue-600', description: '电子竞技，巅峰对决' },
  { id: 'g-gam-stream', name: '直播', color: '#f59e0b', icon: '📺', gradient: 'from-amber-400 to-orange-500', description: '直播网红，粉丝经济' },
  { id: 'g-gam-entertainment', name: '娱乐', color: '#ec4899', icon: '🎭', gradient: 'from-pink-500 to-rose-500', description: '娱乐圈，星光璀璨' },
  { id: 'g-gam-novel', name: '轻小说', color: '#2563eb', icon: '📖', gradient: 'from-blue-500 to-indigo-600', description: '轻松阅读，愉悦享受' },
  { id: 'g-gam-webnovel', name: '网文', color: '#f43f5e', icon: '📝', gradient: 'from-rose-500 to-pink-600', description: '网络文学，天马行空' },

  // ==================== 军旅战争类 ====================
  { id: 'g-mil-military', name: '军旅', color: '#15803d', icon: '🎖️', gradient: 'from-green-600 to-emerald-700', description: '铁血军营，战友深情' },
  { id: 'g-mil-battle', name: '战争', color: '#991b1b', icon: '💥', gradient: 'from-red-700 to-orange-800', description: '硝烟弥漫，战火纷飞' },
  { id: 'g-mil-special', name: '特种兵', color: '#166534', icon: '🗡️', gradient: 'from-green-700 to-emerald-800', description: '特种作战，王者之师' },
  { id: 'g-mil-naval', name: '海军', color: '#0ea5e9', icon: '⚓', gradient: 'from-sky-500 to-blue-600', description: '战舰巨炮，征服海洋' },
  { id: 'g-mil-air', name: '空军', color: '#3b82f6', icon: '✈️', gradient: 'from-blue-500 to-indigo-600', description: '鹰击长空，翱翔天际' },

  // ==================== 衍生同人类 ====================
  { id: 'g-der-fanfic', name: '同人', color: '#be185d', icon: '📝', gradient: 'from-pink-600 to-rose-700', description: '经典再创，情怀延续' },
  { id: 'g-der-derivative', name: '衍生', color: '#9d174d', icon: '🔄', gradient: 'from-rose-600 to-pink-700', description: '世界衍生，创意拓展' },
  { id: 'g-der-crossover', name: '综漫', color: '#7c3aed', icon: '🌐', gradient: 'from-violet-600 to-indigo-700', description: '多世界联动，无限可能' },
  { id: 'g-der-game', name: '游戏世界', color: '#06b6d4', icon: '🎲', gradient: 'from-cyan-500 to-blue-600', description: '全息游戏，现实融合' },

  // ==================== 其他类型 ====================
  { id: 'g-oth-fable', name: '寓言', color: '#84cc16', icon: '🦊', gradient: 'from-lime-500 to-green-600', description: '动物世界，人生哲理' },
  { id: 'g-oth-western', name: '西部', color: '#d97706', icon: '🤠', gradient: 'from-amber-600 to-orange-700', description: '狂野西部，牛仔生涯' },
  { id: 'g-oth-spy', name: '间谍', color: '#374151', icon: '🕶️', gradient: 'from-gray-600 to-slate-700', description: '暗战无声，致命任务' },
  { id: 'g-oth-heist', name: '盗窃', color: '#4b5563', icon: '💎', gradient: 'from-gray-500 to-zinc-600', description: '惊天大案，钻石盛宴' },
  { id: 'g-oth-legal', name: '律政', color: '#1e40af', icon: '⚖️', gradient: 'from-blue-700 to-indigo-800', description: '法庭激辩，正义审判' },
  { id: 'g-oth-sports', name: '竞技', color: '#dc2626', icon: '🏅', gradient: 'from-red-600 to-orange-700', description: '挑战极限，突破自我' },
];

export const settingElements: SettingElementConfig[] = [
  // ==================== 主角特质类 ====================
  // 身份设定
  { id: 'e-chr-identity-commoner', name: '资质平平', icon: '💫', description: '起点低，逆袭空间大', category: 'character' },
  { id: 'e-chr-identity-genius', name: '天才流', icon: '⭐', description: '天赋异禀，碾压众人', category: 'character' },
  { id: 'e-chr-identity-trash', name: '废物流', icon: '🌱', description: '被低估的隐藏天才', category: 'character' },
  { id: 'e-chr-identity-royal', name: '皇子/贵族', icon: '👑', description: '出身尊贵，身份显赫', category: 'character' },
  { id: 'e-chr-identity-slave', name: '奴隶/下人', icon: '⛓️', description: '身份卑微，绝境求生', category: 'character' },
  { id: 'e-chr-identity-disguised', name: '身份伪装', icon: '🎭', description: '隐藏真实身份生活', category: 'character' },

  // 特殊体质
  { id: 'e-chr-blood-hidden', name: '隐藏血脉', icon: '🩸', description: '特殊血统，潜力无限', category: 'character' },
  { id: 'e-chr-body-possessed', name: '被附身', icon: '👻', description: '体内藏着另一个存在', category: 'character' },
  { id: 'e-chr-body-illness', name: '体弱多病', icon: '🤒', description: '身体缺陷，需特殊方式变强', category: 'character' },
  { id: 'e-chr-body-immortal', name: '不死之身', icon: '💀', description: '拥有不死能力', category: 'character' },
  { id: 'e-chr-body-mechanical', name: '机械改造', icon: '🦾', description: '部分身体被机械替换', category: 'character' },

  // 成长方式
  { id: 'e-chr-growth-mentor', name: '神秘导师', icon: '👴', description: '金手指引导，快速成长', category: 'character' },
  { id: 'e-chr-growth-system', name: '系统流', icon: '🎮', description: '游戏化设定，任务驱动', category: 'character' },
  { id: 'e-chr-growth-awaken', name: '传承觉醒', icon: '💥', description: '获得传承，实力暴涨', category: 'character' },
  { id: 'e-chr-growth-selfmade', name: '自学成才', icon: '📚', description: '无师自通，厚积薄发', category: 'character' },
  { id: 'e-chr-growth-drug', name: '嗑药升级', icon: '💊', description: '丹药辅助，快速突破', category: 'character' },

  // 身份背景
  { id: 'e-chr-bg-reborn', name: '重生者', icon: '⏰', description: '知晓未来，改变命运', category: 'character' },
  { id: 'e-chr-bg-transmigrate', name: '穿越者', icon: '🌀', description: '异世来客，独具优势', category: 'character' },
  { id: 'e-chr-bg-amnesia', name: '失忆设定', icon: '❓', description: '身世成谜，慢慢揭开', category: 'character' },
  { id: 'e-chr-bg-disowned', name: '被退婚/休妻', icon: '📜', description: '经典冲突，激发斗志', category: 'character' },
  { id: 'e-chr-bg-orphan', name: '孤儿出身', icon: '🏚️', description: '无依无靠，独立成长', category: 'character' },
  { id: 'e-chr-bg-fugitive', name: '亡命天涯', icon: '🏃', description: '被追杀，四处逃亡', category: 'character' },

  // 性格特质
  { id: 'e-chr-per-splitted', name: '双重人格', icon: '😈', description: '人格切换，性格反差', category: 'character' },
  { id: 'e-chr-per-cunning', name: '腹黑深沉', icon: '🦊', description: '城府极深，心机深沉', category: 'character' },
  { id: 'e-chr-per-kind', name: '善良正直', icon: '🌟', description: '心怀正义，不忘初心', category: 'character' },
  { id: 'e-chr-per-cold', name: '冷酷无情', icon: '🧊', description: '杀伐果断，不近人情', category: 'character' },
  { id: 'e-chr-per-playboy', name: '风流多情', icon: '💋', description: '桃花不断，情债难还', category: 'character' },
  { id: 'e-chr-per-loyal', name: '忠诚专一', icon: '💎', description: '深情不渝，至死不悔', category: 'character' },

  // 伴侣设定
  { id: 'e-chr-mate-ceo', name: '总裁/大佬', icon: '👔', description: '霸道总裁，宠溺无度', category: 'character' },
  { id: 'e-chr-mate-schoolflower', name: '校花/学霸', icon: '🌸', description: '才貌双全，令人倾心', category: 'character' },
  { id: 'e-chr-mate-childhood', name: '青梅竹马', icon: '🎀', description: '从小相识，感情深厚', category: 'character' },
  { id: 'e-chr-mate-master', name: '师尊/师父', icon: '🧘', description: '亦师亦友，引领成长', category: 'character' },
  { id: 'e-chr-mate-demon', name: '妖女/魔女', icon: '😈', description: '妩媚动人，危险诱惑', category: 'character' },
  { id: 'e-chr-mate-gentle', name: '温柔贤惠', icon: '🕊️', description: '善解人意，温婉可人', category: 'character' },
  { id: 'e-chr-mate-strong', name: '女强人', icon: '💪', description: '独立自强，不让须眉', category: 'character' },

  // 伙伴/宠物
  { id: 'e-chr-companion-pet', name: '萌宠/灵兽', icon: '🐉', description: '可爱搭档，共同冒险', category: 'character' },
  { id: 'e-chr-companion-brother', name: '结义兄弟', icon: '🤝', description: '生死之交，义薄云天', category: 'character' },
  { id: 'e-chr-companion-subordinate', name: '收小弟', icon: '👥', description: '小弟追随，势力扩张', category: 'character' },
  { id: 'e-chr-companion-ai', name: 'AI助手', icon: '🤖', description: '智能伙伴，科技辅助', category: 'character' },

  // ==================== 剧情元素类 ====================
  // 经典冲突
  { id: 'e-plt-class-test', name: '家族测试', icon: '📊', description: '展示实力的舞台', category: 'plot' },
  { id: 'e-plt-humiliate', name: '退婚羞辱', icon: '💔', description: '经典冲突，激发斗志', category: 'plot' },
  { id: 'e-plt-revenge', name: '逆袭打脸', icon: '👏', description: '华丽反转，扬眉吐气', category: 'plot' },
  { id: 'e-plt-destruction', name: '灭门惨案', icon: '🔥', description: '血海深仇，必报之仇', category: 'plot' },
  { id: 'e-plt-betrayal', name: '背叛陷害', icon: '🗡️', description: '人心叵测，绝地反击', category: 'plot' },
  { id: 'e-plt-crush', name: '暗恋追求', icon: '💕', description: '苦苦追求，终成眷属', category: 'plot' },
  { id: 'e-plt-misunderstanding', name: '误会重重', icon: '😤', description: '阴差阳错，虐心纠葛', category: 'plot' },
  { id: 'e-plt-love-triangle', name: '三角恋', icon: '💢', description: '剪不断，理还乱', category: 'plot' },
  { id: 'e-plt-expose', name: '身世曝光', icon: '📢', description: '隐藏身份被揭露', category: 'plot' },
  { id: 'e-plt-identity-quest', name: '身世之谜', icon: '🔮', description: '隐藏真相，逐步揭开', category: 'plot' },

  // 冒险历练
  { id: 'e-plt-secret-realm', name: '秘境探险', icon: '🗺️', description: '危险与机遇并存', category: 'plot' },
  { id: 'e-plt-tournament', name: '宗门大比', icon: '🏆', description: '实力比拼，一战成名', category: 'plot' },
  { id: 'e-plt-quest', name: '奇遇连连', icon: '✨', description: '意外收获，不断突破', category: 'plot' },
  { id: 'e-plt-dungeon', name: '地牢副本', icon: '🏰', description: '团队协作，攻略副本', category: 'plot' },
  { id: 'e-plt-boss', name: 'BOSS战', icon: '👹', description: '惊天大战，生死存亡', category: 'plot' },
  { id: 'e-plt-treasure', name: '夺宝奇兵', icon: '💎', description: '奇珍异宝，争夺大战', category: 'plot' },

  // 势力发展
  { id: 'e-plt-power-rise', name: '势力崛起', icon: '📈', description: '从小到大，称霸一方', category: 'plot' },
  { id: 'e-plt-sect-rise', name: '宗门崛起', icon: '🏯', description: '势力发展，版图扩张', category: 'plot' },
  { id: 'e-plt-conquest', name: '开疆扩土', icon: '🗡️', description: '征服天下，建立帝国', category: 'plot' },
  { id: 'e-plt-rebellion', name: '揭竿而起', icon: '🚩', description: '推翻暴政，改朝换代', category: 'plot' },

  // 情感纠葛
  { id: 'e-plt-romance', name: '红颜知己', icon: '💕', description: '情感纠葛，缠绵悱恻', category: 'plot' },
  { id: 'e-plt-brotherhood', name: '兄弟情义', icon: '🤝', description: '生死之交，患难与共', category: 'plot' },
  { id: 'e-plt-mentor', name: '师徒情深', icon: '🙏', description: '传道授业，恩重如山', category: 'plot' },
  { id: 'e-plt-family', name: '家族羁绊', icon: '👨‍👩‍👧', description: '血脉相连，命运纠葛', category: 'plot' },
  { id: 'e-plt-redemption', name: '救赎之旅', icon: '🕊️', description: '弥补过错，获得救赎', category: 'plot' },

  // ==================== 世界观类 ====================
  // 世界类型
  { id: 'e-wld-realm-rise', name: '宗门崛起', icon: '🏯', description: '修仙门派林立', category: 'world' },
  { id: 'e-wld-star-war', name: '星际争霸', icon: '🌌', description: '宇宙文明，星辰大海', category: 'world' },
  { id: 'e-wld-dimension', name: '穿越异界', icon: '🌀', description: '跨时空冒险，新世界探索', category: 'world' },
  { id: 'e-wld-apocalypse', name: '末日生存', icon: '☢️', description: '绝境求生，资源争夺', category: 'world' },
  { id: 'e-wld-urban-cult', name: '都市修仙', icon: '🌃', description: '现代都市，灵气复苏', category: 'world' },
  { id: 'e-wld-game-world', name: '游戏世界', icon: '🎲', description: '虚拟现实，沉浸体验', category: 'world' },
  { id: 'e-wld-wasteland', name: '废土末世', icon: '🏚️', description: '文明废墟，重建家园', category: 'world' },
  { id: 'e-wld-magic-academy', name: '魔法学院', icon: '🏰', description: '奇幻校园，学习魔法', category: 'world' },
  { id: 'e-wld-cyber-city', name: '赛博都市', icon: '🤖', description: '高科技与低生活的碰撞', category: 'world' },
  { id: 'e-wld-ancient-kingdom', name: '古代王朝', icon: '👑', description: '封建社会，皇权至上', category: 'world' },
  { id: 'e-wld-jianghu', name: '江湖武林', icon: '⚔️', description: '武林门派，刀光剑影', category: 'world' },
  { id: 'e-wld-deep-sea', name: '深海异界', icon: '🐚', description: '海底世界，未知探索', category: 'world' },
  { id: 'e-wld-alien', name: '异星殖民', icon: '🪐', description: '外星领地，艰难开拓', category: 'world' },
  { id: 'e-wld-awakening', name: '灵气复苏', icon: '✨', description: '天地异变，修炼重来', category: 'world' },
  { id: 'e-wld-alternative', name: '平行世界', icon: '🔀', description: '另一个我，另一种可能', category: 'world' },
  { id: 'e-wld-dreamscape', name: '梦境世界', icon: '💭', description: '梦境与现实的边界', category: 'world' },
  { id: 'e-wld-void', name: '虚空裂缝', icon: '🕳️', description: '时空裂隙，危险降临', category: 'world' },

  // 社会形态
  { id: 'e-wld-soc-feudal', name: '封建制度', icon: '🏛️', description: '等级森严，贵贱分明', category: 'world' },
  { id: 'e-wld-soc-republic', name: '共和制度', icon: '🗳️', description: '议会民主，共同治理', category: 'world' },
  { id: 'e-wld-soc-tribe', name: '部落社会', icon: '🏕️', description: '原始部落，强者为尊', category: 'world' },
  { id: 'e-wld-soc-corporate', name: '企业统治', icon: '🏢', description: '财阀当道，资本为王', category: 'world' },
  { id: 'e-wld-soc-anarchy', name: '无政府', icon: '🔥', description: '秩序崩塌，强者生存', category: 'world' },

  // ==================== 核心冲突类 ====================
  // 阵营对立
  { id: 'e-cfl-good-evil', name: '正邪对立', icon: '☯️', description: '光明与黑暗的永恒之战', category: 'conflict' },
  { id: 'e-cfl-faction-war', name: '门派之争', icon: '⚔️', description: '不同势力的生存博弈', category: 'conflict' },
  { id: 'e-cfl-race-war', name: '种族矛盾', icon: '🐉', description: '人与异族的生存冲突', category: 'conflict' },
  { id: 'e-cfl-class-war', name: '阶级对抗', icon: '📊', description: '贫富差距，阶层固化', category: 'conflict' },

  // 权力斗争
  { id: 'e-cfl-throne', name: '权力斗争', icon: '👑', description: '皇位争夺，权谋算计', category: 'conflict' },
  { id: 'e-cfl-succession', name: '继承人之争', icon: '📜', description: '家业传承，明争暗斗', category: 'conflict' },
  { id: 'e-cfl-corporate-war', name: '商战博弈', icon: '💼', description: '商业帝国，逐鹿中原', category: 'conflict' },

  // 情感冲突
  { id: 'e-cfl-love-hate', name: '爱恨情仇', icon: '💔', description: '情感的纠葛与抉择', category: 'conflict' },
  { id: 'e-cfl-moral', name: '道义抉择', icon: '⚖️', description: '在正义与情义间徘徊', category: 'conflict' },
  { id: 'e-cfl-identity', name: '身份认同', icon: '🎭', description: '自我认知的迷茫与突破', category: 'conflict' },

  // 生死危机
  { id: 'e-cfl-survival', name: '生存危机', icon: '💀', description: '生死存亡的极限挑战', category: 'conflict' },
  { id: 'e-cfl-blood-feud', name: '世代仇恨', icon: '🩸', description: '家族恩怨，世代相传', category: 'conflict' },
  { id: 'e-cfl-prophecy', name: '命运预言', icon: '📜', description: '命中注定的劫难', category: 'conflict' },
  { id: 'e-cfl-faith', name: '理想信念', icon: '🌟', description: '坚持初心还是随波逐流', category: 'conflict' },
  { id: 'e-cfl-revenge', name: '复仇之路', icon: '⚔️', description: '血债血偿，以牙还牙', category: 'conflict' },

  // 终极对决
  { id: 'e-cfl-final-battle', name: '终极之战', icon: '💥', description: '决定世界命运的一战', category: 'conflict' },
  { id: 'e-cfl-sacrifice', name: '牺牲救赎', icon: '🕯️', description: '以我之命，换你平安', category: 'conflict' },
  { id: 'e-cfl-redemption', name: '自我救赎', icon: '🌅', description: '战胜心魔，获得解脱', category: 'conflict' },
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
  // ==================== 玄幻仙侠类 ====================
  {
    id: '1',
    name: '废物流崛起',
    icon: '📚',
    description: '资质平庸的主角在逆境中成长，经历嘲讽与磨难后逆袭成功，热血沸腾的修炼之路',
    prompt: '一个天生废灵根的少年，在家族年度测试中被所有人嘲讽和唾弃。父亲对他失望，兄弟姐妹欺凌他，甚至被未婚妻退婚羞辱。就在他绝望之际，意外在家族禁地获得了上古大能的传承记忆，从此开辟出一条与众不同的修炼之路。以坚韧不拔的意志和对命运的抗争，一步步证明自己的价值，最终成为震慑一方的绝世强者。',
    category: 'fantasy',
    gradient: 'from-indigo-500 to-purple-600',
  },
  {
    id: '2',
    name: '系统流修仙',
    icon: '🎮',
    description: '获得神秘系统的穿越者，在游戏化的修仙世界中快速成长',
    prompt: '现代青年陈轩意外穿越到修仙世界，却没有觉醒任何灵根。就在他以为自己将碌碌无为一生时，脑海中突然出现了一个自称来自未来的超级辅助系统。这个系统不仅能发布任务给予奖励，还能扫描敌人属性、鉴定宝物价值，甚至可以召唤游戏中的技能。在系统的帮助下，陈轩开始了不一样的修仙之路，但系统背后似乎隐藏着不为人知的秘密。',
    category: 'fantasy',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    id: '3',
    name: '剑道至尊',
    icon: '⚔️',
    description: '剑修没落时代的主角获得上古剑仙传承，以剑证道，重振剑道荣光',
    prompt: '在这个法宝为尊、丹道盛行的修仙界，剑修早已没落，被视为不入流的旁门左道。叶尘是落剑宗的外门弟子，觉醒的又是资质最差的风剑灵根，受尽欺凌。一次秘境历练中，他意外进入上古剑仙的洞府，获得了《万剑归宗》传承和一把拥有器灵的绝世神剑。从此他以剑入道，以剑证心，在所有人都不看好的情况下，一剑破万法，成为震惊修仙界的剑道至尊。',
    category: 'fantasy',
    gradient: 'from-slate-500 to-gray-600',
  },
  {
    id: '4',
    name: '洪荒开天',
    icon: '🔥',
    description: '重生到巫妖量劫的洪荒世界，带领巫族在夹缝中求存并崛起',
    prompt: '现代人重生到洪荒世界，成为十二祖巫之一的玄冥。彼时正值巫妖两族争斗最激烈的时代，巫族虽然肉身强横，却被妖族的天庭处处压制。作为祖巫中最年轻的一位，主角深知原本的历史走向——巫妖两败俱伤，双双退出洪荒舞台。为了改变族人的命运，他开始利用先知先觉的优势，带领巫族走出一条全新的道路，同时揭开盘古大神陨落的真正原因。',
    category: 'fantasy',
    gradient: 'from-amber-500 to-red-600',
  },
  {
    id: '5',
    name: '都市修仙',
    icon: '🌃',
    description: '灵气复苏的现代都市，隐藏在普通人中的修仙者',
    prompt: '2024年的国际大都市，表面上是一座繁华的现代化城市，实际上暗流涌动。三年前的一场神秘天象后，空气中开始弥漫微弱的灵气，少数有缘人开始觉醒特殊能力。林墨是一名普通的大公司职员，却在某次意外中激活了沉睡在体内的古老血脉。他发现自己并非普通人，而是上古修真家族的后裔。在城市暗处，有修仙者在暗中较量，有妖兽在都市中潜伏，主角在保护普通人的同时，踏上了一条重返巅峰的修仙之路。',
    category: 'fantasy',
    gradient: 'from-purple-500 to-pink-600',
  },
  {
    id: '6',
    name: '斗气化翼',
    icon: '🦅',
    description: '斗气大陆式的异世修炼，废材少爷的逆天改命传奇',
    prompt: '萧辰是萧家三房的少爷，却因天生斗气属性为最低等的灰色而受尽歧视。十二岁那年，母亲留下一枚神秘的戒指后失踪。在一次家族测试中，他被测出拥有传说中的七彩斗气属性，但这股力量被某种封印压制，只有找到母亲留下的传承才能解开。就在他被逼入绝境时，戒指中的老爷爷苏醒，传授他绝世功法。从此萧辰开始了逆天改命的修炼旅程，从被退婚的废物少爷，一步步成长为震慑大陆的斗帝。',
    category: 'fantasy',
    gradient: 'from-orange-500 to-red-600',
  },

  // ==================== 都市现实类 ====================
  {
    id: '7',
    name: '都市兵王',
    icon: '💂',
    description: '回归都市的特种兵王，纵横职场与战场，保护亲人并揭开身世之谜',
    prompt: '代号"暗影"的特种兵王龙傲天，在完成最后一次任务后选择退役回归都市。表面上他只是一个普通的保安，实际上他曾是让地下势力闻风丧胆的传奇。回到都市后，他本想低调生活，却阴差阳错成为了美女总裁叶轻眉的贴身保镖。在保护她的过程中，龙傲天发现自己与这个城市最神秘的势力有着千丝万缕的联系，而他的身世之谜也逐渐浮出水面。',
    category: 'urban',
    gradient: 'from-slate-600 to-gray-700',
  },
  {
    id: '8',
    name: '重生之商业帝国',
    icon: '💼',
    description: '带着前世记忆重生归来的商业精英，弥补遗憾，打造万亿商业帝国',
    prompt: '商界精英周明在人生最巅峰时刻意外重生回到了大学时代。上一世，他因为太过保守错失了无数机会，眼睁睁看着曾经的对手成为商业巨头，还失去了最爱的女人。这一世，带着十年后商业趋势的记忆和丰富的管理经验，周明发誓要改写人生。他从校园创业开始，一步步布局新能源、人工智能、生物医药等未来风口行业，不仅要打造一个万亿级的商业帝国，更要守护好那些曾经错过的人。',
    category: 'urban',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    id: '9',
    name: '甜宠总裁',
    icon: '💕',
    description: '霸道总裁与独立女性的甜蜜爱情，相互成就的现代都市童话',
    prompt: '苏晴是一个努力上进的职场女性，靠自己的实力在一家知名公司做到了部门经理。顾言琛是空降到公司的CEO，冷酷霸道，杀伐果断。所有人都以为这对新上司和下属会水火不容，却没想到在一次公司危机中，苏晴的冷静和专业让顾言琛刮目相看。一次意外的醉酒，让两人有了亲密接触。从此，顾言琛开始了对苏晴的霸道追求，而苏晴也在与顾言琛的相处中，逐渐打开心防，接受了这份从天而降的爱情。',
    category: 'urban',
    gradient: 'from-pink-400 to-rose-500',
  },
  {
    id: '10',
    name: '天才医生',
    icon: '💉',
    description: '天才医生在现代医院中治病救人，同时揭开医学界的黑暗秘密',
    prompt: '天才外科医生沈墨轩在一次手术中展现出惊人的天赋，被誉为"上帝之手"。然而他表面风光，内心却背负着一个秘密——他的老师三年前在一场本可避免的医疗事故中死去，而这起事故背后似乎隐藏着巨大的阴谋。沈墨轩一边在医院救死扶伤，用精湛的医术赢得患者的爱戴，一边暗中调查老师的死因。随着调查深入，他发现了一个涉及医疗器械采购、学术造假、甚至跨国人体实验的巨大黑幕。',
    category: 'urban',
    gradient: 'from-teal-500 to-cyan-600',
  },
  {
    id: '11',
    name: '美食的俘虏',
    icon: '🍳',
    description: '年轻厨师用美食征服味蕾，用美食治愈人心的温暖故事',
    prompt: '林小雨是一个对美食有着极致追求的年轻厨师，她的梦想是开一家属于自己的餐厅。然而现实是残酷的，父母欠下巨额债务，她不得不同时打三份工来维持生计。就在她快要放弃梦想的时候，意外得到了一本神秘的古籍，里面记载着早已失传的上古美食秘方。这些秘方不仅能让食物变得异常美味，还蕴含着治愈人心的力量。林小雨开始用这些秘方帮助身边的人，同时也逐渐接近自己开餐厅的梦想。',
    category: 'urban',
    gradient: 'from-yellow-500 to-amber-600',
  },
  {
    id: '12',
    name: '医武双绝',
    icon: '🏥',
    description: '古武世家传人在都市行医济世，以武护医，快意恩仇',
    prompt: '秦风是古武世家秦家的继承人，一身医术和武功都已臻化境。按照家族传统，他本应隐居深山修炼，但为了寻找失踪的父亲，他不得不踏入喧嚣都市。在一家私立医院担任医生的同时，他用自己的绝世医术救治了无数疑难杂症患者。然而树欲静而风不止，他的出现引起了都市各方势力的注意。有人想拉拢他，有人想除掉他。秦风以医救人，以武除恶，在都市中闯出一片天地，同时一步步接近父亲失踪的真相。',
    category: 'urban',
    gradient: 'from-emerald-500 to-teal-600',
  },

  // ==================== 科幻未来类 ====================
  {
    id: '13',
    name: '星际探索',
    icon: '🚀',
    description: '人类征服星辰大海的壮阔史诗，发现宇宙深处的文明秘密',
    prompt: '2157年，人类第一支深空殖民舰队"希望号"踏上了前往开普勒-452b星系的旅程。艾伦是舰队的首席科学家，负责探索这颗被天文学家发现的新星球。经历了二十年的星际航行后，舰队终于抵达目的地，却发现这颗看似适宜生存的星球上，存在着一个已经灭亡的高度发达外星文明留下的遗迹。艾伦在研究遗迹的过程中，发现了一个震惊人类的秘密——人类的起源可能与这个消失的文明有关。同时，舰队内部的资源开始紧张，一些人开始动摇，试图改变航程目的地。',
    category: 'scifi',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    id: '14',
    name: '赛博朋克',
    icon: '🤖',
    description: '高科技低生活的未来都市，机械改造与意识觉醒的赛博世界',
    prompt: '2077年的新上海，霓虹灯下是高耸入云的摩天大楼，街道上穿行着各种机械改造人。凯是一个生活在底层的赏金猎人，他的心脏因为一次任务严重受损，不得不换上价格高昂的机械心脏。欠下巨额债务的他不得不为 corporations 工作，却意外卷入了一场针对整座城市的大阴谋。在调查过程中，他发现自己的机械心脏竟然内置了一个神秘的意识程序，而这个意识似乎来自几十年前被"删除"的一个AI先驱。',
    category: 'scifi',
    gradient: 'from-cyan-400 to-blue-500',
  },
  {
    id: '15',
    name: '废土生存',
    icon: '☢️',
    description: '核战后的废土世界，在废墟中挣扎求生，建立新的秩序',
    prompt: '核战争爆发五十年后的地球，大部分地区变成了寸草不生的废土。人类在废墟中建立了零星的聚居点，勉强维持着文明的火种。雷霆是一个从小在废土上长大的孤儿，他靠着过人的生存能力和领袖魅力，在废土上建立了自己的势力范围。然而当他逐渐强大起来时，却发现了一个可怕的真相——当年那场核战争并非意外，而是一场有预谋的清除计划。他决定带领废土上的人类，走出废墟，寻找核战前人类建造的地下避难所，找到重建文明的希望。',
    category: 'scifi',
    gradient: 'from-lime-500 to-green-600',
  },
  {
    id: '16',
    name: '全息游戏',
    icon: '🎮',
    description: '沉浸式虚拟现实游戏世界，游戏与现实的边界逐渐模糊',
    prompt: '2088年，全球最火的虚拟现实游戏《无限世界》正式公测，玩家可以通过神经链接技术完全沉浸在游戏世界中。顾长安是一个资深游戏玩家，他获得了游戏的内测资格，迫不及待地进入了这个据说拥有无限可能的虚拟世界。然而当他和众多玩家深入游戏后，发现这个世界并不像表面上那么简单。游戏中的NPC似乎拥有自我意识，而游戏公司的真正目的似乎也不只是赚钱那么简单。更诡异的是，有玩家在游戏中失踪，现实中的他们陷入了昏迷。',
    category: 'scifi',
    gradient: 'from-indigo-400 to-purple-500',
  },

  // ==================== 悬疑惊悚类 ====================
  {
    id: '17',
    name: '悬疑推理',
    icon: '🔍',
    description: '天才侦探卷入离奇案件，层层迷雾中追寻真相与凶手',
    prompt: '沈夜是一个患有超忆症的天才侧写师，能够记住经历过的每一个细节。他受邀回到家乡，协助调查一系列离奇的连环失踪案。受害者都是年轻女性，她们在失踪前都曾收到过一个神秘包裹。然而随着调查的深入，沈夜发现这些案件竟然与他童年时期的一段痛苦记忆有关。他开始怀疑，有人故意在用这些案件引诱他回来，而目的可能是为了揭露一个埋藏了二十年的惊天秘密。',
    category: 'mystery',
    gradient: 'from-slate-500 to-zinc-600',
  },
  {
    id: '18',
    name: '恐怖灵异',
    icon: '👻',
    description: '普通人意外继承灵异事务所，踏入阴阳两界的边缘',
    prompt: '林远是一个普通的大学毕业生，在找了三个月工作后，终于接受了一家名为"阴阳阁"的小事务所的工作。然而上班第一天他就发现，这家公司处理的竟然是灵异事件。原来老板是一个隐世道士，退休后想找个传人。林远在经历了最初的手忙脚乱后，逐渐适应了这个特殊的工作。他帮助各种被灵异事件困扰的委托人解决问题，在这个过程中发现自己似乎拥有某种特殊的体质。而他继承这个事务所，似乎也与自己的身世有着说不清的关系。',
    category: 'mystery',
    gradient: 'from-purple-500 to-indigo-600',
  },
  {
    id: '19',
    name: '心理罪案',
    icon: '🧠',
    description: '犯罪心理学专家深入罪犯内心，破解高智商犯罪背后的真相',
    prompt: '著名犯罪心理学教授顾言，受警方邀请协助调查一起连环杀人案。凶手作案手法残忍但干净利落，几乎没有留下任何线索。更令人不安的是，每一起案件发生前，都会有一封信寄到警局，上面写满了充满哲学意味的话语。顾言通过对信件的分析，逐渐勾勒出凶手的心理画像——一个表面上可能非常正常甚至优秀的人，内心却有着扭曲的价值观。然而就在案件即将告破时，顾言发现自己的学生中，竟然有人与凶手有着相似的心理特征。',
    category: 'mystery',
    gradient: 'from-gray-600 to-slate-700',
  },

  // ==================== 历史穿越类 ====================
  {
    id: '20',
    name: '回到古代当王爷',
    icon: '👑',
    description: '现代人穿越成废物王爷，用现代知识在古代朝堂翻云覆雨',
    prompt: '历史系研究生李煜在一次考古实习中，意外触发了古墓中的神秘机关，穿越到了古代同名同姓的废物王爷身上。这位王爷是皇帝众多儿子中最不成器的一个，整日花天酒地，名声狼藉。然而李煜穿越后，却发现这个身份虽然看似是累赘，实际上却暗藏机遇。他利用现代知识和历史储备，在这个陌生的朝代步步为营：改革朝政、发展经济、整军经武。同时，他也在这个过程中找到了自己的爱情，与才貌双全的王妃携手共创盛世。',
    category: 'historical',
    gradient: 'from-amber-600 to-orange-600',
  },
  {
    id: '21',
    name: '逃荒种田',
    icon: '🌾',
    description: '穿越到古代灾年，带领村民逃荒求生，最终建立世外桃源',
    prompt: '农学博士田七在一次实验事故中穿越到了古代，却发现自己来到的是一个正在经历百年大旱的北方小村庄。村里颗粒无收，村民们正准备逃荒。田七利用自己的专业知识，带领村民寻找水源、改良土壤、培育抗旱作物。在灾荒中，他不仅让村民们活了下来，还渐渐将这个穷山沟建设成了一个丰收的乐土。他的名声传开后，引来了当地官员的觊觎和山贼的觊觎，田七不得不用智慧和勇气保护自己的家园。',
    category: 'historical',
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    id: '22',
    name: '宫墙深深',
    icon: '🏯',
    description: '现代灵魂穿越成后宫嫔妃，在尔虞我诈的宫廷中步步为营',
    prompt: '顶级法医沈云瑶在解剖一具古尸时，意外穿越到了古代，成了刚入宫的小秀女。原主是个胆小怕事的性格，在宫中处处被人欺负。沈云瑶穿越后，用自己的智慧和现代医学知识在宫中站稳脚跟。她先是治好了太后的旧疾获得赏识，后又用验尸技能帮皇帝破获了几桩谜案。然而她的真正目的是调查母亲死亡的真相——母亲曾是宫中的贵妃，却在十年前神秘死亡。随着调查深入，她发现自己卷入了一个惊天的宫廷阴谋。',
    category: 'historical',
    gradient: 'from-red-500 to-rose-600',
  },
  {
    id: '23',
    name: '武侠江湖',
    icon: '⚔️',
    description: '刀光剑影的武侠世界，少年的江湖梦与侠客行',
    prompt: '江湖上有五大顶级门派，各据一方。其中落雁山庄的少庄主叶孤城从小被寄予厚望，却在一次历练中被神秘高手废了武功，逐出师门。流落江湖的他意外结识了一个神秘老人，传授他一套失传已久的绝世剑法。从此叶孤城开始了他的复仇之路和江湖之旅。在闯荡江湖的过程中，他结识了形形色色的人：有快意恩仇的绿林好汉，有心机深沉的门派长老，也有与他命运纠缠的红颜知己。他逐渐发现，当年废他武功的人背后，隐藏着整个江湖的巨大秘密。',
    category: 'historical',
    gradient: 'from-emerald-500 to-teal-600',
  },

  // ==================== 游戏电竞类 ====================
  {
    id: '24',
    name: '电竞天才',
    icon: '🏆',
    description: '被俱乐部驱逐的职业选手，在网吧重新开始，用实力证明自己',
    prompt: '叶修曾是《荣耀》职业联赛最顶尖的选手，享有"荣耀教科书"的美誉。然而因为与俱乐部的矛盾，他被逼迫退役，还被扣上了莫须有的罪名。失业落魄的叶修只能在一家网吧当网管，却始终没有放弃对荣耀的热爱。一次偶然的机会，他遇到了老板娘苏沐橙，在他的指导下开始重登荣耀巅峰。他从网游中的野路子开始，一步步重新证明自己的实力，最终组建了一支草根战队，向职业联赛发起冲击。',
    category: 'urban',
    gradient: 'from-indigo-500 to-blue-600',
  },
  {
    id: '25',
    name: '全息驯兽',
    icon: '🐉',
    description: '全息游戏中意外获得驯兽能力，发现虚拟与现实的奇异联系',
    prompt: '全息游戏《幻域》风靡全球，玩家可以在游戏中捕捉和培养各种各样的灵兽。顾长安是游戏中的资深玩家，在一次更新后，他意外发现自己的角色多了一个隐藏技能——"万物契约"，可以驯服任何灵兽。就在他以为自己将称霸游戏时，却发现游戏中的灵兽似乎正在影响现实。游戏中的神兽降临时，现实世界也会出现对应的异象。顾长安意识到，自己可能成为了连接游戏与现实的桥梁，而这个身份的背后，似乎有人在暗中操控。',
    category: 'urban',
    gradient: 'from-pink-500 to-violet-500',
  },

  // ==================== 其他热门类型 ====================
  {
    id: '26',
    name: '娱乐圈顶流',
    icon: '🎭',
    description: '草根练习生在娱乐圈中摸爬滚打，从默默无闻到万众瞩目',
    prompt: '舞蹈专业毕业的林星落北漂五年，依然只能在各个剧组跑龙套。当他准备放弃梦想回老家时，意外被星探发现，签约了一家小型经纪公司。凭借出色的舞蹈功底和独特的个人魅力，他从一个默默无闻的小透明逐渐在娱乐圈站稳脚跟。然而娱乐圈远比想象中复杂：同行的排挤、资本的博弈、媒体的恶意炒作，以及粉丝们狂热的爱与恨。林星落在经历了无数次跌倒后，终于站在了娱乐圈的巅峰，但他也在这个过程中逐渐迷失了自我。',
    category: 'urban',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    id: '27',
    name: '军旅铁血',
    icon: '🎖️',
    description: '热血青年投身军营，在铁与火中成长为特种兵王',
    prompt: '张铁牛是一个来自农村的倔强少年，因为小时候被军人救过命，从小就梦想成为一名军人。高考后他毅然选择参军，在新兵营中表现出色，被选入特种兵选拔。然而特种兵的世界远比想象中残酷：高强度的训练、严苛的淘汰机制、血与火的实战考验。张铁牛在经历了无数次生死考验后，逐渐成长为一名合格的特种兵。然而更艰难的挑战还在后面——他被选中执行一项绝密任务，任务的成败关乎国家安全和无数人的生命。',
    category: 'urban',
    gradient: 'from-green-600 to-emerald-700',
  },
  {
    id: '28',
    name: '直播网红',
    icon: '📺',
    description: '草根主播通过直播逆袭人生，在流量为王的时代追逐梦想',
    prompt: '农村出身的李小北来到大城市打工，却因为学历低、没背景，只能在工厂流水线上做重复性的工作。偶然间他接触到了直播，发现这是展示自己才华的舞台。凭借着接地气的风格和真诚的态度，他的直播间逐渐有了人气。然而直播行业的水很深：公会的压榨、同行的恶意竞争、平台的各种套路，让李小北一度想要放弃。在经历了一系列事件后，他决定不再依附任何公会，自己组建团队，制作有内容的直播节目，最终成为了一位有影响力的正能量主播。',
    category: 'urban',
    gradient: 'from-amber-400 to-orange-500',
  },
];
