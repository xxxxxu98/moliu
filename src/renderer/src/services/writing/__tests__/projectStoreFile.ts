/**
 * 矩阵 project-store 文件读取（harness 共用）。
 *
 * 职责：解析冒烟/大循环落盘的 project-store（明文 .json 或 gzip 快照 .json.gz），
 * 定位其中唯一的项目对象。补写（storyflow.repair-empty）与章节回放共用同一份实现。
 * 约束：store 根有三种历史形态 {projects:[...]} / {projects:{id:...}} / 直接项目对象，
 * 写回时必须按原形态回填（见 writeProjectBack）。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import type { Project } from '@/types/project';

/** 解析后的 store：root 保留原结构用于写回，project 为其中的项目引用 */
export interface ProjectStoreFile {
  root: Record<string, unknown>;
  project: Project;
}

/** 从 store 文本解析项目；找不到带 chapters 的项目时抛错 */
export function parseProjectStore(raw: string): ProjectStoreFile {
  const root = JSON.parse(raw) as Record<string, unknown>;
  const rawProjects = root.projects as unknown;
  const project = Array.isArray(rawProjects)
    ? (rawProjects[0] as Project)
    : rawProjects && typeof rawProjects === 'object'
      ? (Object.values(rawProjects)[0] as Project)
      : (root as unknown as Project);
  if (!project || !Array.isArray(project.chapters)) {
    throw new Error('store 中找不到带 chapters 的项目');
  }
  return { root, project };
}

/** 读取 store 文件（.gz 后缀自动解压） */
export function readProjectStoreFile(path: string): ProjectStoreFile {
  const buffer = readFileSync(path);
  const raw = path.endsWith('.gz') ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  try {
    return parseProjectStore(raw);
  } catch (error) {
    throw new Error(`解析 store 失败（${path}）：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 按 root 原形态把项目写回（返回同一 root 引用） */
export function writeProjectBack(root: Record<string, unknown>, project: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(root.projects)) {
    (root.projects as unknown[])[0] = project;
  } else if (root.projects && typeof root.projects === 'object') {
    const key = Object.keys(root.projects)[0];
    (root.projects as Record<string, unknown>)[key] = project;
  } else {
    Object.assign(root, project);
  }
  return root;
}
