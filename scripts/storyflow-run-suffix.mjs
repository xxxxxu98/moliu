/**
 * Storyflow 冒烟产物路径的后缀隔离约定（供 smoke 脚本与 multi 矩阵脚本共享）。
 *
 * 并发矩阵冒烟（smoke:storyflow:real:multi）同时跑多个厂商时，同一份固定产物路径
 * （summary/outline/prose/trace/project-store）会互相覆盖，且每轮跑前清理会删掉
 * 并发中兄弟轮次的在写文件。约定：multi 给每轮注入 MOLIU_RUN_SUFFIX=<providerId>，
 * 本轮所有产物文件名带后缀、清理只匹配自己的后缀，实现完全隔离。
 *
 * 单跑（smoke:storyflow:real 不设 MOLIU_RUN_SUFFIX）走原固定名，行为不变。
 *
 * 注意：src 侧（storyflowClosedLoopHarness.ts 的 resolveStoryflowArtifactPaths）
 * 镜像了同一套命名，改这里必须同步改那里（TS 无法直接 import scripts 下的 .mjs）。
 */

/** 清洗后缀：文件名安全字符 [A-Za-z0-9_-]，其余丢弃 */
export function sanitizeRunSuffix(raw) {
  return (raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

/** 按后缀返回 temp/ 顶层三类产物的文件/目录名（无后缀 = 原固定名） */
export function storyflowArtifactNames(suffix) {
  if (!suffix) {
    return {
      summary: 'storyflow.closed-loop.summary.json',
      outline: 'storyflow.closed-loop.outline.json',
      proseDir: 'storyflow.closed-loop.prose',
    };
  }
  return {
    summary: `storyflow.closed-loop.${suffix}.summary.json`,
    outline: `storyflow.closed-loop.${suffix}.outline.json`,
    proseDir: `storyflow.closed-loop.${suffix}.prose`,
  };
}

/**
 * 冒烟跑前清理配置：有后缀时只清本轮后缀的产物与 trace（绝不触碰并发兄弟轮次），
 * 无后缀时维持单跑的既有全局清理。
 */
export function smokeCleanupConfig(suffix) {
  const names = storyflowArtifactNames(suffix);
  const artifacts = [names.outline, names.summary, names.proseDir];
  if (!suffix) {
    return {
      artifacts,
      prefixes: ['storyflow.closed-loop.', 'storyflow-'],
      tracePrefixes: ['storyflow-'],
    };
  }
  return {
    artifacts,
    prefixes: [`storyflow.closed-loop.${suffix}.`, `storyflow-${suffix}-`],
    tracePrefixes: [`storyflow-${suffix}-`],
  };
}
