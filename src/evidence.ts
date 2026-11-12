import type { Address } from 'viem';
import { getContractAddress } from './chain';
import { assertWallet } from './wallet';
async function checked(response: Response) {if(!response.ok){let message='Không kết nối được server lưu ảnh.';try{message=(await response.json()).error||message;}catch{/* Keep friendly error. */}throw new Error(message);}return response;}
export async function authorize(action:'upload'|'read'|'pickup-save'|'pickup-read'|'configure-pickup',account:Address,hash:string,contract=getContractAddress()){
  if(!contract)throw new Error('Chưa chọn contract.');
  const identity={action,account,contract,hash};
  const response=await checked(await fetch('/api/evidence/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(identity)}));
  const {nonce,message}=await response.json();
  const wallet=await assertWallet(account);const signature=await wallet.signMessage({message});
  return {...identity,nonce,signature};
}
export async function uploadEvidence(account:Address,file:File,hash:string,contract?:Address){
  const auth=await authorize('upload',account,hash,contract);
  await checked(await fetch('/api/evidence/upload',{method:'POST',headers:{'Content-Type':file.type,'X-EcoLoop-Auth':btoa(JSON.stringify(auth))},body:file}));
}
export async function viewEvidence(account:Address,hash:string,contract?:Address,id?:number){
  const auth=await authorize('read',account,hash,contract);
  const response=await checked(await fetch('/api/evidence/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...auth,id})}));
  return URL.createObjectURL(await response.blob());
}
