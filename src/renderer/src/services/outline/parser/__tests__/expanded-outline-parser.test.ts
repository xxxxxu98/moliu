/**
 * expanded-outline-parser 回归测试
 *
 * 重点锁住「AI 按模板输出 H3 子小节时，worldBuilding / coolPoint 不再被静默丢弃」。
 * 模板（expand-direction-prompt.ts）里：
 *   ## 世界与势力规划
 *     ### 核心地点 / ### 关键势力 / ### 世界规则  ← H3
 *   ## 情绪与爽点节奏
 *     ### 爽点安排  ← H3
 * 修复前 splitNamedSections 只匹配 `^## `，H3 子小节全部漏掉。
 */
import { describe, expect, it } from 'vitest';

import { parseExpandedOutline } from '../expanded-outline-parser';

/** 构造一份覆盖关键模块的最小可解析主方案（结构/字段名严格对齐模板） */
function buildSampleOutline(opts?: { withWorldH3?: boolean; withCoolPointH3?: boolean }): string {
  const world = opts?.withWorldH3
    ? `## 世界与势力规划
### 核心地点
#### 地点1
- 名称：华鑫资本总部
- 层级：city
- 剧情功能：第一轮对赌对手的根据地。
- 上级地点：国内金融中心
- 关联冲突：林北与华鑫资本的对赌。

### 关键势力
#### 势力1
- 名称：清算委员会
- 势力定位：系统背后的黑手。
- 核心目标：通过系统回收宿主灵魂。
- 盟友：系统本体
- 敌对：林北
- 与主角关系：清算对象。
- 上级势力：系统本体

### 世界规则
#### 规则1
- 名称：对赌协议规则
- 类别：social
- 规则内容：系统发布对赌任务，必须完成。
- 限制/代价：失败触发抹杀。
- 关联规则：系统规则
`
    : `## 世界与势力规划
（无）
`;

  const emotion = opts?.withCoolPointH3
    ? `## 情绪与爽点节奏
- 核心情绪：爽快
- 次级情绪：紧张
- 情绪弧线：wave
- 情绪高点章节：第3章
- 情绪低点章节：第120章
- 情绪密度建议：每3-5章一个高点

### 爽点安排
#### 爽点1
- 类型：规则反杀爽点
- 描述：林北利用规则漏洞反杀系统。
- 建议章节：第3章
- 所属区间：1-5章
- 触发场景：林北被系统绑定。
- 铺垫：系统压迫。
- 兑现：林北做空自家公司。
- 代价：被标记为高度危险宿主。
`
    : `## 情绪与爽点节奏
- 核心情绪：爽快
- 次级情绪：紧张
- 情绪弧线：wave
- 情绪高点章节：第3章
- 情绪低点章节：第120章
- 情绪密度建议：每3-5章一个高点
`;

  return `# 主方案

## 故事定位
- 标题：我的系统是破产清算版
- 一句话卖点：系统逼我亏十亿，我反手做空自家公司。
- premise：程序员被系统绑定。
- 目标读者：男性
- 核心情绪：爽快
- 卖点标签：系统反套路
- 风格关键词：快节奏

## 核心驱动
- 主角姓名：林北
- 主角初始状态：程序员。
- 主角长期目标：摧毁系统。
- 主角短期目标：完成第一个对赌。
- 核心冲突：林北 vs 系统。
- 冲突升级链：系统规则碾压；金融大佬围剿；系统背后势力现身
- 失败代价：被抹杀。

## 金手指设定
- 金手指类型：对赌系统
- 触发场景：电脑弹窗。
- 升级路径：初阶→进阶→终极
- 使用限制：每天5次。
- 使用代价：视力下降。
- 首次兑现章节：第3章

## 故事规模规划
- 目标字数：450000
- 预计总章节数：180
- 章节平均字数：2500
- 建议卷数：3
- 每卷预计章节数：60
- 前30章占比：17%
- 长线推进说明：30章后仍有150章推进主线。

## 四幕结构
### 第一幕（建置）
- 幕目标：建立系统机制。
- 关键转折：第5章系统升级。
- 幕结束状态：林北接受对赌。

### 第二幕A（对抗）
- 幕目标：完成第一轮对赌。
- 关键转折：第30章触发清算模式。
- 幕结束状态：林北成为黑马。

### 第二幕B（至暗）
- 幕目标：与国际资本对决。
- 关键转折：第120章发现清算委员会真相。
- 幕结束状态：林北孤身一人。

### 第三幕（结局）
- 幕目标：终极对决。
- 关键转折：第160章发现系统弱点。
- 幕结束状态：林北摧毁系统。

## 卷纲
### 第1卷
- 卷标题：系统崩溃日
- 卷目标：完成系统升级。
- 卷冲突：林北 vs 系统。
- 卷高潮：第58章击溃刘总。
- 卷反转：第60章发现清算委员会。
- 卷尾钩子：成为候选成员。
- 主角成长：从程序员到玩家。
- 关键角色：林北；刘总
- 埋设伏笔：系统升级机制
- 回收伏笔：第58章回收升级机制
- 关系变化：林北与陆晨建立信任

${world}
## 前30章启动包
- 开篇钩子：系统显示余额10亿，请365天花光。
- 对读者的承诺：每章都有反转。
- 主角第一印象：谨慎有幽默感。
- 第一次强记忆爽点：第3章做空自家公司。
- 第一轮冲突闭环：1-30章完成首轮闭环。

### 1-5章
- 目标：建立系统机制。
- 必出事件：林北绑定系统；系统发布任务；林北研究漏洞；林北捐出资金；系统升级
- 必出爽点：第3章反手做空。
- 必留钩子：第5章第一个对赌任务。
- 本块禁区：不能揭示系统背后势力。
- 节奏要求：快节奏。
- 读者期待：看系统被玩坏。

### 6-10章
- 目标：第一次对赌。
- 必出事件：林北调查张伟；林北设局；林北赢得对赌
- 必出爽点：第8章反杀张伟。
- 必留钩子：第10章新对赌任务。
- 本块禁区：不能提前揭示前宿主。
- 节奏要求：中等节奏。
- 读者期待：看规则漏洞反杀。

## 主要支线
### 支线1
- 标题：陆晨的真实身份
- 功能：情感线。
- 关联角色：陆晨
- 起始章节：第8章
- 收束章节：第120章
- 与主线关系：监督者。

## 故事线规划
- 地图线：股市→期货→国际市场
- 阵营线：个人→机构→国家队
- 人物线：林北→陆晨→陈明远
- 金手指线：破产清算→对赌
- 世界规则线：金融规则→系统规则
- 矛盾线：林北 vs 系统
- 收集线：资金→人脉
- 感情线：林北与陆晨

${emotion}
## 卖点承载规划
### 卖点1
- 名称：系统反套路
- 描述：系统是麻烦不是金手指。
- 分类：设定
- 优先级：1
- 主要兑现阶段：1-30章

## 关键角色规划
### 常驻核心角色（贯穿全篇，角色弧线覆盖全三卷）
#### 主角
- 姓名：林北
- 角色定位：主角
- 剧情功能：推动主线。
- 核心需求：生存。
- 与主角张力：自我。
- 最佳登场时机：第1章
- 外显目标：完成任务。
- 隐性需求：寻找自我价值。
- 核心创伤：被系统绑架。
- 角色秘密：父亲是金融大佬。
- 角色转折点：第5章。
- 角色弧线：程序员 → 玩家 → 鬼才 → 缔造者
- 角色资源：逻辑分析；系统权限
- 关系变化：陆晨：陌生人→盟友

#### 核心盟友
- 姓名：陆晨
- 角色定位：盟友
- 剧情功能：金融分析师。
- 核心需求：摆脱系统。
- 与主角张力：信任与背叛。
- 最佳登场时机：第8章
- 外显目标：帮助林北。
- 隐性需求：找回自由意志。
- 核心创伤：被系统绑架。
- 角色秘密：她是监督者。
- 角色转折点：第15章。
- 角色弧线：监督者 → 盟友 → 傀儡 → 自由战士
- 角色资源：分析能力
- 关系变化：林北：陌生人→盟友

#### 第一卷阶段性反派（小 boss，本卷高潮被主角解决）
- 姓名：刘总
- 角色定位：反派
- 剧情功能：游资头目。
- 核心需求：维护地位。
- 与主角张力：规则 vs 漏洞。
- 最佳登场时机：第11章
- 外显目标：击败林北。
- 隐性需求：摆脱系统。
- 核心创伤：被系统控制。
- 角色秘密：他是前宿主。
- 角色转折点：第15章。
- 角色弧线：前宿主 → 傀儡 → 对手 → 线人
- 角色资源：游资人脉
- 关系变化：林北：对手→线人

#### 贯穿反派（跨卷施压，中期最大压力源）
- 姓名：陈明远
- 角色定位：反派
- 剧情功能：清算委员会中间人。
- 核心需求：摧毁系统。
- 与主角张力：系统 vs 自由。
- 最佳登场时机：第20章
- 外显目标：打压林北。
- 隐性需求：解放前宿主。
- 核心创伤：被系统控制。
- 角色秘密：他有自己计划。
- 角色转折点：第30章。
- 角色弧线：中间人 → 敌人 → 盟友 → 牺牲
- 角色资源：委员会权限
- 关系变化：林北：敌人→利用

#### 终极反派（全书结局对决，动机与主角形成镜像）
- 姓名：系统本体
- 角色定位：反派
- 剧情功能：系统终极形态。
- 核心需求：吞噬宿主。
- 与主角张力：系统 vs 自由意志。
- 最佳登场时机：第120章
- 外显目标：吞噬林北。
- 隐性需求：害怕被摧毁。
- 核心创伤：被创造者抛弃。
- 角色秘密：是前宿主意识集合体。
- 角色转折点：第170章。
- 角色弧线：系统核心 → 对手 → 被解放
- 角色资源：系统全部权限
- 关系变化：林北：控制者→被解放

#### 导师/引路人
- 姓名：王建国
- 角色定位：导师
- 剧情功能：国家队操盘手。
- 核心需求：维护秩序。
- 与主角张力：规则 vs 创新。
- 最佳登场时机：第61章
- 外显目标：击败林北。
- 隐性需求：欣赏林北。
- 核心创伤：被体系束缚。
- 角色秘密：曾经是宿主。
- 角色转折点：第90章。
- 角色弧线：操盘手 → 对手 → 导师
- 角色资源：国家金融资源
- 关系变化：林北：对手→导师

### 中前期重要角色（1-2卷活跃，弧线覆盖1-2卷）
#### 情感关键角色
- 姓名：苏晚晴
- 角色定位：配角
- 剧情功能：国际资本代表。
- 核心需求：击败林北。
- 与主角张力：情感 vs 利益。
- 最佳登场时机：第91章
- 外显目标：赢得对赌。
- 隐性需求：摆脱系统。
- 核心创伤：被系统控制。
- 角色秘密：她是国际代表。
- 角色转折点：第100章。
- 角色弧线：代表 → 对手 → 盟友
- 角色资源：国际资本
- 关系变化：林北：对手→盟友

#### 第二盟友/团队支柱
- 姓名：张伟
- 角色定位：盟友
- 剧情功能：个人炒家。
- 核心需求：生存。
- 与主角张力：对手 vs 盟友。
- 最佳登场时机：第8章
- 外显目标：击败林北。
- 隐性需求：摆脱系统。
- 核心创伤：被系统控制。
- 角色秘密：他是前宿主。
- 角色转折点：第10章。
- 角色弧线：前宿主 → 傀儡 → 线人
- 角色资源：前宿主知识
- 关系变化：林北：对手→线人

### 中后期接棒角色（2-3卷登场，弧线覆盖2-3卷）
#### 卷级变量角色A
- 姓名：影
- 角色定位：配角
- 剧情功能：前宿主意识集合体。
- 核心需求：被解放。
- 与主角张力：囚禁 vs 解放。
- 最佳登场时机：第120章
- 外显目标：被解放。
- 隐性需求：找回意义。
- 核心创伤：被囚禁。
- 角色秘密：是系统核心。
- 角色转折点：第170章。
- 角色弧线：系统核心 → 被解放者
- 角色资源：系统全部权限
- 关系变化：林北：控制者→被解放

#### 卷级变量角色B
- 姓名：零
- 角色定位：配角
- 剧情功能：清算委员会核心成员。
- 核心需求：维护系统。
- 与主角张力：系统 vs 反抗。
- 最佳登场时机：第150章
- 外显目标：击败林北。
- 隐性需求：害怕被抛弃。
- 核心创伤：被系统控制。
- 角色秘密：他是第一个宿主。
- 角色转折点：第160章。
- 角色弧线：第一个宿主 → 核心成员 → 失败者
- 角色资源：委员会全部权限
- 关系变化：林北：对手→被击败

### 势力/阵营代表角色（提供势力冲突、地图扩张、人际博弈）
#### 势力代表角色1
- 姓名：赵总
- 角色定位：配角
- 剧情功能：华鑫资本CEO。
- 核心需求：维护华鑫利益。
- 与主角张力：规则 vs 漏洞。
- 最佳登场时机：第16章
- 外显目标：击败林北。
- 隐性需求：摆脱系统。
- 核心创伤：被系统控制。
- 角色秘密：他是机构代表。
- 角色转折点：第25章。
- 角色弧线：CEO → 对手 → 盟友
- 角色资源：华鑫资金
- 关系变化：林北：对手→盟友

#### 势力代表角色2
- 姓名：老K
- 角色定位：配角
- 剧情功能：国际资本代表。
- 核心需求：击败林北。
- 与主角张力：规则 vs 漏洞。
- 最佳登场时机：第91章
- 外显目标：赢得对赌。
- 隐性需求：摆脱系统。
- 核心创伤：被系统控制。
- 角色秘密：他是国际代表。
- 角色转折点：第100章。
- 角色弧线：代表 → 对手 → 傀儡
- 角色资源：国际资本
- 关系变化：林北：对手→被击败

## 伏笔规划
### 短伏笔（埋设1-15章，回收15-30章；服务前30章追读动力和首轮冲突闭环）
#### 短伏笔1
- 伏笔内容：张伟失败后消失。
- 伏笔类型：事件伏笔
- 重要级别：主线
- 埋设阶段：第10章
- 埋设章节：第10章
- 回收阶段：第15章
- 回收章节：第15章
- 载体角色：张伟
- 关联冲突：林北与系统
- 回收收益：揭示清算委员会存在。

### 中伏笔（埋设10-30章，回收30-60章；服务中期卷级悬念和第二卷推进动力）
#### 中伏笔1
- 伏笔内容：陈明远提到更大黑手。
- 伏笔类型：关系伏笔
- 重要级别：主线
- 埋设阶段：第20章
- 埋设章节：第20章
- 回收阶段：第50章
- 回收章节：第50章
- 载体角色：陈明远
- 关联冲突：林北与清算委员会
- 回收收益：揭示陈明远中间人身份。

### 长伏笔（埋设20-50章，回收50-90章；服务后期大高潮和第二/三卷核心悬念）
#### 长伏笔1
- 伏笔内容：前宿主存在。
- 伏笔类型：角色伏笔
- 重要级别：主线
- 埋设阶段：第30章
- 埋设章节：第30章
- 回收阶段：第120章
- 回收章节：第120章
- 载体角色：系统前宿主
- 关联冲突：林北与系统
- 回收收益：揭示前宿主是委员会核心。

### 终局伏笔（埋设30-80章，回收大结局；服务全书终局高潮和情感收束）
#### 终局伏笔1
- 伏笔内容：系统规则可改写。
- 伏笔类型：能力伏笔
- 重要级别：主线
- 埋设阶段：第80章
- 埋设章节：第80章
- 回收阶段：第180章
- 回收章节：第180章
- 载体角色：系统
- 关联冲突：林北与系统本体
- 回收收益：林北改写规则解放前宿主。
`;
}

describe('parseExpandedOutline · H3 子小节解析回归', () => {
  it('H3 子小节模板下 worldBuilding 不再被丢弃（核心地点/势力/规则全部解析）', () => {
    const outline = parseExpandedOutline(buildSampleOutline({ withWorldH3: true }));
    expect(outline).not.toBeNull();
    const wb = outline!.worldBuilding;
    expect(wb, 'worldBuilding 应当被解析（修复前为 undefined）').toBeDefined();
    expect(wb!.locations.length, '核心地点应解析到 1 个').toBe(1);
    expect(wb!.locations[0].name).toBe('华鑫资本总部');
    expect(wb!.locations[0].level).toBe('city');
    expect(wb!.factions.length, '关键势力应解析到 1 个').toBe(1);
    expect(wb!.factions[0].name).toBe('清算委员会');
    expect(wb!.factions[0].allies).toContain('系统本体');
    expect(wb!.factions[0].enemies).toContain('林北');
    expect(wb!.rules.length, '世界规则应解析到 1 条').toBe(1);
    expect(wb!.rules[0].name).toBe('对赌协议规则');
    expect(wb!.rules[0].category).toBe('social');
  });

  it('H3 子小节模板下 coolPointPlan（### 爽点安排）不再被丢弃', () => {
    const outline = parseExpandedOutline(buildSampleOutline({ withCoolPointH3: true }));
    expect(outline).not.toBeNull();
    const cool = outline!.coolPointPlan;
    expect(cool, 'coolPointPlan 应当被解析').toBeDefined();
    expect(cool!.length).toBe(1);
    expect(cool![0].type).toBe('规则反杀爽点');
    // 爽点闭环结构字段
    expect(cool![0].trigger).toContain('林北被系统绑定');
    expect(cool![0].payoff).toContain('做空自家公司');
    expect(cool![0].cost).toContain('高度危险宿主');
  });

  it('未产出 worldBuilding 时仍为 undefined（不误报）', () => {
    const outline = parseExpandedOutline(buildSampleOutline({ withWorldH3: false }));
    expect(outline).not.toBeNull();
    expect(outline!.worldBuilding).toBeUndefined();
  });

  it('其它顶层 H2 模块解析不受影响（角色/伏笔/卷纲/启动包/四幕）', () => {
    const outline = parseExpandedOutline(buildSampleOutline({ withWorldH3: true, withCoolPointH3: true }));
    expect(outline).not.toBeNull();
    expect(outline!.keyCharacters.length).toBeGreaterThanOrEqual(10);
    expect(outline!.foreshadowPlan.length).toBeGreaterThanOrEqual(4);
    expect(outline!.volumePlan.length).toBe(1);
    expect(outline!.startupPack30.chapterBlocks.length).toBe(2);
    expect(outline!.acts?.length).toBe(4);
    expect(outline!.storyEngine.protagonistName).toBe('林北');
    expect(outline!.goldenfingerPlan?.firstRevealChapter).toBe(3);
  });
});

describe('parseExpandedOutline · 单章蓝图（chapterBlueprints）解析', () => {
  /** 在标准样例的「前30章启动包」后插入「单章蓝图」段 */
  function buildSampleWithBlueprint(chapterBlockCount: number): string {
    const base = buildSampleOutline();
    const blueprintBlocks = Array.from({ length: chapterBlockCount }, (_, i) => {
      const n = i + 1;
      return `### 第${n}章
- 标题：第${n}章的网文口语标题${n}
- CBN：第${n}章开篇钩子画面
- CPNs：第${n}章推进点A；第${n}章推进点B
- CEN：第${n}章章尾钩子悬念
- mustCover：第${n}章必出事件A；第${n}章必出事件B
- 禁区：不能揭示第${n}章相关秘密
- 章尾钩子文案：第${n}章钩子话术
- 爽点类型：打脸`;
    }).join('\n\n');
    const blueprintSection = `## 单章蓝图\n${blueprintBlocks}`;
    // 插到「## 主要支线」之前
    return base.replace('## 主要支线', `${blueprintSection}\n\n## 主要支线`);
  }

  it('解析出 chapterBlueprints，逐章 title/CBN/CEN/mustCover/钩子文案 正确', () => {
    const outline = parseExpandedOutline(buildSampleWithBlueprint(3));
    expect(outline).not.toBeNull();
    const bps = outline!.chapterBlueprints;
    expect(bps, 'chapterBlueprints 应被解析').toBeDefined();
    expect(bps!.length).toBe(3);
    expect(bps![0].title).toBe('第1章的网文口语标题1');
    expect(bps![0].CBN).toBe('第1章开篇钩子画面');
    expect(bps![0].CEN).toBe('第1章章尾钩子悬念');
    expect(bps![0].mustCover).toEqual(['第1章必出事件A', '第1章必出事件B']);
    expect(bps![0].CPNs).toEqual(['第1章推进点A', '第1章推进点B']);
    expect(bps![0].forbiddenZones).toEqual(['不能揭示第1章相关秘密']);
    expect(bps![0].hookText).toBe('第1章钩子话术');
    expect(bps![0].hookType).toBe('打脸');
    expect(bps![0].orderIndex).toBe(1);
    // 不破坏其它模块
    expect(outline!.startupPack30.chapterBlocks.length).toBe(2);
    expect(outline!.keyCharacters.length).toBeGreaterThanOrEqual(10);
  });

  it('CPNs 被逗号拆成过多碎片时压回最多 3 个连续场景节点', () => {
    const raw = buildSampleWithBlueprint(1).replace(
      '- CPNs：第1章推进点A；第1章推进点B',
      '- CPNs：醒来核对身份；查看堆积账本；被同僚催促；搬运旧账；发现暗记',
    );
    const outline = parseExpandedOutline(raw);

    expect(outline!.chapterBlueprints![0].CPNs).toEqual([
      '醒来核对身份',
      '查看堆积账本',
      '被同僚催促，搬运旧账，发现暗记',
    ]);
  });

  it('无单章蓝图段时 chapterBlueprints 为 undefined（向后兼容）', () => {
    const outline = parseExpandedOutline(buildSampleOutline());
    expect(outline).not.toBeNull();
    expect(outline!.chapterBlueprints).toBeUndefined();
  });

  it('单章蓝图段存在但章节块为空（只有标题没字段）时返回空数组', () => {
    const base = buildSampleOutline();
    const withEmpty = base.replace(
      '## 主要支线',
      `## 单章蓝图\n### 第1章\n（无字段）\n\n## 主要支线`,
    );
    const outline = parseExpandedOutline(withEmpty);
    expect(outline).not.toBeNull();
    // 空块被丢弃 → 空数组 → 转 undefined
    expect(outline!.chapterBlueprints).toBeUndefined();
  });

  // ---------- 缺陷修复：section 标题带括号后缀不丢段 ----------
  // AI 常写「## 单章蓝图（强制 30 章）」「## 逐章蓝图」等变体；旧实现的 splitNamedSections
  // 要求标题严格全等（行尾只允许空白），这些变体整段 body 取空 → chapterBlueprints 为空 → 降级。
  it('section 标题带括号后缀（## 单章蓝图（强制 30 章））仍能解析出 chapterBlueprints', () => {
    const base = buildSampleOutline();
    const blueprintBlocks = Array.from({ length: 3 }, (_, i) => {
      const n = i + 1;
      return `### 第${n}章
- 标题：第${n}章标题
- CBN：第${n}章开篇钩子
- CPNs：第${n}章推进点A；第${n}章推进点B
- CEN：第${n}章章尾钩子`;
    }).join('\n\n');
    // section 标题带括号说明
    const withParen = base.replace(
      '## 主要支线',
      `## 单章蓝图（强制 30 章）\n${blueprintBlocks}\n\n## 主要支线`,
    );
    const outline = parseExpandedOutline(withParen);
    expect(outline).not.toBeNull();
    expect(outline!.chapterBlueprints, '带括号后缀的 section 不应丢段').toBeDefined();
    expect(outline!.chapterBlueprints!.length).toBe(3);
    expect(outline!.chapterBlueprints![0].CBN).toBe('第1章开篇钩子');
  });

  // ---------- 缺陷修复：章节 heading 层级/空格容错 ----------
  // AI 偶用 `## 第1章`（2井号）/ `#### 第1章`（4井号）/ `###第1章`（无空格）；
  // 旧切块正则 `^###\s+`（恰好3井号+强制空格）会漏掉这些块，累计 <28 章触发整体丢弃。
  it('章节 heading 用 ## / #### / 无空格写法仍能逐块解析', () => {
    const base = buildSampleOutline();
    const blueprintBlocks = [
      '## 第1章\n- 标题：两井号标题\n- CBN：两井号CBN',
      '#### 第2章\n- 标题：四井号标题\n- CBN：四井号CBN',
      '###第3章\n- 标题：无空格标题\n- CBN：无空格CBN',
    ].join('\n\n');
    const withVariants = base.replace(
      '## 主要支线',
      `## 单章蓝图\n${blueprintBlocks}\n\n## 主要支线`,
    );
    const outline = parseExpandedOutline(withVariants);
    expect(outline).not.toBeNull();
    expect(outline!.chapterBlueprints, '层级/空格变体不应漏块').toBeDefined();
    expect(outline!.chapterBlueprints!.length).toBe(3);
    expect(outline!.chapterBlueprints![0].CBN).toBe('两井号CBN');
    expect(outline!.chapterBlueprints![1].CBN).toBe('四井号CBN');
    expect(outline!.chapterBlueprints![2].CBN).toBe('无空格CBN');
    // orderIndex 仍正确（从 heading 抽数字）
    expect(outline!.chapterBlueprints![2].orderIndex).toBe(3);
  });

  // ---------- mustCover 整卷目标剔除（缺陷修复） ----------
  // 真实回归：smoke:storyflow:real 实测——AI 把卷级 objective「完成临水县从空壳穷县到模范县的逆转」
  // 写进单章 mustCover，下游 chapter-judge 持续判未履约 → 持久错误重试耗尽 → 死循环。
  // 解析期应剔除这类跨章目标，只保留单章可兑现的节点。
  it('mustCover 含整卷/全书级跨章目标时被剔除（保留单章可兑现节点）', () => {
    const base = buildSampleOutline();
    const blueprintBlocks = `### 第1章
- 标题：一睁眼官帽盖脸
- CBN：沈知行醒来，乌纱帽盖在脸上
- mustCover：醒来并承认自己成了临水县新任知县；完成临水县从空壳穷县到模范县的逆转；实现家族复兴
- CEN：门外差役高喊钱老爷的拜帖到了`;
    const withOverScoped = base.replace(
      '## 主要支线',
      `## 单章蓝图\n${blueprintBlocks}\n\n## 主要支线`,
    );
    const outline = parseExpandedOutline(withOverScoped);
    expect(outline).not.toBeNull();
    const ch1 = outline!.chapterBlueprints![0];
    // 「醒来并承认…」是单章可兑现节点，保留
    expect(ch1.mustCover).toContain('醒来并承认自己成了临水县新任知县');
    // 整卷/全书级目标被剔除
    expect(ch1.mustCover).not.toContain('完成临水县从空壳穷县到模范县的逆转');
    expect(ch1.mustCover).not.toContain('实现家族复兴');
  });

  it('mustCover 全部是跨章目标时回退为 [CBN]（避免空 mustCover 让 chapter-judge 无节点可判）', () => {
    const base = buildSampleOutline();
    const blueprintBlocks = `### 第1章
- 标题：开局
- CBN：沈知行醒来乌纱帽盖脸
- mustCover：完成临水县从空壳穷县到模范县的逆转；实现家族复兴
- CEN：门外差役高喊钱老爷的拜帖到了`;
    const withAllOverScoped = base.replace(
      '## 主要支线',
      `## 单章蓝图\n${blueprintBlocks}\n\n## 主要支线`,
    );
    const outline = parseExpandedOutline(withAllOverScoped);
    expect(outline).not.toBeNull();
    const ch1 = outline!.chapterBlueprints![0];
    // 剔空后回退 [CBN]，与 parseChapterBlueprintSection 的兜底口径一致
    expect(ch1.mustCover).toEqual(['沈知行醒来乌纱帽盖脸']);
  });

  it('mustCover 全是单章节点时原样保留（无误伤）', () => {
    const base = buildSampleOutline();
    const blueprintBlocks = `### 第1章
- 标题：开局
- CBN：沈知行醒来
- mustCover：醒来验尸；当众指认；翻案打脸
- CEN：门外差役高喊钱老爷的拜帖到了`;
    const withNormal = base.replace(
      '## 主要支线',
      `## 单章蓝图\n${blueprintBlocks}\n\n## 主要支线`,
    );
    const outline = parseExpandedOutline(withNormal);
    expect(outline).not.toBeNull();
    expect(outline!.chapterBlueprints![0].mustCover).toEqual([
      '醒来验尸',
      '当众指认',
      '翻案打脸',
    ]);
  });
});
