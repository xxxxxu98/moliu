/**
 * 五步大纲法
 * 基于 story-long-write 技能库的完整大纲方法论
 */

/**
 * 五步大纲法步骤
 */
export interface OutlineStep {
  id: number;
  name: string;
  icon: string;
  description: string;
  questions: string[];
  tips: string[];
  examples: string[];
}

/**
 * 五步大纲法完整流程
 */
export const fiveStepOutline: OutlineStep[] = [
  {
    id: 1,
    name: '确定情绪目标',
    icon: '🎯',
    description: '明确你想让读者感受到的核心情绪，这是故事的灵魂',
    questions: [
      '你想让读者在阅读时感受到什么情绪？',
      '是热血沸腾？甜蜜心动？还是紧张刺激？',
      '主要的情绪弧线是什么？从低到高还是波动起伏？',
    ],
    tips: [
      '情绪目标决定故事基调，要贯穿全文',
      '建议选择1-2个核心情绪，避免贪多',
      '每个高潮场景都要服务于核心情绪',
    ],
    examples: [
      '热血文：让读者感受到主角逆袭的快感',
      '甜宠文：让读者姨母笑、心动',
      '虐文：让读者心疼角色、想哭',
    ],
  },
  {
    id: 2,
    name: '设计核心设定',
    icon: '⚙️',
    description: '构建故事的基础世界观和规则体系',
    questions: [
      '故事发生在什么世界？现代都市/古代/异世界/未来？',
      '这个世界的核心规则是什么？修炼体系/魔法系统/科技水平？',
      '有哪些独特的设定让这个世界与众不同？',
    ],
    tips: [
      '设定要服务于剧情，不要为了炫技而设定',
      '前3章用到的设定要清晰，后面可以逐步展开',
      '一个世界最好只有1-2个核心规则体系',
    ],
    examples: [
      '都市修仙：灵气复苏的现代都市',
      '系统流：游戏化规则的异世界',
      '星际：高科技但阶层固化的宇宙文明',
    ],
  },
  {
    id: 3,
    name: '设计主角设定',
    icon: '👤',
    description: '塑造有魅力、能让读者代入的主角',
    questions: [
      '主角的核心性格特点是什么？',
      '主角最大的优势和短板是什么？',
      '主角的成长弧线：从弱小到强大还是从迷茫到坚定？',
      '主角的动机和目标是什么？',
    ],
    tips: [
      '主角要有明显的优点和缺点，太完美不真实',
      '主角的困境要具体，让读者有代入感',
      '主角的性格要能在压力下展现变化',
    ],
    examples: [
      '废物流：资质差但坚韧不拔',
      '天才流：实力强但背负使命',
      '普通人流：和你我一样面临现实压力',
    ],
  },
  {
    id: 4,
    name: '设计故事结构',
    icon: '🏗️',
    description: '规划故事的整体框架和关键节点',
    questions: [
      '开头如何吸引读者？用什么钩子？',
      '主角面临的主要矛盾是什么？',
      '有哪些关键转折点？',
      '高潮场景是什么？主角如何解决问题？',
      '结局是圆满还是开放式？',
    ],
    tips: [
      '开篇前3000字决定读者去留',
      '每个大情节要有起伏，不能平铺直叙',
      '高潮要足够震撼，解决要合理',
    ],
    examples: [
      '三幕式：起因→经过→结果',
      '升级流：打脸→升级→更大的打脸',
      '悬疑式：设谜→解谜→揭示真相',
    ],
  },
  {
    id: 5,
    name: '设计爽点安排',
    icon: '⚡',
    description: '规划让读者过瘾的精彩场景',
    questions: [
      '有哪些装逼打脸的场景？',
      '有哪些甜蜜/热血的高光时刻？',
      '反派是谁？如何在关键时刻被打脸？',
      '主角的哪些成就要着重描写？',
    ],
    tips: [
      '爽点要提前铺垫，爆发时才有快感',
      '爽点的节奏很重要，不能太密集也不能太少',
      '每个大爽点之间要有递进，越来越大',
    ],
    examples: [
      '英雄救美：关键时刻帅气登场',
      '当众打脸：让反派颜面尽失',
      '实力认证：获得称号或认可',
    ],
  },
];

/**
 * 获取步骤详情
 */
export function getStepDetails(stepId: number): OutlineStep | undefined {
  return fiveStepOutline.find(step => step.id === stepId);
}

/**
 * 生成完整大纲的框架
 */
export interface OutlineFramework {
  emotionGoal: string;
  coreSetting: {
    world: string;
    rules: string[];
    uniqueFeature: string;
  };
  protagonist: {
    name: string;
    personality: string;
    strengths: string;
    weaknesses: string;
    growthArc: string;
  };
  structure: {
    opening: string;
    conflicts: string[];
    turningPoints: string[];
    climax: string;
    resolution: string;
  };
  pleasurePoints: {
    scenes: string[];
    frequency: string;
  };
}

/**
 * 五步大纲法完成状态
 */
export interface FiveStepProgress {
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
  step4Complete: boolean;
  step5Complete: boolean;
}

export function isAllStepsComplete(progress: FiveStepProgress): boolean {
  return progress.step1Complete && 
         progress.step2Complete && 
         progress.step3Complete && 
         progress.step4Complete && 
         progress.step5Complete;
}

export function getProgressPercentage(progress: FiveStepProgress): number {
  const completed = [
    progress.step1Complete,
    progress.step2Complete,
    progress.step3Complete,
    progress.step4Complete,
    progress.step5Complete,
  ].filter(Boolean).length;
  return Math.round((completed / 5) * 100);
}
