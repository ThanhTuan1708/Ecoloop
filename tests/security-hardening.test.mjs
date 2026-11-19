import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createApp} from '../server/app.mjs';

const sha=bytes=>'0x'+createHash('sha256').update(bytes).digest('hex');

async function invoke(server, route, {method='GET', headers={}, body}={}){
  let status=200;
  let resHeaders={};
  const chunks=[];
  const req={
    url:route,
    method,
    headers:Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v])),
    socket:{remoteAddress:'127.0.0.1'},
    async *[Symbol.asyncIterator](){
      if(body!==undefined){
        yield Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
      }
    },
  };
  await new Promise((resolve,reject)=>{
    const res={
      headersSent:false,
      setHeader(k,v){resHeaders[k.toLowerCase()]=v;},
      writeHead(s,h={}){status=s;Object.assign(resHeaders,h);this.headersSent=true;},
      end(chunk){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));resolve();},
      destroy(err){if(err)reject(err);else resolve();},
    };
    server.emit('request',req,res);
  });
  const raw=Buffer.concat(chunks).toString('utf8');
  return {status,headers:resHeaders,text:raw,json:()=>JSON.parse(raw)};
}

test('admin catalog redacts registered accounts publicly, allows on-chain DEFAULT_ADMIN_ROLE, and enforces mission & privacy rules',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ecoloop-sec-'));
  const configFile=path.join(dir,'app.json');
  const pickupArtifact=JSON.parse(await fs.readFile('artifacts/EcoLoopPickup.json','utf8'));
  const contract='0x2222222222222222222222222222222222222222';
  const onChainAdmin=privateKeyToAccount(generatePrivateKey());
  const household=privateKeyToAccount(generatePrivateKey());
  const collector=privateKeyToAccount(generatePrivateKey());
  const relayerKey=generatePrivateKey();
  const relayerAccount=privateKeyToAccount(relayerKey);
  const designatedAdmin='0xcCb958ed2931073568359336344088A914f57098';
  const evidence=sha('lot-photo');

  let recycledGrams=5000n; // 5 kg
  let sentStipends=[];

  await fs.writeFile(configFile,JSON.stringify({chainId:43113,contract,pickupContract:contract}));

  const client={
    getChainId:async()=>43113,
    getCode:async()=>pickupArtifact.runtimeBytecode,
    getBalance:async({address})=>address.toLowerCase()===relayerAccount.address.toLowerCase()?100_000_000_000_000_000n:0n,
    readContract:async({functionName,args})=>{
      if(functionName==='hasRole'){
        const [,acct]=args;
        return acct.toLowerCase()===onChainAdmin.address.toLowerCase();
      }
      if(functionName==='recycledGrams')return recycledGrams;
      if(functionName==='getLot')return {owner:household.address,collector:collector.address,evidence,status:2};
      return false;
    },
  };
  const relayWallet={
    account:relayerAccount,
    sendTransaction:async({to,value})=>{sentStipends.push({to,value});return '0x'+'a'.repeat(64);},
  };

  const server=await createApp({dataDir:dir,configFile,client,relayerKey,relayWallet});
  try{
    // 1. Register a password account and confirm public GET /api/admin/catalog hides `accounts`
    const reg=await invoke(server,'/api/auth/account',{
      method:'POST',
      body:{mode:'register',username:'alice_green',address:household.address,role:'seller'},
    });
    assert.equal(reg.status,200);

    const pubCatalog=await invoke(server,'/api/admin/catalog');
    assert.equal(pubCatalog.status,200);
    assert.equal(pubCatalog.json().accounts,undefined,'public catalog must not leak registered accounts');

    // 2. Dynamic on-chain admin (holding DEFAULT_ADMIN_ROLE) can save catalog & read accounts with signature
    const catalogPayload={
      customMissions:[{id:'m-10kg',title:'Recycle 10kg',targetKg:10,rewardEco:80,hidden:false}],
    };
    const ts=Date.now();
    const digest=createHash('sha256').update(JSON.stringify(catalogPayload)).digest('hex');
    const updateSig=await onChainAdmin.signMessage({
      message:`EcoLoop Admin Catalog Update\nAdmin: ${onChainAdmin.address.toLowerCase()}\nHash: ${digest}\nTimestamp: ${ts}`,
    });
    const saveRes=await invoke(server,'/api/admin/catalog',{
      method:'POST',
      body:{adminAccount:onChainAdmin.address,timestamp:ts,signature:updateSig,catalog:catalogPayload},
    });
    assert.equal(saveRes.status,200);
    assert.equal(saveRes.json().accounts.length,1,'existing registered accounts preserved across admin updates');

    const readTs=Date.now();
    const readSig=await onChainAdmin.signMessage({
      message:`EcoLoop Admin Catalog Read\nAdmin: ${onChainAdmin.address.toLowerCase()}\nTimestamp: ${readTs}`,
    });
    const adminCatalog=await invoke(server,'/api/admin/catalog',{
      headers:{
        'x-ecoloop-admin':onChainAdmin.address,
        'x-ecoloop-timestamp':String(readTs),
        'x-ecoloop-signature':readSig,
      },
    });
    assert.equal(adminCatalog.status,200);
    assert.equal(adminCatalog.json().accounts[0].username,'alice_green');

    // 3. Custom mission claim rejects insufficient on-chain recycledGrams (5kg < 10kg) and ignores forged rewardEco
    const claimTs=Date.now();
    const claimSig=await household.signMessage({
      message:`EcoLoop Custom Mission Claim\nAccount: ${household.address.toLowerCase()}\nMission: m-10kg\nTimestamp: ${claimTs}`,
    });
    const deniedClaim=await invoke(server,'/api/missions/custom-claim',{
      method:'POST',
      body:{account:household.address,missionId:'m-10kg',rewardEco:999999,timestamp:claimTs,signature:claimSig},
    });
    assert.equal(deniedClaim.status,403);

    recycledGrams=12000n; // 12 kg >= 10 kg
    const okClaim=await invoke(server,'/api/missions/custom-claim',{
      method:'POST',
      body:{account:household.address,missionId:'m-10kg',rewardEco:999999,timestamp:claimTs,signature:claimSig},
    });
    assert.equal(okClaim.status,200);
    const savedReward=okClaim.json().state.missionClaims[`${household.address.toLowerCase()}:m-10kg`].rewardEco;
    assert.equal(savedReward,80,'server must enforce catalog rewardEco instead of client-supplied value');

    // 4. Stipend endpoint requires wallet signature, caps at 0.005 AVAX, and blocks repeat claim within 24h
    const unsignedStipend=await invoke(server,'/api/relay/stipend',{
      method:'POST',
      body:{account:household.address,needed:'50000000000000000'},
    });
    assert.equal(unsignedStipend.status,401);

    const stTs=Date.now();
    const stSig=await household.signMessage({
      message:`EcoLoop Gas Stipend\nAccount: ${household.address.toLowerCase()}\nNeeded: 50000000000000000\nTimestamp: ${stTs}`,
    });
    const okStipend=await invoke(server,'/api/relay/stipend',{
      method:'POST',
      body:{account:household.address,needed:'50000000000000000',timestamp:stTs,signature:stSig},
    });
    assert.equal(okStipend.status,200);
    assert.equal(sentStipends.length,1);
    assert.ok(sentStipends[0].value<=6_000_000_000_000_000n,'stipend strictly capped near 0.005 AVAX');

    const repeatStipend=await invoke(server,'/api/relay/stipend',{
      method:'POST',
      body:{account:household.address,needed:'50000000000000000',timestamp:stTs,signature:stSig},
    });
    assert.equal(repeatStipend.status,429);

    // 5. Designated admin wallet cannot snoop household private pickup details when not owner/collector
    const chalRes=await invoke(server,'/api/evidence/challenge',{
      method:'POST',
      body:{account:household.address,contract,hash:evidence,action:'upload'},
    });
    const chal=chalRes.json();
    const upAuth={account:household.address,contract,hash:evidence,action:'upload',nonce:chal.nonce,signature:await household.signMessage({message:chal.message})};
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
    // Save pickup details as owner for lot #1
    const payload=JSON.stringify({lotId:1,evidence,contact:'0909123456',address:'123 Nguyen Hue, Q1'});
    const saveChal=(await invoke(server,'/api/evidence/challenge',{
      method:'POST',
      body:{account:household.address,contract,hash:sha(payload),action:'pickup-save'},
    })).json();
    const savedDetail=await invoke(server,'/api/pickup/details',{
      method:'POST',
      body:{
        auth:{
          account:household.address,
          contract,
          hash:sha(payload),
          action:'pickup-save',
          nonce:saveChal.nonce,
          signature:await household.signMessage({message:saveChal.message}),
        },
        payload,
      },
    });
    assert.equal(savedDetail.status,201);
    void upAuth; void png; void designatedAdmin;

    const outsiderAdmin=onChainAdmin;
    const readChal=(await invoke(server,'/api/evidence/challenge',{
      method:'POST',
      body:{account:outsiderAdmin.address,contract,hash:evidence,action:'pickup-read'},
    })).json();
    const snoop=await invoke(server,'/api/pickup/details',{
      method:'POST',
      body:{
        auth:{
          account:outsiderAdmin.address,
          contract,
          hash:evidence,
          action:'pickup-read',
          nonce:readChal.nonce,
          signature:await outsiderAdmin.signMessage({message:readChal.message}),
        },
        id:1,
      },
    });
    assert.equal(snoop.status,403,'admin wallet must not bypass household address privacy');
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});
