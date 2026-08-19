import type { OutlineDirection } from '../../types/direction';
import type { BuiltPrompt } from './shared';
import {
  AVG_WORDS_PER_CHAPTER,
  buildWordCountBreakdown,
  type WordCountBreakdown,
} from '@/services/outline/utils';
import { buildWebnovelCraftPrompt } from './core-principles';
import { OUTLINE_COMPLETENESS_POLICY } from '@/services/outline/validation/outlineCompleteness';

/** 启动包/单章蓝图必须覆盖的章数，与可应用门槛共用同一常量 */
const STARTUP_CHAPTER_COUNT = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;

/** 启动包区块粒度：每 5 章一块 */
const STARTUP_BLOCK_SIZE = 5;

export interface ExpandDirectionPromptOptions {
  seed: string;
  direction: OutlineDirection;
  wordCountRange: string;
  enhancementBrief?: string;
}

function buildScaleGuidance(wordCountRange: string): WordCountBreakdown & {
  averageWordsPerChapter: number;
  startupRatio: number;
} {
  const breakdown = buildWordCountBreakdown(wordCountRange);
  return {
    ...breakdown,
    averageWordsPerChapter: AVG_WORDS_PER_CHAPTER,
    startupRatio: Number((STARTUP_CHAPTER_COUNT / breakdown.estimatedChapterCount).toFixed(3)),
  };
}

const VOLUME_FIELDS = `- 卷标题：
- 卷目标：
- 卷冲突：
- 卷高潮：
- 卷反转：
- 卷尾钩子：
- 主角成长：
- 关键角色：
- 埋设伏笔：
- 回收伏笔：
- 关系变化：`;

const STARTUP_BLOCK_FIELDS = `- 目标：
- 必出事件：
- 必出爽点：
- 必留钩子：
- 本块禁区：
- 节奏要求：
- 读者期待：`;

/** 按 STARTUP_CHAPTER_COUNT 动态生成启动包区块模板（1-5 / 6-10 / …） */
export function buildStartupBlockSection(
  chapterCount: number = STARTUP_CHAPTER_COUNT,
  blockSize: number = STARTUP_BLOCK_SIZE,
): string {
  const blockCount = Math.ceil(chapterCount / blockSize);
  return Array.from({ length: blockCount }, (_, index) => {
    const start = index * blockSize + 1;
    const end = Math.min((index + 1) * blockSize, chapterCount);
    return `### ${start}-${end}章\n${STARTUP_BLOCK_FIELDS}`;
  }).join('\n\n');
}

/** 按目标规模动态生成卷纲模板（百万/千万字可达数十卷，不再写死 3 卷） */
export function buildVolumePlanSection(volumeCount: number): string {
  const count = Math.max(3, Math.min(48, Math.round(volumeCount) || 3));
  return Array.from({ length: count }, (_, index) => {
    return `### 第${index + 1}卷\n${VOLUME_FIELDS}`;
  }).join('\n\n');
}

/**
 * 共享前导：身份 + 通用要求 + 网文写作准则。
 * 分步生成时每步都需要它，让模型保持同一人格与基线约束。
 */
export const SHARED_PREAMBLE = `你是一名擅长中文长篇网文策划的资深故事架构师。现在用户已经从多个方向中选定了一个最值得展开的方向，你的任务是把它扩展成“可执行型长篇方案”。

注意：你的目标不是写成文学赏析稿，也不是写百科设定，而是产出一份适合继续拆卷纲、拆前${STARTUP_CHAPTER_COUNT}章、拆章节蓝图的工程化方案。

请优先满足以下要求：
1. 方案必须具备明确卖点、明确主角路径、明确冲突升级链
2. 方案必须适合长篇网文连载，强调前${STARTUP_CHAPTER_COUNT}章抓读者的能力
3. 所有模块都要服务“后续可继续写”，而不是只服务展示
4. 尽量少写空泛设定，多写冲突、目标、代价、升级、钩子
5. 【本次不要输出单章蓝图】禁止把章节展开成整本梗概，也禁止输出「## 单章蓝图」「## 逐章蓝图」等逐章小节；逐章拆解会在后续请求中分批完成，本次只需把前${STARTUP_CHAPTER_COUNT}章的节奏写进「## 前${STARTUP_CHAPTER_COUNT}章启动包」的 5 章区块里
6. 必须严格匹配目标字数区间对应的总章节规模，按“平均每章约2500字”估算总章节数，避免前${STARTUP_CHAPTER_COUNT}章就消耗完主线
7. 【开篇钩子硬约束】开篇钩子必须是 30 字以内的单场景动作钩子（如「一睁眼正在验尸」「金手指砸脸」），只写开局第一幕的瞬间画面，禁止写整卷剧情概括、目标陈述或倒计时预告。超过 35 字视为格式错误，必须删减到 30 字以内再输出
7a. 【标题字数硬约束】后续拆章产出的每一章「标题」必须控制在 ${OUTLINE_COMPLETENESS_POLICY.titleMinChars}-${OUTLINE_COMPLETENESS_POLICY.titleMaxChars} 字以内（网文目录行长度上限）。超长标题属于格式错误，会被系统强制截断破坏语义——写不下就砍修饰语，不得删主谓结构凑字数
8. 【必出事件硬约束】每个区间的「必出事件」必须是单章可兑现的独立事件：
   - 同一场景链（如「醒来→验尸→当众指认→被诬入狱」）必须合并为一条，禁止拆成多条
   - 每条事件一句话写完（8～30 字，最多 40 字），禁止换行
   - 【括号硬约束】禁止使用任何括号（中文（）或英文()）；如需补充说明一律用逗号并入句中。括号不得跨事件拆分——「发现效果（场景重复」+「人物卡帧）」这种把一个括号拆到两条事件里的写法属于严重格式错误
9. 【区块高潮密度硬约束】每个 5 章区块的节奏必须与「平均每章约2500字」「一块约 1.2 万字」的篇幅容量匹配，避免把多条独立的重大转折压缩进同一块：
   - 一个区块最多承载 2 个核心转折（对决/破局/身份反转/关键抉择），后续拆章时才有空间逐章分配
   - 区块「目标」若出现「同时完成X与Y」这类并列任务，必须说明二者是同一事件链的两个环节，而非两个独立高潮
   - 中后期区块不得通过提高事件密度来压缩主线——主线推进速度应通过「升级新场景/引入新变量/深化已有冲突」实现，而非「一块塞满五件大事」

${buildWebnovelCraftPrompt()}`;

/** 输出格式相关额外规则：通用，分步与一次性生成都需遵守 */
export const SHARED_FORMAT_RULES = `额外规则：
- 禁止输出 markdown 表格
- 禁止输出完整世界观百科
- 禁止输出完整章节目录
- “目标读者”“核心情绪”“卖点标签”“风格关键词”“关键角色”等字段可用顿号或分号分隔多个短语
- “冲突升级链”请用 3-5 个短语概括，按递进顺序表达
- “埋设伏笔”“回收伏笔”“关系变化”“角色资源”请用顿号、分号或“角色名：变化内容”的形式简洁列出
- “伏笔类型”限定为：身份伏笔 / 关系伏笔 / 世界规则伏笔 / 能力伏笔 / 事件伏笔 / 物件伏笔 / 角色伏笔 / 对话伏笔
- “重要级别”限定为：主线 / 支线 / 情感
- 每条伏笔都要明确“埋设章节”和“回收章节”，并保证至少覆盖短伏笔、中伏笔、长伏笔各 1 条
- “关键角色规划”必须按分层模板完整输出，不得跳层，不得把所有角色都塞进同一层
- 至少输出 10 个关键角色，且必须覆盖：常驻核心角色 4 个、中前期重要角色 2 个、中后期接棒角色 2 个、势力/阵营代表角色 2 个；若同一角色兼任多个功能，也必须额外补足新的独立角色，不得用同名角色重复顶格
- 至少形成 3 组以上非主角之间的关系链或利益冲突链，并在“关系变化”中明确写出谁与谁如何变化
- “伏笔规划”必须按分级模板完整输出，至少包含：3 条短伏笔、3 条中伏笔、2 条长伏笔、2 条终局伏笔
- 至少覆盖：身份、关系、规则、能力、事件、物件、角色、对话八类中的至少五类，且不能全部属于同一重要级别
- 每个关键角色都要写出可推进至少两卷的个人弧线，且至少与另一个非主角角色存在关系变化
- 必须明确给出“主角姓名”，不能只写“主角”“少年”“她”“他”等泛称
- “关键角色规划”中的主角必须放在“常驻核心角色”下，且“角色定位”必须明确写为“主角”
- “故事线规划”必须逐项填写地图线、阵营线、人物线、金手指线、世界规则线、矛盾线、收集线、感情线，不得留空标题
- “世界与势力规划”必须包含至少 3 个核心地点、3 个关键势力、3 条世界规则，且不要用卷标题直接充当地点名称
- “四幕结构”必须完整输出四幕，每幕都要给出幕目标、关键转折、幕结束状态
- “主要支线”至少输出 3 条，并给出起始章节与收束章节
- “情绪与爽点节奏”必须给出情绪弧线、高点章节、低点章节，并至少安排 3 个明确爽点
- “卖点承载规划”至少输出 3 条卖点，分类限定为：设定 / 角色 / 冲突 / 情绪 / 钩子 / 爽点
- “世界规则”的“类别”限定为：cultivation / magic / social / physics / custom
- “核心地点”的“层级”限定为：world / continent / country / city / district / special
- “情绪弧线”限定为：rising / falling / wave / mixed
- “情绪高点章节”“情绪低点章节”“起始章节”“收束章节”“建议章节”尽量输出数字，多个数字用顿号或逗号分隔
- “盟友”“敌对”“关联角色”“关联规则”可用顿号、分号或逗号分隔多个项
- “本块禁区”每个 5 章区间块给出 1-3 条该区间明确禁止发生的事（如“不能揭示主角真实身份”“不可让配角提前替主角兑现爽点”），用于约束正文不提前摊牌或泄露关键悬念；可用顿号分隔
- 如果原始方向信息不足，请主动补足能支撑长篇网文连载的目标链、冲突链和卷级递进结构，但不要脱离已选方向的核心卖点。
- “故事规模规划”必须与目标字数区间一致；“预计总章节数”要按平均每章约2500字估算，误差尽量控制在±10%以内
- “建议卷数”必须与卷纲实际输出卷数一致，并与目标字数区间匹配
- “前${STARTUP_CHAPTER_COUNT}章占比”必须体现为总章节数的前期启动比例，并在“长线推进说明”中解释为什么${STARTUP_CHAPTER_COUNT}章后仍有足够篇幅推进主线升级、地图扩展或人物关系递进。`;

/** 各段模板：从原 SYSTEM_PROMPT 原样拆出，保持字段名与解析器期望完全一致。 */

export const SECTION_STORY_POSITIONING = `## 故事定位
- 标题：
- 一句话卖点：
- premise：
- 题材标签：（1～3 个纯题材词，如古言、悬疑、玄幻；禁止填写目标读者、情绪或文风）
- 目标读者：
- 核心情绪：
- 卖点标签：
- 风格关键词：`;

export const SECTION_STORY_ENGINE = `## 核心驱动
- 主角姓名：
- 主角初始状态：
- 主角长期目标：
- 主角短期目标：
- 核心冲突：
- 冲突升级链：
- 失败代价：`;

export const SECTION_GOLDFINGER = `## 金手指设定
（金手指是本作的爽点引擎，是玄幻/系统/重生/异能品类的签约命门。必须填写完整，不可省略。）
- 金手指类型：
- 触发场景：
- 升级路径：（初阶→进阶→终极，分 3 阶段描述）
- 使用限制：
- 使用代价：
- 首次兑现章节：（建议 1-3 章，绑定黄金三章的爽点兑现）`;

export const SECTION_STORY_SCALE = `## 故事规模规划
- 目标字数：
- 预计总章节数：
- 章节平均字数：
- 建议卷数：
- 每卷预计章节数：
- 前${STARTUP_CHAPTER_COUNT}章占比：
- 长线推进说明：`;

export const SECTION_ACTS = `## 四幕结构
### 第一幕（建置）
- 幕目标：
- 关键转折：
- 幕结束状态：

### 第二幕A（对抗）
- 幕目标：
- 关键转折：
- 幕结束状态：

### 第二幕B（至暗）
- 幕目标：
- 关键转折：
- 幕结束状态：

### 第三幕（结局）
- 幕目标：
- 关键转折：
- 幕结束状态：`;

/** 卷纲段：构建时由 {{VOLUME_PLAN_SECTION}} 注入动态卷数模板 */
export const SECTION_VOLUME_PLAN = `## 卷纲
{{VOLUME_PLAN_SECTION}}`;

export const SECTION_WORLD = `## 世界与势力规划
### 核心地点
#### 地点1
- 名称：
- 层级：
- 剧情功能：
- 上级地点：
- 关联冲突：

#### 地点2
- 名称：
- 层级：
- 剧情功能：
- 上级地点：
- 关联冲突：

#### 地点3
- 名称：
- 层级：
- 剧情功能：
- 上级地点：
- 关联冲突：

### 关键势力
#### 势力1
- 名称：
- 势力定位：
- 核心目标：
- 盟友：
- 敌对：
- 与主角关系：
- 上级势力：

#### 势力2
- 名称：
- 势力定位：
- 核心目标：
- 盟友：
- 敌对：
- 与主角关系：
- 上级势力：

#### 势力3
- 名称：
- 势力定位：
- 核心目标：
- 盟友：
- 敌对：
- 与主角关系：
- 上级势力：

### 世界规则
#### 规则1
- 名称：
- 类别：
- 规则内容：
- 限制/代价：
- 关联规则：

#### 规则2
- 名称：
- 类别：
- 规则内容：
- 限制/代价：
- 关联规则：

#### 规则3
- 名称：
- 类别：
- 规则内容：
- 限制/代价：
- 关联规则：`;

/** 启动包段：构建时由 {{STARTUP_BLOCK_SECTION}} 注入动态 5 章块模板 */
export const SECTION_STARTUP = `## 前${STARTUP_CHAPTER_COUNT}章启动包
- 开篇钩子：
- 对读者的承诺：
- 主角第一印象：
- 第一次强记忆爽点：
- 第一轮冲突闭环：

{{STARTUP_BLOCK_SECTION}}`;

export const SECTION_SUBPLOTS = `## 主要支线
### 支线1
- 标题：
- 功能：
- 关联角色：
- 起始章节：
- 收束章节：
- 与主线关系：

### 支线2
- 标题：
- 功能：
- 关联角色：
- 起始章节：
- 收束章节：
- 与主线关系：

### 支线3
- 标题：
- 功能：
- 关联角色：
- 起始章节：
- 收束章节：
- 与主线关系：`;

export const SECTION_STORY_LINES = `## 故事线规划
- 地图线：
- 阵营线：
- 人物线：
- 金手指线：
- 世界规则线：
- 矛盾线：
- 收集线：
- 感情线：`;

export const SECTION_EMOTION = `## 情绪与爽点节奏
- 核心情绪：
- 次级情绪：
- 情绪弧线：
- 情绪高点章节：
- 情绪低点章节：
- 情绪密度建议：

### 爽点安排
（每个爽点必须是一个完整兑现闭环：轻视/压制→铺垫→兑现爆发→收获，禁止只列爽点类型名词。至少 3 个，前 3 个分别落在 1-5 / 6-15 / 16-${STARTUP_CHAPTER_COUNT} 章。）
#### 爽点1
- 类型：
- 描述：
- 建议章节：
- 所属区间：
- 触发场景：（谁、什么处境下触发）
- 铺垫：（前文的轻视/压制/困境，为兑现积蓄落差）
- 兑现：（爽点爆发的具体画面）
- 代价：（兑现付出的代价，避免无脑碾压）

#### 爽点2
- 类型：
- 描述：
- 建议章节：
- 所属区间：
- 触发场景：
- 铺垫：
- 兑现：
- 代价：

#### 爽点3
- 类型：
- 描述：
- 建议章节：
- 所属区间：
- 触发场景：
- 铺垫：
- 兑现：
- 代价：`;

export const SECTION_SELLING = `## 卖点承载规划
### 卖点1
- 名称：
- 描述：
- 分类：
- 优先级：
- 主要兑现阶段：

### 卖点2
- 名称：
- 描述：
- 分类：
- 优先级：
- 主要兑现阶段：

### 卖点3
- 名称：
- 描述：
- 分类：
- 优先级：
- 主要兑现阶段：`;

export const SECTION_CHARACTERS = `## 关键角色规划
（说明：以下角色分层输出，每层角色需按模板填写完整字段。主角必须在"常驻核心角色"中，其他角色根据登场阶段分配到对应层，不得遗漏任何层）
（反派梯队硬约束：必须形成"每卷一个阶段性小 boss + 一个贯穿中期的反派 + 一个终极反派"的梯队结构。每个反派都要有独立动机、合理智商和代价，禁止无脑送人头反派。小 boss 在本卷高潮被解决，贯穿反派跨卷施压，终极反派在全书结局对决。）

### 常驻核心角色（贯穿全篇，角色弧线覆盖全三卷）
#### 主角
- 姓名：
- 角色定位：主角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

#### 核心盟友
- 姓名：
- 角色定位：盟友
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

#### 第一卷阶段性反派（小 boss，本卷高潮被主角解决）
- 姓名：
- 角色定位：反派
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段）
- 角色资源：
- 关系变化：

#### 贯穿反派（跨卷施压，中期最大压力源）
- 姓名：
- 角色定位：反派
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段）
- 角色资源：
- 关系变化：

#### 终极反派（全书结局对决，动机与主角形成镜像）
- 姓名：
- 角色定位：反派
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段）
- 角色资源：
- 关系变化：

#### 导师/引路人
- 姓名：
- 角色定位：导师
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

### 中前期重要角色（1-2卷活跃，弧线覆盖1-2卷）
#### 情感关键角色
- 姓名：
- 角色定位：配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

#### 第二盟友/团队支柱
- 姓名：
- 角色定位：盟友
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

### 中后期接棒角色（2-3卷登场，弧线覆盖2-3卷）
#### 卷级变量角色A
- 姓名：
- 角色定位：配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

#### 卷级变量角色B
- 姓名：
- 角色定位：配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

### 势力/阵营代表角色（提供势力冲突、地图扩张、人际博弈）
#### 势力代表角色1
- 姓名：
- 角色定位：配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：

#### 势力代表角色2
- 姓名：
- 角色定位：配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：（起 → 中 → 终，用 → 连接三段，如：被退婚 → 觉醒传承 → 反杀大反派）
- 角色资源：
- 关系变化：`;

export const SECTION_FORESHADOW = `## 伏笔规划
（说明：以下伏笔分级输出，短伏笔服务前${STARTUP_CHAPTER_COUNT}章追读动力，中伏笔服务中期卷级悬念，长伏笔服务后期大高潮，终局伏笔服务全篇结局张力。每级必须有对应数量的伏笔，不得留空）

### 短伏笔（埋设1-${Math.round(STARTUP_CHAPTER_COUNT / 3)}章，回收${Math.round(STARTUP_CHAPTER_COUNT / 3)}-${STARTUP_CHAPTER_COUNT}章；服务前${STARTUP_CHAPTER_COUNT}章追读动力和首轮冲突闭环）
#### 短伏笔1
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

#### 短伏笔2
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

#### 短伏笔3
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

### 中伏笔（埋设${Math.round(STARTUP_CHAPTER_COUNT / 5)}-${STARTUP_CHAPTER_COUNT}章，回收${STARTUP_CHAPTER_COUNT}-${STARTUP_CHAPTER_COUNT * 2}章；服务中期卷级悬念和第二卷推进动力）
#### 中伏笔1
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

#### 中伏笔2
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

#### 中伏笔3
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

### 长伏笔（埋设20-50章，回收50-90章；服务后期大高潮和第二/三卷核心悬念）
#### 长伏笔1
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

#### 长伏笔2
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

### 终局伏笔（埋设30-80章，回收大结局；服务全书终局高潮和情感收束）
#### 终局伏笔1
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：

#### 终局伏笔2
- 伏笔内容：
- 伏笔类型：
- 重要级别：
- 埋设阶段：
- 埋设章节：
- 回收阶段：
- 回收章节：
- 载体角色：
- 关联冲突：
- 回收收益：`;

/**
 * 一次性 SYSTEM_PROMPT：由各段常量组合而成，与重构前逐字节一致。
 * 仅作为分步生成不可用时的回退，主流程已改用分步生成（见 expand-direction-steps.ts）。
 */
const SYSTEM_PROMPT = `${SHARED_PREAMBLE}

请严格使用以下固定结构输出，并且字段名保持一致。

# 主方案

${SECTION_STORY_POSITIONING}

${SECTION_STORY_ENGINE}

${SECTION_GOLDFINGER}

${SECTION_STORY_SCALE}

${SECTION_ACTS}

${SECTION_VOLUME_PLAN}

${SECTION_WORLD}

${SECTION_STARTUP}

${SECTION_SUBPLOTS}

${SECTION_STORY_LINES}

${SECTION_EMOTION}

${SECTION_SELLING}

${SECTION_CHARACTERS}

${SECTION_FORESHADOW}

${SHARED_FORMAT_RULES}`;

export function buildExpandDirectionPrompt(options: ExpandDirectionPromptOptions): BuiltPrompt {
  const { direction, seed, wordCountRange } = options;
  const scale = buildScaleGuidance(wordCountRange);
  const volumePlanSection = buildVolumePlanSection(scale.suggestedVolumeCount);
  const system = SYSTEM_PROMPT
    .replace('{{VOLUME_PLAN_SECTION}}', volumePlanSection)
    .replace('{{STARTUP_BLOCK_SECTION}}', buildStartupBlockSection());

  return {
    system,
    user: `请将下面这个已选中的创作方向，展开为可执行型长篇方案。

【目标字数区间】
${wordCountRange}

【规模换算参考】
- 按平均每章约${scale.averageWordsPerChapter}字估算
- 目标总字数约${scale.targetWordCount}字
- 预计总章节数约${scale.estimatedChapterCount}章
- 建议卷数约${scale.suggestedVolumeCount}卷
- 每卷预计约${scale.estimatedChaptersPerVolume}章
- 前${STARTUP_CHAPTER_COUNT}章约占全书${Math.round(scale.startupRatio * 100)}%

【原始创意种子】
${seed}

【已选方向】
标题：${direction.title}
一句话卖点：${direction.oneLiner}
premise：${direction.premise}
主角成长路径：${direction.protagonistArc}
核心冲突：${direction.coreConflict}
爽点风格：${direction.coolPointStyle.join('；')}
目标情绪：${direction.targetEmotions.join('；')}
风险提示：${direction.riskNotes.join('；')}
长篇承载力：${direction.longformCapacityNote || '未提供'}
推荐理由：${direction.recommendedReason}

${options.enhancementBrief ? `【本次增强目标】
${options.enhancementBrief}

` : ''}要求：
1. 优先增强长篇承载力和网文追读动力
2. 把前${STARTUP_CHAPTER_COUNT}章设计成明确可执行的启动包，按 5 章一块给满 ${Math.ceil(STARTUP_CHAPTER_COUNT / 5)} 块
3. ${scale.suggestedVolumeCount}卷规划要彼此递进，不能重复，卷数须与建议卷数一致
4. 尽量具体，不要空泛设定
5. 输出必须严格遵守指定结构
6. 章节规模必须与目标字数区间匹配，前${STARTUP_CHAPTER_COUNT}章只能完成“开局承诺 + 第一轮冲突闭环 + 更大主线入口”，不能提前耗尽整本书的核心悬念与升级空间
7. 如果提供了“本次增强目标”，必须优先落实这些增强项，重点补强地图扩张线、势力博弈线、人物关系变量、长期悬念中的缺口，但不能偏离当前方向核心卖点
8. 默认按长篇商业网文规格补足角色和伏笔密度：关键角色至少覆盖"常驻核心 4 + 中前期 2 + 中后期 2 + 势力代表 2"共 10 个槽位，伏笔至少 10 条（短 3 + 中 3 + 长 2 + 终局 2），分布在前期、中期、后期多个阶段，不得只集中在开篇或结尾
9. 角色分布不能只围绕主角单点展开，至少要形成 3 组以上非主角之间的关系链或利益冲突链
10. 伏笔不能全是同类谜团，至少要同时存在“主线大伏笔 + 人物关系伏笔 + 世界/规则伏笔 + 卷级事件伏笔”四层结构
11. 输出时优先保证“角色层级完整”和“伏笔层级完整”，数量不足时宁可补足新的独立角色与独立伏笔，也不要用泛泛概括替代`,
  };
}
