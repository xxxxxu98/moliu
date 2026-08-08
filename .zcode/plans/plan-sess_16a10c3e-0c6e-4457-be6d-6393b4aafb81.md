## 修复三个缺陷：单章蓝图解析失败、冒烟产物新旧混淆、CPN 序号前缀断句

### 缺陷 1：单章蓝图解析有时失败降级到算法派生（P1）

**根因**（两处独立的容错不足）：

1. `splitNamedSections`（`src/renderer/src/services/outline/parser/utils.ts:44,48`）要求 section 标题**严格全等**（`^#{2,}\s*单章蓝图\s*$`，行尾只允许空白）。AI 常给 section 标题加括号说明（`## 单章蓝图（强制 30 章）`、`## 逐章蓝图`），导致整段 body 取空 → `parseChapterBlueprintSection('')` 返回 `[]` → 降级。
2. `parseChapterBlueprintSection`（`expanded-outline-parser.ts:89`）切块正则 `/^###\s+第?\s*\d+\s*章?/gm` 强制恰好 3 个井号 + 至少一个空格。AI 写 `## 第1章`（2井号）、`#### 第1章`（4井号）、`###第1章`（无空格）时该块被漏掉，累计漏到 <28 章触发 `unified-generator.ts:416` 的整体丢弃 → 降级。

**修复**：
- `utils.ts:splitNamedSections`：把严格全等匹配（L48 的 `^#{2,}\s*${heading}\s*$`）放宽为"heading **包含**目标名"（`^#{2,}\s*.*${heading}.*$`），这样 `## 单章蓝图（强制）` 能匹配到 `单章蓝图`。注意 headings 是具体中文短语，误匹配概率极低；为安全起见匹配仍要求 heading 以目标短语作为子串出现。L44 的切块正则同步加 `.*` 尾部容忍括号说明。
- `expanded-outline-parser.ts:89`：切块正则放宽为 `/^#{2,4}\s*第?\s*\d+\s*章?/gm`——`#{2,4}` 容忍 2/3/4 井号，`\s*`（零或多）替代 `\s+`（一或多）容忍 `###第1章` 无空格写法。orderIndex 提取逻辑（L93 `match(/\d+/)`）不变。

### 缺陷 2：冒烟产物新旧混淆（P1）

**根因**：`scripts/agent-storyflow-real-smoke.mjs:30` 调用 `cleanupSmokeArtifacts` 时只传了精确名数组（`['storyflow.closed-loop.outline.json', ...]`），**没传 `{ prefixes }`**。cleanup 的精确名分支只做字符串全等匹配，删不掉 `storyflow.closed-loop.prose.2026-08-07T02-30-19.bak` 这类带后缀的孪生产物。对比续写脚本（`agent-continue-write-real.mjs:41`）传了 `prefixes: ['continue-write.real.']` 就没此问题。

**修复**：`agent-storyflow-real-smoke.mjs:30` 的调用补上 `{ prefixes: ['storyflow.closed-loop.'] }`，复用现成的前缀删除分支（L41-53，已对文件和目录一视同仁用 `rmSync recursive`，能删 `.bak` 目录）。同时把精确名数组保留（两者互补：精确名命中本轮实时目录，prefix 兜底清掉所有带后缀的孪生产物）。更新 L27-29 注释说明现在也会清理带后缀的备份。

### 缺陷 3：CPN 节点解析带序号前缀断句（P2）

**根因**：`extractMultiValueField`（`utils.ts:131-141`）的 fallback 路径，`extractFieldValue` 经 `compactLines` 把多行拍平成单行后，对 `1. 陈默穿越，发现自己是大梁七品小吏，正在验尸 2. 陈默用现代法医思维` 按 `[；;、，,/]` 切分，序号 `2.` `3.` 粘到前半句尾部 → 碎片 `["1. 陈默穿越", "发现自己是大梁七品小吏", "正在验尸 2. 陈默用现代法医思维", ...]`。`extractNumberedItems`（L90-117）只认"编号项独占一行"，对同一行内联编号无能为力。

**修复**：在 `extractMultiValueField` 的 fallback 路径（L131 之后、L137 `.split` 之前）插入一个内联编号切分步骤：
- 新增私有函数 `splitInlineNumberedItems(value)`：用正则识别内联编号边界。正则设计为保守方案——匹配 `(?:^|[，,；;、\s])(\d{1,2})[.、)]\s` 这种"在标点/空白/行首后、1-2位数字、`.、)` 三种编号标点之一、后接空白"的模式，作为切分锚点。
- 若切出 ≥2 项，每项剥掉首部序号前缀（`/^\s*\d{1,2}[.、)]\s*/`），直接返回（不再二次按标点切，与多行编号路径语义一致——编号项是完整语义单元）。
- 若切出 <2 项（即没有内联编号），保持原 fallback 行为（按 `[；;、，,/]` 切）。
- 误伤防护：只在 fallback 内（即多行编号未命中时）触发；正则要求数字前有标点/空白/行首边界，避免把"第5章""500两"误切（这些场景数字前是"第"或直接是数字，不满足"标点/空白 + 数字 + 编号标点"模式）。

CPNs 和 mustCover 共用 `extractMultiValueField`，修一处同治两处。

### 回归测试（3 个修复点各补 case）

1. **缺陷 1（单章蓝图）** → `expanded-outline-parser.test.ts`：
   - 补 case：section 标题为 `## 单章蓝图（强制 30 章）`（带括号后缀），断言 chapterBlueprints 仍解析成功。
   - 补 case：章节 heading 用 `## 第1章`（2井号）/ `###第1章`（无空格），断言蓝图块不被漏掉。

2. **缺陷 3（CPN 序号）** → `outline-utils.test.ts`：
   - 补 case：单行内联编号 `- CPNs：1. 陈默穿越，发现自己是大梁七品小吏 2. 陈默用现代法医思维 3. 陈默破案`，断言拆成 3 项、无序号前缀、序号不串号（`not.toMatch(/穿越\s*2\./)`）。
   - 补 case：mustCover 单行内联编号（验证同治）。
   - 补 case：含数值的文本（如"500 两银子"）不被误切。

3. **缺陷 2（cleanup）** → 无单测（脚本是 `node` 直接跑的 `.mjs`，项目里 cleanup 无测试惯例）。验证方式：修复后手动跑 `node scripts/cleanup-smoke-artifacts.mjs` 或直接观察下次 `smoke:storyflow:real` 前的清理日志是否含 `.bak` 条目。在 PR 描述里注明手动验证步骤。

### 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/renderer/src/services/outline/parser/utils.ts` | `splitNamedSections` 放宽 section 名匹配（含而非全等）；`extractMultiValueField` fallback 插入内联编号切分 |
| `src/renderer/src/services/outline/parser/expanded-outline-parser.ts` | `parseChapterBlueprintSection` 切块正则放宽（`#{2,4}` + `\s*`） |
| `scripts/agent-storyflow-real-smoke.mjs` | cleanup 调用补 `prefixes` |
| `src/renderer/src/services/outline/parser/__tests__/expanded-outline-parser.test.ts` | 补 2 个 case（section 括号后缀 + 章节标题层级） |
| `src/renderer/src/services/outline/__tests__/outline-utils.test.ts` | 补 3 个 case（内联编号 + mustCover + 数值误切防护） |

### 验证

- `npm run test -- --run src/renderer/src/services/outline/parser/__tests__/expanded-outline-parser.test.ts src/renderer/src/services/outline/__tests__/outline-utils.test.ts`（新增 + 既有 case 全绿）
- `npm run test:continue-write`（确保 adapter / normalize 链路无回归）
- cleanup 修复通过 PR 描述的手动验证步骤确认
