import Fastify, { type FastifyInstance } from 'fastify';
import { normalizeEvent } from '../../shared/schema.js';
import type { GatewaySettings, NormalizedEvent } from '../../shared/types.js';

interface ListenerOptions {
  settings: GatewaySettings;
  onEvent: (event: NormalizedEvent) => void;
}

export class HttpListenerServer {
  private server: FastifyInstance;

  constructor(private readonly options: ListenerOptions) {
    this.server = Fastify({ logger: false });
    this.server.addContentTypeParser('*', { parseAs: 'buffer' }, (_, body, done) => done(null, body));

    this.server.post('/hikvision/events/:deviceId', async (request, reply) => {
      const body = request.body as Buffer;
      const deviceId = (request.params as { deviceId: string }).deviceId;
      const payload = body.toString('utf8');
      const event = normalizeEvent(deviceId, this.options.settings.siteId, payload);
      this.options.onEvent(event);
      reply.code(200).send({ ok: true });
    });
  }

  async start() {
    await this.server.listen({ host: '0.0.0.0', port: this.options.settings.listenerPort });
  }

  async stop() {
    await this.server.close();
  }
}
