<script setup lang="ts">
/**
 * OutlineVisualizer - 大纲可视化预览组件
 * 
 * 以树形结构展示大纲，包括四幕结构、章节详情、伏笔、角色等
 */
import { ref, computed, watch } from 'vue';
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  Users,
  Zap,
  Clock,
  MapPin,
  Flag,
  Eye,
  EyeOff,
  Sparkles,
  Target,
  Layers,
  Link2,
  ShieldAlert,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Route,
} from 'lucide-vue-next';
import { NEmpty, NTag } from 'naive-ui';
import type { GeneratedCharacter, GeneratedChapter, GeneratedForeshadow, GeneratedOutline } from '@/types/inspiration';
import { RELATIONSHIP_TYPE_LABELS } from '@/types/project';

/**
 * 可视化节点
 */
interface VisualNode {
  id: string;
  type: 'act' | 'chapter' | 'volume' | 'foreshadow' | 'character' | 'world';
  title: string;
  description?: string;
  status?: 'pending' | 'active' | 'completed';
  children?: VisualNode[];
  metadata?: Record<string, any>;
  expanded?: boolean;
}

interface WorldSettingSummaryCard {
  title: string;
  count: number;
  icon: typeof MapPin;
  badgeType: 'info' | 'success' | 'warning';
}

const WORLD_SETTING_CARDS: WorldSettingSummaryCard[] = [
  {
    title: '核心地点',
    count: 0,
    icon: MapPin,
    badgeType: 'info',
  },
  {
    title: '关键势力',
    count: 0,
    icon: Flag,
    badgeType: 'success',
  },
  {
    title: '世界规则',
    count: 0,
    icon: ShieldAlert,
    badgeType: 'warning',
  },
];

const props = defineProps<{
  /** 大纲数据 */
  outline: GeneratedOutline;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectChapter', chapter: GeneratedChapter): void;
  (e: 'selectCharacter', character: GeneratedCharacter): void;
  (e: 'selectForeshadow', foreshadow: GeneratedForeshadow): void;
}>();

// 展开状态
const expandedNodes = ref<Set<string>>(new Set());

// 初始化展开状态
watch(
  () => props.defaultExpanded,
  (expanded) => {
    if (expanded) {
      // 展开所有节点
      visualTree.value.forEach(node => {
        expandedNodes.value.add(node.id);
        node.children?.forEach(child => {
          expandedNodes.value.add(child.id);
        });
      });
    }
  },
  { immediate: true }
);

// 四幕结构名称映射
const actNames: Record<string, string> = {
  act1: '第一幕（建置）',
  act2a: '第二幕A（对抗）',
  act2b: '第二幕B（至暗）',
  act3: '第三幕（结局）',
};

// 故事线名称映射
const strandNames: Record<string, string> = {
  quest: '主线',
  fire: '感情线',
  constellation: '世界观线',
};

// 伏笔分期名称
const phaseNames: Record<string, string> = {
  early: '早期伏笔',
  mid: '中期伏笔',
  late: '长期伏笔',
};

const characterRoleNames: Record<string, string> = {
  protagonist: '主角',
  ally: '盟友',
  antagonist: '反派',
  mentor: '导师',
  support: '配角',
};

function getRelationshipTypeDisplayText(type?: string): string {
  if (!type) return '';

  const normalizedType = type.trim().toLowerCase();
  const projectLabel = RELATIONSHIP_TYPE_LABELS[normalizedType as keyof typeof RELATIONSHIP_TYPE_LABELS]?.label;
  if (projectLabel) {
    return projectLabel;
  }

  const outlineRelationshipNames: Record<string, string> = {
    ally: '盟友',
    enemy: '敌对',
    mentor: '导师',
    family: '家人',
    lover: '情感',
    rival: '竞争',
    use: '利用',
    unknown: '复杂关系',
  };

  if (outlineRelationshipNames[normalizedType]) {
    return outlineRelationshipNames[normalizedType];
  }

  if (normalizedType.includes('ally') || normalizedType.includes('alliance')) return '盟友';
  if (normalizedType.includes('enemy')) return '敌对';
  if (normalizedType.includes('mentor')) return '导师';
  if (normalizedType.includes('family')) return '家人';
  if (normalizedType.includes('lover') || normalizedType.includes('love') || normalizedType.includes('romance')) return '情感';
  if (normalizedType.includes('rival') || normalizedType.includes('compet')) return '竞争';
  if (normalizedType.includes('use') || normalizedType.includes('control') || normalizedType.includes('manip')) return '利用';
  if (normalizedType.includes('friend')) return '朋友';
  if (normalizedType.includes('student')) return '弟子';
  if (normalizedType.includes('neutral')) return '中立';
  if (normalizedType.includes('unknown')) return '复杂关系';

  return type;
}

// 情绪弧线中文映射
const emotionArcNames: Record<string, string> = {
  rising: '上升型',
  falling: '下降型',
  wave: '波浪型',
  mixed: '混合型',
};

const foreshadowTypeNames: Record<string, string> = {
  item: '物件伏笔',
  dialogue: '对话伏笔',
  event: '事件伏笔',
  mystery: '谜团伏笔',
  character: '角色伏笔',
  ability: '能力伏笔',
  identity: '身份伏笔',
  relationship: '关系伏笔',
  'world-rule': '规则伏笔',
};

const foreshadowImportanceNames: Record<string, string> = {
  main: '主线',
  subplot: '支线',
  emotion: '情感',
};

function getForeshadowPhase(foreshadow: GeneratedForeshadow): string {
  const setupChapter = foreshadow.setupChapter ?? 0;
  const payoffChapter = foreshadow.payoffChapter ?? foreshadow.suggestedChapter ?? 0;
  const referenceChapter = Math.max(setupChapter, payoffChapter);

  if (referenceChapter > 60) return 'late';
  if (referenceChapter > 30) return 'mid';
  if (referenceChapter > 0) return 'early';
  return 'undefined';
}

function getForeshadowTimelineLabel(foreshadow: GeneratedForeshadow): string {
  const setup = foreshadow.setupChapter ? `埋设第${foreshadow.setupChapter}章` : '埋设待定';
  const payoff = foreshadow.payoffChapter
    ? `回收第${foreshadow.payoffChapter}章`
    : foreshadow.suggestedChapter
      ? `回收约第${foreshadow.suggestedChapter}章`
      : '回收待定';
  return `${setup} · ${payoff}`;
}

function getCharacterRelationshipCount(character: GeneratedCharacter): number {
  return character.relationships?.length ?? 0;
}

interface DensityMetric {
  key: string;
  label: string;
  value: number;
  recommended: number;
  status: 'good' | 'warning';
  helper: string;
}

function normalizeRelationshipPair(source: string, target: string): string {
  return [source.trim(), target.trim()].sort((a, b) => a.localeCompare(b)).join('::');
}

function getForeshadowTier(foreshadow: GeneratedForeshadow): 'short' | 'mid' | 'long' | 'endgame' {
  const setupChapter = foreshadow.setupChapter ?? 0;
  const payoffChapter = foreshadow.payoffChapter ?? foreshadow.suggestedChapter ?? 0;

  if (payoffChapter >= 90 || setupChapter >= 60) return 'endgame';
  if (payoffChapter >= 50 || setupChapter >= 20) return 'long';
  if (payoffChapter >= 30 || setupChapter >= 10) return 'mid';
  return 'short';
}

const densityDiagnostics = computed(() => {
  const characters = outlineCharacters.value;
  const foreshadows = outlineForeshadows.value;

  const nonProtagonistRelationPairs = new Set(
    characters.flatMap((character) =>
      (character.relationships ?? [])
        .filter((relationship) => relationship.targetName && relationship.targetName !== character.name)
        .filter((relationship) => character.role !== 'protagonist' && relationship.targetName !== protagonistName.value)
        .map((relationship) => normalizeRelationshipPair(character.name, relationship.targetName))
    )
  );

  const foreshadowTypes = new Set(foreshadows.map((foreshadow) => foreshadow.type).filter(Boolean));
  const foreshadowTierCounts = foreshadows.reduce<Record<'short' | 'mid' | 'long' | 'endgame', number>>((acc, foreshadow) => {
    acc[getForeshadowTier(foreshadow)] += 1;
    return acc;
  }, {
    short: 0,
    mid: 0,
    long: 0,
    endgame: 0,
  });

  const metrics: DensityMetric[] = [
    {
      key: 'characters',
      label: '关键角色数',
      value: characters.length,
      recommended: 10,
      status: characters.length >= 10 ? 'good' : 'warning',
      helper: '长篇建议至少 10 个关键角色，含常驻、接棒、势力代表。',
    },
    {
      key: 'relationship-links',
      label: '非主角关系链',
      value: nonProtagonistRelationPairs.size,
      recommended: 3,
      status: nonProtagonistRelationPairs.size >= 3 ? 'good' : 'warning',
      helper: '至少 3 组非主角之间的关系或利益冲突，避免所有人只围着主角转。',
    },
    {
      key: 'foreshadows',
      label: '伏笔总数',
      value: foreshadows.length,
      recommended: 10,
      status: foreshadows.length >= 10 ? 'good' : 'warning',
      helper: '长篇建议至少 10 条伏笔，覆盖前中后期与终局。',
    },
    {
      key: 'foreshadow-types',
      label: '伏笔类型覆盖',
      value: foreshadowTypes.size,
      recommended: 5,
      status: foreshadowTypes.size >= 5 ? 'good' : 'warning',
      helper: '建议至少覆盖 5 类伏笔，避免谜团同质化。',
    },
    {
      key: 'short-foreshadows',
      label: '短伏笔',
      value: foreshadowTierCounts.short,
      recommended: 3,
      status: foreshadowTierCounts.short >= 3 ? 'good' : 'warning',
      helper: '前 30 章建议至少 3 条短伏笔，提升追读动力。',
    },
    {
      key: 'mid-foreshadows',
      label: '中伏笔',
      value: foreshadowTierCounts.mid,
      recommended: 3,
      status: foreshadowTierCounts.mid >= 3 ? 'good' : 'warning',
      helper: '中期建议至少 3 条中伏笔，支撑第二卷推进。',
    },
    {
      key: 'long-foreshadows',
      label: '长伏笔',
      value: foreshadowTierCounts.long,
      recommended: 2,
      status: foreshadowTierCounts.long >= 2 ? 'good' : 'warning',
      helper: '后期建议至少 2 条长伏笔，服务大高潮。',
    },
    {
      key: 'endgame-foreshadows',
      label: '终局伏笔',
      value: foreshadowTierCounts.endgame,
      recommended: 2,
      status: foreshadowTierCounts.endgame >= 2 ? 'good' : 'warning',
      helper: '建议至少 2 条终局伏笔，支撑结局反转与收束。',
    },
  ];

  const warningCount = metrics.filter((metric) => metric.status === 'warning').length;

  return {
    metrics,
    warningCount,
    score: metrics.length - warningCount,
    total: metrics.length,
    foreshadowTierCounts,
  };
});

const outlineCharacters = computed(() => props.outline.characters ?? []);
const outlineForeshadows = computed(() => props.outline.foreshadows ?? []);
const protagonistName = computed(() => outlineCharacters.value.find((character) => character.role === 'protagonist')?.name ?? '主角');

const worldSettingCards = computed<WorldSettingSummaryCard[]>(() => {
  const worldSetting = props.outline.worldSetting;
  if (!worldSetting) return [];

  const counts = {
    '核心地点': worldSetting.locations?.length ?? 0,
    '关键势力': worldSetting.factions?.length ?? 0,
    '世界规则': worldSetting.rules?.length ?? 0,
  };

  return WORLD_SETTING_CARDS
    .map((card) => ({
      ...card,
      count: counts[card.title as keyof typeof counts] ?? 0,
    }))
    .filter((card) => card.count > 0);
});

const emotionSummary = computed(() => {
  const emotion = props.outline.emotionGoal;
  if (!emotion) return null;

  return {
    primary: emotion.primary || '未设定',
    secondary: emotion.secondary,
    arc: emotionArcNames[emotion.arc] ?? emotion.arc ?? '混合型',
    highPointsLabel: emotion.highPoints?.length ? emotion.highPoints.join('、') : '未标注',
    lowPointsLabel: emotion.lowPoints?.length ? emotion.lowPoints.join('、') : '未标注',
    densityLabel: emotion.density ? `约每${emotion.density}字波动一次` : '未标注',
  };
});

const storyLineEntries = computed(() => {
  const storyLines = props.outline.storyLines;
  if (!storyLines) return [];

  return [
    { key: 'map', label: '地图线', value: storyLines.map, icon: MapPin },
    { key: 'faction', label: '阵营线', value: storyLines.faction, icon: Flag },
    { key: 'character', label: '人物线', value: storyLines.character, icon: Users },
    { key: 'goldenfinger', label: '金手指线', value: storyLines.goldenfinger, icon: Sparkles },
    { key: 'worldRules', label: '世界规则线', value: storyLines.worldRules, icon: ShieldAlert },
    { key: 'conflict', label: '矛盾线', value: storyLines.conflict, icon: AlertTriangle },
    { key: 'collection', label: '收集线', value: storyLines.collection, icon: Target },
    { key: 'romance', label: '感情线', value: storyLines.romance, icon: Link2 },
  ].filter((entry) => entry.value)
    .map((entry) => ({
      ...entry,
      icon: entry.icon ?? Route,
    }));
});

/**
 * 转换为可视化树
 */
const visualTree = computed<VisualNode[]>(() => {
  const nodes: VisualNode[] = [];
  const outline = props.outline;

  // 1. 四幕结构
  if (outline.structure) {
    const structureNode: VisualNode = {
      id: 'structure',
      type: 'volume',
      title: '四幕结构',
      expanded: true,
      children: [],
    };

    ['act1', 'act2a', 'act2b', 'act3'].forEach(actKey => {
      const act = outline.structure[actKey as keyof typeof outline.structure];
      if (act) {
        const actTitle = typeof act === 'string' ? act : actNames[actKey];
        const actContent = '';

        structureNode.children!.push({
          id: `structure-${actKey}`,
          type: 'act',
          title: actNames[actKey] || actKey,
          description: actContent || actTitle,
          children: [],
        });
      }
    });

    nodes.push(structureNode);
  }

  // 2. 世界与势力
  if (outline.worldSetting && (
    outline.worldSetting.locations?.length ||
    outline.worldSetting.factions?.length ||
    outline.worldSetting.rules?.length
  )) {
    const worldNode: VisualNode = {
      id: 'world-setting',
      type: 'world',
      title: '世界与势力',
      description: [
        outline.worldSetting.locations?.length ? `${outline.worldSetting.locations.length}个地点` : '',
        outline.worldSetting.factions?.length ? `${outline.worldSetting.factions.length}个势力` : '',
        outline.worldSetting.rules?.length ? `${outline.worldSetting.rules.length}条规则` : '',
      ].filter(Boolean).join(' · '),
      expanded: false,
      children: [],
    };

    if (outline.worldSetting.locations?.length) {
      worldNode.children!.push({
        id: 'world-setting-locations',
        type: 'world',
        title: '核心地点',
        description: `${outline.worldSetting.locations.length}个地点`,
        children: outline.worldSetting.locations.map((location, index) => ({
          id: `world-location-${index}`,
          type: 'world',
          title: location.name,
          description: location.description || '',
          metadata: {
            level: location.level,
            parentName: location.parentName,
          },
        })),
      });
    }

    if (outline.worldSetting.factions?.length) {
      worldNode.children!.push({
        id: 'world-setting-factions',
        type: 'world',
        title: '关键势力',
        description: `${outline.worldSetting.factions.length}个势力`,
        children: outline.worldSetting.factions.map((faction, index) => ({
          id: `world-faction-${index}`,
          type: 'world',
          title: faction.name,
          description: faction.description || '',
          metadata: {
            allies: faction.allies,
            enemies: faction.enemies,
            parentName: faction.parentName,
          },
        })),
      });
    }

    if (outline.worldSetting.rules?.length) {
      worldNode.children!.push({
        id: 'world-setting-rules',
        type: 'world',
        title: '世界规则',
        description: `${outline.worldSetting.rules.length}条规则`,
        children: outline.worldSetting.rules.map((rule, index) => ({
          id: `world-rule-${index}`,
          type: 'world',
          title: rule.name,
          description: rule.description || '',
          metadata: {
            category: rule.category,
            relatedRuleNames: rule.relatedRuleNames,
          },
        })),
      });
    }

    nodes.push(worldNode);
  }

  // 3. 章节概览
  if (outline.chapters && outline.chapters.length > 0) {
    const chaptersNode: VisualNode = {
      id: 'chapters',
      type: 'volume',
      title: `章节大纲（${outline.chapters.length}章）`,
      expanded: true,
      children: outline.chapters.map((chapter, index) => {
        const chapterNode: VisualNode = {
          id: `chapter-${chapter.number || index + 1}`,
          type: 'chapter',
          title: chapter.title || `第${chapter.number || index + 1}章`,
          description: chapter.summary || '',
          status: chapter.status as any || 'outline',
          metadata: {
            coreEvent: chapter.coreEvent,
            hook: chapter.hook,
            coolPoints: chapter.coolPoints,
            strand: chapter.strand,
            chapterNumber: chapter.number || index + 1,
          },
          children: [],
        };

        // 添加章节详情子节点
        if (chapter.coreEvent) {
          chapterNode.children!.push({
            id: `chapter-${chapter.number || index + 1}-core`,
            type: 'chapter',
            title: '核心事件',
            description: chapter.coreEvent,
          });
        }

        if (chapter.coolPoints && chapter.coolPoints.length > 0) {
          chapterNode.children!.push({
            id: `chapter-${chapter.number || index + 1}-cool`,
            type: 'chapter',
            title: `爽点（${chapter.coolPoints.length}个）`,
            description: chapter.coolPoints.join('；'),
          });
        }

        if (chapter.hook) {
          chapterNode.children!.push({
            id: `chapter-${chapter.number || index + 1}-hook`,
            type: 'chapter',
            title: '章尾钩子',
            description: chapter.hook,
          });
        }

        return chapterNode;
      }),
    };

    nodes.push(chaptersNode);
  }

  // 3. 伏笔布局
  if (outline.foreshadows && outline.foreshadows.length > 0) {
    const foreshadowsNode: VisualNode = {
      id: 'foreshadows',
      type: 'volume',
      title: `伏笔布局（${outline.foreshadows.length}个）`,
      expanded: false,
      children: [],
    };

    // 按分期分组
    const phaseGroups: Record<string, GeneratedForeshadow[]> = {
      early: [],
      mid: [],
      late: [],
      undefined: [],
    };

    outline.foreshadows.forEach(fs => {
      const phase = getForeshadowPhase(fs);
      if (!phaseGroups[phase]) {
        phaseGroups[phase] = [];
      }
      phaseGroups[phase].push(fs);
    });

    Object.entries(phaseGroups).forEach(([phase, fses]) => {
      if (fses.length > 0) {
        const phaseNode: VisualNode = {
          id: `foreshadow-phase-${phase}`,
          type: 'foreshadow',
          title: phaseNames[phase] || '伏笔',
          description: `${fses.length}个伏笔`,
          children: fses.map((fs, index) => ({
            id: `foreshadow-${phase}-${index}`,
            type: 'foreshadow',
            title: fs.hint.substring(0, 30) + (fs.hint.length > 30 ? '...' : ''),
            description: getForeshadowTimelineLabel(fs),
            status: 'active',
            metadata: {
              type: fs.type,
              phase,
              suggestedChapter: fs.suggestedChapter,
              setupChapter: fs.setupChapter,
              payoffChapter: fs.payoffChapter,
              payoffValue: fs.payoffValue,
              carrierCharacter: fs.carrierCharacter,
              linkedConflict: fs.linkedConflict,
              importance: fs.importance,
              hint: fs.hint,
            },
          })),
        };

        foreshadowsNode.children!.push(phaseNode);
      }
    });

    nodes.push(foreshadowsNode);
  }

  // 4. 角色列表
  if (outline.characters && outline.characters.length > 0) {
    const charactersNode: VisualNode = {
      id: 'characters',
      type: 'volume',
      title: `角色（${outline.characters.length}个）`,
      expanded: false,
      children: outline.characters.map((char, index) => ({
        id: `character-${index}`,
        type: 'character',
        title: char.name,
        description: char.description || '',
        metadata: {
          role: char.role,
          personality: char.personality,
          background: char.background,
          abilities: char.abilities,
          relationships: char.relationships,
          relationshipCount: getCharacterRelationshipCount(char),
        },
      })),
    };

    nodes.push(charactersNode);
  }

  // 5. 核心卖点
  if (outline.coreSellingPoints && outline.coreSellingPoints.length > 0) {
    nodes.push({
      id: 'core-selling-points',
      type: 'volume',
      title: '核心卖点',
      children: outline.coreSellingPoints.map((sp, index) => ({
        id: `selling-point-${index}`,
        type: 'volume',
        title: sp.name || `卖点${index + 1}`,
        description: sp.description || '',
        metadata: { priority: sp.priority || 1 },
      })),
    });
  }

  // 6. 情绪目标
  if (outline.emotionGoal) {
    const emotion = outline.emotionGoal;
    nodes.push({
      id: 'emotion-goal',
      type: 'volume',
      title: '情绪目标',
      description: emotion.primary || '',
      metadata: {
        arc: emotion.arc,
        density: emotion.density,
        highPoints: emotion.highPoints,
        lowPoints: emotion.lowPoints,
      },
      children: [
        {
          id: 'emotion-primary',
          type: 'volume' as const,
          title: `核心情绪：${emotion.primary || '未设定'}`,
          description: `弧线类型：${emotionArcNames[emotion.arc] ?? emotion.arc ?? '上升型'}`,
        },
        ...(emotion.highPoints?.length ? [{
          id: 'emotion-high-points',
          type: 'volume' as const,
          title: `情绪高点章节：${emotion.highPoints.join('、')}`,
          description: '',
        }] : []),
        ...(emotion.lowPoints?.length ? [{
          id: 'emotion-low-points',
          type: 'volume' as const,
          title: `情绪低点章节：${emotion.lowPoints.join('、')}`,
          description: '',
        }] : []),
      ],
    });
  }

  // 7. 爽点设计
  if (outline.coolPointDesign) {
    const coolPoint = outline.coolPointDesign;
    nodes.push({
      id: 'cool-point-design',
      type: 'volume',
      title: '爽点设计',
      description: `类型：${(coolPoint.patterns || []).join('、')}`,
      children: [
        ...((coolPoint.patterns || []).map((pattern, index) => ({
          id: `cool-pattern-${index}`,
          type: 'volume' as const,
          title: `爽点类型：${pattern}`,
          description: '',
        }))),
        ...(coolPoint.arranged || []).map((cp, index) => ({
          id: `cool-arranged-${index}`,
          type: 'volume' as const,
          title: cp.suggestedChapter ? `第${cp.suggestedChapter}章：${cp.type}` : cp.type,
          description: cp.description,
        })),
      ],
    });
  }

  // 8. 八条故事线
  if (outline.storyLines) {
    const sl = outline.storyLines;
    nodes.push({
      id: 'story-lines',
      type: 'volume',
      title: '八条故事线',
      expanded: false,
      children: [
        ...(sl.map ? [{ id: 'sl-map', type: 'volume' as const, title: '地图线', description: sl.map }] : []),
        ...(sl.faction ? [{ id: 'sl-faction', type: 'volume' as const, title: '阵营线', description: sl.faction }] : []),
        ...(sl.character ? [{ id: 'sl-character', type: 'volume' as const, title: '人物线', description: sl.character }] : []),
        ...(sl.goldenfinger ? [{ id: 'sl-goldenfinger', type: 'volume' as const, title: '金手指线', description: sl.goldenfinger }] : []),
        ...(sl.worldRules ? [{ id: 'sl-worldRules', type: 'volume' as const, title: '世界观线', description: sl.worldRules }] : []),
        ...(sl.conflict ? [{ id: 'sl-conflict', type: 'volume' as const, title: '矛盾线', description: sl.conflict }] : []),
        ...(sl.collection ? [{ id: 'sl-collection', type: 'volume' as const, title: '收集线', description: sl.collection }] : []),
        ...(sl.romance ? [{ id: 'sl-romance', type: 'volume' as const, title: '感情线', description: sl.romance }] : []),
      ],
    });
  }

  // 9. 矛盾设计
  if (outline.conflictDesign) {
    const cd = outline.conflictDesign;
    nodes.push({
      id: 'conflict-design',
      type: 'volume',
      title: '矛盾设计',
      description: `冲突来源：${cd.source || '未设定'}`,
      children: [
        ...((cd.escalation || []).map((e, index) => ({
          id: `cd-escalation-${index}`,
          type: 'volume' as const,
          title: `矛盾层级${index + 1}：${e}`,
          description: '',
        }))),
        ...((cd.majorConflicts || []).map((c, index) => ({
          id: `cd-conflict-${index}`,
          type: 'volume' as const,
          title: `主要冲突${index + 1}：${c}`,
          description: '',
        }))),
      ],
    });
  }

  return nodes;
});

/**
 * 切换节点展开状态
 */
function toggleNode(nodeId: string) {
  if (expandedNodes.value.has(nodeId)) {
    expandedNodes.value.delete(nodeId);
  } else {
    expandedNodes.value.add(nodeId);
  }
}

function isExpanded(nodeId: string): boolean {
  return expandedNodes.value.has(nodeId);
}

/**
 * 获取节点图标
 */
function getNodeIcon(type: VisualNode['type']) {
  switch (type) {
    case 'act': return Layers;
    case 'chapter': return BookOpen;
    case 'volume': return Flag;
    case 'foreshadow': return Zap;
    case 'character': return Users;
    default: return Target;
  }
}

/**
 * 获取状态颜色
 */
function getStatusColor(status?: string): string {
  switch (status) {
    case 'complete': return 'success';
    case 'draft': return 'warning';
    case 'fulfilled': return 'info';
    default: return 'default';
  }
}
</script>

<template>
  <div class="outline-visualizer">
    <!-- 基本信息 -->
    <div class="mb-4 p-4 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800">
      <h3 class="text-lg font-semibold text-violet-900 dark:text-violet-100 mb-1">
        {{ outline.title || '未命名大纲' }}
      </h3>
      <p v-if="outline.synopsis" class="text-sm text-violet-700 dark:text-violet-300">
        {{ outline.synopsis }}
      </p>
      <div class="flex items-center gap-2 mt-2 flex-wrap">
        <NTag v-for="genre in outline.genres" :key="genre" size="small" type="info">
          {{ genre }}
        </NTag>
        <NTag v-if="outline.estimatedWordCount" size="small" type="warning">
          {{ Math.round(outline.estimatedWordCount / 10000) }}万字
        </NTag>
        <NTag v-if="outline.storyScale?.estimatedChapterCount" size="small" type="success">
          {{ outline.storyScale.estimatedChapterCount }}章
        </NTag>
        <NTag v-if="outline.storyScale?.suggestedVolumeCount" size="small" type="info">
          {{ outline.storyScale.suggestedVolumeCount }}卷
        </NTag>
        <NTag v-if="outline.storyScale?.startupPhaseRatio" size="small" type="default">
          前30章占比 {{ outline.storyScale.startupPhaseRatio }}
        </NTag>
        <NTag v-else-if="outline.chapters?.length" size="small" type="success">
          {{ outline.chapters.length }}章
        </NTag>
      </div>
      <div
        v-if="outline.storyScale"
        class="mt-3 grid gap-2 rounded-lg bg-white/70 px-3 py-3 text-xs text-violet-800 dark:bg-gray-800/60 dark:text-violet-200 md:grid-cols-2"
      >
        <div>
          <div class="font-medium text-violet-900 dark:text-violet-100">规模规划</div>
          <div class="mt-1 text-violet-700 dark:text-violet-300">
            目标字数：{{ outline.storyScale?.targetWordCount || '未标注' }}
          </div>
          <div class="text-violet-700 dark:text-violet-300">
            平均每章：{{ outline.storyScale?.averageWordsPerChapter || 2500 }}字
          </div>
          <div class="text-violet-700 dark:text-violet-300">
            每卷预计：{{ outline.storyScale?.estimatedChaptersPerVolume || '—' }}章
          </div>
        </div>
        <div v-if="outline.storyScale?.longformProgressionNote">
          <div class="font-medium text-violet-900 dark:text-violet-100">长线推进说明</div>
          <p class="mt-1 leading-5 text-violet-700 dark:text-violet-300">
            {{ outline.storyScale?.longformProgressionNote }}
          </p>
        </div>
      </div>

      <div
        v-if="emotionSummary || storyLineEntries.length"
        class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      >
        <div
          v-if="emotionSummary"
          class="rounded-xl border border-rose-200 bg-white/80 p-4 dark:border-rose-800 dark:bg-gray-800/60"
        >
          <div class="flex items-center gap-2 text-sm font-semibold text-rose-900 dark:text-rose-100">
            <Sparkles class="h-4 w-4 text-rose-500" />
            <span>情绪节奏</span>
          </div>
          <div class="mt-3 space-y-2 text-xs text-rose-800 dark:text-rose-200">
            <div class="flex items-center justify-between gap-3">
              <span>核心情绪</span>
              <span class="font-medium text-right">{{ emotionSummary.primary }}</span>
            </div>
            <div v-if="emotionSummary.secondary" class="flex items-center justify-between gap-3">
              <span>次级情绪</span>
              <span class="font-medium text-right">{{ emotionSummary.secondary }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>弧线类型</span>
              <span class="font-medium text-right">{{ emotionSummary.arc }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>情绪高点</span>
              <span class="font-medium text-right">{{ emotionSummary.highPointsLabel }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>情绪低点</span>
              <span class="font-medium text-right">{{ emotionSummary.lowPointsLabel }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>节奏密度</span>
              <span class="font-medium text-right">{{ emotionSummary.densityLabel }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="storyLineEntries.length"
          class="rounded-xl border border-sky-200 bg-white/80 p-4 dark:border-sky-800 dark:bg-gray-800/60"
        >
          <div class="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
            <GitBranch class="h-4 w-4 text-sky-500" />
            <span>故事线概览</span>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <div
              v-for="entry in storyLineEntries"
              :key="entry.key"
              class="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-3 dark:border-sky-900/60 dark:bg-sky-950/20"
            >
              <div class="flex items-center gap-2 text-xs font-medium text-sky-900 dark:text-sky-100">
                <component :is="entry.icon" class="h-3.5 w-3.5 text-sky-500" />
                <span>{{ entry.label }}</span>
              </div>
              <p class="mt-2 text-xs leading-5 text-sky-800 dark:text-sky-200">
                {{ entry.value }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="emotionSummary || storyLineEntries.length"
        class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      >
        <div
          v-if="emotionSummary"
          class="rounded-xl border border-rose-200 bg-white/80 p-4 dark:border-rose-800 dark:bg-gray-800/60"
        >
          <div class="flex items-center gap-2 text-sm font-semibold text-rose-900 dark:text-rose-100">
            <Sparkles class="h-4 w-4 text-rose-500" />
            <span>情绪节奏</span>
          </div>
          <div class="mt-3 space-y-2 text-xs text-rose-800 dark:text-rose-200">
            <div class="flex items-center justify-between gap-3">
              <span>核心情绪</span>
              <span class="font-medium text-right">{{ emotionSummary.primary }}</span>
            </div>
            <div v-if="emotionSummary.secondary" class="flex items-center justify-between gap-3">
              <span>次级情绪</span>
              <span class="font-medium text-right">{{ emotionSummary.secondary }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>弧线类型</span>
              <span class="font-medium text-right">{{ emotionSummary.arc }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>情绪高点</span>
              <span class="font-medium text-right">{{ emotionSummary.highPointsLabel }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>情绪低点</span>
              <span class="font-medium text-right">{{ emotionSummary.lowPointsLabel }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>节奏密度</span>
              <span class="font-medium text-right">{{ emotionSummary.densityLabel }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="storyLineEntries.length"
          class="rounded-xl border border-sky-200 bg-white/80 p-4 dark:border-sky-800 dark:bg-gray-800/60"
        >
          <div class="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
            <GitBranch class="h-4 w-4 text-sky-500" />
            <span>故事线概览</span>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <div
              v-for="entry in storyLineEntries"
              :key="entry.key"
              class="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-3 dark:border-sky-900/60 dark:bg-sky-950/20"
            >
              <div class="flex items-center gap-2 text-xs font-medium text-sky-900 dark:text-sky-100">
                <component :is="entry.icon" class="h-3.5 w-3.5 text-sky-500" />
                <span>{{ entry.label }}</span>
              </div>
              <p class="mt-2 text-xs leading-5 text-sky-800 dark:text-sky-200">
                {{ entry.value }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-800 dark:from-amber-900/20 dark:via-orange-900/10 dark:to-gray-900">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-3 rounded-xl border border-white/70 bg-white/75 p-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/55">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              <BarChart3 class="h-4 w-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-col gap-2">
                <div>
                  <h4 class="text-sm font-semibold text-amber-950 dark:text-amber-100">长篇密度质检</h4>
                  <p class="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    快速检查角色盘、关系网和伏笔层级是否达到长篇小说推荐密度。
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <NTag :type="densityDiagnostics.warningCount === 0 ? 'success' : 'warning'" size="small" round>
                    通过 {{ densityDiagnostics.score }}/{{ densityDiagnostics.total }}
                  </NTag>
                  <NTag v-if="densityDiagnostics.warningCount === 0" type="success" size="small" round>
                    结构达标
                  </NTag>
                  <NTag v-else type="warning" size="small" round>
                    {{ densityDiagnostics.warningCount }} 项待加强
                  </NTag>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div
            v-for="metric in densityDiagnostics.metrics"
            :key="metric.key"
            class="rounded-xl border px-4 py-4 shadow-sm transition-colors"
            :class="metric.status === 'good'
              ? 'border-emerald-200 bg-white/90 dark:border-emerald-800 dark:bg-gray-800/65'
              : 'border-amber-300 bg-amber-50/90 dark:border-amber-700 dark:bg-amber-950/35'"
          >
            <div class="flex items-start gap-3">
              <div
                class="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                :class="metric.status === 'good'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'"
              >
                <component
                  :is="metric.status === 'good' ? CheckCircle2 : AlertTriangle"
                  class="h-4 w-4"
                />
              </div>
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">{{ metric.label }}</div>
                    <p class="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                      {{ metric.helper }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-baseline gap-2 sm:pl-4">
                    <span class="text-2xl font-semibold leading-none text-gray-900 dark:text-white">{{ metric.value }}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">/ 建议 {{ metric.recommended }}</span>
                  </div>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/80">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="metric.status === 'good' ? 'bg-emerald-500' : 'bg-amber-500'"
                    :style="{ width: `${Math.min((metric.value / Math.max(metric.recommended, 1)) * 100, 100)}%` }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 可视化树 -->
    <div class="space-y-2">
      <template v-for="node in visualTree" :key="node.id">
        <!-- 顶层节点 -->
        <div
          class="rounded-lg border bg-white dark:bg-gray-800 transition-colors hover:border-violet-300 dark:hover:border-violet-600"
          :class="{ 'border-gray-200 dark:border-gray-700': !isExpanded(node.id), 'border-violet-300 dark:border-violet-700': isExpanded(node.id) }"
        >
          <!-- 节点头部 -->
          <button
            class="w-full flex items-center gap-3 p-3 text-left"
            @click="toggleNode(node.id)"
          >
            <component
              :is="isExpanded(node.id) ? ChevronDown : ChevronRight"
              class="w-4 h-4 text-gray-400 flex-shrink-0"
            />
            <component
              :is="getNodeIcon(node.type)"
              class="w-5 h-5 text-violet-500 flex-shrink-0"
            />
            <span class="font-medium text-gray-900 dark:text-white whitespace-nowrap">{{ node.title }}</span>
            <span v-if="node.description" class="text-sm text-gray-500 dark:text-gray-400 truncate">
              {{ node.description }}
            </span>
          </button>

          <!-- 子节点 -->
          <div v-if="isExpanded(node.id) && node.children?.length" class="px-4 pb-3 space-y-1">
            <template v-for="child in node.children" :key="child.id">
              <!-- 子节点：章节 -->
              <div
                v-if="child.type === 'chapter'"
                class="pl-6 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors cursor-pointer"
                @click="emit('selectChapter', outline.chapters?.find(c => `chapter-${c.number}` === child.id)!)"
              >
                <div class="flex items-center gap-2">
                  <BookOpen class="w-4 h-4 text-violet-400" />
                  <span class="font-medium text-gray-800 dark:text-gray-200">
                    {{ child.title }}
                  </span>
                  <NTag
                    v-if="child.metadata?.strand"
                    size="tiny"
                    :type="child.metadata.strand === 'quest' ? 'success' : child.metadata.strand === 'fire' ? 'warning' : 'info'"
                  >
                    {{ strandNames[child.metadata.strand] }}
                  </NTag>
                </div>
                <p v-if="child.description" class="pl-6 mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {{ child.description }}
                </p>

                <!-- 章节详情子节点 -->
                <div v-if="child.children?.length" class="pl-6 mt-2 space-y-1">
                  <div
                    v-for="subChild in child.children"
                    :key="subChild.id"
                    class="p-2 rounded bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                  >
                    <div class="flex items-center gap-2 text-xs">
                      <Sparkles v-if="subChild.title.includes('爽点')" class="w-3 h-3 text-orange-400" />
                      <Zap v-else-if="subChild.title.includes('钩子')" class="w-3 h-3 text-red-400" />
                      <Target v-else class="w-3 h-3 text-blue-400" />
                      <span class="font-medium text-gray-600 dark:text-gray-300">{{ subChild.title }}</span>
                    </div>
                    <p class="pl-5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ subChild.description }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- 子节点：伏笔 -->
              <div
                v-else-if="child.type === 'foreshadow'"
                class="pl-6 p-3 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                @click="emit('selectForeshadow', outline.foreshadows?.find(f => child.metadata?.hint === f.hint)!)"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <Zap class="w-4 h-4 text-amber-500" />
                  <span class="font-medium text-gray-800 dark:text-gray-200">{{ child.title }}</span>
                  <NTag v-if="child.metadata?.phase" size="tiny" type="warning">
                    {{ phaseNames[child.metadata.phase] }}
                  </NTag>
                  <NTag v-if="child.metadata?.importance" size="tiny" :type="child.metadata.importance === 'main' ? 'error' : child.metadata.importance === 'emotion' ? 'success' : 'default'">
                    {{ foreshadowImportanceNames[child.metadata.importance] ?? child.metadata.importance }}
                  </NTag>
                  <NTag v-if="child.metadata?.type" size="tiny" type="info">
                    {{ foreshadowTypeNames[child.metadata.type] ?? child.metadata.type }}
                  </NTag>
                </div>
                <p class="pl-6 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ child.metadata?.hint || child.description }}
                </p>
                <div class="pl-6 mt-2 flex flex-wrap gap-2 text-[11px] text-amber-700 dark:text-amber-200">
                  <span v-if="child.metadata?.setupChapter" class="rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-900/40">
                    埋设第{{ child.metadata.setupChapter }}章
                  </span>
                  <span v-if="child.metadata?.payoffChapter || child.metadata?.suggestedChapter" class="rounded-full bg-orange-100 px-2 py-0.5 dark:bg-orange-900/40">
                    回收第{{ child.metadata.payoffChapter || child.metadata.suggestedChapter }}章
                  </span>
                  <span v-if="child.metadata?.carrierCharacter" class="rounded-full bg-yellow-100 px-2 py-0.5 dark:bg-yellow-900/40">
                    载体：{{ child.metadata.carrierCharacter }}
                  </span>
                </div>
                <div v-if="child.metadata?.linkedConflict || child.metadata?.payoffValue" class="pl-6 mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                  <p v-if="child.metadata?.linkedConflict" class="flex items-start gap-1">
                    <ShieldAlert class="mt-0.5 h-3 w-3 text-red-400" />
                    <span>关联冲突：{{ child.metadata.linkedConflict }}</span>
                  </p>
                  <p v-if="child.metadata?.payoffValue" class="flex items-start gap-1">
                    <Sparkles class="mt-0.5 h-3 w-3 text-orange-400" />
                    <span>回收收益：{{ child.metadata.payoffValue }}</span>
                  </p>
                </div>
              </div>

              <!-- 子节点：角色 -->
              <div
                v-else-if="child.type === 'character'"
                class="pl-6 p-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                @click="emit('selectCharacter', outline.characters?.find(c => c.name === child.title)!)"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <Users class="w-4 h-4 text-blue-500" />
                  <span class="font-medium text-gray-800 dark:text-gray-200">{{ child.title }}</span>
                  <NTag v-if="child.metadata?.role" size="tiny" type="info">
                    {{ characterRoleNames[child.metadata.role] ?? child.metadata.role }}
                  </NTag>
                  <NTag v-if="child.metadata?.relationshipCount" size="tiny" type="success">
                    {{ child.metadata.relationshipCount }}条关系
                  </NTag>
                </div>
                <p v-if="child.description" class="pl-6 mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {{ child.description }}
                </p>
                <div v-if="child.metadata?.abilities?.length || child.metadata?.personality?.length" class="pl-6 mt-2 flex flex-wrap gap-2">
                  <NTag
                    v-for="trait in (child.metadata?.personality || []).slice(0, 3)"
                    :key="`${child.id}-trait-${trait}`"
                    size="tiny"
                    type="default"
                  >
                    {{ trait }}
                  </NTag>
                  <NTag
                    v-for="ability in (child.metadata?.abilities || []).slice(0, 2)"
                    :key="`${child.id}-ability-${ability}`"
                    size="tiny"
                    type="warning"
                  >
                    资源：{{ ability }}
                  </NTag>
                </div>
                <p v-if="child.metadata?.background" class="pl-6 mt-2 text-xs text-gray-600 dark:text-gray-300">
                  {{ child.metadata.background }}
                </p>
                <div v-if="child.metadata?.relationships?.length" class="pl-6 mt-2 space-y-1">
                  <div
                    v-for="relationship in child.metadata.relationships.slice(0, 4)"
                    :key="`${child.id}-rel-${relationship.targetName}-${relationship.type}`"
                    class="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-200"
                  >
                    <Link2 class="mt-0.5 h-3 w-3 text-blue-400" />
                    <span>
                      {{ relationship.targetName }}
                      <span class="text-gray-500 dark:text-gray-400">· {{ getRelationshipTypeDisplayText(relationship.type) }}</span>
                      <span v-if="relationship.description">：{{ relationship.description }}</span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- 子节点：其他（结构/幕） -->
              <div
                v-else
                class="pl-6 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50"
              >
                <div class="flex items-center gap-2">
                  <Layers class="w-4 h-4 text-gray-400" />
                  <span class="font-medium text-gray-700 dark:text-gray-300">{{ child.title }}</span>
                </div>
                <p v-if="child.description" class="pl-6 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ child.description }}
                </p>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <NEmpty v-if="visualTree.length === 0" description="暂无大纲数据">
        <template #icon>
          <BookOpen class="w-12 h-12 text-gray-300" />
        </template>
      </NEmpty>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
