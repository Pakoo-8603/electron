import path from 'node:path';
import pino from 'pino';
import { app } from 'electron';

const logDir = path.join(app.getPath('userData'), 'logs');

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined
}, pino.destination({
  dest: path.join(logDir, 'gateway.log'),
  mkdir: true,
  sync: false
}));
