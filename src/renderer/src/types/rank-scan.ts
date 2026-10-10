/**
 * 题材雷达的公开榜单契约。
 *
 * 主进程只抽取书名、作者、题材、字数等字段；风口判断交给洞察模型。
 * 渲染进程经 preload 的 rank:scan 取得结果，不直接抓取页面。
 */

import type { TopicAudience, TopicLength, TopicPlatform } from './topic-discovery';

/** 有采集实现或明确不采集原因的站点 */
export type RankSite = 'qidian' | 'fanqie' | 'jinjiang' | 'qimao' | 'zhihu';

/** 榜单页自己标明的频道；不从题材名推断男女频 */
export type RankChannel = 'male' | 'female' | 'mixed' | 'unknown';

export type RankBoardStatus = 'ok' | 'empty' | 'http-error' | 'parse-error' | 'unsupported';

/** 给界面映射文案的原因码，不是直接展示的句子 */
export type RankBoardReason =
  | 'font-obfuscated'
  | 'no-public-page'
  | 'http'
  | 'parse'
  | 'empty'
  | 'timeout';

/** 渲染侧拿不到采集通道，或 invoke 本身失败 */
export type RankScanFailure = 'no-channel' | 'invoke-failed';

/** 一条榜单样本。字段都来自页面原文裁剪，不含热度结论 */
export interface RankEntry {
  rank: number;
  title: string;
  author: string;
  genre: string;
  tags: string[];
  wordCount: string;
  blurb: string;
}

/** 一块榜的采集结果 */
export interface RankBoardSample {
  site: RankSite;
  boardId: string;
  channel: RankChannel;
  status: RankBoardStatus;
  entries: RankEntry[];
  reasonCode?: RankBoardReason;
}

/** 一次扫榜的全部样本 */
export interface RankScanResult {
  availability: 'live' | 'unavailable';
  fetchedAt: string;
  sampleCount: number;
  boards: RankBoardSample[];
  failure?: RankScanFailure;
}

/** 雷达刷新时交给主进程的筛选，平台枚举与开题中心一致 */
export interface RankScanRequest {
  platform?: TopicPlatform;
  audience?: TopicAudience;
  length?: TopicLength;
}
