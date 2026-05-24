<template>
  <div class="ai-panel-v2">
    <!-- 步骤指示器 -->
    <div class="step-indicator">
      <div
        v-for="(step, index) in steps"
        :key="step.key"
        class="step-item"
        :class="{
          'active': currentStepIndex >= index,
          'current': currentStepKey === step.key,
          'error': step.key === currentStepKey && error
        }"
      >
        <div class="step-icon">
          <span v-if="currentStepIndex > index" class="check-icon">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </div>
        <div class="step-label">{{ step.label }}</div>
      </div>
    </div>

    <!-- 进度条 -->
    <div class="progress-bar" v-if="isRunning">
      <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
    </div>

    <!-- 错误显示 -->
    <div class="error-message" v-if="error">
      <span class="error-icon">⚠</span>
      <span class="error-text">{{ error }}</span>
      <button class="error-dismiss" @click="dismissError">×</button>
    </div>

    <!-- 任务书预览 -->
    <div class="taskbook-preview" v-if="taskBook && showTaskbook">
      <div class="section-header">
        <span>任务书预览</span>
        <button class="toggle-btn" @click="showTaskbook = false">收起</button>
      </div>
      <div class="taskbook-content">
        <div class="taskbook-item">
          <span class="label">CBN:</span>
          <span class="value">{{ taskBook.CBN }}</span>
        </div>
        <div class="taskbook-item">
          <span class="label">CPNs:</span>
          <span class="value">{{ taskBook.CPNs.join(' / ') }}</span>
        </div>
        <div class="taskbook-item">
          <span class="label">CEN:</span>
          <span class="value">{{ taskBook.CEN }}</span>
        </div>
        <div class="taskbook-item" v-if="taskBook.mustCover?.length">
          <span class="label">必须覆盖:</span>
          <span class="value">{{ taskBook.mustCover.join(' / ') }}</span>
        </div>
        <div class="taskbook-item" v-if="taskBook.forbiddenZones?.length">
          <span class="label">禁区:</span>
          <span class="value forbidden">{{ taskBook.forbiddenZones.join(' / ') }}</span>
        </div>
      </div>
    </div>

    <!-- 字数统计 -->
    <div class="word-count-info">
      <div class="word-count">
        <span class="label">字数:</span>
        <span class="value" :class="{ 'insufficient': actualWordCount < targetWordCount * 0.85 }">
          {{ actualWordCount }} / {{ targetWordCount }}
        </span>
      </div>
    </div>

    <!-- 生成内容预览 -->
    <div class="content-preview" v-if="generatedContent">
      <div class="section-header">
        <span>生成内容</span>
        <div class="actions">
          <button class="action-btn" @click="copyContent" title="复制">
            📋 复制
          </button>
          <button class="action-btn" @click="showPreview = !showPreview">
            {{ showPreview ? '收起' : '展开' }}
          </button>
        </div>
      </div>
      <div class="preview-content" v-show="showPreview">
        <pre>{{ generatedContent }}</pre>
      </div>
    </div>

    <!-- 审查结果 -->
    <div class="review-result" v-if="reviewResult">
      <div class="section-header">
        <span>审查结果</span>
        <span class="review-status" :class="reviewResult.blocking ? 'blocking' : 'passed'">
          {{ reviewResult.blocking ? '有阻断问题' : '通过' }}
        </span>
      </div>
      
      <!-- 指标 -->
      <div class="metrics-grid" v-if="reviewResult.metrics">
        <div class="metric">
          <span class="metric-label">字数</span>
          <span class="metric-value">{{ reviewResult.metrics.wordCount }}</span>
        </div>
        <div class="metric">
          <span class="metric-label">对话比例</span>
          <span class="metric-value">{{ (reviewResult.metrics.dialogueRatio * 100).toFixed(0) }}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">AI味修复</span>
          <span class="metric-value">{{ reviewResult.metrics.antiAIFix }}</span>
        </div>
        <div class="metric">
          <span class="metric-label">钩子质量</span>
          <span class="metric-value">{{ reviewResult.metrics.hookQuality }}</span>
        </div>
      </div>

      <!-- 问题列表 -->
      <div class="issues-list" v-if="reviewResult.issues?.length">
        <div class="issue-item" 
          v-for="(issue, index) in reviewResult.issues.slice(0, 5)" 
          :key="index"
          :class="issue.severity"
        >
          <span class="issue-type">{{ getIssueTypeLabel(issue.type) }}</span>
          <span class="issue-desc">{{ issue.description }}</span>
          <span class="issue-location">{{ issue.location }}</span>
        </div>
        <div class="more-issues" v-if="reviewResult.issues.length > 5">
          还有 {{ reviewResult.issues.length - 5 }} 个问题...
        </div>
      </div>

      <!-- 反模式问题 -->
      <div class="anti-patterns" v-if="reviewResult.antiPatternIssues?.length">
        <div class="anti-pattern-title">检测到的反模式:</div>
        <div class="anti-pattern-item" 
          v-for="(pattern, index) in reviewResult.antiPatternIssues" 
          :key="index"
        >
          <span class="pattern-name">{{ pattern.pattern }}</span>
          <span class="pattern-count">×{{ pattern.count }}</span>
          <span class="pattern-severity" :class="pattern.severity">{{ pattern.severity }}</span>
        </div>
      </div>

      <!-- 强制继续选项 -->
      <div class="force-continue" v-if="reviewResult.blocking">
        <button class="force-btn" @click="forceContinue">
          ⚠️ 强制继续（跳过阻断问题）
        </button>
      </div>
    </div>

    <!-- 提交结果 -->
    <div class="commit-result" v-if="commitResult">
      <div class="commit-status" :class="commitResult.status">
        <span class="status-icon">{{ commitResult.status === 'accepted' ? '✅' : '❌' }}</span>
        <span class="status-text">
          {{ commitResult.status === 'accepted' ? '提交成功' : '提交失败' }}
        </span>
      </div>
      <div class="commit-reasons" v-if="commitResult.reasons?.length">
        <div class="reason-item" v-for="(reason, index) in commitResult.reasons" :key="index">
          {{ reason }}
        </div>
      </div>
      <div class="projection-status" v-if="commitResult.projectionStatus">
        <span class="projection-label">投影状态:</span>
        <span 
          v-for="(status, key) in commitResult.projectionStatus" 
          :key="key"
          class="projection-item"
          :class="status"
        >
          {{ key }}: {{ status }}
        </span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <!-- 开始按钮 -->
      <button 
        class="primary-btn"
        :disabled="isRunning || !canStart"
        @click="startWriting"
        v-if="!isRunning && !commitResult"
      >
        🚀 开始写作
      </button>

      <!-- 停止按钮 -->
      <button 
        class="danger-btn"
        @click="stopWriting"
        v-if="isRunning"
      >
        ⏹ 停止
      </button>

      <!-- 保存按钮 -->
      <button 
        class="save-btn"
        @click="saveContent"
        :disabled="!generatedContent || isRunning"
        v-if="!commitResult"
      >
        💾 保存
      </button>

      <!-- 重新开始 -->
      <button 
        class="reset-btn"
        @click="resetAll"
        v-if="!isRunning && (commitResult || generatedContent)"
      >
        🔄 重新开始
      </button>

      <!-- 一键续写选择器 -->
      <div class="quick-actions" v-if="!isRunning && !generatedContent">
        <button 
          v-for="count in [1000, 2000, 3000, 5000]" 
          :key="count"
          class="quick-btn"
          @click="startWriting(count)"
          :disabled="!canStart"
        >
          续写 {{ count }} 字
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useWritingOrchestratorV2 } from '@/services/writing';
import { useProjectStore } from '@/stores/project.store';
import { message } from 'ant-design-vue';
import type { WritingTaskBook, ReviewerOutput, ChapterCommit } from '@/types/writing-v2';

// ============================================================
// Props & Emits
// ============================================================

const props = defineProps<{
  defaultWordCount?: number;
}>();

const emit = defineEmits<{
  (e: 'contentSaved', content: string): void;
  (e: 'stepChange', step: string): void;
}>();

// ============================================================
// 步骤定义
// ============================================================

const steps = [
  { key: 'idle', label: '就绪' },
  { key: 'preflight', label: '预检' },
  { key: 'taskbook', label: '任务书' },
  { key: 'draft', label: '起草' },
  { key: 'review', label: '审查' },
  { key: 'polish', label: '润色' },
  { key: 'commit', label: '提交' },
];

const stepOrder = ['preflight', 'taskbook', 'draft', 'supplement', 'review', 'polish', 'commit'];

const currentStepKey = computed(() => orchestrator.currentStep.value);
const currentStepIndex = computed(() => stepOrder.indexOf(currentStepKey.value));

// ============================================================
// Orchestrator
// ============================================================

const orchestrator = useWritingOrchestratorV2();
const projectStore = useProjectStore();

// 状态
const isRunning = orchestrator.isRunning;
const progress = orchestrator.progress;
const error = orchestrator.error;
const taskBook = orchestrator.taskBook;
const generatedContent = orchestrator.generatedContent;
const reviewResult = orchestrator.reviewResult;
const commitResult = orchestrator.commitResult;
const actualWordCount = orchestrator.actualWordCount;
const targetWordCount = orchestrator.targetWordCount;

// UI 状态
const showTaskbook = ref(true);
const showPreview = ref(false);
const forceProceed = ref(false);

// ============================================================
// 计算属性
// ============================================================

const canStart = computed(() => {
  return projectStore.currentProject && projectStore.currentChapter;
});

const polishedContent = computed(() => orchestrator.polishedContent.value);

// ============================================================
// 方法
// ============================================================

async function startWriting(wordCount?: number) {
  try {
    forceProceed.value = false;
    const target = wordCount || props.defaultWordCount || 3000;
    
    await orchestrator.run({
      targetWordCount: target,
      writingStyle: 'concise',
    });

    if (orchestrator.commitResult.value?.status === 'accepted') {
      message.success('章节写作完成！');
    }
  } catch (err) {
    message.error(orchestrator.error.value || '写作失败');
  }
}

function stopWriting() {
  orchestrator.stop();
  message.info('已停止');
}

async function saveContent() {
  try {
    const content = polishedContent.value || generatedContent.value;
    if (!content) {
      message.warning('没有可保存的内容');
      return;
    }

    const currentChapter = projectStore.currentChapter;
    if (!currentChapter) {
      message.warning('请先选择一个章节');
      return;
    }

    const separator = currentChapter.content && !currentChapter.content.endsWith('\n') ? '\n\n' : '';
    const newContent = currentChapter.content + separator + content;

    await projectStore.updateChapter(projectStore.currentChapterId!, {
      content: newContent,
      wordCount: countWords(newContent),
    });

    emit('contentSaved', content);
    message.success('已保存到章节');
  } catch (err) {
    message.error('保存失败');
  }
}

function copyContent() {
  const content = polishedContent.value || generatedContent.value;
  navigator.clipboard.writeText(content);
  message.success('已复制到剪贴板');
}

function dismissError() {
  orchestrator.reset();
}

function forceContinue() {
  forceProceed.value = true;
  message.warning('强制继续，已跳过阻断问题');
}

function resetAll() {
  orchestrator.reset();
  showTaskbook.value = true;
  showPreview.value = false;
  forceProceed.value = false;
}

function countWords(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}

function getIssueTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    continuity: '连续性',
    contract: '合同',
    anti_ai: 'AI味',
    logic: '逻辑',
    pace: '节奏',
    hook: '钩子',
  };
  return labels[type] || type;
}

// ============================================================
// Watchers
// ============================================================

watch(currentStepKey, (newStep) => {
  emit('stepChange', newStep);
});

watch(error, (newError) => {
  if (newError) {
    console.error('[AIPanelV2] Error:', newError);
  }
});
</script>

<style scoped>
.ai-panel-v2 {
  padding: 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-radius: 8px;
}

/* 步骤指示器 */
.step-indicator {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 8px;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.4;
  transition: opacity 0.3s;
}

.step-item.active {
  opacity: 1;
}

.step-item.current {
  opacity: 1;
}

.step-item.current .step-icon {
  background: var(--color-primary, #1890ff);
  color: white;
}

.step-item.error .step-icon {
  background: var(--color-error, #ff4d4f);
  color: white;
}

.step-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-border, #d9d9d9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.step-label {
  font-size: 11px;
  color: var(--color-text-secondary, #666);
}

/* 进度条 */
.progress-bar {
  height: 4px;
  background: var(--color-border, #e8e8e8);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary, #1890ff));
  transition: width 0.3s ease;
}

/* 错误消息 */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 4px;
  margin-bottom: 16px;
}

.error-icon {
  color: #ff4d4f;
}

.error-text {
  flex: 1;
  color: #cf1322;
  font-size: 13px;
}

.error-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #999;
}

/* 任务书预览 */
.taskbook-preview {
  background: white;
  border-radius: 4px;
  margin-bottom: 16px;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 500;
}

.toggle-btn,
.action-btn {
  background: none;
  border: 1px solid #d9d9d9;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.toggle-btn:hover,
.action-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.taskbook-content {
  padding: 12px;
}

.taskbook-item {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.taskbook-item .label {
  color: var(--color-text-secondary);
  min-width: 70px;
}

.taskbook-item .value {
  flex: 1;
}

.taskbook-item .value.forbidden {
  color: #ff4d4f;
}

/* 字数统计 */
.word-count-info {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.word-count {
  font-size: 13px;
}

.word-count .label {
  color: var(--color-text-secondary);
}

.word-count .value.insufficient {
  color: #ff4d4f;
}

/* 生成内容预览 */
.content-preview {
  background: white;
  border-radius: 4px;
  margin-bottom: 16px;
  max-height: 300px;
  overflow: hidden;
}

.preview-content {
  padding: 12px;
  max-height: 250px;
  overflow-y: auto;
}

.preview-content pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 13px;
  line-height: 1.6;
}

/* 审查结果 */
.review-result {
  background: white;
  border-radius: 4px;
  margin-bottom: 16px;
  overflow: hidden;
}

.review-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.review-status.blocking {
  background: #fff2f0;
  color: #cf1322;
}

.review-status.passed {
  background: #f6ffed;
  color: #52c41a;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e8e8e8;
}

.metric {
  text-align: center;
}

.metric-label {
  display: block;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.metric-value {
  display: block;
  font-size: 16px;
  font-weight: bold;
}

.issues-list {
  padding: 12px;
}

.issue-item {
  display: flex;
  gap: 8px;
  padding: 8px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-size: 12px;
}

.issue-item.critical {
  background: #fff2f0;
}

.issue-item.high {
  background: #fff7e6;
}

.issue-item.medium {
  background: #fffbe6;
}

.issue-type {
  font-weight: 500;
  color: var(--color-primary);
}

.issue-desc {
  flex: 1;
}

.issue-location {
  color: var(--color-text-secondary);
}

.more-issues {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 8px;
}

.anti-patterns {
  padding: 12px;
  border-top: 1px solid #e8e8e8;
}

.anti-pattern-title {
  font-weight: 500;
  margin-bottom: 8px;
}

.anti-pattern-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.pattern-name {
  flex: 1;
}

.pattern-count {
  color: var(--color-text-secondary);
}

.pattern-severity.high {
  color: #ff4d4f;
}

.pattern-severity.medium {
  color: #fa8c16;
}

.force-continue {
  padding: 12px;
  border-top: 1px solid #e8e8e8;
}

.force-btn {
  width: 100%;
  padding: 8px;
  background: #fff7e6;
  border: 1px solid #ffbb33;
  border-radius: 4px;
  cursor: pointer;
  color: #d48806;
}

/* 提交结果 */
.commit-result {
  background: white;
  border-radius: 4px;
  margin-bottom: 16px;
  overflow: hidden;
}

.commit-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-weight: 500;
}

.commit-status.accepted {
  background: #f6ffed;
  color: #52c41a;
}

.commit-status.rejected {
  background: #fff2f0;
  color: #cf1322;
}

.commit-reasons {
  padding: 0 12px 12px;
}

.reason-item {
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 4px 0;
}

.projection-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: #fafafa;
  font-size: 11px;
}

.projection-label {
  color: var(--color-text-secondary);
}

.projection-item {
  padding: 2px 6px;
  border-radius: 2px;
}

.projection-item.done {
  background: #f6ffed;
  color: #52c41a;
}

.projection-item.failed {
  background: #fff2f0;
  color: #cf1322;
}

.projection-item.pending {
  background: #f0f0f0;
  color: #999;
}

/* 操作按钮 */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.primary-btn {
  padding: 10px 24px;
  background: var(--color-primary, #1890ff);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.primary-btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.danger-btn {
  padding: 10px 24px;
  background: #ff4d4f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.save-btn {
  padding: 10px 24px;
  background: white;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  border-radius: 4px;
  cursor: pointer;
}

.save-btn:disabled {
  border-color: #d9d9d9;
  color: #d9d9d9;
}

.reset-btn {
  padding: 10px 24px;
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
}

.quick-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
}

.quick-btn {
  flex: 1;
  padding: 8px;
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.quick-btn:disabled {
  color: #d9d9d9;
  cursor: not-allowed;
}

.quick-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
