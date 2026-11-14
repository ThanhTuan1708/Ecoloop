import { encodeFunctionData, formatEther, keccak256, stringToHex, type Address, type Hash } from 'viem';
import { publicClient } from './chain';
import { assertWallet, chain } from './wallet';
import { pickupAbi, pickupBytecode, pickupRuntimeHash, pickupImmutables, forwarderAbi, forwarderBytecode, forwarderRuntimeHash, forwarderImmutables, certificateAbi } from './generated/pickup';
import { authorize, uploadEvidence } from './evidence';
import previousPickup from '../config/pickup-v3.json';

export type Lot = {id:number; owner:Address; collector:Address; estimated:number[]; actual:number[]; evidence:Hash; latitude:number; longitude:number; updatedAt:number; status:number; deposit?:number; paid?:number};
export const lotStatuses=['Không tồn tại','Chờ thu gom','Đã nhận việc','Chờ chủ lô xác nhận','Hoàn tất','Đã hủy'];
export const ZERO='0x0000000000000000000000000000000000000000' as Address;
/** Household actions the EcoLoop relayer pays gas for. Collectors lock AVAX and pay their own gas. */
export const GASLESS_FUNCTIONS=new Set(['createLot','acceptLot','disputeLot','cancelLot','releaseLot','redeemReward','transfer']);
const RELAY_GAS:Record<string,bigint>={createLot:450_000n,acceptLot:800_000n,disputeLot:150_000n,cancelLot:120_000n,releaseLot:200_000n,redeemReward:250_000n,transfer:150_000n};
const pendingKey=`ecoloop-pickup-pending-${chain.id}`;
const forwarderKey=`ecoloop-forwarder-${chain.id}`;
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
/** keccak256 of deployed code with immutable values (set at deploy time) zeroed, comparable to the compiled runtime hash. */
export function codeHash(code:Hash|undefined,immutables:[number,number][]){
  if(!code||code==='0x')return undefined;
  let hex=code.slice(2);
  for(const [start,length] of immutables)hex=hex.slice(0,start*2)+'0'.repeat(length*2)+hex.slice((start+length)*2);
  return keccak256(`0x${hex}`);
}
export async function pickupVersion(address:Address):Promise<'v4'|'v3'|'legacy'>{
  const code=await publicClient.getCode({address});
  if(codeHash(code,pickupImmutables)===pickupRuntimeHash)return 'v4';
  return codeHash(code,previousPickup.immutables as [number,number][])===previousPickup.runtimeHash?'v3':'legacy';
}
export async function validatePickup(address:Address){
  if(await publicClient.getChainId()!==chain.id)throw new Error('RPC đang trỏ sai mạng.');
  if(await pickupVersion(address)==='legacy')throw new Error('Địa chỉ không phải contract Thu gom EcoLoop V4.');
}
const readFrom=(address:Address)=>(functionName:string,args:unknown[]=[])=>publicClient.readContract({address,abi:pickupAbi,functionName,args} as never) as Promise<any>;
export async function pickupRead(address:Address,limit=100){
  await validatePickup(address);
  const read=readFrom(address);
  const [count,paused,prices,certificate]=await Promise.all([
    read('lotCount'),read('paused'),
    Promise.all([0,1,2,3].map(i=>read('pricePerKg',[BigInt(i)]))),read('certificate')]);
  const lots:Lot[]=[];
  for(let i=0;i<Math.min(Number(count),limit);i+=10){
    lots.push(...await Promise.all(Array.from({length:Math.min(10,Number(count)-i,limit-i)},async(_,j)=>{
      const id=Number(count)-i-j;const l=await read('getLot',[BigInt(id)]);
      return {...l,id,estimated:l.estimated.map(Number),actual:l.actual.map(Number),latitude:l.latitude/100,longitude:l.longitude/100,updatedAt:Number(l.updatedAt)*1000,deposit:Number(formatEther(l.deposit)),paid:Number(formatEther(l.paid))} as Lot;
    })));
  }
  return {lots,count:Number(count),paused:!!paused,
    prices:(prices as bigint[]).map(p=>Number(formatEther(p))),certificate:certificate as Address};
}
export async function pickupReadWallet(address:Address,account:Address){
  const read=readFrom(address);
  const [balance,collector,admin,pending]=await Promise.all([
    read('balanceOf',[account]),
    read('hasRole',[keccak256(stringToHex('COLLECTOR_ROLE')),account]),
    read('hasRole',['0x'+'0'.repeat(64),account]),
    read('pendingWithdrawals',[account]),
  ]);
  return {balance:Number(formatEther(balance)),collector:!!collector,admin:!!admin,pending:Number(formatEther(pending))};
}
/** AVAX (wei) the collector must lock to claim this lot (estimate value + 20%). */
export async function requiredDeposit(address:Address,id:number):Promise<bigint>{return readFrom(address)('requiredDeposit',[BigInt(id)]);}
/** AVAX (wei) the household receives for the proposed weights, capped at the locked deposit. */
export async function payoutPreview(address:Address,lot:Lot):Promise<bigint>{
  const value:bigint=await readFrom(address)('quote',[lot.actual.map(BigInt)]);
  const deposit:bigint=(await readFrom(address)('getLot',[BigInt(lot.id)])).deposit;
  return value<deposit?value:deposit;
}
export async function pickupWrite(address:Address,account:Address,functionName:string,args:unknown[]=[],value?:bigint){
  if(pendingPickup())throw new Error('Có giao dịch thu gom đang chờ. Kiểm tra giao dịch trước khi gửi tiếp.');
  const wallet=await assertWallet(account);
  const {request}=await publicClient.simulateContract({address,abi:pickupAbi,functionName,args,account,...(value!==undefined?{value}:{})} as never);
  const hash=await wallet.writeContract(request as never);localStorage.setItem(pendingKey,hash);
  await receipt(hash);return hash;
}
/** Gas-free household action: the wallet signs an EIP-712 request, the EcoLoop relayer pays the gas. */
export async function relayWrite(address:Address,account:Address,functionName:string,args:unknown[]=[]){
  if(!GASLESS_FUNCTIONS.has(functionName))throw new Error('Thao tác này không hỗ trợ miễn phí gas.');
  if(pendingPickup())throw new Error('Có giao dịch thu gom đang chờ. Kiểm tra giao dịch trước khi gửi tiếp.');
  // Simulate as the household first so contract errors show before anything is signed.
  await publicClient.simulateContract({address,abi:pickupAbi,functionName,args,account} as never);
  const forwarder=await readFrom(address)('trustedForwarder') as Address;
  const nonce=await publicClient.readContract({address:forwarder,abi:forwarderAbi,functionName:'nonces',args:[account]}) as bigint;
  const data=encodeFunctionData({abi:pickupAbi,functionName,args} as never);
  const gas=RELAY_GAS[functionName];const deadline=Math.floor(Date.now()/1000)+600;
  const wallet=await assertWallet(account);
  const signature=await wallet.signTypedData({account,domain:{name:'EcoLoopForwarder',version:'1',chainId:chain.id,verifyingContract:forwarder},
    types:{ForwardRequest:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'gas',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint48'},{name:'data',type:'bytes'}]},
    primaryType:'ForwardRequest',message:{from:account,to:address,value:0n,gas,nonce,deadline,data}});
  const {hash}=await api('/api/relay',{request:{from:account,to:address,value:'0',gas:gas.toString(),deadline,data,signature}}) as {hash:Hash};
  localStorage.setItem(pendingKey,hash);
  await receipt(hash);return hash;
}
/** Household actions go through the relayer when it is available; otherwise the wallet pays gas. */
export async function householdWrite(address:Address,account:Address,functionName:string,args:unknown[],gasless:boolean){
  return gasless&&GASLESS_FUNCTIONS.has(functionName)?relayWrite(address,account,functionName,args):pickupWrite(address,account,functionName,args);
}
/** Deploys the V4 suite: forwarder (gas-free relay) then pickup (which creates the certificate NFT contract). */
export async function deployPickup(account:Address){
  if(pendingPickup())throw new Error('Kiểm tra giao dịch đang chờ trước.');
  const wallet=await assertWallet(account);
  let forwarder=localStorage.getItem(forwarderKey) as Address|null;
  const code=forwarder?await publicClient.getCode({address:forwarder}):undefined;
  if(!forwarder||codeHash(code,forwarderImmutables)!==forwarderRuntimeHash){
    const fHash=await wallet.deployContract({abi:forwarderAbi,bytecode:forwarderBytecode,args:[]} as never);
    localStorage.setItem(pendingKey,fHash);
    const fr=await receipt(fHash);if(!fr.contractAddress)throw new Error('Chưa nhận được địa chỉ contract.');
    forwarder=fr.contractAddress as Address;localStorage.setItem(forwarderKey,forwarder);
  }
  const hash=await wallet.deployContract({abi:pickupAbi,bytecode:pickupBytecode,args:[account,forwarder]} as never);
  localStorage.setItem(pendingKey,hash);
  const r=await receipt(hash);if(!r.contractAddress)throw new Error('Chưa nhận được địa chỉ contract.');
  localStorage.setItem(`ecoloop-pickup-deployed-${chain.id}`,r.contractAddress);
  // The deploy block lets the server index this contract's history (wallet card) from the start.
  localStorage.setItem(`ecoloop-pickup-deployblock-${chain.id}`,String(r.blockNumber));
  return r.contractAddress;
}
export async function activatePickup(account:Address,address:Address){
  if(await pickupVersion(address)!=='v4')throw new Error('Địa chỉ không phải contract Thu gom EcoLoop V4.');
  const auth=await authorize('configure-pickup',account,keccak256(stringToHex(address)),address);
  const deployBlock=Number(localStorage.getItem(`ecoloop-pickup-deployblock-${chain.id}`)||0);
  await api('/api/pickup/configure',{...auth,...(deployBlock>0&&localStorage.getItem(`ecoloop-pickup-deployed-${chain.id}`)?.toLowerCase()===address.toLowerCase()?{deployBlock}:{})});
}
export type CertificateView={image:string;name:string;attributes:{trait_type:string;value:string|number}[];contract:Address;id:number};
/** Reads the on-chain certificate NFT (metadata and SVG are stored on-chain). */
export async function readCertificate(certificate:Address,id:number):Promise<CertificateView|undefined>{
  try{
    const uri=await publicClient.readContract({address:certificate,abi:certificateAbi,functionName:'tokenURI',args:[BigInt(id)]}) as string;
    const json=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0))));
    return {image:json.image,name:json.name,attributes:json.attributes||[],contract:certificate,id};
  }catch{return undefined;}
}
export function certificateUrl(certificate:Address,id:number){return `${chain.blockExplorers?.default.url||'https://testnet.snowtrace.io'}/nft/${certificate}/${id}`;}
export function addressUrl(address:Address){return `${chain.blockExplorers?.default.url||'https://testnet.snowtrace.io'}/address/${address}`;}
export async function api(path:string,data:unknown){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(60000)});
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
