/**
 * 空章补写（真实 AI）：对已生成书籍的判死/空洞章做定点修复。
 *
 *   node scripts/storyflow-repair-empty.mjs <project-store.json> <章号[,章号...]>
 *
 * 流程（2026-09-07 待批准项 #2 落地）：
 * 1. 读 store → 项目直通 openContinueWriteSession（不经 toPipelineProject——它会丢
 *    chapterMemories/foreshadows，命运台账与伏笔锁全部失活）；
 * 2. 节点消毒：dropForeshadowConflictingItems 删掉与伏笔时点冲突的 mustCover/CPN
 *    （g38f r2 ch36 形态：节点「当众颁布三级网格考成法」vs 伏笔第 45 章揭示）；
 * 3. 缝合注入：章 outline 追加下章开头原文，强制本章结尾与之对齐（ch184 形态：
 *    滚动槽位空合同 + 前后章已定稿，本章必须双向缝合）；
 * 4. 空章走管线 isEmptyRewrite 路径（stripStateForChapterRewrite 剥离本章后旧状态），
 *    单章定局走与 App 同一执行器 runBatchChapter；
 * 5. 成功后把正文/标题/记忆写回 store 文件（原文件备份 .bak）。
 */
import { writeFileSync, copyFileSync, existsSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { isRealAiEnabled, readRealAiEnvConfig, createRealStructuredAI } from './realStructuredAI';
import { openContinueWriteSession } from './continueWriteHarness';
import { dropForeshadowConflictingItems, type ForeshadowTimingHint } from '@/services/outline/rolling/outline-roller';
import { BlueprintRepairLedger } from '@/services/outline/rolling/chapter-blueprint-regenerator';
import { runBatchChapter } from '@/services/writing/batchChapterRunner';
import { useProjectStore } from '@/stores/project.store';
import type { Project } from '@/types/project';

import { readProjectStoreFile, writeProjectBack } from './projectStoreFile';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/** 补写单章最多尝试次数（人工定点修复，预算比批量 maxRetries=5 紧） */
const REPAIR_MAX_ATTEMPTS = 3;

interface RepairOptions {
  storePath: string;
  chapterNumbers: number[];
  targetWordCount: number;
  /** 单章 3 次耗尽时记录后继续跑后续章（大段批量补写防连坐），结尾汇总失败章 */
  continueOnFail: boolean;
}

function resolveRepairOptions(): RepairOptions | null {
  const storePath = process.env.MOLIU_REPAIR_STORE?.trim();
  const chaptersRaw = process.env.MOLIU_REPAIR_CHAPTERS?.trim();
  if (!storePath || !chaptersRaw) return null;
  const chapterNumbers = chaptersRaw
    .split(/[,，\s]+/)
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (chapterNumbers.length === 0) return null;
  return {
    storePath,
    chapterNumbers,
    targetWordCount: Number(process.env.MOLIU_REPAIR_TARGET_WORDS) > 0
      ? Number(process.env.MOLIU_REPAIR_TARGET_WORDS)
      : 3000,
    continueOnFail: process.env.MOLIU_REPAIR_CONTINUE_ON_FAIL === '1',
  };
}

function foreshadowHintsOf(project: Project): ForeshadowTimingHint[] {
  return (project.foreshadows ?? []).map(f => {
    const raw = f as unknown as {
      hint?: string;
      createdChapter?: number;
      setupChapter?: number;
      payoffChapter?: number;
      suggestedResolutionChapter?: number;
    };
    return {
      hint: raw.hint ?? '',
      createdChapter: raw.createdChapter,
      setupChapter: raw.setupChapter,
      payoffChapter: raw.payoffChapter ?? raw.suggestedResolutionChapter,
    } satisfies ForeshadowTimingHint;
  });
}

export interface RepairRunResult {
  failedChapters: number[];
  failureReasons: Record<number, string>;
}

/**
 * 补写章与下章「同拍重演」检测（2026-09-30 r16 ch114/115 S1 实证）：
 * 下章是按补写章垂死草稿生成的——补写完成后，下章开头可能把补写章已演完的
 * 节拍当作未发生重演（人物状态重置/底牌二次首亮/同一道具动作复演，r16 形态：
 * ch114 末徐茂德已被旧账残页打脸至惨白，ch115 开头却昂下巴重新进场并被同一叠
 * 旧账再次打脸）。字面层先做确定性重叠检测；语义层一次 AI 探针终审。
 * fail-open：只警告不阻断——补写正文本身已过判官门禁，警告供 triage/书审跟进。
 */
export function detectRepairStitchOverlap(
  repairedTail: string,
  nextHead: string,
): { similarity: number; longestCommon: number } {
  const tail = repairedTail.replace(/\s+/g, '');
  const head = nextHead.replace(/\s+/g, '');
  if (tail.length < 20 || head.length < 20) return { similarity: 0, longestCommon: 0 };
  const bigrams = (text: string): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i + 1 < text.length; i += 1) out.add(text.slice(i, i + 2));
    return out;
  };
  const a = bigrams(tail);
  const b = bigrams(head);
  let inter = 0;
  for (const gram of a) if (b.has(gram)) inter += 1;
  const similarity = a.size + b.size > 0 ? inter / (a.size + b.size - inter) : 0;
  let longest = 0;
  const dp = new Array<number>(head.length + 1).fill(0);
  for (let i = 1; i <= tail.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= head.length; j += 1) {
      const tmp = dp[j];
      dp[j] = tail[i - 1] === head[j - 1] ? prev + 1 : 0;
      if (dp[j] > longest) longest = dp[j];
      prev = tmp;
    }
  }
  return { similarity, longestCommon: longest };
}

interface StitchProbeAI {
  generate<T>(input: {
    purpose: string;
    schemaName: string;
    system: string[];
    prompt: string;
    parse: (raw: string) => T;
  }): Promise<T>;
}

export async function warnIfNextChapterReplaysBeat(
  chapters: Array<{ orderIndex?: number; content?: string }>,
  repairedChapterNumber: number,
  ai: StitchProbeAI,
): Promise<void> {
  const repaired = chapters.find(item => (item.orderIndex ?? 0) + 1 === repairedChapterNumber);
  const next = chapters.find(item => (item.orderIndex ?? 0) + 1 === repairedChapterNumber + 1);
  const tail = (repaired?.content ?? '').slice(-600);
  const head = (next?.content ?? '').slice(0, 600);
  if (!tail || !head) return;
  const { similarity, longestCommon } = detectRepairStitchOverlap(tail, head);
  if (similarity >= 0.3 || longestCommon >= 15) {
    console.warn(
      `[repair] 第${repairedChapterNumber + 1}章开头与补写章尾字面重叠嫌疑（sim=${similarity.toFixed(2)}，最长公共串=${longestCommon}字）——检查是否同拍重演`,
    );
  }
  try {
    const verdict = await ai.generate<{ replay: boolean; reason: string }>({
      purpose: 'outline-repair-bp',
      schemaName: 'RawText',
      system: [
        '你是网文连续性审计员。补写章（原判死空洞章）已重写完成，其末尾文本与下一章开头文本如下。',
        '下一章是按补写章的垂死草稿生成的，可能把补写章已完成的节拍当作未发生重演。',
        '判断下一章开头是否重演了补写章末尾已完成的关键节拍：人物状态被重置（已被打脸/震慑/击败却重新嚣张进场）、同一底牌/证据被当作首次亮出、同一道具动作复演。',
        '正常承接（延续情绪状态、引用既有结果、推进新进展）不算重演。',
        '只输出 JSON：{"replay":true/false,"reason":"一句话依据，引用双方原文短语"}',
      ],
      prompt: JSON.stringify({ repairedChapterTail: tail, nextChapterHead: head }),
      parse: raw => JSON.parse(String(raw).replace(/```json|```/gu, '').trim()) as { replay: boolean; reason: string },
    });
    if (verdict?.replay) {
      console.warn(
        `[repair] 第${repairedChapterNumber + 1}章开头疑似重演补写章已完成节拍（${String(verdict.reason).slice(0, 160)}）——需修补下章开头`,
      );
    }
  } catch {
    // fail-open：探针失败不影响补写结果
  }
}

export async function runRepairEmptyChapters(options: RepairOptions): Promise<RepairRunResult> {
  const failedChapters: number[] = [];
  const failureReasons: Record<number, string> = {};
  const { root, project } = readProjectStoreFile(options.storePath);
  const chapters = [...project.chapters].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const hints = foreshadowHintsOf(project);

  // ---- 1) 节点消毒 + 缝合注入（改动只在内存，成功后统一落盘）----
  for (const n of options.chapterNumbers) {
    const chapter = chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
    if (!chapter) throw new Error(`第 ${n} 章不存在`);
    if ((chapter.content ?? '').trim()) throw new Error(`第 ${n} 章非空章（wordCount>0），拒绝覆盖`);
    const node = (project.plotOutline ?? []).find(
      item => item.type === 'chapter' && (item.orderIndex ?? 0) === n - 1,
    );
    if (node) {
      const before = {
        orderIndex: n,
        title: node.title ?? '',
        summary: node.description ?? '',
        CBN: node.CBN ?? '',
        CPNs: node.CPNs ?? [],
        CEN: node.CEN ?? '',
        mustCover: node.mustCover ?? [],
        forbiddenZones: node.forbiddenZones ?? [],
        hookType: 'reveal',
      };
      const { blueprint, dropped } = dropForeshadowConflictingItems(before, hints);
      if (dropped.length > 0) {
        console.info(`[repair] 第${n}章节点消毒：删除与伏笔时点冲突条目 ${JSON.stringify(dropped)}`);
        node.CPNs = blueprint.CPNs;
        node.mustCover = blueprint.mustCover;
        // 消毒弃置声明（2026-09-25 r10a 实证：ch194「立萧承泰密诏」节点被删后
        // 无任何标记，ch197 写手把从未发生的密诏当既成事实凭空引用——删除即蒸发
        // 会留法统级缺口）：把被删条目作为「未发生的剧情」显式告知写手与判官，
        // 相关剧情要么完整重写过程、要么彻底回避，禁止直接引述其结果。
        chapter.outline = `${chapter.outline ?? ''}\n【消毒弃置】以下原蓝图条目因伏笔时序冲突已删除，其内容**未在正文发生**，本章及后文不得将其当作既成事实引用（如剧情确需相近走向，必须在本章完整写出过程，不得直接引述结果）：${dropped.map(item => `「${item}」`).join('')}`.trim();
        console.info(`[repair] 第${n}章注入消毒弃置声明（${dropped.length} 条）`);
      }
    }
    const next = chapters.find(item => (item.orderIndex ?? 0) + 1 === n + 1);
    const nextHead = (next?.content ?? '').trim().slice(0, 180);
    if (nextHead) {
      chapter.outline = `${chapter.outline ?? ''}\n【缝合·下章开头】下章开头原文：「${nextHead}」——本章剧情必须自然导向该状态：人物生死/羁押/在场身份/时空进度与前后章完全一致，不得矛盾；本章结尾落在导向该状态的悬念或行动上。`.trim();
      console.info(`[repair] 第${n}章注入下章缝合锚（${nextHead.length} 字）`);
    }

    // ---- 终章收束三层（2026-10-08 r19 读者四门禁实证：末三章 77 分带、终章 58 分
    // 全书最低——主循环有大纲层终卷收束约束，repair 补写链路对「这是最后一章」
    // 零感知，按普通章写终章）。三层：收束段铺垫（末三章）→ 完本收束硬约束
    // （末章：主线终局+open 台账逐条兑现+终局回响+收束句收尾）→ open 清单
    // 实数据注入（不靠写手回忆）。
    const finalChapter = chapters.length > 0 ? (chapters[chapters.length - 1].orderIndex ?? 0) + 1 : 0;
    if (finalChapter > 0 && n === finalChapter) {
      const openPromises = (project.timePromises ?? [])
        .filter(p => p.status === 'open')
        .map(p => `「${p.promise}」`);
      const openForeshadows = (project.foreshadows ?? [])
        .filter(f => {
          const status = String((f as { status?: unknown }).status ?? '');
          return status && status !== 'resolved';
        })
        .map(f => `「${String((f as { hint?: unknown }).hint ?? '').slice(0, 40)}」`);
      chapter.outline = `${chapter.outline ?? ''}\n【完本收束硬约束】本章是全书最后一章（共${finalChapter}章），正文必须完成四件事：
1. 主线终局：本书核心冲突当章出最终结果（反派阵营覆灭/伏法/清算，主角核心目标达成），不得留「下一卷再说」的尾巴；
2. 兑现在册承诺（择要场面化）：${openPromises.length > 0 ? `在册 open 承诺中挑与主线终局最相关的 2-3 条用具体场面兑现（对话/动作/在场者反应），其余用一句终局总括交代（如「余案尽结/各得其所」）——禁止逐条罗列成清单。在册承诺：${openPromises.slice(0, 5).join('')}${openPromises.length > 5 ? ` 等${openPromises.length}条` : ''}` : '（当前无在册 open 承诺）'}；
3. 回收在册伏笔（择要）：${openForeshadows.length > 0 ? `最重要的伏笔用场面回收，次要的并入终局总括——${openForeshadows.slice(0, 5).join('')}` : '（当前无在册未回收伏笔）'}；
4. 终局回响与收束句：主要角色结局用 1-2 个具体场景交代（归宿/地位/关系落点），世界新秩序一句话立起；章尾必须是全书收束句（尘埃落定/天下大定/新秩序类），禁止抛出新悬念、新危机、新钩子——末章结尾是句号不是问号。
【反速通铁律】重头戏（反派伏法/终极对决/主角清算登顶）必须写成具体场面——有人物在场、有对话与动作、有旁观者反应；禁止用「数日后一切尘埃落定」「随后各案陆续了结」类大纲式旁白把重头戏一笔带过（2026-10-08 首版实证：清单一章塞 37 条承诺 → 读者裁判判「大纲式旁白速通」64 分弃读）。`.trim();
      console.info(`[repair] 第${n}章注入完本收束硬约束（open承诺${openPromises.length}/伏笔${openForeshadows.length}）`);
    } else if (finalChapter > 0 && n >= finalChapter - 2 && n < finalChapter) {
      const isPenultimate = n === finalChapter - 1;
      chapter.outline = `${chapter.outline ?? ''}\n【收束段】本章已进入全书最后三章：开始收拢线索、清算次要反派、兑现积压的承诺与伏笔；禁止再开任何新的长线悬念或新冲突——为末章的完本收束腾出空间。${isPenultimate
        ? '\n【末章前哨分工】下一章（末章）只承载：终极对决+终局回响+全书收束句。因此本章必须把其余收束工作全部写足写透——京城/中枢的清算与册封、新秩序确立（立制/改制/面圣）、主要配角的结局交代，全部用完整场面（对话/动作/在场反应）呈现，禁止留到末章、禁止大纲式旁白速通（末章单章装不下全部收束——r19 终章两轮实证：清算挤进末章必然走马观花被读者弃读）。'
        : ''}`.trim();
      console.info(`[repair] 第${n}章注入收束段铺垫${isPenultimate ? '（末章前哨分工）' : ''}`);
    }
  }

  // ---- 2) 逐章补写（升序，空章走 isEmptyRewrite 全链含判官门禁）----
  const writeStoreBack = (memoriesFallback: typeof project.chapterMemories): void => {
    let memories = memoriesFallback ?? [];
    // 台账回读（2026-10-07 r19 relay 断链实证）：saveLedger→applyFactLedger 只改
    // pinia currentProject，session/repair 两层 project 副本都不带——落盘必须
    // 与记忆一起从 pinia 回读，否则 store 的 numericLedger/timePromises 永远
    // 停留在补写开始前的旧账（relay 40+ 章出账全部滞留内存丢失的根因）
    let numericLedger = project.numericLedger;
    let timePromises = project.timePromises;
    let eraLedger = project.eraLedger;
    try {
      const store = useProjectStore();
      const current = store.currentProject as Project | null;
      if (current?.chapterMemories?.length) memories = current.chapterMemories;
      if (current?.numericLedger?.length) numericLedger = current.numericLedger;
      if (current?.timePromises?.length) timePromises = current.timePromises;
      if (current?.eraLedger?.length) eraLedger = current.eraLedger;
    } catch {
      /* pinia 读回失败时保留原记忆表与旧账 */
    }
    const projectOut = {
      ...project,
      chapters,
      chapterMemories: memories,
      numericLedger,
      timePromises,
      eraLedger,
    } as unknown as Record<string, unknown>;
    writeProjectBack(root, projectOut);
    if (!existsSync(`${options.storePath}.bak`)) {
      copyFileSync(options.storePath, `${options.storePath}.bak`);
    }
    writeFileSync(options.storePath, JSON.stringify(root, null, 2), 'utf8');
  };

  const ai = createRealStructuredAI(readRealAiEnvConfig());
  const session = openContinueWriteSession({ project: { ...project, chapters } as Project });
  // 蓝图再生调用器（2026-09-13 r4 ch187 齐王命运冲突补齐）：补写路径与主循环
  // 同样会遇到「过期节点要求已羁押角色自由出场」的死锁，纯重试修不好。
  // 2026-09-23 g38f 500ch 修复：原实现走 UnifiedOutlineGenerator.callStructuredTextForRoll，
  // 其请求层依赖 App 设置的激活 provider（本测试模拟存储为空 → ch208 蓝图再生报
  // 「未找到当前激活的 AI 提供商配置」，数字蒸发死锁章失去恢复路径）——改走
  // createRealStructuredAI 同一真实通道，与写作链路一致；返回原文由 regenerator 解析。
  const repairCfg = readRealAiEnvConfig();
  const repairAi = createRealStructuredAI(repairCfg);
  const repairBlueprintCaller = async (system: string, user: string): Promise<string> =>
    String(await repairAi.generate<string>({
      purpose: 'outline-repair-bp',
      schemaName: 'RawText',
      system,
      prompt: user,
      parse: (raw: string) => raw,
    }));
  try {
    const repairLedger = new BlueprintRepairLedger();
    for (const n of options.chapterNumbers) {
      const chapterEntity = chapters.find(item => (item.orderIndex ?? 0) + 1 === n)!;
      // 单章定局与 App/批量冒烟同一执行器（分级重试/伏笔熔断/履约域蓝图再生/字数目标），
      // 补写只多两件事：下章缝合锚（再生覆盖 outline 后重挂）与 continue-on-fail 汇总
      const outcome = await runBatchChapter({
        chapterId: chapterEntity.id,
        chapterNumber: n,
        baseWordCount: options.targetWordCount,
        maxRetries: REPAIR_MAX_ATTEMPTS,
        ledger: repairLedger,
        getProject: () => session.getProject(),
        runAttempt: async attemptInput =>
          (
            await session.runChapter({
              chapterNumber: n,
              targetWordCount: attemptInput.targetWordCount,
              ai,
              runId: `storyflow-repair-ch${n}-${Date.now()}`,
              persistTrace: true,
              mode: 'batch',
              enableMemoryExtract: true,
              seedRevisionHints: attemptInput.seedRevisionHints,
              foreshadowExemptions: attemptInput.foreshadowExemptions,
            })
          ).output,
        repairBlueprint: repairBlueprintCaller,
        applyRegeneratedBlueprint: async blueprint => {
          await session.applyChapterBlueprint(n, blueprint);
          // 再生覆盖了 outline，重新追加阶段 1 的下章缝合锚
          const nextChapter = chapters.find(item => (item.orderIndex ?? 0) + 1 === n + 1);
          const nextHead = (nextChapter?.content ?? '').trim().slice(0, 180);
          const liveChapter = session
            .getProject()
            .chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
          if (nextHead && liveChapter) {
            liveChapter.outline =
              `${liveChapter.outline ?? ''}\n【缝合·下章开头】下章开头原文：「${nextHead}」——本章剧情必须自然导向该状态：人物生死/羁押/在场身份/时空进度与前后章完全一致，不得矛盾；本章结尾落在导向该状态的悬念或行动上。`;
          }
        },
        onEvent: event => {
          if (event.type === 'attempt-failed') {
            console.warn(
              `[repair] 第${n}章 attempt ${event.attempt} 失败（${event.classified.kind}）：${event.message.slice(0, 200)}`,
            );
          } else if (event.type === 'foreshadow-exempted') {
            console.warn(
              `[repair] 第${n}章伏笔时序熔断：伏笔「${event.prefix}…」连续 ${event.rejects} 次提前揭示拒稿，确认蓝图与伏笔台账矛盾，本章豁免该伏笔时点禁令（源头应修蓝图）`,
            );
          } else if (event.type === 'fulfillment-failure') {
            console.warn(`[repair] 第${n}章履约域失败（累计 ${event.failures} 次）`);
          } else if (event.type === 'blueprint-regenerated') {
            console.warn(`[repair] 第${n}章蓝图已再生（命运锁在再生提示词内生效），下轮按新合同补写`);
          } else if (event.type === 'blueprint-regeneration-failed') {
            console.warn(`[repair] 第${n}章蓝图再生未成功：${event.error}`);
          }
        },
      });
      if (outcome.status === 'success') {
        const chapter = chapterEntity;
        chapter.content = outcome.output.prose;
        chapter.wordCount = outcome.output.prose.replace(/\s+/g, '').length;
        chapter.status = 'final';
        (chapter as { writeStatus?: string }).writeStatus = 'completed';
        if (outcome.output.title && /^第\s*\d+\s*章/.test(chapter.title ?? '')) {
          chapter.title = outcome.output.title;
        }
        console.info(
          `[repair] 第${n}章补写成功（attempt ${outcome.attempts}，${chapter.wordCount} 字）`,
        );
        // 下章同拍重演检测（r16 ch114/115 实证）：fail-open 警告
        await warnIfNextChapterReplaysBeat(chapters, n, ai);
      } else {
        const lastError = outcome.lastError;
        const fatal = `第 ${n} 章补写 ${outcome.attempts} 次尝试后未成功（${outcome.status}）：${lastError.slice(0, 300)}`;
        // 用户停止/审查不可用不属于「本章写不出」，continue-on-fail 也不跳过
        if (outcome.status !== 'exhausted' || !options.continueOnFail) throw new Error(fatal);
        failedChapters.push(n);
        failureReasons[n] = fatal;
        console.warn(`[repair] ${fatal}（continue-on-fail，跳过继续后续章）`);
        continue;
      }
      // 逐章即时落盘：后续章超时/失败不丢已成功章（首跑实测 ch36 成功后被
      // ch184 的 30min 测试超时连坐丢失）
      writeStoreBack(project.chapterMemories);
      console.info(`[repair] 第${n}章已即时落盘 ${options.storePath}`);
    }
  } finally {
    session.dispose();
  }

  console.info(`[repair] 全部目标章完成，store 终稿 ${options.storePath}（原文件备份 .bak）`);
  if (failedChapters.length > 0) {
    console.warn(
      `[repair] 汇总：成功 ${options.chapterNumbers.length - failedChapters.length} 章，失败 ${failedChapters.length} 章：${failedChapters.join(',')}（需单独归因处理）`,
    );
  }
  return { failedChapters, failureReasons };
}

const repairOptions = resolveRepairOptions();

describe('空章补写（真实 AI）', () => {
  it.runIf(isRealAiEnabled() && repairOptions !== null)(
    '定点补写判死章并通过判官门禁 + 缝合落盘',
    async () => {
      const runResult = await runRepairEmptyChapters(repairOptions!);
      const { project } = readProjectStoreFile(repairOptions!.storePath);
      const assertChapters = repairOptions!.chapterNumbers.filter(n => !runResult.failedChapters.includes(n));
      if (assertChapters.length === 0) {
        throw new Error(`全部 ${repairOptions!.chapterNumbers.length} 章补写失败，首因：${JSON.stringify(runResult.failureReasons).slice(0, 300)}`);
      }
      for (const n of assertChapters) {
        const chapter = project.chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
        expect(chapter, `第 ${n} 章应存在`).toBeDefined();
        expect((chapter?.content ?? '').trim().length, `第 ${n} 章正文非空`).toBeGreaterThan(2000);
      }
    },
    // 预算：每章 3 次尝试 × 慢网关（429 限速日单次起草+评审可达 15min）
    Math.max(45, (repairOptions?.chapterNumbers.length ?? 2) * 45) * 60_000,
  );
});
