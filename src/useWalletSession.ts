import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {isAddress,type Address} from 'viem';
import {chain,connectWallet,disconnectWallet,discoverWallets,getProvider,getWalletName,subscribeWallets,walletSnapshot,switchNetwork} from './wallet';
import type {AccountRole} from './passwordWallet';
import {lazyImport} from './chunkReload';

export const ADMIN_WALLET = '0xcCb958ed2931073568359336344088A914f57098';
export function isDesignatedAdminWallet(address?: string): boolean {
  return !!address && address.toLowerCase() === ADMIN_WALLET.toLowerCase();
}

export function useWalletSession(){
 const wallets=useSyncExternalStore(subscribeWallets,walletSnapshot);
 const [account,setAccount]=useState<Address>();
 const [email,setEmail]=useState<string>();
 const [accountRole,setAccountRole]=useState<AccountRole>();
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
 async function connect(kind:string,restore=false,chosenRole?:AccountRole){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');const token=++operation.current;
  try{
   let nextEmail:string|undefined;
   let nextRole:AccountRole|undefined=chosenRole;
   if(kind==='google'){const api=await lazyImport(()=>import('./googleWallet'));await api.connectGoogle(restore);nextEmail=api.googleEmail();}
   else if(kind==='password-restore'){
    const api=await lazyImport(()=>import('./passwordWallet'));
    const restored=await api.restorePasswordAccount();
    if(!restored)throw new Error('Phiên đăng nhập đã hết hạn.');
    nextEmail=restored.username;
    nextRole=restored.role;
   }
   else await connectWallet(kind);
   const result=await load();if(!result)throw new Error('Không đọc được tài khoản ví.');
   if(token!==operation.current)return;
   setAccount(result.address);setNetwork(result.id);setName(result.name);setEmail(nextEmail);
   if(nextRole)setAccountRole(nextRole);
  }catch(e){if(token===operation.current){await Promise.resolve(disconnectWallet()).catch(()=>{});setAccount(undefined);setEmail(undefined);setAccountRole(undefined);if(!restore)setError(e instanceof Error?e.message:'Không kết nối được ví. Hãy thử lại.');}}
  finally{locked.current=false;setBusy(false);}
 }
 async function connectWithPassword(options:{mode:'login'|'register';username:string;password:string;role:AccountRole}){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');const token=++operation.current;
  try{
   const api=await lazyImport(()=>import('./passwordWallet'));
   const auth=await api.connectPasswordAccount(options);
   const result=await load();if(!result)throw new Error('Không đọc được tài khoản ví.');
   if(token!==operation.current)return;
   setAccount(result.address);setNetwork(result.id);setName(result.name);setEmail(auth.username);setAccountRole(auth.role);
  }catch(e){if(token===operation.current){await Promise.resolve(disconnectWallet()).catch(()=>{});setAccount(undefined);setEmail(undefined);setAccountRole(undefined);setError(e instanceof Error?e.message:'Không đăng nhập được tài khoản.');}}
  finally{locked.current=false;setBusy(false);}
 }
 async function logout(){if(locked.current)return;operation.current++;locked.current=true;setBusy(true);setAccount(undefined);setEmail(undefined);setAccountRole(undefined);setNetwork(undefined);setName('');setError('');try{await disconnectWallet();}catch{setError('Đã ngắt kết nối ứng dụng nhưng chưa kết thúc được phiên ví Google. Hãy thử lại từ nhà cung cấp.');}finally{locked.current=false;setBusy(false);}}
 useEffect(()=>{
  discoverWallets();
  const savedWallet=localStorage.getItem('ecoloop-wallet');
  if(googleConfigured&&savedWallet==='ecoloop.google')void connect('google',true);
  else if(savedWallet==='ecoloop.password')void connect('password-restore',true);
 },[googleConfigured]);
 useEffect(()=>{
  const provider=getProvider();if(!provider||!account)return;
  const changed=()=>{setAccount(undefined);setEmail(undefined);setAccountRole(undefined);setError('Tài khoản ví đã thay đổi. Kết nối lại để xác nhận tài khoản mới.');};
  const chainChanged=(id:unknown)=>setNetwork(Number(id));
  const disconnected=()=>{setAccount(undefined);setEmail(undefined);setAccountRole(undefined);setNetwork(undefined);};
  provider.on?.('accountsChanged',changed);provider.on?.('chainChanged',chainChanged);provider.on?.('disconnect',disconnected);
  return()=>{provider.removeListener?.('accountsChanged',changed);provider.removeListener?.('chainChanged',chainChanged);provider.removeListener?.('disconnect',disconnected);};
 },[account]);
 async function switchChain(){setBusy(true);setError('');try{await switchNetwork();setNetwork(chain.id);}catch(e){setError(e instanceof Error?e.message:'Không đổi được mạng ví.');}finally{setBusy(false);}}
 return {account,email,accountRole,name,busy,error,network,googleConfigured,wallets,connect,connectWithPassword,logout,switchChain,chain,refresh:discoverWallets};
}
