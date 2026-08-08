/**
 * 冒烟测试产物清理工具：在各 smoke 脚本启动测试前调用，删除上一轮残留产物，
 * 防止新旧混淆导致误判（曾因读到上一轮截断大纲而误诊，又因 .bak 目录残留
 * 把不同轮次章节混拼误判为跨章断裂）。
 *
 * 设计：
 * - artifacts/prefixes 清 temp/ 顶层的产物（文件或目录，精确名 + 前缀兜底）。
 * - tracePrefixes 清 temp/ai-traces/ 下对应前缀的 trace（jsonl），跑前全清本轮冒烟自己的 trace，
 *   不碰其它冒烟的 trace（四个冒烟各自独立，互不干扰）。
 * - trace 不再"保留供历史对比"——冒烟是 PASS/FAIL 二元验证，上一轮失败的 trace 留着只会
 *   干扰判断（曾因 163 个旧 trace 导致时间线错配、产物归属误判）。
 * - 容错：目标不存在时跳过，删除失败时只告警不中断（清理是锦上添花，不该阻塞测试）。
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = join(process.cwd(), 'temp');
const TRACE_DIR = join(TEMP_DIR, 'ai-traces');

/**
 * 清理指定 smoke 轮次的旧产物。
 *
 * @param label          脚本标签，仅用于日志展示（如 'smoke:continue-write:real'）
 * @param artifacts      要删除的产物名（相对 temp/ 的文件名或目录名，精确匹配）
 * @param options.prefixes       temp/ 顶层按前缀批量删除（如 'continue-write.real.' 会删掉
 *                               summary/steps/report 及带后缀的 .bak 孪生产物）
 * @param options.tracePrefixes  temp/ai-traces/ 下按前缀删除的 trace（如 'storyflow-' 删全部
 *                               storyflow-*.jsonl），跑前全清本轮冒烟自己的 trace
 * @param options.keepNames      前缀删除时跳过的精确文件名白名单（如配置文件
 *                               continue-write.real.config.json 不应被 continue-write.real. 前缀误删）
 * @returns 实际删除的条目数
 */
export function cleanupSmokeArtifacts(label, artifacts = [], options = {}) {
  const { prefixes = [], tracePrefixes = [], keepNames = new Set() } = options;
  let cleaned = 0;

  // 1) 精确文件/目录（temp/ 顶层）
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

  // 2) 前缀匹配的 temp/ 顶层文件/目录（扫顶层不递归，兜底删带后缀的 .bak 孪生产物）
  if (prefixes.length > 0 && existsSync(TEMP_DIR)) {
    const entries = readdirSync(TEMP_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (keepNames.has(entry.name)) continue;
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

  // 3) trace 清理（temp/ai-traces/，按前缀全清本轮冒烟自己的，不碰其它冒烟的）
  if (tracePrefixes.length > 0 && existsSync(TRACE_DIR)) {
    const traceFiles = readdirSync(TRACE_DIR);
    for (const name of traceFiles) {
      if (!tracePrefixes.some(p => name.startsWith(p))) continue;
      try {
        rmSync(join(TRACE_DIR, name), { force: true });
        cleaned++;
      } catch (err) {
        console.warn(`[${label}] 清理 trace ${name} 失败：${err.message}（已跳过）`);
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[${label}] 已清理 ${cleaned} 个上一轮产物（含 trace）`);
  }
  return cleaned;
}
