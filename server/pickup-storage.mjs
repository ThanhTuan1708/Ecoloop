import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {list,put} from '@vercel/blob';

export function createPickupStorage(token,secret){
  if(!token||!secret)return;
  if(!/^[\da-f]{64}$/i.test(secret))throw new Error('Invalid pickup storage key');
  const key=Buffer.from(secret,'hex');
  const name=id=>'pickup-encrypted/v1/'+createHmac('sha256',key).update(id).digest('hex');
  async function read(id){
    const pathname=name(id);
    const {blobs}=await list({prefix:pathname,limit:1,token,abortSignal:AbortSignal.timeout(10000)});
    const blob=blobs.find(item=>item.pathname===pathname);
    if(!blob)return;
    const response=await fetch(blob.url,{signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw new Error('Unexpected storage response');
    const bytes=Buffer.from(await response.arrayBuffer());
    const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
  }
  async function write(id,value,ttlDays){
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted=Buffer.concat([cipher.update(value),cipher.final()]);
    try{
      await put(name(id),Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{
        access:'public',token,addRandomSuffix:false,allowOverwrite:false,
        contentType:'application/octet-stream',...(ttlDays?{ttlDays}:{}),
      });
      return true;
    }catch(error){
      if(/already exists/i.test(error.message))return false;
      throw error;
    }
  }
  return {read,write};
}
