/**
 * 历史拒稿教训账本（反例注入，数据飞轮零成本版）。
 *
 * 把每章审查出的 blocking / 弱信号问题按「族签名」累计到项目级账本，
 * 高频族（复发≥2）渲染进起草/改稿 prompt 的【历史拒稿教训】反例区——
 * 等效于把判官的判例喂给写手，不动权重。
 *
 * 族识别走 message 模式而非 issue.id：validator 的 id 是位置序号
 * （`fulfillment-3` 跨章不可比），message 才承载语义（与引擎侧
 * uniformDensityIssueIds 同哲学）。弱信号族（warning 也计入）与引擎
 * weakSignalDriven 的四族对齐；其余 warning 是噪音不计。
 */
import type { ContinuityIssue } from '@/types/story-runtime';
import type { RejectionLessonEntry } from '@/types/project';

/** 账本容量上限：按 count 降序截断，防长跑项目无限膨胀 */
export const REJECTION_LESSON_MAX_ENTRIES = 24;
/** 注入阈值：单次是噪声，两次是模式 */
export const REJECTION_LESSON_MIN_COUNT = 2;
/** 注入条数上限：反例区超过 5 行会被模型当背景噪音无视 */
export const REJECTION_LESSON_INJECT_LIMIT = 5;

interface LessonFamily {
  key: string;
  /** prompt 反例指令（祈使句，告诉写手「不要做什么」） */
  directive: string;
  /** 弱信号族：warning 级也计入（与引擎 weakSignalDriven 四族同口径） */
  weakSignal?: boolean;
  test: (issue: ContinuityIssue) => boolean;
}

/** 已知问题族（顺序即匹配优先级，先具体后宽泛） */
export const LESSON_FAMILIES: readonly LessonFamily[] = [
  {
    key: 'node-verbatim',
    directive: '大纲节点是任务书不是台词——禁止把节点原句（≥12字）逐字搬进正文',
    weakSignal: true,
    test: issue =>
      issue.id.startsWith('node-verbatim') ||
      issue.message.includes('节点原句照抄') ||
      issue.message.includes('节点抄用'),
  },
  {
    key: 'rhythm-uniform',
    directive: '段落长短必须错落（对话短段与叙述长段交错），禁止全章等长中长段的机器节奏',
    weakSignal: true,
    test: issue => issue.message.includes('段落节奏均匀化'),
  },
  {
    key: 'narrative-wall',
    directive: '大段连续叙述必须拆开——穿插对话、动作、感官细节，禁止叙述墙',
    weakSignal: true,
    test: issue => issue.message.includes('叙述段过重'),
  },
  {
    key: 'real-era-name',
    directive: '纪年只用本书架空年号，严禁混入真实历史年号',
    weakSignal: true,
    test: issue => issue.id.startsWith('real-era-name') || issue.message.includes('真实历史年号'),
  },
  {
    key: 'opening-repetition',
    directive: '本章开场不得复述/重演上一章结尾——时间与动作必须向前推进',
    weakSignal: true,
    test: issue =>
      issue.id.startsWith('opening-repetition') ||
      issue.message.includes('开场重演') ||
      issue.message.includes('章界重演'),
  },
  {
    key: 'word-count-over',
    directive: '全章字数必须落在目标区间内——超上限会被压缩拒稿',
    test: issue => issue.message.includes('字数严重超限') || issue.id.startsWith('word-count-over'),
  },
  {
    key: 'word-count-short',
    directive: '全章字数必须写足目标区间下限——不足会触发补字/拒稿',
    test: issue => issue.message.includes('字数严重不足') || issue.id.startsWith('word-count-short'),
  },
  {
    key: 'forbidden-zone',
    directive: '本章禁区（合同 forbidden）严禁正面叙述或等价泄露',
    test: issue => issue.message.includes('触发本章禁区'),
  },
  {
    key: 'fulfillment-miss',
    directive: 'mustCover 节点必须全部在正面前进——跳过、虚写、推迟都会被判未履约',
    test: issue => issue.message.includes('未履约节点'),
  },
  {
    key: 'numeric-ledger',
    directive: '同一账目/物证的数字必须与台账正典一致——换措辞指同一对象也算，改口必须先写勘误场面',
    test: issue =>
      issue.message.includes('数字蒸发') ||
      issue.message.includes('疑似同对象改口') ||
      issue.message.includes('数字不一致'),
  },
  {
    key: 'fact-conflict',
    directive: '跨章事实（生死/位置/身份/头衔/持有物）必须与既成状态一致——冲突即拒稿',
    test: issue => issue.message.includes('语义问题[fact_conflict]'),
  },
  {
    key: 'ooc',
    directive: '角色言行不得崩设定——说话方式、立场、能力边界与人设一致',
    test: issue => issue.message.includes('语义问题[ooc]'),
  },
  {
    key: 'timeline',
    directive: '时间流逝必须与时间轴标记连续——禁止无交代的时间回退或跳跃',
    test: issue =>
      issue.message.includes('语义问题[timeline]') ||
      issue.message.includes('时间标记') ||
      issue.message.includes('纪年'),
  },
  {
    key: 'logic-gap',
    directive: '因果必须自洽——关键转折要有铺垫，数量×单位要先笔算再落笔',
    test: issue => issue.message.includes('语义问题[logic_gap]'),
  },
  {
    key: 'foreshadow',
    directive: '伏笔埋设/回收必须与规划一致——不得提前说破未来章节的揭晓',
    test: issue => issue.message.includes('语义问题[foreshadow]'),
  },
];

/** 未匹配已知族的 blocking 问题：按 message 前缀归一（16 字，取首个分句） */
function genericKeyOf(message: string): string {
  const head = message.split(/[：:，,。；;（(]/u)[0] ?? message;
  return `other:${head.slice(0, 16)}`;
}

/** 单条 issue 是否值得计入账本（blocking 恒计入；弱信号族 warning 计入；其余 warning 是噪音） */
export function isCountableRejectionIssue(issue: ContinuityIssue): boolean {
  if (issue.severity === 'blocking') return true;
  if (issue.severity !== 'warning') return false;
  return LESSON_FAMILIES.some(family => family.weakSignal && family.test(issue));
}

/**
 * 把一章的问题清单合并进账本：同族 count+1、刷新例证；非可计issue 忽略。
 * 纯函数，返回新数组（按 count 降序，封顶 REJECTION_LESSON_MAX_ENTRIES）。
 */
export function mergeRejectionLessons(
  existing: readonly RejectionLessonEntry[] | undefined,
  issues: readonly ContinuityIssue[],
  chapterNumber: number,
  at: string = new Date().toISOString()
): RejectionLessonEntry[] {
  const byKey = new Map<string, RejectionLessonEntry>();
  for (const entry of existing ?? []) {
    if (entry?.key && Number.isFinite(entry.count) && entry.count > 0) {
      byKey.set(entry.key, { ...entry });
    }
  }
  for (const issue of issues) {
    if (!isCountableRejectionIssue(issue)) continue;
    const family = LESSON_FAMILIES.find(item => item.test(issue));
    const key = family?.key ?? genericKeyOf(issue.message);
    const message = issue.message.trim().slice(0, 120);
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
      entry.lastMessage = message;
      entry.lastChapter = chapterNumber;
      entry.lastAt = at;
    } else {
      byKey.set(key, {
        key,
        count: 1,
        lastMessage: message,
        lastChapter: chapterNumber,
        lastAt: at,
      });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, REJECTION_LESSON_MAX_ENTRIES);
}

/** 高频族筛选：count≥minCount 的前 limit 条（prompt 注入用） */
export function topRejectionLessons(
  lessons: readonly RejectionLessonEntry[] | undefined,
  options?: { minCount?: number; limit?: number }
): RejectionLessonEntry[] {
  const minCount = options?.minCount ?? REJECTION_LESSON_MIN_COUNT;
  const limit = options?.limit ?? REJECTION_LESSON_INJECT_LIMIT;
  return (lessons ?? [])
    .filter(entry => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * 渲染【历史拒稿教训】反例区（起草 system 与改稿 brief 共用，注入口径唯一）。
 * 每条 = 族指令 + 复发计数 + 最近例证（截 60 字）；未匹配族直接引用例证原文。
 * 空数组返回 []（不注入区块头，零噪音）。
 */
export function renderRejectionLessonRules(
  lessons: readonly RejectionLessonEntry[] | undefined
): string[] {
  const top = topRejectionLessons(lessons);
  if (top.length === 0) return [];
  const lines = [
    `- 【历史拒稿教训】以下是本书此前被审查实拒/强制改稿的问题族（按复发次数排序），本章严禁重犯：`,
  ];
  for (const entry of top) {
    const family = LESSON_FAMILIES.find(item => item.key === entry.key);
    const excerpt = entry.lastMessage.slice(0, 60);
    const evidence = excerpt ? `，最近一次：「${excerpt}」` : '';
    lines.push(
      family
        ? `- ${family.directive}（已复发 ${entry.count} 次，最近第 ${entry.lastChapter} 章${evidence}）`
        : `- 切勿重犯同类问题（已复发 ${entry.count} 次，最近第 ${entry.lastChapter} 章）：「${excerpt}」`
    );
  }
  return lines;
}
