import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv, scryptSync } from 'node:crypto';

import type { ProviderType } from '@/config/ai-providers';

export interface ContinueWriteRealConfig {
  enabled?: boolean;
  /** true：复用 App 默认模型（解密 %APPDATA%/moliu/moliu-settings.json） */
  useAppDefaultProvider?: boolean;
  /**
   * App 厂商配置 ID（设置页可复制）。
   * 填写后优先按该 ID 取已保存的 apiKey/model/baseUrl。
   */
  providerId?: string;
  apiKey?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  /** 输出上限（tokens）：正数才下发；0/未配置不下发（沿用策略：默认不传 max_tokens） */
  maxTokens?: number;
  projectId?: string;
  projectName?: string;
  chapterNumber?: number;
  /** 连续续写章数；默认 1。多章冒烟默认至少 3 */
  chapterCount?: number;
  emptyRewrite?: boolean;
  targetWordCount?: number;
}

export interface ResolvedRealAiConfig {
  provider: ProviderType;
  providerId?: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** 厂商输出上限（tokens）；正数才下发到请求，undefined = 不下发 */
  maxTokens?: number;
  projectId: string;
  projectName?: string;
  chapterNumber: number;
  chapterCount: number;
  emptyRewrite: boolean;
  targetWordCount: number;
  configPath: string;
}

const PROVIDER_SET = new Set<string>([
  'openai',
  'anthropic',
  'gemini',
  'moonshot',
  'deepseek',
  'ollama',
  'groq',
  'qwen',
  'mistral',
  'cohere',
  'nvidia',
  'perplexity',
  'together',
  'cerebras',
  'azure',
  'grok',
  'fireworks',
  'zhipu',
]);

const CONFIG_CANDIDATES = [
  'temp/continue-write.real.config.json',
  'continue-write.real.config.json',
];

function resolveConfigPath(): string | null {
  for (const relative of CONFIG_CANDIDATES) {
    const full = path.resolve(process.cwd(), relative);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function decryptStoredApiKey(apiKey: string): string {
  if (!apiKey) return '';
  const parts = apiKey.split(':');
  if (parts.length !== 3) return apiKey;
  try {
    const machineId = [
      process.env.COMPUTERNAME || process.env.HOSTNAME || 'default',
      process.env.USERNAME || process.env.USER || 'user',
      process.env.USERPROFILE || process.env.HOME || '/home',
    ].join('-');
    const key = scryptSync(machineId, 'moliu-ai-providers-v1', 32, {
      N: 2 ** 14,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(parts[2], 'base64', 'utf8') + decipher.final('utf8');
  } catch {
    return apiKey;
  }
}

function readAppProviders(): Array<{
  id: string;
  provider: string;
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  generationConfig?: { maxTokens?: number };
}> {
  const settingsPath = path.join(
    process.env.APPDATA || '',
    'moliu',
    'moliu-settings.json'
  );
  if (!fs.existsSync(settingsPath)) return [];
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
    aiProviders?: Array<{
      id: string;
      provider: string;
      modelName?: string;
      apiKey?: string;
      baseUrl?: string;
      enabled?: boolean;
      generationConfig?: { maxTokens?: number };
    }>;
  };
  return raw.aiProviders ?? [];
}

function readAppDefaultSelection(): { providerId?: string; modelName?: string } | null {
  const settingsPath = path.join(
    process.env.APPDATA || '',
    'moliu',
    'moliu-settings.json'
  );
  if (!fs.existsSync(settingsPath)) return null;
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
    settings?: { defaultModel?: { providerId?: string; modelName?: string } };
    defaultModel?: { providerId?: string; modelName?: string };
  };
  return raw.settings?.defaultModel ?? raw.defaultModel ?? null;
}

function resolveProviderFromApp(providerId?: string): {
  providerId: string;
  provider: ProviderType;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
} | null {
  const providers = readAppProviders();
  const selection = readAppDefaultSelection();
  const matched =
    (providerId
      ? providers.find(item => item.id === providerId && !!item.apiKey)
      : undefined) ??
    (selection?.providerId
      ? providers.find(
          item =>
            item.id === selection.providerId &&
            item.enabled !== false &&
            !!item.apiKey
        )
      : undefined) ??
    providers.find(item => item.enabled !== false && !!item.apiKey);
  if (!matched?.apiKey) return null;
  const providerRaw = (matched.provider || 'openai').toLowerCase();
  if (!PROVIDER_SET.has(providerRaw)) return null;
  return {
    providerId: matched.id,
    provider: providerRaw as ProviderType,
    apiKey: decryptStoredApiKey(matched.apiKey),
    model: matched.modelName || selection?.modelName,
    baseUrl: matched.baseUrl || undefined,
    maxTokens:
      typeof matched.generationConfig?.maxTokens === 'number' &&
      matched.generationConfig.maxTokens > 0
        ? Math.floor(matched.generationConfig.maxTokens)
        : undefined,
  };
}

export function loadContinueWriteRealConfigFile(): {
  config: ContinueWriteRealConfig;
  configPath: string;
} {
  const configPath = resolveConfigPath();
  if (!configPath) {
    throw new Error(
      '未找到配置文件。请复制 temp/continue-write.real.config.example.json 为 temp/continue-write.real.config.json 并填写。'
    );
  }
  const config = JSON.parse(
    fs.readFileSync(configPath, 'utf8')
  ) as ContinueWriteRealConfig;
  return { config, configPath };
}

/**
 * 解析真 AI 配置：配置文件优先，环境变量可覆盖单项。
 * providerId（或 MOLIU_AI_PROVIDER_ID）优先从 App 已保存配置取 Key。
 */
export function resolveContinueWriteRealConfig(): ResolvedRealAiConfig {
  const { config, configPath } = loadContinueWriteRealConfigFile();
  if (config.enabled === false) {
    throw new Error(`配置已禁用（enabled=false）：${path.basename(configPath)}`);
  }

  const providerId = (
    process.env.MOLIU_AI_PROVIDER_ID ||
    config.providerId ||
    ''
  ).trim();

  let provider = (process.env.MOLIU_AI_PROVIDER || config.provider || 'openai')
    .trim()
    .toLowerCase();
  let apiKey = (process.env.MOLIU_AI_API_KEY || config.apiKey || '').trim();
  let model = (process.env.MOLIU_AI_MODEL || config.model || '').trim() || undefined;
  let baseUrl =
    (process.env.MOLIU_AI_BASE_URL || config.baseUrl || '').trim() || undefined;
  /** 输出上限：环境变量 > 配置文件 > App 厂商配置；正数才生效（默认不下发） */
  let maxTokens: number | undefined = (() => {
    const fromEnv = Number(process.env.MOLIU_AI_MAX_TOKENS || '');
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return config.maxTokens && config.maxTokens > 0 ? Math.floor(config.maxTokens) : undefined;
  })();
  let resolvedProviderId: string | undefined = providerId || undefined;

  if (providerId) {
    const fromId = resolveProviderFromApp(providerId);
    if (!fromId) {
      throw new Error(
        `未在 App 设置中找到 providerId=${providerId}（或缺少 apiKey）。请打开设置 → AI 厂商配置核对 ID。`
      );
    }
    provider = fromId.provider;
    apiKey = fromId.apiKey;
    model = model || fromId.model;
    baseUrl = baseUrl || fromId.baseUrl;
    maxTokens = maxTokens || fromId.maxTokens;
    resolvedProviderId = fromId.providerId;
  } else {
    const useApp =
      config.useAppDefaultProvider !== false &&
      !(process.env.MOLIU_AI_API_KEY || '').trim() &&
      !(config.apiKey || '').trim();
    if (useApp || !apiKey) {
      const fromApp = resolveProviderFromApp();
      if (fromApp) {
        provider = fromApp.provider;
        apiKey = fromApp.apiKey;
        model = model || fromApp.model;
        baseUrl = baseUrl || fromApp.baseUrl;
        maxTokens = maxTokens || fromApp.maxTokens;
        resolvedProviderId = fromApp.providerId;
      }
    }
  }

  if (!apiKey) {
    throw new Error(
      `缺少 apiKey。请在 ${path.basename(configPath)} 填写 providerId（推荐）或 apiKey，或设 useAppDefaultProvider=true。`
    );
  }
  if (!PROVIDER_SET.has(provider)) {
    throw new Error(`不支持的 provider=${provider}`);
  }

  const targetFromEnv = Number(process.env.MOLIU_TARGET_WORDS || '');
  const targetWordCount = Number.isFinite(targetFromEnv) && targetFromEnv > 0
    ? targetFromEnv
    : config.targetWordCount && config.targetWordCount > 0
      ? config.targetWordCount
      : 3000;

  const chapterCountFromEnv = Number(process.env.MOLIU_CHAPTER_COUNT || '');
  const chapterCount =
    Number.isFinite(chapterCountFromEnv) && chapterCountFromEnv > 0
      ? Math.floor(chapterCountFromEnv)
      : config.chapterCount && config.chapterCount > 0
        ? Math.floor(config.chapterCount)
        : 1;

  return {
    provider: provider as ProviderType,
    providerId: resolvedProviderId,
    apiKey,
    model,
    baseUrl,
    maxTokens,
    projectId: (config.projectId || '').trim(),
    projectName: (config.projectName || '').trim(),
    chapterNumber: config.chapterNumber && config.chapterNumber > 0 ? config.chapterNumber : 1,
    chapterCount,
    emptyRewrite: config.emptyRewrite !== false,
    targetWordCount,
    configPath,
  };
}
