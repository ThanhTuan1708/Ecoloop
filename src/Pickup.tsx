import {lazy,Suspense,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {MapPin,Plus,RefreshCw,Navigation,ArrowRight,CheckCircle2,PackageCheck,ShieldCheck,Lock,Star,Coins,SlidersHorizontal,ChevronLeft,ChevronRight,History,Award,ExternalLink,Database,Fuel,Gift} from 'lucide-react';
import {formatEther,isAddress,keccak256,parseEther,stringToHex,type Address,type Hash} from 'viem';
import {chain,getWalletName} from './wallet';
import {errorMessage,txUrl,publicClient} from './chain';
import {materials,short} from './model';
import {tr,num as fmt,wt,dateTime,notify,unit} from './settings';
import {uploadEvidence,viewEvidence} from './evidence';
import {pickupAbi} from './generated/pickup';
import {lotStatuses,activatePickup,deployPickup,digest,distanceKm,pendingPickup,pickupDetails,pickupRead,pickupReadWallet,pickupWrite,householdWrite,fundRelayer,exchangeState,requiredDeposit,payoutPreview,readCertificate,certificateUrl,addressUrl,isPickupV4,checkPendingPickup,dismissUnseenPickup,savePickupPhoto,savePickupDetails,ZERO,type Lot,type CertificateView} from './pickupClient';
import {queryProductCards,type ListingStatus,type SortOption,type ShopeeWeb3ProductCard} from './marketplace';
import PickupChat from './PickupChat';
import './pickup.css';
import './rewards.css';
import EarnEco from './EarnEco';
import {speakFeedback} from './voiceFeedback';

const PickupMap=lazy(()=>import('./PickupMap'));
// Sample data has been removed from the app; clear what older versions stored in this browser.
try{for(const k of ['ecoloop-pickup-catalog-v2','ecoloop-pickup-rewards-v2','ecoloop-user-lots-meta','ecoloop-data-mode'])localStorage.removeItem(k);}catch{/* storage unavailable */}

interface RewardItem {id:number;name:string;cost:number;costAtomic:bigint;stock:number;active:boolean}
interface ReceiptItem {id:number;reward:number;owner:string;done:boolean}

const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const total=(weights:number[])=>weights.reduce((a,b)=>a+b,0)/1000;
const points=(weights:number[])=>weights.reduce((a,b,i)=>a+b*materials[i].rate/1000,0);
const buyCashVnd=(weights:number[])=>Math.round(weights.reduce((a,b,i)=>a+b*(materials[i]?.buyVnd??3500)/1000,0));
const stationCashVnd=(weights:number[])=>Math.round(weights.reduce((a,b,i)=>a+b*(materials[i]?.stationVnd??4200)/1000,0));
const eprCreditVnd=(weights:number[])=>Math.round(total(weights)*800);

export default function Pickup({account,admin,onConnect,page='home',role='seller',createRequest=0,onOpenOrders,onBrowseAsCollector,collectorLot,children,walletSlot}:{
  children?:ReactNode;walletSlot?:ReactNode;account?:Address;admin:boolean;
  demo?:boolean;onConnect:()=>void;page?:'home'|'orders'|'wallet'|'rewards'|'settings'|'messages';
  role?:'seller'|'collector';createRequest?:number;collectorLot?:number;
  onOpenOrders:()=>void;onBrowseAsCollector:(lotId:number)=>void;
}){
  const [rewardsAddress,setRewardsAddress]=useState<Address>();
  const [address,setAddress]=useState<Address>();const [onChainLots,setOnChainLots]=useState<Lot[]>([]);const [count,setCount]=useState(0);const [limit,setLimit]=useState(100);
  const [balanceAtomic,setBalanceAtomic]=useState(0n);const [view,setView]=useState<'grid'|'map'>('grid');const [pickupAdmin,setPickupAdmin]=useState(false);const [loading,setLoading]=useState(true);const [marketError,setMarketError]=useState(false);const [category,setCategory]=useState(-1);const [query,setQuery]=useState('');const [canFulfillRewards,setCanFulfillRewards]=useState(false);const [paused,setPaused]=useState(false);
  const [selected,setSelected]=useState<number>();const [creating,setCreating]=useState(false);const [radius,setRadius]=useState(0);const [center,setCenter]=useState<[number,number]>();
  const [filtersOpen,setFiltersOpen]=useState(false);const [sort,setSort]=useState<SortOption>('newest');const [pageNum,setPageNum]=useState(1);const [pageSize,setPageSize]=useState(12);
  const [busy,setBusy]=useState(false);const lock=useRef(false);const version=useRef(0);const detailVersion=useRef(0);
  const [message,setMessage]=useState('');const [failure,setFailure]=useState(false);const [hash,setHash]=useState<Hash>();const [detail,setDetail]=useState<{contact:string;address:string}>();const [photo,setPhoto]=useState('');
  const [restoreDetails,setRestoreDetails]=useState(false);
  const [actual,setActual]=useState(['0','0','0','0']);const [consent,setConsent]=useState(false);const [deployConsent,setDeployConsent]=useState(false);
  const [gasless,setGasless]=useState(false);const [relayerAddress,setRelayerAddress]=useState<Address>();const [canConfigurePickup,setCanConfigurePickup]=useState(false);const [prices,setPrices]=useState<number[]>([]);const [certAddress,setCertAddress]=useState<Address>();const [exchange,setExchange]=useState<EcoExchangeProps['exchange']>();
  const [depositWei,setDepositWei]=useState<bigint>();const [payoutWei,setPayoutWei]=useState<bigint>();
  const [publicPickup,setPublicPickup]=useState(false);
  const [unseenPickup,setUnseenPickup]=useState<Hash>();
  const pendingHash=pendingPickup();
  const [importAddress,setImportAddress]=useState(localStorage.getItem(`ecoloop-pickup-deployed-${chain.id}`)||'');

  // Only real on-chain data: lots, balances and rewards all come from the V4 contract.
  const lots=onChainLots;
  const seller=role==='seller';
  const browseMarket=page==='home'&&!creating;
  const collectorMarket=browseMarket&&!seller;
  const marketLots=lots.filter(l=>l.status===1&&(seller||!same(l.owner,account)));
  const myLots=lots.filter(l=>same(seller?l.owner:l.collector,account));
  const chatLots=page==='messages'?myLots.filter(l=>l.collector!==ZERO&&[2,3,4].includes(l.status)):[];
  const chatLot=address?chatLots.find(l=>l.id===selected):undefined;
  const current=(page==='orders'?myLots:browseMarket?marketLots:[]).find(l=>l.id===selected);
  const isCurrentOnChain=!!address&&!!current;
  const user=account;
  const myCertificates=account?onChainLots.filter(l=>l.status===4&&same(l.owner,account)):[];
  const eco=formatEther;
  const swap=address&&account?{exchange,busy:busy||paused,buy:buyEco}:undefined;
  const freeGas=gasless&&isCurrentOnChain&&account&&current&&same(account,current.owner)?<small className="gasless-tag"> · {tr('miễn phí gas')}</small>:null;

  // Browser notification when one of my lots (posted or collected) changes status while the tab is in the background.
  const watchedStatus=lots.filter(l=>same(l.owner,user)||same(l.collector,user)).map(l=>`${l.id}:${l.status}`).join(',');
  const lastStatus=useRef<{wallet:string;map:Map<number,number>}|undefined>(undefined);
  useEffect(()=>{
    const map=new Map(watchedStatus?watchedStatus.split(',').map(x=>x.split(':').map(Number) as [number,number]):[]);
    const prev=lastStatus.current;
    if(user&&prev&&prev.wallet===user&&typeof document!=='undefined'&&document.hidden){
      for(const [id,status] of map){const before=prev.map.get(id);if(before!==undefined&&before!==status)notify(tr('EcoLoop · Lô #{id}',{id}),tr('Trạng thái mới: {status}',{status:tr(lotStatuses[status]||'')}));}
    }
    lastStatus.current={wallet:user||'',map};
  },[watchedStatus,user]);
  const isOwner=page==='orders'&&seller&&same(user,current?.owner);
  const isAssignedCollector=!seller&&same(user,current?.collector);
  const actions:Record<string,boolean>={
    claimLot:collectorMarket&&(publicPickup||canFulfillRewards)&&!!account&&!same(user,current?.owner)&&current?.status===1&&!paused,
    cancelLot:isOwner&&current?.status===1,
    proposeLot:isAssignedCollector&&current?.status===2&&!paused,
    acceptLot:isOwner&&current?.status===3&&!paused&&consent&&Date.now()<=current.updatedAt+7*86400000,
    disputeLot:isOwner&&current?.status===3,
    releaseLot:!!current&&[2,3].includes(current.status)&&(isAssignedCollector||(isOwner&&Date.now()>current.updatedAt+7*86400000)),
  };

  const effectiveBalance=Number(formatEther(balanceAtomic));

  const marketplaceResult=queryProductCards(
    lots,
    {
      sort,
      status:['ACTIVE'],
      materialIndex:category>=0?category:undefined,
      lat:center?.[0],
      lng:center?.[1],
      radiusKm:radius>0?radius:undefined,
      q:query,
      excludeOwner:seller?undefined:account,
      page:pageNum,
      limit:pageSize,
    },
    {chainId:chain.id,contractAddress:address,role}
  );

  const activeFilters=(radius>0?1:0);
  const cards=marketplaceResult.items;
  const pagination=marketplaceResult.meta.pagination;
  const visible=cards.map(c=>lots.find(l=>l.id===c.lotId)!).filter(Boolean);
  const selectedCard:ShopeeWeb3ProductCard|undefined=current?queryProductCards([current],{status:['ACTIVE','IN_ESCROW','SOLD','CANCELLED']},{chainId:chain.id,contractAddress:address}).items[0]:undefined;
  const allCards=page==='orders'&&account?queryProductCards(
    myLots,
    {
      sort:'newest',
      status:['ACTIVE','IN_ESCROW','SOLD','CANCELLED'],
      page:1,
      limit:500,
    },
    {chainId:chain.id,contractAddress:address}
  ).items:[];

  async function refresh(){
    const v=version.current;

    try{
      const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Unable to load pickup configuration');
      const config=await response.json();
      if(v!==version.current)return;
      if(config.chainId!==chain.id)throw new Error('Pickup configuration uses a different network');
      const configured=config.pickupContract as Address|undefined;
      setRewardsAddress(config.chainId===chain.id&&isAddress(config.rewardsContract||'')?config.rewardsContract:undefined);
      setCanConfigurePickup(config.canConfigurePickup===true);
      setPublicPickup(config.publicPickup===true);
      setGasless(!!config.gasless);
      setRelayerAddress(isAddress(config.relayer||'')?config.relayer:undefined);
      setMarketError(false);
      if(!configured){setAddress(undefined);setOnChainLots([]);setCount(0);return;}
      const isSupported=await isPickupV4(configured);
      if(v!==version.current)return;
      if(!isSupported)throw new Error('Unsupported pickup contract');
      const [data,swapData]=await Promise.all([pickupRead(configured,limit),exchangeState(configured)]);
      if(v!==version.current)return;
      setAddress(configured);
      setOnChainLots(data.lots);setCount(data.count);setPaused(data.paused);
      setPrices(data.prices);setCertAddress(data.certificate);setExchange(swapData);
      setLoading(false);
      if(account){
        const wallet=await pickupReadWallet(configured,account).catch(()=>undefined);
        if(v!==version.current)return;
        setBalanceAtomic(wallet?.balanceAtomic??0n);setCanFulfillRewards(!!wallet?.collector);setPickupAdmin(!!wallet?.admin);
      }
    }catch{
      if(v!==version.current)return;
      setMarketError(true);
    }
  }
  async function run(fn:()=>Promise<void>){
    if(lock.current)return;
    lock.current=true;setBusy(true);setMessage('');setFailure(false);
    try{await fn();}
    catch(e){
      setFailure(true);setMessage(errorMessage(e));
      speakFeedback('Không hoàn tất được thao tác. Vui lòng xem thông báo trên màn hình.');
    }finally{lock.current=false;setBusy(false);}
  }
  useEffect(()=>{
    version.current++;
    setDetail(undefined);
    setPhoto('');
    setHash(undefined);
    setMessage('');
    setBalanceAtomic(0n);setCanFulfillRewards(false);setPickupAdmin(false);
    setLoading(true);
    const requestVersion=version.current;
    refresh().finally(()=>{if(requestVersion===version.current)setLoading(false);});
    const timer=setInterval(()=>{
      if(!lock.current&&!document.hidden)refresh().catch(()=>{});
    },10000);

    const handleFocus = () => {
      if (!lock.current) refresh().catch(() => {});
    };
    window.addEventListener('focus', handleFocus);

    return()=>{
      version.current++;
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  },[account,limit]);
  useEffect(()=>{setSelected(!seller&&page==='home'?collectorLot:undefined);setCreating(false);setPageNum(1);setCategory(-1);setQuery('');setRadius(0);setSort('newest');setView('grid');setFiltersOpen(false);},[page,seller,collectorLot]);
  const handledCreateRequest=useRef(0);
  useEffect(()=>{
    if(createRequest===handledCreateRequest.current)return;
    handledCreateRequest.current=createRequest;
    if(seller&&page==='home'){setCreating(true);setSelected(undefined);}
  },[createRequest,seller,page]);
  useEffect(()=>{setPageNum(1);setPageSize(12);},[category,query,radius,sort]);
  useEffect(()=>{detailVersion.current++;setRestoreDetails(false);setDetail(undefined);setPhoto('');setConsent(false);setActual((current?.estimated||[0,0,0,0]).map(n=>String(n/1000)));},[selected,user,current?.status]);
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo);},[photo]);
  useEffect(()=>{
    if(!current)return;
    const panel=document.querySelector('.lot-detail');
    if(panel&&getComputedStyle(panel).position!=='fixed')panel.scrollIntoView({block:'nearest'});
  },[current?.id]);
  useEffect(()=>{
    if(creating&&address)document.querySelector('.lot-form')?.scrollIntoView({block:'start'});
  },[creating,address]);
  // Exact escrow figures for the selected on-chain lot (deposit to lock, payout preview).
  useEffect(()=>{setDepositWei(undefined);setPayoutWei(undefined);if(!address||!current||!onChainLots.some(l=>l.id===current.id))return;let live=true;
    if(current.status===1)requiredDeposit(address,current.id).then(v=>{if(live)setDepositWei(v);}).catch(()=>{});
    if(current.status===3)payoutPreview(address,current).then(v=>{if(live)setPayoutWei(v);}).catch(()=>{});
    return()=>{live=false;};},[address,current?.id,current?.status,onChainLots]);
  // Esc closes the lot detail (a bottom sheet on phones)
  useEffect(()=>{if(selected===undefined)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('dialog[open]'))setSelected(undefined);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[selected]);

  function buyEco(avax:bigint,minimumEco:bigint){
    if(!address||!account)return;
    void run(async()=>{
      setHash(await pickupWrite(address,account,'buyEco',[minimumEco],avax));
      await refresh();
      setMessage(tr('Đã đổi AVAX lấy ECO.'));
    });
  }

  function inspectPending(hash:Hash,dismiss=false){
    void run(async()=>{
      setUnseenPickup(undefined);
      const result=await (dismiss?dismissUnseenPickup(hash):checkPendingPickup(hash));
      if(result.status==='confirmed'){
        const deployed=result.receipt.contractAddress;
        if(canConfigurePickup&&admin&&deployed&&await isPickupV4(deployed)){
          setImportAddress(deployed);
          localStorage.setItem(`ecoloop-pickup-deployed-${chain.id}`,deployed);
          localStorage.setItem(`ecoloop-pickup-deployblock-${chain.id}`,String(result.receipt.blockNumber));
        }
        setHash(hash);
        await refresh();
        setMessage(tr('Giao dịch đã được xác nhận trên Fuji.'));
      }else if(result.status==='pending'){
        setMessage(tr('Fuji đã nhận giao dịch và đang chờ xác nhận.'));
      }else if(dismiss){
        setMessage(tr('Đã bỏ theo dõi mã giao dịch trên trình duyệt này.'));
      }else{
        setUnseenPickup(hash);
      }
    });
  }

  async function change(fn:string,args:unknown[]){
    if(!current)return;
    if(!account){onConnect();return;}
    if(!address)throw new Error(tr('Chưa kích hoạt thu gom.'));
    if(!actions[fn])throw new Error(tr('Thao tác này không khả dụng với vai trò hoặc trạng thái hiện tại.'));
    const id=current.id;
    if(fn==='claimLot'){
      if(depositWei===undefined)throw new Error(tr('Đang tính số ECO cần khóa…'));
      setHash(await householdWrite(address,account,fn,[BigInt(id),depositWei],gasless));
      await refresh();onOpenOrders?.();
      setMessage(tr('🎉 Đã nhận đơn! Bạn có thể xem địa chỉ và số điện thoại bên dưới để liên hệ đến lấy.'));
      speakFeedback('Bạn đã nhận thu gom.');
      return;
    }
    const household=same(account,current.owner);
    setHash(await householdWrite(address,account,fn,args,gasless));
    await refresh();
    if(fn==='proposeLot')speakFeedback('Đã gửi kết quả cân cho người bán.');
    if(fn==='acceptLot')speakFeedback('Đã xác nhận bàn giao.');
    setMessage(fn==='acceptLot'?tr('🎉 Đã hoàn tất bàn giao! Điểm thưởng ECO và Chứng nhận tái chế đã được cộng vào ví của bạn.')
      :household&&gasless?tr('✅ Đã cập nhật đơn hàng thành công (miễn phí).'):tr('🎉 Đã cập nhật đơn thu gom thành công.'));
  }
  function locate(){run(async()=>{if(!navigator.geolocation)throw new Error(tr('Trình duyệt chưa hỗ trợ vị trí. Chọn khu vực trên bản đồ khi đăng lô.'));const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:15000}));setCenter([p.coords.latitude,p.coords.longitude]);setSort('distance_asc');setMessage(tr('Đã lấy vị trí để lọc khoảng cách. Không lưu vị trí vào hồ sơ hay blockchain; OpenStreetMap cung cấp nền bản đồ.'));});}
  async function create(weights:number[],file:File,evidence:Hash,point:[number,number],contact:string,location:string){
    if(!account){onConnect();return;}
    if(!address)throw new Error(tr('Chưa kích hoạt thu gom.'));
    if(!seller||paused)throw new Error(tr('Thao tác này không khả dụng với vai trò hoặc trạng thái hiện tại.'));
    const lat=Math.round(point[0]*100),lng=Math.round(point[1]*100);
    if(pendingPickup())throw new Error(tr('Kiểm tra giao dịch đang chờ trước khi đăng lô mới.'));
    const args=[weights.map(BigInt) as [bigint,bigint,bigint,bigint],evidence,lat,lng] as const;
    const request={address,abi:pickupAbi,functionName:'createLot',args,account} as const;
    await publicClient.simulateContract(request);
    // Photo and contact stay on the EcoLoop server (owner + assigned collector only); only the hash goes on-chain.
    await savePickupPhoto(account,address,file,evidence,contact,location);
    setHash(await householdWrite(address,account,'createLot',[...args],gasless));
    setCreating(false);
    await refresh();
    onOpenOrders?.();
    setMessage(gasless?tr('🎉 Đã đăng lô lên Avalanche, miễn phí gas.'):tr('🎉 Đã ký và gửi giao dịch tạo lô on-chain thành công lên mạng Fuji.'));
    speakFeedback('Đã đăng lô phế liệu thành công.');
  }
  return <section className={`pickup-workspace pickup-page-${page}`}>
    {page!=='rewards'&&page!=='messages'&&<div className="pickup-page-title">
      <span className="eyebrow">{tr('ECOLOOP · SÀN C2C WEB3 AVALANCHE FUJI')}</span>
      <h2>{({home:seller?tr('Bán phế liệu'):tr('Lô đang chờ thu gom'),orders:seller?tr('Lô của tôi'):tr('Lô đã nhận'),wallet:tr('Ví xanh của bạn'),messages:tr('Tin nhắn'),settings:tr('Thiết lập hệ thống')})[page]}</h2>
      <p>{page==='settings'?tr('Ngôn ngữ, giao diện, đơn vị, thông báo và cấu hình hệ thống.'):tr('Bán và thu gom phế liệu tận nơi minh bạch. Địa chỉ và số điện thoại được bảo mật, chỉ người bán và người nhận đơn xem được.')}</p>
    </div>}
    {page==='messages'&&(!account?<button className="primary" onClick={onConnect}>{tr('Kết nối ví')}</button>:
      <div className={`messenger ${chatLot?'messenger-selected':''}`}>
        <aside className="messenger-list"><h2>{tr('Tin nhắn')}</h2>
          {chatLots.map(l=><button key={l.id} aria-pressed={selected===l.id} onClick={()=>setSelected(l.id)}>
            <span className="messenger-avatar">{seller?'TG':'NB'}</span><span><strong>{short(seller?l.collector:l.owner)}</strong><small>{tr('Lô #{id}',{id:l.id})} · {tr(lotStatuses[l.status])}</small></span>
          </button>)}
          {!chatLots.length&&<p>{tr('Cuộc trò chuyện xuất hiện khi lô được nhận thu gom.')}</p>}
        </aside>
        <section className="messenger-room">
          {chatLot&&address?<div key={`${account}:${address}:${chatLot.id}:${chatLot.collector}`} className="messenger-thread">
            <header>
              <button type="button" className="messenger-back" aria-label={tr('← Cuộc trò chuyện')} onClick={()=>setSelected(undefined)}><ChevronLeft size={24} aria-hidden="true"/></button>
              <span className="messenger-avatar">{seller?'TG':'NB'}</span>
              <span><strong>{short(seller?chatLot.collector:chatLot.owner)}</strong><small>{tr('Lô #{id}',{id:chatLot.id})} · {tr(lotStatuses[chatLot.status])}</small></span>
            </header>
            <PickupChat expanded account={account} contract={address} lotId={chatLot.id} collector={chatLot.collector} seller={seller} completed={chatLot.status===4}/>
          </div>:<p className="messenger-empty">{tr('Chọn cuộc trò chuyện để nhắn tin.')}</p>}
        </section>
      </div>)}
    {page==='settings'&&children}
    {page==='settings'&&(admin||pickupAdmin)&&<h3 className="set-section-title">{tr('Quản trị hệ thống')}</h3>}
    {seller&&page==='home'&&<div className="pickup-intro"><div><h2>{tr('Đăng lô để hẹn thu gom')}</h2><p>{tr('Thêm ảnh, khối lượng dự kiến và địa chỉ bàn giao. Xác nhận số cân sau khi người thu gom gửi đề xuất.')}</p></div>{creating?<button className="secondary" disabled={busy} onClick={()=>setCreating(false)}>{tr('Đóng biểu mẫu')}</button>:<button className="primary" onClick={onOpenOrders}>{tr('Lô của tôi')}</button>}</div>}
    {page==='orders'&&!account&&<button className="secondary" onClick={onConnect}>{tr('Kết nối ví')}</button>}
    {loading&&!lots.length&&<p role="status">{tr('Đang tải dữ liệu từ mạng…')}</p>}
    {page==='settings'&&account&&admin&&canConfigurePickup&&!address&&!loading&&!marketError&&<section className="pickup-callout">
      <h3>{tr('Triển khai contract thu gom V4')}</h3>
        <label className="checkbox"><input type="checkbox" checked={deployConsent} onChange={e=>setDeployConsent(e.target.checked)}/>{tr('Tôi đồng ý tạo contract trên Fuji và xác nhận các giao dịch trong ví.')}</label>
        <button className="primary" disabled={busy||!deployConsent||!!pendingPickup()} onClick={()=>run(async()=>{
          const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw new Error(tr('Không tải được cấu hình thu gom.'));
          const config=await response.json();
          if(config.chainId!==chain.id)throw new Error(tr('Không tải được cấu hình thu gom.'));
          if(config.canConfigurePickup!==true||config.pickupContract){
            setDeployConsent(false);
            await refresh();
            return;
          }
          setImportAddress(await deployPickup(account));
          setDeployConsent(false);
          setMessage(tr('Đã triển khai contract thu gom V4.'));
        })}>{tr('Triển khai bằng ví đang kết nối')}</button>
        <label>{tr('Địa chỉ V4 đã triển khai')}
          <input value={importAddress} onChange={e=>setImportAddress(e.target.value)} placeholder="0x…"/>
        </label>
        <button className="secondary" disabled={busy||!isAddress(importAddress)} onClick={()=>run(async()=>{
          await activatePickup(account,importAddress as Address);
          await refresh();
          setMessage(tr('Đã kích hoạt contract chung cho Chrome và Edge.'));
        })}>{tr('Kích hoạt dùng chung')}</button>
        <p className="footnote">{tr('Sàn EcoLoop dùng một địa chỉ V4 chung. Quản trị viên cấu hình địa chỉ này cho tất cả người dùng.')}</p>
    </section>}
    {pendingHash&&<div className="pickup-callout">
      <strong>{tr('Giao dịch đang chờ xác nhận')}</strong>
      <code>{pendingHash}</code>
      <button className="secondary" disabled={busy} onClick={()=>inspectPending(pendingHash)}>{tr('Kiểm tra giao dịch')}</button>
      {unseenPickup===pendingHash&&<>
        <p>{tr('Fuji chưa tìm thấy mã này. Kiểm tra lịch sử trong ví. Nếu giao dịch chưa được gửi hoặc đã bị hủy, bạn có thể bỏ theo dõi trước khi thử lại.')}</p>
        <button className="secondary" disabled={busy} onClick={()=>inspectPending(pendingHash,true)}>{tr('Bỏ theo dõi')}</button>
      </>}
    </div>}
    {message&&!(failure&&current)&&<div className={failure?'pickup-feedback error':'pickup-feedback'} role={failure?'alert':'status'}>{tr(message)}</div>}
    {hash&&<a className="text-link" href={txUrl(hash)} target="_blank" rel="noreferrer">{tr('Xem giao dịch trên Fuji ↗')}</a>}
    {paused&&<p role="alert">{tr('Thu gom đang tạm dừng. Vẫn có thể hủy, yêu cầu cân lại hoặc trả việc.')}</p>}
    {address&&page!=='settings'&&<div className="data-mode-bar"><span className="live-chip"><ShieldCheck size={15}/>{tr('Dữ liệu thật trên Avalanche')}</span>{gasless?<span className="gasless-chip"><Fuel size={14}/>{tr('Miễn phí gas cho hộ gia đình')}</span>:relayerAddress&&account&&<button type="button" className="text-link" disabled={busy} onClick={()=>void run(async()=>{setHash(await fundRelayer(account,relayerAddress,parseEther('0.1')));await refresh();setMessage(tr('🎉 Đã nạp 0.1 AVAX vào ví tài trợ gas! Tất cả ví Google hiện đã được miễn phí gas.'));})}><Fuel size={14}/>{tr('Nạp 0.1 AVAX bật miễn phí gas cho Ví Google')} ({short(relayerAddress)})</button>}</div>}
    {marketError&&(page==='home'||page==='orders')&&<div className="pickup-callout" role="status"><p>{tr('Chưa tải được dữ liệu lô mới nhất. Vui lòng thử lại.')}</p><button type="button" className="secondary" onClick={()=>void refresh()}>{tr('Thử lại')}</button></div>}
    {!address&&page!=='settings'&&page!=='rewards'&&!loading&&!marketError&&<div className="pickup-callout"><strong>{tr('Chưa có contract thu gom V4')}</strong><p>{tr('Các lô sẽ xuất hiện sau khi sàn được cấu hình địa chỉ V4 dùng chung.')}</p></div>}
    {page==='wallet'&&walletSlot}
    {address&&<>
      {browseMarket&&<div className="pickup-summary">
        <span><strong>{marketLots.length}</strong> {tr('đang mở bán')}</span>
        <span><strong>{fmt(effectiveBalance)}</strong> {tr('ECO khả dụng')}</span>
        <a className="text-link" href={addressUrl(address)} target="_blank" rel="noreferrer"><Database size={14}/>{tr('Contract trên Snowtrace')}<ExternalLink size={12}/></a>
      </div>}
      {seller&&creating&&page==='home'&&<LotForm busy={busy||paused} center={center} onCreate={(...args)=>run(()=>create(...args))}/>}
      {browseMarket&&<>
        {seller&&<h3>{tr('Lô đang chờ thu gom')}</h3>}
        <div className={filtersOpen?'pickup-toolbar filters-open':'pickup-toolbar'}>
          <label className="pickup-search">{tr('Tìm sản phẩm / cửa hàng / khu vực')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("VD: đồng, nhôm, PET, carton, Quận 7, Thủ Đức, Hà Nội…")}/></label>
          <button type="button" className="pickup-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(o=>!o)}><SlidersHorizontal size={16}/>{tr('Bộ lọc')}{activeFilters>0&&<b>{activeFilters}</b>}</button>
          <label>{tr('Bán kính gần đúng')}<select value={radius} onChange={e=>setRadius(Number(e.target.value))} disabled={!center}><option value={0}>{tr('Tất cả khu vực')}</option><option value={.5}>500 m</option><option value={1}>1 km</option><option value={2}>2 km</option><option value={5}>5 km</option><option value={15}>15 km</option><option value={50}>50 km</option></select></label>
          <button className="secondary" disabled={busy} onClick={locate}><Navigation size={16}/>{tr('Vị trí của tôi')}</button>
          <button className="text-link" onClick={()=>{setCenter([10.78,106.70]);setSort('distance_asc');setMessage(tr('Đã đặt tâm bản đồ tại Quận 1, TP.HCM để sắp xếp khoảng cách.'));}}>{tr('Tâm TP.HCM')}</button>
        </div>

        <div className="shopee-sort-bar" role="region" aria-label={tr("Thanh sắp xếp và lọc kiểu Shopee")}>
          <div className="shopee-sort-left">
            <span className="shopee-sort-label"><SlidersHorizontal size={14}/> {tr('Sắp xếp theo')}</span>
            {([
              ['newest',tr('Mới nhất')],
              ['popular',tr('Phổ biến')],
              ['top_sales',tr('Bán chạy')],
              ['distance_asc',tr('Gần bạn')],
            ] as const).map(([id,label])=>(
              <button
                key={id}
                type="button"
                className={`shopee-sort-btn ${sort===id?'active':''}`}
                aria-pressed={sort===id}
                onClick={()=>id==='distance_asc'&&!center?locate():setSort(id)}
              >{label}</button>
            ))}
            <select
              aria-label={tr("Sắp xếp theo giá")}
              className={`shopee-price-select ${sort==='price_asc'||sort==='price_desc'?'active':''}`}
              value={sort==='price_asc'||sort==='price_desc'?sort:''}
              onChange={e=>{if(e.target.value)setSort(e.target.value as SortOption);}}
            >
              <option value="" disabled>{tr('Giá: Chọn thứ tự')}</option>
              <option value="price_asc">{tr('Giá: Thấp đến Cao')}</option>
              <option value="price_desc">{tr('Giá: Cao đến Thấp')}</option>
            </select>
          </div>
          <div className="shopee-sort-right">
            <span className="shopee-page-counter"><b>{pagination.currentPage}</b>/{pagination.totalPages}</span>
            <div className="shopee-page-nav">
              <button type="button" aria-label={tr("Trang trước")} disabled={pagination.currentPage<=1} onClick={()=>setPageNum(p=>Math.max(1,p-1))}><ChevronLeft size={15}/></button>
              <button type="button" aria-label="Trang sau" disabled={!pagination.hasNextPage} onClick={()=>setPageNum(p=>p+1)}><ChevronRight size={15}/></button>
            </div>
          </div>
        </div>

        <div className="pickup-view-controls">
          <div className="filter-tabs">{[tr('Tất cả'),...materials.map(m=>tr(m.name))].map((name,i)=><button key={name} aria-pressed={category===i-1} onClick={()=>setCategory(i-1)}>{name}</button>)}</div>
          <div className="filter-tabs"><button aria-pressed={view==='grid'} onClick={()=>setView('grid')}>{tr('Dạng lưới ({n})',{n:pagination.totalItems})}</button><button aria-pressed={view==='map'} onClick={()=>setView('map')}>{tr('Bản đồ ({n})',{n:visible.length})}</button></div>
        </div>
        {view==='map'&&<Suspense fallback={<p>{tr('Đang tải bản đồ…')}</p>}><PickupMap lots={visible} center={center} onSelect={setSelected}/></Suspense>}
          <div className="pickup-list">
            {cards.map(card=>{
              const st=card.uiState.status;
              return <button key={card.id} className={`lot-card shopee-web3-card status-card-${st.toLowerCase()} ${st==='SOLD'||st==='CANCELLED'?'card-dimmed':''} ${selected===card.lotId?'selected':''}`} onClick={()=>setSelected(card.lotId)}>
                <span className="lot-illustration" aria-hidden="true">
                  <img src={card.thumbnail.previewUrl} alt="" className="lot-card-photo" loading="lazy"/>
                  <span className="shopee-card-badges-top">
                    <span className={`web3-status-pill pill-${card.uiState.badgeColor}`}>
                      {st==='IN_ESCROW'&&<Lock size={11}/>}
                      {st==='ACTIVE'&&'● '}
                      {tr(card.uiState.statusLabelVi)}
                    </span>
                    <span className="web3-chain-pill"><ShieldCheck size={11}/>Fuji #{card.lotId}</span>
                  </span>
                  {st==='SOLD'&&<span className="shopee-stamp stamp-sold">{tr('ĐÃ BÁN')}</span>}
                  {st==='IN_ESCROW'&&<span className="shopee-stamp stamp-escrow">{tr('ĐANG THU GOM')}</span>}
                  {st==='CANCELLED'&&<span className="shopee-stamp stamp-cancelled">{tr('ĐÃ HỦY')}</span>}
                  <span className="shopee-card-badges-bottom">
                    <span className="web3-ipfs-pill">{tr(card.category.name)}</span>
                    <span className="web3-distance-pill">{wt(card.totalKilograms,1)}</span>
                  </span>
                </span>
                <span className="lot-top">
                  <strong className="lot-card-title">{card.title}</strong>
                </span>
                <span className="lot-materials">
                  {card.materialTags.map(m=>`${m.symbol} ${tr(m.name)} ${wt(m.kilograms)}`).join(' · ')}
                </span>
                <span className="shopee-price-row">
                  <b className="lot-eco"><Coins size={14}/> +{card.pricing.amountFormatted} {card.pricing.tokenSymbol}</b>
                  {(()=>{
                    const rawLot=lots.find(l=>l.id===card.lotId);
                    const w=rawLot?([3,4].includes(rawLot.status)&&rawLot.actual.some(x=>x>0)?rawLot.actual:rawLot.estimated):[0,0,0,0];
                    const cash=buyCashVnd(w);
                    const profit=Math.max(0,stationCashVnd(w)-cash);
                    return <small className="fiat-equiv">{seller?tr('Tiền bán ≈ {vnd} ₫',{vnd:fmt(cash)}):tr('Mua {vnd} ₫ · Lãi +{profit} ₫',{vnd:fmt(cash),profit:fmt(profit)})}</small>;
                  })()}
                </span>
                <span className="shopee-rating-row">
                  {card.seller.reputationScore>0&&<span className="star-badge"><Star size={11} fill="currentColor"/> {card.seller.reputationScore.toFixed(1)}</span>}
                  <span className="sales-count">{tr('Đã bán {n}',{n:card.seller.completedSalesCount})}</span>
                  {card.badges.isEscrowProtected&&<span className="escrow-tag">{tr('Đảm bảo')}</span>}
                </span>
                <span className="shopee-location-row">
                  <span><MapPin size={12}/> {card.seller.location.distanceKm!==undefined
                    ?tr('Cách ~{d} · {district}',{d:unit()==='lb'?`${fmt(card.seller.location.distanceKm*0.621371)} mi`:`${fmt(card.seller.location.distanceKm)} km`,district:card.seller.location.district})
                    :`${card.seller.location.district}, ${card.seller.location.province}`}</span>
                </span>
                <small className="shopee-shop-row">{card.seller.displayName} · {short(card.onChain.sellerWallet)}</small>
                <span className={`lot-card-action action-${st.toLowerCase()}`}>
                  {seller?tr('Xem thông tin lô'):tr(card.uiState.ctaTextVi)} ↗
                </span>
              </button>;
            })}
            {!cards.length&&!loading&&!marketError&&<div className="pickup-empty"><PackageCheck size={30}/><h3>{tr('Chưa có lô thu gom phù hợp')}</h3><p>{tr('Thử đổi khu vực hoặc bộ lọc vật liệu.')}</p></div>}
            <div className="shopee-pagination-footer">
              <p className="footnote">{tr('Hiển thị {shown} / {total} sản phẩm phù hợp · Trang {page}/{pages} (Tổng kho: {all} lô).',{shown:cards.length,total:pagination.totalItems,page:pagination.currentPage,pages:pagination.totalPages,all:marketLots.length})}</p>
              <div className="shopee-pagination-controls">
                {pagination.currentPage>1&&<button type="button" className="secondary" onClick={()=>setPageNum(p=>Math.max(1,p-1))}>{tr('← Trang trước')}</button>}
                {pagination.hasNextPage&&<button type="button" className="secondary" onClick={()=>setPageSize(s=>s+12)}>{tr('Xem thêm +12 sản phẩm')}</button>}
                {pagination.hasNextPage&&<button type="button" className="primary" onClick={()=>setPageNum(p=>p+1)}>{tr('Trang tiếp theo →')}</button>}
              </div>
            </div>
          </div>
      </>}
      {(browseMarket||page==='orders')&&current&&selectedCard&&<div className="pickup-columns has-selection pickup-detail-panel">
          <div className="lot-sheet-backdrop" aria-hidden="true" onClick={()=>setSelected(undefined)}/>
          <div className="lot-detail" role="dialog" aria-label={selectedCard.title}><span className="lot-sheet-handle" aria-hidden="true"/><button className="text-link" onClick={()=>setSelected(undefined)}>{tr('Đóng chi tiết ×')}</button>
            <span className="eyebrow">{tr('BIÊN NHẬN WEB3 #{id}',{id:current.id})} · {selectedCard.uiState.status}</span>
            <h3>{selectedCard.title}</h3>
            <img className="pickup-evidence" src={photo||selectedCard.thumbnail.previewUrl} alt={selectedCard.title}/>
            <p>{selectedCard.shortDescription}</p>
            <div className="web3-metadata-box">
              <div><span>{tr('Trạng thái đơn:')}</span> <strong>{tr(selectedCard.uiState.statusLabelVi)} — {tr(selectedCard.uiState.subStatusLabelVi)}</strong></div>
              <div><span>{tr('Người bán:')}</span> <strong>{selectedCard.seller.displayName}</strong> (<code>{short(current.owner)}</code>) · {tr('({n} lô hoàn tất)',{n:selectedCard.seller.completedSalesCount})}</div>
              <div><span>{tr('Người nhận thu gom:')}</span> <code>{current.collector===ZERO?tr('Chưa có người nhận'):short(current.collector)}</code></div>
              <div><span>{tr('Khu vực bàn giao:')}</span> {selectedCard.seller.location.district}, {selectedCard.seller.location.province}</div>
              <div><span>Contract V4 (Chain {chain.id}):</span> <code>{address?short(address):'—'}</code></div>
              <div><span>{tr('SHA-256 ảnh lô:')}</span> <code>{short(current.evidence)}</code></div>
              {selectedCard.onChain.escrowLockExpiresAt&&<div><span>{tr('Thời hạn xử lý đơn:')}</span> {dateTime(selectedCard.onChain.escrowLockExpiresAt)}</div>}
            </div>
            <table><thead><tr><th>{tr('Vật liệu')}</th><th>{tr('Đơn giá thu mua')}</th><th>{tr('Dự kiến')}</th><th>{tr('Thực tế')}</th></tr></thead><tbody>{materials.map((m,i)=><tr key={m.name}><td>{m.symbol} {tr(m.name)}</td><td>{fmt(m.buyVnd)} ₫/kg</td><td>{wt(current.estimated[i]/1000)}</td><td>{[3,4].includes(current.status)?wt(current.actual[i]/1000):'—'}</td></tr>)}</tbody></table>
            {(()=>{
              const activeWeights=[3,4].includes(current.status)&&current.actual.some(x=>x>0)?current.actual:current.estimated;
              const isActual=[3,4].includes(current.status)&&current.actual.some(x=>x>0);
              const sellerCash=buyCashVnd(activeWeights);
              const stationCash=stationCashVnd(activeWeights);
              const totalKg=total(activeWeights);
              const platformFee=totalKg>=30?Math.round(stationCash*0.03):0;
              const collectorProfit=Math.max(0,stationCash-sellerCash-platformFee);
              const eprVnd=eprCreditVnd(activeWeights);
              return (
                <div className="pricing-breakdown-box">
                  <strong>{tr('💵 Bảng tính tiền thu mua & Kinh doanh')} ({isActual?tr('Theo cân thực tế'):tr('Tạm tính theo dự kiến')})</strong>
                  <div className="pricing-row highlight-cash">
                    <span>{tr('Tiền mặt trả cho người bán:')}</span>
                    <b>{fmt(sellerCash)} ₫</b>
                  </div>
                  <div className="pricing-row">
                    <span>{tr('Điểm thưởng phân loại xanh (tặng thêm):')}</span>
                    <b className="eco-val">+{selectedCard.pricing.amountFormatted} ECO</b>
                  </div>
                  <div className="pricing-row">
                    <span>{tr('Giá bao tiêu tại Trạm tái chế EcoLoop:')}</span>
                    <b>{fmt(stationCash)} ₫</b>
                  </div>
                  <div className="pricing-row highlight-profit">
                    <span>{tr('Lợi nhuận chuyến đi của Người thu gom:')}</span>
                    <b>+{fmt(collectorProfit)} ₫</b>
                  </div>
                  <div className="pricing-row">
                    <span>{tr('Phí điều phối nền tảng EcoLoop:')}</span>
                    <span>{platformFee>0?tr('{vnd} ₫ (3% đơn thương mại ≥ 30 kg)',{vnd:fmt(platformFee)}):tr('0 ₫ (Miễn phí cho hộ dân & thu gom lẻ < 30 kg)')}</span>
                  </div>
                  <div className="pricing-row">
                    <span>{tr('Doanh thu Tín chỉ Tái chế EPR (B2B NFT):')}</span>
                    <span>+{fmt(eprVnd)} ₫ {tr('(Từ Quỹ EPR doanh nghiệp)')}</span>
                  </div>
                </div>
              );
            })()}
            <p className="lot-points">
              <strong>+{selectedCard.pricing.amountFormatted} ECO</strong>
            </p>
            {isCurrentOnChain&&<div className="escrow-box">
              <strong><Lock size={15}/>{tr('Đảm bảo thanh toán từ EcoLoop')}</strong>
              {current.status===1&&<p>{depositWei!==undefined?tr('Khi nhận đơn, hệ thống tạm giữ {eco} ECO làm khoản đảm bảo. Sau khi đến nơi cân thực tế và hai bên đồng ý, người bán sẽ nhận ngay điểm thưởng theo đúng số cân.',{eco:eco(depositWei)}):tr('Đang tính điểm đảm bảo…')}</p>}
              {[2,3].includes(current.status)&&<p>{tr('Hệ thống đang giữ {eco} ECO đảm bảo cho đơn thu gom này.',{eco:fmt(current.deposit||0,6)})}</p>}
              {current.status===3&&payoutWei!==undefined&&<p className="escrow-payout">{tr('Người bán sẽ nhận {eco} ECO theo số cân thực tế; phần dư tự động hoàn lại người thu gom.',{eco:eco(payoutWei)})}</p>}
              {current.status===4&&<p className="escrow-payout">{tr('Đã chuyển {eco} ECO cho người bán sau khi hoàn tất thu gom.',{eco:fmt(current.paid||0,6)})}</p>}
              {current.status===5&&<p>{tr('Đơn thu gom này đã hủy.')}</p>}
            </div>}
            {(isOwner||isAssignedCollector)&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>{
              if(!account||!address){onConnect();return;}
              const v=detailVersion.current;
              const details=await pickupDetails(account,address,current);
              if(v!==detailVersion.current)return;
              setDetail(details);
            })}>{tr('Xem liên hệ & địa chỉ bàn giao')}</button>}
            {(isOwner||isAssignedCollector)&&!photo&&<button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{
              if(!account||!address)return;
              const v=detailVersion.current;
              const image=await viewEvidence(account,current.evidence,address,current.id);
              if(v!==detailVersion.current){URL.revokeObjectURL(image);return;}
              setPhoto(image);
            })}>{tr('Xem ảnh lô')}</button>}
            {isOwner&&account&&address&&!photo&&<label className="footnote">{tr('Tải lại ảnh gốc của lô')}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{
                const input=event.currentTarget;
                const file=input.files?.[0];
                input.value='';
                if(!file)return;
                const v=detailVersion.current;
                void run(async()=>{
                  if(file.size>4*1024*1024)throw new Error(tr('Chọn ảnh tối đa 4 MB.'));
                  const actualHash=await digest(await file.arrayBuffer());
                  if(actualHash!==current.evidence.toLowerCase())throw new Error(tr('Ảnh này không khớp ảnh gốc đã đăng.'));
                  await uploadEvidence(account,file,actualHash,address,current.id);
                  if(v===detailVersion.current)setPhoto(URL.createObjectURL(file));
                });
              }}/>
            </label>}
            {isOwner&&account&&address&&[1,2,3,4].includes(current.status)&&!detail&&<button type="button" className="text-link" onClick={()=>setRestoreDetails(value=>!value)}>{tr('Bổ sung thông tin bàn giao')}</button>}
            {isOwner&&account&&address&&restoreDetails&&!detail&&<form className="pickup-callout" onSubmit={event=>{
              event.preventDefault();
              const fields=new FormData(event.currentTarget);
              const contact=String(fields.get('contact')||'').trim();
              const location=String(fields.get('address')||'').trim();
              const v=detailVersion.current;
              void run(async()=>{
                await savePickupDetails(account,address,current.evidence,contact,location,current.id);
                if(v!==detailVersion.current)return;
                setDetail({contact,address:location});
                setRestoreDetails(false);
              });
            }}>
              <label>{tr('Số điện thoại / cách liên hệ')}<input name="contact" minLength={3} maxLength={120} required/></label>
              <label>{tr('Địa chỉ & thời gian bàn giao')}<input name="address" minLength={5} maxLength={400} required/></label>
              <button className="secondary" disabled={busy}>{tr('Ký và lưu thông tin bàn giao')}</button>
            </form>}
            {detail&&<div className="pickup-callout"><strong>{detail.contact}</strong><p style={{whiteSpace:'pre-line'}}>{detail.address}</p></div>}
            {account&&address&&current.collector!==ZERO&&[2,3,4].includes(current.status)&&(isOwner||isAssignedCollector)&&
              <PickupChat key={`${address}:${current.id}:${current.collector}:${account}`} account={account} contract={address}
                lotId={current.id} collector={current.collector} seller={isOwner} completed={current.status===4}/>}
            {seller&&browseMarket&&(same(current.owner,account)
              ?<p role="status">{tr('Bạn đang xem lô của mình. Hãy dùng ví khác để nhận thu gom.')}</p>
              :<button type="button" className="secondary" onClick={()=>onBrowseAsCollector(current.id)}>{tr('Chuyển sang Người Thu Gom')}</button>)}
            {failure&&message&&<p className="form-error" role="alert">{tr(message)}</p>}
            {collectorMarket&&account&&!publicPickup&&!canFulfillRewards&&<p>{tr('Ví này chưa có quyền thu gom. Liên hệ quản trị viên.')}</p>}
            {actions.claimLot&&depositWei!==undefined&&balanceAtomic<depositWei&&(gasless
              ?<div className="pickup-callout"><strong>{tr('⚡ Nhận đơn miễn phí — Hệ thống hỗ trợ ứng trước điểm đảm bảo')}</strong><p>{tr('Bạn chưa cần có sẵn điểm trong ví. EcoLoop tự động ứng trước {eco} ECO đảm bảo để bạn nhận đơn đi thu gom ngay hoàn toàn miễn phí.',{eco:eco(depositWei-balanceAtomic)})}</p></div>
              :swap&&<EcoExchange {...swap} needed={depositWei-balanceAtomic}/>)}
            {collectorMarket&&(!account||actions.claimLot)&&<button className="primary full-width" disabled={busy||paused||!!account&&(depositWei===undefined||(!gasless&&balanceAtomic<depositWei))} onClick={()=>account?run(()=>change('claimLot',[BigInt(current.id)])):onConnect()}>{!account?tr('Kết nối ví'):tr('Nhận đơn đi thu gom ngay')} <ArrowRight size={16}/></button>}
            {current.status===1&&isOwner&&<button className="secondary" disabled={busy} onClick={()=>run(()=>change('cancelLot',[BigInt(current.id)]))}>{tr('Hủy bài đăng')}{freeGas}</button>}
            {isAssignedCollector&&current.status===2&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const weights=actual.map(s=>Math.round(Number(s)*1000));if(weights.some(n=>!Number.isSafeInteger(n)||n<0)||total(weights)<=0||total(weights)>1000)throw new Error(tr('Tổng khối lượng thực tế từ 0,001 đến 1.000 kg.'));await change('proposeLot',[BigInt(current.id),weights.map(BigInt)]);});}}><h4>{tr('Kết quả cân thực tế tại điểm bàn giao')}</h4><WeightInputs values={actual} onChange={setActual}/><p>{tr('Nhập số cân thực tế sau khi cân tại nhà để gửi cho người bán kiểm tra và xác nhận.')}</p><button className="primary" disabled={busy||paused}>{tr('Gửi số cân')}</button></form>}
            {isOwner&&current.status===3&&<><p>{tr('Kiểm tra bảng khối lượng thực tế bên trên trước khi xác nhận hoàn tất.')}</p><label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{tr('Tôi đã bàn giao vật liệu và đồng ý khối lượng thực tế trên.')}</label><button className="primary full-width" disabled={busy||paused||!consent||Date.now()>current.updatedAt+7*86400000} onClick={()=>run(()=>change('acceptLot',[BigInt(current.id)]))}><CheckCircle2 size={16}/>{isCurrentOnChain&&payoutWei!==undefined?tr('Xác nhận & nhận {eco} ECO',{eco:eco(payoutWei)}):tr('Đồng ý số cân')}{freeGas}</button><button className="secondary" disabled={busy} onClick={()=>run(()=>change('disputeLot',[BigInt(current.id)]))}>{tr('Chưa đồng ý · yêu cầu cân lại')}{freeGas}</button></>}
            {actions.releaseLot&&<button className="text-link" disabled={busy} onClick={()=>run(()=>change('releaseLot',[BigInt(current.id)]))}>{isOwner?tr('Mở lại lô do quá hạn'):tr('Hủy nhận đơn (Nhường cho người khác)')}</button>}
            {current.status===4&&<p className="pickup-success"><CheckCircle2 size={18}/>{tr('Hai bên đã xác nhận. Điểm thưởng ECO đã được cộng vào ví người bán.')}</p>}
            {current.status===4&&isCurrentOnChain&&certAddress&&<CertificateCard certificate={certAddress} lotId={current.id}/>}
          </div>
        </div>}
      {page==='orders'&&account&&<PickupHistorySection
        allCards={allCards}
        lots={lots}
        seller={seller}
        selected={selected}
        onSelectLot={setSelected}
      />}
      {address&&(admin||pickupAdmin)&&account&&page==='settings'&&<section className="pickup-callout"><h3>{tr('Quản lý thu gom')}</h3><button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{setHash(await pickupWrite(address,account,'setPaused',[!paused]));await refresh();})}>{paused?tr('Mở lại thu gom'):tr('Tạm dừng thu gom')}</button><p className="footnote">Contract V4: {address}{certAddress?<> · NFT: {certAddress}</>:null}</p></section>}
      {address&&(admin||pickupAdmin)&&account&&page==='settings'&&<form className="pickup-callout" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{const next=[0,1,2,3].map(i=>{const v=String(f.get('price'+i)||'').replace(',','.');if(!/^\d*\.?\d+$/.test(v)||Number(v)>1_000_000 || (v.split(".")[1]?.length ?? 0)>18)throw new Error(tr('Giá phải từ 0 đến 1.000.000 ECO cho mỗi kg (tối đa 18 chữ số thập phân).'));return parseEther(v);});setHash(await pickupWrite(address,account,'setPrices',[next]));await refresh();setMessage(tr('Đã cập nhật giá thu mua.'));});}}><h3>{tr('Giá thu mua (ECO/kg)')}</h3><p>{tr('Người thu gom khóa số ECO = giá × khối lượng ước tính + 20%. Chủ lô nhận theo số cân thực tế.')}</p><div className="pickup-weights">{materials.map((m,i)=><label key={m.name}>{tr(m.name)}<input name={'price'+i} inputMode="decimal" defaultValue={prices[i]??''} key={String(prices[i])}/></label>)}</div><button className="secondary" disabled={busy}>{tr('Cập nhật giá')}</button></form>}
      {page==='wallet'&&!walletSlot&&<div className="pickup-callout wallet-live"><span>{tr('VÍ ĐIỂM THU GOM ECOLOOP')}</span><h2>{fmt(effectiveBalance)} ECO</h2><p>{account?tr('Ví đã kết nối: {wallet} · Số dư ECO on-chain trên contract V4.',{wallet:short(account)}):tr('Kết nối ví để xem số dư ECO on-chain của bạn.')}</p>{address&&<code>{address}</code>}<p>{tr('Bạn nhận ECO khi hoàn tất bàn giao phế liệu.')}</p></div>}
      {page==='wallet'&&swap&&<EcoExchange {...swap}/>}
      {page==='settings'&&address&&account&&pickupAdmin&&<form className="pickup-callout" onSubmit={e=>{
        e.preventDefault();
        const collector=String(new FormData(e.currentTarget).get('collector')).trim();
        void run(async()=>{
          if(!isAddress(collector))throw new Error(tr('Địa chỉ ví không hợp lệ.'));
          setHash(await pickupWrite(address,account,'grantRole',[keccak256(stringToHex('COLLECTOR_ROLE')),collector]));
          await refresh();
          setMessage(tr('Đã cập nhật quyền thu gom.'));
        });
      }}>
        <label>{publicPickup?tr('Địa chỉ ví giao quà'):tr('Địa chỉ ví thu gom')}<input name="collector" placeholder="0x…" required/></label>
        <button className="secondary" disabled={busy}>{publicPickup?tr('Cấp quyền giao quà'):tr('Cấp quyền thu gom')}</button>
      </form>}
      {page==='settings'&&address&&account&&pickupAdmin&&exchange&&<ExchangeSettings exchange={exchange} busy={busy} submit={(fn,value)=>void run(async()=>{
        setHash(await pickupWrite(address,account,fn,[value]));
        await refresh();
        setMessage(tr('Đã cập nhật quầy đổi ECO.'));
      })}/>}
      {page==='wallet'&&address&&certAddress&&<section className="pickup-callout"><h3><Award size={18}/> {tr('Chứng nhận tái chế của tôi ({n})',{n:myCertificates.length})}</h3>{myCertificates.length?<div className="cert-grid">{myCertificates.map(l=><CertificateCard key={l.id} certificate={certAddress} lotId={l.id} compact/>)}</div>:<p>{account?tr('Hoàn tất một lô thu gom để nhận chứng nhận NFT đầu tiên.'):tr('Kết nối ví để xem chứng nhận của bạn.')}</p>}</section>}
    </>}
    {page==='rewards'&&<>
      <EarnEco key={`${address}:${rewardsAddress}:${account}`} pool={rewardsAddress} token={address}
        account={account} busy={busy} onConnect={onConnect} run={run} onClaim={async(tx,amount)=>{
          setHash(tx);
          setMessage(tr('Đã nhận {amount} ECO vào ví.',{amount}));
          await refresh();
        }}/>
    </>}
    {page==='rewards'&&<PickupRewards swap={swap} balanceAtomic={balanceAtomic} gasless={gasless} admin={admin||pickupAdmin} address={address} account={account} collector={canFulfillRewards} busy={busy} balance={effectiveBalance} run={run} onChange={refresh} onConnect={onConnect} onDone={setMessage}/>}
    {busy&&<p role="status" className="pickup-busy">{tr('Đang xử lý… Kiểm tra cửa sổ ví nếu được yêu cầu ký. Không đóng trang khi gửi giao dịch.')}</p>}
  </section>;
}

function PickupHistorySection({
  allCards,
  lots,
  seller,
  selected,
  onSelectLot,
}:{
  allCards:ShopeeWeb3ProductCard[];
  lots:Lot[];
  seller:boolean;
  selected?:number;
  onSelectLot:(id:number)=>void;
}){
  const lotMap=new Map(lots.map(l=>[l.id,l]));
  const activeList=[...allCards].sort((a,b)=>(lotMap.get(b.lotId)?.updatedAt||0)-(lotMap.get(a.lotId)?.updatedAt||0));
  const totalKg=activeList.reduce((sum,c)=>sum+c.totalKilograms,0);
  const totalEco=activeList.reduce((sum,c)=>sum+c.pricing.ecoAmount,0);
  const completedCount=activeList.filter(c=>c.uiState.status==='SOLD').length;
  const inProgressCount=activeList.filter(c=>c.uiState.status==='IN_ESCROW'||c.uiState.status==='ACTIVE').length;

  return (
    <section className="pickup-history-panel" aria-label={tr("Lịch sử đã đăng lô và thu gom lô")}>
      <div className="pickup-history-header">
        <div>
          <span className="eyebrow"><History size={14}/> {tr('LỊCH SỬ ĐƠN THU GOM')}</span>
          <h3>{seller?tr('Lô của tôi'):tr('Lô đã nhận')}</h3>
        </div>
      </div>
      <div className="history-kpis">
        <div className="history-kpi-card">
          <span>{seller?tr('Tổng lô đã đăng'):tr('Tổng chuyến thu gom')}</span>
          <strong>{tr('{n} lô',{n:activeList.length})}</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('Đang chờ / Đang thu gom')}</span>
          <strong>{tr('{n} lô',{n:inProgressCount})}</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('Đã hoàn tất bàn giao')}</span>
          <strong>{tr('{n} lô',{n:completedCount})}</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('Tổng khối lượng')}</span>
          <strong>{wt(totalKg,1)}</strong>
        </div>
        <div className="history-kpi-card highlight">
          <span>{tr('Tổng giá trị quy đổi')}</span>
          <strong>+{fmt(totalEco)} ECO</strong>
        </div>
      </div>

      {activeList.length===0?(
        <div className="pickup-empty">
          <PackageCheck size={28}/>
          <h4>{tr('Chưa có bản ghi nào trong mục này')}</h4>
          <p>{seller?tr('Các lô bạn đăng bằng ví này sẽ hiện ở đây.'):tr('Các lô bạn nhận bằng ví này sẽ hiện ở đây.')}</p>
        </div>
      ):(
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>{tr('Mã lô & Phế liệu')}</th>
                <th>{tr('Vật liệu & Cân nặng')}</th>
                <th>{seller?tr('Người thu gom'):tr('Người bán & Người thu gom')}</th>
                <th>{tr('Điểm thưởng & Giá trị')}</th>
                <th>{tr('Trạng thái & Thời gian')}</th>
                <th>{tr('Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {activeList.map(card=>{
                const lot=lotMap.get(card.lotId);
                const estKg=lot?total(lot.estimated):card.totalKilograms;
                const actKg=lot&&lot.actual.some(w=>w>0)?total(lot.actual):null;
                const isNewUserLot=!!lot&&Date.now()-lot.updatedAt<24*3600_000&&lot.status===1;
                const updatedStr=lot?dateTime(lot.updatedAt,{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}):tr('Vừa xong');
                return (
                  <tr key={card.id} className={`history-row ${selected===card.lotId?'selected':''} ${isNewUserLot?'new-user-lot':''}`}>
                    <td>
                      <div className="history-lot-cell">
                        <img src={card.thumbnail.previewUrl} alt="" className="history-thumb" loading="lazy"/>
                        <div>
                          <div className="history-lot-badges">
                            <span className="history-id-pill">#{card.lotId}</span>
                            {isNewUserLot&&<span className="history-new-pill">{tr('MỚI ĐĂNG')}</span>}
                            <span className="history-cat-pill">{tr(card.category.name)}</span>
                          </div>
                          <strong className="history-lot-title">{card.title}</strong>
                          <small className="history-lot-loc"><MapPin size={11}/> {card.seller.location.district}, {card.seller.location.province}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="history-weight-cell">
                        <span>{card.materialTags.map(m=>`${m.symbol} ${tr(m.name)} ${wt(m.kilograms)}`).join(' · ')}</span>
                        <small>
                          {tr('Dự kiến:')} <b>{wt(estKg)}</b>
                          {actKg!==null?<> {tr('· Cân thực tế:')} <b className="actual-weight-highlight">{wt(actKg)}</b></>:<> {tr('· Cân thực tế:')} <em>{tr('Chưa cân')}</em></>}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="history-wallet-cell">
                        <div><small>{tr('Chủ lô:')}</small> <code>{short(card.onChain.sellerWallet)}</code></div>
                        <div>
                          <small>Thu gom:</small>{' '}
                          {card.onChain.buyerWallet&&card.onChain.buyerWallet!==ZERO?(
                            <code>{short(card.onChain.buyerWallet)}</code>
                          ):(
                            <span className="unassigned-tag">{tr('Chưa có người nhận')}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="history-price-cell">
                        <strong className="history-eco">+{card.pricing.amountFormatted} ECO</strong>
                        {lot&&lot.status===4&&(lot.paid||0)>0&&<small>{tr('Đã trả {eco} ECO',{eco:fmt(lot.paid||0,6)})}</small>}
                      </div>
                    </td>
                    <td>
                      <div className="history-status-cell">
                        <span className={`web3-status-pill pill-${card.uiState.badgeColor}`}>
                          {tr(card.uiState.statusLabelVi)}
                        </span>
                        <small className="history-substatus">{tr(card.uiState.subStatusLabelVi)}</small>
                        <small className="history-time">{tr('Cập nhật:')} {updatedStr}</small>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={selected===card.lotId?'primary history-action-btn':'secondary history-action-btn'}
                        onClick={()=>onSelectLot(card.lotId)}
                      >
                        {selected===card.lotId?tr('Đang xem'):tr('Xem & xử lý →')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function WeightInputs({values,onChange}:{values:string[];onChange:(v:string[])=>void}){return <div className="pickup-weights">{materials.map((m,i)=><label key={m.name}>{tr(m.name)} (kg)<input type="number" min="0" max="1000" step="0.001" required value={values[i]} onChange={e=>onChange(values.map((v,j)=>j===i?e.target.value:v))}/></label>)}</div>;}
function LotForm({busy,center,onCreate}:{busy:boolean;center?:[number,number];onCreate:(weights:number[],file:File,evidence:Hash,point:[number,number],contact:string,address:string)=>void}){
  const [address,setAddress]=useState('');
  const lastSelectedAddress=useRef('');
  function selectAddress(label:string){
    const next=label.slice(0,400);
    const previousSelection=lastSelectedAddress.current;
    lastSelectedAddress.current=next;
    setAddress(previous=>!previous.trim()||previous===previousSelection?next:previous);
  }
  const [weights,setWeights]=useState(['0','0','0','0']);
  const [file,setFile]=useState<File>();
  const [point,setPoint]=useState<[number,number]>(()=>center||[10.78,106.70]);
  const [error,setError]=useState('');
  const [hashing,setHashing]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setError('');
    const f=new FormData(e.currentTarget);
    const grams=weights.map(v=>Math.round(Number(v)*1000));
    if(grams.some(n=>!Number.isSafeInteger(n)||n<0)||total(grams)<=0||total(grams)>1000){
      setError(tr('Nhập ít nhất một vật liệu (từ 0,001 đến 1.000 kg).'));
      return;
    }
    const [lat,lng]=point;
    if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180){
      setError(tr('Tọa độ bàn giao không hợp lệ. Chọn lại vị trí trên bản đồ hoặc nhập vĩ độ từ -90 đến 90 và kinh độ từ -180 đến 180.'));
      return;
    }
    setHashing(true);
    try{
      // A real photo of the lot is required: its SHA-256 is the on-chain evidence.
      if(!file){setError(tr('Chụp hoặc chọn ảnh thật của lô phế liệu.'));return;}
      if(file.size>4*1024*1024){setError(tr('Chọn ảnh tối đa 4 MB.'));return;}
      const hash=await digest(await file.arrayBuffer());
      onCreate(grams,file,hash,point,String(f.get('contact')||'').trim(),String(f.get('address')||'').trim());
    }catch{
      setError(tr('Lỗi xử lý ảnh. Hãy chọn lại.'));
    }finally{
      setHashing(false);
    }
  }
  return <form className="lot-form" onSubmit={submit}><h3>{tr('Một lô, nhiều loại vật liệu')}</h3><p>{tr('Ước lượng khối lượng từng loại. Ảnh minh họa cả lô; ECO cuối cùng tính theo kết quả cân thực tế.')}</p><WeightInputs values={weights} onChange={setWeights}/><label>{tr('Ảnh thật của cả lô (bắt buộc)')}<input type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setFile(e.target.files?.[0])}/></label><div className="pickup-weights"><label>{tr('Số điện thoại / cách liên hệ')}<input name="contact" minLength={3} maxLength={120} required placeholder={tr("Người nhận việc sẽ dùng thông tin này")}/></label><label>{tr('Địa chỉ & thời gian bàn giao')}<input name="address" value={address} onChange={e=>setAddress(e.target.value)} minLength={5} maxLength={400} required placeholder={tr("Số nhà, đường, khung giờ thuận tiện")}/></label></div><p>{tr('Địa chỉ và liên hệ chỉ chia sẻ với chủ lô và người đã nhận việc.')} {tr('Ảnh được lưu riêng trên server local; không đưa ảnh hoặc số điện thoại lên blockchain.')}</p><h4>{tr('Vị trí bàn giao trên bản đồ (mặc định: {lat}, {lng})',{lat:point[0].toFixed(2),lng:point[1].toFixed(2)})}</h4><Suspense fallback={<p>{tr('Đang tải bản đồ…')}</p>}><PickupMap lots={[]} center={point} onPin={setPoint} onPlace={selectAddress}/></Suspense><div className="pickup-weights"><label>{tr('Vĩ độ')}<input type="number" step="any" min="-90" max="90" value={point?.[0]??''} onChange={e=>setPoint([Number(e.target.value),point?.[1]??106.69])}/></label><label>{tr('Kinh độ')}<input type="number" step="any" min="-180" max="180" value={point?.[1]??''} onChange={e=>setPoint([point?.[0]??10.78,Number(e.target.value)])}/></label></div><p className="footnote">{tr('Chỉ tọa độ làm tròn khoảng 1 km được ghi công khai, vĩnh viễn trên blockchain. Có thể nhập tọa độ nếu bản đồ không tải được.')}</p><div className="estimate"><span>{tr('Tổng dự kiến: {kg}',{kg:wt(total(weights.map(v=>Number(v)*1000)))})} · {tr('Tiền bán phế liệu ≈ {vnd} ₫',{vnd:fmt(buyCashVnd(weights.map(v=>Number(v)*1000)))})}</span><strong>+{fmt(points(weights.map(v=>Number(v)*1000)))} ECO</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full-width" disabled={busy||hashing}>{hashing?tr('Đang đọc ảnh & tạo mã băm…'):tr('Ký hợp đồng & Đăng lô tìm người thu gom')}<ArrowRight size={17}/></button></form>;
}
const rewardArtwork=new Map([
  ['Coffee voucher',{image:'/rewards/coffee.webp',name:'Voucher cà phê',tone:'coffee'}],
  ['Canvas tote bag',{image:'/rewards/tote.webp',name:'Túi vải canvas',tone:'tote'}],
  ['Green shopping voucher',{image:'/rewards/shopping.webp',name:'Voucher mua sắm xanh',tone:'shopping'}],
]);

type EcoExchangeProps = {
  exchange?:{rate:bigint;inventory:bigint};
  busy:boolean;
  buy:(avax:bigint,minimumEco:bigint)=>void;
  needed?:bigint;
};

const avaxUnit=10n**18n;
function decimalAmount(input:string,maxLength:number){
  const value=input.trim().replace(',','.');
  return value.length<=maxLength&&/^\d+(?:\.\d{1,18})?$/.test(value)?parseEther(value):undefined;
}

function EcoExchange({exchange,busy,buy,needed}:EcoExchangeProps){
  const [input,setInput]=useState('');
  const rate=exchange?.rate??0n;
  const value=needed!==undefined&&rate>0n?(needed*avaxUnit+rate-1n)/rate:decimalAmount(input,36)??0n;
  const output=value*rate/avaxUnit;
  const available=!!exchange&&rate>0n&&exchange.inventory>0n;
  const sufficientInventory=!!exchange&&output<=exchange.inventory;
  return <div className="pickup-callout eco-exchange">
    <strong>{tr('Đổi AVAX lấy ECO')}</strong>
    {needed!==undefined&&<p>{tr('Cần thêm {n} ECO',{n:formatEther(needed)})}</p>}
    {!available?<p>{tr('Quầy đổi AVAX chưa mở hoặc đã hết ECO dự trữ.')}</p>:<>
      <p>1 AVAX = {formatEther(rate)} ECO</p>
      {needed===undefined&&<label>{tr('Số AVAX muốn đổi')}<input value={input} onChange={e=>setInput(e.target.value)} inputMode="decimal" maxLength={36} placeholder="0.01"/></label>}
      {!sufficientInventory&&<p>{tr('Quầy đổi còn {n} ECO.',{n:formatEther(exchange.inventory)})}</p>}
      <button type="button" className="secondary" disabled={busy||output===0n||!sufficientInventory} onClick={()=>buy(value,output)}>
        {output>0n?tr('Đổi {avax} AVAX lấy {eco} ECO',{avax:formatEther(value),eco:formatEther(output)}):tr('Đổi AVAX lấy ECO')}
      </button>
    </>}
  </div>;
}

function ExchangeSettings({exchange,busy,submit}:{exchange:NonNullable<EcoExchangeProps['exchange']>;busy:boolean;submit:(fn:'setExchangeRate'|'fundExchange',value:bigint)=>void}){
  return <div className="pickup-callout eco-exchange">
    <h3>{tr('Quầy đổi AVAX → ECO')}</h3>
    <p>{tr('Quầy đổi còn {n} ECO.',{n:formatEther(exchange.inventory)})}</p>
    <form onSubmit={e=>{
      e.preventDefault();
      const rate=decimalAmount(String(new FormData(e.currentTarget).get('rate')),29);
      if(rate!==undefined&&rate<=parseEther('1000000000'))submit('setExchangeRate',rate);
    }}>
      <label>{tr('Tỷ lệ ECO cho 1 AVAX (0 để đóng quầy)')}
        <input name="rate" key={String(exchange.rate)} defaultValue={formatEther(exchange.rate)} inputMode="decimal" pattern="[0-9]{1,10}([.,][0-9]{1,18})?" required/>
      </label>
      <button className="secondary" disabled={busy}>{tr('Lưu tỷ lệ đổi')}</button>
    </form>
    <form onSubmit={e=>{
      e.preventDefault();
      const amount=decimalAmount(String(new FormData(e.currentTarget).get('amount')),36);
      if(amount!==undefined&&amount>0n)submit('fundExchange',amount);
    }}>
      <label>{tr('Số ECO testnet phát hành vào quầy đổi')}
        <input name="amount" inputMode="decimal" maxLength={36} pattern="[0-9]+([.,][0-9]{1,18})?" required/>
      </label>
      <button className="secondary" disabled={busy}>{tr('Bổ sung ECO dự trữ')}</button>
    </form>
  </div>;
}

function PickupRewards({swap,balanceAtomic,gasless,admin,address,account,collector,busy,balance,run,onChange,onConnect,onDone}:{swap?:EcoExchangeProps;balanceAtomic:bigint;gasless:boolean;admin:boolean;address?:Address;account?:Address;collector:boolean;busy:boolean;balance:number;run:(f:()=>Promise<void>)=>Promise<void>;onChange:()=>Promise<void>;onConnect:()=>void;onDone:(message:string)=>void}){
  const [rewards,setRewards]=useState<RewardItem[]>([]);
  const [receipts,setReceipts]=useState<ReceiptItem[]>([]);
  async function reload(){
    if(!address){setRewards([]);setReceipts([]);return;}
    try{
      const read=(functionName:string,args:unknown[]=[])=>publicClient.readContract({address,abi:pickupAbi,functionName,args} as never) as Promise<any>;
      const n=Number(await read('rewardCount'));
      setRewards(await Promise.all(Array.from({length:n},async(_,i)=>{const r=await read('rewards',[BigInt(i+1)]);return{id:i+1,name:r[0],cost:Number(r[1])/1e18,costAtomic:r[1],stock:Number(r[2]),active:r[3]};})));
      if(!account){setReceipts([]);return;}
      const count=Number(await read('redemptionCount'));
      const list:ReceiptItem[]=[];
      for(let i=count;i>Math.max(0,count-50);i--){
        const [owner,reward,done]=await Promise.all([read('redemptionOwner',[BigInt(i)]),read('redemptionReward',[BigInt(i)]),read('redemptionFulfilled',[BigInt(i)])]);
        if(same(owner,account)||collector)list.push({id:i,reward:Number(reward),owner,done});
      }
      setReceipts(list);
    }catch{/* keep the last loaded list when RPC fails */}
  }
  useEffect(()=>{reload().catch(()=>{});},[address,account,balance,collector]);
  const active=rewards.filter(r=>r.active);
  const rewardName=(name:string)=>tr(rewardArtwork.get(name)?.name??name);
  return <section className="reward-shop" aria-labelledby="reward-shop-title">
    <header className="reward-shop-header">
      <div>
        <h2 id="reward-shop-title">{tr('Đổi điểm, nhận điều xanh')}</h2>
        <p>{tr('Sử dụng số dư ECO tích lũy từ các lô phế liệu đã hoàn tất để đổi voucher và sản phẩm thân thiện môi trường.')}</p>
      </div>
      {account?<div className="reward-shop-balance"><Coins size={21} aria-hidden="true"/><div>
        <span>{tr('ECO khả dụng')}</span><strong>{fmt(balance)} ECO</strong>
      </div></div>:<button type="button" className="secondary" onClick={onConnect}>{tr('Kết nối ví')}</button>}
    </header>
    {!address&&<p>{tr('Phần thưởng sẽ hiện khi contract thu gom V4 được kích hoạt.')}</p>}
    {address&&!active.length&&<p>{tr('Chưa có phần thưởng nào trên contract.')}</p>}
    {active.length>0&&<div className="reward-vouchers">{active.map(reward=>{
      const art=rewardArtwork.get(reward.name);
      const unavailable=reward.stock===0;
      const shortfall=!!account&&balanceAtomic<reward.costAtomic;
      return <article className="reward-voucher" key={reward.id} data-tone={art?.tone??'tote'}>
        <div className="reward-voucher-cover">
          {art?<img src={art.image} alt="" width={768} height={512}/>:<Gift size={48} aria-hidden="true"/>}
        </div>
        <div className="reward-voucher-body">
          <h3>{rewardName(reward.name)}</h3>
          <div className="reward-voucher-meta">
            <strong>{fmt(reward.cost)} <small>ECO</small></strong>
            <span>{unavailable?tr('Hết lượt đổi'):tr('Còn {n} suất',{n:reward.stock})}</span>
          </div>
          <button type="button" className="reward-voucher-action" disabled={busy||unavailable||shortfall} onClick={()=>{
            if(!account){onConnect();return;}
            if(!address)return;
            void run(async()=>{
              await householdWrite(address,account,'redeemReward',[BigInt(reward.id)],gasless);
              await onChange();
              await reload();
              onDone(tr('Đã đổi quà thành công (-{cost} ECO). Biên nhận đã được tạo!',{cost:fmt(reward.cost)}));
            });
          }}>{unavailable?tr('Hết lượt đổi'):shortfall?tr('Cần thêm {n} ECO',{n:formatEther(reward.costAtomic-balanceAtomic)}):tr('Đổi quà ngay')}<ArrowRight size={17} aria-hidden="true"/></button>
          {shortfall&&!unavailable&&swap&&<EcoExchange {...swap} needed={reward.costAtomic-balanceAtomic}/>}
        </div>
      </article>;
    })}</div>}
    {admin&&address&&account&&<form className="reward-admin" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const form=e.currentTarget;run(async()=>{const name=String(f.get('name')||'').trim();const cost=String(f.get('cost')||'').replace(',','.');const stock=Number(f.get('stock'));if(!name||name.length>120)throw new Error(tr('Nhập tên phần thưởng (tối đa 120 ký tự).'));if(!/^\d*\.?\d+$/.test(cost)||Number(cost)<=0)throw new Error(tr('Số ECO phải lớn hơn 0.'));if(!Number.isInteger(stock)||stock<0)throw new Error(tr('Số suất phải là số nguyên không âm.'));await pickupWrite(address,account,'addReward',[name,parseEther(cost),BigInt(stock)]);form.reset();await reload();onDone(tr('Đã thêm phần thưởng lên contract.'));});}}><h4>{tr('Thêm phần thưởng thật (quản trị)')}</h4><div className="pickup-weights"><label>{tr('Tên phần thưởng')}<input name="name" required maxLength={120} placeholder={tr('VD: Voucher cà phê của đối tác')}/></label><label>{tr('Giá (ECO)')}<input name="cost" required inputMode="decimal" placeholder="100"/></label><label>{tr('Số suất')}<input name="stock" required type="number" min="0" step="1" placeholder="20"/></label></div><button className="secondary" disabled={busy}>{tr('Thêm phần thưởng')}</button></form>}
    <section className="reward-receipts"><h4>{tr('Biên nhận đổi quà ({n})',{n:receipts.length})}</h4>{receipts.length?receipts.map(r=><div className="pickup-receipt" key={r.id}><span>#{r.id} · <strong>{rewardName(rewards.find(x=>x.id===r.reward)?.name||'')||tr('Quà #{id}',{id:r.reward})}</strong> {tr('· Ví nhận:')} <code>{short(r.owner)}</code> · {r.done?tr('✅ Đã giao quà'):tr('⏳ Chờ nhận tại trạm')}</span>{collector&&!r.done&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(!address||!account)throw new Error(tr('Kết nối ví để xác nhận.'));await pickupWrite(address,account,'fulfillRedemption',[BigInt(r.id)]);await reload();})}>{tr('Xác nhận đã giao quà')}</button>}</div>):<p>{tr('Chưa có biên nhận.')}</p>}</section></section>;
}
function CertificateCard({certificate,lotId,compact}:{certificate:Address;lotId:number;compact?:boolean}){
  const [cert,setCert]=useState<CertificateView|null>();
  useEffect(()=>{let live=true;setCert(undefined);readCertificate(certificate,lotId).then(c=>{if(live)setCert(c||null);});return()=>{live=false;};},[certificate,lotId]);
  if(cert===undefined)return <p role="status" className="footnote">{tr('Đang tải chứng nhận NFT…')}</p>;
  if(!cert)return null;
  return <div className={compact?'cert-card compact':'cert-card'}><img src={cert.image} alt={cert.name}/><div><strong><Award size={15}/>{tr('Chứng nhận tái chế NFT #{id}',{id:lotId})}</strong>{!compact&&<p>{tr('Lưu vĩnh viễn trên Avalanche: ai cũng kiểm chứng được số kg đã tái chế, ví dụ doanh nghiệp cần báo cáo trách nhiệm tái chế.')}</p>}<a className="text-link" href={certificateUrl(certificate,lotId)} target="_blank" rel="noreferrer">{tr('Xem trên Snowtrace')}<ExternalLink size={12}/></a></div></div>;
}
