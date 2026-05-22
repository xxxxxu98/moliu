<script setup lang="ts">
/**
 * 大纲可视化展示组件
 * 以可视化方式展示大纲的各个部分：世界观、角色关系、情节结构、伏笔等
 */
import { computed } from 'vue';
import { 
  Globe, Users, Map, Layers, Zap, 
  ChevronDown, ChevronRight, Link2
} from 'lucide-vue-next';
import type { 
  GeneratedOutline, 
  GeneratedWorldSetting, 
  GeneratedCharacter, 
  GeneratedForeshadow,
  GeneratedSubplot,
  GeneratedLocation,
  GeneratedFaction,
  GeneratedRelationship
} from '@/types/inspiration';

const props = defineProps<{
  outline: GeneratedOutline;
  expanded?: boolean;
}>();

const showAll = computed(() => props.expanded ?? false);

// Format relationship type to display text
function getRelationshipLabel(type: string): string {
  const labels: Record<string, string> = {
    friend: '朋友',
    enemy: '敌人',
    family: '家人',
    lover: '恋人',
    rival: '对手',
    mentor: '导师',
    student: '学生',
    alliance: '同盟',
    neutral: '中立',
  };
  return labels[type] || type;
}

// Get relationship color
function getRelationshipColor(type: string): string {
  const colors: Record<string, string> = {
    friend: 'text-green-500',
    enemy: 'text-red-500',
    family: 'text-blue-500',
    lover: 'text-pink-500',
    rival: 'text-orange-500',
    mentor: 'text-purple-500',
    student: 'text-cyan-500',
    alliance: 'text-emerald-500',
    neutral: 'text-gray-500',
  };
  return colors[type] || 'text-gray-500';
}

// Get character role color
function getRoleColor(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('主角') || roleLower.includes('main')) {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
  }
  if (roleLower.includes('反派') || roleLower.includes('villain')) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
  if (roleLower.includes('导师') || roleLower.includes('mentor')) {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
  }
  if (roleLower.includes('恋人') || roleLower.includes('lover')) {
    return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

// Get location level color
function getLocationLevelColor(level?: string): string {
  const colors: Record<string, string> = {
    world: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    continent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    country: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    city: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    district: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    special: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };
  return level ? colors[level] || 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-700';
}

// Group locations by parent
function groupLocationsByParent(locations: GeneratedLocation[]): Map<string | null, GeneratedLocation[]> {
  const groups = new Map<string | null, GeneratedLocation[]>();
  locations.forEach(loc => {
    const key = loc.parentName || null;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(loc);
  });
  return groups;
}

// Group factions by parent
function groupFactionsByParent(factions: GeneratedFaction[]): Map<string | null, GeneratedFaction[]> {
  const groups = new Map<string | null, GeneratedFaction[]>();
  factions.forEach(faction => {
    const key = faction.parentName || null;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(faction);
  });
  return groups;
}

// Translate foreshadow type to display text
function getForeshadowTypeLabel(type?: string): string {
  const typeMap: Record<string, string> = {
    item: '物品',
    dialogue: '对话',
    event: '事件',
    mystery: '悬念',
    character: '人物',
    ability: '能力',
  };
  return type ? (typeMap[type] || type) : '';
}
</script>

<template>
  <div class="space-y-6">
    <!-- 世界观设定 -->
    <div v-if="outline.worldSetting" class="space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Globe class="w-5 h-5 text-indigo-500" />
        <h4 class="font-semibold text-gray-900 dark:text-white">世界观设定</h4>
      </div>

      <!-- 地点层级 -->
      <div v-if="outline.worldSetting.locations?.length" class="pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
        <div class="flex items-center gap-2 mb-2">
          <Map class="w-4 h-4 text-blue-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">地点</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div 
            v-for="location in outline.worldSetting.locations" 
            :key="location.name"
            class="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ location.name }}</span>
              <span 
                v-if="location.level" 
                class="px-1.5 py-0.5 rounded text-xs"
                :class="getLocationLevelColor(location.level)"
              >
                {{ location.level }}
              </span>
            </div>
            <p v-if="location.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ location.description }}
            </p>
          </div>
        </div>
      </div>

      <!-- 势力 -->
      <div v-if="outline.worldSetting.factions?.length" class="pl-4 border-l-2 border-purple-200 dark:border-purple-800">
        <div class="flex items-center gap-2 mb-2">
          <Layers class="w-4 h-4 text-purple-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">势力</span>
        </div>
        <div class="space-y-2">
          <div 
            v-for="faction in outline.worldSetting.factions" 
            :key="faction.name"
            class="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ faction.name }}</span>
            </div>
            <p v-if="faction.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ faction.description }}
            </p>
            <div v-if="faction.allies?.length || faction.enemies?.length" class="flex flex-wrap gap-1 mt-1">
              <span v-if="faction.allies?.length" class="text-xs text-green-600 dark:text-green-400">
                盟友: {{ faction.allies.join(', ') }}
              </span>
              <span v-if="faction.enemies?.length" class="text-xs text-red-600 dark:text-red-400">
                敌对: {{ faction.enemies.join(', ') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 规则 -->
      <div v-if="outline.worldSetting.rules?.length" class="pl-4 border-l-2 border-amber-200 dark:border-amber-800">
        <div class="flex items-center gap-2 mb-2">
          <Zap class="w-4 h-4 text-amber-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">规则/体系</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div 
            v-for="rule in outline.worldSetting.rules" 
            :key="rule.name"
            class="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
          >
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ rule.name }}</span>
            <p v-if="rule.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ rule.description }}
            </p>
            <span 
              v-if="rule.category" 
              class="inline-block px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 mt-1"
            >
              {{ rule.category }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 四幕结构 -->
    <div class="space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Layers class="w-5 h-5 text-purple-500" />
        <h4 class="font-semibold text-gray-900 dark:text-white">四幕结构</h4>
      </div>

      <div class="space-y-3">
        <!-- Act 1 -->
        <div class="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-500 text-white">第一幕</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">建置</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ outline.structure.act1 }}</p>
        </div>

        <!-- Act 2a -->
        <div class="p-3 rounded-lg bg-purple-50/50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 rounded text-xs font-medium bg-purple-500 text-white">第二幕上</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">对抗</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ outline.structure.act2a }}</p>
        </div>

        <!-- Act 2b -->
        <div class="p-3 rounded-lg bg-pink-50/50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 rounded text-xs font-medium bg-pink-500 text-white">第二幕下</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">中点</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ outline.structure.act2b }}</p>
        </div>

        <!-- Act 3 -->
        <div class="p-3 rounded-lg bg-rose-50/50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 rounded text-xs font-medium bg-rose-500 text-white">第三幕</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">解决</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ outline.structure.act3 }}</p>
        </div>
      </div>
    </div>

    <!-- 角色关系 -->
    <div v-if="outline.characters?.length" class="space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Users class="w-5 h-5 text-pink-500" />
        <h4 class="font-semibold text-gray-900 dark:text-white">角色关系</h4>
        <span class="text-xs text-gray-400 dark:text-gray-500">({{ outline.characters.length }})</span>
      </div>

      <div class="space-y-3">
        <div 
          v-for="char in outline.characters" 
          :key="char.name"
          class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="text-base font-medium text-gray-900 dark:text-white">{{ char.name }}</span>
            <span 
              class="px-2 py-0.5 rounded text-xs"
              :class="getRoleColor(char.role)"
            >
              {{ char.role }}
            </span>
          </div>
          
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ char.description }}</p>

          <!-- 关系列表 -->
          <div v-if="char.relationships?.length" class="space-y-1">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">关系:</div>
            <div 
              v-for="rel in char.relationships" 
              :key="rel.targetName"
              class="flex items-center gap-2 text-sm"
            >
              <span class="text-gray-400">—</span>
              <span class="font-medium text-gray-700 dark:text-gray-300">{{ rel.targetName }}</span>
              <span :class="getRelationshipColor(rel.type)">
                ({{ getRelationshipLabel(rel.type) }})
              </span>
              <span v-if="rel.description" class="text-xs text-gray-500 dark:text-gray-400">
                {{ rel.description }}
              </span>
            </div>
          </div>

          <!-- 性格特点 -->
          <div v-if="char.personality?.length" class="flex flex-wrap gap-1 mt-2">
            <span 
              v-for="trait in char.personality" 
              :key="trait"
              class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            >
              {{ trait }}
            </span>
          </div>

          <!-- 特殊能力 -->
          <div v-if="char.abilities?.length" class="flex flex-wrap gap-1 mt-2">
            <span 
              v-for="ability in char.abilities" 
              :key="ability"
              class="px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
            >
              {{ ability }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 子情节 -->
    <div v-if="outline.subplots?.length" class="space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Link2 class="w-5 h-5 text-amber-500" />
        <h4 class="font-semibold text-gray-900 dark:text-white">子情节</h4>
        <span class="text-xs text-gray-400 dark:text-gray-500">({{ outline.subplots.length }})</span>
      </div>

      <div class="space-y-3">
        <div 
          v-for="(subplot, index) in outline.subplots" 
          :key="index"
          class="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ subplot.title }}</span>
            <span v-if="subplot.chapterRange" class="text-xs text-gray-500 dark:text-gray-400">
              第{{ subplot.chapterRange[0] }}-{{ subplot.chapterRange[1] }}章
            </span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ subplot.description }}</p>
          <div v-if="subplot.purpose" class="text-xs text-amber-600 dark:text-amber-400">
            目的: {{ subplot.purpose }}
          </div>
          <div v-if="subplot.relatedCharacters?.length" class="flex flex-wrap gap-1 mt-2">
            <span class="text-xs text-gray-500 dark:text-gray-400">涉及角色:</span>
            <span 
              v-for="char in subplot.relatedCharacters" 
              :key="char"
              class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            >
              {{ char }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 伏笔管理 -->
    <div v-if="outline.foreshadows?.length" class="space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Zap class="w-5 h-5 text-red-500" />
        <h4 class="font-semibold text-gray-900 dark:text-white">伏笔规划</h4>
        <span class="text-xs text-gray-400 dark:text-gray-500">({{ outline.foreshadows.length }})</span>
      </div>

      <div class="space-y-3">
        <div 
          v-for="(foreshadow, index) in outline.foreshadows" 
          :key="index"
          class="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2 py-0.5 rounded text-xs font-medium bg-red-500 text-white">
              伏笔{{ String(index + 1).padStart(2, '0') }}
            </span>
            <span v-if="foreshadow.type" class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {{ getForeshadowTypeLabel(foreshadow.type) }}
            </span>
            <span v-if="foreshadow.suggestedChapter" class="text-xs text-gray-500 dark:text-gray-400">
              第{{ foreshadow.suggestedChapter }}章揭晓
            </span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ foreshadow.hint }}</p>
        </div>
      </div>
    </div>

    <!-- 章节级大纲 -->
    <div v-if="outline.chapters?.length" class="space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Layers class="w-5 h-5 text-green-500" />
        <h4 class="font-semibold text-gray-900 dark:text-white">章节大纲</h4>
        <span class="text-xs text-gray-400 dark:text-gray-500">({{ outline.chapters.length }}章)</span>
      </div>

      <div class="space-y-2 max-h-96 overflow-y-auto">
        <div 
          v-for="(chapter, index) in outline.chapters" 
          :key="index"
          class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ chapter.title }}</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ chapter.summary }}</p>
          
          <!-- 关键事件 -->
          <div v-if="chapter.keyEvents?.length" class="flex flex-wrap gap-1">
            <span 
              v-for="event in chapter.keyEvents" 
              :key="event"
              class="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            >
              {{ event }}
            </span>
          </div>
          
          <!-- 涉及角色 -->
          <div v-if="chapter.involvedCharacters?.length" class="flex flex-wrap gap-1 mt-2">
            <span class="text-xs text-gray-500 dark:text-gray-400">涉及:</span>
            <span 
              v-for="char in chapter.involvedCharacters" 
              :key="char"
              class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            >
              {{ char }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
