/**
 * 测试大纲解析器
 */

import { remarkParser } from '../parser/remark-parser';
import { readFileSync } from 'fs';

// 读取测试文件
const testMdPath = 'D:/project/2026/moliu/test.md';
const markdown = readFileSync(testMdPath, 'utf-8');

console.log('===== 开始测试大纲解析器 =====\n');

// 解析
const result = remarkParser.parse(markdown);

console.log('===== 测试结果 =====\n');

// 1. 测试标题
console.log('【1. 标题测试】');
console.log(`  期望: 深海废土：我的移动堡垒`);
console.log(`  实际: ${result.title}`);
console.log(`  ${result.title.includes('深海废土') ? '✅ 通过' : '❌ 失败'}\n`);

// 2. 测试简介
console.log('【2. 简介测试】');
console.log(`  期望: 包含"末世洪水淹没全球"`);
console.log(`  实际: ${result.synopsis.substring(0, 50)}...`);
console.log(`  ${result.synopsis.includes('末世洪水') ? '✅ 通过' : '❌ 失败'}\n`);

// 3. 测试题材标签
console.log('【3. 题材标签测试】');
console.log(`  期望: 包含"末世废土"`);
console.log(`  实际: ${result.genres.join(', ')}`);
console.log(`  ${result.genres.some(g => g.includes('末世废土')) ? '✅ 通过' : '❌ 失败'}\n`);

// 4. 测试字数
console.log('【4. 字数测试】');
console.log(`  期望: 800000`);
console.log(`  实际: ${result.estimatedWordCount}`);
console.log(`  ${result.estimatedWordCount === 800000 ? '✅ 通过' : '❌ 失败'}\n`);

// 5. 测试四幕结构
console.log('【5. 四幕结构测试】');
console.log(`  act1: ${result.structure.act1.content.substring(0, 50)}...`);
console.log(`  ${result.structure.act1.content.includes('垃圾坟场') ? '✅ act1 通过' : '❌ act1 失败'}`);
console.log(`  act2a: ${result.structure.act2a.content.substring(0, 50)}...`);
console.log(`  ${result.structure.act2a.content.includes('珊瑚城邦') ? '✅ act2a 通过' : '❌ act2a 失败'}`);
console.log(`  act2b: ${result.structure.act2b.content.substring(0, 50)}...`);
console.log(`  ${result.structure.act2b.content.includes('深渊裂谷') ? '✅ act2b 通过' : '❌ act2b 失败'}`);
console.log(`  act3: ${result.structure.act3.content.substring(0, 50)}...`);
console.log(`  ${result.structure.act3.content.includes('方舟级') ? '✅ act3 通过' : '❌ act3 失败'}\n`);

// 6. 测试角色
console.log('【6. 角色测试】');
console.log(`  期望角色: 林深(protagonist)、老鱼(mentor)、泡泡(friend)`);
console.log(`  实际角色数: ${result.characters.length}`);
result.characters.forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.name} (${c.role}) - ${c.identity?.substring(0, 30) || '(无描述)'}...`);
});

const hasProtagonist = result.characters.some(c => c.name === '林深' && c.role === 'protagonist');
const hasOldFish = result.characters.some(c => c.name === '老鱼');
const hasBubble = result.characters.some(c => c.name === '泡泡');
console.log(`  ${hasProtagonist ? '✅ 林深(protagonist)' : '❌ 缺少林深(protagonist)'}`);
console.log(`  ${hasOldFish ? '✅ 老鱼' : '❌ 缺少老鱼'}`);
console.log(`  ${hasBubble ? '✅ 泡泡' : '❌ 缺少泡泡'}\n`);

// 7. 测试地点
console.log('【7. 地点测试】');
if (result.worldSetting?.locations) {
  console.log(`  地点数: ${result.worldSetting.locations.length}`);
  result.worldSetting.locations.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.name} - ${(l as any).description?.substring(0, 30) || '(无描述)'}...`);
  });
  const hasTrashYard = result.worldSetting.locations.some(l => l.name === '垃圾坟场');
  const hasCoralCity = result.worldSetting.locations.some(l => l.name === '珊瑚城邦');
  console.log(`  ${hasTrashYard ? '✅ 垃圾坟场' : '❌ 缺少垃圾坟场'}`);
  console.log(`  ${hasCoralCity ? '✅ 珊瑚城邦' : '❌ 缺少珊瑚城邦'}\n`);
} else {
  console.log('  ❌ 缺少 worldSetting.locations\n');
}

// 8. 测试势力
console.log('【8. 势力测试】');
if (result.worldSetting?.factions) {
  console.log(`  势力数: ${result.worldSetting.factions.length}`);
  result.worldSetting.factions.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.name}`);
  });
  const hasDrifters = result.worldSetting.factions.some(f => f.name === '漂流者联盟');
  console.log(`  ${hasDrifters ? '✅ 漂流者联盟' : '❌ 缺少漂流者联盟'}\n`);
} else {
  console.log('  ❌ 缺少 worldSetting.factions\n');
}

// 9. 测试章节
console.log('【9. 章节测试】');
console.log(`  章节数: ${result.chapters.length}`);
if (result.chapters.length > 0) {
  console.log(`  第1章: ${result.chapters[0].title}`);
  console.log(`  第2章: ${result.chapters[1]?.title || '(无)'}`);
  console.log(`  ${result.chapters[0]?.title?.includes('醒来') ? '✅ 章节1通过' : '❌ 章节1失败'}\n`);
} else {
  console.log('  ❌ 缺少章节\n');
}

// 10. 测试爽点设计
console.log('【10. 爽点设计测试】');
if (result.coolPointDesign) {
  console.log(`  类型: ${result.coolPointDesign.patterns.join(', ')}`);
  console.log(`  安排数: ${result.coolPointDesign.arranged.length}`);
  console.log(`  ${result.coolPointDesign.patterns.some(p => p.includes('打脸') || p.includes('爽')) ? '✅ 爽点类型通过' : '❌ 爽点类型失败'}\n`);
} else {
  console.log('  ❌ 缺少爽点设计\n');
}

// 11. 测试伏笔
console.log('【11. 伏笔测试】');
console.log(`  伏笔数: ${result.foreshadows.length}`);
result.foreshadows.slice(0, 3).forEach((f, i) => {
  console.log(`  ${i + 1}. ${f.hint.substring(0, 40)}...`);
});
console.log(`  ${result.foreshadows.length >= 5 ? '✅ 伏笔数量通过' : '❌ 伏笔数量不足'}\n`);

// 12. 测试八条故事线
console.log('【12. 八条故事线测试】');
if (result.storyLines) {
  console.log(`  地图线: ${result.storyLines.map?.substring(0, 50)}...`);
  console.log(`  感情线: ${result.storyLines.romance?.substring(0, 50)}...`);
  const hasMapLine = result.storyLines.map?.includes('垃圾坟场');
  console.log(`  ${hasMapLine ? '✅ 地图线通过' : '❌ 地图线失败'}\n`);
} else {
  console.log('  ❌ 缺少八条故事线\n');
}

// 13. 测试情绪目标
console.log('【13. 情绪目标测试】');
if (result.emotionGoal) {
  console.log(`  核心情绪: ${result.emotionGoal.primary}`);
  console.log(`  情绪弧线: ${result.emotionGoal.arc}`);
  console.log(`  ${result.emotionGoal.primary?.includes('热血') ? '✅ 情绪目标通过' : '❌ 情绪目标失败'}\n`);
} else {
  console.log('  ❌ 缺少情绪目标\n');
}

// 14. 测试矛盾设计
console.log('【14. 矛盾设计测试】');
if (result.conflictDesign) {
  console.log(`  冲突来源: ${result.conflictDesign.source}`);
  console.log(`  矛盾递进数: ${result.conflictDesign.escalation?.length || 0}`);
  console.log(`  ${result.conflictDesign.source?.includes('资源') || result.conflictDesign.source?.includes('利益') ? '✅ 矛盾设计通过' : '❌ 矛盾设计失败'}\n`);
} else {
  console.log('  ❌ 缺少矛盾设计\n');
}

// 15. 测试核心卖点
console.log('【15. 核心卖点测试】');
console.log(`  卖点数: ${result.coreSellingPoints?.length || 0}`);
result.coreSellingPoints?.slice(0, 3).forEach((sp, i) => {
  console.log(`  ${i + 1}. ${typeof sp === 'string' ? sp : (sp as any).name}`);
});
console.log(`  ${(result.coreSellingPoints?.length || 0) >= 3 ? '✅ 核心卖点通过' : '❌ 核心卖点不足'}\n`);

// 总结
console.log('===== 测试完成 =====');
