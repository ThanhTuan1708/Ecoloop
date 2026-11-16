import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';

export function createPickupStorage(databaseUrl,secret){
  if(!databaseUrl||!secret)return;
  if(!/^[\da-f]{64}$/i.test(secret))throw new Error('Invalid pickup storage key');
  const key=Buffer.from(secret,'hex');
  const sql=neon(databaseUrl);
  let initialized;
  function initialize(){
    initialized??=sql`CREATE TABLE IF NOT EXISTS ecoloop_pickup_storage (
      id text PRIMARY KEY,
      payload bytea NOT NULL,
      expires_at timestamptz
    )`.catch(error=>{initialized=undefined;throw error;});
    return initialized;
  }
  const name=id=>createHmac('sha256',key).update(id).digest('hex');
  function decrypt(id,payload){
    const bytes=Buffer.from(payload,'base64');
    const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
  }
  function encrypt(id,value){
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted=Buffer.concat([cipher.update(value),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
  }
  async function read(id){
    await initialize();
    const [row]=await sql`SELECT encode(payload,'base64') AS payload FROM ecoloop_pickup_storage
      WHERE id=${name(id)} AND (expires_at IS NULL OR expires_at>now())`;
    if(row)return decrypt(id,row.payload);
  }
  async function write(id,value,ttlDays){
    await initialize();
    const payload=encrypt(id,value);
    const expiresAt=ttlDays?new Date(Date.now()+ttlDays*86400000).toISOString():null;
    if(ttlDays)await sql`DELETE FROM ecoloop_pickup_storage WHERE expires_at<=now()`;
    const rows=await sql`INSERT INTO ecoloop_pickup_storage (id,payload,expires_at)
      VALUES (${name(id)},decode(${payload},'base64'),${expiresAt})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    return rows.length===1;
  }
  async function update(id,change){
    await initialize();
    const record=name(id);
    for(let attempt=0;attempt<8;attempt++){
      const [row]=await sql`SELECT encode(payload,'base64') AS payload FROM ecoloop_pickup_storage WHERE id=${record}`;
      const current=row&&decrypt(id,row.payload);
      const next=change(current);
      if(next===current)return current;
      if(!row){
        if(await write(id,next))return next;
        continue;
      }
      const rows=await sql`UPDATE ecoloop_pickup_storage SET payload=decode(${encrypt(id,next)},'base64')
        WHERE id=${record} AND payload=decode(${row.payload},'base64') RETURNING id`;
      if(rows.length)return next;
    }
    throw Object.assign(new Error('Chat storage is busy'),{status:503});
  }
  return {read,write,update};
}
