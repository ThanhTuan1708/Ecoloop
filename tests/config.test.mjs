import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';

test('shared configuration is identical for new browsers, reloads operator edits and omits contracts for another chain',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ecoloop-config-'));
  const file=path.join(dir,'app.json');
  const contract='0x1111111111111111111111111111111111111111';
  await fs.writeFile(file,JSON.stringify({chainId:43113,contract,collectionName:'Điểm A',collectionInstructions:'Hẹn trước.'}));
  const server=await createApp({dataDir:dir,configFile:file,client:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/config`;
  try {
    const chrome=await fetch(url).then(r=>r.json());
    const edge=await fetch(url).then(r=>r.json());
    assert.deepEqual(chrome,edge);assert.equal(chrome.contract,contract);
    assert.equal(chrome.collectionName,'Điểm A');
    await fs.writeFile(file,JSON.stringify({chainId:31337,contract}));
    assert.equal((await fetch(url).then(r=>r.json())).contract,null);
    await fs.writeFile(file,JSON.stringify({chainId:43113,contract:'invalid'}));
    assert.equal((await fetch(url)).status,503);
  } finally {await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});
