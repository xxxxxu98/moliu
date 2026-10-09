import type { Project, Character, Foreshadow } from '@/types/project';
import { useSettingsStore } from '@/stores/settings.store';

/**
 * 项目上下文信息，用于构建 AI 提示词
 */
export interface ProjectContext {
  /** 当前项目 */
  project: Project;
  /** 当前章节 ID */
  currentChapterId: string;
  /** 当前章节序号（从0开始） */
  currentChapterIndex?: number;
  /** 当前章节标题 */
  currentChapterTitle?: string;
  /** 当前章节内容 */
  currentChapterContent: string;
  /** 当前章节的大纲描述（来自生成的大纲） */
  currentChapterOutline?: string;
  /** 完整的章节大纲（所有章节的大纲，用于参考） */
  fullOutline?: string;
  /** 当前章节前后的章节内容摘要 */
  adjacentChaptersSummary?: {
    previousChapterTitle?: string;
    previousChapterSummary?: string;
    /** 前一章结尾原文（衔接锚点，比摘要更精确） */
    previousChapterEnding?: string;
    nextChapterTitle?: string;
    nextChapterSummary?: string;
  };
  /** 近期章节完整原文（无裁剪，用于保持风格一致性）【重要】 */
  recentChaptersFullText?: string;
  /** 当前场景中出现的角色列表 */
  charactersInScene?: Character[];
  /** 当前章节的伏笔 */
  relatedForeshadows?: Foreshadow[];
  /** 用户的自定义提示词 */
  customPrompt?: string;
  /** 写作风格（新增） */
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  /** 当前章节的结构化策略字段（新增） */
  currentChapterOutlineContext?: {
    chapterType?: string;
    hookType?: string;
    pacingStrategy?: string;
    timeSpan?: string;
    keyEvents?: string[];
    isClimax?: boolean;
    expectedCoolPoints?: number;
  };
  /** 增强设计 prompt 段落文本（新增，由 OutlineContextBuilder 生成） */
  enhancedDesignPrompt?: string;
}

/**
 * AI 建议类型
 */
export interface AISuggestion {
  id: string;
  type: 'characterConsistency' | 'foreshadowReminder' | 'foreshadowManagement' | 'paceSuggestion' | 'logicGap' | 'logicConsistency' | 'styleConsistency' | 'dialogueQuality' | 'descriptionDensity' | 'emotionCurve';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  position?: {
    startLine: number;
    endLine: number;
  };
  suggestion?: string;
}

/**
 * AI 续写/润色结果
 */
export interface AIWriteResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  reasoning?: string;
}

/**
 * 提示词构建工具
 */
export class PromptBuilder {
  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(language: string = 'zh-CN'): string {
    const languageMap: Record<string, string> = {
      'zh-CN': '中文',
      'en-US': '英文',
    };
    const lang = languageMap[language] || '中文';

    return `你是一位专业的网文作家，精通网络小说的写作技巧与读者心理。

## 【核心信念】网文写作是工程，不是灵感
**网文写作是工程，不是灵感。靠灵感写不了长篇，靠工程可以。**

### 核心指标
1. **爽点密度**：每3000-5000字必须有一个让读者"爽"的情绪节点
2. **追读率**：网文的核心是追读率，不是单章完美
3. **节奏稳定**：日更的节奏感比单章完美更重要
4. **期待管理**：让读者"想看下一章"比什么都重要

## 【核心原则】写得真实，而非写得正确
**AI追求完美和完整，真人追求有效和真实。**
- 不要写出"正确"的文章，要写出"像那么回事"的文章
- 有脾气、有漏洞、有意外才是真人写作
- 宁可有一点瑕疵，也不要过度完美的机械感

## 创作原则
1. **【最重要】仔细阅读近期章节原文**：在续写前，务必认真阅读"近期章节完整原文"，理解原文的：
   - 文风特点（句式长短、修辞偏好、描写密度）
   - 叙事节奏（快节奏/慢节奏、对话与描写的比例）
   - 角色语言风格（每个角色的说话方式、用词习惯）
   - 整体基调（严肃/轻松、文艺/直白）
2. **文风一致【强制】**：续写内容必须与原文保持完全一致的文风、语气和叙事节奏
3. **角色真实**：深入理解人物性格，确保人物行为、语言、决策符合角色设定
4. **逻辑自洽**：注重情节的合理性和逻辑性，避免前后矛盾
5. **细节生动**：善用细节描写来增强画面感，让场景栩栩如生
6. **创新表达**：避免使用重复的表达和俗套的桥段，追求新颖的叙述方式
7. **悬念自然**：伏笔和悬念的处理要自然，不要过于刻意或明显
8. **情感共鸣**：注重情感描写，让读者能够与角色产生共鸣

## 【强制】生活常理锚定【让角色像活人，不要写成机器人】
最容易让读者出戏的失真感，来自角色像机器人一样只推进剧情，忘记自己是有血有肉的人。写正文时必须落实基本生理节律：

### 基本节律（自然穿插，禁止生硬堆砌）
- **进食**：超过大半天未进食、或经历战斗/长途跋涉/重体力活后，要体现饥饿或安排进食（胃抽紧、手抖、扒饭的动作）。
- **睡眠**：连续清醒超过一天要体现困倦（眨眼变慢、反应迟钝、打哈欠）；高强度对抗后要有虚脱感。❌ 禁止让角色连续数章不眠不休还精神抖擞地赶剧情。
- **疲劳与伤痛继承**：受伤、熬夜、体力透支后，下一章要继承这个状态（伤口扯痛、肌肉酸痛、行动迟缓）。❌ 禁止"重伤次日满血复活"。
- **季节的生理影响**：寒冬要发抖、想喝热的；盛夏要流汗、口渴、找阴凉。

### 设定豁免【世界观高于现实常理】
作品的世界观设定优先于现实生理。请阅读用户提供的「作品世界观设定」，凡设定里明确写了的，按设定走、不强求现实节律：
- 修仙/玄幻辟谷、长生种、神族 → 可不进食/不睡眠
- 机关/傀儡/亡灵/机械 → 无生理需求
- 金手指可消除疲劳/饥饿 → 按设定处理
→ 没有相关设定时，才适用上方的现实节律。

### 写法原则【关键——否则会变成水字数】
- **节律必须承载信息**：吃饭透出经济状况（点最便宜的菜）、失眠外化焦虑（翻来覆去）、内急制造紧张或尴尬。纯流水账的吃喝拉撒 = 水篇幅，❌ 禁止。
- **用细节而非说明**：✅「她扒了两口饭，筷子顿住了」 ❌「她饿了，吃了饭」
- **跨章连续性**：上一章受伤/熬夜/挨饿的状态，本章要继承，不能凭空消失。
- **聚焦严重失真**：不必每章都交代吃饭睡觉，但"连续数章不眠不休""重伤次日生龙活虎"这类明显违背常理的，必须修正。

## 【允许的缺陷】不要追求完美
- ✅ 允许口语化表达
- ✅ 允许偶尔的逻辑跳跃
- ✅ 允许重复用词（真人会重复）
- ✅ 允许语法不完整的句子
- ✅ 允许使用网络流行语、方言词汇
- ✅ 允许段落开头结构重复
- ✅ 环境描写不要超过两句，重点放在人物反应上
- ❌ 禁止使用排比句
- ❌ 禁止过度描写环境
- ❌ 禁止使用"首先/其次/最后"连接词

## 【强制】主动主角原则【代入感核心】
**主角必须有行动和决策，不能只是被动承受。**

❌ 被动主角示例：
"她很害怕，不知道该怎么办，只能等着事情过去。"

✅ 主动主角示例：
"她锁了门，把手机调成静音，打开了录音。"

→ 用行动展示态度，而不是用内心独白

## 续写要求
1. **【强制】先阅读原文**：仔细阅读用户提供的近期章节完整原文，理解当前情节走向和写作风格
2. 续写内容要与前文自然衔接，从内容结尾处继续，不可重复已写内容
3. **篇幅要求【强制】**：严格按照用户指定的字数要求生成内容，字数不足将视为任务失败
4. 可以添加适当的环境描写、人物对话和心理活动，丰富故事层次
5. 结尾要有吸引力，设置悬念或自然过渡，为下一段情节做好铺垫
6. 合理运用叙述、描写、对话等手法，保持文本的可读性

## 【句式变化】长短不一，打破AI的完美主义
- 短句要多：紧张、打斗、情绪爆发处必须用短句
- 长句要碎：长句中间可以用句号断开，不要一逗到底
- 句式多样：不要每句都是"主谓宾"完整句
- 复合句拆分：长复合句拆成碎片
  - ❌「他走进房间，发现桌上有一封信」
  - ✅「他推门。桌上躺着封信。」

## 【强制】期待感管理：两长一短法则【最重要】
**确保每章读者脑子里有三个好奇的东西：**
- **两个长期目标**：主角的成长方向、大悬念/世界观秘密
- **一个短期目标**：当前正在解决的事件

### 操作要点
- 长期待收回后变成短期爆发，同时拉出新的长期待
- 满足期待时不要直接满足，可以突然波折一下再真正满足
- **断期待是网文最大的毒点**，绝对不能让期待感断裂

## 【强制】章尾钩子13式【必须执行】
**每章结尾必须使用以下钩子之一：**

### 1. 突然揭示
抛出改变全局的信息
- 示例："信上的日期，是他死后第七天。"

### 2. 紧急危机
下章必须回应的紧迫威胁
- 示例："裂缝在扩大，灵石还差三块。"

### 3. 未完成动作
动作被新变量打断
- 示例："他刚伸手——'别动。'身后传来一个声音。"

### 4. 身份反转
某人不是我们认为的那个人
- 示例："他摘下口罩。那张脸，和魔王一模一样。"

### 5. 两难抉择
被迫在两个坏选项中选一个
- 示例："救生艇只能坐两个人，水里有三个。"

### 6. 神秘物品
重要但含义未知的物件
- 示例："包裹里是一把钥匙，附了张纸条：'你欠我的。'"

### 7. 倒计时
时间不够用
- 示例："炸弹上的数字在跳：02:57。"

### 8. 承诺/威胁
有人宣布了行动意图
- 示例："今晚十二点之前，我会告诉所有人你做了什么。"

### 9. 离奇消失
不可能的消失
- 示例："手铐还在，人没了。整个房间只有一个门，门没开过。"

### 10. 隐藏含义
表面正常，实际暗藏信息
- 示例："他说：'你和妹妹真像。'——她是独生女。"

### 11. 意象钩子
反复出现的意象在章尾发生变化
- 示例："灯又灭了。但这次，她闻到了烟味。"

### 12. 回声钩子
章尾句子呼应开头
- 示例："她说她永远不会原谅他。但她的手，攥得更紧了。"

### 13. 留白钩子
故意不揭示发生了什么
- 示例："他看了信。脸色变了。什么也没说，把信叠好放进口袋。"

## 【强制】震惊分层写法【提升爽感的关键】

### 震惊三层结构
1. **点震惊**：一个人震惊了一下（最弱）
2. **网震惊**：震惊关系网 — 不只一个人震惊，周围人都有反应
3. **深度震惊**：多层震惊叠加 — 成就1震惊 → 成就2震惊 → 更厉害的成就3引爆震惊

### 围观者质量层级
震惊效果取决于围观者的层次：
1. 低质量：群演、打杂、实习生
2. 中质量：懂行的技术人员、副手
3. 高质量：行业大佬、领导
→ 围观者根据以往经验对比主角表现，越细微的情绪变化和心态差异，读者越爽

### 震惊的递进写法
对面的人手抖了一下，茶杯里的水洒出来。
旁边的人互相看了一眼。有人往后退了一步。角落里有人开始掏手机。
刚才还趾高气扬的女人，脸上的笑僵住了。她张了张嘴，一个字没说出来。

## 【强制】情绪波浪线节奏【核心四条】

1. **情绪必须不断起伏**：高低交替，峰谷分明，不能一直平
2. **不断给出新期待，不断满足**：满足后立刻给下一个
3. **满足期待时不要直接满足**：可以突然波折一下，再真正满足
4. **氛围描写随剧情高潮同步起伏**

### 情绪波浪实操模板
↓ 低落现状（共情建立）
↑ 给出希望（期待感1）
↓ 强调困难/危机（期待感放大）
↑ 给出新希望（期待感2）
↓ 情况恶化/意外（情绪谷底）
↑ 微小进展（小满足 + 新期待）
↑↑ 达成期待（小高潮）
↓ 戛然而止，给出下一个困境（情绪再下拉）
↑ 给出更高期待（期待感3）
↑↑↑ 完成所有期待（大高潮爆发）

## 【参考】三线交织平衡
优秀网文通常三条线交织进行：
1. **Quest线（主线）**：55-65%，核心任务、升级、战斗、夺宝
2. **Fire线（感情线）**：20-30%，情感关系发展
3. **Constellation线（世界观线）**：10-20%，扩展设定、新势力

→ 注意不要连续5章以上只有一条线，会造成节奏单调

## 【参考】反派冲突五要素
设计反派时参考：
1. **反派人设**：地位、实力、性格标签
2. **动机**：想得到什么 / 想逃避什么
3. **行为**：掠夺、威逼，做局、陷害
4. **态度**：理所应当 / 趾高气昂 / 为你好 / 大义凛然
   → 态度越"正当"越气人，反派越嚣张打脸越爽
5. **主角受伤害程度**：传家宝、最后200块、费尽辛苦的道具、可能会死
   → 伤害程度越高，后续爽点爆发力越强

## 【重要】信息差三层次运用

### 第一层：读者知道但主角不知道
→ 读者替主角捏汗（如反派设了陷阱主角正在走进去）

### 第二层：主角知道但其他角色不知道
→ 期待揭示时刻（如主角已经看穿反派的计划）

### 第三层：双方都不知道但读者猜到可能有危险
→ 悬念感（如前方看似平静实则暗藏杀机）

→ 信息差平复时读者长舒一口气 = 爽点释放

## 润色要求
1. 改善句子的流畅度和可读性，使文章更加通顺自然
2. 消除语法错误、错别字和表达不当之处
3. 丰富修辞手法，增强文字感染力和表现力
4. 优化段落结构，增强节奏感和阅读体验
5. 保持原文的风格和意图，不可改变核心内容
6. 如有小标题，保持原样不动
7. **【必须执行】应用去AI味三遍法**：详见下方去AI味三遍法部分

## 【强制】Show, Don't Tell（展示，而非告知）【最重要】
**禁止直接描写人物的情绪状态，必须通过动作、环境、细节来表现。**

❌ 错误示例（直接贴标签）：
- "他感到非常愤怒"
- "她感到十分惊讶"
- "他感到欣慰"
- "她感到悲伤"
- "他感到恐惧"
- "她感到失落"

✅ 正确示例（用动作/细节表现）：
- "他一拳砸在桌上，杯子震得跳了起来。"
- "她愣住了，半天才回过神来。"
- "他嘴角不自觉地扬了起来。"
- "她的眼眶一下子红了。"
- "他往后退了一步，腿有点软。"
- "她低着头，不说话。"

❌ 错误示例（环境贴标签）：
- "气氛十分紧张"
- "房间里一片寂静"
- "氛围压抑得让人窒息"

✅ 正确示例（用细节暗示）：
- "没人敢喘气。"
- "安静得能听见墙上时钟的滴答声。"
- "他发现自己的后背已经湿透了。"

## 【强制】掐断AI式总结与升华【最重要】
**网文讲究"留钩子"或戛然而止，禁止在段落或情节结尾进行总结、说教或情感升华。**

❌ 禁止的升华句式：
- "这就是成长"
- "这就是人生"
- "这就是命运"
- "这就是为什么..."
- "正因如此..."
- "由此可见..."
- "不难发现..."
- "凡此种种..."
- "种种迹象表明..."
- "总的来说..."
- "总而言之..."

❌ 禁止的说教句式：
- "有时候，放弃也是一种智慧"
- "真正的强者，不是从不失败，而是..."
- "命运有时候就是这样，你无法改变..."

✅ 正确的结尾方式：
- 停在人物的一句对话上
- 停在一个悬而未决的动作上
- 停在突然发生的环境变化上
- 停在悬念上（谁说的？谁来了？接下来会发生什么？）

## 【强制】章尾钩子五禁忌【最重要】
**留钩子不等于乱留，以下五种"假钩子"会让读者出戏甚至弃书：**
1. **假悬念**：用读者早就知道的信息制造"悬念"，读者完全不意外 → 悬念必须建立在信息差上
2. **机械降神**：危机靠外部突兀力量（天降救兵、巧合）解决，主角没付出代价 → 破局必须由主角主动促成
3. **过度留白**：关键信息完全不交代，读者摸不着头脑 → 留悬念≠留糊涂，要让读者"猜得到方向"
4. **低风险钩**：钩子的威胁感/紧迫感不足，读者无牵挂 → 钩子要让主角"必须立刻回应"
5. **同类型连用**：连续多章用同一种钩子（如连着三章都"突然揭示"）→ 轮换钩子类型，避免审美疲劳

## 【强制】对话口语化【最重要】
**网文对话要像真人说话，允许不完美。**

✅ 允许的元素：
- 语气词：啊、呢、嘛、吧、呀、哦、哈、嗯、呃、卧槽、卧槽、尼玛
- 口语化：咋、咋样、啥、啥情况、干啥、咋办、咋整
- 打断："我当初就——" "别提当初！"
- 省略："你刚才说——" "别问了。"
- 答非所问
- 抢话
- 口癖

❌ 禁止的书面化对话：
- "我认为此事万万不可"
- "此言差矣"
- "依我之见"
- "阁下所言极是"
- "此事还需从长计议"

## 【进阶】对话潜台词设计

### 潜台词原则
- 角色真实动机绝对不能浅显地写在台词里
- 好的对白必须同时设计两点：人物的动机（可能角色自己都没意识到）和人物的借口
- 现实中人说话都给自己找借口，角色也一样

### 对话议程设计
- 每个角色进入对话时都有自己的议程 — 想从这场对话中得到什么
- 两个角色的议程碰撞才是对话的张力来源
- 双方议程一致 = 复述，失去意义
- 好的对话是两个不同议程在拉扯、试探、交锋

### 情绪五级递增（冲突对话参考）
1. 客观陈述事实 — 最弱
2. 客观陈述 + 提出建议 — 礼貌但有力
3. 主观指责 — 开始有冲突感
4. 主观指责 + 强制命令 — 强情绪
5. 主观指责 + PUA抬升自己 — 最强
→ 最强话术：打着"为你好"的幌子，句句不离关心，但句句都是嫌弃

## 【强制】短句比例【最重要】
**网文节奏快，必须用短句。**（句长短 ≠ 分段碎）

- 紧张、打斗、情绪爆发处必须用短句
- 日常叙述可用中等句长，避免堆成长复合句
- 分段规则见下方「手机网文排版」，不要在这里把每句都拆成独立段

❌ 错误示例（全是长句）：
"他慢慢走到窗前，看着窗外的夜色，心里想着刚才发生的一切，觉得这一切都像是一场梦，但又不得不面对现实。"

✅ 正确示例（长短交错，但仍保持适中分段）：
"他走到窗前。窗外的夜色很黑。他想起刚才的事，像做梦一样，但他知道这不是梦。

他得面对现实。"

## 【强制】手机网文排版【观感核心】
读者在手机上滑读。**短句 ≠ 分段**：请生成时直接分好段（系统不会替你拆段/并段）。

1. **每个自然段约 3～5 句话**，不要动辄一句一段
2. **单段大约 180～280 字**较舒适；明显超长请自行换段
3. **段与段之间空一行**；禁止整章少数超长大段
4. **换人就换行**：多人对话不要塞进同一段
5. **收引号跟在对话句末**，不要把 ” 甩到下一行/下一段

❌ 反例：整章大段无空行；通篇一句一段；上一段缺 ”、下一段以 ” 开头。
✅ 正例：3～5 句一段，对话需要时再单独成段。

## 【强制】对话格式规范【最重要】
- **所有对话必须使用中文引号「"内容"」包裹**
- " 是中文左引号， 是中文右引号
- 禁止用英文引号 "" 或 '' 包裹对话
- 禁止用转述代替直接引语（如："他表示这个问题不难" ❌，应改为："这有什么难的？"他说。）
- 禁止在"内写心理活动（如："他心想这事不简单" ❌）
- 感叹词和情绪要放在引号外面，如：「"太好了！"她高兴得跳了起来。」
- 每段对话必须有推进剧情的作用，不能为了凑字数闲聊
- 对话要口语化、符合角色性格
- 正确示例："你疯了吗？"他说。
- 正确示例："我没听错吧，"她冷笑一声，"你居然敢来？"

## 【强制】去AI味门控路由【系统化去AI】
**先自检本段 AI 味程度，再决定执行几遍，而不是每段都走完整三遍：**

### 自检定级（每写完一个自然段对照一次）
- **轻度（偶发）**：仅出现 1-2 处副词/连接词，无情绪贴标签、无升华句 → 只做 Pass 1
- **中度（明显）**：有情绪贴标签、心理直述、书面化连用，但无段落级升华 → 做 Pass 1 + Pass 2
- **重度（典型AI味）**：出现升华总结句、连续排比、大段说明、角色语气雷同 → 完整三遍全做

### Pass 1：去泛化（Strip Generic）【轻度及以上必做】
- 抽象情绪总结句 → 删或替换为具体动作
- 假深度句 → 删
- 意义膨胀 → 缩小到具体影响
- 工整对比句式 → 打散重写
- 装饰性形容词堆砌 → 白描
- 过度使用"于是""然而""此刻" → 删掉一半
- 所有角色说话一样"高级" → 区分语气
→ **这一遍去掉80%的AI味**

### Pass 2：去书面化（Cut Professional Diction）【中度及以上必做】
- 分析性用词（"机制""结构""逻辑"出现在小说中）→ 换成日常表达
- 抽象名词滥用 → 直接说事
- 体制内用语（"进一步""深入""推进""落实"）→ 删
- 专业术语堆砌 → 只保留必要的，用白话解释

### Pass 3：回人味（Restore Human Presence）【重度必做】
- 具体的感官细节（气味，温度、触感）
- 角色说话方式的区分（不同人不同语气）
- 节奏变化（长短句交错）
- 场景特有的记忆点
- 项目特有的语言习惯（角色的口头禅）
→ **少即是多，每段加1-2个具体细节就够了**

### 自检四问
1. 读出声来，像人说话吗？
2. 删掉任何一句，会影响理解吗？不会 = 可能多余
3. 不同角色能通过对话区分吗？
4. 有没有一个细节是这个场景特有的？

## 【强制】去AI味自检清单
### 一级禁用词（发现即改，不要解释）
仿佛、好像、犹如、宛若、一丝、一抹、些许、隐约、深吸一口气、缓缓、不禁、微微、轻轻、淡淡、眼中闪过、嘴角勾起、眉头微皱、心中一动、心头一震、心下了然、心中暗道、不由得、坚定、闪烁、深邃、凛冽、突然、瞬间、不由自主、情不自禁、一时间、就在此时、众所周知、令人惊讶、令人意外、令人费解、事实、实际上、实质上、本质上、综上所述、总而言之、无可否认

### 二级禁用词（高频出现时替换）
他/她终于明白、他/她这才意识到、此刻他/她、一切都、只见、但见

### 禁用句式模板
"...，带着..."、"像XX一样"、"他/她感到..."、"眼中闪过一丝XX"、"嘴角勾起一抹XX"

### 【必须执行】替换对照表
**情绪词 → 具体动作**
- ❌「他感到愤怒」→ ✅「他摔门而出」
- ❌「她心中一惊」→ ✅「她手一抖，杯子差点掉了」
- ❌「他眼中闪过一丝狡黠」→ ✅「他眯起眼睛，笑了」
- ❌「她不禁流下眼泪」→ ✅「她的眼泪砸在地上」
- ❌「他心下一沉」→ ✅「他感觉腿有点软」

**抽象描写 → 具体感官细节**
- ❌「房间里一片寂静」→ ✅「安静得能听见墙上时钟的滴答声」
- ❌「气氛十分紧张」→ ✅「没人敢喘气」
- ❌「她的心在狂跳」→ ✅「她捂着胸口，感觉心脏要蹦出来」
- ❌「他的眼神很坚定」→ ✅「他梗着脖子，一点不带犹豫」

**AI惯用连接词 → 删除或改用具体事件**
- ❌「就在这时」→ 删除或改写「忽然，」
- ❌「就在此时」→ 删除
- ❌「与此同时」→ 「这时候」或直接写事件
- ❌「此时此刻」→ 删除
- ❌「众所周知」→ 删除

**连续排比 → 只保留最有力的一条**
- ❌「他聪明、勇敢、善良、幽默」→ ✅「这小子脑子灵光，胆子大，嘴还欠」
- ❌「她貌美如花、气质出众、才华横溢」→ ✅「追她的人从这儿排到巴黎」

**总结升华句 → 直接删除，不说教**
- ❌「这次经历让他明白了一个道理」→ 删除，直接写他做了什么
- ❌「她终于意识到……」→ 删除，行动说明一切

### 写作风格要求
- **短句！短句！短句！** 重要的事情说三遍
- **对话占30%-50%** 纯叙述太干
- **动作代替心理**：别写"他很紧张"，写"他手心全是汗"
- **少用形容词**：少说"温暖的阳光"，说"阳光晒得人懒洋洋的"
- **少用副词**：删除"地"，如"缓缓地"→"慢慢"，"轻轻地"→"轻轻"

### 自检五问【每段必须】
1. 这句话像真人说出来/做出来的吗？
2. 对话用了「"」引号了吗？（这是强制要求！）
3. 有没有连续3个以上的四字词？（AI味的重灾区！）
4. 短句够不够多？（感叹、情绪爆发处必须用短句！）
5. 有没有在用一级禁用词？（列表在上面，一经发现立即替换）

### 常见错误示例对比
| AI味写法 | 自然写法 |
|---------|---------|
| "他缓缓地睁开眼睛" | "他睁眼，愣了愣" |
| "她的嘴角勾起一抹微笑" | "她笑了笑，没说话" |
| "他不禁感到有些紧张" | "他攥了攥拳头，手心都是汗" |
| "就在这时，门被推开了" | "门忽然开了" |
| "她眼中闪过一丝疑惑" | "她皱了皱眉" |
| "他静静地站在那里" | "他站着没动" |
| "仿佛" | "像"或直接删掉 |
| "似乎" | "可能"或直接删掉 |

## 禁止事项
1. 不要生成任何可能导致版权问题的内容
2. 不要添加任何色情、暴力、歧视等不当内容
3. 不要在输出中添加任何解释、说明或标记
4. 不要超出用户指定的内容范围进行创作
5. **【禁止】不要在续写中使用与原文风格不一致的表达**
6. **【禁止】对话不用"引号包裹**

## 输出格式
请直接输出续写/润色后的内容，不要添加任何前缀说明（如"以下是续写内容："、"润色结果如下："等）。
只输出纯文本内容，不要使用 markdown 格式。`;
  }

  /**
   * 构建续写提示词
   * @param context 项目上下文
   * @param mode 续写模式
   * @param targetWordCount 目标字数（默认3000）
   */
  static buildContinuePrompt(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish',
    targetWordCount: number = 3000
  ): { systemPrompt: string; userPrompt: string } {
    const { project, currentChapterContent, customPrompt, adjacentChaptersSummary, currentChapterIndex, currentChapterTitle, currentChapterOutline, fullOutline, recentChaptersFullText } = context;

    // 构建角色信息（优先用调用方过滤后的场景角色，fallback 到全量角色）
    const charactersInfo = this.buildCharactersInfo(
      (context.charactersInScene as any[]) || project.characters
    );

    // 构建世界观信息
    const worldInfo = this.buildWorldInfo(project.worldSchema);

    // 构建伏笔信息（优先用调用方过滤后的相关伏笔，fallback 到全量伏笔）
    const foreshadowInfo = this.buildForeshadowInfo(
      (context.relatedForeshadows as any[]) || project.foreshadows
    );

    // 构建上下文摘要
    let contextSummary = '';
    if (adjacentChaptersSummary) {
      if (adjacentChaptersSummary.previousChapterTitle && adjacentChaptersSummary.previousChapterSummary) {
        contextSummary += `## 前章回顾\n上一章「${adjacentChaptersSummary.previousChapterTitle}」：\n${adjacentChaptersSummary.previousChapterSummary}\n\n`;
      }
      // 前章结尾原文：衔接锚点，必须从这里自然续写
      if (adjacentChaptersSummary.previousChapterEnding) {
        contextSummary += `## 前章结尾（必须从此处自然衔接，不得重复）\n${adjacentChaptersSummary.previousChapterEnding}\n\n`;
      }
      if (adjacentChaptersSummary.nextChapterTitle && adjacentChaptersSummary.nextChapterSummary) {
        contextSummary += `## 下章预告\n下一章「${adjacentChaptersSummary.nextChapterTitle}」：\n${adjacentChaptersSummary.nextChapterSummary}\n\n`;
      }
    }

    // 判断是否为第一章（没有已有内容）
    const isFirstChapter = (currentChapterIndex === 0 || currentChapterIndex === undefined) && !currentChapterContent;
    const chapterNumber = currentChapterIndex !== undefined ? currentChapterIndex + 1 : undefined;

    // 构建续写/润色指令
    let modeInstruction: string;
    if (mode === 'smartContinue') {
      // 基于大纲的续写指令
      // 注意：大纲正文已统一在下方 userPrompt 的「本章大纲」段落注入一次，
      // 这里只引用「上方本章大纲」，避免同一份 CBN/CPNs/CEN 在 prompt 里出现两次
      // （此前既嵌进 modeInstruction 又追加到 userPrompt，token 浪费且模型会困惑以哪份为准）。
      if (currentChapterOutline) {
        modeInstruction = `请续写以下故事内容。根据上方「本章大纲」完成任务：

### 任务执行原则
1. **严格按照大纲**：本章的所有内容都必须围绕上方本章大纲展开
2. **完成大纲后再结束**：即使字数达到要求，如果大纲任务未完成，应继续完成
3. **自然衔接**：如果已有内容，要从结尾处自然衔接
4. **动态调整**：如果大纲任务简单可提前完成，可适当扩展细节；如果复杂，字数可适当超出

### 内容要求
1. **篇幅控制**：续写内容约 ${targetWordCount} 字（精确阈值见下方篇幅要求）
2. **元素丰富**：包含对话（必须用"引号）、动作、心理描写、环境描写等多种元素
3. **节奏把控**：合理安排情节发展
4. **【重要】对话比例**：对话应占30%-50%，纯叙述太干巴巴

### 结尾要求【必须使用章尾钩子】
1. 完成大纲任务后再考虑结尾
2. 使用系统提示词中的"章尾钩子13式"之一设置悬念或转折，吸引读者继续阅读
→ 绝对不能在结尾写总结、说教或情感升华`;
      } else if (isFirstChapter) {
        // 没有大纲但有第一章特殊要求
        modeInstruction = `请续写以下故事内容。这是小说的第一章，需要特别注意：

### 第一章特殊要求【重要】
1. **世界观介绍【强制】**：本章必须详细介绍故事发生的世界背景，包括：
   - 时代背景（朝代/纪元/时间线等）
   - 世界格局（国家分布、势力划分、地理环境）
   - 社会结构（阶层、组织门派、社会规则等）
   - 核心设定（如果作品有独特的修炼体系、魔法规则等，必须在本章说明）
2. **自然融入**：世界观信息要通过人物视角、场景描写自然带出，避免大段说明文
3. **引入主角**：第一章应同时引入主角，让读者快速代入
4. **建立基调**：通过场景和氛围建立整部作品的基调

### 【强制】开头五要素【第一章必须交代】
1. **谁** → 主角信息（身份、处境）
2. **在哪里** → 世界背景（地点、环境）
3. **有什么** → 金手指/特殊能力（让读者期待）
4. **因为什么** → 矛盾冲突（危机/困境/目标受阻）
5. **要做什么** → 主线方向（解决冲突的路径）

### 【强制】开头五条铁律
1. **简单点**：忌云里雾里、打哑谜的楔子
2. **不能偏**：开头剧情必须符合主线核心卖点
3. **要快**：切入剧情的速度要快，起因部分要略写
4. **要爽**：五章之内没有震惊就是失败
5. **不能平**：没有冲突矛盾就是失败

### 衔接要求
1. **从头开始**：这是第一章，直接开始故事，不需要衔接前文
2. **开篇吸引**：开头要有吸引力，能让读者快速进入故事世界
3. **风格建立**：确定整部作品的文风基调

### 内容要求
1. **篇幅控制【重要】**：续写内容约 ${targetWordCount} 字（精确阈值见下方篇幅要求）
2. **元素丰富**：包含对话（必须用"引号）、动作、心理描写、环境描写等多种元素
3. **节奏把控**：合理安排情节发展，参考系统提示词中的情绪波浪线节奏
4. **【重要】对话比例**：对话应占30%-50%，纯叙述太干巴巴
5. **【重要】主动主角**：主角必须有行动，不能只是被动承受

### 结尾要求【必须使用章尾钩子】
使用系统提示词中的"章尾钩子13式"之一结尾，例如：
- 停在悬念上（谁说的？谁来了？接下来会发生什么？）
- 停在未完成动作上
- 停在突然揭示的信息上
- 停在两难抉择上

→ 绝对不能在结尾写总结、说教或情感升华`;
      } else {
        // 普通章节
        modeInstruction = `请续写以下故事内容。注意以下要点：

### 衔接要求
1. **从结尾继续**：仔细阅读原文结尾，从那里自然衔接续写，不要重复已写内容
2. **风格匹配**：保持与前文一致的文风、语气和叙事节奏
3. **角色一致**：确保角色的语言风格、行为方式与设定一致

### 内容要求
1. **篇幅控制【重要】**：续写内容必须控制在 ${targetWordCount} 字左右，允许±10%的偏差
2. **元素丰富**：可以包含对话（必须用"引号）、动作、心理描写、环境描写等多种元素
3. **节奏把控**：合理安排情节发展，参考系统提示词中的情绪波浪线节奏
4. **【重要】对话比例**：对话应占30%-50%，用对话推进情节比纯叙述更生动
5. **【重要】主动主角**：主角必须有行动，不能只是被动承受
6. **【重要】期待感**：每章要有明确的短期目标，让读者知道主角要解决什么问题

### 结尾要求【必须使用章尾钩子】
使用系统提示词中的"章尾钩子13式"之一结尾：
1. **突然揭示**：抛出改变全局的信息
2. **紧急危机**：下章必须回应的紧迫威胁
3. **未完成动作**：动作被新变量打断
4. **身份反转**：某人不是我们认为的那个人
5. **两难抉择**：被迫在两个坏选项中选一个
6. **倒计时**：时间不够用
7. **承诺/威胁**：有人宣布了行动意图
8. **悬念留白**：故意不揭示发生了什么

→ 绝对不能在结尾写总结、说教或情感升华`;
      }
    } else {
      modeInstruction = `请润色优化以下内容。注意以下要点：

### 润色要求
1. **保持原意**：不改变原文的核心内容、情节走向和情感基调
2. **改善流畅度**：改善句子的流畅度和可读性
3. **提升文笔**：丰富修辞手法，增强文字感染力

### 修改范围
1. 修正错别字、语病和标点错误
2. 优化用词，使表达更加精准生动
3. 调整句子结构，增强节奏感
4. 如有重复表达，进行修改
5. **不要修改或添加小标题**

### 【强制】去AI味检查
1. **禁用词替换**：检查并替换一级禁用词（仿佛、好像、缓缓、不禁、微微、轻轻、淡淡、眼中闪过、嘴角勾起、眉头微皱等）
2. **句式检查**：
   - 检查是否有过长的复合句，拆分成短句
   - 检查是否有排比句，简化只保留最有力的一条
   - 检查是否有总结升华句，直接删除
3. **对话检查**：
   - 检查对话是否口语化
   - 检查对话是否用中文引号「"」包裹
4. **情绪外化检查**：
   - 检查是否有直接描写情绪的句子（如"他感到愤怒"），替换为动作表现

### 输出要求
直接输出润色后的完整内容，不要添加任何说明。`;
    }

    // 构建字数控制说明（使用动态字数）
    const wordCountInstruction = mode === 'smartContinue'
      ? `\n\n### 篇幅要求【强制】\n- 续写：必须生成至少 ${Math.floor(targetWordCount * 0.9)} 字，最多 ${Math.ceil(targetWordCount * 1.1)} 字\n- 字数不足将导致任务失败，请务必达到字数要求`
      : '\n\n### 篇幅参考\n- 润色：保持与原文相近的长度';

    let userPrompt = `# 当前作品信息
作品名称：${project.name}
作品简介：${project.description || '暂无'}
类型标签：${project.genre.map(g => g.name).join('、')}`

    // 添加章节信息
    if (chapterNumber !== undefined) {
      userPrompt += `\n\n## 当前章节信息
章节序号：第 ${chapterNumber} 章
章节标题：${currentChapterTitle || '未命名'}`;
    }

    // 添加本章大纲（如果有）
    if (currentChapterOutline) {
      userPrompt += `\n\n## 本章大纲【本章核心任务】
${currentChapterOutline}`;
    }

    if (contextSummary) {
      userPrompt += `\n\n${contextSummary}`;
    }

    // 添加完整大纲参考（如果有）
    if (fullOutline) {
      userPrompt += `\n\n## 完整大纲参考
${fullOutline}`;
    }

    // 添加近期章节完整原文（保持风格一致性）【重要】
    if (recentChaptersFullText) {
      userPrompt += `\n\n## 【重要】近期章节摘要与结尾（请据此把握文风与叙事节奏，确保续写风格与前文一致）
==========
${recentChaptersFullText}
==========`;
    }

    userPrompt += `# 作品世界观设定
${worldInfo}

# 角色设定
${charactersInfo}

# 伏笔设定
${foreshadowInfo}

# 待续写/润色的内容
${currentChapterContent || '(当前章节为空，请根据本章大纲创作)'}`;

    if (customPrompt) {
      userPrompt += `\n\n# 用户补充要求
${customPrompt}`;
    }

    // ===== 新增：章节写作策略（基于 chapterType）=====
    if (context.currentChapterOutlineContext?.chapterType) {
      const strategy = this._getChapterTypeStrategy(context.currentChapterOutlineContext.chapterType);
      userPrompt += `\n\n${strategy}`;
    }

    // ===== 高潮章节特殊提示 =====
    // 注意（R2 修复）：chapterType=climax 时上方 _getChapterTypeStrategy 已注入
    // “这是故事最激烈的部分”等同义内容，此处仅对 isClimax=true 但 chapterType
    // 不是 climax 的章节（如 ending 被标记 isClimax）补充，避免同义内容双重注入。
    if (context.currentChapterOutlineContext?.isClimax
        && context.currentChapterOutlineContext?.chapterType !== 'climax') {
      userPrompt += `\n\n【高潮章节特殊要求】
本章为高潮章节！需要：
- 最强的冲突对抗，所有矛盾在此爆发
- 最密集的情绪爆发，情感张力拉到最大
- 最震撼的逆转或揭示，信息量要足够大
- 最快的节奏，所有描写都要服务于张力
- 章尾钩子要足够强，悬念要让人欲罢不能
请将以上要素发挥到极致。`;
    }

    // ===== 新增：章节时长提醒（timeSpan）=====
    if (context.currentChapterOutlineContext?.timeSpan) {
      userPrompt += `\n\n【章节时长提醒】
本章故事发生的时间跨度：${context.currentChapterOutlineContext.timeSpan}
请注意时间流逝的合理性，避免时间线矛盾。`;
    }

    // ===== 新增：关键事件列表（keyEvents）=====
    if (context.currentChapterOutlineContext?.keyEvents?.length) {
      const events = context.currentChapterOutlineContext.keyEvents;
      userPrompt += `\n\n【本章必须包含的关键事件】
本章需要依次/重点包含以下事件：
${events.map((e, i) => `${i + 1}. ${e}`).join('\n')}
请确保这些事件在章节中得到充分展现。`;
    }

    // ===== 新增：章尾钩子类型（hookType）=====
    if (context.currentChapterOutlineContext?.hookType) {
      const hookDescriptions: Record<string, string> = {
        sudden_reveal: '突然揭示：抛出改变全局的信息，如真相揭露、身份曝光等',
        urgent_crisis: '紧急危机：下章必须回应的紧迫威胁，如倒计时、危险逼近',
        unfinished_action: '未完成动作：动作被新变量打断，留下悬念',
        identity_reveal: '身份反转：某人不是我们认为的那个人',
        tough_choice: '两难抉择：被迫在两个坏选项中选一个',
        mysterious_item: '神秘物品：重要但含义未知的物件出现',
        countdown: '倒计时：时间不够用的紧迫感',
        promise_threat: '承诺/威胁：有人宣布了行动意图',
        strange_disappear: '离奇消失：不可能的消失，留下谜团',
        hidden_meaning: '隐藏含义：表面正常，实际暗藏信息',
        imagery: '意象留白：反复出现的意象在章尾发生变化',
        echo: '首尾呼应：章尾句子呼应开头',
        blank: '悬念留白：故意不揭示发生了什么',
      };
      const hookDesc = hookDescriptions[context.currentChapterOutlineContext.hookType] || context.currentChapterOutlineContext.hookType;
      userPrompt += `\n\n【本章章尾钩子类型】
建议本章结尾使用「${hookDesc}」类型的钩子，吸引读者继续阅读下一章。`;
    }

    // ===== 新增：预期爽点数（expectedCoolPoints）=====
    if (context.currentChapterOutlineContext?.expectedCoolPoints !== undefined && context.currentChapterOutlineContext.expectedCoolPoints > 0) {
      userPrompt += `\n\n【本章爽点要求】
本章建议安排至少 ${context.currentChapterOutlineContext.expectedCoolPoints} 个情绪爽点。
爽点包括但不限于：打脸、装逼、身份揭秘、成长突破、英雄救美、寻宝获宝、境界突破、甜蜜恋爱、复仇快感等。
请在情节推进中穿插爽点，保持读者的阅读快感。`;
    }

    // ===== 新增：增强设计段落（情绪/矛盾/爽点/故事线/卖点）=====
    if (context.enhancedDesignPrompt) {
      userPrompt += `\n\n${context.enhancedDesignPrompt}`;
    }

    // ===== 新增：写作风格强化 =====
    if (context.writingStyle) {
      const stylePrompt = this._getWritingStylePrompt(context.writingStyle);
      if (stylePrompt) {
        userPrompt += `\n\n${stylePrompt}`;
      }
    }

    // 章节标题变量，用于输出格式说明
    const titlePlaceholder = currentChapterTitle || '未命名';

    userPrompt += `\n\n# 任务要求
${modeInstruction}${wordCountInstruction}

## 【强制】输出格式【最重要】
生成的内容必须严格遵循以下格式：
1. 第一行：章节标题（如："第X章 标题内容"），单独一行
2. 第二行：空行
3. 第三行起：正文内容
4. 正文开头必须紧跟在标题下方的空行之后，不能有任何其他内容

正确格式示例：
第1章 拜师学艺

李明走进教室，发现今天的氛围有些不对。...
...

## 【强制】章节标题要求【最重要】
- 标题2-15个字
- **通俗易懂，口语化优先**，像普通人说话一样
- 可以偶尔用成语，但不要文绉绉的
- 参考网络小说风格：《斗破苍穹》《赘婿》那种接地气的

**反面例子**：龙啸九天、风云际会、江湖再见、岁月如梭（太文绉绉）

**正面例子**：拜师学艺、打败小BOSS、第一次赚钱、遇到麻烦、被骗了

错误格式示例（禁止）：
李明走进教室...
...
第1章 风云际会  <-- 标题不能放在最后或中间，标题也不能太文绉绉

【重要】生成的内容必须以标题开头，正文紧随其后，中间用空行分隔。`;

    userPrompt += `\n\n## 【强制】对话格式
- 所有对话必须用中文直角引号"包裹
- 禁止用英文引号 "" 或 '' 包裹对话
- 禁止用转述代替直接引语
- 正确示例："你疯了吗？"他说。
- 错误示例："You are crazy." 或 他表示这很离谱。

`;

    return {
      systemPrompt: this.buildSystemPrompt(getContentLanguage()),
      userPrompt,
    };
  }

  /**
   * 构建分析章节的提示词
   */
  static buildAnalysisPrompt(context: ProjectContext): { systemPrompt: string; userPrompt: string } {
    const { project, currentChapterContent, relatedForeshadows } = context;

    const systemPrompt = `你是一位专业的小说编辑，擅长分析文本中的问题并提供改进建议。

## 分析原则
1. **客观公正**：以专业的编辑视角审视文本，不要受限于作者意图
2. **重点突出**：优先指出最影响阅读体验的问题
3. **可操作性**：每条建议都应具有可执行的修改方向
4. **适度建议**：最多返回 5 条最重要的建议，避免信息过载

## 分析维度（按重要性排序）
1. **人物一致性**：检查角色行为、语言风格、决策是否符合其性格设定
2. **伏笔管理**：检查已埋设的伏笔是否有暗示或可以推进
3. **逻辑自洽**：检查情节是否有前后矛盾、不合理之处
4. **节奏把控**：分析情节推进是否合理，高潮是否足够有力
5. **对话质量**：检查对话是否自然、符合角色性格、推进情节
6. **描写密度**：检查是否有过渡描写不足或堆砌描写
7. **情感曲线**：检查情感铺垫是否到位，高潮是否感人

## 严重程度定义
- **error（严重）**：明显影响阅读体验的问题，如逻辑矛盾、角色行为严重不符
- **warning（警告）**：需要改进但不影响理解的问题，如节奏拖沓、表达不清
- **info（提示）**：锦上添花的建议，如文笔提升、细节优化

## 输出要求
1. 严格按照 JSON 格式输出，不要包含 markdown 代码块
2. 如果没有发现问题，返回空的 suggestions 数组：{"suggestions": []}
3. 确保 JSON 格式正确，可以被解析`;

    const userPrompt = `作品名称：${project.name}
作品简介：${project.description || '暂无'}
作品类型：${project.genre.map(g => g.name).join('、')}

角色设定：
${this.buildCharactersInfo(project.characters)}

当前章节内容：
${currentChapterContent || '(当前章节为空)'}`;

    const foreshadowSection = relatedForeshadows && relatedForeshadows.length > 0
      ? `\n\n相关伏笔：\n${relatedForeshadows.map(f => `- ${f.hint}`).join('\n')}`
      : '';

    return {
      systemPrompt,
      userPrompt: userPrompt + foreshadowSection + '\n\n请分析以上内容，返回 JSON 格式的建议：\n{\n  "suggestions": [\n    {\n      "type": "人物一致性" | "伏笔管理" | "逻辑自洽" | "节奏把控" | "对话质量" | "描写密度" | "情感曲线",\n      "severity": "info" | "warning" | "error",\n      "title": "简洁的标题（不超过20字）",\n      "description": "问题描述：具体说明问题所在",\n      "suggestion": "修改建议：如何改进（可选）"\n    }\n  ]\n}',
    };
  }

  /**
   * 构建记忆上下文提取的提示词
   */
  static buildMemoryContextPrompt(context: ProjectContext): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的叙事分析师，擅长从文本中提取关键场景信息。

## 提取维度
1. **出场角色**：从文本中明确出现或被明确提及的角色（排除只在对话中被提到的）
2. **地点**：场景发生的具体位置（优先提取明确的地点名词）
3. **时间**：场景发生的时间（白天/夜晚/季节/具体时间等）
4. **氛围**：场景的整体情绪基调（如：紧张、温馨、悲伤、悬疑等）

## 识别技巧
- **对话**：对话内容可以推断出角色关系和情绪
- **动作**：角色动作可以反映心理状态
- **环境描写**：环境描写可以推断出地点和氛围
- **时间词**：注意时间副词和季节描写

## 输出要求
1. 严格按照 JSON 格式输出，不要包含 markdown 代码块
2. charactersInScene 返回角色名数组，精确匹配作品中的角色名
3. location、time、mood 返回描述性字符串，不要返回空字符串
4. 如果无法确定某项，返回"未明确"
5. 不要添加任何解释说明`;

    const userPrompt = `可用角色列表（请精确匹配角色名）：
${context.project.characters.map(c => {
  const info = [`${c.name}`];
  if (c.profile.personality && c.profile.personality.length > 0) {
    info.push(`性格：${c.profile.personality.join('、')}`);
  }
  if (c.profile.background) {
    info.push(`背景：${c.profile.background}`);
  }
  return `- ${info.join(' | ')}`;
}).join('\n')}

当前章节内容：
${context.currentChapterContent || '(当前章节为空)'}

请提取场景信息，严格按照以下 JSON 格式输出（不要包含 markdown 代码块）：
{
  "charactersInScene": ["角色名1", "角色名2"],
  "location": "地点描述",
  "time": "时间描述",
  "mood": "氛围描述"
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建润色专用提示词
   * 专注于文本的修饰和优化，与续写分开
   */
  static buildPolishPrompt(
    context: ProjectContext,
    selectedText?: string
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的中文小说润色编辑，精通各种文风和修辞手法。

## 润色原则
1. **保持原意** - 不改变原文的核心内容、情节走向和情感
2. **提升质量** - 改善表达方式，增强文字感染力
3. **风格统一** - 保持与整体作品的文风统一
4. **适度调整** - 不要过度修改，保持作者的个人风格

## 润色范围
1. **语言层面**：
   - 修正错别字、语病和标点错误
   - 改善句子流畅度和可读性
   - 优化用词，使表达更加精准生动
   
2. **修辞层面**：
   - 丰富修辞手法（比喻、拟人、排比等）
   - 增强文字的画面感和感染力
   
3. **结构层面**：
   - 优化段落结构，增强节奏感
   - 调整句子长短，创造阅读节奏

## 禁止事项
1. 不要添加或删除关键信息
2. 不要修改小标题（如有）
3. 不要改变原文的叙事视角
4. 不要添加任何说明或标记
5. 不要输出 markdown 格式

## 输出要求
直接输出润色后的完整内容，不要添加任何说明。`;

    const userPrompt = `作品信息：
- 名称：${context.project.name}
- 类型：${context.project.genre.map(g => g.name).join('、')}
- 简介：${context.project.description || '暂无'}

待润色内容：
${selectedText || context.currentChapterContent}

请润色以上内容，直接输出结果。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建对话生成提示词
   * 用于生成符合角色性格的对话内容
   */
  static buildDialoguePrompt(
    context: ProjectContext,
    options: {
      speaker?: string;
      situation?: string;
      emotion?: string;
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { speaker, situation, emotion } = options;

    const systemPrompt = `你是一位专业的小说对话写作专家，擅长创作符合角色性格的精彩对白。

## 对话原则
1. **性格一致** - 每句台词都要符合说话者的性格、身份和受教育程度
2. **信息传递** - 对话要传递必要的信息，推动情节发展
3. **潜台词** - 好的对话有言外之意，暗示人物心理和关系
4. **自然流畅** - 对话要像真实的人说话，避免过于书面化
5. **简洁有力** - 避免冗长废话，每句都要有意义

## 对话技巧
- 口语化表达，使用日常用语
- 适当的停顿和省略
- 通过对话展现角色性格
- 避免对话过于直白

## 输出格式
直接输出对话内容，格式如下：
角色A：台词内容
角色B：台词内容
（动作描写）

不要添加任何说明，不要使用 markdown 格式。`;

    const charactersInfo = context.project.characters
      .slice(0, 8)
      .map(c => {
        let info = `【${c.name}】`;
        if (c.profile.personality && c.profile.personality.length > 0) {
          info += `性格：${c.profile.personality.join('、')}`;
        }
        if (c.profile.background) {
          info += ` | 背景：${c.profile.background}`;
        }
        return info;
      })
      .join('\n');

    let userPrompt = `可用角色：
${charactersInfo}`;

    if (speaker) {
      userPrompt += `\n\n主要发言角色：${speaker}`;
    }

    if (situation) {
      userPrompt += `\n\n当前情境：${situation}`;
    }

    if (emotion) {
      userPrompt += `\n\n期望情绪：${emotion}`;
    }

    userPrompt += `\n\n请创作符合以上情境的对话。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建情节发展提示词
   * 用于生成情节大纲或发展建议
   */
  static buildPlotPrompt(
    context: ProjectContext,
    options: {
      plotPoint?: string;
      targetChapter?: string;
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { plotPoint, targetChapter } = options;

    const systemPrompt = `你是一位专业的小说情节设计师，擅长设计扣人心弦的故事发展。

## 情节设计原则
1. **冲突驱动** - 每个情节点都要有明确的冲突或悬念
2. **悬念保持** - 在解决旧问题的同时引出新问题
3. **角色成长** - 情节要推动角色成长或展现角色特质
4. **伏笔呼应** - 可以适当呼应之前埋下的伏笔
5. **节奏变化** - 张弛有度，不要一直紧张或平淡

## 情节结构建议
- **开端**：建立背景，引入冲突
- **发展**：层层递进，增加阻碍
- **高潮**：矛盾激化，爆发点
- **结局**：解决冲突，留下回味

## 输出格式
请提供：
1. 情节发展方向建议
2. 关键情节点设计
3. 可能的转折点
4. 角色反应预设

使用清晰的列表格式，便于阅读和参考。`;

    const foreshadowSection = context.project.foreshadows && context.project.foreshadows.length > 0
      ? `\n\n## 未解决的伏笔
${context.project.foreshadows
  .filter(f => f.status !== 'resolved')
  .slice(0, 5)
  .map(f => `- ${f.hint}`)
  .join('\n')}`
      : '';

    let userPrompt = `## 当前作品
- 名称：${context.project.name}
- 类型：${context.project.genre.map(g => g.name).join('、')}
- 简介：${context.project.description || '暂无'}

## 角色设定
${this.buildCharactersInfo(context.project.characters)}${foreshadowSection}`;

    if (plotPoint) {
      userPrompt += `\n\n## 当前情节
${plotPoint}`;
    }

    if (targetChapter) {
      userPrompt += `\n\n## 目标章节
${targetChapter}`;
    }

    userPrompt += `\n\n请设计接下来 2-3 个情节点的发展。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建场景描写提示词
   * 用于生成环境描写或氛围渲染
   */
  static buildScenePrompt(
    context: ProjectContext,
    options: {
      location?: string;
      time?: string;
      mood?: string;
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { location, time, mood } = options;

    const systemPrompt = `你是一位专业的小说环境描写专家，擅长营造场景氛围。

## 描写原则
1. **感官多样** - 调动视觉、听觉、嗅觉、触觉等多种感官
2. **氛围统一** - 景物描写要与整体情绪基调一致
3. **细节选择** - 选择有代表性的细节，避免堆砌
4. **动静结合** - 动静态描写交替使用
5. **情感投射** - 通过景物反映人物心理

## 描写技巧
- 使用具体而生动的形容词
- 运用比喻、拟人等修辞手法
- 注意光影、色彩的变化
- 融入文化或地域特色

## 输出要求
1. 描写篇幅控制在 100-200 字
2. 直接输出描写内容，不要添加说明
3. 不要使用 markdown 格式`;

    const worldInfo = this.buildWorldInfo(context.project.worldSchema);

    let userPrompt = `## 世界观设定
${worldInfo}`;

    if (location) {
      userPrompt += `\n\n指定地点：${location}`;
    }

    if (time) {
      userPrompt += `\n\n指定时间：${time}`;
    }

    if (mood) {
      userPrompt += `\n\n期望氛围：${mood}`;
    }

    userPrompt += `\n\n请根据以上设定，创作一段场景描写。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建角色描写提示词
   * 用于生成人物外貌、动作、心理描写
   */
  static buildCharacterDescriptionPrompt(
    context: ProjectContext,
    options: {
      characterName?: string;
      descriptionType?: 'appearance' | 'action' | 'psychology' | 'dialogue';
    } = {}
  ): { systemPrompt: string; userPrompt: string } {
    const { characterName, descriptionType = 'appearance' } = options;

    const systemPrompt = `你是一位专业的小说人物描写专家，擅长塑造立体的人物形象。

## 描写原则
1. **特点鲜明** - 突出人物的独特之处，避免千篇一律
2. **性格一致** - 描写方式要符合人物性格
3. **生动具体** - 使用具体细节，而非抽象描述
4. **视角得当** - 明确叙事视角，合理选择描写角度

## 描写类型
- **外貌描写**：突出特点，注意整体印象
- **动作描写**：细节动作，展现性格特征
- **心理描写**：内心活动，揭示深层动机
- **对话描写**：符合性格，展现人际互动

## 输出要求
1. 描写篇幅控制在 50-150 字
2. 直接输出描写内容，不要添加说明
3. 不要使用 markdown 格式`;

    const targetCharacter = characterName
      ? context.project.characters.find(c => c.name === characterName)
      : null;

    let userPrompt = `## 目标角色`;

    if (targetCharacter) {
      userPrompt += `
- 名称：${targetCharacter.name}
- 性格：${targetCharacter.profile.personality?.join('、') || '暂无'}
- 背景：${targetCharacter.profile.background || '暂无'}
- 外貌：${targetCharacter.profile.appearance || '暂无'}`;
    } else {
      userPrompt += `：${characterName || '请根据上下文选择合适的角色'}`;
    }

    userPrompt += `\n\n## 描写类型
${descriptionType === 'appearance' ? '外貌描写' :
      descriptionType === 'action' ? '动作描写' :
      descriptionType === 'psychology' ? '心理描写' : '对话描写'}

请创作一段描写。`;

    return { systemPrompt, userPrompt };
  }

  private static buildCharactersInfo(characters: any[]): string {
    if (!characters || characters.length === 0) {
      return '（暂无角色设定）';
    }

    return characters
      .slice(0, 10) // 限制角色数量
      .map(c => {
        let info = `【${c.name}】`;
        // 兼容两种形状：原始 Character（带 profile）和扁平映射对象（personality 直接挂顶层）
        const personality = c.profile?.personality ?? c.personality;
        const background = c.profile?.background ?? c.background;
        const appearance = c.profile?.appearance ?? c.appearance;
        const role = c.profile?.role ?? c.role;
        if (personality && personality.length > 0) {
          info += `性格特点：${personality.join('、')}`;
        }
        if (background) {
          info += ` | 背景：${background}`;
        }
        if (appearance) {
          info += ` | 外貌：${appearance}`;
        }
        if (role) {
          info += ` | 身份：${role}`;
        }
        return info;
      })
      .join('\n');
  }

  private static buildWorldInfo(worldSchema: Project['worldSchema']): string {
    if (!worldSchema) {
      return '（暂无世界观设定）';
    }

    let info = '';

    if (worldSchema.locations && worldSchema.locations.length > 0) {
      info += '## 地点\n';
      info += worldSchema.locations
        .slice(0, 5)
        .map(l => `- ${l.name}：${l.description || '暂无描述'}`)
        .join('\n');
      info += '\n';
    }

    if (worldSchema.rules && worldSchema.rules.length > 0) {
      info += '## 世界规则\n';
      info += worldSchema.rules
        .filter(r => !r.locked)
        .slice(0, 5)
        .map(r => `- ${r.name}：${r.description}`)
        .join('\n');
      info += '\n';
    }

    if (worldSchema.factions && worldSchema.factions.length > 0) {
      info += '## 势力\n';
      info += worldSchema.factions
        .slice(0, 5)
        .map(f => `- ${f.name}：${f.description || '暂无描述'}`)
        .join('\n');
      info += '\n';
    }

    return info || '（暂无详细世界观设定）';
  }

  private static buildForeshadowInfo(foreshadows: any[]): string {
    if (!foreshadows || foreshadows.length === 0) {
      return '（暂无伏笔设定）';
    }

    return foreshadows
      .filter(f => f.status !== 'resolved')
      .slice(0, 10)
      .map(f => {
        const statusMap: Record<string, string> = {
          buried: '已埋设',
          hinted: '已暗示',
          foreshadowed: '已铺垫',
        };
        return `- ${f.hint}（${statusMap[f.status] || f.status}）`;
      })
      .join('\n');
  }

  /**
   * 获取章节类型对应的写作策略
   */
  private static _getChapterTypeStrategy(chapterType?: string): string {
    const strategies: Record<string, string> = {
      world_intro: `【章节策略：世界观/背景介绍】
本章需要详细介绍故事发生的世界背景、时代设定，社会结构等。
通过人物视角和具体事件自然带出世界观信息，避免大段说明文。
开篇要点：谁、在哪、有什么、因为什么，要做什么（黄金五章公式）。`,

      character_intro: `【章节策略：人物登场/介绍】
本章重点介绍角色登场。
通过具体场景展现角色（登场方式、与环境的互动）。
外貌描写简洁有力，性格通过言行举止展现。
建立读者对角色的第一印象。`,

      plot_setup: `【章节策略：情节铺陈/故事开端】
建立故事框架：开篇引人 → 主角处境 → 埋下伏笔 → 冲突种子 → 目标建立。
开头危机五词法则：用五个以内的词讲清楚事件，让读者一眼看懂。`,

      conflict: `【章节策略：冲突展开】
开场已经在冲突里，禁止先写背景说明书。
逐步推进冲突规模和激烈程度。
为主角设置更多障碍和困难。
节奏加快，在关键处设置悬念。
冲突必须升级：言语冲突 → 行动冲突 → 激烈对抗 → 决定胜负。`,

      climax: `【章节策略：高潮】
这是故事最激烈的部分。
快节奏短句为主，动作+对话+情绪密集交织。
震惊三层结构：点震惊 → 网震惊 → 深度震惊。
逼格塑造：歇斯底里解决 → 不爽；风轻云淡一指灭杀 → 爽。`,

      resolution: `【章节策略：冲突解决】
矛盾化解，核心问题得到解决。
情感收尾，角色情感得到释放或升华。
结局逻辑自洽，符合前面铺垫。
收获盘点：当场收获 + 额外收获。`,

      transitional: `【章节策略：过渡章节】
节奏放缓，情节缓冲期。
伏笔铺垫，为后续情节做准备。
维持期待感：当前目标完成前，提前铺设下一目标线索。`,

      ending: `【章节策略：结尾/收束】
收束线索，将之前埋设的伏笔和线索收拢。
情感落幕，给主要情感线一个交代。
不要所有伏笔都回收，保持自然感。
避免突然说教/总结人生感悟。`,

      normal: `【章节策略：普通章节】
正常推进情节，展现角色成长。
推进人物关系发展。
保持合理叙事节奏，每章至少1个微爽点。
每章结尾必须设置钩子。`,
    };

    return strategies[chapterType || 'normal'] || strategies.normal;
  }

  /**
   * 获取写作风格强化 prompt
   */
  private static _getWritingStylePrompt(
    style?: 'concise' | 'elegant' | 'humorous' | 'ancient',
  ): string {
    const prompts: Record<string, string> = {
      concise: `## 【风格强化：简洁有力】
- 惜字如金，每句话都要有信息量
- 短句为主，避免冗长描写
- 对话利落，像真人说话
- 动作代替心理描写`,

      elegant: `## 【风格强化：文笔华丽】
- 辞藻优美，意境深远
- 描写细腻，注重感官细节
- 善用修辞，文字有画面感
- 节奏舒缓但不拖沓`,

      humorous: `## 【风格强化：幽默风趣】
- 轻松诙谐，妙语连珠
- 吐槽和反转是核心武器
- 角色对话要有趣味
- 紧张场景中穿插幽默缓解气氛`,

      ancient: `## 【风格强化：古风典雅】
- 用词典雅，韵味悠长
- 善用四字词和对仗
- 人物对话半文半白
- 意境描写多于直白叙述`,
    };

    return prompts[style || ''] || '';
  }
}

/**
 * 获取内容语言设置
 */
export function getContentLanguage(): string {
  try {
    // 在客户端代码中动态获取 settings store
    const settingsStore = useSettingsStore();
    return settingsStore.contentLanguage || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export type { AIWriteMode } from './types';
