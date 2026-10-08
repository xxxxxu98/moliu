import { genreTags, settingElements } from '@/data/inspirations';
import type { FiveDimensionEvaluation } from '@/types/inspiration';

/**
 * 五维评估配置
 */
const evaluationConfig = {
  // 题材热度权重（市场潜力）
  genreHotness: {
    // 高热度题材
    hot: ['都市', '玄幻', '修仙', '言情', '甜宠', '总裁', '穿越', '系统流', '重生', '末世',
      '高武', '都市异能', '古言', '现言', '年代', '规则怪谈', '无限流', '神豪'],
    // 中热度题材
    medium: ['科幻', '悬疑', '武侠', '校园', '电竞', '职场', '宫斗', '种田', '洪荒',
      '宅斗', '快穿', '大女主', '虐恋', '直播', '娱乐圈', '御兽', '克苏鲁', '赘婿', '盗墓', '西幻'],
    // 低热度题材
    cold: ['历史', '战争', '军旅', '灵异', '体育竞技', '海军', '空军', '音乐', '同人'],
  },
  
  // 设定元素复杂度权重（难度）
  elementComplexity: {
    // 简单元素
    simple: ['资质平平', '废物流', '天才流', '重生者', '穿越者', '暗恋追求', '误会重重', '逆袭打脸'],
    // 中等元素
    medium: ['任务系统', '传承觉醒', '神秘导师', '隐藏血脉', '师尊', '商战博弈', '宗门大比', '秘境探险'],
    // 复杂元素
    complex: ['双重人格', '机械改造', '死亡回档', '规则博弈', '赛博都市', '星际争霸', '魔法学院'],
  },
  
  // 设定元素扩展性权重
  elementExpandability: {
    // 高扩展性
    high: ['任务系统', '穿越者', '重生者', '星际争霸', '双穿门', '平行世界', '赛博都市', '兑换商城'],
    // 中扩展性
    medium: ['秘境探险', '宗门崛起', '势力崛起', '夺宝奇兵', '魔法学院', '古代王朝'],
    // 低扩展性
    low: ['暗恋追求', '误会重重', '三角恋'],
  },
};

/**
 * 根据题材标签评估市场潜力
 */
function evaluateMarketPotential(tags: string[]): number {
  if (tags.length === 0) return 2;
  
  let hotCount = 0;
  let mediumCount = 0;
  let coldCount = 0;
  
  tags.forEach(tagName => {
    if (evaluationConfig.genreHotness.hot.includes(tagName)) {
      hotCount++;
    } else if (evaluationConfig.genreHotness.medium.includes(tagName)) {
      mediumCount++;
    } else if (evaluationConfig.genreHotness.cold.includes(tagName)) {
      coldCount++;
    }
  });
  
  // 计算得分
  const score = (hotCount * 5 + mediumCount * 3 + coldCount * 1) / tags.length;
  
  // 限制在1-5之间
  return Math.max(1, Math.min(5, Math.round(score)));
}

/**
 * 根据设定元素评估原创性
 */
function evaluateOriginality(tags: string[], elements: string[]): number {
  if (tags.length === 0 && elements.length === 0) return 2;
  
  // 基础分
  let baseScore = 3;
  
  // 检查是否有高同质化组合
  const commonCombos = [
    ['废物流', '任务系统', '逆袭打脸'],
    ['重生', '都市', '逆袭打脸'],
    ['总裁', '甜宠', '误会重重'],
    ['穿越', '宫斗', '权力斗争'],
  ];
  
  // 检查是否匹配常见组合
  let matchCount = 0;
  commonCombos.forEach(combo => {
    const matchedElements = combo.filter(item => 
      [...tags, ...elements].some(selected => selected.includes(item))
    );
    if (matchedElements.length >= 2) {
      matchCount++;
    }
  });
  
  // 常见组合越多，原创性越低
  baseScore -= matchCount * 0.5;
  
  // 检查是否有独特元素
  const uniqueElements = ['赛博', '星际', '机械改造', '双重人格', '规则博弈', '双穿门'];
  const hasUnique = elements.some(e => uniqueElements.some(u => e.includes(u)));
  if (hasUnique) {
    baseScore += 1;
  }
  
  return Math.max(1, Math.min(5, Math.round(baseScore)));
}

/**
 * 根据设定元素评估扩展性
 */
function evaluateExpandability(tags: string[], elements: string[]): number {
  if (tags.length === 0 && elements.length === 0) return 2;
  
  let totalScore = 0;
  let count = 0;
  
  // 评估题材扩展性
  const expandableGenres = ['玄幻', '仙侠', '科幻', '都市', '穿越', '历史'];
  tags.forEach(tag => {
    if (expandableGenres.includes(tag)) {
      totalScore += 4;
      count++;
    }
  });
  
  // 评估元素扩展性
  elements.forEach(element => {
    if (evaluationConfig.elementExpandability.high.includes(element)) {
      totalScore += 5;
      count++;
    } else if (evaluationConfig.elementExpandability.medium.includes(element)) {
      totalScore += 3;
      count++;
    } else if (evaluationConfig.elementExpandability.low.includes(element)) {
      totalScore += 1;
      count++;
    }
  });
  
  if (count === 0) return 2;
  
  return Math.max(1, Math.min(5, Math.round(totalScore / count)));
}

/**
 * 根据设定元素评估创作难度
 */
function evaluateDifficulty(tags: string[], elements: string[]): number {
  if (tags.length === 0 && elements.length === 0) return 3;
  
  let totalScore = 0;
  let count = 0;
  
  // 题材难度
  const hardGenres = ['西幻', '军事', '历史', '科幻'];
  const easyGenres = ['都市', '言情', '甜宠', '校园'];
  
  tags.forEach(tag => {
    if (hardGenres.includes(tag)) {
      totalScore += 4;
      count++;
    } else if (easyGenres.includes(tag)) {
      totalScore += 2;
      count++;
    }
  });
  
  // 元素难度
  elements.forEach(element => {
    if (evaluationConfig.elementComplexity.complex.includes(element)) {
      totalScore += 4;
      count++;
    } else if (evaluationConfig.elementComplexity.medium.includes(element)) {
      totalScore += 3;
      count++;
    } else if (evaluationConfig.elementComplexity.simple.includes(element)) {
      totalScore += 2;
      count++;
    }
  });
  
  if (count === 0) return 3;
  
  return Math.max(1, Math.min(5, Math.round(totalScore / count)));
}

/**
 * 评估个人匹配度（基于已选择的内容数量和多样性）
 */
function evaluatePersonalMatch(tags: string[], elements: string[]): number {
  // 基础分
  let score = 2;
  
  // 选择数量适中（3-6个元素）得分更高
  const totalSelection = tags.length + elements.length;
  if (totalSelection >= 3 && totalSelection <= 6) {
    score += 1;
  } else if (totalSelection > 6 && totalSelection <= 10) {
    score += 0.5;
  }
  
  // 类型多样性
  const categories = new Set<string>();
  elements.forEach(elementName => {
    const element = settingElements.find(e => e.name === elementName);
    if (element?.category) {
      categories.add(element.category);
    }
  });
  
  // 多个类别得分更高
  if (categories.size >= 3) {
    score += 1;
  } else if (categories.size >= 2) {
    score += 0.5;
  }
  
  return Math.max(1, Math.min(5, Math.round(score)));
}

/**
 * 计算五维评估
 */
export function calculateFiveDimensionEvaluation(
  selectedTagNames: string[],
  selectedElementNames: string[]
): FiveDimensionEvaluation {
  return {
    originality: evaluateOriginality(selectedTagNames, selectedElementNames),
    marketPotential: evaluateMarketPotential(selectedTagNames),
    expandability: evaluateExpandability(selectedTagNames, selectedElementNames),
    difficulty: evaluateDifficulty(selectedTagNames, selectedElementNames),
    personalMatch: evaluatePersonalMatch(selectedTagNames, selectedElementNames),
  };
}

/**
 * 获取评估建议
 */
export function getEvaluationAdvice(evaluation: FiveDimensionEvaluation): string[] {
  const advice: string[] = [];
  
  if (evaluation.marketPotential >= 4) {
    advice.push('市场热度高，这类题材读者群体大，收益潜力好');
  } else if (evaluation.marketPotential < 3) {
    advice.push('小众题材，收益可能有限但容易出精品');
  }
  
  if (evaluation.originality >= 4) {
    advice.push('创意独特，容易在同质化市场中脱颖而出');
  } else if (evaluation.originality < 3) {
    advice.push('经典套路，读者接受度高但竞争激烈');
  }
  
  if (evaluation.expandability >= 4) {
    advice.push('设定丰富，适合长篇连载');
  } else if (evaluation.expandability < 3) {
    advice.push('适合短篇或中篇，注意控制篇幅');
  }
  
  if (evaluation.difficulty >= 4) {
    advice.push('设定复杂，创作难度较高，需要充分准备');
  } else if (evaluation.difficulty <= 2) {
    advice.push('设定简单，容易上手，适合新手');
  }
  
  if (evaluation.personalMatch >= 4) {
    advice.push('与你的选择很匹配，创作动力会更足');
  } else if (evaluation.personalMatch < 3) {
    advice.push('可能需要更多资料收集和背景研究');
  }
  
  return advice;
}
