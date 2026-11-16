import { concatHex, encodeDeployData, encodeFunctionData, formatEther, getContractAddress, keccak256, stringToHex, TransactionNotFoundError, TransactionReceiptNotFoundError, type Abi, type Address, type Hash, type TransactionReceipt } from 'viem';
import { publicClient } from './chain';
import { assertWallet, chain, getWalletName } from './wallet';
import { tr } from './settings';
import { pickupAbi, pickupBytecode, pickupRuntimeHash, pickupImmutables, forwarderAbi, forwarderBytecode, forwarderRuntimeHash, forwarderImmutables, certificateAbi } from './generated/pickup';
import { authorize, uploadEvidence } from './evidence';
import pickupRuntime from '../config/pickup-runtime.json';

export type Lot = {id:number; owner:Address; collector:Address; estimated:number[]; actual:number[]; evidence:Hash; latitude:number; longitude:number; updatedAt:number; status:number; deposit?:number; paid?:number; paymentEco?:string};
export const lotStatuses=['Không tồn tại','Chờ thu gom','Đã nhận việc','Chờ chủ lô xác nhận','Hoàn tất','Đã hủy'];
export const ZERO='0x0000000000000000000000000000000000000000' as Address;
/** Actions for which the EcoLoop relayer pays gas. */
export const GASLESS_FUNCTIONS=new Set(['createLot','claimLot','proposeLot','acceptLot','disputeLot','cancelLot','releaseLot','redeemReward','transfer']);
const RELAY_GAS:Record<string,bigint>={createLot:450_000n,claimLot:350_000n,proposeLot:250_000n,acceptLot:800_000n,disputeLot:150_000n,cancelLot:120_000n,releaseLot:200_000n,redeemReward:250_000n,transfer:150_000n};
const pendingKey=`ecoloop-pickup-pending-${chain.id}`;
const forwarderKey=`ecoloop-forwarder-${chain.id}`;
const deploymentProxy='0x4e59b44847b379578588920cA78FbF26c0B4956C';
const deploymentProxyHash='0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989';
export function pendingPickup():Hash|undefined {return localStorage.getItem(pendingKey) as Hash||undefined;}
function settleReceipt(result:TransactionReceipt, hash:Hash, replaced=false){
  if(pendingPickup()===hash)localStorage.removeItem(pendingKey);
  if(replaced)throw new Error('Giao dịch đã bị hủy hoặc thay bằng thao tác khác trong ví. Hãy làm mới dữ liệu trước khi thử lại.');
  if(result.status!=='success')throw new Error('Giao dịch thu gom thất bại. Dữ liệu chưa thay đổi.');
  return result;
}
async function receipt(hash:Hash){
  let replaced=false;
  let trackedHash=hash;
  const r=await publicClient.waitForTransactionReceipt({hash,timeout:120000,onReplaced:({transaction,reason})=>{
    if(pendingPickup()===trackedHash)localStorage.setItem(pendingKey,transaction.hash);
    trackedHash=transaction.hash;
    replaced=reason!=='repriced';
  }});
  return settleReceipt(r,trackedHash,replaced);
}
export async function checkPendingPickup(hash:Hash){
  try{
    const result=await publicClient.getTransactionReceipt({hash});
    return {status:'confirmed',receipt:settleReceipt(result,hash)} as const;
  }catch(error){if(!(error instanceof TransactionReceiptNotFoundError))throw error;}
  try{
    await publicClient.getTransaction({hash});
    return {status:'pending'} as const;
  }catch(error){
    if(!(error instanceof TransactionNotFoundError))throw error;
    return {status:'unseen'} as const;
  }
}
export async function dismissUnseenPickup(hash:Hash) {
  const result=await checkPendingPickup(hash);
  if(result.status==='unseen'&&pendingPickup()===hash)localStorage.removeItem(pendingKey);
  return result;
}
/** keccak256 of deployed code with immutable values (set at deploy time) zeroed, comparable to the compiled runtime hash. */
export function codeHash(code:Hash|undefined,immutables:[number,number][]){
  if(!code||code==='0x')return undefined;
  let hex=code.slice(2);
  for(const [start,length] of immutables)hex=hex.slice(0,start*2)+'0'.repeat(length*2)+hex.slice((start+length)*2);
  return keccak256(`0x${hex}`);
}
export async function pickupAccess(address:Address){
  const code=await publicClient.getCode({address});
  if(codeHash(code,pickupImmutables)===pickupRuntimeHash)return 'public';
  if(codeHash(code,[])===pickupRuntime.roleRestrictedEco)return 'restricted';
}
export async function isPickupV4(address:Address){
  return !!await pickupAccess(address);
}
export async function validatePickup(address:Address){
  if(await publicClient.getChainId()!==chain.id)throw new Error('RPC đang trỏ sai mạng.');
  if(!await isPickupV4(address))throw new Error('Địa chỉ không phải contract Thu gom EcoLoop V4.');
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
      const id=Number(count)-i-j;
      const [l,payment]=await Promise.all([read('getLot',[BigInt(id)]),read('lotPaymentValue',[BigInt(id)])]);
      return {...l,id,estimated:l.estimated.map(Number),actual:l.actual.map(Number),latitude:l.latitude/100,longitude:l.longitude/100,updatedAt:Number(l.updatedAt)*1000,deposit:Number(formatEther(l.deposit)),paid:Number(formatEther(l.paid)),paymentEco:formatEther(payment)} as Lot;
    })));
  }
  return {lots,count:Number(count),paused:!!paused,
    prices:(prices as bigint[]).map(p=>Number(formatEther(p))),certificate:certificate as Address};
}
export async function pickupReadWallet(address:Address,account:Address){
  const read=readFrom(address);
  const [balance,collector,admin]=await Promise.all([
    read('balanceOf',[account]),
    read('hasRole',[keccak256(stringToHex('COLLECTOR_ROLE')),account]),
    read('hasRole',['0x'+'0'.repeat(64),account]),
  ]);
  return {balance:Number(formatEther(balance)),balanceAtomic:balance as bigint,collector:!!collector,admin:!!admin};
}
/** ECO base units the collector must lock to claim this lot (estimate value + 20%). */
export async function requiredDeposit(address:Address,id:number):Promise<bigint>{return readFrom(address)('requiredDeposit',[BigInt(id)]);}
export async function payoutPreview(address:Address,lot:Lot):Promise<bigint>{
  return readFrom(address)('quotedPayout',[BigInt(lot.id)]);
}
export async function exchangeState(address:Address) {
  const [rate,inventory]=await Promise.all([
    publicClient.readContract({address,abi:pickupAbi,functionName:'ecoPerAvax'}),
    publicClient.readContract({address,abi:pickupAbi,functionName:'exchangeInventory'}),
  ]);
  return {rate,inventory};
}
async function checkPickupFunds(address:Address,account:Address,functionName:string,args:unknown[],value=0n,abi:Abi=pickupAbi){
  const sponsored=import.meta.env.VITE_SPONSOR_GAS==='true'&&getWalletName()==='Ví Google';
  if(sponsored&&value===0n)return;
  let balance=await publicClient.getBalance({address:account});
  const feeBuffer=2_000_000_000_000_000n;
  if(balance<value+feeBuffer&&value<=50_000_000_000_000_000n){
    try{
      await api('/api/relay/stipend',{account,needed:(value+feeBuffer*2n).toString()});
      balance=await publicClient.getBalance({address:account});
    }catch{/* fall through to standard balance check */}
  }
  const feeError='Ví chưa đủ AVAX trên Fuji để trả phí. Nạp AVAX testnet vào đúng địa chỉ ví đang kết nối.';
  if(balance<value)throw new Error(tr('Ví chưa đủ AVAX cho số ECO cần đổi.'));
  if(sponsored)return;
  if(balance===0n)throw new Error(tr(feeError));
  const [gas,gasPrice]=await Promise.all([
    publicClient.estimateContractGas({address,abi,functionName,args,account,value} as never),
    publicClient.getGasPrice(),
  ]);
  if(balance<value+gas*gasPrice){
    throw new Error(tr(value>0n?'Ví cần đủ AVAX để đổi ECO và trả phí mạng.':feeError));
  }
}
export async function fundRelayer(account:Address,relayer:Address,value:bigint){
  if(pendingPickup())throw new Error('Có giao dịch thu gom đang chờ. Kiểm tra giao dịch trước khi gửi tiếp.');
  const wallet=await assertWallet(account);
  const hash=await wallet.sendTransaction({account,to:relayer,value,chain});
  localStorage.setItem(pendingKey,hash);
  await receipt(hash);
  return hash;
}
export async function pickupWrite(address:Address,account:Address,functionName:string,args:unknown[]=[],value?:bigint,abi:Abi=pickupAbi){
  if(pendingPickup())throw new Error('Có giao dịch thu gom đang chờ. Kiểm tra giao dịch trước khi gửi tiếp.');
  const wallet=await assertWallet(account);
  await checkPickupFunds(address,account,functionName,args,value,abi);
  const {request}=await publicClient.simulateContract({address,abi,functionName,args,account,...(value!==undefined?{value}:{})} as never);
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
  if(import.meta.env.VITE_SPONSOR_GAS==='true'&&getWalletName()==='Ví Google'){
    const proxyCode=await publicClient.getCode({address:deploymentProxy});
    if(!proxyCode||keccak256(proxyCode)!==deploymentProxyHash)throw new Error(tr('Mạng hiện tại chưa hỗ trợ triển khai từ ví Google được tài trợ gas.'));
    // ERC-4337 sends calls to an existing contract. The proxy creates the new contracts via CREATE2.
    const salt=keccak256(stringToHex(`EcoLoop Pickup V4:${account.toLowerCase()}`));
    const deploy=async(initCode:Hash)=>{
      const address=getContractAddress({opcode:'CREATE2',from:deploymentProxy,salt,bytecode:initCode});
      const existing=await publicClient.getCode({address});
      if(existing&&existing!=='0x')return {address};
      const hash=await wallet.sendTransaction({to:deploymentProxy,data:concatHex([salt,initCode])});
      localStorage.setItem(pendingKey,hash);
      const result=await receipt(hash);
      return {address,block:result.blockNumber};
    };
    const {address:forwarder}=await deploy(forwarderBytecode);
    if(codeHash(await publicClient.getCode({address:forwarder}),forwarderImmutables)!==forwarderRuntimeHash)throw new Error(tr('Không xác minh được contract Forwarder sau khi triển khai.'));
    const {address,block}=await deploy(encodeDeployData({abi:pickupAbi,bytecode:pickupBytecode,args:[account,forwarder,0n,0n]}));
    await validatePickup(address);
    rememberDeployment(address,block);
    return address;
  }
  let forwarder=localStorage.getItem(forwarderKey) as Address|null;
  const code=forwarder?await publicClient.getCode({address:forwarder}):undefined;
  if(!forwarder||codeHash(code,forwarderImmutables)!==forwarderRuntimeHash){
    const fHash=await wallet.deployContract({abi:forwarderAbi,bytecode:forwarderBytecode,args:[]} as never);
    localStorage.setItem(pendingKey,fHash);
    const fr=await receipt(fHash);if(!fr.contractAddress)throw new Error('Chưa nhận được địa chỉ contract.');
    forwarder=fr.contractAddress as Address;localStorage.setItem(forwarderKey,forwarder);
  }
  const hash=await wallet.deployContract({abi:pickupAbi,bytecode:pickupBytecode,args:[account,forwarder,0n,0n]} as never);
  localStorage.setItem(pendingKey,hash);
  const r=await receipt(hash);if(!r.contractAddress)throw new Error('Chưa nhận được địa chỉ contract.');
  rememberDeployment(r.contractAddress,r.blockNumber);
  return r.contractAddress;
}
function rememberDeployment(address:Address,block?:bigint){
  const addressKey=`ecoloop-pickup-deployed-${chain.id}`;
  const blockKey=`ecoloop-pickup-deployblock-${chain.id}`;
  if(block!==undefined)localStorage.setItem(blockKey,String(block));
  else if(localStorage.getItem(addressKey)?.toLowerCase()!==address.toLowerCase())localStorage.removeItem(blockKey);
  localStorage.setItem(addressKey,address);
}
export async function activatePickup(account:Address,address:Address){
  if(!await isPickupV4(address))throw new Error('Địa chỉ không phải contract Thu gom EcoLoop V4.');
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
  await savePickupDetails(account,address,evidence,contact,location);
}
export async function savePickupDetails(account:Address,address:Address,evidence:Hash,contact:string,location:string,lotId?:number){
  const payload=JSON.stringify({evidence,contact,address:location,lotId});
  const hash=await digest(new TextEncoder().encode(payload).buffer as ArrayBuffer);
  const auth=await authorize('pickup-save',account,hash,address);
  await api('/api/pickup/details',{auth,payload});
}
export async function pickupDetails(account:Address,address:Address,lot:Lot){
  const auth=await authorize('pickup-read',account,lot.evidence,address);
  return api('/api/pickup/details',{auth,id:lot.id}) as Promise<{contact:string;address:string}>;
}
export function distanceKm(a:[number,number],b:[number,number]){const rad=Math.PI/180;const dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));}
