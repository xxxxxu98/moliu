// 快速验证 shrinkHookText 新回退路径(从源码提取函数模拟执行)
// 直接用 TS 源里的逻辑,先手工复刻验证语义
function truncateByChars(value, maxChars) {
  const chars = [...value];
  if (chars.length <= maxChars) return value;
  return chars.slice(0, maxChars).join('').trim();
}
function truncateAtClauseBoundary(value, maxChars) {
  const chars = [...value];
  if (chars.length <= maxChars) return value;
  const separators = /[，。；;、….!！?？：:——]/u;
  for (let i = maxChars; i >= Math.floor(maxChars / 2); i -= 1) {
    if (separators.test(chars[i - 1])) {
      return chars.slice(0, i).join('').replace(/[，。；;、….!！?？]+$/u, '').trim();
    }
  }
  const tailWords = /^(?:的|了|着|地|过|与|和|在|向|往|到|被|把|将)/u;
  for (let i = maxChars; i >= Math.floor(maxChars / 2); i -= 1) {
    if (tailWords.test(chars[i])) {
      return chars.slice(0, i).join('').trim();
    }
  }
  return truncateByChars(value.trimEnd(), maxChars);
}
function shrinkHookText(hook, maxChars) {
  const trimmed = hook.trim().replace(/[。；;.!！?？,，、]+$/u, '');
  if (trimmed.length <= maxChars) return trimmed;
  const separators = /[，。；;、——….!！?？]/u;
  const chars = [...trimmed];
  let cutIndex = -1;
  let acc = 0;
  for (let i = 0; i < chars.length && acc <= maxChars; i += 1) {
    acc += 1;
    if (separators.test(chars[i])) cutIndex = i;
  }
  if (cutIndex >= Math.floor(maxChars / 2)) {
    return chars.slice(0, cutIndex).join('').replace(/[，。；;、]+$/u, '').trim();
  }
  return truncateAtClauseBoundary(trimmed, maxChars);
}

// 实测受害样本(书里 31 处残句的原始超长钩子还原)
const cases = [
  ['老中医凑近林舟耳边，低声吐露省城权贵正四处求药的隐情与重金悬赏', 25],
  ['林舟一把拉开帆布挎包，数叠粉红钞票赫然暴露在众人眼前晃了晃', 25],
  ['林舟独自步入卧龙谷密林，深处忽有一缕温热暖风拂面而来', 25],
  ['林舟将大桶熬好的草药渣，直接倒进了装满地泉水的大石缸里', 25],
  ['红绸布被猛地揭开，天工生态农医合作社的金字木牌熠熠生辉', 25],
  ['夜色深沉，几个鬼祟身影扛着黑色塑料桶悄悄摸向后山防护林', 25],
  ['林舟大笔一挥在生死状上签下名字，将笔重重拍在桌案上', 25],
  ['钱大富一把将特展名单拍在红木桌上，眼中闪过一丝厉色与杀机', 25],
];
for (const [hook, max] of cases) {
  const out = shrinkHookText(hook, max);
  console.log((out.length <= max ? 'OK  ' : 'OVER') + ' (' + out.length + ') ' + out);
}
