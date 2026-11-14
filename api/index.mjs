import { createApp } from '../server/app.mjs';
import config from '../config/app.json' with {type:'json'};
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let appHandler;

export default async function handler(req, res) {
  try {
    if (!appHandler) {
      appHandler = createApp({
        dataDir: process.env.DATA_DIR || join(tmpdir(),'ecoloop-data'),
        deploymentConfig: config,
      }).catch(error=>{
        appHandler=undefined;
        throw error;
      });
    }
    (await appHandler).emit('request', req, res);
  } catch (err) {
    console.error('EcoLoop API initialization failed',err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Không khởi động được API EcoLoop.' }));
  }
}
