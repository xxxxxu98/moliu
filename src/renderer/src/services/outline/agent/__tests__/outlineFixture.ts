/**
 * 大纲 agent 单测夹具：构造一份能通过 inspectOutlineCompleteness 的最小 Markdown 大纲，
 * 再按需注入特定缺陷（超长钩子 / CPN 超数 / 未登记角色等）验证工具行为。
 * 所有段名与字段名与 expand-direction-prompt 模板一致，保证 parseExpandedOutline 可解析。
 */
import { OUTLINE_COMPLETENESS_POLICY } from '../../validation/outlineCompleteness';

export const FIXTURE_CHARACTER_NAMES = [
  '林川',
  '周仵作',
  '孙捕头',
  '钱县丞',
  '顾师爷',
  '李主簿',
  '王神医',
  '赵掌柜',
  '吴铁匠',
  '郑书吏',
];

export function buildCharacterBlock(name: string, role: string, index: number): string {
  return `#### 角色${index}
- 姓名：${name}
- 角色定位：${role}
- 剧情功能：推动第${index}条支线
- 核心需求：保住自身立场
- 与主角张力：立场分歧
- 最佳登场时机：第${index}章
- 外显目标：完成手头差事
- 隐性需求：得到认可
- 核心创伤：旧案牵连
- 角色秘密：藏有旧卷宗
- 角色转折点：当众表态
- 角色弧线：观望 → 动摇 → 站队
- 角色资源：人脉；卷宗
- 关系变化：${name}与林川由疏到密`;
}

export function buildForeshadowBlock(index: number): string {
  const setup = index;
  const payoff = Math.min(OUTLINE_COMPLETENESS_POLICY.startupChapterCount, index + 20);
  return `#### 短伏笔${index}
- 伏笔内容：第${index}宗旧案卷宗缺了一页
- 伏笔类型：物品
- 重要级别：主线
- 埋设阶段：第一卷
- 埋设章节：第${setup}章
- 回收阶段：第一卷
- 回收章节：第${payoff}章
- 载体角色：林川
- 关联冲突：主角与县丞的权力对抗
- 回收收益：坐实县丞私改卷宗`;
}

export function buildChapterBlock(
  chapterNumber: number,
  overrides: Partial<{ title: string; CBN: string; CPNs: string; CEN: string }> = {}
): string {
  return `### 第${chapterNumber}章
- 标题：${overrides.title ?? `夜审第${chapterNumber}宗旧案`}
- CBN：${overrides.CBN ?? `卷宗第${chapterNumber}页突然少了一角。`}
- CPNs：${overrides.CPNs ?? '主角复验尸格；仵作改口'}
- CEN：${overrides.CEN ?? `新证据把矛头指向第${chapterNumber}号嫌人。`}
- mustCover：完成第${chapterNumber}章复验
- 禁区：不得揭晓幕后主使
- 章尾钩子文案：这一页是谁撕的
- 爽点类型：反转`;
}

export interface FixtureOptions {
  /** 章号 → 覆盖字段（注入章级缺陷） */
  chapterOverrides?: Record<number, Partial<{ title: string; CBN: string; CPNs: string; CEN: string }>>;
  /** 卷纲「关键角色」里额外引用的未登记姓名 */
  extraVolumeCharacters?: string[];
  /** 角色数（默认 10；给更少可制造 character-count 结构阻断） */
  characterCount?: number;
}

/** 生成完整夹具 Markdown；默认无缺陷，应通过完整性门禁 */
export function buildOutlineFixture(options: FixtureOptions = {}): string {
  const total = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;
  const characterCount = options.characterCount ?? FIXTURE_CHARACTER_NAMES.length;
  const characters = FIXTURE_CHARACTER_NAMES.slice(0, characterCount)
    .map((name, index) => buildCharacterBlock(name, index === 0 ? '主角' : index < 5 ? '盟友' : '反派', index + 1))
    .join('\n\n');
  const foreshadows = Array.from({ length: OUTLINE_COMPLETENESS_POLICY.minimumForeshadows }, (_, index) =>
    buildForeshadowBlock(index + 1)
  ).join('\n\n');
  const chapters = Array.from({ length: total }, (_, index) =>
    buildChapterBlock(index + 1, options.chapterOverrides?.[index + 1])
  ).join('\n\n');
  const volumeCharacters = ['林川', '钱县丞', ...(options.extraVolumeCharacters ?? [])].join('；');

  return `# 主方案

## 故事定位
- 标题：验尸官升官记
- 一句话卖点：现代法医穿越古代查案升官
- 题材标签：古言；悬疑
- 目标读者：男频悬疑读者
- 核心情绪：爽；悬疑
- 卖点：验尸翻案；官场博弈
- 风格关键词：快节奏；反转

## 核心驱动
- 主角姓名：林川
- 主角起点：穿越成县衙验尸小吏
- 长期目标：升到刑部主事
- 短期目标：洗清杀人嫌疑
- 核心冲突：主角与县丞的权力对抗
- 升级路径：县衙 → 州府 → 刑部
- 失败代价：被当替罪羊处死

## 故事规模规划
- 目标总字数：150万字
- 预计总章数：600
- 平均章字数：2500
- 建议卷数：6
- 每卷章数：100
- 启动阶段占比：8%
- 长篇推进说明：每卷一个层级的对手

## 卷纲
### 第1卷
- 卷标题：初入县衙
- 章节区间：1-100章
- 卷目标：洗清杀人嫌疑
- 卷冲突：主角与县丞的权力对抗
- 卷高潮：当堂翻案
- 卷反转：真凶是仵作
- 卷尾钩子：州府来人
- 主角成长：从小吏到县衙红人
- 关键角色：${volumeCharacters}
- 埋设伏笔：卷宗缺页
- 回收伏笔：卷宗缺页
- 关系变化：林川与钱县丞敌对

## 世界与势力规划
### 核心地点
#### 地点1
- 名称：青阳县衙
- 层级：city
- 剧情功能：主角起点与首轮冤案发生地
- 上级地点：江州府
- 关联冲突：主角与县丞的权力对抗

### 关键势力
#### 势力1
- 名称：县丞一党
- 势力定位：反派
- 核心目标：掩盖旧案
- 盟友：李主簿
- 敌对：林川
- 与主角关系：敌对
- 上级势力：州府某官

## 前${total}章启动包
- 开篇钩子：一睁眼正趴在尸体上
- 对读者的承诺：每章都有翻案反转
- 主角第一印象：胆大心细的验尸官
- 第一次强记忆爽点：当众验出真凶
- 第一轮冲突闭环：洗清自身杀人嫌疑

### 1-${total}章
- 目标：建立验尸金手指与首轮冤案
- 必出事件：主角当众验出真凶
- 爽点：当堂打脸县丞
- 必留钩子：县丞连夜销毁卷宗
- 本块禁区：不能揭示主角穿越身份
- 节奏要求：快节奏
- 读者期待：看主角打脸县丞

## 关键角色规划
${characters}

## 伏笔规划
${foreshadows}

## 单章蓝图
${chapters}
`;
}
