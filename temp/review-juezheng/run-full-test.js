const { execSync } = require('child_process');
const fs = require('fs');
try {
  execSync('npm test -- --run', { cwd: 'D:/project/2026/moliu', stdio: 'ignore', timeout: 570000 });
} catch (e) { /* 退出码非零也要读日志 */ }
const t = fs.readFileSync('D:/project/2026/moliu/temp/review-juezheng/full-test.log', 'utf8');
const ls = t.split(/\r?\n/);
const stat = ls.filter(l => /Test Files|Tests\s+\d/.test(l));
console.log(stat.slice(-2).join('\n'));
const fails = ls.filter(l => /FAIL /.test(l)).slice(0, 10);
console.log('--- FAIL 文件 ---');
console.log(fails.join('\n') || '(无)');
