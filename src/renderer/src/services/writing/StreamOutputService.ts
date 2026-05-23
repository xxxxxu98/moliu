/**
 * Stream 输出服务
 * 支持流式输出、实时预览、进度追踪
 */

import { ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface StreamConfig {
  /** 块大小（字符数） */
  chunkSize: number;
  /** 是否显示光标 */
  showCursor: boolean;
  /** 光标字符 */
  cursorChar: string;
  /** 是否自动滚动 */
  autoScroll: boolean;
  /** 打字速度（毫秒/字符） */
  typingSpeed: number;
}

export interface StreamState {
  content: string;
  isStreaming: boolean;
  isPaused: boolean;
  progress: number;
  charCount: number;
  estimatedTimeRemaining?: number;
}

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  onComplete?: (content: string) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
}

// ============================================================
// Stream 输出服务
// ============================================================

export class StreamOutputService {
  private config: StreamConfig;
  private content = ref('');
  private isStreaming = ref(false);
  private isPaused = ref(false);
  private progress = ref(0);
  private charCount = ref(0);
  private callbacks: StreamCallbacks = {};
  private abortController: AbortController | null = null;
  private streamingTask: Promise<void> | null = null;

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = {
      chunkSize: 10,
      showCursor: true,
      cursorChar: '▋',
      autoScroll: true,
      typingSpeed: 0,
      ...config,
    };
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: StreamCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 开始流式输出
   */
  async start(fullContent: string): Promise<string> {
    if (this.isStreaming.value) {
      throw new Error('Already streaming');
    }

    this.isStreaming.value = true;
    this.isPaused.value = false;
    this.progress.value = 0;
    this.charCount.value = 0;
    this.content.value = '';
    this.abortController = new AbortController();

    try {
      // 分块处理
      const chunks = this.splitIntoChunks(fullContent);
      const totalChunks = chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        // 检查是否暂停
        while (this.isPaused.value) {
          await this.sleep(100);
          if (this.abortController?.signal.aborted) {
            throw new Error('Stream aborted');
          }
        }

        // 检查是否停止
        if (this.abortController?.signal.aborted) {
          throw new Error('Stream aborted');
        }

        const chunk = chunks[i];
        
        // 添加内容
        if (this.config.typingSpeed > 0) {
          // 打字机效果
          await this.typeChunk(chunk);
        } else {
          // 直接添加
          this.content.value += chunk;
        }
        
        this.charCount.value += chunk.length;
        this.progress.value = Math.round(((i + 1) / totalChunks) * 100);

        // 回调
        this.callbacks.onChunk?.(chunk);
        this.callbacks.onProgress?.(this.progress.value);
      }

      this.callbacks.onComplete?.(this.content.value);
      return this.content.value;
    } catch (error) {
      this.callbacks.onError?.(String(error));
      throw error;
    } finally {
      this.isStreaming.value = false;
    }
  }

  /**
   * 从 AI 流式响应开始
   */
  async startFromAIStream(
    aiStream: AsyncIterable<string> | ReadableStream<string>
  ): Promise<string> {
    if (this.isStreaming.value) {
      throw new Error('Already streaming');
    }

    this.isStreaming.value = true;
    this.isPaused.value = false;
    this.progress.value = 0;
    this.charCount.value = 0;
    this.content.value = '';
    this.abortController = new AbortController();

    try {
      let buffer = '';

      for await (const chunk of aiStream) {
        // 检查是否停止
        if (this.abortController?.signal.aborted) {
          break;
        }

        // 检查是否暂停
        while (this.isPaused.value) {
          await this.sleep(100);
          if (this.abortController?.signal.aborted) {
            break;
          }
        }

        buffer += chunk;

        // 当缓冲区足够大或到达末尾时输出
        if (buffer.length >= this.config.chunkSize || chunk === '') {
          if (buffer.length > 0) {
            this.content.value += buffer;
            this.charCount.value += buffer.length;
            this.callbacks.onChunk?.(buffer);
            buffer = '';
          }
        }
      }

      // 输出剩余内容
      if (buffer.length > 0) {
        this.content.value += buffer;
        this.charCount.value += buffer.length;
        this.callbacks.onChunk?.(buffer);
      }

      this.callbacks.onComplete?.(this.content.value);
      return this.content.value;
    } catch (error) {
      this.callbacks.onError?.(String(error));
      throw error;
    } finally {
      this.isStreaming.value = false;
    }
  }

  /**
   * 暂停
   */
  pause(): void {
    if (this.isStreaming.value) {
      this.isPaused.value = true;
    }
  }

  /**
   * 恢复
   */
  resume(): void {
    if (this.isStreaming.value && this.isPaused.value) {
      this.isPaused.value = false;
    }
  }

  /**
   * 停止
   */
  stop(): void {
    this.abortController?.abort();
    this.isStreaming.value = false;
    this.isPaused.value = false;
  }

  /**
   * 获取状态
   */
  getState(): StreamState {
    return {
      content: this.content.value,
      isStreaming: this.isStreaming.value,
      isPaused: this.isPaused.value,
      progress: this.progress.value,
      charCount: this.charCount.value,
    };
  }

  /**
   * 获取内容
   */
  getContent(): string {
    return this.content.value;
  }

  /**
   * 清空
   */
  clear(): void {
    this.content.value = '';
    this.progress.value = 0;
    this.charCount.value = 0;
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private splitIntoChunks(content: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += this.config.chunkSize) {
      chunks.push(content.slice(i, i + this.config.chunkSize));
    }
    return chunks;
  }

  private async typeChunk(chunk: string): Promise<void> {
    for (const char of chunk) {
      // 检查暂停
      while (this.isPaused.value) {
        await this.sleep(100);
      }

      // 检查停止
      if (this.abortController?.signal.aborted) {
        break;
      }

      this.content.value += char;
      await this.sleep(this.config.typingSpeed);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Composable
// ============================================================

export function useStreamOutput(defaultConfig?: Partial<StreamConfig>) {
  const service = new StreamOutputService(defaultConfig);

  return {
    // 状态
    content: service['content'],
    isStreaming: service['isStreaming'],
    isPaused: service['isPaused'],
    progress: service['progress'],
    charCount: service['charCount'],

    // 方法
    start: service.start.bind(service),
    startFromAIStream: service.startFromAIStream.bind(service),
    pause: service.pause.bind(service),
    resume: service.resume.bind(service),
    stop: service.stop.bind(service),
    clear: service.clear.bind(service),
    getState: service.getState.bind(service),
    getContent: service.getContent.bind(service),
    setCallbacks: service.setCallbacks.bind(service),
  };
}

// ============================================================
// 导出
// ============================================================

export {
  StreamOutputService,
  type StreamConfig,
  type StreamState,
  type StreamCallbacks,
};
