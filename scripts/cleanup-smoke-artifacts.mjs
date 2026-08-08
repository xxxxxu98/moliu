/**
 * 冒烟测试产物清理工具：在各 smoke 脚本启动测试前调用，删除上一轮残留产物，
 * 防止新旧混淆导致误判（曾因读到上一轮截断大纲而误诊）。
 *
 * 设计：
 * - 只删 temp/ 下「本轮 smoke 明确产出的文件/目录」，不触碰配置文件与 trace。
 * - trace 文件（temp/ai-traces/*.jsonl）按时间戳命名、不冲突，保留供历史对比排查。
 * - 容错：目标不存在时跳过，删除失败时只告警不中断（清理是锦上添花，不该阻塞测试）。
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = join(process.cwd(), 'temp');

/**
 * 清理指定 smoke 轮次的旧产物。
 *
 * @param label       脚本标签，仅用于日志展示（如 'smoke:continue-write:real'）
 * @param artifacts   要删除的产物名（相对 temp/ 的文件名或目录名）
 * @param options.prefixes  要按前缀批量删除的文件名前缀（如 'continue-write.real.' 会删掉
 *                          continue-write.real.summary.json / .steps.txt / .report.json 等）
 * @returns 实际删除的条目数
 */
export function cleanupSmokeArtifacts(label, artifacts = [], options = {}) {
  const { prefixes = [] } = options;
  let cleaned = 0;

  // 1) 精确文件/目录
  for (const name of artifacts) {
    const full = join(TEMP_DIR, name);
    if (!existsSync(full)) continue;
    try {
      rmSync(full, { recursive: true, force: true });
      cleaned++;
    } catch (err) {
      console.warn(`[${label}] 清理 ${name} 失败：${err.message}（已跳过，不影响测试）`);
    }
  }

  // 2) 前缀匹配的文件（扫 temp/ 顶层，不递归，避免误伤子目录）
  if (prefixes.length > 0 && existsSync(TEMP_DIR)) {
    const entries = readdirSync(TEMP_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!prefixes.some(p => entry.name.startsWith(p))) continue;
      const full = join(TEMP_DIR, entry.name);
      try {
        rmSync(full, { recursive: true, force: true });
        cleaned++;
      } catch (err) {
        console.warn(`[${label}] 清理 ${entry.name} 失败：${err.message}（已跳过）`);
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[${label}] 已清理 ${cleaned} 个上一轮产物`);
  }
  return cleaned;
}
