/**
 * 只读书籍工具集：把状态库/场景块/合同/伏笔目录暴露为 agent 循环的六个查询工具。
 * 约束：全部工具无副作用；是 WriterToolkit / OutlineToolkit 的只读基座（经 CompositeToolkit 组合）。
 */
import type {
  ContractPack,
  SceneChunk,
  StoryEntity,
  StoryEvent,
  StoryState,
} from '@/types/story-runtime';

import {
  clipText as clip,
  isPlainObject,
  readIntArg as readInt,
  readStringArg as readString,
  type AgentToolkit,
  type ToolCallResult,
  type ToolDescriptor,
} from './AgentToolkit';

/** 伏笔目录条目（管线把 project.foreshadows 投影进来；缺省时仅用状态库 openForeshadows） */
export interface ToolkitForeshadowEntry {
  id: string;
  hint: string;
  status: string;
  setupChapter?: number;
  payoffChapter?: number;
}

/** FTS 场景检索端口：生产走 StoryRuntimeClient.searchScenes（SQLite FTS5），测试可注入假实现 */
export interface AgentSceneSearchPort {
  search(query: string, limit: number, beforeChapter?: number): Promise<SceneChunk[]>;
}

export interface BookToolkitInput {
  chapterNumber: number;
  contracts: ContractPack;
  state: StoryState;
  /** 全书已提交场景块（内存）；read_chapter/search_scenes(降级) 的数据源 */
  sceneChunks: SceneChunk[];
  foreshadowCatalog?: ToolkitForeshadowEntry[];
  /** 缺省时 search_scenes 退化为内存词面匹配 */
  searchPort?: AgentSceneSearchPort;
}

/**
 * 只读书籍工具集（docs/agent-loop-refactor.md §4.2）：把书籍结构化数据
 * （状态库/场景块/合同/伏笔目录）暴露为 agent 循环的查询工具。
 * 全部工具无副作用，表驱动注册——新增工具零改动循环器。
 */
export class BookToolkit implements AgentToolkit {
  constructor(private readonly input: BookToolkitInput) {}

  listTools(): ToolDescriptor[] {
    return [
      {
        name: 'query_entity',
        description: '查实体当前状态:人物/地点/势力的身份、生死/位置/境界等属性、已知信息、持有物、最近相关事件。name 支持别名。',
        args: '{"name":"角色名或别名"}',
      },
      {
        name: 'search_scenes',
        description: '全文检索已提交的场景块,返回章号+标题+摘要+片段。用于定位某件事/某句台词出现在哪一章。',
        args: '{"query":"关键词或短语","k":5,"beforeChapter":311}',
      },
      {
        name: 'read_chapter',
        description: '读指定章的正文片段:默认章首+章尾;给 focus 关键词时返回命中窗口。',
        args: '{"chapterNumber":312,"focus":"关键词"}',
      },
      {
        name: 'list_foreshadows',
        description: '查伏笔清单与状态。filter=open(未回收)/due(已到回收时点)缺省为全部。',
        args: '{"filter":"due"}',
      },
      {
        name: 'query_timeline',
        description: '查时间线:缺省返回最近条目;给 character 时过滤该角色参与的事件。',
        args: '{"character":"林夜","lastN":10}',
      },
      {
        name: 'get_contract',
        description: '查本章/本卷合同原文:CBN/CPNs/CEN/mustCover/禁区/卷目标。',
        args: '{}',
      },
    ];
  }

  has(tool: string): boolean {
    return this.toolNames().includes(tool);
  }

  toolNames(): string[] {
    return this.listTools().map(tool => tool.name);
  }

  async call(tool: string, args: unknown): Promise<ToolCallResult> {
    if (!isPlainObject(args)) {
      return { ok: false, error: `args 必须是 JSON 对象,收到:${typeof args}` };
    }
    switch (tool) {
      case 'query_entity':
        return this.queryEntity(args);
      case 'search_scenes':
        return this.searchScenes(args);
      case 'read_chapter':
        return this.readChapter(args);
      case 'list_foreshadows':
        return this.listForeshadows(args);
      case 'query_timeline':
        return this.queryTimeline(args);
      case 'get_contract':
        return this.getContract();
      default:
        return { ok: false, error: `未知工具:${tool}。可用:${this.toolNames().join('/')}` };
    }
  }

  /** 按名字/别名解析实体:先精确命中,再包含匹配;找不到给近似建议 */
  private resolveEntity(name: string): StoryEntity | undefined {
    const entities = Object.values(this.input.state.entities);
    return (
      entities.find(
        entity => entity.name === name || (entity.aliases ?? []).includes(name)
      ) ??
      entities.find(
        entity =>
          entity.name.includes(name) ||
          (entity.aliases ?? []).some(alias => alias.includes(name))
      )
    );
  }

  private queryEntity(args: Record<string, unknown>): ToolCallResult {
    const name = readString(args, 'name');
    if (!name) return { ok: false, error: 'args.name 必须是非空字符串' };
    const entity = this.resolveEntity(name);
    if (!entity) {
      const suggestions = Object.values(this.input.state.entities)
        .filter(item => item.kind === 'character')
        .map(item => item.name)
        .slice(0, 8);
      return {
        ok: false,
        error: `未找到实体:${name}。相近的已登记角色:${suggestions.join('、') || '(无)'}`,
      };
    }
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity.attributes ?? {})) {
      attributes[key] = typeof value === 'string' ? clip(value, 80) : value;
    }
    const relatedEvents = this.input.state.events
      .filter(event => event.participants.includes(entity.id))
      .sort((a, b) => b.chapter - a.chapter)
      .slice(0, 3)
      .map(event => ({ chapter: event.chapter, type: event.type, summary: clip(event.summary, 100) }));
    return {
      ok: true,
      result: {
        id: entity.id,
        kind: entity.kind,
        name: entity.name,
        aliases: (entity.aliases ?? []).slice(0, 6),
        attributes,
        knowledge: (this.input.state.knowledge[entity.id] ?? []).slice(-8),
        inventory: this.input.state.inventory[entity.id] ?? {},
        recentEvents: relatedEvents,
      },
    };
  }

  private splitTerms(query: string): string[] {
    return query
      .split(/[^\p{Script=Han}a-zA-Z0-9]+/u)
      .map(term => term.trim())
      .filter(term => term.length >= 2)
      .slice(0, 6);
  }

  private async searchScenes(args: Record<string, unknown>): Promise<ToolCallResult> {
    const query = readString(args, 'query');
    if (!query) return { ok: false, error: 'args.query 必须是非空字符串' };
    const k = readInt(args, 'k', 5, 1, 8);
    const beforeChapter = Number(args.beforeChapter);
    const before =
      Number.isFinite(beforeChapter) && beforeChapter > 0
        ? beforeChapter
        : undefined;

    let chunks: SceneChunk[];
    if (this.input.searchPort) {
      chunks = await this.input.searchPort.search(query, k, before);
    } else {
      // 内存降级:词面计分(无 FTS 时保底,不阻塞循环)
      const terms = this.splitTerms(query);
      chunks = this.input.sceneChunks
        .filter(chunk => (before ? chunk.chapterIndex < before : true))
        .map(chunk => {
          const haystack = `${chunk.title}\n${chunk.summary ?? ''}\n${chunk.text}`;
          const score = terms.reduce(
            (total, term) => total + haystack.split(term).length - 1,
            0
          );
          return { chunk, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(item => item.chunk);
    }

    if (chunks.length === 0) {
      return { ok: false, error: `无命中场景:${clip(query, 40)}。可换关键词或用 read_chapter 直接读章。` };
    }
    const terms = this.splitTerms(query);
    return {
      ok: true,
      result: chunks.map(chunk => {
        const firstTerm = terms.find(term => chunk.text.includes(term));
        const hitIndex = firstTerm ? chunk.text.indexOf(firstTerm) : -1;
        const snippet =
          hitIndex >= 0
            ? clip(chunk.text.slice(Math.max(0, hitIndex - 60), hitIndex + 120), 180)
            : clip(chunk.text.slice(0, 150), 160);
        return {
          chapterIndex: chunk.chapterIndex,
          title: chunk.title,
          summary: chunk.summary ? clip(chunk.summary, 120) : undefined,
          snippet,
        };
      }),
    };
  }

  private readChapter(args: Record<string, unknown>): ToolCallResult {
    const chapterNumber = Number(args.chapterNumber);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return { ok: false, error: 'args.chapterNumber 必须是正整数' };
    }
    const focus = readString(args, 'focus');
    const chunks = this.input.sceneChunks
      .filter(chunk => chunk.chapterIndex === chapterNumber)
      .sort((a, b) => a.order - b.order);
    if (chunks.length === 0) {
      const maxChapter = this.input.sceneChunks.reduce(
        (max, chunk) => Math.max(max, chunk.chapterIndex),
        0
      );
      return {
        ok: false,
        error: `第 ${chapterNumber} 章无已提交场景块(已提交范围 1..${maxChapter})`,
      };
    }
    const text = chunks.map(chunk => chunk.text).join('\n');
    let excerpt: string;
    if (focus) {
      const windows: string[] = [];
      let searchFrom = 0;
      for (const term of this.splitTerms(focus).length > 0 ? this.splitTerms(focus) : [focus]) {
        const index = text.indexOf(term, searchFrom);
        if (index >= 0) {
          windows.push(clip(text.slice(Math.max(0, index - 80), index + 140), 220));
          searchFrom = index + term.length;
        }
        if (windows.length >= 3) break;
      }
      excerpt =
        windows.length > 0
          ? windows.join('\n……\n')
          : clip(`${text.slice(0, 200)}\n……\n${text.slice(-200)}`, 640);
    } else {
      excerpt = clip(`${text.slice(0, 200)}\n……\n${text.slice(-200)}`, 640);
    }
    const truncated = excerpt.length >= 640 || excerpt.endsWith('…');
    return { ok: true, result: { chapter: chapterNumber, excerpt }, truncated };
  }

  private listForeshadows(args: Record<string, unknown>): ToolCallResult {
    const filter = readString(args, 'filter');
    const catalog: ToolkitForeshadowEntry[] = [...(this.input.foreshadowCatalog ?? [])];
    // 状态库 openForeshadows 中目录未覆盖的 id 补一条占位(至少让模型知道 id 存在)
    for (const id of this.input.state.openForeshadows) {
      if (!catalog.some(entry => entry.id === id)) {
        catalog.push({ id, hint: '(状态库未回收伏笔,目录无词面)', status: 'open' });
      }
    }
    let entries = catalog;
    if (filter === 'open') {
      entries = entries.filter(entry => entry.status !== 'resolved');
    } else if (filter === 'due') {
      entries = entries.filter(
        entry =>
          entry.status !== 'resolved' &&
          typeof entry.payoffChapter === 'number' &&
          entry.payoffChapter <= this.input.chapterNumber
      );
    }
    if (entries.length === 0) {
      return { ok: true, result: [] };
    }
    return {
      ok: true,
      result: entries.slice(0, 12).map(entry => ({
        id: entry.id,
        hint: clip(entry.hint, 80),
        status: entry.status,
        setupChapter: entry.setupChapter,
        payoffChapter: entry.payoffChapter,
        note:
          typeof entry.payoffChapter === 'number' && entry.payoffChapter <= this.input.chapterNumber
            ? `已到回收时点(第${entry.payoffChapter}章)`
            : undefined,
      })),
    };
  }

  private queryTimeline(args: Record<string, unknown>): ToolCallResult {
    const lastN = readInt(args, 'lastN', 10, 1, 20);
    const character = readString(args, 'character');
    if (!character) {
      return { ok: true, result: this.input.state.timeline.slice(-lastN) };
    }
    const entity = this.resolveEntity(character);
    if (!entity) {
      return { ok: false, error: `未找到实体:${character}(query_timeline 按 participant id 过滤)` };
    }
    const events: StoryEvent[] = this.input.state.events
      .filter(event => event.participants.includes(entity.id))
      .sort((a, b) => b.chapter - a.chapter)
      .slice(0, lastN);
    return {
      ok: true,
      result: events.map(event => `第${event.chapter}章 ${event.type}:${clip(event.summary, 80)}`),
    };
  }

  private getContract(): ToolCallResult {
    const { contracts } = this.input;
    return {
      ok: true,
      result: {
        volume: {
          volumeNumber: contracts.volume.volumeNumber,
          title: contracts.volume.title,
          objective: clip(contracts.volume.objective, 200),
          requiredPayoffs: contracts.volume.requiredPayoffs,
        },
        chapter: {
          chapterNumber: contracts.chapter.chapterNumber,
          title: contracts.chapter.title,
          goal: clip(contracts.chapter.goal, 200),
          CBN: contracts.chapter.CBN,
          CPNs: contracts.chapter.CPNs,
          CEN: contracts.chapter.CEN,
          mustCover: contracts.chapter.mustCover,
          forbidden: contracts.chapter.forbidden,
          timeAnchor: contracts.chapter.timeAnchor,
        },
      },
    };
  }
}
