import { createApp } from '../server/app.mjs';
import path from 'node:path';

let appHandler;

export default async function handler(req, res) {
  try {
    if (!appHandler) {
      const server = await createApp({
        dataDir: process.env.DATA_DIR || '/tmp/.data',
        configFile: path.resolve('config/app.json'),
      });
      appHandler = server;
    }
    appHandler.emit('request', req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: err.message || 'Internal Server Error' }));
  }
}
