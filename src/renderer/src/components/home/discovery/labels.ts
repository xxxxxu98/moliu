/**
 * 开题中心展示标签映射（生命周期/风险/平台短名）
 */

export const lifecycleLabel: Record<string, string> = {
  emerging: '萌芽',
  rising: '上升',
  peak: '高峰',
  declining: '回落',
  saturated: '饱和',
};

export const riskLabel: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export const shortPlatformLabel: Record<string, string> = {
  general: '不限',
  qidian: '起点',
  fanqie: '番茄',
  jinjiang: '晋江',
  qimao: '七猫',
  zhihu: '盐言',
};
