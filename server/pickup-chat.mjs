import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isAddress,zeroAddress} from 'viem';

const SESSION_MS=60*60*1000;
const HISTORY_LIMIT=200;
const uuid=/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

export function createPickupChat({dataDir,chainId,storage,storageKey,requiresStorage,readLot,authenticate,fail}){
  const sessionKey=storage?createHmac('sha256',storageKey).update('EcoLoop pickup chat sessions').digest():randomBytes(32);
  const directory=path.join(dataDir,'pickup-chat');
  const pending=new Map();
  const mac=encoded=>createHmac('sha256',sessionKey).update(encoded).digest();

  function signSession(session){
    const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
    return encoded+'.'+mac(encoded).toString('base64url');
  }

  function verifySession(header){
    const match=/^Bearer ([\w-]{1,1024})\.([\w-]{43})$/.exec(header||'');
    if(!match||!timingSafeEqual(mac(match[1]),Buffer.from(match[2],'base64url')))fail(401,'Phiên chat đã hết hạn. Hãy mở lại chat.');
    const session=JSON.parse(Buffer.from(match[1],'base64url'));
    if(session.chainId!==chainId||session.expiresAt<=Date.now())fail(401,'Phiên chat đã hết hạn. Hãy mở lại chat.');
    return session;
  }

  async function access({account,contract,lotId,collector}){
    const lot=await readLot(contract,lotId);
    const owner=lot.owner.toLowerCase();
    if(collector===zeroAddress||lot.collector.toLowerCase()!==collector||![2,3,4].includes(lot.status)||(account!==owner&&account!==collector)){
      fail(403,'Chỉ người bán và người thu gom đã nhận lô được mở chat.');
    }
    return {owner,writable:lot.status!==4};
  }

  const readLocal=async file=>fs.readFile(file).catch(error=>{
    if(error.code!=='ENOENT')throw error;
  });

  async function updateLocal(file,change){
    const operation=(pending.get(file)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const current=await readLocal(file);
      const value=change(current);
      if(value===current)return current;
      await fs.mkdir(directory,{recursive:true,mode:0o700});
      const temporary=file+'.'+randomUUID()+'.tmp';
      try{
        await fs.writeFile(temporary,value,{mode:0o600,flag:'wx'});
        await fs.rename(temporary,file);
      }finally{
        await fs.rm(temporary,{force:true});
      }
      return value;
    });
    pending.set(file,operation);
    try{return await operation;}
    finally{if(pending.get(file)===operation)pending.delete(file);}
  }

  const history=value=>value?JSON.parse(value):{messages:[],truncated:false};

  return async function handle(req,url,body){
    if(requiresStorage&&!storage)fail(503,'Kho lưu tin nhắn chưa được cấu hình.');
    if(url.pathname.endsWith('/session')){
      if(!Number.isSafeInteger(body.lotId)||body.lotId<1||!isAddress(body.collector||''))fail(400,'Thông tin lô thu gom không hợp lệ.');
      if(!body.auth||typeof body.auth!=='object')fail(401,'Thiếu chữ ký xác thực.');
      const identity=await authenticate(body.auth);
      const collector=body.collector.toLowerCase();
      const scope=JSON.stringify({lotId:body.lotId,collector});
      const hash='0x'+createHash('sha256').update(scope).digest('hex');
      if(identity.action!=='pickup-chat'||identity.hash!==hash)fail(403,'Chữ ký không khớp cuộc trò chuyện.');
      const session={chainId,account:identity.account,contract:identity.contract,lotId:body.lotId,collector,expiresAt:Date.now()+SESSION_MS};
      await access(session);
      return {token:signSession(session)};
    }

    const session=verifySession(req.headers.authorization);
    const {owner,writable}=await access(session);
    const room=[session.contract,session.lotId,owner,session.collector].join('-');
    const file=path.join(directory,room+'.json');
    const record=`chains/${chainId}/pickup-chat/${room}`;
    if(body.text===undefined){
      return {...history(await (storage?storage.read(record):readLocal(file))),writable};
    }
    if(!writable)fail(409,'Lô đã hoàn tất bàn giao. Bạn vẫn có thể xem tin nhắn.');
    const text=typeof body.text==='string'?body.text.trim():'';
    if(!text||text.length>500||typeof body.messageId!=='string'||!uuid.test(body.messageId))fail(400,'Tin nhắn phải có từ 1 đến 500 ký tự.');
    const sender=session.account===owner?'seller':'collector';
    const info={id:`${sender}-${body.messageId}`,sender,text,createdAt:Date.now()};
    const append=current=>{
      const {messages,truncated}=history(current);
      if(messages.some(message=>message.id===info.id))return current;
      messages.push(info);
      return Buffer.from(JSON.stringify({messages:messages.slice(-HISTORY_LIMIT),truncated:truncated||messages.length>HISTORY_LIMIT}));
    };
    const value=await (storage?storage.update(record,append):updateLocal(file,append));
    return {...history(value),writable};
  };
}
