// 持续重跑协调器：每 15 分钟做一次稳定性门禁（3 连长生成探针），通过即跑冒烟并停止循环。
// 最多尝试 8 轮（约 2 小时），全程日志落 temp/storyflow-luna-oracle.log
import { execSync } from 'node:child_process';

for (let attempt = 1; attempt <= 8; attempt += 1) {
  console.log(`\n===== attempt ${attempt} @ ${new Date().toLocaleTimeString()} =====`);
  try {
    execSync('node temp\\probe-luna-stable.mjs', { stdio: 'inherit', timeout: 420_000 });
    console.log(`[oracle] 网关稳定（attempt ${attempt}），启动冒烟`);
    execSync(
      'cmd /c "set MOLIU_AI_PROVIDER_ID=provider-1786812318014&& set MOLIU_RESUME_STORYFLOW=1&& npm run smoke:storyflow:real > temp\\storyflow-luna-oracle-run.log 2>&1"',
      { stdio: 'inherit', timeout: 3 * 60 * 60_000 },
    );
    console.log('[oracle] 冒烟 exit=0 —— 成功');
    process.exit(0);
  } catch (e) {
    const status = e.status;
    console.log(`[oracle] attempt ${attempt} 失败（exit=${status ?? '?'}），15 分钟后重试`);
  }
  if (attempt < 8) await new Promise(r => setTimeout(r, 15 * 60_000));
}
console.log('[oracle] 8 轮全部失败，放弃');
process.exit(1);
