// 精确复现:'他沉声道:"这就是你的答案?"' → 输出'他沉声道"这就是"'
// 逐 gate 手动跑一遍(按源码顺序 A→B→C→D→E→F→cleanup)
const input = '他沉声道：\u201C这就是你的答案？\u201D';

// Gate A 无关。Gate B 无关。Gate C 无关。
// Gate D 规则3:连续四字词 —— '这就是你的答案?'不含逗号,可能命中!
const fourCharPattern = /([^，。！？；：\u201C\u201D''\n]{4}[，。！？；：\u201C\u201D''\n]?){3,}/g;
const m = input.match(fourCharPattern);
console.log('Gate D 规则3 命中:', m);

// 规则1:排比 (，X)+Y —— 无逗号,不命中
const parallelismRegex = /(，([^，]+)，)+([^，]+)，?$/g;
console.log('Gate D 规则1 命中:', input.match(parallelismRegex));
