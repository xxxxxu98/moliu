const input = '他沉声道：“这就是你的答案？”';
const step1 = input.replace(/\s*[\u201C\u201D"]\s*/g, '"');
console.log('after 547:', step1);
console.log('冒号存在:', input.includes('：'), '处理后存在:', step1.includes('：'));
// 输出'他沉声道“这就是”'说明冒号与部分内容被其他 gate 吃掉了
// 547 行把弯引号替换成 ASCII 引号,再无冒号 → /沉声道：/ 不匹配
