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
} from 'lucide-vue-next';
import { NCollapse, NCollapseItem, NTag, NCard, NEmpty, NButton } from 'naive-ui';
import type { GeneratedOutline, GeneratedChapter, GeneratedCharacter, GeneratedForeshadow } from '@/types/inspiration';

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
        const actTitle = typeof act === 'string' ? act : act.title || actNames[actKey];
        const actContent = typeof act === 'string' ? '' : act.content || '';

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

  // 2. 章节概览
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
    const phaseGroups: Record<string, Foreshadow[]> = {
      early: [],
      mid: [],
      late: [],
      undefined: [],
    };

    outline.foreshadows.forEach(fs => {
      const phase = fs.phase || 'undefined';
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
            description: fs.hint,
            status: fs.status as any || 'active',
            metadata: {
              type: fs.type,
              phase: fs.phase,
              suggestedChapter: fs.suggestedChapter,
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
        description: char.description || char.identity || '',
        metadata: {
          role: char.role,
          personality: char.personality,
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
          type: 'volume',
          title: `核心情绪：${emotion.primary || '未设定'}`,
          description: `弧线类型：${emotion.arc || 'rising'}`,
        },
        ...(emotion.highPoints?.length ? [{
          id: 'emotion-high-points',
          type: 'volume',
          title: `情绪高点章节：${emotion.highPoints.join(', ')}`,
          description: '',
        }] : []),
        ...(emotion.lowPoints?.length ? [{
          id: 'emotion-low-points',
          type: 'volume',
          title: `情绪低点章节：${emotion.lowPoints.join(', ')}`,
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
          type: 'volume',
          title: `爽点类型：${pattern}`,
          description: '',
        }))),
        ...(coolPoint.arranged || []).map((cp, index) => ({
          id: `cool-arranged-${index}`,
          type: 'volume',
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
        <NTag v-if="outline.chapters?.length" size="small" type="success">
          {{ outline.chapters.length }}章
        </NTag>
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
                class="pl-6 p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                @click="emit('selectForeshadow', outline.foreshadows?.find(f => child.title.includes(f.hint.substring(0, 20)))!)"
              >
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-amber-500" />
                  <span class="font-medium text-gray-800 dark:text-gray-200">{{ child.title }}</span>
                  <NTag v-if="child.metadata?.phase" size="tiny" type="warning">
                    {{ phaseNames[child.metadata.phase] }}
                  </NTag>
                </div>
                <p class="pl-6 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ child.description }}
                </p>
              </div>

              <!-- 子节点：角色 -->
              <div
                v-else-if="child.type === 'character'"
                class="pl-6 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                @click="emit('selectCharacter', outline.characters?.find(c => c.name === child.title)!)"
              >
                <div class="flex items-center gap-2">
                  <Users class="w-4 h-4 text-blue-500" />
                  <span class="font-medium text-gray-800 dark:text-gray-200">{{ child.title }}</span>
                  <NTag v-if="child.metadata?.role" size="tiny" type="info">
                    {{ characterRoleNames[child.metadata.role] ?? child.metadata.role }}
                  </NTag>
                </div>
                <p v-if="child.description" class="pl-6 mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {{ child.description }}
                </p>
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
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
