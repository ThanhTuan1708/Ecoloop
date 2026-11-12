import { formatEther, keccak256, stringToHex, type Address, type Hash } from 'viem';
import { publicClient } from './chain';
import { assertWallet, chain } from './wallet';
import { pickupAbi, pickupBytecode, pickupRuntimeHash } from './generated/pickup';
import { authorize, uploadEvidence } from './evidence';

export type Lot = {id:number; owner:Address; collector:Address; estimated:number[]; actual:number[]; evidence:Hash; latitude:number; longitude:number; updatedAt:number; status:number};
export const lotStatuses=['Không tồn tại','Chờ thu gom','Đã nhận việc','Chờ chủ lô xác nhận','Hoàn tất','Đã hủy'];
export const ZERO='0x0000000000000000000000000000000000000000' as Address;
export const DEMO_OWNER='0x0000000000000000000000000000000000000001' as Address;
export const DEMO_COLLECTOR='0x0000000000000000000000000000000000000002' as Address;
const pendingKey=`ecoloop-pickup-pending-${chain.id}`;
export function pendingPickup():Hash|undefined {return localStorage.getItem(pendingKey) as Hash||undefined;}
async function receipt(hash:Hash){
  let replaced=false;
  const r=await publicClient.waitForTransactionReceipt({hash,timeout:120000,onReplaced:({transaction,reason})=>{localStorage.setItem(pendingKey,transaction.hash);if(reason!=='repriced')replaced=true;}});
  localStorage.removeItem(pendingKey);
  if(replaced)throw new Error('Giao dịch đã bị hủy hoặc thay bằng thao tác khác trong ví. Hãy làm mới dữ liệu trước khi thử lại.');
  if(r.status!=='success')throw new Error('Giao dịch thu gom thất bại. Dữ liệu chưa thay đổi.');
  return r;
}
export async function resumePickup(){const hash=pendingPickup();if(!hash)return;return receipt(hash);}
export async function validatePickup(address:Address){
  if(await publicClient.getChainId()!==chain.id)throw new Error('RPC đang trỏ sai mạng.');
  const code=await publicClient.getCode({address});
  if(!code||keccak256(code)!==pickupRuntimeHash)throw new Error('Địa chỉ không phải contract Thu gom EcoLoop V2.');
}
export async function pickupRead(address:Address,account?:Address,limit=100){
  await validatePickup(address);
  const read=(functionName:string,args:unknown[]=[])=>publicClient.readContract({address,abi:pickupAbi,functionName,args} as never) as Promise<any>;
  const [count,balance,collector,paused,admin]=await Promise.all([read('lotCount'),account?read('balanceOf',[account]):0n,account?read('hasRole',[keccak256(stringToHex('COLLECTOR_ROLE')),account]):false,read('paused'),account?read('hasRole',['0x'+'0'.repeat(64),account]):false]);
  const lots:Lot[]=[];
  for(let i=0;i<Math.min(Number(count),limit);i+=10){
    lots.push(...await Promise.all(Array.from({length:Math.min(10,Number(count)-i,limit-i)},async(_,j)=>{
      const id=Number(count)-i-j;const l=await read('getLot',[BigInt(id)]);
      return {...l,id,estimated:l.estimated.map(Number),actual:l.actual.map(Number),latitude:l.latitude/100,longitude:l.longitude/100,updatedAt:Number(l.updatedAt)*1000} as Lot;
    })));
  }
  return {lots,count:Number(count),balance:Number(formatEther(balance)),collector:!!collector,paused:!!paused,admin:!!admin};
}
export async function pickupWrite(address:Address,account:Address,functionName:string,args:unknown[]=[]){
  if(pendingPickup())throw new Error('Có giao dịch thu gom đang chờ. Kiểm tra giao dịch trước khi gửi tiếp.');
  const wallet=await assertWallet(account);
  const {request}=await publicClient.simulateContract({address,abi:pickupAbi,functionName,args,account} as never);
  const hash=await wallet.writeContract(request as never);localStorage.setItem(pendingKey,hash);
  await receipt(hash);return hash;
}
export async function deployPickup(account:Address){
  if(pendingPickup())throw new Error('Kiểm tra giao dịch đang chờ trước.');
  const wallet=await assertWallet(account);
  const hash=await wallet.deployContract({abi:pickupAbi,bytecode:pickupBytecode,args:[account]});
  localStorage.setItem(pendingKey,hash);
  const r=await receipt(hash);if(!r.contractAddress)throw new Error('Chưa nhận được địa chỉ contract.');
  localStorage.setItem(`ecoloop-pickup-deployed-${chain.id}`,r.contractAddress);
  return r.contractAddress;
}
export async function activatePickup(account:Address,address:Address){
  await validatePickup(address);
  const auth=await authorize('configure-pickup',account,keccak256(stringToHex(address)),address);
  await api('/api/pickup/configure',auth);
}
export async function api(path:string,data:unknown){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Không kết nối được server.');return result;
}
export async function digest(bytes:ArrayBuffer){return '0x'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('') as Hash;}
export async function savePickupPhoto(account:Address,address:Address,file:File,evidence:Hash,contact:string,location:string){
  await uploadEvidence(account,file,evidence,address);
  const payload=JSON.stringify({evidence,contact,address:location});
  const hash=await digest(new TextEncoder().encode(payload).buffer as ArrayBuffer);
  const auth=await authorize('pickup-save',account,hash,address);
  await api('/api/pickup/details',{auth,payload});
}
export async function pickupDetails(account:Address,address:Address,lot:Lot){
  const auth=await authorize('pickup-read',account,lot.evidence,address);
  return api('/api/pickup/details',{auth,id:lot.id}) as Promise<{contact:string;address:string}>;
}
export function distanceKm(a:[number,number],b:[number,number]){const rad=Math.PI/180;const dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));}
