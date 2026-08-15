import { describe, expect, it, vi } from 'vitest';

import type { OutlineDirection } from '@/services/outline/types/direction';
import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import { generateExpandedOutlineInSteps } from '../outline-stepper';
import type { GenerateOptions } from '../unified-generator';

const DIRECTION: OutlineDirection = {
  id: 'dir-1',
  title: '验尸官破奇案',
  oneLiner: '现代法医穿越古代断案',
  premise: '法医林川穿越成古代仵作',
  protagonistArc: '仵作 → 县衙刑名 → 提刑官',
  coreConflict: '用现代法医学对抗古代官场黑幕',
  coolPointStyle: ['技术碾压'],
  targetEmotions: ['爽快'],
  riskNotes: [],
  recommendedReason: '题材稀缺',
} as OutlineDirection;

const BASE_OPTIONS: GenerateOptions = { maxRetries: 1 };

/** 5 步的预设响应：每步返回包含该步产出段的 Markdown，可被 parseExpandedOutline 解析 */
const STEP_RESPONSES: string[] = [
  // 步1 骨架：定位/驱动/金手指/规模/四幕/世界
  `## 故事定位
- 标题：验尸官破奇案
- 一句话卖点：现代法医穿越古代断案
- premise：法医林川穿越成古代仵作
- 题材标签：古言、悬疑
- 目标读者：男频
- 核心情绪：爽快
- 卖点标签：技术碾压
- 风格关键词：硬核

## 核心驱动
- 主角姓名：林川
- 主角初始状态：刚穿越的仵作
- 主角长期目标：成为提刑官
- 主角短期目标：破第一桩命案
- 核心冲突：现代法医学对抗官场黑幕
- 冲突升级链：县衙→州府→京城
- 失败代价：被诬陷入狱

## 金手指设定
- 金手指类型：现代法医学知识
- 触发场景：验尸时
- 升级路径：基础解剖→毒理分析→DNA推断
- 使用限制：需尸体在场
- 使用代价：消耗精神
- 首次兑现章节：第2章

## 故事规模规划
- 目标字数：150万字
- 预计总章节数：600
- 章节平均字数：2500
- 建议卷数：6
- 每卷预计章节数：100
- 前50章占比：8%
- 长线推进说明：案件分层递进

## 四幕结构
### 第一幕（建置）
- 幕目标：立住人设
- 关键转折：破第一案
- 幕结束状态：仵作身份稳固

### 第二幕A（对抗）
- 幕目标：对抗县衙
- 关键转折：揭穿知县
- 幕结束状态：升任刑名

### 第二幕B（至暗）
- 幕目标：被诬陷
- 关键转折：翻案
- 幕结束状态：洗清冤屈

### 第三幕（结局）
- 幕目标：终极对决
- 关键转折：扳倒幕后
- 幕结束状态：成为提刑官

## 世界与势力规划
### 核心地点
#### 地点1
- 名称：县衙
- 层级：city
- 剧情功能：主舞台
- 上级地点：州府
- 关联冲突：官场

### 关键势力
#### 势力1
- 名称：县衙
- 势力定位：地方官府
- 核心目标：维稳
- 盟友：无
- 敌对：主角
- 与主角关系：压制
- 上级势力：州府

### 世界规则
#### 规则1
- 名称：刑名律
- 类别：social
- 规则内容：命案必验
- 限制/代价：仵作低贱
- 关联规则：无`,
  // 步2 卷纲
  `## 卷纲
### 第1卷
- 卷标题：县衙风云
- 卷目标：立住仵作身份
- 卷冲突：县衙黑幕
- 卷高潮：破第一案
- 卷反转：知县涉案
- 卷尾钩子：调往州府
- 主角成长：仵作→刑名
- 关键角色：林川、知县
- 埋设伏笔：密信
- 回收伏笔：无
- 关系变化：与知县决裂

### 第2卷
- 卷标题：州府暗流
- 卷目标：查清上级
- 卷冲突：州府包庇
- 卷高潮：当堂对质
- 卷反转：知府是棋子
- 卷尾钩子：京城来人
- 主角成长：刑名→推官
- 关键角色：林川、知府
- 埋设伏笔：官印
- 回收伏笔：密信
- 关系变化：结盟御史`,
  // 步3 启动包（10 个 5 章块，这里给 2 块作代表，parser 至少需 1 块）
  `## 前50章启动包
- 开篇钩子：一睁眼正在验尸
- 对读者的承诺：技术碾压断案
- 主角第一印象：冷静专业
- 第一次强记忆爽点：当众指出死因
- 第一轮冲突闭环：破第一案被认可

### 1-5章
- 目标：立住仵作人设
- 必出事件：穿越验尸、被刁难、破死因、被认可、接新案
- 必出爽点：当众断死因
- 必留钩子：密信浮现
- 本块禁区：不揭示主角真实来历
- 节奏要求：fast
- 读者期待：爽快断案

### 6-10章
- 目标：扩大影响力
- 必出事件：接连环案、发现官印、对质、险遭陷害、反杀
- 必出爽点：当堂打脸知县
- 必留钩子：州府介入
- 本块禁区：不让主角直接对抗州府
- 节奏要求：medium
- 读者期待：升级对抗`,
  // 步4 角色 + 伏笔
  `## 关键角色规划

### 常驻核心角色（贯穿全篇，角色弧线覆盖全三卷）
#### 主角
- 姓名：林川
- 角色定位：主角
- 剧情功能：断案
- 核心需求：查明真相
- 与主角张力：自身
- 最佳登场时机：开篇
- 外显目标：成为提刑官
- 隐性需求：归属感
- 核心创伤：前世孤独
- 角色秘密：穿越者
- 角色转折点：破第一案
- 角色弧线：仵作 → 刑名 → 提刑官
- 角色资源：法医学
- 关系变化：结盟御史

#### 核心盟友
- 姓名：赵捕头
- 角色定位：盟友
- 剧情功能：助力
- 核心需求：公正
- 与主角张力：信任
- 最佳登场时机：第一章
- 外显目标：破案
- 隐性需求：认同
- 核心创伤：被压制
- 角色秘密：无
- 角色转折点：第三章
- 角色弧线：怀疑 → 信任 → 誓死追随
- 角色资源：人脉
- 关系变化：与主角结盟

### 中前期重要角色（1-2卷活跃，弧线覆盖1-2卷）
#### 情感关键角色
- 姓名：苏女史
- 角色定位：配角
- 剧情功能：情感
- 核心需求：自由
- 与主角张力：吸引
- 最佳登场时机：第五章
- 外显目标：查家世
- 隐性需求：独立
- 核心创伤：家族联姻
- 角色秘密：皇室血脉
- 角色转折点：第十卷
- 角色弧线：受制 → 觉醒 → 独立
- 角色资源：信息
- 关系变化：与主角互信

#### 第二盟友
- 姓名：周书吏
- 角色定位：盟友
- 剧情功能：文书
- 核心需求：升迁
- 与主角张力：功利
- 最佳登场时机：第二章
- 外显目标：保命
- 隐性需求：成就
- 核心创伤：出身低
- 角色秘密：双面间谍
- 角色转折点：第八章
- 角色弧线：观望 → 投靠 → 反水
- 角色资源：档案
- 关系变化：与知县决裂

### 中后期接棒角色（2-3卷登场，弧线覆盖2-3卷）
#### 卷级变量角色A
- 姓名：钱将军
- 角色定位：配角
- 剧情功能：武力
- 核心需求：忠诚
- 与主角张力：立场
- 最佳登场时机：第二卷
- 外显目标：戍边
- 隐性需求：清白
- 核心创伤：被诬
- 角色秘密：旧案知情
- 角色转折点：第二卷高潮
- 角色弧线：对抗 → 理解 → 结盟
- 角色资源：兵权
- 关系变化：与主角合作

#### 卷级变量角色B
- 姓名：孙御医
- 角色定位：配角
- 剧情功能：药理
- 核心需求：医道
- 与主角张力：技艺
- 最佳登场时机：第三卷
- 外显目标：入太医院
- 隐性需求：传承
- 核心创伤：失传
- 角色秘密：毒经
- 角色转折点：第三卷
- 角色弧线：独行 → 切磋 → 托付
- 角色资源：毒理
- 关系变化：与主角互学

### 势力/阵营代表角色（提供势力冲突、地图扩张、人际博弈）
#### 势力代表角色1
- 姓名：李知县
- 角色定位：配角
- 剧情功能：反派
- 核心需求：自保
- 与主角张力：敌对
- 最佳登场时机：第一卷
- 外显目标：掩盖
- 隐性需求：升官
- 核心创伤：把柄
- 角色秘密：受贿
- 角色转折点：第一卷高潮
- 角色弧线：嚣张 → 慌乱 → 倒台
- 角色资源：官位
- 关系变化：与主角决裂

#### 势力代表角色2
- 姓名：王御史
- 角色定位：配角
- 剧情功能：制衡
- 核心需求：吏治
- 与主角张力：利用
- 最佳登场时机：第二卷
- 外显目标：清查
- 隐性需求：扳倒权臣
- 核心创伤：恩师被害
- 角色秘密：钦差
- 角色转折点：第二卷
- 角色弧线：试探 → 合作 → 托付
- 角色资源：圣旨
- 关系变化：与主角结盟

## 伏笔规划

### 短伏笔（埋设1-17章，回收17-50章）
#### 短伏笔1
- 伏笔内容：死者口中异味
- 伏笔类型：物件伏笔
- 重要级别：主线
- 埋设阶段：前期
- 埋设章节：3
- 回收阶段：前期
- 回收章节：12
- 载体角色：林川
- 关联冲突：毒杀案
- 回收收益：锁定凶手

#### 短伏笔2
- 伏笔内容：仵作工具缺失
- 伏笔类型：物件伏笔
- 重要级别：支线
- 埋设阶段：前期
- 埋设章节：5
- 回收阶段：前期
- 回收章节：20
- 载体角色：林川
- 关联冲突：资源
- 回收收益：自造工具

#### 短伏笔3
- 伏笔内容：衙役私下议论
- 伏笔类型：对话伏笔
- 重要级别：支线
- 埋设阶段：前期
- 埋设章节：7
- 回收阶段：前期
- 回收章节：25
- 载体角色：赵捕头
- 关联冲突：内鬼
- 回收收益：揪出眼线

### 中伏笔（埋设10-50章，回收50-100章）
#### 中伏笔1
- 伏笔内容：密信暗号
- 伏笔类型：物件伏笔
- 重要级别：主线
- 埋设阶段：前期
- 埋设章节：15
- 回收阶段：中期
- 回收章节：60
- 载体角色：林川
- 关联冲突：官场网络
- 回收收益：揭穿知府

#### 中伏笔2
- 伏笔内容：官印纹样
- 伏笔类型：物件伏笔
- 重要级别：主线
- 埋设阶段：前期
- 埋设章节：20
- 回收阶段：中期
- 回收章节：70
- 载体角色：周书吏
- 关联冲突：伪造
- 回收收益：锁定伪造者

#### 中伏笔3
- 伏笔内容：苏女史胎记
- 伏笔类型：身份伏笔
- 重要级别：情感
- 埋设阶段：前期
- 埋设章节：25
- 回收阶段：中期
- 回收章节：80
- 载体角色：苏女史
- 关联冲突：身世
- 回收收益：确认皇室血脉

### 长伏笔（埋设20-50章，回收50-90章）
#### 长伏笔1
- 伏笔内容：边关军报
- 伏笔类型：事件伏笔
- 重要级别：主线
- 埋设阶段：前期
- 埋设章节：30
- 回收阶段：后期
- 回收章节：90
- 载体角色：钱将军
- 关联冲突：边患
- 回收收益：揭穿通敌

#### 长伏笔2
- 伏笔内容：旧案卷宗
- 伏笔类型：事件伏笔
- 重要级别：主线
- 埋设阶段：前期
- 埋设章节：40
- 回收阶段：后期
- 回收章节：95
- 载体角色：王御史
- 关联冲突：恩师案
- 回收收益：扳倒权臣

### 终局伏笔（埋设30-80章，回收大结局）
#### 终局伏笔1
- 伏笔内容：皇帝暗疾
- 伏笔类型：身份伏笔
- 重要级别：主线
- 埋设阶段：中期
- 埋设章节：50
- 回收阶段：终局
- 回收章节：600
- 载体角色：孙御医
- 关联冲突：储位
- 回收收益：扶立新君

#### 终局伏笔2
- 伏笔内容：法医学残卷
- 伏笔类型：物件伏笔
- 重要级别：主线
- 埋设阶段：中期
- 埋设章节：60
- 回收阶段：终局
- 回收章节：600
- 载体角色：林川
- 关联冲突：传承
- 回收收益：开宗立派`,
  // 步5 节奏包装
  `## 主要支线
### 支线1
- 标题：苏女史身世
- 功能：情感线
- 关联角色：苏女史
- 起始章节：5
- 收束章节：80
- 与主线关系：交织

### 支线2
- 标题：边关暗流
- 功能：势力线
- 关联角色：钱将军
- 起始章节：30
- 收束章节：90
- 与主线关系：助力

### 支线3
- 标题：御史清查
- 功能：政治线
- 关联角色：王御史
- 起始章节：40
- 收束章节：95
- 与主线关系：合作

## 故事线规划
- 地图线：县衙→州府→京城→边关
- 阵营线：官府→御史→军方→皇室
- 人物线：仵作→刑名→提刑官
- 金手指线：法医学逐步升级
- 世界规则线：刑名律完善
- 矛盾线：真相vs黑幕
- 收集线：卷宗证据
- 感情线：林川与苏女史

## 情绪与爽点节奏
- 核心情绪：爽快
- 次级情绪：悬疑
- 情绪弧线：rising
- 情绪高点章节：12
- 情绪低点章节：8
- 情绪密度建议：前快后稳

### 爽点安排
#### 爽点1
- 类型：打脸
- 描述：当众断死因
- 建议章节：3
- 所属区间：1-5
- 触发场景：县令质疑
- 铺垫：被刁难
- 兑现：当堂指出毒物
- 代价：得罪知县

#### 爽点2
- 类型：碾压
- 描述：技术破连环案
- 建议章节：10
- 所属区间：6-15
- 触发场景：连环案无解
- 铺垫：众人无策
- 兑现：DNA推断锁定
- 代价：暴露异常

#### 爽点3
- 类型：反转
- 描述：揭穿知府
- 建议章节：25
- 所属区间：16-50
- 触发场景：知府包庇
- 铺垫：陷入绝境
- 兑现：当堂呈证
- 代价：被调离

## 卖点承载规划
### 卖点1
- 名称：技术碾压
- 描述：现代法医学古代断案
- 分类：设定
- 优先级：高
- 主要兑现阶段：全程`,
];

describe('generateExpandedOutlineInSteps 分步编排', () => {
  it('正常路径：逐步调用 5 次，拼装出可被 parseExpandedOutline 解析的完整 rawText', async () => {
    let callIndex = 0;
    const calls: string[] = [];
    const callStructuredTextMode = vi.fn(async (_system: string, user: string) => {
      callIndex += 1;
      calls.push(user);
      return STEP_RESPONSES[callIndex - 1];
    });

    const result = await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: BASE_OPTIONS,
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
    });

    expect(callStructuredTextMode).toHaveBeenCalledTimes(5);
    // 拼装的 rawText 含全部 14 段
    expect(result.rawText).toContain('## 故事定位');
    expect(result.rawText).toContain('## 卷纲');
    expect(result.rawText).toContain('## 关键角色规划');
    expect(result.rawText).toContain('## 卖点承载规划');
    // 可被解析为非 null outline
    const outline = parseExpandedOutline(result.rawText);
    expect(outline).not.toBeNull();
    expect(outline?.title).toBe('验尸官破奇案');
    expect(outline?.volumePlan.length).toBeGreaterThanOrEqual(1);
    expect(outline?.keyCharacters.length).toBeGreaterThanOrEqual(1);
    expect(outline?.foreshadowPlan.length).toBeGreaterThanOrEqual(1);
    // 正常路径无 warning
    expect(result.warnings).toHaveLength(0);
  });

  it('进度回调：串行步与并行段都触发对应文案', async () => {
    let callIndex = 0;
    const callStructuredTextMode = vi.fn(async () => {
      callIndex += 1;
      return STEP_RESPONSES[callIndex - 1];
    });
    const onProgress = vi.fn();

    await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: BASE_OPTIONS,
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
      onProgress,
    });

    const messages = onProgress.mock.calls.map(call => call[0] as string);
    // 串行段（骨架/卷纲）逐步触发
    expect(messages.some(m => m.includes('方案骨架'))).toBe(true);
    expect(messages.some(m => m.includes('卷纲'))).toBe(true);
    // 尾三步并行段：并行进度消息携带各步关键词（启动包/角色伏笔/节奏包装）
    expect(messages.some(m => m.includes('启动包'))).toBe(true);
    expect(messages.some(m => m.includes('角色伏笔') || m.includes('关键角色与伏笔'))).toBe(true);
    expect(messages.some(m => m.includes('节奏包装') || m.includes('支线'))).toBe(true);
  });

  it('软步（角色伏笔）失败：跳过并记 warning，不阻断后续步骤', async () => {
    let callIndex = 0;
    const callStructuredTextMode = vi.fn(async () => {
      callIndex += 1;
      if (callIndex === 4) {
        // 步4（cast，软步）失败
        throw new Error('大纲输出被长度上限截断：正文 100 字');
      }
      return STEP_RESPONSES[callIndex - 1];
    });

    const result = await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: BASE_OPTIONS,
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
    });

    // 步4失败跳过，步5仍执行 → 共调用 5 次
    expect(callStructuredTextMode).toHaveBeenCalledTimes(5);
    // 记录了步4失败的 warning
    expect(result.warnings.some(w => w.includes('cast') && w.includes('跳过'))).toBe(true);
    // 角色段缺失（步4跳过），但定位/卷纲/启动包/卖点段仍在
    expect(result.rawText).toContain('## 故事定位');
    expect(result.rawText).toContain('## 卷纲');
    expect(result.rawText).not.toContain('## 关键角色规划');
    expect(result.rawText).toContain('## 卖点承载规划');
  });

  it('软步（节奏包装）失败：跳过并记 warning，不影响硬步产出', async () => {
    let callIndex = 0;
    const callStructuredTextMode = vi.fn(async () => {
      callIndex += 1;
      if (callIndex === 5) {
        throw new Error('网络中断');
      }
      return STEP_RESPONSES[callIndex - 1];
    });

    const result = await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: BASE_OPTIONS,
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
    });

    expect(result.warnings.some(w => w.includes('rhythm'))).toBe(true);
    // 角色段（步4）仍在
    expect(result.rawText).toContain('## 关键角色规划');
  });

  it('硬步（骨架）失败：上抛错误，触发外层整体重试', async () => {
    const callStructuredTextMode = vi.fn(async () => {
      throw new Error('大纲输出被长度上限截断');
    });

    await expect(
      generateExpandedOutlineInSteps({
        seed: '法医穿越',
        direction: DIRECTION,
        options: BASE_OPTIONS,
        wordCountRange: '100万-200万字',
        callStructuredTextMode,
      }),
    ).rejects.toThrow('长度上限截断');
  });

  it('硬步（卷纲）失败：上抛错误', async () => {
    let callIndex = 0;
    const callStructuredTextMode = vi.fn(async () => {
      callIndex += 1;
      if (callIndex === 2) {
        throw new Error('卷纲生成失败');
      }
      return STEP_RESPONSES[callIndex - 1];
    });

    await expect(
      generateExpandedOutlineInSteps({
        seed: '法医穿越',
        direction: DIRECTION,
        options: BASE_OPTIONS,
        wordCountRange: '100万-200万字',
        callStructuredTextMode,
      }),
    ).rejects.toThrow('卷纲生成失败');
  });

  // finish_reason=length 是确定性失败（撞厂商输出上限），同参数重试必然复现。
  // 步级不得徒劳重试——生产默认 maxRetries=2 下必须只调一次就上抛（此前被误判为
  // 瞬态走指数退避，白烧数分钟长请求后仍同样失败）。
  it('硬步撞长度上限：非瞬态不重试，单次失败即上抛（生产默认 maxRetries=2）', async () => {
    const callStructuredTextMode = vi.fn(async () => {
      throw new Error('大纲输出被长度上限截断：正文 0 字、推理 12000 字');
    });

    await expect(
      generateExpandedOutlineInSteps({
        seed: '法医穿越',
        direction: DIRECTION,
        options: { maxRetries: 2 },
        wordCountRange: '100万-200万字',
        callStructuredTextMode,
      }),
    ).rejects.toThrow('长度上限截断');
    expect(callStructuredTextMode).toHaveBeenCalledTimes(1);
  });

  // 对照：网络类截断（网关中途 RST）是真瞬态，步级退避重试的行为保持不变
  it('网络瞬态错误：步级仍按指数退避重试', async () => {
    let callIndex = 0;
    const callStructuredTextMode = vi.fn(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        throw new Error('socket hang up');
      }
      return STEP_RESPONSES[callIndex - 2];
    });

    const result = await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: { maxRetries: 2 },
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
    });

    // 步1 首次失败 + 重试成功，其余 4 步各一次 → 共 6 次
    expect(callStructuredTextMode).toHaveBeenCalledTimes(6);
    expect(result.rawText).toContain('## 故事定位');
  });

  it('某步返回缺失部分段：只记 warning，已返回的段仍拼装', async () => {
    let callIndex = 0;
    const callStructuredTextMode = vi.fn(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        // 步1 只返回故事定位，缺其它 5 段
        return '## 故事定位\n- 标题：残缺书\n- 一句话卖点：残缺卖点';
      }
      return STEP_RESPONSES[callIndex - 1];
    });

    const result = await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: BASE_OPTIONS,
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
    });

    // 故事定位段被拼装
    expect(result.rawText).toContain('残缺书');
    // 缺失段记 warning
    expect(result.warnings.some(w => w.includes('核心驱动'))).toBe(true);
    expect(result.warnings.some(w => w.includes('世界与势力规划'))).toBe(true);
  });

  it('步间上下文：后续步骤的 prompt 携带前序已确定段', async () => {
    let callIndex = 0;
    const receivedUsers: string[] = [];
    const callStructuredTextMode = vi.fn(async (_system: string, user: string) => {
      callIndex += 1;
      receivedUsers.push(user);
      return STEP_RESPONSES[callIndex - 1];
    });

    await generateExpandedOutlineInSteps({
      seed: '法医穿越',
      direction: DIRECTION,
      options: BASE_OPTIONS,
      wordCountRange: '100万-200万字',
      callStructuredTextMode,
    });

    // 步2（卷纲）的 user 应含步1产出的主角姓名
    expect(receivedUsers[1]).toContain('林川');
    // 步3（启动包）的 user 应含步2产出的卷标题
    expect(receivedUsers[2]).toContain('县衙风云');
  });
});
