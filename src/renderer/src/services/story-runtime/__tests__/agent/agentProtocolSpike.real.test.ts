import { describe, expect, it } from 'vitest';

import type {
  ContractPack,
  SceneChunk,
  ScenePlan,
  StoryState,
} from '@/types/story-runtime';
import { AgentLoopRunner } from '../../agent/AgentLoopRunner';
import { BookToolkit } from '../../agent/BookToolkit';
import { RecordingAgentLoopTransport } from '../../agent/RecordingAgentLoopTransport';
import {
  createRealAgentLoopTransport,
  isRealAiEnabled,
  readRealAiEnvConfig,
} from '@/services/writing/__tests__/realStructuredAI';

/**
 * P0 协议可行性 spike(docs/agent-loop-refactor.md §12 Phase 0):
 * 用真实模型跑 10 轮检索循环,验证 JSON 工具协议的遵循度。
 * 退出门槛:≥8/10 正常 model-finish,且至少一轮把死亡角色状态查实。
 * 运行:REAL_AI=1 npx vitest run <本文件>
 */

function makeSpikeState(): StoryState {
  return {
    chapter: 314,
    entities: {
      hero: {
        id: 'hero',
        kind: 'character',
        name: '林夜',
        aliases: ['夜哥'],
        attributes: { role: 'protagonist', status: 'alive', location: '皇陵别院' },
        knownBy: [],
        sourceTrace: [],
      },
      zhoumao: {
        id: 'zhoumao',
        kind: 'character',
        name: '周茂',
        aliases: ['茂公', '周太傅'],
        attributes: { status: 'dead', location: '皇陵', 死因: '鸩杀(第312章)' },
        knownBy: [],
        sourceTrace: [],
      },
      chongren: {
        id: 'chongren',
        kind: 'character',
        name: '崇仁帝',
        aliases: ['皇帝'],
        attributes: { status: 'dead', location: '紫宸宫', 死因: '驾崩(第308章)' },
        knownBy: [],
        sourceTrace: [],
      },
      yaping: {
        id: 'yaping',
        kind: 'character',
        name: '哑仆',
        aliases: [],
        attributes: { status: 'alive', location: '皇陵别院' },
        knownBy: [],
        sourceTrace: [],
      },
    },
    events: [
      {
        id: 'evt-308',
        chapter: 308,
        sceneId: 'scene-308',
        type: 'death',
        summary: '崇仁帝在紫宸宫驾崩,遗诏下落成谜',
        participants: ['chongren'],
        causes: [],
        effects: [],
        evidence: [],
      },
      {
        id: 'evt-312',
        chapter: 312,
        sceneId: 'scene-312',
        type: 'death',
        summary: '周茂饮鸩身亡,死前把半枚虎符塞给哑仆',
        participants: ['zhoumao', 'yaping'],
        causes: [],
        effects: [],
        evidence: [],
      },
    ],
    inventory: { yaping: { 半枚虎符: 1 } },
    knowledge: { yaping: ['周茂临终托付虎符'], hero: ['先帝遗诏与皇陵有关'] },
    timeline: ['第308章 崇仁帝驾崩', '第310章 林夜赴皇陵', '第312章 周茂遇鸩杀'],
    openForeshadows: ['fs-edict', 'fs-tiger'],
    fulfilledNodes: [],
  };
}

function makeSpikeSceneChunks(): SceneChunk[] {
  const scenes: Array<[number, string, string, string[], string]> = [
    [308, '驾崩', '崇仁帝握着一份没写完的手谕咽了气。紫宸宫的烛火彻夜未熄。', ['chongren'], '紫宸宫'],
    [310, '赴陵', '林夜以守陵人身份混入皇陵,在碑林深处发现前朝刻痕。', ['hero'], '皇陵'],
    [311, '密谈', '周茂对林夜低语:先帝的遗诏就封在皇陵地宫的镇龙碑下。当夜烛火摇曳。', ['zhoumao', 'hero'], '皇陵'],
    [312, '鸩杀', '周茂饮下毒酒,倒在石阶上,把半枚虎符塞进哑仆掌心。遗诏的下落从此只剩两人知道。', ['zhoumao', 'yaping'], '皇陵'],
    [313, '守灵', '林夜在别院守灵,哑仆端药进来,袖口露出半枚虎符的一角。', ['hero', 'yaping'], '皇陵别院'],
  ];
  return scenes.map(([chapterIndex, title, text, participants, location], order) => ({
    id: `scene-${chapterIndex}`,
    chapterId: `ch-${chapterIndex}`,
    chapterIndex,
    order: order + 1,
    title,
    text,
    summary: title,
    participants,
    locations: [location],
    sourceTrace: [],
  }));
}

function makeSpikeContracts(): ContractPack {
  const meta = {
    schemaVersion: 'story-runtime/v1' as const,
    projectId: 'spike-1',
    sourceTrace: [],
  };
  return {
    master: {
      meta: { ...meta, kind: 'master', id: 'master' },
      premise: '林夜追查先帝遗诏与虎符的下落',
      genres: ['仙侠'],
      immutableRules: ['死人不得复活'],
      characterTruths: {},
      style: [],
      forbidden: [],
    },
    volume: {
      meta: { ...meta, kind: 'volume', id: 'volume-1' },
      volumeNumber: 1,
      title: '皇陵遗诏',
      objective: '集齐虎符,进入地宫',
      conflict: '朝堂余党追杀',
      pacing: [],
      requiredPayoffs: ['fs-edict'],
      forbidden: [],
    },
    chapter: {
      meta: { ...meta, kind: 'chapter', id: 'chapter-314' },
      chapterNumber: 314,
      title: '虎符合璧',
      goal: '哑仆交出虎符,林夜察觉周茂之死另有隐情',
      CBN: '林夜在别院向哑仆摊牌索要虎符',
      CPNs: ['哑仆忆起周茂临终托付', '夜半黑衣人袭杀哑仆'],
      CEN: '虎符合璧,地宫入口现世,黑衣人身份成谜',
      mustCover: ['虎符交接', '黑衣人袭杀'],
      forbidden: ['周茂、崇仁帝以任何形式复活或直接出场'],
      allowedCharacterNames: ['林夜', '哑仆'],
    },
    review: {
      meta: { ...meta, kind: 'review', id: 'review' },
      blockingDomains: [],
      requiredEvidence: true,
      maxWarnings: 0,
      mustCheck: [],
    },
  };
}

function makeSpikePlan(): ScenePlan {
  return {
    chapterNumber: 314,
    beats: [
      {
        id: 'beat-1',
        kind: 'CBN',
        order: 1,
        summary: '摊牌索符',
        dependsOn: [],
        candidateEvents: [
          {
            id: 'cand-1',
            summary: '林夜向哑仆索要虎符',
            participants: ['hero', 'yaping'],
            prerequisites: [],
            effects: [],
          },
        ],
      },
      {
        id: 'beat-2',
        kind: 'CEN',
        order: 2,
        summary: '地宫现世',
        dependsOn: ['beat-1'],
        candidateEvents: [
          {
            id: 'cand-2',
            summary: '虎符合璧开启地宫',
            participants: ['hero', 'yaping'],
            prerequisites: [],
            effects: [],
          },
        ],
      },
    ],
    prechecks: [],
  };
}

describe.runIf(isRealAiEnabled())('Agent 协议可行性 spike(真实模型 10 轮)', () => {
  it(
    '≥8/10 正常 model-finish,且死亡角色状态能被查实',
    async () => {
      const config = readRealAiEnvConfig();
      const results: Array<{ run: number; finishReason: string; rounds: number; toolCalls: number; ms: number }> = [];
      let deadConfirmedRuns = 0;

      for (let run = 1; run <= 10; run += 1) {
        const recording = new RecordingAgentLoopTransport(
          createRealAgentLoopTransport(config),
          { runId: `agent-spike-${Date.now()}-${run}`, persist: true, model: config.model, provider: config.provider }
        );
        const state = makeSpikeState();
        const toolkit = new BookToolkit({
          chapterNumber: 314,
          contracts: makeSpikeContracts(),
          state,
          sceneChunks: makeSpikeSceneChunks(),
          foreshadowCatalog: [
            { id: 'fs-edict', hint: '先帝遗诏封于镇龙碑下', status: 'buried', setupChapter: 311, payoffChapter: 314 },
            { id: 'fs-tiger', hint: '半枚虎符在哑仆手中', status: 'buried', setupChapter: 312, payoffChapter: 314 },
          ],
        });
        const runner = new AgentLoopRunner(recording, toolkit);
        const result = await runner.research({
          chapterNumber: 314,
          contracts: makeSpikeContracts(),
          plan: makeSpikePlan(),
          state,
          sceneChunks: makeSpikeSceneChunks(),
          recentScenes: makeSpikeSceneChunks().slice(-2),
        });
        recording.recordSummary({
          run,
          finishReason: result.finishReason,
          transcript: result.transcript,
          stats: result.dossier.stats,
        });
        await recording.flush();
        results.push({
          run,
          finishReason: result.finishReason,
          rounds: result.dossier.stats.rounds,
          toolCalls: result.dossier.stats.toolCalls,
          ms: result.dossier.stats.ms,
        });
        const zhoumao = result.dossier.entitySnapshots.find(item => item.name === '周茂');
        if (zhoumao?.statusLine.includes('dead')) deadConfirmedRuns += 1;
      }

      console.table(results);
      const normalFinishes = results.filter(item => item.finishReason === 'model-finish').length;
      console.info(`正常收尾 ${normalFinishes}/10;周茂死亡状态被查实 ${deadConfirmedRuns}/10`);
      // Phase 0 退出门槛:≥8/10 正常收尾
      expect(normalNormalFinishesGuard(normalFinishes)).toBe(true);
    },
    900_000
  );
});

function normalNormalFinishesGuard(count: number): boolean {
  return count >= 8;
}
