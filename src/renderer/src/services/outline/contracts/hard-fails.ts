/**
 * Hard Fail Conditions
 * 硬失败条件定义 - 任何一条满足即阻断流程
 */

import type { StoryContract, VolumeContract, ChapterCommit } from '../contracts';

/**
 * 硬失败条件接口
 */
export interface HardFailCondition<T> {
  id: string;
  description: string;
  check: (target: T) => boolean;
}

/**
 * 故事契约硬失败条件
 */
export const STORY_CONTRACT_HARD_FAILS: HardFailCondition<StoryContract>[] = [
  {
    id: 'MISSING_TITLE',
    description: '缺少书名',
    check: (contract) => !!contract.basic?.title?.trim(),
  },
  {
    id: 'MISSING_GENRE',
    description: '缺少题材',
    check: (contract) => !!contract.basic?.genre?.trim(),
  },
  {
    id: 'STRAND_RATIO_INVALID',
    description: '三线比例总和不等于100%',
    check: (contract) => {
      const total = contract.strands.quest.ratio + 
                    contract.strands.fire.ratio + 
                    contract.strands.constellation.ratio;
      return Math.abs(total - 1.0) <= 0.01;
    },
  },
  {
    id: 'MISSING_CORE_HOOK',
    description: '缺少核心卖点描述',
    check: (contract) => !!contract.promises?.coreHook?.trim(),
  },
  {
    id: 'TARGET_WORD_COUNT_TOO_LOW',
    description: '目标字数过低（建议至少10万字）',
    check: (contract) => (contract.basic?.targetWordCount || 0) >= 100000,
  },
  {
    id: 'MISSING_EMOTION_GOAL',
    description: '缺少情绪目标',
    check: (contract) => !!contract.emotionGoal?.primary?.trim(),
  },
];

/**
 * 卷契约硬失败条件
 */
export const VOLUME_CONTRACT_HARD_FAILS: HardFailCondition<VolumeContract>[] = [
  {
    id: 'MISSING_REQUIRED_BEATS',
    description: '缺少必要的节拍节点',
    check: (volume) => {
      const requiredNodes = ['Opening', 'Development', 'Climax', 'ConflictResolution', 'Ending'];
      const actualNodes = volume.beats.map(b => b.node);
      return requiredNodes.every(n => actualNodes.includes(n as any));
    },
  },
  {
    id: 'BEAT_SEQUENCE_ERROR',
    description: '节拍顺序或章节范围有问题',
    check: (volume) => {
      const nodeOrder = ['Opening', 'Development', 'Twist1', 'Twist2', 
                        'Climax', 'ConflictResolution', 'Twist3', 'Ending'];
      const sortedBeats = [...volume.beats].sort(
        (a, b) => nodeOrder.indexOf(a.node) - nodeOrder.indexOf(b.node)
      );
      // 检查章节范围是否重叠或断开
      for (let i = 1; i < sortedBeats.length; i++) {
        const prevEnd = sortedBeats[i - 1].chapterRange[1];
        const currStart = sortedBeats[i].chapterRange[0];
        if (currStart > prevEnd + 1) {
          return false; // 有章节缺口
        }
        if (currStart < prevEnd) {
          return false; // 有重叠
        }
      }
      return true;
    },
  },
  {
    id: 'TIMELINE_NOT_MONOTONIC',
    description: '时间线必须单调递增',
    check: (volume) => volume.timeline?.monotonic === true,
  },
  {
    id: 'MISSING_MAIN_PROMISE',
    description: '缺少卷主要承诺',
    check: (volume) => !!volume.promises?.mainPromise?.trim(),
  },
  {
    id: 'MISSING_CHAPTER_RANGE',
    description: '缺少章节范围',
    check: (volume) => 
      volume.chapterRange && 
      volume.chapterRange[0] < volume.chapterRange[1],
  },
];

/**
 * 章承诺硬失败条件
 */
export const CHAPTER_COMMIT_HARD_FAILS: HardFailCondition<ChapterCommit>[] = [
  {
    id: 'MISSING_CBN',
    description: '缺少CBN（章节起点）',
    check: (commit) => !!commit.nodes?.cbn,
  },
  {
    id: 'MISSING_CEN',
    description: '缺少CEN（章节终点）',
    check: (commit) => !!commit.nodes?.cen,
  },
  {
    id: 'CPNS_COUNT_TOO_LOW',
    description: 'CPN数量不足（至少2个）',
    check: (commit) => (commit.nodes?.cpns?.length || 0) >= 2,
  },
  {
    id: 'CPNS_COUNT_TOO_MANY',
    description: 'CPN数量过多（最多4个）',
    check: (commit) => (commit.nodes?.cpns?.length || 0) <= 4,
  },
  {
    id: 'MISSING_COOL_POINT',
    description: '缺少爽点设计',
    check: (commit) => !!commit.requirements?.coolPoint?.trim(),
  },
  {
    id: 'MISSING_OBJECTIVE',
    description: '缺少章节目标',
    check: (commit) => !!commit.requirements?.objective?.trim(),
  },
  {
    id: 'MISSING_RESISTANCE',
    description: '缺少章节阻力',
    check: (commit) => !!commit.requirements?.resistance?.trim(),
  },
  {
    id: 'FORBIDDEN_ZONES_TOO_MANY',
    description: '本章禁区超过5条',
    check: (commit) => (commit.forbiddenZones?.length || 0) <= 5,
  },
  {
    id: 'INVALID_NODE_FORMAT',
    description: '节点格式错误（应为「主体 | 动作 | 结果」）',
    check: (commit) => {
      const pattern = /^.+?\s*\|\s*.+?\s*\|\s*.+$/;
      if (!pattern.test(commit.nodes?.cbn?.statement || '')) return false;
      if (!pattern.test(commit.nodes?.cen?.statement || '')) return false;
      for (const cpn of commit.nodes?.cpns || []) {
        if (!pattern.test(cpn.statement)) return false;
      }
      return true;
    },
  },
];

/**
 * 验证硬失败条件
 */
export function validateHardFails<T>(
  target: T,
  conditions: HardFailCondition<T>[]
): { passed: boolean; failedIds: string[] } {
  const failedIds: string[] = [];
  
  for (const condition of conditions) {
    try {
      if (!condition.check(target)) {
        failedIds.push(condition.id);
      }
    } catch (error) {
      // 检查失败也视为未通过
      failedIds.push(condition.id);
    }
  }
  
  return {
    passed: failedIds.length === 0,
    failedIds,
  };
}

/**
 * 获取失败条件的描述
 */
export function getFailDescription<T>(
  failedIds: string[],
  conditions: HardFailCondition<T>[]
): string[] {
  return failedIds
    .map(id => conditions.find(c => c.id === id)?.description || id)
    .filter(Boolean);
}
