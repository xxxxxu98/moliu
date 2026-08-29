# 墨流 (Moliu) 项目开发规范

> 本规范旨在统一代码风格、提高代码质量、确保团队协作效率。
> 所有团队成员在开发过程中必须遵循本规范。

> 🎯 **最高目标**：项目的终极目标是「全自动生成可投稿主流平台的网文」（八层质量目标 + 生产可用验收门），
> 全文见 [`north-star.md`](./north-star.md)。**一切开发工作必须围绕该目标**：
> 动手前先回答「这个改动推进了哪一层质量目标」，回答不了的降优先级或不做。

> 📌 **唯一权威源（SSOT）**：本文件是项目开发规范的唯一权威来源。
> 以下入口文件均指向本文件，**修改规范时请直接编辑本文件**，入口文件无需改动：
> - 根目录 `CLAUDE.md`（Claude Code / Codex / ZCode）
> - 根目录 `.cursorrules`（Cursor）
> - `.github/copilot-instructions.md`（GitHub Copilot）

## 目录

- [0. 项目终极目标](#0-项目终极目标)
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
  - [9.1 服务结构](#91-服务结构)
  - [9.2 错误处理](#92-错误处理)
  - [9.3 AI 请求：禁止 max_tokens / maxTokens](#93-ai-请求禁止-max_tokens--maxtokens)
  - [9.4 禁止前端用规则/正则做语义判定](#94-禁止前端用规则正则做语义判定)
- [10. 测试规范](#10-测试规范)
  - [10.5 冒烟测试与真实环境一致性](#105-冒烟测试与真实环境一致性)
- [11. 文档要求](#11-文档要求)
  - [11.4 注释规范](#114-注释规范)
- [12. 样式规范](#12-样式规范)
- [13. 性能优化建议](#13-性能优化建议)
- [14. 安全规范](#14-安全规范)
- [15. 代码简洁性规范](#15-代码简洁性规范)
- [16. 工程化纪律](#16-工程化纪律)

---

## 0. 项目终极目标

> 完整声明见 [`north-star.md`](./north-star.md)，此处为速记摘要。**时时刻刻记住：一切代码围绕此目标。**

- **使命**：任选题材，全自动生成可投稿主流小说平台的网文——人工零干预、预检全绿、书审无 S1/S2、读者评分 ≥ 80、前三章盲测骗过老书编、稳定完本。
- **本质判断**：网文是情绪产品，核心是「期待感 → 压抑 → 释放」循环；文笔是入场券，爽点排期、期待感管理、跨章不崩、能完本才是生死线。
- **八层质量目标**：L1 开篇（黄金三章）→ L2 节奏（章微循环）→ L3 钩子悬念 → L4 爽点 → L5 人物 → L6 连续性 → L7 文笔（不出戏即可）→ L8 市场合规。
- **工程化铁律**：每个质量维度必须形成闭环「生成约束 → 确定性检测 → AI 审读 → 修复回路 → 真实验收」；只写提示词不做检测等于没做。
- **决策法则**：任何功能/重构/修复先回答「推进了哪一层」，回答不了的不做。

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

### 3.2 文件归属红线

**不同类型的代码必须放在对应的目录，按模块归位**——目录结构即架构，乱放文件就是欠架构债。

1. **新文件先回答归属**：创建任何新文件前，必须先回答「它属于哪个模块、哪一层」。找不到归属目录 = 职责设计有问题，先理清职责再动手，禁止随手一扔。
2. **按类型归位**（新增文件对号入座）：

| 文件类型 | 归属位置 | 禁止 |
|----------|----------|------|
| 类型定义 | `types/` 或模块内 `types.ts` | 散落在业务文件里 export 全局类型 |
| 单元测试 | 就近 `__tests__/` 目录 | 测试与源码混放 |
| 脚本（冒烟/清理/triage） | `scripts/` | 一次性脚本进 `src/` 或根目录 |
| 临时实验代码 | `temp/`（gitignore 内） | 遗留在 `src/` 或项目根目录 |
| 常量/配置 | 模块内 `constants.ts` / `config/` | 魔法数字散落、每个文件各存一份 |
| 修复回路/检测器 | 与所属服务同模块 | 跨模块交叉引用形成环 |

3. **一个模块一个职责**：禁止出现「utils 垃圾抽屉」——工具函数按领域归入对应模块的 utils，公共程度不足以跨模块复用的不进全局 `utils/`。
4. **业务代码不进根目录**：项目根目录只放工程配置与入口文件。
5. **目录新增需谨慎**：新建顶层目录（`src/` 下第一层）属于架构决策，须在 PR 描述中说明理由。

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

### 9.3 AI 请求：禁止 `max_tokens` / `maxTokens`

**红线**：向任何 AI Provider 发请求时，**永远不要**在请求体、SDK options 或 client 配置中添加 `max_tokens` / `maxTokens`。

```typescript
// ❌ 错误 — 限制输出长度，易导致大纲/长文被截断
await client.chat(messages, { maxTokens: 8000 })
body: JSON.stringify({ model, messages, max_tokens: 4096 })

// ✅ 正确 — 不传输出上限，交由模型/平台默认行为
await client.chat(messages, { temperature: 0.7, topP: 0.9 })
body: JSON.stringify({ model, messages, temperature: 0.7, top_p: 0.9 })
```

说明：
- 上下文预算、本地截断（如 `ContextPackBuilder.maxTokens`、`truncateToTokens`）属于**输入侧**控制，与本规则无关，可以保留。
- 设置页若仍有「最大 Token」字段，也不得再写入实际 API 请求。
- 目标字数请通过提示词约束，不要用 `max_tokens` 代替。

---

### 9.4 禁止前端用规则/正则做语义判定

**红线**：除非特别情况，**禁止在渲染进程（前端）用正则/规则表/关键词词表做语义判定类逻辑**——这种方式不保险。

**什么算"语义判定"**（禁止清单）：

- 判断某句话是否表达真实事件（如「这句是不是死亡事实」）
- 意图/语气识别（威胁 vs 陈述、假设 vs 完成、转述 vs 目击）
- 文本语义分类（跨章目标 vs 单章目标、禁区与履约是否冲突）
- 角色/实体关系与状态的语义推断

**为什么禁**：语法枚举不收敛。正则只懂字面，模型文风与题材一变就翻出新形态，每个新形态都是一次新的误报/漏报 + 一次补丁。2026-08-28 单日实证：死亡提取的确定性词表连爆 8 种新形态（转述者同句、只要/便会、一旦/都要……），每一轮"修漏报"还引入新的误报语境，形成反噬循环。

```typescript
// ❌ 错误 — 用词表裁决"这句话是否真实死亡"（2026-08-28 连爆 8 形态的根源）
if (EXECUTION_SENTENCE_RE.test(sentence) && rosterSet.has(name)) {
  changes.push({ characterName: name, state: '死亡', ... })
}
if (HYPOTHETICAL_SENTENCE_RE.test(sentence)) continue  // 每遇到新句式就要补词
```

**✅ 正确姿势**（确定性代码只允许做三件事）：

1. **格式校验**：引号配对、字数区间、标题长度、终止符检查等确定性指标
2. **统计指标**：段落 CV、词频、相似度（复用 `normalizedSimilarity`）
3. **候选召回**：规则网只筛"疑似句"作为候选，**语义终审交 AI**——候选随当章已有的 AI 请求下发，逐条仲裁，AI 显式否决才丢弃，缺票保留（召回优先）

```typescript
// ✅ 正确 — 正则只出候选，AI 逐条仲裁（参考 DeathArbitrationCandidate 模式）
const deathCandidates = collectDeathArbitrationCandidates(prose, roster)
const facts = await factExtractor.extract({ ..., deathCandidates })
setDeathArbitration(deathCandidates, facts.candidateVerdicts ?? [])
// AI 显式 isDeath=false 才丢弃；isDeath=true 可救回被守卫拦截的候选
```

**优先级更高的做法——生成侧自标注**：让模型在生成时就输出结构化元数据，消费端标注优先、词表只兜无标注的旧路径。例如滚纲对 mustCover 节点自标注【单章】/【跨章】（`isCrossChapterGoal` 标注优先）、对禁区自标注【让路】（`detectMustCoverForbiddenConflicts` 直认冲突）。

**特殊情况必须用规则时**（白名单 + 留痕义务）：

- 格式校验、统计指标、结构初筛（如姓名形态初筛 `isPlausibleCharacterName`）——正则是对的工具
- 性能敏感热路径且语义误差可接受——必须在注释写明"为什么规则够用"，并配**双向回归样本**（误报向 + 漏报向各至少一条）

**存量正则的处理原则**：新 bug 不再补词表，按上述模式改造成 AI 仲裁或生成侧标注。参考实现：`FactExtractor` 死亡候选仲裁、`outline-roller` 单章/跨章自标注、`outlineCompleteness` 地点扫描降级 warnings。

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
npm run test                           # 运行所有测试
npm run test:watch                     # 监听模式
npm run test:continue-write            # 续写链路定向回归（harness + 蓝本归一化 + useChapterWriter）
npm run smoke:continue-write:real      # 真实 AI 单章续写冒烟
npm run smoke:continue-write:real:multi  # 真实 AI 多章批量续写冒烟（与批量写作同路径）
npm run smoke:topic-discovery:real     # 开题中心真实 AI 冒烟（seeds/radar/mix/dice/twist/prompt）
npm run smoke:storyflow:real           # storyflow 闭环真实 AI 冒烟（大纲生成 → 应用 → 批量续写）
npm run cleanup:continue-write-artifacts # 清理续写冒烟产物
```

### 10.5 冒烟测试与真实环境一致性

**红线**：冒烟测试必须与真实环境（生产流程）走**同一条代码路径**，禁止「冒烟一套逻辑、真实一套逻辑」的双轨维护。双轨意味着每次改真实流程都要同步改冒烟，漏改一次冒烟就变成自欺欺人的绿灯。

**「数据可替身，流程不可替身」原则**：

- ✅ **允许替换**：AI 响应（fixtures / 离线录制）、外部网络、时钟、随机源——这些是不稳定依赖。
- ❌ **禁止替换**：调用链路、服务入口、参数组装、后处理、判定标准、落盘路径——这些是流程本体，必须与真实环境逐字节一致。

**具体要求**：

1. **同一入口**：冒烟脚本必须调用生产代码的同一服务入口/主流程函数（如冒烟与上线大循环共用 `AgentLoopRunner`），禁止在脚本里复制一份简化版流程。
2. **差异集中声明**：冒烟与真实环境的全部差异必须收敛到**单一注入点**（如 provider 注入、fixtures 加载器），并在脚本头部注释里明确列出「本脚本与真实环境的差异仅限……」。
3. **判定标准一致**：冒烟的通过/失败判定必须复用真实环境的 triage / 质量门禁逻辑，禁止冒烟宽松、真实严格（或反之）。放宽门禁必须人工确认（见 CLAUDE.md 冒烟护栏）。
4. **真实性下限**：提交前跑通的冒烟若使用了 mock，必须在命令名或输出中体现（如 `:mock` 后缀），默认 `smoke:*:real` 命令必须打真实 AI。
5. **豁免须留痕**：确实无法一致的例外情况，必须在脚本头注释写明「为什么无法一致 + 风险是什么」，并在 PR 描述中说明。

```typescript
// ❌ 错误 — 冒烟里手搓简化流程，与真实环境双轨
// scripts/smoke-outline.mjs
const outline = await myOwnSimplifiedOutlineCall(prompt)  // 复制品，真实环境已改为 AgentLoopRunner

// ✅ 正确 — 冒烟走真实入口，仅注入差异点
// scripts/smoke-outline.mjs
// 与真实环境差异：仅 provider 注入为离线 fixtures，其余（协议/预算/落盘/判定）完全一致
import { runOutlineFlow } from '../src/renderer/src/services/outline/entry.ts'
const result = await runOutlineFlow(input, { provider: fixtureProvider })
```

**自查口诀**：写完冒烟问一句——「把 provider 换回真实 AI，这条链路就是生产流程吗？」答案是 否 就不合格。

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

### 11.4 注释规范

**目标注释率约 30%（合格区间 20%–35%）**——本项目由 AI 协作长期迭代，注释是下一个接手者（人或 AI）最快的上下文来源。但**宁缺勿滥**：凑数的废话注释比没有注释更糟，废话注释不算入合格注释。

**必须注释的位置**（缺一即驳回）：

1. **文件头注释**：每个 `.ts` / `.vue` / `.mjs` 文件第一屏必须有块注释——本文件职责（一句话）、所属模块、关键约束或坑（如有）。
2. **导出符号**：每个导出的函数 / 类 / 类型 / 常量必须有 JSDoc（一句话说明用途即可，公开 API 按 §11.2 完整格式）。
3. **意图注释**：复杂算法、绕坑代码（workaround）、看似多余实则必要的判断，必须注释**为什么**。

```typescript
/**
 * 章节批量续写主循环。
 *
 * 职责：按批次组装上下文并调用多轮工具调用检索，产出章节正文。
 * 约束：禁止在此处限制 max_tokens（见规范 §9.3）；批次池一拒全弃问题见 triage 规则。
 */
export class ChapterBatchLoop {
  /** 单批次最大重试次数；超过即触发 stalled 硬停止，防止无限烧 token */
  private static readonly MAX_BATCH_RETRIES = 3
}
```

**禁止**：

```typescript
// ❌ 废话注释 — 复述代码本身
// 将 count 加 1
count++

// ❌ 注释掉的死代码 — 直接删除，git 历史会记住
// const oldLogic = ...
```

**可放宽**：纯类型声明文件（`types/*.ts` 字段语义自明时）、生成的代码、`.d.ts`——文件头注释仍必须有。

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

## 15. 代码简洁性规范

**代码是写给人读的，顺便让机器执行。** 简洁是默认要求，不是优化项。

### 15.1 体量上限（超限须拆分并在 PR 说明）

| 单元 | 建议上限 | 超限处理 |
|------|----------|----------|
| 单文件 | 400 行 | 按职责拆分为子模块（同目录） |
| 单函数 | 60 行 / 单屏 | 提取子函数，主函数保留「目录级」可读性 |
| 单层缩进 | 3 层 | 提前返回（early return）、提取函数 |
| 函数参数 | 4 个 | 收拢为参数对象（interface） |

### 15.2 禁止死代码

- ❌ 注释掉的代码——直接删除（git 历史会记住）；
- ❌ 不可达分支、无人引用的导出、预留但未使用的参数——删除；
- ❌ 「先留着以后用」的抽象——YAGNI，有第二个使用方时再抽象。
- 重构完成时必须顺手清死代码；检测工具报出的未引用导出不得长期挂着。

### 15.3 复用优先，禁止重复实现

1. **动手前先搜索**：`src/` 与 `scripts/` 里已有相似功能（如 token 截断、相似度计算 `normalizedSimilarity`、sanitize 管道）必须复用，禁止另写一份平行实现。
2. **同一逻辑只允许存在一份**：发现两处近似实现时，抽公共函数收敛，而非各修各的 bug。
3. **新增第三方依赖须有理由**：先确认项目内无等价实现；PR 中说明「为什么需要这个包、体积/维护成本是否值得」。

### 15.4 命名即文档

变量/函数名要能让人不看实现就懂（动宾结构、布尔 is/has 前缀，见 §4.3）。如果不得不写注释才能解释清一个名字，先改名字。

---

## 16. 工程化纪律

**整个项目必须工程化运转**：可重复、可回归、可归因。以下是踩坑换来的硬纪律。

### 16.1 显式失败优于静默吞错

- 任何 `catch` 必须二选一：**处理**（带恢复动作）或**带上下文重新抛出**；❌ 空 catch、❌ 吞掉后只打一行 log 继续跑、❌ 返回假成功值。
- 关键流程（生成、落盘、归档）的每一步失败必须上浮到用户可见的提示。
- 教训：开题展开首次失败曾静默无提示，用户以为成功，浪费整轮等待。

### 16.2 失败分类必须证据化

- 「瞬态失败 vs 硬性失败」「网络问题 vs 模型能力问题」的判定必须基于日志证据，禁止凭错误信息字面 pattern 拍脑袋。
- 每次误判案例（如 AbortError 误判超时、400 geo-block 误判模型能力）必须固化为 triage 规则 + 回归测试，防止复发。

### 16.3 配置与魔法数字收口

- 阈值、超时、重试次数、字数区间等一律收口到常量/配置模块，禁止散落硬编码。
- 配置项默认值注意**引用共享**陷阱：数组/对象默认值必须用工厂函数返回新实例。
- 环境变量统一入口读取（renderer 端禁止裸读 `process.env`，走 `utils/env.ts`）。

### 16.4 修 bug 必须带回归测试

每个 bug 修复必须附带能复现原 bug 的回归测试（语义判定类需双向样本：误报向 + 漏报向各至少一条）。没有回归测试的修复视为未完成——同一个坑不允许摔两次。

### 16.5 临时产物治理

- `temp/` 目录产物由清理脚本统一管理（`npm run cleanup:*`）；需要长期保留的目录/文件必须登记进 KEEP 保护名单，防止误清。
- 冒烟/大循环产物必须归档到带时间戳的目录，不污染工作区。
- 调试日志、临时 QA 产物禁止提交进 git。

### 16.6 文档与代码同步

- 行为变更必须同步对应文档（规范、SKILL.md、README），文档描述与实际行为不一致时，以更正文档为 part of the task。
- 规范变更只改本文件（SSOT），入口文件（CLAUDE.md 等）保持短摘要。
- 规划类文档落地后及时删除或并入正式文档，避免双源真相。

### 16.7 可观测性兜底

- 长耗时流程（AI 请求、批量循环）必须有：超时预算（含评审等慢阶段）、进度日志、失败时的上下文留存（trace 归档）。
- 禁止无超时的外部调用；禁止吞掉重试次数信息。

---

## 附录

### A. ESLint 规则豁免

在必要时可以使用 eslint-disable 注释，但必须添加说明：

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 原因：第三方库类型定义不完整，等待上游修复
const legacyLib: any = require('legacy-lib')
```

### B. 项目文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 文档索引与快速开始 |
| [reference-projects.md](./reference-projects.md) | 参考开源网文项目映射 |
| [prd.md](./prd.md) | 产品需求 |

### C. 外部资源

- [Vue 3 官方文档](https://vuejs.org/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Electron 文档](https://www.electronjs.org/)
- [Naive UI 组件库](https://www.naiveui.org/)

---

> **版本**: v1.2.0
> **最后更新**: 2026-08-29
> **维护者**: 墨流开发团队
