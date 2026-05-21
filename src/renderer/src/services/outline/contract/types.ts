/**
 * Contract System - Core Types
 * Core type definitions for the story contract system
 */

import type {
  ContractMeta,
  StrandConfig,
  Violation,
  Warning,
  ValidationResult,
  StoryContract as StoryContractType,
  VolumeContract as VolumeContractType,
} from '../types';

// ====== 契约元数据 ======

/**
 * 创建契约元数据
 */
export function createContractMeta(
  contractType: 'story' | 'volume' | 'chapter',
  generatorVersion: string = '1.0.0'
): ContractMeta {
  const now = new Date().toISOString();
  return {
    schemaVersion: 'story-system/v1',
    contractType,
    generatorVersion,
    createdAt: now,
    updatedAt: now,
  };
}

// ====== 故事契约 (Story Contract) ======

/**
 * 创建故事契约
 */
export function createStoryContract(params: {
  genre: string;
  tone: string[];
  targetWordCount: number;
  coreHook: string;
  mainSatisfactions: string[];
  timeBaseline?: string;
}): StoryContractType {
  return {
    meta: createContractMeta('story'),
    promises: {
      genre: params.genre,
      tone: params.tone,
      targetWordCount: params.targetWordCount,
      coreHook: params.coreHook,
      mainSatisfactions: params.mainSatisfactions,
    },
    constraints: {
      world: {
        timeBaseline: params.timeBaseline || '',
        timeDirection: 'forward',
        timeMonotonic: true,
        maxTimeGaps: 5,
        forbiddenTimeLoops: true,
      },
      abilities: {
        maxLevelReached: 1,
        abilitySources: [],
        forbiddenCombinations: [],
      },
      characters: {
        maxMajor: 10,
        maxMinor: 30,
        forbiddenDeaths: [],
      },
    },
    strands: {
      quest: { ratio: 0.6, status: 'active', currentArc: '' },
      fire: { ratio: 0.25, status: 'active', currentStage: 'cold' },
      constellation: { ratio: 0.15, status: 'active', revealedLocations: [] },
    },
    conflictEscalation: [],
  };
}

// ====== 卷契约 (Volume Contract) ======

/**
 * 创建卷契约
 */
export function createVolumeContract(params: {
  volumeId: number;
  volumeTitle: string;
  outlineId?: string;
  baseline?: string;
}): VolumeContractType {
  return {
    meta: createContractMeta('volume'),
    volumeId: params.volumeId,
    volumeTitle: params.volumeTitle,
    beats: [],
    timeline: {
      baseline: params.baseline || '',
      span: '',
      direction: 'forward',
      monotonic: true,
      anchors: [],
      countdownEvents: [],
    },
    strandStatus: {
      quest: { mainObjective: '', obstacles: [], status: 'active' },
      fire: { relationshipStage: 'introduction', keyMoments: [], status: 'active' },
      constellation: { newRevelations: [], locationsIntroduced: [], status: 'active' },
    },
    promises: {
      mainPromise: '',
      subPromises: [],
      hookForNext: '',
    },
    validation: {
      timeConsistency: true,
      conflictEscalation: true,
      strandBalance: true,
    },
  };
}

// ====== 验证结果工厂 ======

/**
 * 创建验证结果
 */
export function createValidationResult(params: {
  isValid: boolean;
  violations?: Violation[];
  warnings?: Warning[];
}): ValidationResult {
  return {
    isValid: params.isValid,
    violations: params.violations || [],
    warnings: params.warnings || [],
  };
}

/**
 * 创建违规
 */
export function createViolation(params: {
  type: string;
  description: string;
  severity: 'blocking' | 'warning';
  location?: { contract: string; path: string };
  suggestion?: string;
}): Violation {
  return {
    type: params.type,
    description: params.description,
    severity: params.severity,
    location: params.location,
    suggestion: params.suggestion,
  };
}

/**
 * 创建警告
 */
export function createWarning(params: {
  type: string;
  description: string;
  location?: { contract: string; path: string };
}): Warning {
  return {
    type: params.type,
    description: params.description,
    location: params.location,
  };
}

// ====== 三线交织工具 ======

/**
 * 验证三线比例总和
 */
export function validateStrandRatio(strands: StrandConfig): {
  valid: boolean;
  total: number;
  message?: string;
} {
  const total = strands.quest.ratio + strands.fire.ratio + strands.constellation.ratio;
  
  if (Math.abs(total - 1.0) > 0.01) {
    return {
      valid: false,
      total,
      message: `三线比例总和为 ${(total * 100).toFixed(1)}%，应等于 100%`,
    };
  }
  
  return { valid: true, total };
}

/**
 * 获取三线状态摘要
 */
export function getStrandSummary(strands: StrandConfig): string {
  const questPct = (strands.quest.ratio * 100).toFixed(0);
  const firePct = (strands.fire.ratio * 100).toFixed(0);
  const constPct = (strands.constellation.ratio * 100).toFixed(0);
  
  return `主线(Quest): ${questPct}% | 感情(Fire): ${firePct}% | 世界观(Constellation): ${constPct}%`;
}
