import express from 'express';
import { createServer, Server } from 'node:http';

type EventHandler = (payload: string, sourceIp?: string) => Promise<void>;

export class HttpListenerServer {
  private readonly app = express();
  private server?: Server;

  constructor(private readonly onEvent: EventHandler) {
    this.app.use(express.text({ type: '*/*', limit: '10mb' }));

    this.app.post('/hikvision/events', async (req, res) => {
      try {
        await this.onEvent(req.body || '', req.ip);
        res.status(202).send('accepted');
      } catch {
        res.status(500).send('error');
      }
    });

    this.app.get('/health', (_req, res) => res.json({ ok: true }));
  }

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer(this.app).listen(port, '0.0.0.0', () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
