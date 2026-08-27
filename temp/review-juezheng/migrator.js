const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/story-runtime/LegacyProjectMigrator.ts', 'utf8');
const m = t.match(/buildSceneChunks[\s\S]{0,1500}/) || t.match(/sceneChunks[\s\S]{0,200}/);
// 直接找 sceneChunks 的构建函数
const idx = t.indexOf('sceneChunks');
console.log('--- sceneChunks 构建上下文 ---');
const ls = t.split(/\r?\n/);
ls.forEach((l, i) => { if (/sceneChunks|splitIntoScenes|chunkChapter|buildScene/i.test(l)) console.log((i + 1) + ': ' + l.trim().slice(0, 140)); });
