import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createApp} from '../server/app.mjs';
const sha=bytes=>'0x'+createHash('sha256').update(bytes).digest('hex');
test('owner can restore a missing address across server instances with a single-use signature',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ecoloop-restore-'));
 const artifact=JSON.parse(await fs.readFile('artifacts/EcoLoopPickup.json','utf8'));
 const owner=privateKeyToAccount(generatePrivateKey());
 const collector=privateKeyToAccount(generatePrivateKey());
 const contract='0x1111111111111111111111111111111111111111';
 const evidence=sha('original photo');
 const data=new Map();
 const pickupStorage={read:async id=>data.get(id),write:async(id,value)=>{
   if(data.has(id))return false;
   data.set(id,Buffer.from(value));return true;
 }};
 const client={getChainId:async()=>43113,getCode:async()=>artifact.runtimeBytecode,readContract:async()=>({owner:owner.address,collector:collector.address,evidence,status:4})};
 const servers=[];
 async function start(){
   const server=await createApp({dataDir:dir,client,pickupStorage,pickupStorageKey:'ab'.repeat(32)});
   servers.push(server);
   await new Promise(r=>server.listen(0,'127.0.0.1',r));
   return (route,body)=>fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',body:JSON.stringify(body)});
 }
 try{
   const challenge=await start();
   const use=await start();
   async function signed(wallet,action,hash){
     const fields={account:wallet.address,contract,action,hash};
     const {nonce,message}=await (await challenge('/api/evidence/challenge',fields)).json();
     return {...fields,nonce,signature:await wallet.signMessage({message})};
   }
   const read=async()=>use('/api/pickup/details',{auth:await signed(collector,'pickup-read',evidence),id:1});
   const payload=JSON.stringify({lotId:1,evidence,contact:'Example contact',address:'Example pickup address'});
   assert.equal((await read()).status,404);
   assert.equal((await use('/api/pickup/details',{auth:await signed(collector,'pickup-save',sha(payload)),payload})).status,403);
   const body={auth:await signed(owner,'pickup-save',sha(payload)),payload};
   assert.equal((await use('/api/pickup/details',body)).status,201);
   assert.equal((await use('/api/pickup/details',body)).status,401);
   assert.equal((await (await read()).json()).address,'Example pickup address');
 }finally{
   await Promise.all(servers.map(server=>new Promise(r=>server.close(r))));
   await fs.rm(dir,{recursive:true,force:true});
 }
});

test('pickup contacts are signed, immutable, persisted, and visible only to owner or assigned active collector',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ecoloop-pickup-'));const configFile=path.join(dir,'config.json');
 const artifact=JSON.parse(await fs.readFile('artifacts/EcoLoopPickup.json','utf8'));
 const contract='0x1111111111111111111111111111111111111111';const owner=privateKeyToAccount(generatePrivateKey());const collector=privateKeyToAccount(generatePrivateKey());const outsider=privateKeyToAccount(generatePrivateKey());
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');const hash=sha(image);
 let status=2;let role=true;
 const client={getChainId:async()=>43113,getCode:async()=>artifact.runtimeBytecode,readContract:async({functionName,args})=>functionName==='getLot'?{owner:owner.address,collector:collector.address,evidence:hash,status}:role&&args[1].toLowerCase()===collector.address.toLowerCase()};
 await fs.writeFile(configFile,JSON.stringify({chainId:43113,contract}));
 let server=await createApp({dataDir:dir,configFile,client});await new Promise(r=>server.listen(0,'127.0.0.1',r));let url='http://127.0.0.1:'+server.address().port;
 const post=(route,data)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 async function auth(wallet,action,hashValue=hash){const identity={account:wallet.address,contract,hash:hashValue,action};const r=await post('/api/evidence/challenge',identity);const c=await r.json();return {...identity,nonce:c.nonce,signature:await wallet.signMessage({message:c.message})};}
 async function save(wallet,payload,signatureHash=sha(payload)){return post('/api/pickup/details',{auth:await auth(wallet,'pickup-save',signatureHash),payload});}
 async function read(wallet){return post('/api/pickup/details',{auth:await auth(wallet,'pickup-read'),id:1});}
 try{
  async function restorePhoto(wallet,bytes=image){
    const signed=await auth(wallet,'upload');
    return fetch(url+'/api/evidence/upload',{method:'POST',headers:{
      'X-EcoLoop-Auth':Buffer.from(JSON.stringify(signed)).toString('base64'),
      'X-EcoLoop-Lot':'1',
    },body:bytes});
  }
  assert.equal((await restorePhoto(collector)).status,403);
  assert.equal((await restorePhoto(owner,Buffer.concat([image,Buffer.from('changed')]))).status,400);
  assert.equal((await restorePhoto(owner)).status,201);
  const payload=JSON.stringify({evidence:hash,contact:'0900000000',address:'Private pickup address'});
  assert.equal((await save(owner,payload)).status,201);assert.equal((await save(owner,payload)).status,201,'safe retry after wallet rejection');
  assert.equal((await save(owner,payload,sha('different'))).status,400);
  assert.equal((await save(outsider,payload)).status,403);
  assert.equal((await save(owner,JSON.stringify({evidence:hash,contact:'other',address:'Changed address'}))).status,409);
  assert.equal((await read(owner)).status,200);assert.equal((await read(collector)).status,200);assert.equal((await read(outsider)).status,403);
  const photo=await post('/api/evidence/read',{...await auth(collector,'read'),id:1});assert.equal(photo.status,200);
  assert.equal((await post('/api/evidence/read',await auth(collector,'read'))).status,403);
  status=4;
  assert.equal((await read(collector)).status,200);
  assert.equal((await read(owner)).status,200);
  assert.equal((await read(outsider)).status,403);
  const completedPhoto=await post('/api/evidence/read',{...await auth(collector,'read'),id:1});
  assert.equal(completedPhoto.status,200);
  assert.deepEqual(Buffer.from(await completedPhoto.arrayBuffer()),image);
  assert.equal((await post('/api/evidence/read',{...await auth(outsider,'read'),id:1})).status,403);
  status=1;
  assert.equal((await read(collector)).status,403);
  assert.equal((await post('/api/evidence/read',{...await auth(collector,'read'),id:1})).status,403);
  status=2;role=false;assert.equal((await read(collector)).status,200);
  assert.equal((await post('/api/evidence/read',{...await auth(collector,'read'),id:1})).status,200);
  assert.equal((await post('/api/evidence/read',{...await auth(outsider,'read'),id:1})).status,403);
  const signed=await auth(owner,'pickup-read');assert.equal((await post('/api/pickup/details',{auth:signed,id:1})).status,200);assert.equal((await post('/api/pickup/details',{auth:signed,id:1})).status,401);
  await new Promise(r=>server.close(r));server=await createApp({dataDir:dir,configFile,client});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  assert.equal((await (await read(owner)).json()).address,'Private pickup address');
 }finally{await new Promise(r=>server.close(r));assert.ok(dir.startsWith(path.join(os.tmpdir(),'ecoloop-pickup-')));await fs.rm(dir,{recursive:true,force:true});}
});

test('activating shared V4 requires both admin roles and cannot replace an activated contract',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ecoloop-activation-'));const file=path.join(dir,'config.json');
 const old='0x1111111111111111111111111111111111111111',next='0x2222222222222222222222222222222222222222',different='0x3333333333333333333333333333333333333333';
 const a=privateKeyToAccount(generatePrivateKey());const artifact=JSON.parse(await fs.readFile('artifacts/EcoLoopPickup.json','utf8'));
 let legacyAdmin=false;const client={getChainId:async()=>43113,getCode:async()=>artifact.runtimeBytecode,readContract:async({address})=>address===old?legacyAdmin:true};
 await fs.writeFile(file,JSON.stringify({chainId:43113,contract:old,collectionName:'Existing name'}));const server=await createApp({dataDir:dir,configFile:file,client});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const post=(route,data)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 async function activate(contract){const identity={account:a.address,contract,hash:sha(contract),action:'configure-pickup'};const c=await(await post('/api/evidence/challenge',identity)).json();return post('/api/pickup/configure',{...identity,nonce:c.nonce,signature:await a.signMessage({message:c.message})});}
 try{
  assert.equal((await activate(next)).status,403);legacyAdmin=true;
  assert.equal((await activate(next)).status,200);assert.equal((await activate(next)).status,200);
  assert.equal((await activate(different)).status,409);
  const config=await(await fetch(url+'/api/config')).json();assert.equal(config.contract,old);assert.equal(config.pickupContract,next);assert.equal(config.collectionName,'Existing name');
  client.getCode=async()=> '0x6000';
  await fs.writeFile(file,JSON.stringify({...config,pickupContract:different}));
  assert.equal((await fetch(url+'/api/config')).status,503);
  assert.equal((await fetch(url+'/api/marketplace/listings')).status,400);
 }finally{await new Promise(r=>server.close(r));assert.ok(dir.startsWith(path.join(os.tmpdir(),'ecoloop-activation-')));await fs.rm(dir,{recursive:true,force:true});}
});
