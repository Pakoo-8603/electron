import { EventEmitter } from 'node:events';
import { HikvisionClient } from './hikvisionClient';

interface AlertStreamEvents {
  event: [payload: string];
  status: [status: 'connected' | 'disconnected', error?: string];
}

export class AlertStreamClient extends EventEmitter {
  private running = false;
  private reconnectAttempt = 0;
  private lastChunkAt = 0;

  constructor(private readonly client: HikvisionClient, private readonly timeoutMs = 20000) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connectLoop();
  }

  stop(): void {
    this.running = false;
  }

  private async connectLoop(): Promise<void> {
    while (this.running) {
      try {
        const response = await this.client.openAlertStream();
        if (!response.ok || !response.body) throw new Error(`Stream failed with ${response.status}`);
        this.emit('status', 'connected');
        this.reconnectAttempt = 0;
        const contentType = response.headers.get('content-type') || '';
        const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
        const boundary = boundaryMatch?.[1]?.replace(/"/g, '') || '--boundary';
        await this.consumeMultipart(response.body, boundary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit('status', 'disconnected', message);
        await this.sleep(this.backoffMs());
      }
    }
  }

  private async consumeMultipart(stream: ReadableStream<Uint8Array>, boundary: string): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const delimiter = `--${boundary.replace(/^--/, '')}`;
    this.lastChunkAt = Date.now();

    while (this.running) {
      const timedOut = Date.now() - this.lastChunkAt > this.timeoutMs;
      if (timedOut) throw new Error('Stream timeout without data');
      const { done, value } = await Promise.race([
        reader.read(),
        this.sleep(1000).then(() => ({ done: false, value: undefined }))
      ] as const);

      if (done) throw new Error('Stream closed by remote');
      if (!value) continue;
      this.lastChunkAt = Date.now();
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf(delimiter);
      while (idx >= 0) {
        const nextIdx = buffer.indexOf(delimiter, idx + delimiter.length);
        if (nextIdx < 0) break;
        const part = buffer.slice(idx + delimiter.length, nextIdx);
        const payloadIdx = part.indexOf('\r\n\r\n');
        if (payloadIdx > -1) {
          const payload = part.slice(payloadIdx + 4).trim();
          if (payload) this.emit('event', payload);
        }
        buffer = buffer.slice(nextIdx);
        idx = buffer.indexOf(delimiter);
      }
    }
    await reader.cancel();
  }

  private backoffMs(): number {
    const base = Math.min(30000, 1000 * 2 ** this.reconnectAttempt++);
    return base + Math.floor(Math.random() * 500);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export interface AlertStreamClient {
  on<U extends keyof AlertStreamEvents>(event: U, listener: (...args: AlertStreamEvents[U]) => void): this;
  emit<U extends keyof AlertStreamEvents>(event: U, ...args: AlertStreamEvents[U]): boolean;
}
