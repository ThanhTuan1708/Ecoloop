import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {isAddress,type Address} from 'viem';
import {chain,connectWallet,disconnectWallet,discoverWallets,getProvider,getWalletName,subscribeWallets,walletSnapshot,switchNetwork} from './wallet';

export function useWalletSession(){
 const wallets=useSyncExternalStore(subscribeWallets,walletSnapshot);
 const [account,setAccount]=useState<Address>();
 const [email,setEmail]=useState<string>();
 const [name,setName]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [network,setNetwork]=useState<number>();
 const operation=useRef(0);
 const locked=useRef(false);
 const googleConfigured=!!import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
 async function load(){
  const provider=getProvider();if(!provider)return;
  const [accounts,id]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
  const address=accounts[0];
  if(!address||!isAddress(address))throw new Error('Ví đã khóa hoặc chưa cấp quyền truy cập tài khoản.');
  return {address,id:Number(id),name:getWalletName()};
 }
 async function connect(kind:'google'|string){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');const token=++operation.current;
  try{
   let nextEmail:string|undefined;
   if(kind==='google'){const api=await import('./googleWallet');await api.connectGoogle();nextEmail=api.googleEmail();}
   else await connectWallet(kind);
   const result=await load();if(!result)throw new Error('Không đọc được tài khoản ví.');
   if(token!==operation.current)return;
   setAccount(result.address);setNetwork(result.id);setName(result.name);setEmail(nextEmail);
  }catch(e){if(token===operation.current){await Promise.resolve(disconnectWallet()).catch(()=>{});setAccount(undefined);setEmail(undefined);setError(e instanceof Error?e.message:'Không kết nối được ví. Hãy thử lại.');}}
  finally{locked.current=false;setBusy(false);}
 }
 async function logout(){if(locked.current)return;operation.current++;locked.current=true;setBusy(true);setAccount(undefined);setEmail(undefined);setNetwork(undefined);setName('');setError('');try{await disconnectWallet();}catch{setError('Đã ngắt kết nối ứng dụng nhưng chưa kết thúc được phiên ví Google. Hãy thử lại từ nhà cung cấp.');}finally{locked.current=false;setBusy(false);}}
 useEffect(()=>{discoverWallets();},[]);
 useEffect(()=>{
  const provider=getProvider();if(!provider||!account)return;
  const changed=()=>{setAccount(undefined);setEmail(undefined);setError('Tài khoản ví đã thay đổi. Kết nối lại để xác nhận tài khoản mới.');};
  const chainChanged=(id:unknown)=>setNetwork(Number(id));
  const disconnected=()=>{setAccount(undefined);setEmail(undefined);setNetwork(undefined);};
  provider.on?.('accountsChanged',changed);provider.on?.('chainChanged',chainChanged);provider.on?.('disconnect',disconnected);
  return()=>{provider.removeListener?.('accountsChanged',changed);provider.removeListener?.('chainChanged',chainChanged);provider.removeListener?.('disconnect',disconnected);};
 },[account]);
 async function switchChain(){setBusy(true);setError('');try{await switchNetwork();setNetwork(chain.id);}catch(e){setError(e instanceof Error?e.message:'Không đổi được mạng ví.');}finally{setBusy(false);}}
 return {account,email,name,busy,error,network,googleConfigured,wallets,connect,logout,switchChain,chain,refresh:discoverWallets};
}
