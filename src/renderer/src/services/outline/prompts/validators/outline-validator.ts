/**
 * Outline Validator
 * 大纲验证器 - 基于 webnovel-writer 方法论
 */

import type { StoryContract, ChapterCommit, Violation, Warning } from '../contracts/story-contract';
import type { Beat } from '../contracts/story-contract';
import { COOL_POINT_DENSITY, EIGHT_STRANDS } from '../system/core-principles';

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: Violation[];
  warnings: Warning[];
}

/**
 * 总纲验证
 */
export function validateMasterOutline(outline: Partial<StoryContract>): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  // 必填字段检查
  if (!outline.basic?.title) {
    errors.push({
      type: 'missing_field',
      description: '缺少书名',
      severity: 'blocking',
      location: { path: 'basic.title' },
    });
  }

  if (!outline.basic?.genre) {
    errors.push({
      type: 'missing_field',
      description: '缺少题材',
      severity: 'blocking',
      location: { path: 'basic.genre' },
    });
  }

  if (!outline.basic?.oneLineSummary) {
    warnings.push({
      type: 'missing_field',
      description: '缺少一句话概括',
      location: { path: 'basic.oneLineSummary' },
    });
  }

  if (!outline.protagonist?.name) {
    errors.push({
      type: 'missing_field',
      description: '缺少主角名',
      severity: 'blocking',
      location: { path: 'protagonist.name' },
    });
  }

  if (!outline.volumes?.length) {
    errors.push({
      type: 'missing_field',
      description: '缺少卷级规划',
      severity: 'blocking',
      location: { path: 'volumes' },
    });
  }

  // 字数匹配检查
  if (outline.basic?.targetWordCount && outline.volumes?.length) {
    const totalVolumeWords = outline.volumes.reduce((sum, v) => {
      const range = v.chapterRange;
      const chapters = range[1] - range[0] + 1;
      return sum + chapters * 3000; // 假设每章3000字
    }, 0);
    
    const diff = Math.abs(outline.basic.targetWordCount - totalVolumeWords);
    const tolerance = outline.basic.targetWordCount * 0.2; // 20%容差
    
    if (diff > tolerance) {
      warnings.push({
        type: 'word_count_mismatch',
        description: `计划字数(${totalVolumeWords})与目标字数(${outline.basic.targetWordCount})差异较大`,
        location: { path: 'basic.targetWordCount' },
      });
    }
  }

  // 主角设定检查
  if (outline.protagonist) {
    if (!outline.protagonist.goldenFinger) {
      warnings.push({
        type: 'missing_field',
        description: '缺少金手指设定',
        location: { path: 'protagonist.goldenFinger' },
      });
    }

    if (!outline.protagonist.motivation) {
      warnings.push({
        type: 'missing_field',
        description: '缺少主角核心动机',
        location: { path: 'protagonist.motivation' },
      });
    }

    if (!outline.protagonist.currentDilemma) {
      warnings.push({
        type: 'missing_field',
        description: '缺少主角当前困境',
        location: { path: 'protagonist.currentDilemma' },
      });
    }
  }

  // 八条故事线检查
  if (!outline.eightStrands) {
    warnings.push({
      type: 'missing_field',
      description: '缺少八条故事线规划',
      location: { path: 'eightStrands' },
    });
  }

  // 爽点密度检查
  if (outline.coolPointDesign?.density) {
    const density = outline.coolPointDesign.density;
    if (density.micro !== COOL_POINT_DENSITY.micro) {
      warnings.push({
        type: 'density_mismatch',
        description: `微爽点间隔(${density.micro})不符合推荐值(${COOL_POINT_DENSITY.micro})`,
        location: { path: 'coolPointDesign.density.micro' },
      });
    }
  }

  // 卷数合理性检查
  if (outline.volumes?.length) {
    const totalChapters = outline.volumes.reduce((sum, v) => {
      return sum + (v.chapterRange[1] - v.chapterRange[0] + 1);
    }, 0);

    if (totalChapters < 30) {
      warnings.push({
        type: 'insufficient_chapters',
        description: `总章节数(${totalChapters})偏少，建议至少30章`,
        location: { path: 'volumes' },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 章节节点格式验证
 */
export function validateChapterNodes(chapter: Partial<ChapterCommit>): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  // 节点格式正则
  const nodePattern = /^.+?\s*\|\s*.+?\s*\|\s*.+?$/;

  // CBN 验证
  if (chapter.nodes?.cbn) {
    if (!nodePattern.test(chapter.nodes.cbn.description)) {
      errors.push({
        type: 'invalid_format',
        description: 'CBN格式错误，应为：主体 | 动作 | 对象',
        severity: 'blocking',
        location: { path: 'nodes.cbn' },
      });
    }
  } else {
    errors.push({
      type: 'missing_field',
      description: '缺少CBN（章节起点）',
      severity: 'blocking',
      location: { path: 'nodes.cbn' },
    });
  }

  // CPN 验证
  if (chapter.nodes?.cpns) {
    if (chapter.nodes.cpns.length < 2) {
      errors.push({
        type: 'insufficient_cpns',
        description: `CPN数量(${chapter.nodes.cpns.length})少于2个`,
        severity: 'blocking',
        location: { path: 'nodes.cpns' },
      });
    }

    if (chapter.nodes.cpns.length > 4) {
      warnings.push({
        type: 'too_many_cpns',
        description: `CPN数量(${chapter.nodes.cpns.length})超过4个，可能过于复杂`,
        location: { path: 'nodes.cpns' },
      });
    }

    // 格式检查
    chapter.nodes.cpns.forEach((cpn, index) => {
      if (!nodePattern.test(cpn.description)) {
        errors.push({
          type: 'invalid_format',
          description: `CPN${index + 1}格式错误，应为：主体 | 动作 | 对象`,
          severity: 'blocking',
          location: { path: `nodes.cpns[${index}]` },
        });
      }
    });
  } else {
    errors.push({
      type: 'missing_field',
      description: '缺少CPN（推进节点）',
      severity: 'blocking',
      location: { path: 'nodes.cpns' },
    });
  }

  // CEN 验证
  if (chapter.nodes?.cen) {
    if (!nodePattern.test(chapter.nodes.cen.description)) {
      errors.push({
        type: 'invalid_format',
        description: 'CEN格式错误，应为：主体 | 动作 | 对象',
        severity: 'blocking',
        location: { path: 'nodes.cen' },
      });
    }
  } else {
    errors.push({
      type: 'missing_field',
      description: '缺少CEN（章节终点）',
      severity: 'blocking',
      location: { path: 'nodes.cen' },
    });
  }

  // 必填字段检查
  if (!chapter.requirements?.objective) {
    errors.push({
      type: 'missing_field',
      description: '缺少章节目标',
      severity: 'blocking',
      location: { path: 'requirements.objective' },
    });
  }

  if (!chapter.requirements?.resistance) {
    errors.push({
      type: 'missing_field',
      description: '缺少章节阻力',
      severity: 'blocking',
      location: { path: 'requirements.resistance' },
    });
  }

  if (!chapter.requirements?.coolPoint) {
    errors.push({
      type: 'missing_field',
      description: '缺少章节爽点',
      severity: 'blocking',
      location: { path: 'requirements.coolPoint' },
    });
  }

  // 禁区检查
  if (chapter.forbiddenZones && chapter.forbiddenZones.length > 5) {
    warnings.push({
      type: 'too_many_forbidden',
      description: `禁区数量(${chapter.forbiddenZones.length})超过5条`,
      location: { path: 'forbiddenZones' },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 节拍表验证
 */
export function validateBeatTable(beats: Beat[], totalChapters: number): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  // 必填节拍检查
  const requiredNodes = ['Opening', 'Climax', 'Ending'];
  const existingNodes = beats.map(b => b.node);
  
  for (const required of requiredNodes) {
    if (!existingNodes.includes(required)) {
      errors.push({
        type: 'missing_beat',
        description: `缺少必要的节拍：${required}`,
        severity: 'blocking',
        location: { path: 'beats' },
      });
    }
  }

  // 章节范围重叠检查
  for (let i = 0; i < beats.length; i++) {
    for (let j = i + 1; j < beats.length; j++) {
      const beat1 = beats[i];
      const beat2 = beats[j];
      
      const overlap = !(
        beat1.chapterRange[1] < beat2.chapterRange[0] ||
        beat1.chapterRange[0] > beat2.chapterRange[1]
      );

      if (overlap) {
        warnings.push({
          type: 'chapter_overlap',
          description: `节拍${beat1.node}和${beat2.node}章节范围重叠`,
          location: { path: `beats[${i}]` },
        });
      }
    }
  }

  // 中段反转检查
  const midpoint = beats.find(b => b.node === 'Midpoint');
  if (!midpoint) {
    warnings.push({
      type: 'missing_midpoint',
      description: '缺少中段反转（Midpoint）',
      location: { path: 'beats' },
    });
  }

  // 节拍顺序检查
  const nodeOrder = ['Opening', 'Development', 'Twist1', 'Twist2', 'Climax', 'ConflictResolution', 'Twist3', 'Ending'];
  const sortedBeats = [...beats].sort((a, b) => {
    const orderA = nodeOrder.indexOf(a.node);
    const orderB = nodeOrder.indexOf(b.node);
    return orderA - orderB;
  });

  for (let i = 1; i < sortedBeats.length; i++) {
    if (sortedBeats[i].chapterRange[0] < sortedBeats[i - 1].chapterRange[0]) {
      warnings.push({
        type: 'beat_order',
        description: `节拍${sortedBeats[i].node}出现在${sortedBeats[i - 1].node}之前`,
        location: { path: `beats[${i}]` },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 时间线验证
 */
export function validateTimeline(anchors: { chapter: number; absoluteTime: string; gapFromPrevious?: string }[]): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  // 时间线单调性检查
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const curr = anchors[i];
    
    // 检查章节编号是否递增
    if (curr.chapter <= prev.chapter) {
      errors.push({
        type: 'time_violation',
        description: `第${curr.chapter}章的章节编号不递增`,
        severity: 'blocking',
        location: { path: `timeline[${i}]` },
      });
    }

    // 检查时间锚点是否合理
    if (curr.gapFromPrevious && curr.gapFromPrevious !== '-') {
      // 负的时间差表示回溯
      if (curr.gapFromPrevious.startsWith('-') || curr.gapFromPrevious.startsWith('倒')) {
        if (!curr.gapFromPrevious.includes('闪回')) {
          errors.push({
            type: 'time_regression',
            description: `第${curr.chapter}章时间线回退且未标注闪回`,
            severity: 'blocking',
            location: { path: `timeline[${i}]` },
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 章节连续性验证
 */
export function validateChapterContinuity(
  currentChapter: Partial<ChapterCommit>,
  previousChapter?: Partial<ChapterCommit>
): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  if (!previousChapter) {
    return { valid: true, errors: [], warnings: [] };
  }

  // 检查 CEN -> CBN 连续性
  if (previousChapter.nodes?.cen && currentChapter.nodes?.cbn) {
    const previousEnd = previousChapter.nodes.cen.description;
    const currentStart = currentChapter.nodes.cbn.description;

    // 简单检查：如果 CEN 和 CBN 完全相同，可能有问题
    if (previousEnd === currentStart) {
      warnings.push({
        type: 'continuity_issue',
        description: '本章起点与上章终点完全相同，可能存在连续性问题',
        location: { path: 'nodes.cbn' },
      });
    }
  }

  // 检查时间线连续性
  if (previousChapter.requirements?.timeAnchor && currentChapter.requirements?.timeAnchor) {
    // 时间锚点应该不同或有时间差说明
    if (
      previousChapter.requirements.timeAnchor === currentChapter.requirements.timeAnchor &&
      !currentChapter.requirements.countdownStatus
    ) {
      warnings.push({
        type: 'time_continuity',
        description: '本章与上章时间锚点相同',
        location: { path: 'requirements.timeAnchor' },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 爽点密度验证
 */
export function validateCoolPointDensity(
  coolPoints: { chapter: number; type: 'micro' | 'small' | 'big' }[],
  totalChapters: number
): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  // 按类型分组
  const microPoints = coolPoints.filter(p => p.type === 'micro');
  const smallPoints = coolPoints.filter(p => p.type === 'small');
  const bigPoints = coolPoints.filter(p => p.type === 'big');

  // 检查微爽点密度
  const expectedMicroPerChapter = COOL_POINT_DENSITY.micro;
  const actualMicroPerChapter = totalChapters / (microPoints.length || 1);
  
  if (actualMicroPerChapter > expectedMicroPerChapter * 1.5) {
    warnings.push({
      type: 'low_cool_point_density',
      description: `微爽点密度不足，实际间隔(${Math.round(actualMicroPerChapter)}字)超过推荐值(${expectedMicroPerChapter}字)`,
      location: { path: 'coolPointDesign' },
    });
  }

  // 检查小爽点密度
  const expectedSmallInterval = COOL_POINT_DENSITY.small;
  const actualSmallInterval = totalChapters * 3000 / (smallPoints.length || 1);
  
  if (actualSmallInterval > expectedSmallInterval * 1.5) {
    warnings.push({
      type: 'low_small_cool_point_density',
      description: `小爽点间隔过大，实际(${Math.round(actualSmallInterval)}字)超过推荐值(${expectedSmallInterval}字)`,
      location: { path: 'coolPointDesign' },
    });
  }

  // 检查大爽点
  if (bigPoints.length === 0) {
    warnings.push({
      type: 'missing_big_cool_point',
      description: `全书缺少大爽点，建议至少2-3个`,
      location: { path: 'coolPointDesign' },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 伏笔验证
 */
export function validateForeshadow(
  foreshadows: { buriedChapter: number; payoffChapter: number; status: string }[]
): ValidationResult {
  const errors: Violation[] = [];
  const warnings: Warning[] = [];

  // 检查伏笔回收
  const activeForeshadows = foreshadows.filter(f => f.status === 'active');
  const fulfilledForeshadows = foreshadows.filter(f => f.status === 'fulfilled');

  if (activeForeshadows.length > 20) {
    warnings.push({
      type: 'too_many_active_foreshadows',
      description: `活跃伏笔数量(${activeForeshadows.length})偏多，建议控制在20个以内`,
      location: { path: 'foreshadowTable' },
    });
  }

  // 检查伏笔回收时间
  for (const fs of foreshadows) {
    if (fs.payoffChapter < fs.buriedChapter) {
      errors.push({
        type: 'invalid_foreshadow_timing',
        description: `伏笔回收章节(${fs.payoffChapter})早于埋设章节(${fs.buriedChapter})`,
        severity: 'blocking',
        location: { path: `foreshadowTable[${foreshadows.indexOf(fs)}]` },
      });
    }

    // 伏笔跨度检查
    const span = fs.payoffChapter - fs.buriedChapter;
    if (span > 100) {
      warnings.push({
        type: 'long_foreshadow_span',
        description: `伏笔跨度(${span}章)较大，可能需要增加中间提示`,
        location: { path: `foreshadowTable[${foreshadows.indexOf(fs)}]` },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
