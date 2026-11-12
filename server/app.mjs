import http from 'node:http';
import {createMapsHandler} from './maps.mjs';
import {createMarketplaceHandler} from './marketplace.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createPublicClient, http as rpcHttp, isAddress, keccak256, stringToHex, verifyMessage } from 'viem';
import { avalancheFuji, hardhat } from 'viem/chains';

const MAX_IMAGE = 10 * 1024 * 1024;
const hashPattern = /^0x[\da-f]{64}$/i;
const collectorRole = keccak256(stringToHex('COLLECTOR_ROLE'));
export function imageType(bytes) {
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return undefined;
}
async function readBody(req, limit) {
  const parts=[];let size=0;
  for await (const part of req) {size+=part.length;if(size>limit){const error=new Error('Nội dung vượt giới hạn.');error.status=413;throw error;}parts.push(part);}
  return Buffer.concat(parts);
}
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
export async function createApp({dataDir=path.resolve(process.env.DATA_DIR||'.data'),staticDir=path.resolve('dist'),client,chainId=Number(process.env.VITE_CHAIN_ID||43113),configFile=path.resolve('config/app.json')}={}) {
  dataDir=path.join(path.resolve(dataDir),String(chainId));
  const artifact=JSON.parse(await fs.readFile('artifacts/EcoLoop.json','utf8'));
  const pickupArtifact=JSON.parse(await fs.readFile('artifacts/EcoLoopPickup.json','utf8'));
  const chain=chainId===31337?hardhat:avalancheFuji;
  client ||= createPublicClient({chain,transport:rpcHttp(process.env.VITE_RPC_URL||process.env.FUJI_RPC_URL||chain.rpcUrls.default.http[0],{timeout:15000,retryCount:1})});
  const challenges=new Map();
  const limits=new Map();
  let activatingPickup=false;
  let totalBytes=0;
  const maxStorage=Number(process.env.MAX_STORAGE_MB||1024)*1024*1024;
  await fs.mkdir(dataDir,{recursive:true});
  // Count existing data so restarts cannot bypass the disk quota.
  for(const dir of await fs.readdir(dataDir,{withFileTypes:true})){if(!dir.isDirectory())continue;for(const f of await fs.readdir(path.join(dataDir,dir.name))){if(f.endsWith('.bin'))totalBytes+=(await fs.stat(path.join(dataDir,dir.name,f))).size;}}
  function rateLimit(req){const key=req.socket.remoteAddress;const now=Date.now();for(const [k,v]of limits)if(v.end<now)limits.delete(k);const record=limits.get(key)||{count:0,end:now+60000};if(++record.count>120)fail(429,'Quá nhiều yêu cầu. Thử lại sau một phút.');limits.set(key,record);}
  function fields(data){
    if(!isAddress(data.account||'')||!isAddress(data.contract||'')||!hashPattern.test(data.hash||'')||!['upload','read','pickup-save','pickup-read','configure-pickup'].includes(data.action))fail(400,'Thông tin xác thực không hợp lệ.');
    return {account:data.account.toLowerCase(),contract:data.contract.toLowerCase(),hash:data.hash.toLowerCase(),action:data.action};
  }
  async function authenticate(data){
    const challenge=challenges.get(data.nonce);challenges.delete(data.nonce);
    if(!challenge||challenge.expiry<Date.now())fail(401,'Yêu cầu ký đã hết hạn hoặc được sử dụng.');
    const identity=fields(data);
    if(Object.keys(identity).some(k=>identity[k]!==challenge[k]))fail(401,'Thông tin ký không khớp.');
    const signed={address:identity.account,message:challenge.message,signature:data.signature};
    const valid=await verifyMessage(signed).catch(()=>false)||await client.verifyMessage?.(signed).catch(()=>false);
    if(!valid)fail(401,'Chữ ký ví không hợp lệ.');
    return identity;
  }
  async function compatible(contract){
    if(await client.getChainId()!==chainId)fail(503,'Server cấu hình sai mạng.');
    const code=await client.getCode({address:contract});
    if(!code||![artifact.runtimeHash,pickupArtifact.runtimeHash].includes(keccak256(code)))fail(400,'Contract không phải phiên bản EcoLoop đang chạy trên server.');
  }
  const mapsHandler=createMapsHandler();
  const marketplaceHandler=createMarketplaceHandler({client,chainId,configFile,pickupArtifact});
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,'http://localhost');
      if(await mapsHandler(req,res,url))return;
      if(await marketplaceHandler(req,res,url))return;
      if(url.pathname==='/api/health'){send(200,{ok:true,chainId,evidence:true});return;}
      if(url.pathname==='/api/config'&&req.method==='GET'){
        let config={};try{config=JSON.parse(await fs.readFile(configFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
        const contract=process.env.ECOLOOP_ADDRESS||process.env.VITE_ECOLOOP_ADDRESS||(config.chainId===chainId?config.contract:null);
        if(contract&&!isAddress(contract))fail(503,'Cấu hình contract trên server không hợp lệ.');
        const pickupContract=config.chainId===chainId?config.pickupContract:null;
        if(pickupContract&&!isAddress(pickupContract))fail(503,'Cấu hình thu gom không hợp lệ.');
        send(200,{chainId,contract:contract||null,pickupContract:pickupContract||null,collectionName:config.collectionName||'Điểm thu gom EcoLoop',collectionInstructions:config.collectionInstructions||'Liên hệ đơn vị tổ chức để thống nhất địa điểm và giờ bàn giao.'});return;
      }
      if(url.pathname.startsWith('/api/')){
        rateLimit(req);
        // A page on a different origin cannot use the browser as a signing/upload proxy.
        const origin=req.headers.origin;
        const expected=process.env.APP_ORIGIN;
        if(origin){const allowed=expected||`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`;if(origin!==allowed&&!(!expected&&/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)))fail(403,'Origin không được phép.');}
        if(url.pathname==='/api/evidence/challenge'&&req.method==='POST'){
          const data=fields(JSON.parse((await readBody(req,4096)).toString()));
          const now=Date.now();for(const [nonce,record]of challenges)if(record.expiry<now)challenges.delete(nonce);
          if(challenges.size>1000)fail(429,'Server đang bận.');
          const nonce=randomUUID();const expiry=now+180000;
          const message=`EcoLoop evidence authorization\nAction: ${data.action}\nChain: ${chainId}\nContract: ${data.contract}\nWallet: ${data.account}\nSHA-256: ${data.hash}\nNonce: ${nonce}\nExpires: ${new Date(expiry).toISOString()}`;
          challenges.set(nonce,{...data,expiry,message});send(200,{nonce,message,expiresAt:expiry});return;
        }
        if(url.pathname==='/api/evidence/upload'&&req.method==='POST'){
          let auth;try{auth=JSON.parse(Buffer.from(String(req.headers['x-ecoloop-auth']||''),'base64').toString());}catch{fail(401,'Thiếu chữ ký xác thực.');}
          const identity=await authenticate(auth);if(identity.action!=='upload')fail(403,'Sai loại xác thực.');
          await compatible(identity.contract);
          const bytes=await readBody(req,MAX_IMAGE);const mime=imageType(bytes);if(!mime)fail(415,'Chỉ hỗ trợ ảnh JPG, PNG, WebP.');
          const digest='0x'+createHash('sha256').update(bytes).digest('hex');if(digest!==identity.hash)fail(400,'Hash ảnh không khớp chữ ký.');
          const dir=path.join(dataDir,identity.contract);const base=path.join(dir,identity.hash);
          try{const prior=JSON.parse(await fs.readFile(base+'.json','utf8'));if(prior.account!==identity.account)fail(409,'Ảnh đã được ví khác lưu.');send(200,{hash:digest,stored:true});return;}catch(error){if(error.code!=='ENOENT')throw error;}
          if(totalBytes+bytes.length>maxStorage)fail(507,'Kho ảnh đã đầy. Liên hệ quản trị.');
          await fs.mkdir(dir,{recursive:true});
          // Reserve the hash atomically; concurrent uploads cannot replace its owner.
          const meta={...identity,mime,size:bytes.length,createdAt:new Date().toISOString()};
          try{await fs.writeFile(base+'.json',JSON.stringify(meta),{flag:'wx'});}catch(error){if(error.code==='EEXIST')fail(409,'Ảnh đang được xử lý. Thử lại.');throw error;}
          try{await fs.writeFile(base+'.bin',bytes,{flag:'wx'});totalBytes+=bytes.length;}catch(error){await fs.unlink(base+'.json');throw error;}
          send(201,{hash:digest,stored:true});return;
        }
        if(url.pathname==='/api/pickup/configure'&&req.method==='POST'){
          const identity=await authenticate(JSON.parse((await readBody(req,8192)).toString()));
          if(identity.action!=='configure-pickup')fail(403,'Sai loại xác thực.');
          if(activatingPickup)fail(409,'Đang kích hoạt contract. Hãy tải lại cấu hình sau ít giây.');
          activatingPickup=true;
          try{
          await compatible(identity.contract);
          if(keccak256(await client.getCode({address:identity.contract}))!==pickupArtifact.runtimeHash)fail(400,'Cần contract thu gom V2.');
          const config=JSON.parse(await fs.readFile(configFile,'utf8'));
          const legacy=process.env.ECOLOOP_ADDRESS||process.env.VITE_ECOLOOP_ADDRESS||config.contract;
          for(const address of [legacy,identity.contract]){
            if(!isAddress(address||'')||!await client.readContract({address,abi:artifact.abi,functionName:'hasRole',args:['0x'+'0'.repeat(64),identity.account]}))fail(403,'Chỉ quản trị của cả hai contract được kích hoạt.');
          }
          if(config.pickupContract&&config.pickupContract.toLowerCase()!==identity.contract)fail(409,'Đã có contract thu gom chung. Không thể ghi đè bằng giao diện.');
          const temp=configFile+'.'+randomUUID()+'.tmp';
          await fs.writeFile(temp,JSON.stringify({...config,chainId,pickupContract:identity.contract},null,2));await fs.rename(temp,configFile);
          send(200,{configured:true});return;
          }finally{activatingPickup=false;}
        }
        if(url.pathname==='/api/pickup/details'&&req.method==='POST'){
          const data=JSON.parse((await readBody(req,16384)).toString());const identity=await authenticate(data.auth);
          await compatible(identity.contract);
          if(identity.action==='pickup-save'){
            const payload=data.payload;
            if(typeof payload!=='string'||'0x'+createHash('sha256').update(payload).digest('hex')!==identity.hash)fail(400,'Nội dung liên hệ không khớp chữ ký.');
            const detail=JSON.parse(payload);
            if(!hashPattern.test(detail.evidence||'')||typeof detail.contact!=='string'||typeof detail.address!=='string'||detail.contact.length<3||detail.contact.length>120||detail.address.length<5||detail.address.length>400)fail(400,'Điền liên hệ và địa chỉ bàn giao hợp lệ.');
            const base=path.join(dataDir,identity.contract,detail.evidence.toLowerCase());
            const meta=JSON.parse(await fs.readFile(base+'.json','utf8'));
            if(meta.account!==identity.account)fail(403,'Chỉ chủ ảnh được lưu địa chỉ.');
            // Immutable once saved: a signed lot always points to the same pickup instructions.
            const saved=JSON.stringify({owner:identity.account,contact:detail.contact,address:detail.address});
            try{await fs.writeFile(base+'.pickup.json',saved,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(await fs.readFile(base+'.pickup.json','utf8')!==saved)fail(409,'Ảnh đã có thông tin bàn giao. Chọn ảnh mới nếu đổi địa chỉ.');}
            send(201,{stored:true});return;
          }
          if(identity.action!=='pickup-read'||!Number.isSafeInteger(data.id)||data.id<1)fail(400,'Thông tin đọc không hợp lệ.');
          const lot=await client.readContract({address:identity.contract,abi:pickupArtifact.abi,functionName:'getLot',args:[BigInt(data.id)]});
          if(lot.evidence.toLowerCase()!==identity.hash)fail(403,'Ảnh không thuộc lô.');
          const owner=lot.owner.toLowerCase()===identity.account;
          const assigned=lot.collector.toLowerCase()===identity.account&&[2,3].includes(lot.status)&&await client.readContract({address:identity.contract,abi:artifact.abi,functionName:'hasRole',args:[collectorRole,identity.account]});
          if(!owner&&!assigned)fail(403,'Chỉ chủ lô và người được giao thu gom được xem địa chỉ.');
          const detail=JSON.parse(await fs.readFile(path.join(dataDir,identity.contract,identity.hash)+'.pickup.json','utf8'));
          if(detail.owner!==lot.owner.toLowerCase())fail(403,'Chủ thông tin không khớp lô.');
          send(200,{contact:detail.contact,address:detail.address});return;
        }
        if(url.pathname==='/api/evidence/read'&&req.method==='POST'){
          const data=JSON.parse((await readBody(req,8192)).toString());const identity=await authenticate(data);if(identity.action!=='read')fail(403,'Sai loại xác thực.');
          const base=path.join(dataDir,identity.contract,identity.hash);let meta;
          try{meta=JSON.parse(await fs.readFile(base+'.json','utf8'));}catch(error){if(error.code==='ENOENT')fail(404,'Ảnh chưa được lưu trên server này.');throw error;}
          if(meta.account!==identity.account){
            await compatible(identity.contract);
            const allowed=await client.readContract({address:identity.contract,abi:artifact.abi,functionName:'hasRole',args:[collectorRole,identity.account]});
            if(!allowed)fail(403,'Chỉ chủ ảnh hoặc ví thu gom có quyền xem ảnh.');
            if(keccak256(await client.getCode({address:identity.contract}))===pickupArtifact.runtimeHash){
              if(!Number.isSafeInteger(data.id)||data.id<1)fail(403,'Thiếu mã lô thu gom.');
              const lot=await client.readContract({address:identity.contract,abi:pickupArtifact.abi,functionName:'getLot',args:[BigInt(data.id)]});
              if(lot.evidence.toLowerCase()!==identity.hash||lot.owner.toLowerCase()!==meta.account||lot.collector.toLowerCase()!==identity.account||![2,3].includes(lot.status))fail(403,'Chỉ người được giao thu gom được xem ảnh của lô.');
            }
          }
          const bytes=await fs.readFile(base+'.bin');res.writeHead(200,{'Content-Type':meta.mime,'Cache-Control':'no-store','Content-Length':bytes.length});res.end(bytes);return;
        }
        fail(404,'API không tồn tại.');
      }
      if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Method không hỗ trợ.');
      let relative=decodeURIComponent(url.pathname);const root=path.resolve(staticDir);let file=path.resolve(root,'.'+relative);
      if(file!==root&&!file.startsWith(root+path.sep))fail(403,'Đường dẫn không hợp lệ.');
      if(relative==='/'||!path.extname(relative))file=path.join(root,'index.html');
      let bytes;try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')fail(404,'Không tìm thấy trang. Chạy npm run build trước npm start.');throw error;}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){if(res.headersSent){res.destroy();return;}const status=error.status||(error instanceof SyntaxError?400:500);send(status,{error:status>=500?'Server chưa xử lý được yêu cầu. Kiểm tra RPC, kho lưu trữ hoặc thử lại.':error.message});}
  });
}
