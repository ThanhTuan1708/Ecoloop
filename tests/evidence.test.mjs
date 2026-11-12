import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createApp } from '../server/app.mjs';

const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
const hash='0x'+createHash('sha256').update(image).digest('hex');
const contract='0x1111111111111111111111111111111111111111';
test('evidence uses signed single-use challenges, verifies image hash, enforces owner/collector access and persists',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ecoloop-evidence-'));
  const artifact=JSON.parse(await fs.readFile('artifacts/EcoLoop.json','utf8'));
  const owner=privateKeyToAccount(generatePrivateKey());const other=privateKeyToAccount(generatePrivateKey());let collector=false;
  // Test the storage/auth boundary independently; EVM role checks are tested by contract tests.
  const client={getChainId:async()=>43113,getCode:async()=>artifact.runtimeBytecode,readContract:async()=>collector};
  let server=await createApp({dataDir:dir,client});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let url='http://127.0.0.1:'+server.address().port;
  const post=(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  async function auth(account,action,digest=hash){const identity={account:account.address,contract,hash:digest,action};const response=await post('/api/evidence/challenge',identity);assert.equal(response.status,200);const challenge=await response.json();return {...identity,nonce:challenge.nonce,signature:await account.signMessage({message:challenge.message})};}
  try{
    const upload=await auth(owner,'upload');
    const headers={'Content-Type':'image/png','X-EcoLoop-Auth':Buffer.from(JSON.stringify(upload)).toString('base64')};
    const uploaded=await fetch(url+'/api/evidence/upload',{method:'POST',headers,body:image});assert.equal(uploaded.status,201);
    const replay=await fetch(url+'/api/evidence/upload',{method:'POST',headers,body:image});assert.equal(replay.status,401);
    const ownerRead=await post('/api/evidence/read',await auth(owner,'read'));assert.equal(ownerRead.status,200);assert.deepEqual(Buffer.from(await ownerRead.arrayBuffer()),image);
    const denied=await post('/api/evidence/read',await auth(other,'read'));assert.equal(denied.status,403);
    collector=true;const collectorRead=await post('/api/evidence/read',await auth(other,'read'));assert.equal(collectorRead.status,200);
    const tampered=await auth(owner,'read');tampered.hash='0x'+'2'.repeat(64);assert.equal((await post('/api/evidence/read',tampered)).status,401);
    const wrongHash=await auth(owner,'upload','0x'+'3'.repeat(64));const mismatch=await fetch(url+'/api/evidence/upload',{method:'POST',headers:{'X-EcoLoop-Auth':Buffer.from(JSON.stringify(wrongHash)).toString('base64')},body:image});assert.equal(mismatch.status,400);
    const csrf=await fetch(url+'/api/evidence/challenge',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:JSON.stringify({account:owner.address,contract,hash,action:'read'})});assert.equal(csrf.status,403);
    await new Promise(resolve=>server.close(resolve));server=await createApp({dataDir:dir,client});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port;
    const afterRestart=await post('/api/evidence/read',await auth(owner,'read'));assert.equal(afterRestart.status,200);assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()),image);
  }finally{await new Promise(resolve=>server.close(resolve));assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()),'ecoloop-evidence-')));await fs.rm(dir,{recursive:true,force:true});}
});
