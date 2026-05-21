# 墨流 (Moliu) 项目开发规范

> 本规范旨在统一代码风格、提高代码质量、确保团队协作效率。
> 所有团队成员在开发过程中必须遵循本规范。

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 技术栈](#2-技术栈)
- [3. 项目结构](#3-项目结构)
- [4. 代码规范](#4-代码规范)
  - [4.1 TypeScript 规范](#41-typescript-规范)
  - [4.2 Vue 组件规范](#42-vue-组件规范)
  - [4.3 命名约定](#43-命名约定)
- [5. Git 工作流程](#5-git-工作流程)
- [6. 组件开发规范](#6-组件开发规范)
- [7. 状态管理规范](#7-状态管理规范)
- [8. IPC 通信规范](#8-ipc-通信规范)
- [9. 服务层规范](#9-服务层规范)
- [10. 测试规范](#10-测试规范)
- [11. 文档要求](#11-文档要求)
- [12. 样式规范](#12-样式规范)
- [13. 性能优化建议](#13-性能优化建议)
- [14. 安全规范](#14-安全规范)

---

## 1. 项目概述

| 属性 | 值 |
|------|-----|
| 项目名称 | moliu (墨流) |
| 项目描述 | AI小说协作写作工具 |
| 许可证 | MIT |
| Node.js | >= 20.x |
| npm | >= 10.x |

---

## 2. 技术栈

| 层级 | 技术选型 | 版本要求 |
|------|----------|----------|
| 桌面框架 | Electron | 41.x |
| 前端框架 | Vue 3 + Composition API | 3.5.x |
| 构建工具 | Vite | 5.4.x |
| 编程语言 | TypeScript | 5.7.x |
| 富文本编辑器 | TipTap | 3.22.x |
| 状态管理 | Pinia | 3.0.x |
| UI 组件库 | Naive UI | 2.44.x |
| 原子化 CSS | UnoCSS | 66.6.x |
| 打包工具 | Electron Forge | 7.11.x |

---

## 3. 项目结构

```
src/
├── main.ts                     # Electron 主进程入口
├── preload.ts                  # 预加载脚本
├── main/                       # 主进程模块
│   ├── services/
│   │   ├── ai-client.ts       # AI 客户端
│   │   └── ai-providers.ts    # AI 提供商配置
│   └── crypto.ts               # API 密钥加密
└── renderer/                   # 渲染进程 (Vue 应用)
    └── src/
        ├── main.ts            # Vue 应用入口
        ├── App.vue
        ├── components/        # Vue 组件
        │   ├── common/       # 通用组件
        │   ├── editor/       # 编辑器相关
        │   ├── home/        # 首页组件
        │   │   └── new/     # 新版首页
        │   ├── memory/      # 记忆系统 UI
        │   └── settings/    # 设置页面
        ├── composables/     # 组合式函数 (hooks)
        │   └── __tests__/  # composables 测试
        ├── config/          # 配置文件
        ├── data/            # 静态数据
        ├── locales/         # 国际化文件
        ├── pages/           # 页面组件
        ├── router/          # 路由配置
        ├── services/        # 业务服务
        │   ├── ai/         # AI 服务
        │   │   └── agents/ # AI 代理
        │   ├── outline/    # 大纲生成服务
        │   ├── review/      # 审核服务
        │   └── writing/     # 写作服务
        ├── stores/          # Pinia 状态管理
        ├── styles/          # 样式文件
        ├── types/           # TypeScript 类型定义
        └── assets/          # 静态资源
```

### 3.1 目录命名规范

| 目录 | 用途 | 命名规范 |
|------|------|----------|
| `components/` | 可复用组件 | PascalCase 或 kebab-case |
| `composables/` | 组合式函数 | camelCase, use 前缀 |
| `pages/` | 页面组件 | PascalCase |
| `stores/` | 状态管理 | camelCase, .store.ts 后缀 |
| `services/` | 业务逻辑服务 | camelCase |
| `types/` | 类型定义 | PascalCase |
| `utils/` | 工具函数 | camelCase |
| `locales/` | 国际化文件 | 语言代码 (en, zh-CN) |

---

## 4. 代码规范

### 4.1 TypeScript 规范

#### 4.1.1 类型定义

**必须显式声明类型，禁止隐式 `any`**：

```typescript
// ✅ 正确 - 显式声明类型
function processText(text: string): string {
  return text.trim()
}

// ❌ 错误 - 禁止使用隐式 any
function processText(text) {
  return text.trim()
}
```

**使用接口定义对象结构**：

```typescript
// ✅ 正确
interface UserProfile {
  id: string
  name: string
  email: string
  createdAt: Date
}

// ❌ 错误 - 避免使用类型别名定义复杂对象
type UserProfile = {
  id: string
  name: string
}
```

**联合类型与交叉类型**：

```typescript
// 联合类型
type Status = 'draft' | 'published' | 'archived'

// 交叉类型
type ExtendedUser = UserProfile & {
  role: 'admin' | 'author'
}
```

#### 4.1.2 类型导出

```typescript
// types/chapter.ts

export interface Chapter {
  id: string
  title: string
  content: string
  order: number
  status: 'draft' | 'published'
}

// 导出类型别名
export type ChapterStatus = 'draft' | 'published'

// 导出枚举（谨慎使用）
export enum ChapterStatusEnum {
  Draft = 'draft',
  Published = 'published'
}
```

#### 4.1.3 函数类型

```typescript
// ✅ 正确 - 使用箭头函数类型
type TransformFn = (input: string) => string

// ✅ 正确 - 使用泛型
function findById<T extends { id: string }>(
  items: T[],
  id: string
): T | undefined {
  return items.find(item => item.id === id)
}
```

### 4.2 Vue 组件规范

#### 4.2.1 组件模板结构

```vue
<script setup lang="ts">
// 1. 导入顺序：框架 → 第三方库 → 内部模块 → 类型
import { ref, computed, onMounted } from 'vue'
import { NButton, NSpace } from 'naive-ui'
import { useProjectStore } from '@/stores/project.store'
import type { Project } from '@/types/project'
import { formatDate } from '@/utils/date'

// 2. Props 定义
interface Props {
  project: Project
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false
})

// 3. Emits 定义
const emit = defineEmits<{
  save: [project: Project]
  delete: [id: string]
}>()

// 4. 响应式状态
const isLoading = ref(false)
const localTitle = ref(props.project.title)

// 5. 计算属性
const isValid = computed(() => localTitle.value.length > 0)
const formattedDate = computed(() => formatDate(props.project.createdAt))

// 6. 监听器
watch(() => props.project.title, (newTitle) => {
  localTitle.value = newTitle
})

// 7. 方法
async function handleSave() {
  if (!isValid.value) return
  isLoading.value = true
  try {
    emit('save', { ...props.project, title: localTitle.value })
  } finally {
    isLoading.value = false
  }
}

// 8. 生命周期钩子
onMounted(() => {
  console.log('Component mounted')
})
</script>

<template>
  <div class="project-card">
    <h3>{{ localTitle }}</h3>
    <p>{{ formattedDate }}</p>
    <n-space>
      <n-button
        type="primary"
        :loading="isLoading"
        :disabled="!isValid"
        @click="handleSave"
      >
        保存
      </n-button>
    </n-space>
  </div>
</template>

<style scoped>
.project-card {
  padding: 16px;
  border-radius: 8px;
  background: var(--card-bg);
}

h3 {
  margin-bottom: 8px;
}
</style>
```

#### 4.2.2 组件文件命名

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 页面组件 | PascalCase | `HomePage.vue`, `ProjectEditor.vue` |
| 业务组件 | PascalCase | `ChapterList.vue`, `MemoryPanel.vue` |
| 通用组件 | PascalCase | `BaseButton.vue`, `IconPicker.vue` |
| 布局组件 | Layout 前缀 | `LayoutDefault.vue`, `LayoutEditor.vue` |

#### 4.2.3 Props 定义

**始终使用 `withDefaults` 和 `defineProps` 的泛型语法**：

```typescript
// ✅ 正确
interface Props {
  title: string
  count?: number
  items: string[]
}

const props = withDefaults(defineProps<Props>(), {
  count: 0
})

// ❌ 错误 - 避免使用旧语法
props: {
  title: {
    type: String,
    required: true
  }
}
```

#### 4.2.4 Emits 定义

```typescript
// ✅ 正确 - 使用类型化的 emit
const emit = defineEmits<{
  (e: 'update', value: string): void
  (e: 'delete', id: string): void
}>()

// 使用
emit('update', newValue)
emit('delete', '123')
```

### 4.3 命名约定

#### 4.3.1 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| Vue 组件 | PascalCase.vue 或 kebab-case.vue | `UserProfile.vue` / `user-profile.vue` |
| TypeScript 文件 | camelCase.ts | `userService.ts`, `markdownParser.ts` |
| 类型定义 | PascalCase.ts | `User.ts`, `Project.ts` |
| 样式文件 | 与组件同名 | `ProjectEditor.scss` |
| 测试文件 | 与源文件同名 + .test.ts | `userService.test.ts` |

#### 4.3.2 变量与函数命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量 | camelCase | `userName`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| 函数 | camelCase, 动宾结构 | `getUser()`, `fetchChapter()` |
| 类名 | PascalCase | `ProjectManager`, `ChapterEditor` |
| 接口 | PascalCase | `UserProfile`, `ChapterMetadata` |
| 布尔值 | is/has/can/should 前缀 | `isValid`, `hasPermission` |

#### 4.3.3 特定命名

| 类型 | 规范 | 示例 |
|------|------|------|
| Composables | use 前缀 | `useChapterWriter()`, `useMemorySearch()` |
| Store | .store.ts 后缀 | `project.store.ts`, `settings.store.ts` |
| 工具函数 | camelCase | `formatDate()`, `debounce()` |
| 事件处理 | handle 前缀 | `handleClick()`, `handleSubmit()` |
| 异步操作 | async/await, Promise | `async function fetchData()` |
| IPC 通道 | : 分隔前缀 | `project:list`, `chapter:save` |

#### 4.3.4 Vue 特定命名

```typescript
// 组件名 - 使用 PascalCase
defineComponent({
  name: 'UserProfileCard'
})

// ref 变量 - 避免以 ref 结尾，使用有意义的名称
const userName = ref('') // ✅
const userNameRef = ref('') // ❌

// 计算属性 - 表达其含义
const isAuthenticated = computed(() => !!token.value)
const sortedChapters = computed(() => [...chapters.value].sort())

// 组合式函数
export function useChapterWriter() { ... }
export function useProjectSettings() { ... }
```

---

## 5. Git 工作流程

### 5.1 分支命名

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 功能分支 | feature/描述 | `feature/memory-system`, `feature/chapter-export` |
| 修复分支 | fix/描述 | `fix/export-pdf`, `fix/editor-crash` |
| 重构分支 | refactor/描述 | `refactor/store-management` |
| 文档分支 | docs/描述 | `docs/api-spec`, `docs/contributing` |
| 发布分支 | release/v版本 | `release/v1.0.0` |

### 5.2 Commit 规范

**格式**：

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Type 类型**：

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构（不是新功能或修复） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具变更 |

**示例**：

```bash
# 功能
git commit -m "feat(editor): 添加章节大纲视图"

# 修复
git commit -m "fix(memory): 修复长文本记忆丢失问题"

# 重构
git commit -m "refactor(store): 重构项目状态管理"

# 文档
git commit -m "docs: 更新 API 文档"
```

### 5.3 Pull Request 规范

**PR 标题格式**：`[TYPE] 简短描述`

```
[FEAT] 添加记忆系统搜索功能
[FIX] 修复导出 PDF 乱码问题
[REFACTOR] 重构 AI 服务调用逻辑
```

**PR 描述模板**：

```markdown
## 描述
简要说明本次变更的内容和目的。

## 变更类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 文档更新
- [ ] 其他

## 关联 Issue
Fixes #123

## 测试
- [ ] 单元测试通过
- [ ] E2E 测试通过
- [ ] 手动测试通过

## 截图（可选）
```

### 5.4 代码审查要点

1. **功能完整性**：是否实现了需求？
2. **代码质量**：是否遵循本规范？
3. **测试覆盖**：关键逻辑是否有测试？
4. **性能考虑**：是否有性能问题？
5. **安全性**：是否有安全隐患？

---

## 6. 组件开发规范

### 6.1 组件拆分原则

**单一职责**：每个组件只负责一个功能。

```vue
<!-- ✅ 正确 - 拆分职责 -->
<!-- UserAvatar.vue -->
<template>
  <img :src="src" :alt="alt" class="avatar" />
</template>

<!-- UserCard.vue -->
<template>
  <div class="user-card">
    <UserAvatar :src="user.avatar" :alt="user.name" />
    <span>{{ user.name }}</span>
  </div>
</template>

<!-- ❌ 错误 - 职责过多 -->
<template>
  <div class="user-info">
    <img :src="user.avatar" />
    <span>{{ user.name }}</span>
    <button @click="follow">关注</button>
    <div class="stats">
      <span>粉丝: {{ stats.followers }}</span>
      <span>获赞: {{ stats.likes }}</span>
    </div>
  </div>
</template>
```

### 6.2 组件复用

**使用 Composables 复用逻辑**：

```typescript
// composables/useCounter.ts
export function useCounter(initialValue = 0) {
  const count = ref(initialValue)

  function increment() {
    count.value++
  }

  function decrement() {
    count.value--
  }

  function reset() {
    count.value = initialValue
  }

  return {
    count: readonly(count),
    increment,
    decrement,
    reset
  }
}
```

### 6.3 Props 传递

**使用解构减少 prop drilling**：

```typescript
// ❌ 错误 - prop drilling
<Parent>
  <GrandParent :data="data" />
</Parent>

// ✅ 正确 - 使用 provide/inject 或 store
// Parent.vue
provide('data', data)

// GrandParent.vue
const data = inject('data')
```

### 6.4 插槽使用

```vue
<!-- 默认插槽 -->
<BaseModal>
  <p>内容</p>
</BaseModal>

<!-- 命名插槽 -->
<BaseModal>
  <template #header>
    <h2>标题</h2>
  </template>
  <template #footer>
    <n-button>取消</n-button>
  </template>
</BaseModal>

<!-- 作用域插槽 -->
<BaseList :items="items">
  <template #item="{ item }">
    <div>{{ item.name }}</div>
  </template>
</BaseList>
```

---

## 7. 状态管理规范

### 7.1 Store 命名

```typescript
// stores/project.store.ts
export const useProjectStore = defineStore('project', () => {
  // ...
})

// stores/settings.store.ts
export const useSettingsStore = defineStore('settings', () => {
  // ...
})
```

### 7.2 Store 结构

```typescript
// stores/project.store.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, ProjectMetadata } from '@/types/project'
import { projectService } from '@/services/projectService'

export const useProjectStore = defineStore('project', () => {
  // 状态
  const currentProject = ref<Project | null>(null)
  const projects = ref<Project[]>([])
  const isLoading = ref(false)

  // 计算属性
  const hasProject = computed(() => currentProject.value !== null)
  const projectCount = computed(() => projects.value.length)

  // Actions
  async function loadProjects() {
    isLoading.value = true
    try {
      projects.value = await projectService.fetchAll()
    } finally {
      isLoading.value = false
    }
  }

  async function createProject(metadata: ProjectMetadata) {
    const project = await projectService.create(metadata)
    projects.value.push(project)
    return project
  }

  function setCurrentProject(project: Project | null) {
    currentProject.value = project
  }

  return {
    // 状态
    currentProject,
    projects,
    isLoading,
    // 计算属性
    hasProject,
    projectCount,
    // Actions
    loadProjects,
    createProject,
    setCurrentProject
  }
}, {
  persist: true // 启用持久化
})
```

### 7.3 Store 使用

```typescript
// 在组件中使用
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/stores/project.store'

const store = useProjectStore()

// 使用 storeToRefs 保持响应性
const { currentProject, isLoading } = storeToRefs(store)

// 直接调用 actions
const { loadProjects } = store
</script>
```

---

## 8. IPC 通信规范

### 8.1 IPC 通道命名

使用 `domain:action` 格式：

| 前缀 | 范围 | 示例 |
|------|------|------|
| `project:*` | 项目管理 | `project:list`, `project:create`, `project:save` |
| `chapter:*` | 章节管理 | `chapter:save`, `chapter:load`, `chapter:delete` |
| `ai:*` | AI 生成 | `ai:generate-outline`, `ai:generate-text` |
| `memory:*` | 记忆系统 | `memory:search`, `memory:save`, `memory:delete` |
| `character:*` | 角色管理 | `character:list`, `character:update` |
| `settings:*` | 全局配置 | `settings:get`, `settings:set` |
| `foreshadow:*` | 伏笔追踪 | `foreshadow:track`, `foreshadow:resolve` |
| `file:*` | 文件操作 | `file:read`, `file:write`, `file:export` |

### 8.2 主进程 IPC 处理

```typescript
// main/ipc-handlers.ts
import { ipcMain } from 'electron'

export function registerIpcHandlers() {
  // 项目相关
  ipcMain.handle('project:list', async () => {
    return await projectService.list()
  })

  ipcMain.handle('project:create', async (_, metadata) => {
    return await projectService.create(metadata)
  })

  // 章节相关
  ipcMain.handle('chapter:save', async (_, chapter) => {
    return await chapterService.save(chapter)
  })

  ipcMain.handle('chapter:load', async (_, projectId, chapterId) => {
    return await chapterService.load(projectId, chapterId)
  })

  // AI 相关
  ipcMain.handle('ai:generate-outline', async (_, prompt) => {
    return await aiClient.generateOutline(prompt)
  })
}
```

### 8.3 预加载脚本暴露

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron'

// 定义 API 类型
export interface ElectronAPI {
  project: {
    list: () => Promise<Project[]>
    create: (metadata: ProjectMetadata) => Promise<Project>
    save: (project: Project) => Promise<void>
  }
  chapter: {
    save: (chapter: Chapter) => Promise<void>
    load: (projectId: string, chapterId: string) => Promise<Chapter>
  }
  ai: {
    generateOutline: (prompt: string) => Promise<Outline>
    generateText: (context: GenerationContext) => Promise<string>
  }
}

const electronAPI: ElectronAPI = {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    create: (metadata) => ipcRenderer.invoke('project:create', metadata),
    save: (project) => ipcRenderer.invoke('project:save', project)
  },
  chapter: {
    save: (chapter) => ipcRenderer.invoke('chapter:save', chapter),
    load: (projectId, chapterId) =>
      ipcRenderer.invoke('chapter:load', projectId, chapterId)
  },
  ai: {
    generateOutline: (prompt) => ipcRenderer.invoke('ai:generate-outline', prompt),
    generateText: (context) => ipcRenderer.invoke('ai:generate-text', context)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
```

### 8.4 渲染进程使用

```typescript
// 声明全局类型
declare global {
  interface Window {
    electronAPI: import('@/types/electron').ElectronAPI
  }
}

// 使用
const projects = await window.electronAPI.project.list()
await window.electronAPI.chapter.save(chapter)
```

---

## 9. 服务层规范

### 9.1 服务结构

```typescript
// services/outline/outline-generator.ts
import { z } from 'zod'
import type { Outline, OutlineNode } from './types'
import { outlineSchema } from './schemas'

export class OutlineGenerator {
  private aiClient: AIClient

  constructor(aiClient: AIClient) {
    this.aiClient = aiClient
  }

  async generateFromPrompt(prompt: string): Promise<Outline> {
    const response = await this.aiClient.generate({
      prompt: this.buildPrompt(prompt),
      schema: outlineSchema
    })

    return this.validateResponse(response)
  }

  private buildPrompt(userPrompt: string): string {
    return `你是一个专业的小说大纲生成器。\n\n用户需求：${userPrompt}\n\n请生成详细的小说大纲...`
  }

  private validateResponse(response: unknown): Outline {
    const result = outlineSchema.safeParse(response)
    if (!result.success) {
      throw new OutlineValidationError(result.error)
    }
    return result.data
  }
}
```

### 9.2 错误处理

```typescript
// 自定义错误类
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

// 使用
export async function fetchChapter(id: string): Promise<Chapter> {
  try {
    const response = await api.get(`/chapters/${id}`)
    return response.data
  } catch (error) {
    if (error.response?.status === 404) {
      throw new ServiceError('章节不存在', 'CHAPTER_NOT_FOUND', 404)
    }
    throw new ServiceError('获取章节失败', 'FETCH_ERROR')
  }
}
```

---

## 10. 测试规范

### 10.1 测试文件位置

```
src/renderer/src/
├── composables/
│   └── __tests__/
│       └── useCounter.test.ts
├── services/
│   ├── __tests__/
│   │   └── projectService.test.ts
│   └── projectService.ts
└── utils/
    └── __tests__/
        └── formatDate.test.ts
```

### 10.2 单元测试示例

```typescript
// composables/__tests__/useCounter.test.ts
import { describe, it, expect } from 'vitest'
import { useCounter } from '../useCounter'

describe('useCounter', () => {
  it('should initialize with default value', () => {
    const { count } = useCounter()
    expect(count.value).toBe(0)
  })

  it('should initialize with custom value', () => {
    const { count } = useCounter(10)
    expect(count.value).toBe(10)
  })

  it('should increment count', () => {
    const { count, increment } = useCounter()
    increment()
    expect(count.value).toBe(1)
  })

  it('should decrement count', () => {
    const { count, decrement } = useCounter(5)
    decrement()
    expect(count.value).toBe(4)
  })

  it('should reset count', () => {
    const { count, increment, reset } = useCounter(2)
    increment()
    increment()
    reset()
    expect(count.value).toBe(2)
  })
})
```

### 10.3 测试覆盖率要求

| 类型 | 最低覆盖率 |
|------|-----------|
| Services | 80% |
| Composables | 70% |
| Utils | 90% |
| 全局 | 60% |

### 10.4 测试命令

```bash
npm run test          # 运行所有测试
npm run test:watch    # 监听模式
npm run test:coverage # 生成覆盖率报告
npm run test:unit     # 仅运行单元测试
```

---

## 11. 文档要求

### 11.1 代码注释

**注释应该解释「为什么」，而不是「是什么」**：

```typescript
// ✅ 正确 - 解释业务逻辑
// 使用 200ms 延迟，因为用户报告立即切换会导致视觉闪烁
await sleep(200)

// ❌ 错误 - 重复代码内容
// 将 count 加 1
count++

// ✅ 正确 - 解释复杂算法
// 使用二分查找优化性能，复杂度从 O(n) 降至 O(log n)
function binarySearch(sortedArray: number[], target: number): number {
  // ...
}
```

### 11.2 API 文档

```typescript
/**
 * 创建新项目
 *
 * @param metadata - 项目元数据
 * @param metadata.title - 项目标题（必填，1-100 字符）
 * @param metadata.genre - 小说类型（可选）
 * @param metadata.description - 项目描述（可选，最多 500 字符）
 * @returns 创建的项目对象
 * @throws {ValidationError} 当必填字段缺失或格式错误时
 * @throws {StorageError} 当存储失败时
 *
 * @example
 * const project = await projectService.create({
 *   title: '我的小说',
 *   genre: '奇幻'
 * })
 */
async function create(metadata: ProjectMetadata): Promise<Project> {
  // ...
}
```

### 11.3 README 维护

每个新模块应包含：

1. 模块用途说明
2. 主要 API 和用法
3. 示例代码
4. 注意事项

---

## 12. 样式规范

### 12.1 CSS 变量

使用 CSS 变量定义主题：

```css
:root {
  /* 颜色 */
  --color-primary: #4f46e5;
  --color-secondary: #10b981;
  --color-error: #ef4444;

  /* 文本 */
  --text-primary: #1f2937;
  --text-secondary: #6b7280;

  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

### 12.2 UnoCSS 规范

```vue
<!-- 使用 UnoCSS 的原子化类 -->
<template>
  <div class="flex items-center justify-between p-4 bg-white rounded-lg shadow">
    <h2 class="text-xl font-bold text-gray-800">标题</h2>
    <n-button type="primary">按钮</n-button>
  </div>
</template>
```

### 12.3 组件样式

```vue
<style scoped>
/* 使用 scoped 避免样式污染 */

/* BEM 命名约定 */
.component-name {
  &__element {
    /* 元素 */
  }

  &--modifier {
    /* 修饰符 */
  }
}

/* 示例 */
.card {
  padding: var(--spacing-md);

  &__header {
    margin-bottom: var(--spacing-sm);
  }

  &--featured {
    border: 2px solid var(--color-primary);
  }
}
</style>
```

---

## 13. 性能优化建议

### 13.1 Vue 组件优化

**使用 `v-memo` 优化列表渲染**：

```vue
<template>
  <div v-for="item in items" :key="item.id" v-memo="[item.id, item.title]">
    <ItemComponent :item="item" />
  </div>
</template>
```

**使用 `shallowRef` 处理大型数据结构**：

```typescript
// 处理大型只读数据
const largeData = shallowRef<LargeData[]>([])

// 需要深层响应时使用
const formData = ref({ nested: { deep: { value: '' } } })
```

### 13.2 异步组件

```typescript
// 路由懒加载
const EditorPage = () => import('@/pages/EditorPage.vue')

// 组件异步加载
const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: ChartSkeleton,
  delay: 200
})
```

### 13.3 计算属性缓存

```typescript
// ✅ 正确 - 计算属性自动缓存
const sortedChapters = computed(() => {
  return chapters.value.slice().sort((a, b) => a.order - b.order)
})

// ❌ 错误 - 方法每次调用都会重新计算
const sortedChapters = () => {
  return chapters.value.slice().sort((a, b) => a.order - b.order)
}
```

---

## 14. 安全规范

### 14.1 禁止 `v-html` 解析用户输入

```vue
<!-- ❌ 危险 -->
<div v-html="userContent"></div>

<!-- ✅ 安全 - 使用纯文本或白名单标签 -->
<div>{{ userContent }}</div>
```

### 14.2 API 密钥管理

```typescript
// ❌ 错误 - 硬编码密钥
const API_KEY = 'sk-xxxxx'

// ✅ 正确 - 使用环境变量或加密存储
import { getSecureKey } from '@/main/crypto'
const apiKey = await getSecureKey('api-key')
```

### 14.3 跨域限制

在 Electron 主进程中配置 CSP：

```typescript
// main.ts
app.commandLine.appendSwitch('disable-features', 'CrossSiteDocumentBlockingAlways')
```

### 14.4 进程隔离

```typescript
// 渲染进程通过 preload 脚本与主进程通信
// 永远不要在渲染进程中直接调用 Node.js API
```

---

## 附录

### A. ESLint 规则豁免

在必要时可以使用 eslint-disable 注释，但必须添加说明：

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 原因：第三方库类型定义不完整，等待上游修复
const legacyLib: any = require('legacy-lib')
```

### B. 相关资源

- [Vue 3 官方文档](https://vuejs.org/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Electron 文档](https://www.electronjs.org/)
- [Naive UI 组件库](https://www.naiveui.org/)

---

> **版本**: v1.0.0
> **最后更新**: 2026-05-21
> **维护者**: 墨流开发团队
