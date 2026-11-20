import {lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react';
import {MapPin,Plus,RefreshCw,Navigation,ArrowRight,CheckCircle2,PackageCheck,ShieldCheck,Lock,Star,Coins,SlidersHorizontal,ChevronLeft,ChevronRight,Award,ExternalLink,Database,Fuel,Pencil,Trash2,Eye,EyeOff} from 'lucide-react';
import {formatEther,isAddress,keccak256,parseEther,stringToHex,type Address,type Hash} from 'viem';
import {chain,getWalletName} from './wallet';
import {errorMessage,txUrl,publicClient} from './chain';
import {materials,short} from './model';
import {tr,num as fmt,wt,dateTime,notify,unit} from './settings';
import {uploadEvidence,viewEvidence} from './evidence';
import {pickupAbi} from './generated/pickup';
import {lotStatuses,activatePickup,deployPickup,digest,distanceKm,pendingPickup,pickupDetails,pickupRead,pickupReadWallet,pickupWrite,householdWrite,fundRelayer,exchangeState,requiredDeposit,payoutPreview,addressUrl,isPickupV4,checkPendingPickup,dismissUnseenPickup,savePickupPhoto,savePickupDetails,ZERO,type Lot} from './pickupClient';
import {queryProductCards,type ListingStatus,type SortOption,type ShopeeWeb3ProductCard} from './marketplace';
import PickupChat from './PickupChat';
import './pickup.css';
import './rewards.css';
import EarnEco from './EarnEco';
import {speakFeedback} from './voiceFeedback';
import {saveAdminCatalog,useAdminCatalog,type CustomLotItem} from './adminCatalog';
import {DummyLotPaymentCard,DummyWalletWidget} from './DummyPaymentBox';
import {EnvironmentalImpactBanner} from './EnvironmentalImpact';
import {LotReviewBox,useLotReviews,getWalletRatingSummary} from './LotReviewBox';
import {totalKg as total,pointsEco as points,calcLotEconomics} from './EcoEconomics';
import {AdminRevenueDashboard,AdminEconomicsPanel,AdminAccountsPanel,ExchangeSettings} from './AdminPanels';
import {PickupRewards} from './PickupRewards';
import {PickupHistorySection} from './PickupHistory';
import {LotForm,WeightInputs} from './LotForm';
import {EcoExchange,type EcoExchangeProps} from './EcoExchange';
import {CertificateCard} from './CertificateCard';
import {requestCollectorVerification,verificationRequested,pendingVerificationRequests,type VerificationRequest} from './collectorVerification';

const PickupMap=lazy(()=>import('./PickupMap'));
// Sample data has been removed from the app; clear what older versions stored in this browser.
try{for(const k of ['ecoloop-pickup-catalog-v2','ecoloop-pickup-rewards-v2','ecoloop-user-lots-meta','ecoloop-data-mode'])localStorage.removeItem(k);}catch{/* storage unavailable */}

const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();

export default function Pickup({account,admin,onConnect,page='home',role='seller',createRequest=0,onOpenOrders,onBrowseAsCollector,collectorLot,onContractAdmin,children,walletSlot}:{
  children?:ReactNode;walletSlot?:ReactNode;account?:Address;admin:boolean;
  demo?:boolean;onConnect:()=>void;page?:'home'|'orders'|'wallet'|'rewards'|'settings'|'messages'|'admin';
  role?:'seller'|'collector';createRequest?:number;collectorLot?:number;
  onContractAdmin?:(isAdmin:boolean)=>void;
  onOpenOrders:()=>void;onBrowseAsCollector:(lotId:number)=>void;
}){
  const [rewardsAddress,setRewardsAddress]=useState<Address>();
  const [address,setAddress]=useState<Address>();const [onChainLots,setOnChainLots]=useState<Lot[]>([]);const [count,setCount]=useState(0);const [limit,setLimit]=useState(100);
  const [balanceAtomic,setBalanceAtomic]=useState(0n);const [view,setView]=useState<'grid'|'map'>('grid');const [loading,setLoading]=useState(true);const [marketError,setMarketError]=useState(false);const [category,setCategory]=useState(-1);const [query,setQuery]=useState('');const [canFulfillRewards,setCanFulfillRewards]=useState(false);const [paused,setPaused]=useState(false);
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

  const catalog=useAdminCatalog();
  const reviews=useLotReviews();
  const [adminShowHiddenLots,setAdminShowHiddenLots]=useState(false);
  const [adminAllStatuses,setAdminAllStatuses]=useState(false);
  const [adminAddingLot,setAdminAddingLot]=useState(false);
  const [adminEditingLotId,setAdminEditingLotId]=useState<number|null>(null);

  const customLotsAsOnChain:Lot[]=catalog.customLots.map(c=>({
    id:c.id,
    owner:(c.ownerWallet||account||ZERO) as Address,
    collector:ZERO as Address,
    estimated:c.estimatedGrams,
    actual:[0,0,0,0],
    evidence:('0x'+'0'.repeat(64)) as Hash,
    latitude:10.78,
    longitude:106.70,
    updatedAt:c.createdAt,
    status:c.status,
    deposit:0,
    paid:0,
  }));

  const mergedLots=[...onChainLots,...customLotsAsOnChain].map(l=>{
    const ov=catalog.lotOverrides[l.id];
    if(!ov?.estimatedGrams)return l;
    return {...l,estimated:ov.estimatedGrams};
  });
  const lots=mergedLots.filter(l=>{
    const hidden=!!catalog.lotOverrides[l.id]?.hidden;
    if(!hidden)return true;
    return admin&&adminShowHiddenLots;
  });
  const hiddenLotsCount=mergedLots.filter(l=>!!catalog.lotOverrides[l.id]?.hidden).length;
  const seller=role==='seller';
  const browseMarket=page==='home'&&!creating;
  const collectorMarket=browseMarket&&!seller;
  const marketLots=lots.filter(l=>(admin&&adminAllStatuses?true:l.status===1)&&(seller||admin||!same(l.owner,account)));
  const myLots=lots.filter(l=>same(seller?l.owner:l.collector,account));
  const chatLots=page==='messages'?myLots.filter(l=>l.collector!==ZERO&&[2,3,4].includes(l.status)):[];
  const chatLot=address?chatLots.find(l=>l.id===selected):undefined;
  const current=(page==='orders'?myLots:browseMarket?marketLots:[]).find(l=>l.id===selected);
  const isCurrentOnChain=!!address&&!!current&&onChainLots.some(l=>l.id===current.id);
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
    cancelLot:(isOwner||admin)&&current?.status===1,
    proposeLot:isAssignedCollector&&current?.status===2&&!paused,
    acceptLot:isOwner&&current?.status===3&&!paused&&consent&&Date.now()<=current.updatedAt+7*86400000,
    disputeLot:isOwner&&current?.status===3,
    releaseLot:!!current&&[2,3].includes(current.status)&&(isAssignedCollector||admin||(isOwner&&Date.now()>current.updatedAt+7*86400000)),
  };

  const effectiveBalance=Number(formatEther(balanceAtomic));
  const canSponsor=canFulfillRewards&&gasless&&depositWei!==undefined&&(exchange?.sponsorPool??0n)>=depositWei;
  const [verifyRequested,setVerifyRequested]=useState(false);
  const [verifyQueue,setVerifyQueue]=useState<VerificationRequest[]>([]);
  useEffect(()=>{
    if(!account||canFulfillRewards){setVerifyRequested(false);return;}
    let live=true;void verificationRequested(account).then(r=>{if(live)setVerifyRequested(r);});
    return()=>{live=false;};
  },[account,canFulfillRewards]);
  const loadVerifyQueue=()=>void pendingVerificationRequests().then(setVerifyQueue);

  const applyCardOverrides=(card:ShopeeWeb3ProductCard):ShopeeWeb3ProductCard=>{
    const ov=catalog.lotOverrides[card.lotId];
    const custom=catalog.customLots.find(c=>c.id===card.lotId);
    if(!ov&&!custom)return card;
    return {
      ...card,
      title:ov?.title||custom?.title||card.title,
      shortDescription:ov?.description||custom?.description||card.shortDescription,
      seller:custom?{
        ...card.seller,
        location:{
          ...card.seller.location,
          district:custom.district||card.seller.location.district,
          province:custom.province||card.seller.location.province,
        },
      }:card.seller,
    };
  };

  const marketplaceResult=queryProductCards(
    lots,
    {
      sort,
      status:admin&&adminAllStatuses?['ACTIVE','IN_ESCROW','SOLD','CANCELLED']:['ACTIVE'],
      materialIndex:category>=0?category:undefined,
      lat:center?.[0],
      lng:center?.[1],
      radiusKm:radius>0?radius:undefined,
      q:query,
      excludeOwner:seller||admin?undefined:account,
      page:pageNum,
      limit:pageSize,
    },
    {chainId:chain.id,contractAddress:address,role}
  );

  const activeFilters=(radius>0?1:0);
  const cards=marketplaceResult.items.map(applyCardOverrides);
  const pagination=marketplaceResult.meta.pagination;
  const visible=cards.map(c=>lots.find(l=>l.id===c.lotId)!).filter(Boolean);
  const rawSelectedCard:ShopeeWeb3ProductCard|undefined=current?queryProductCards([current],{status:['ACTIVE','IN_ESCROW','SOLD','CANCELLED']},{chainId:chain.id,contractAddress:address}).items[0]:undefined;
  const selectedCard=rawSelectedCard?applyCardOverrides(rawSelectedCard):undefined;
  const allCards=page==='orders'&&account?queryProductCards(
    myLots,
    {
      sort:'newest',
      status:['ACTIVE','IN_ESCROW','SOLD','CANCELLED'],
      page:1,
      limit:500,
    },
    {chainId:chain.id,contractAddress:address}
  ).items.map(applyCardOverrides):[];

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
        setBalanceAtomic(wallet?.balanceAtomic??0n);setCanFulfillRewards(!!wallet?.collector);
        onContractAdmin?.(!!wallet?.admin);
      }else{
        onContractAdmin?.(false);
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
    setBalanceAtomic(0n);setCanFulfillRewards(false);
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
      // A verified station without enough ECO claims through the sponsor pool (no ECO, no AVAX needed).
      const sponsoredClaim=balanceAtomic<depositWei&&canSponsor;
      setHash(await householdWrite(address,account,sponsoredClaim?'claimLotSponsored':fn,[BigInt(id),depositWei],gasless));
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
      <h2>{({home:seller?tr('Bán phế liệu'):tr('Lô đang chờ thu gom'),orders:seller?tr('Lô của tôi'):tr('Lô đã nhận'),wallet:tr('Ví xanh của bạn'),messages:tr('Tin nhắn'),admin:tr('Quản trị Doanh thu & Hệ thống'),settings:tr('Thiết lập hệ thống')})[page]}</h2>
      <p>{page==='settings'?tr('Ngôn ngữ, giao diện, đơn vị và thông báo cá nhân.'):page==='admin'?tr('Bảng điều khiển dành riêng cho ví Quản trị viên (0xcCb9…7098): theo dõi lợi nhuận ròng, chiết khấu điều phối và cấu hình sàn.'):tr('Bán và thu gom phế liệu tận nơi minh bạch. Địa chỉ và số điện thoại được bảo mật, chỉ người bán và người nhận đơn xem được.')}</p>
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
    {page==='admin'&&!admin&&<section className="pickup-callout"><h3>{tr('🛡️ Khu vực dành riêng cho Quản trị viên')}</h3><p>{tr('Quyền quản trị hệ thống và thống kê lợi nhuận Chủ App chỉ thuộc về ví 0xcCb958ed2931073568359336344088A914f57098. Vui lòng kết nối đúng ví quản trị.')}</p><button className="primary" onClick={onConnect}>{tr('Kết nối ví Quản trị')}</button></section>}
    {seller&&!admin&&page==='home'&&<div className="pickup-intro"><div><h2>{tr('Đăng lô để hẹn thu gom')}</h2><p>{tr('Thêm ảnh, khối lượng dự kiến và địa chỉ bàn giao. Xác nhận số cân sau khi người thu gom gửi đề xuất.')}</p></div>{creating?<button className="secondary" disabled={busy} onClick={()=>setCreating(false)}>{tr('Đóng biểu mẫu')}</button>:<button className="primary" onClick={onOpenOrders}>{tr('Lô của tôi')}</button>}</div>}
    {page==='orders'&&!account&&<button className="secondary" onClick={onConnect}>{tr('Kết nối ví')}</button>}
    {loading&&!lots.length&&<p role="status">{tr('Đang tải dữ liệu từ mạng…')}</p>}
    {page==='admin'&&account&&admin&&canConfigurePickup&&!address&&!loading&&!marketError&&<section className="pickup-callout">
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
    {address&&page!=='settings'&&<div className="data-mode-bar"><span className="live-chip"><ShieldCheck size={15}/>{tr('Dữ liệu thật trên Avalanche')}</span>{gasless?<span className="gasless-chip"><Fuel size={14}/>{tr('Miễn phí gas cho hộ gia đình')}</span>:admin&&relayerAddress&&account&&<button type="button" className="text-link" disabled={busy} onClick={()=>void run(async()=>{setHash(await fundRelayer(account,relayerAddress,parseEther('0.1')));await refresh();setMessage(tr('🎉 Đã nạp 0.1 AVAX vào ví tài trợ gas! Tất cả ví Google hiện đã được miễn phí gas.'));})}><Fuel size={14}/>{tr('Nạp 0.1 AVAX bật miễn phí gas cho Ví Google')} ({short(relayerAddress)})</button>}</div>}
    {marketError&&(page==='home'||page==='orders')&&<div className="pickup-callout" role="status"><p>{tr('Chưa tải được dữ liệu lô mới nhất. Vui lòng thử lại.')}</p><button type="button" className="secondary" onClick={()=>void refresh()}>{tr('Thử lại')}</button></div>}
    {!address&&page!=='settings'&&page!=='rewards'&&!loading&&!marketError&&<div className="pickup-callout"><strong>{tr('Chưa có contract thu gom V4')}</strong><p>{tr('Các lô sẽ xuất hiện sau khi sàn được cấu hình địa chỉ V4 dùng chung.')}</p></div>}
    {page==='wallet'&&walletSlot}
    {address&&<>
      {browseMarket&&<div className="pickup-summary">
        <span><strong>{marketLots.length}</strong> {tr('đang mở bán')}</span>
        <span><strong>{fmt(effectiveBalance)}</strong> {tr('ECO khả dụng')}</span>
        {admin&&<a className="text-link" href={addressUrl(address)} target="_blank" rel="noreferrer"><Database size={14}/>{tr('Contract trên Snowtrace')}<ExternalLink size={12}/></a>}
      </div>}
      {seller&&!admin&&creating&&page==='home'&&<LotForm busy={busy||paused} center={center} onCreate={(...args)=>run(()=>create(...args))}/>}
      {browseMarket&&<>
        <EnvironmentalImpactBanner lots={lots}/>
        {admin&&<section className="pickup-callout" aria-label={tr('Quản trị Trang bán')}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
            <div>
              <strong>🛡️ {tr('Quản trị Trang bán — Thêm, Sửa, Xóa / Ẩn lô phế liệu')}</strong>
              <p className="footnote">{tr('Chủ App có thể thêm lô điều phối mới, bấm vào từng lô để sửa tiêu đề/khối lượng hoặc ẩn/xóa lô vi phạm khỏi sàn.')}</p>
            </div>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              <button type="button" className="primary" onClick={()=>setAdminAddingLot(v=>!v)}>
                <Plus size={15}/> {adminAddingLot?tr('Đóng biểu mẫu'):tr('Thêm lô mới')}
              </button>
              <button type="button" className="secondary" onClick={()=>setAdminAllStatuses(v=>!v)}>
                {adminAllStatuses?tr('Chỉ xem lô đang mở'):tr('Xem tất cả trạng thái lô')}
              </button>
              <button type="button" className="secondary" onClick={()=>setAdminShowHiddenLots(v=>!v)}>
                {adminShowHiddenLots?<><EyeOff size={15}/> {tr('Ẩn các lô đã xóa')}</>:<><Eye size={15}/> {tr('Hiện lô đã ẩn ({n})',{n:hiddenLotsCount})}</>}
              </button>
            </div>
          </div>
          {adminAddingLot&&<form className="pickup-callout" style={{marginTop:'12px'}} onSubmit={e=>{
            e.preventDefault();
            const f=new FormData(e.currentTarget);
            const title=String(f.get('title')||'').trim();
            const description=String(f.get('description')||'').trim();
            const district=String(f.get('district')||'Quận 1').trim();
            const province=String(f.get('province')||'TP.HCM').trim();
            const grams=[0,1,2,3].map(i=>Math.max(0,Math.round(Number(f.get('w'+i)||0)*1000))) as [number,number,number,number];
            if(!title||total(grams)<=0){setFailure(true);setMessage(tr('Nhập tiêu đề và ít nhất một khối lượng vật liệu > 0.'));return;}
            const nextId=Math.max(1000,...mergedLots.map(l=>l.id))+1;
            const newLot:CustomLotItem={
              id:nextId,
              title,
              description:description||tr('Lô điều phối từ Trạm thu gom EcoLoop'),
              district,
              province,
              estimatedGrams:grams,
              ownerWallet:account||ZERO,
              status:1,
              createdAt:Date.now(),
            };
            void saveAdminCatalog(prev=>({...prev,customLots:[newLot,...prev.customLots]}),account).then(()=>{
              setAdminAddingLot(false);
              setFailure(false);
              setMessage(tr('Đã thêm lô mới #{id} lên Trang bán.',{id:nextId}));
            });
          }}>
            <h4>{tr('Thêm lô phế liệu lên Trang bán (Quản trị)')}</h4>
            <div className="pickup-weights">
              <label>{tr('Tiêu đề lô phế liệu')}<input name="title" required maxLength={120} placeholder={tr('VD: Lô vỏ chai PET & thùng carton siêu thị')}/></label>
              <label>{tr('Mô tả chi tiết')}<input name="description" maxLength={240} placeholder={tr('VD: Đã phân loại sạch, sẵn sàng bàn giao ngay')}/></label>
              <label>{tr('Quận / Huyện')}<input name="district" defaultValue="Quận 1" required/></label>
              <label>{tr('Tỉnh / Thành phố')}<input name="province" defaultValue="TP.HCM" required/></label>
            </div>
            <div className="pickup-weights">
              {materials.map((m,i)=><label key={m.name}>{tr(m.name)} (kg)<input name={'w'+i} type="number" step="0.1" min="0" defaultValue={i===0?'10':'0'}/></label>)}
            </div>
            <button type="submit" className="primary">{tr('Lưu & Đăng lên Trang bán')}</button>
          </form>}
        </section>}
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
                  <strong className="lot-card-title">{card.title}{catalog.lotOverrides[card.lotId]?.hidden?` (${tr('Đã ẩn')})`:''}</strong>
                </span>
                <span className="lot-materials">
                  {card.materialTags.map(m=>`${m.symbol} ${tr(m.name)} ${wt(m.kilograms)}`).join(' · ')}
                </span>
                <span className="shopee-price-row">
                  <b className="lot-eco"><Coins size={14}/> +{card.pricing.amountFormatted} {card.pricing.tokenSymbol}</b>
                  {(()=>{
                    const rawLot=lots.find(l=>l.id===card.lotId);
                    const w=rawLot?([3,4].includes(rawLot.status)&&rawLot.actual.some(x=>x>0)?rawLot.actual:rawLot.estimated):[0,0,0,0];
                    const {sellerCash,collectorFee}=calcLotEconomics(w);
                    return <small className="fiat-equiv">{seller?tr('Tiền bán ≈ {vnd} ₫',{vnd:fmt(sellerCash)}):tr('Mua {vnd} ₫ · Công thu gom +{profit} ₫',{vnd:fmt(sellerCash),profit:fmt(collectorFee)})}</small>;
                  })()}
                </span>
                <span className="shopee-rating-row">
                  {(()=>{
                    const liveRating=getWalletRatingSummary(reviews,card.onChain.sellerWallet);
                    const score=liveRating.count>0?liveRating.avg:card.seller.reputationScore;
                    return score>0?<span className="star-badge"><Star size={11} fill="currentColor"/> {score.toFixed(1)}{liveRating.count>0?` (${liveRating.count})`:''}</span>:null;
                  })()}
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
            {(current.status===4||!!catalog.dummyPayments[current.id])&&<LotReviewBox lotId={current.id} sellerWallet={current.owner} collectorWallet={current.collector} currentAccount={account} role={role} admin={admin} onReviewed={setMessage}/>}
            {admin&&<div className="pickup-callout" style={{marginBottom:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                <strong>🛠️ {tr('Quyền Quản trị Lô #{id}',{id:current.id})}</strong>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                  <button type="button" className="secondary" onClick={()=>setAdminEditingLotId(adminEditingLotId===current.id?null:current.id)}>
                    <Pencil size={14}/> {adminEditingLotId===current.id?tr('Đóng sửa'):tr('Sửa thông tin lô')}
                  </button>
                  <button type="button" className="secondary" onClick={()=>{
                    const isCustom=catalog.customLots.some(c=>c.id===current.id);
                    const currentlyHidden=!!catalog.lotOverrides[current.id]?.hidden;
                    void saveAdminCatalog(prev=>{
                      if(isCustom&&!currentlyHidden){
                        return {...prev,customLots:prev.customLots.filter(c=>c.id!==current.id)};
                      }
                      return {
                        ...prev,
                        lotOverrides:{
                          ...prev.lotOverrides,
                          [current.id]:{
                            ...prev.lotOverrides[current.id],
                            lotId:current.id,
                            hidden:!currentlyHidden,
                          },
                        },
                      };
                    },account).then(()=>{
                      setSelected(undefined);
                      setMessage(currentlyHidden?tr('Đã khôi phục hiển thị lô #{id}.',{id:current.id}):tr('Đã xóa / ẩn lô #{id} khỏi Trang bán.',{id:current.id}));
                    });
                  }}>
                    <Trash2 size={14}/> {catalog.lotOverrides[current.id]?.hidden?tr('Khôi phục lô'):tr('Xóa / Ẩn lô này')}
                  </button>
                </div>
              </div>
              {adminEditingLotId===current.id&&<form style={{marginTop:'10px'}} onSubmit={e=>{
                e.preventDefault();
                const f=new FormData(e.currentTarget);
                const title=String(f.get('title')||'').trim();
                const description=String(f.get('description')||'').trim();
                const grams=[0,1,2,3].map(i=>Math.max(0,Math.round(Number(f.get('w'+i)||0)*1000))) as [number,number,number,number];
                void saveAdminCatalog(prev=>({
                  ...prev,
                  lotOverrides:{
                    ...prev.lotOverrides,
                    [current.id]:{
                      ...prev.lotOverrides[current.id],
                      lotId:current.id,
                      title:title||undefined,
                      description:description||undefined,
                      estimatedGrams:total(grams)>0?grams:undefined,
                    },
                  },
                }),account).then(()=>{
                  setAdminEditingLotId(null);
                  setMessage(tr('Đã cập nhật thông tin lô #{id}.',{id:current.id}));
                });
              }}>
                <div className="pickup-weights">
                  <label>{tr('Tiêu đề hiển thị')}<input name="title" defaultValue={selectedCard.title} required/></label>
                  <label>{tr('Mô tả chi tiết')}<input name="description" defaultValue={selectedCard.shortDescription}/></label>
                </div>
                <div className="pickup-weights">
                  {materials.map((m,i)=><label key={m.name}>{tr(m.name)} (kg)<input name={'w'+i} type="number" step="0.001" min="0" defaultValue={String(current.estimated[i]/1000)}/></label>)}
                </div>
                <button type="submit" className="primary">{tr('Lưu thay đổi lô')}</button>
              </form>}
            </div>}
            <img className="pickup-evidence" src={photo||selectedCard.thumbnail.previewUrl} alt={selectedCard.title}/>
            <p>{selectedCard.shortDescription}</p>
            <div className="web3-metadata-box">
              <div><span>{tr('Trạng thái đơn:')}</span> <strong>{tr(selectedCard.uiState.statusLabelVi)} — {tr(selectedCard.uiState.subStatusLabelVi)}</strong></div>
              <div><span>{tr('Người bán:')}</span> <strong>{selectedCard.seller.displayName}</strong> (<code>{short(current.owner)}</code>) · {tr('({n} lô hoàn tất)',{n:selectedCard.seller.completedSalesCount})}</div>
              <div><span>{tr('Người nhận thu gom:')}</span> <code>{current.collector===ZERO?tr('Chưa có người nhận'):short(current.collector)}</code></div>
              <div><span>{tr('Khu vực bàn giao:')}</span> {selectedCard.seller.location.district}, {selectedCard.seller.location.province}</div>
              {admin&&<>
                <div><span>Contract V4 (Chain {chain.id}):</span> <code>{address?short(address):'—'}</code></div>
                <div><span>{tr('SHA-256 ảnh lô:')}</span> <code>{short(current.evidence)}</code></div>
              </>}
              {selectedCard.onChain.escrowLockExpiresAt&&<div><span>{tr('Thời hạn xử lý đơn:')}</span> {dateTime(selectedCard.onChain.escrowLockExpiresAt)}</div>}
            </div>
            <table><thead><tr><th>{tr('Vật liệu')}</th><th>{tr('Đơn giá thu mua')}</th><th>{tr('Dự kiến')}</th><th>{tr('Thực tế')}</th></tr></thead><tbody>{materials.map((m,i)=><tr key={m.name}><td>{m.symbol} {tr(m.name)}</td><td>{fmt(catalog.economics.buyVnd[i]??m.buyVnd)} ₫/kg</td><td>{wt(current.estimated[i]/1000)}</td><td>{[3,4].includes(current.status)?wt(current.actual[i]/1000):'—'}</td></tr>)}</tbody></table>
            {(()=>{
              const activeWeights=[3,4].includes(current.status)&&current.actual.some(x=>x>0)?current.actual:current.estimated;
              const isActual=[3,4].includes(current.status)&&current.actual.some(x=>x>0);
              const {sellerCash,stationCash,collectorFee,appCommission,eprVnd,appTotalProfit,collectorSharePct,appSharePct}=calcLotEconomics(activeWeights);
              return (
                <div className="pricing-breakdown-box">
                  <strong>{admin?tr('💵 Bảng tính tiền thu mua & Lợi nhuận Chủ App'):tr('💵 Bảng tính giá trị thu mua phế liệu')} ({isActual?tr('Theo cân thực tế'):tr('Tạm tính theo dự kiến')})</strong>
                  <div className="pricing-row highlight-cash">
                    <span>{tr('Tiền mặt trả cho Người bán:')}</span>
                    <b>{fmt(sellerCash)} ₫ (+{selectedCard.pricing.amountFormatted} ECO)</b>
                  </div>
                  <div className="pricing-row">
                    <span>{tr('Thù lao vận chuyển cho Người thu gom ({pct}% chênh lệch):',{pct:collectorSharePct})}</span>
                    <b>+{fmt(collectorFee)} ₫</b>
                  </div>
                  {admin&&<>
                    <div className="pricing-row">
                      <span>{tr('Giá bao tiêu gốc từ Nhà máy tái chế:')}</span>
                      <b>{fmt(stationCash)} ₫</b>
                    </div>
                    <div className="pricing-row">
                      <span>{tr('Chiết khấu điều phối về Chủ App EcoLoop ({pct}% chênh lệch):',{pct:appSharePct})}</span>
                      <b>+{fmt(appCommission)} ₫</b>
                    </div>
                    <div className="pricing-row">
                      <span>{tr('Doanh thu bán Tín chỉ Tái chế EPR (B2B NFT) về Chủ App:')}</span>
                      <b>+{fmt(eprVnd)} ₫</b>
                    </div>
                    <div className="pricing-row highlight-profit">
                      <span>{tr('💎 Tổng lợi nhuận ròng về Chủ App EcoLoop:')}</span>
                      <b>+{fmt(appTotalProfit)} ₫</b>
                    </div>
                  </>}
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
            {(isOwner||isAssignedCollector||admin)&&isCurrentOnChain&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>{
              if(!account||!address){onConnect();return;}
              const v=detailVersion.current;
              const details=await pickupDetails(account,address,current);
              if(v!==detailVersion.current)return;
              setDetail(details);
            })}>{tr('Xem liên hệ & địa chỉ bàn giao')}</button>}
            {(isOwner||isAssignedCollector||admin)&&isCurrentOnChain&&!photo&&<button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{
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
            {actions.claimLot&&depositWei!==undefined&&balanceAtomic<depositWei&&(canSponsor
              ?<div className="pickup-callout"><strong>{tr('⚡ Nhận đơn miễn phí — Quỹ ứng trước của EcoLoop khóa {eco} ECO đảm bảo thay bạn',{eco:eco(depositWei)})}</strong><p>{tr('Bạn là trạm thu gom đã xác minh nên không cần có ECO hay AVAX. Khoản đảm bảo do quỹ ứng trước khóa; khi hoàn tất, người bán nhận ECO theo số cân và phần dư quay về quỹ.')}</p></div>
              :<>{canFulfillRewards
                ?<p role="status">{tr('Quỹ ứng trước đang không đủ hoặc bạn đã nhận tối đa 3 đơn ứng trước. Hoàn tất bớt đơn hoặc liên hệ quản trị viên.')}</p>
                :<div className="pickup-callout"><strong>{tr('Trở thành trạm thu gom đã xác minh để nhận đơn miễn phí')}</strong>
                  <p>{tr('Trạm đã xác minh nhận đơn bằng quỹ ứng trước của EcoLoop, không cần ECO hay AVAX. Gửi yêu cầu, quản trị viên sẽ kiểm tra và duyệt.')}</p>
                  {verifyRequested
                    ?<p role="status"><CheckCircle2 size={15}/> {tr('Đã gửi yêu cầu xác minh. Vui lòng chờ quản trị viên duyệt.')}</p>
                    :<button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{await requestCollectorVerification(account!);setVerifyRequested(true);setMessage(tr('Đã gửi yêu cầu xác minh. Vui lòng chờ quản trị viên duyệt.'));})}>{tr('Gửi yêu cầu xác minh trạm thu gom')}</button>}
                </div>}</>)}
            {collectorMarket&&(!account||actions.claimLot)&&<button className="primary full-width" disabled={busy||paused||!!account&&(depositWei===undefined||(balanceAtomic<depositWei&&!canSponsor))} onClick={()=>account?run(()=>change('claimLot',[BigInt(current.id)])):onConnect()}>{!account?tr('Kết nối ví'):tr('Nhận đơn đi thu gom ngay')} <ArrowRight size={16}/></button>}
            {current.status===1&&isOwner&&<button className="secondary" disabled={busy} onClick={()=>run(()=>change('cancelLot',[BigInt(current.id)]))}>{tr('Hủy bài đăng')}{freeGas}</button>}
            {isAssignedCollector&&current.status===2&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const weights=actual.map(s=>Math.round(Number(s)*1000));if(weights.some(n=>!Number.isSafeInteger(n)||n<0)||total(weights)<=0||total(weights)>1000)throw new Error(tr('Tổng khối lượng thực tế từ 0,001 đến 1.000 kg.'));await change('proposeLot',[BigInt(current.id),weights.map(BigInt)]);});}}><h4>{tr('Kết quả cân thực tế tại điểm bàn giao')}</h4><WeightInputs values={actual} onChange={setActual}/><p>{tr('Nhập số cân thực tế sau khi cân tại nhà để gửi cho người bán kiểm tra và xác nhận.')}</p><button className="primary" disabled={busy||paused}>{tr('Gửi số cân')}</button></form>}
            {!seller&&!admin&&isAssignedCollector&&[2,3,4].includes(current.status)&&(()=>{
              const liveGrams=current.status===2
                ?actual.map(s=>Math.max(0,Math.round((Number(s)||0)*1000)))
                :current.actual.some(x=>x>0)?current.actual:current.estimated;
              const effectiveGrams=total(liveGrams)>0?liveGrams:current.estimated;
              const econ=calcLotEconomics(effectiveGrams);
              return (
                <DummyLotPaymentCard
                  lotId={current.id}
                  sellerWallet={current.owner}
                  collectorWallet={current.collector}
                  currentAccount={account}
                  admin={admin}
                  sellerCash={econ.sellerCash}
                  collectorFee={econ.collectorFee}
                  appTotalProfit={econ.appTotalProfit}
                  ecoFormatted={fmt(points(effectiveGrams))}
                  onPaid={setMessage}
                />
              );
            })()}
            {isOwner&&current.status===3&&<><p>{tr('Kiểm tra bảng khối lượng thực tế bên trên trước khi xác nhận hoàn tất.')}</p><label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{tr('Tôi đã bàn giao vật liệu và đồng ý khối lượng thực tế trên.')}</label><button className="primary full-width" disabled={busy||paused||!consent||Date.now()>current.updatedAt+7*86400000} onClick={()=>run(()=>change('acceptLot',[BigInt(current.id)]))}><CheckCircle2 size={16}/>{isCurrentOnChain&&payoutWei!==undefined?tr('Xác nhận & nhận {eco} ECO',{eco:eco(payoutWei)}):tr('Đồng ý số cân')}{freeGas}</button><button className="secondary" disabled={busy} onClick={()=>run(()=>change('disputeLot',[BigInt(current.id)]))}>{tr('Chưa đồng ý · yêu cầu cân lại')}{freeGas}</button></>}
            {actions.releaseLot&&<button className="text-link" disabled={busy} onClick={()=>run(()=>change('releaseLot',[BigInt(current.id)]))}>{isOwner?tr('Mở lại lô do quá hạn'):tr('Hủy nhận đơn (Nhường cho người khác)')}</button>}
            {current.status===4&&<p className="pickup-success"><CheckCircle2 size={18}/>{tr('Hai bên đã xác nhận. Điểm thưởng ECO đã được cộng vào ví người bán.')}</p>}
            {current.status===4&&isCurrentOnChain&&certAddress&&<CertificateCard certificate={certAddress} lotId={current.id} account={account} canSend={isOwner}/>}
          </div>
        </div>}
      {page==='orders'&&account&&<>
        <EnvironmentalImpactBanner lots={myLots} personal/>
        <PickupHistorySection
          allCards={allCards}
          lots={lots}
          seller={seller}
          selected={selected}
          onSelectLot={setSelected}
        />
      </>}
      {page==='admin'&&admin&&<EnvironmentalImpactBanner lots={lots}/>}
      {page==='admin'&&admin&&<AdminRevenueDashboard lots={lots}/>}
      {page==='admin'&&admin&&<AdminEconomicsPanel account={account} onDone={setMessage}/>}
      {page==='admin'&&admin&&<AdminAccountsPanel account={account} address={address} publicPickup={publicPickup} busy={busy} run={run} refresh={refresh} setHash={setHash} onDone={setMessage}/>}
      {address&&admin&&account&&page==='admin'&&<section className="pickup-callout"><h3>{tr('Quản lý thu gom')}</h3><button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{setHash(await pickupWrite(address,account,'setPaused',[!paused]));await refresh();})}>{paused?tr('Mở lại thu gom'):tr('Tạm dừng thu gom')}</button><p className="footnote">Contract V4: {address}{certAddress?<> · NFT: {certAddress}</>:null}</p></section>}
      {address&&admin&&account&&page==='admin'&&<form className="pickup-callout" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{const next=[0,1,2,3].map(i=>{const v=String(f.get('price'+i)||'').replace(',','.');if(!/^\d*\.?\d+$/.test(v)||Number(v)>1_000_000 || (v.split(".")[1]?.length ?? 0)>18)throw new Error(tr('Giá phải từ 0 đến 1.000.000 ECO cho mỗi kg (tối đa 18 chữ số thập phân).'));return parseEther(v);});setHash(await pickupWrite(address,account,'setPrices',[next]));await refresh();setMessage(tr('Đã cập nhật giá thu mua.'));});}}><h3>{tr('Giá thu mua (ECO/kg)')}</h3><p>{tr('Người thu gom khóa số ECO = giá × khối lượng ước tính + 20%. Chủ lô nhận theo số cân thực tế.')}</p><div className="pickup-weights">{materials.map((m,i)=><label key={m.name}>{tr(m.name)}<input name={'price'+i} inputMode="decimal" defaultValue={prices[i]??''} key={String(prices[i])}/></label>)}</div><button className="secondary" disabled={busy}>{tr('Cập nhật giá')}</button></form>}
      {page==='wallet'&&!walletSlot&&<div className="pickup-callout wallet-live"><span>{tr('VÍ ĐIỂM THU GOM ECOLOOP')}</span><h2>{fmt(effectiveBalance)} ECO</h2><p>{account?tr('Ví đã kết nối: {wallet} · Số dư ECO on-chain trên contract V4.',{wallet:short(account)}):tr('Kết nối ví để xem số dư ECO on-chain của bạn.')}</p>{address&&<code>{address}</code>}<p>{tr('Bạn nhận ECO khi hoàn tất bàn giao phế liệu.')}</p></div>}
      {page==='wallet'&&<DummyWalletWidget account={account} role={role} admin={admin}/>}
      {page==='wallet'&&swap&&<EcoExchange {...swap}/>}
      {page==='admin'&&address&&account&&admin&&<section className="pickup-callout">
        <h3><ShieldCheck size={18}/> {tr('Yêu cầu xác minh trạm thu gom')}</h3>
        <button type="button" className="secondary" disabled={busy} onClick={loadVerifyQueue}><RefreshCw size={15}/> {tr('Tải danh sách')}</button>
        {verifyQueue.length===0?<p>{tr('Chưa có yêu cầu nào.')}</p>:verifyQueue.map(r=><p key={r.account}>
          <code>{r.account}</code> · {dateTime(r.requestedAt)}{' '}
          <button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{
            setHash(await pickupWrite(address,account,'grantRole',[keccak256(stringToHex('COLLECTOR_ROLE')),r.account]));
            await refresh();setMessage(tr('Đã cấp quyền trạm thu gom cho {a}.',{a:short(r.account)}));
          })}>{tr('Cấp quyền trạm')}</button></p>)}
      </section>}
      {page==='admin'&&address&&account&&admin&&exchange&&<ExchangeSettings exchange={exchange} busy={busy} submit={(fn,value)=>void run(async()=>{
        if(fn==='withdrawExchangeProceeds'){
          setHash(await pickupWrite(address,account,'withdrawExchangeProceeds',[account,value]));
          await refresh();
          setMessage(tr('Đã rút doanh thu AVAX từ quầy đổi về ví Quản trị.'));
          return;
        }
        setHash(await pickupWrite(address,account,fn,[value]));
        await refresh();
        setMessage(tr('Đã cập nhật quầy đổi ECO.'));
      })}/>}
      {page==='wallet'&&address&&certAddress&&<section className="pickup-callout"><h3><Award size={18}/> {tr('Chứng nhận tái chế của tôi ({n})',{n:myCertificates.length})}</h3>{myCertificates.length?<div className="cert-grid">{myCertificates.map(l=><CertificateCard key={l.id} certificate={certAddress} lotId={l.id} compact account={account} canSend/>)}</div>:<p>{account?tr('Hoàn tất một lô thu gom để nhận chứng nhận NFT đầu tiên.'):tr('Kết nối ví để xem chứng nhận của bạn.')}</p>}</section>}
    </>}
    {page==='rewards'&&<>
      <EarnEco key={`${address}:${rewardsAddress}:${account}`} pool={rewardsAddress} token={address}
        account={account} admin={admin} busy={busy} onConnect={onConnect} run={run} onAdminMessage={setMessage} onClaim={async(tx,amount)=>{
          setHash(tx);
          setMessage(tr('Đã nhận {amount} ECO vào ví.',{amount}));
          await refresh();
        }}/>
    </>}
    {page==='rewards'&&<PickupRewards balanceAtomic={balanceAtomic} gasless={gasless} admin={admin} address={address} account={account} collector={admin} busy={busy} balance={effectiveBalance} run={run} onChange={refresh} onConnect={onConnect} onDone={setMessage}/>}
    {busy&&<p role="status" className="pickup-busy">{tr('Đang xử lý… Kiểm tra cửa sổ ví nếu được yêu cầu ký. Không đóng trang khi gửi giao dịch.')}</p>}
  </section>;
}
