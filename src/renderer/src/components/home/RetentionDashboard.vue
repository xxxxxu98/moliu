<template>
  <div class="retention-dashboard">
    <n-card title="追读力分析" :bordered="false" class="dashboard-card">
      <template #header-extra>
        <n-button size="small" @click="refreshAnalysis" :loading="isAnalyzing">
          <template #icon>
            <n-icon><Refresh /></n-icon>
          </template>
          刷新分析
        </n-button>
      </template>

      <!-- 章节选择 -->
      <div class="chapter-selector">
        <n-select
          v-model:value="selectedChapterIndex"
          :options="chapterOptions"
          placeholder="选择章节"
          filterable
          @update:value="onChapterChange"
        />
      </div>

      <!-- 综合评分 -->
      <div v-if="currentAnalysis" class="overall-score">
        <n-grid :cols="4" :x-gap="16" :y-gap="16">
          <n-gi>
            <div class="score-card grade-card">
              <div class="score-label">综合评分</div>
              <div class="score-value" :class="getGradeClass(currentAnalysis.score.grades.overallGrade)">
                {{ currentAnalysis.score.overallScore }}
              </div>
              <div class="grade-badge" :class="getGradeClass(currentAnalysis.score.grades.overallGrade)">
                {{ currentAnalysis.score.grades.overallGrade }}
              </div>
            </div>
          </n-gi>
          <n-gi>
            <div class="score-card">
              <div class="score-label">钩子评分</div>
              <div class="score-value">{{ currentAnalysis.score.hookScore }}</div>
              <n-tag :type="getScoreType(currentAnalysis.score.hookScore)" size="small">
                {{ currentAnalysis.score.grades.hookGrade }}
              </n-tag>
            </div>
          </n-gi>
          <n-gi>
            <div class="score-card">
              <div class="score-label">爽点评分</div>
              <div class="score-value">{{ currentAnalysis.score.coolPointScore }}</div>
              <n-tag :type="getScoreType(currentAnalysis.score.coolPointScore)" size="small">
                {{ currentAnalysis.score.grades.coolPointGrade }}
              </n-tag>
            </div>
          </n-gi>
          <n-gi>
            <div class="score-card">
              <div class="score-label">节奏评分</div>
              <div class="score-value">{{ currentAnalysis.score.pacingScore }}</div>
              <n-tag :type="getScoreType(currentAnalysis.score.pacingScore)" size="small">
                {{ currentAnalysis.score.grades.pacingGrade }}
              </n-tag>
            </div>
          </n-gi>
        </n-grid>
      </div>

      <!-- 留存预测 -->
      <div v-if="currentAnalysis" class="retention-prediction">
        <n-progress
          type="line"
          :percentage="Math.round(currentAnalysis.score.retentionPrediction.score * 100)"
          :indicator-text-color="getScoreColor(currentAnalysis.score.retentionPrediction.score)"
          :color="getScoreColor(currentAnalysis.score.retentionPrediction.score)"
          :height="24"
        >
          <template #indicator>
            {{ currentAnalysis.score.retentionPrediction.description }}
          </template>
        </n-progress>
      </div>

      <!-- 详细分析 -->
      <n-tabs v-if="currentAnalysis" type="line" animated>
        <!-- 钩子分析 -->
        <n-tab-pane name="hooks" tab="钩子分析">
          <div class="analysis-section">
            <h4>钩子密度</h4>
            <n-grid :cols="3" :x-gap="12">
              <n-gi>
                <n-statistic label="总钩子数" :value="currentAnalysis.score.detailedAnalysis.hookAnalysis.totalHooks" />
              </n-gi>
              <n-gi>
                <n-statistic label="平均强度" :value="(currentAnalysis.score.detailedAnalysis.hookAnalysis.averageStrength * 100).toFixed(0) + '%'" />
              </n-gi>
              <n-gi>
                <n-statistic label="钩子密度" :value="currentAnalysis.score.detailedAnalysis.hookAnalysis.density.toFixed(2) + '/千字'" />
              </n-gi>
            </n-grid>

            <h4>钩子分布</h4>
            <div class="distribution-bar">
              <div class="bar-segment">
                <span class="bar-label">章首</span>
                <div class="bar-fill" :style="{ width: (currentAnalysis.score.detailedAnalysis.hookAnalysis.distribution.beginning / Math.max(1, currentAnalysis.score.detailedAnalysis.hookAnalysis.totalHooks) * 100) + '%' }"></div>
                <span class="bar-value">{{ currentAnalysis.score.detailedAnalysis.hookAnalysis.distribution.beginning }}</span>
              </div>
              <div class="bar-segment">
                <span class="bar-label">章中</span>
                <div class="bar-fill" :style="{ width: (currentAnalysis.score.detailedAnalysis.hookAnalysis.distribution.middle / Math.max(1, currentAnalysis.score.detailedAnalysis.hookAnalysis.totalHooks) * 100) + '%' }"></div>
                <span class="bar-value">{{ currentAnalysis.score.detailedAnalysis.hookAnalysis.distribution.middle }}</span>
              </div>
              <div class="bar-segment">
                <span class="bar-label">章尾</span>
                <div class="bar-fill" :style="{ width: (currentAnalysis.score.detailedAnalysis.hookAnalysis.distribution.end / Math.max(1, currentAnalysis.score.detailedAnalysis.hookAnalysis.totalHooks) * 100) + '%' }"></div>
                <span class="bar-value">{{ currentAnalysis.score.detailedAnalysis.hookAnalysis.distribution.end }}</span>
              </div>
            </div>

            <!-- 钩子类型分布 -->
            <h4>钩子类型分布</h4>
            <div class="type-grid">
              <n-tag
                v-for="(count, type) in currentAnalysis.score.detailedAnalysis.hookAnalysis.hookTypes"
                :key="type"
                :type="count > 0 ? 'success' : 'default'"
                size="small"
              >
                {{ getHookTypeName(type) }}: {{ count }}
              </n-tag>
            </div>
          </div>
        </n-tab-pane>

        <!-- 爽点分析 -->
        <n-tab-pane name="coolpoints" tab="爽点分析">
          <div class="analysis-section">
            <h4>爽点密度</h4>
            <n-grid :cols="3" :x-gap="12">
              <n-gi>
                <n-statistic label="总爽点数" :value="currentAnalysis.score.detailedAnalysis.coolPointAnalysis.totalCoolPoints" />
              </n-gi>
              <n-gi>
                <n-statistic label="平均强度" :value="(currentAnalysis.score.detailedAnalysis.coolPointAnalysis.averageStrength * 100).toFixed(0) + '%'" />
              </n-gi>
              <n-gi>
                <n-statistic label="铺垫爽比" :value="currentAnalysis.score.detailedAnalysis.coolPointAnalysis.buildupRatio.toFixed(1)" />
              </n-gi>
            </n-grid>

            <h4>爽点分布</h4>
            <div class="distribution-bar">
              <div class="bar-segment cool">
                <span class="bar-label">章首</span>
                <div class="bar-fill" :style="{ width: (currentAnalysis.score.detailedAnalysis.coolPointAnalysis.distribution.beginning / Math.max(1, currentAnalysis.score.detailedAnalysis.coolPointAnalysis.totalCoolPoints) * 100) + '%' }"></div>
                <span class="bar-value">{{ currentAnalysis.score.detailedAnalysis.coolPointAnalysis.distribution.beginning }}</span>
              </div>
              <div class="bar-segment cool">
                <span class="bar-label">章中</span>
                <div class="bar-fill" :style="{ width: (currentAnalysis.score.detailedAnalysis.coolPointAnalysis.distribution.middle / Math.max(1, currentAnalysis.score.detailedAnalysis.coolPointAnalysis.totalCoolPoints) * 100) + '%' }"></div>
                <span class="bar-value">{{ currentAnalysis.score.detailedAnalysis.coolPointAnalysis.distribution.middle }}</span>
              </div>
              <div class="bar-segment cool">
                <span class="bar-label">章尾</span>
                <div class="bar-fill" :style="{ width: (currentAnalysis.score.detailedAnalysis.coolPointAnalysis.distribution.end / Math.max(1, currentAnalysis.score.detailedAnalysis.coolPointAnalysis.totalCoolPoints) * 100) + '%' }"></div>
                <span class="bar-value">{{ currentAnalysis.score.detailedAnalysis.coolPointAnalysis.distribution.end }}</span>
              </div>
            </div>

            <!-- 爽点类型分布 -->
            <h4>爽点类型分布</h4>
            <div class="type-grid">
              <n-tag
                v-for="(count, type) in currentAnalysis.score.detailedAnalysis.coolPointAnalysis.coolPointTypes"
                :key="type"
                :type="count > 0 ? 'warning' : 'default'"
                size="small"
              >
                {{ getCoolPointTypeName(type) }}: {{ count }}
              </n-tag>
            </div>
          </div>
        </n-tab-pane>

        <!-- 节奏分析 -->
        <n-tab-pane name="pacing" tab="节奏分析">
          <div class="analysis-section">
            <h4>节奏状态</h4>
            <n-tag :type="getPacingType(currentAnalysis.score.detailedAnalysis.pacingAnalysis.state)" size="large">
              {{ getPacingStateName(currentAnalysis.score.detailedAnalysis.pacingAnalysis.state) }}
            </n-tag>

            <h4>节奏指标</h4>
            <n-grid :cols="4" :x-gap="12">
              <n-gi>
                <n-statistic label="冲突密度" :value="currentAnalysis.score.detailedAnalysis.pacingAnalysis.conflictDensity" />
              </n-gi>
              <n-gi>
                <n-statistic label="对话占比" :value="(currentAnalysis.score.detailedAnalysis.pacingAnalysis.dialogueRatio * 100).toFixed(0) + '%'" />
              </n-gi>
              <n-gi>
                <n-statistic label="动作占比" :value="(currentAnalysis.score.detailedAnalysis.pacingAnalysis.actionRatio * 100).toFixed(0) + '%'" />
              </n-gi>
              <n-gi>
                <n-statistic label="描述占比" :value="(currentAnalysis.score.detailedAnalysis.pacingAnalysis.descriptionRatio * 100).toFixed(0) + '%'" />
              </n-gi>
            </n-grid>

            <!-- 节奏问题 -->
            <div v-if="currentAnalysis.score.detailedAnalysis.pacingAnalysis.issues.length > 0" class="issues-section">
              <h4>节奏问题</h4>
              <n-ul>
                <n-li v-for="issue in currentAnalysis.score.detailedAnalysis.pacingAnalysis.issues" :key="issue">
                  <n-icon><AlertCircle /></n-icon>
                  {{ issue }}
                </n-li>
              </n-ul>
            </div>
          </div>
        </n-tab-pane>

        <!-- 改进建议 -->
        <n-tab-pane name="recommendations" tab="改进建议">
          <div class="analysis-section">
            <n-list hoverable clickable>
              <n-list-item v-for="(rec, index) in currentAnalysis.score.recommendations" :key="index">
                <n-thing>
                  <template #prefix>
                    <n-icon><Lightbulb /></n-icon>
                  </template>
                  {{ rec }}
                </n-thing>
              </n-list-item>
            </n-list>
          </div>
        </n-tab-pane>
      </n-tabs>

      <!-- 空状态 -->
      <div v-if="!currentAnalysis && !isAnalyzing" class="empty-state">
        <n-empty description="暂无分析数据">
          <template #extra>
            <n-button @click="runAnalysis">开始分析</n-button>
          </template>
        </n-empty>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { NCard, NButton, NIcon, NGrid, NGi, NStatistic, NTag, NProgress, NTabs, NTabPane, NList, NListItem, NThing, NUl, NLi, NEmpty, NSelect } from 'naive-ui';
import { Refresh, AlertCircle, Lightbulb } from 'lucide-vue-next';
import type { GeneratedChapter } from '@/composables/useChapterOutlineGenerator';
import type { ChapterRetentionAnalysis, HookType, CoolPointType, PacingState } from '@/services/writing/retention-analyzer';
import { getRetentionAnalyzer } from '@/services/writing/retention-analyzer';

const props = defineProps<{
  chapters: GeneratedChapter[];
}>();

const isAnalyzing = ref(false);
const selectedChapterIndex = ref<number | null>(null);
const analysisResults = ref<ChapterRetentionAnalysis[]>([]);

const chapterOptions = computed(() =>
  props.chapters.map(ch => ({
    label: ch.title,
    value: ch.orderIndex,
  }))
);

const currentAnalysis = computed(() =>
  analysisResults.value.find(r => r.chapterIndex === selectedChapterIndex.value)
);

function onChapterChange(index: number) {
  selectedChapterIndex.value = index;
}

async function refreshAnalysis() {
  await runAnalysis();
}

async function runAnalysis() {
  if (props.chapters.length === 0) return;

  isAnalyzing.value = true;
  try {
    const analyzer = getRetentionAnalyzer();
    analysisResults.value = props.chapters.map(chapter =>
      analyzer.analyzeChapter(chapter)
    );

    // 自动选择第一个章节
    if (selectedChapterIndex.value === null && props.chapters.length > 0) {
      selectedChapterIndex.value = props.chapters[0].orderIndex;
    }
  } finally {
    isAnalyzing.value = false;
  }
}

function getGradeClass(grade: string): string {
  const classes: Record<string, string> = {
    'A': 'grade-excellent',
    'B': 'grade-good',
    'C': 'grade-average',
    'D': 'grade-poor',
    'F': 'grade-fail',
  };
  return classes[grade] || '';
}

function getScoreType(score: number): 'success' | 'warning' | 'error' | 'info' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'error';
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return '#18a058';
  if (score >= 0.6) return '#f0a020';
  return '#d03050';
}

function getHookTypeName(type: HookType): string {
  const names: Record<HookType, string> = {
    [HookType.SUSPENSE]: '悬念',
    [HookType.CONFLICT]: '冲突',
    [HookType.EMOTION]: '情感',
    [HookType.ACTION]: '行动',
    [HookType.ATMOSPHERE]: '氛围',
    [HookType.TWIST]: '意外',
    [HookType.CHOICE]: '选择',
    [HookType.REVELATION]: '揭示',
  };
  return names[type] || type;
}

function getCoolPointTypeName(type: CoolPointType): string {
  const names: Record<CoolPointType, string> = {
    [CoolPointType.BATTLE]: '战斗',
    [CoolPointType.EMOTIONAL]: '情感',
    [CoolPointType.STATUS]: '身份',
    [CoolPointType.REVELATION]: '揭秘',
    [CoolPointType.REVENGE]: '复仇',
    [CoolPointType.GAIN]: '收获',
    [CoolPointType.OVERWHELMING]: '碾压',
    [CoolPointType.SLAP_FACE]: '打脸',
  };
  return names[type] || type;
}

function getPacingStateName(state: PacingState): string {
  const names: Record<PacingState, string> = {
    [PacingState.TOO_SLOW]: '过慢',
    [PacingState.SLOW]: '偏慢',
    [PacingState.NORMAL]: '正常',
    [PacingState.FAST]: '偏快',
    [PacingState.TOO_FAST]: '过快',
  };
  return names[state] || state;
}

function getPacingType(state: PacingState): 'success' | 'warning' | 'error' {
  if (state === PacingState.NORMAL || state === PacingState.FAST) return 'success';
  if (state === PacingState.SLOW || state === PacingState.TOO_SLOW) return 'warning';
  return 'error';
}

onMounted(() => {
  if (props.chapters.length > 0) {
    runAnalysis();
  }
});
</script>

<style scoped>
.retention-dashboard {
  width: 100%;
}

.dashboard-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
}

.chapter-selector {
  margin-bottom: 16px;
}

.overall-score {
  margin-bottom: 16px;
}

.score-card {
  padding: 16px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  text-align: center;
}

.grade-card {
  position: relative;
}

.score-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.score-value {
  font-size: 32px;
  font-weight: bold;
  color: #333;
}

.grade-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  margin-top: 8px;
}

.grade-excellent {
  background: linear-gradient(135deg, #18a058, #f0a020);
  color: white;
}

.grade-good {
  background: #18a058;
  color: white;
}

.grade-average {
  background: #f0a020;
  color: white;
}

.grade-poor {
  background: #d03050;
  color: white;
}

.grade-fail {
  background: #666;
  color: white;
}

.retention-prediction {
  margin-bottom: 24px;
}

.analysis-section {
  padding: 16px 0;
}

.analysis-section h4 {
  margin: 16px 0 12px 0;
  font-size: 14px;
  color: #333;
  font-weight: 600;
}

.distribution-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-segment {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-label {
  width: 50px;
  font-size: 12px;
  color: #666;
}

.bar-fill {
  height: 16px;
  background: linear-gradient(90deg, #18a058, #52c41a);
  border-radius: 4px;
  min-width: 4px;
  max-width: 200px;
  transition: width 0.3s ease;
}

.bar-segment.cool .bar-fill {
  background: linear-gradient(90deg, #f0a020, #faad14);
}

.bar-value {
  font-size: 12px;
  color: #333;
  font-weight: 600;
}

.type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.issues-section {
  margin-top: 16px;
}

.empty-state {
  padding: 48px;
  text-align: center;
}
</style>
