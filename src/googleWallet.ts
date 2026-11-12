import {createThirdwebClient,defineChain} from 'thirdweb';
import {inAppWallet,getUserEmail} from 'thirdweb/wallets/in-app';
import {EIP1193} from 'thirdweb/wallets';
import {chain,registerEmbedded,type Provider} from './wallet';
import type {Address} from 'viem';

let email: string | undefined;
export function googleEmail(){return email;}
export async function connectGoogle(restore=false):Promise<Address>{
  const clientId=import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
  if(!clientId)throw new Error('Đơn vị tổ chức chưa cấu hình đăng nhập Google. Bạn có thể dùng Core.');
  const client=createThirdwebClient({clientId});
  const network=defineChain(chain.id);
  const sponsored=import.meta.env.VITE_SPONSOR_GAS==='true';
  // EIP-4337 does not require EIP-7702 support on the selected chain.
  const wallet=inAppWallet({auth:{options:['google'],mode:'popup'},executionMode:sponsored?{mode:'EIP4337',smartAccount:{chain:network,sponsorGas:true}}:{mode:'EOA'}});
  const account=restore?await wallet.autoConnect({client,chain:network}):await wallet.connect({client,chain:network,strategy:'google'});
  email=await getUserEmail({client}).catch(()=>undefined);
  const provider=EIP1193.toProvider({wallet,chain:network,client});
  registerEmbedded(provider as unknown as Provider,async()=>{await wallet.disconnect();email=undefined;});
  return account.address as Address;
}
