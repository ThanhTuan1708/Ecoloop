import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ChevronDown,Gift,LogOut,PackageCheck,Plus,Recycle,RefreshCw,Settings,ShieldCheck,Truck,Wallet,X} from 'lucide-react';
import {zeroHash} from 'viem';
import {useWalletSession} from './useWalletSession';
import {getContractAddress,initializeConfiguration,publicClient} from './chain';
import {abi} from './generated/abi';
import {short} from './model';
import Pickup from './Pickup';
import SettingsPanel from './SettingsPanel';
import WalletCard from './WalletCard';
import {tr,useSettings} from './settings';
import './web.css';
import './mobile.css';
import './onchain.css';
import './theme-dark.css';
import './settings.css';

type Page='home'|'post'|'orders'|'wallet'|'rewards'|'settings';
type AccountDialog='account'|'post'|'claim';
const PickupMap=lazy(()=>import('./PickupMap'));

export default function EcoLoopWeb(){
  const prefs=useSettings();
  const session=useWalletSession();
  const [page,setPage]=useState<Page>('home');
  const [profile,setProfile]=useState<AccountDialog>();
  const [admin,setAdmin]=useState(false);
  const [configError,setConfigError]=useState('');
  const [configVersion,setConfigVersion]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const content=useRef<HTMLDivElement>(null);
  const links=[
    {id:'home',label:tr('Tìm lô'),icon:Truck},
    {id:'orders',label:tr('Đơn của tôi'),icon:PackageCheck},
    {id:'wallet',label:tr('Ví xanh'),icon:Wallet},
    {id:'rewards',label:tr('Đổi quà'),icon:Gift},
    {id:'settings',label:tr('Thiết lập'),icon:Settings},
  ] as const;

  useEffect(()=>{
    let active=true;
    setAdmin(false);
    setConfigError('');
    void (async()=>{
      try{
        await initializeConfiguration();
        const contract=getContractAddress();
        if(!contract||!session.account)return;
        const isAdmin=await publicClient.readContract({address:contract,abi,functionName:'hasRole',args:[zeroHash,session.account]});
        if(active)setAdmin(!!isAdmin);
      }catch(e){
        if(active)setConfigError(e instanceof Error?e.message:tr('Chưa đọc được cấu hình hệ thống.'));
      }
    })();
    return()=>{active=false;};
  },[session.account,configVersion]);
  useEffect(()=>{
    if(profile)dialog.current?.showModal();
    else dialog.current?.close();
  },[profile]);
  useEffect(()=>{
    if(session.account)setProfile(undefined);
  },[session.account]);

  function navigate(next:Page){
    if(next===page)return;
    setPage(next);
    content.current?.scrollTo({top:0,behavior:prefs.reduceMotion?'auto':'smooth'});
  }
  function post(){navigate('post');}
  function openAccount(){setProfile('account');}

  return <div className="ecoloop-web">
    <aside className="web-sidebar">
      <button className="web-brand" onClick={()=>navigate('home')}><Recycle/>ecoloop<span>.</span></button>
      <button className="web-post" onClick={post}><Plus size={18}/>{tr('Đăng lô phế liệu')}</button>
      <nav aria-label={tr('Điều hướng desktop')}>{links.map(n=><button key={n.id} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)}><n.icon size={19}/>{n.label}</button>)}</nav>
    </aside>
    <div className="web-main">
      <header className="web-header">
        <button className="web-brand" onClick={()=>navigate('home')}><Recycle/>ecoloop<span>.</span></button>
        <div className="web-header-actions">
          <button className="web-account" onClick={()=>session.account?openAccount():navigate('wallet')}><Wallet size={17}/>{session.account?tr('Tài khoản'):tr('Ví xanh')}<ChevronDown size={14}/></button>
          <button className="web-header-settings" aria-label={tr('Thiết lập')} aria-current={page==='settings'?'page':undefined} onClick={()=>navigate('settings')}><Settings size={19}/></button>
        </div>
      </header>
      {session.account&&session.network!==session.chain.id&&<div className="web-network warn"><ShieldCheck size={13}/>{tr('Ví đang ở sai mạng')}<button disabled={session.busy} onClick={()=>void session.switchChain()}>{tr('Chuyển về Fuji')}</button></div>}
      <div className="web-content" ref={content}>
        {configError&&<div className="web-warning" role="alert">{tr(configError)}<button onClick={()=>setConfigVersion(v=>v+1)}><RefreshCw size={14}/>{tr('Thử lại')}</button></div>}
        <Pickup account={session.account} admin={admin} page={page}
          onConnect={reason=>setProfile(reason||'account')} onOpenOrders={()=>navigate('orders')}
          onSettings={()=>navigate('settings')} onBrowse={()=>navigate('home')} onPost={post}
          walletSlot={<WalletCard account={session.account} holder={session.email||session.name} onConnect={openAccount}/>}>
          <SettingsPanel account={session.account} network={session.network} chainId={session.chain.id} chainName={session.chain.name} walletName={session.name}/>
        </Pickup>
        {page==='settings'&&<details className="nullmaps-settings"><summary>{tr('Bản đồ Nullmaps local · kiểm tra kết nối')}</summary><Suspense fallback={<p>{tr('Đang tải bản đồ…')}</p>}><PickupMap lots={[]}/></Suspense></details>}
      </div>
      <nav className="web-bottom" aria-label={tr('Điều hướng điện thoại')}>
        <button aria-current={page==='home'?'page':undefined} onClick={()=>navigate('home')}><Truck size={22}/><span>{tr('Tìm lô')}</span></button>
        <button className="web-bottom-post" aria-current={page==='post'?'page':undefined} onClick={post}><i><Plus size={26}/></i><span>{tr('Đăng lô')}</span></button>
        <button aria-current={page==='orders'?'page':undefined} onClick={()=>navigate('orders')}><PackageCheck size={22}/><span>{tr('Đơn của tôi')}</span></button>
      </nav>
    </div>
    <dialog ref={dialog} onCancel={()=>setProfile(undefined)} onClick={e=>{if(e.target===dialog.current)setProfile(undefined);}} className="web-dialog" aria-labelledby="wallet-title">
      <div className="web-dialog-head">
        <h2 id="wallet-title">{profile==='post'?tr('Đăng nhập để đăng lô'):profile==='claim'?tr('Đăng nhập để nhận lô'):tr('Tài khoản & ví')}</h2>
        <button aria-label={tr('Đóng tài khoản')} onClick={()=>setProfile(undefined)}><X size={22}/></button>
      </div>
      <div className="web-dialog-body">
        {session.error&&<p className="web-warning" role="alert">{tr(session.error)}</p>}
        {session.account?<>
          <div className="web-welcome"><h3>{session.email||session.name}</h3><p>{short(session.account)} · {session.chain.name}</p></div>
          <button className="web-primary" onClick={()=>{setProfile(undefined);navigate('wallet');}}>{tr('Xem Ví xanh & Phần thưởng')}</button>
          <button className="web-secondary" disabled={session.busy} onClick={()=>void session.logout().then(()=>setProfile(undefined))}><LogOut size={16}/>{tr('Ngắt kết nối')}</button>
        </>:<>
          <button className="web-primary" disabled={session.busy||!session.googleConfigured} onClick={()=>void session.connect('google')}>{session.busy?tr('Đang kết nối…'):tr('Tiếp tục với Google')}</button>
          {!session.googleConfigured&&<p className="web-warning">{tr('Google chưa được cấu hình. Cần Client ID công khai của dự án thirdweb; Core vẫn dùng được.')}</p>}
          <details className="web-wallet-options">
            <summary>{tr('Dùng ví Core hoặc ví khác')}</summary>
            {session.wallets.filter(w=>w.id!=='embedded-google').map(w=><button className="web-secondary" key={w.id} disabled={session.busy} onClick={()=>void session.connect(w.id)}><Wallet size={17}/>{w.name}</button>)}
            <button className="web-text-button" disabled={session.busy} onClick={session.refresh}>{tr('Quét lại ví')}</button>
          </details>
        </>}
      </div>
    </dialog>
  </div>;
}
