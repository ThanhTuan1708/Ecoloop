import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {MapPin,Plus,RefreshCw,Navigation,ArrowRight,CheckCircle2,PackageCheck,ShieldCheck,Lock,Star,Coins,SlidersHorizontal,ChevronLeft,ChevronRight,Database,History,ClipboardList,Truck,Award,Fuel,ExternalLink} from 'lucide-react';
import {formatEther,isAddress,keccak256,parseEther,stringToHex,type Address,type Hash} from 'viem';
import {chain} from './wallet';
import {errorMessage,txUrl,publicClient} from './chain';
import {materials,short} from './model';
import {tr,num as fmt,wt,dateTime,notify,unit} from './settings';
import {viewEvidence} from './evidence';
import {pickupAbi} from './generated/pickup';
import {lotStatuses,activatePickup,deployPickup,digest,distanceKm,pendingPickup,pickupDetails,pickupRead,pickupWrite,householdWrite,requiredDeposit,payoutPreview,readCertificate,certificateUrl,addressUrl,pickupVersion,resumePickup,savePickupPhoto,ZERO,type Lot,type CertificateView} from './pickupClient';
import {queryProductCards,type ListingStatus,type SortOption,type ShopeeWeb3ProductCard} from './marketplace';
import PickupMap from './PickupMap';
import './pickup.css';

// Sample data has been removed from the app; clear what older versions stored in this browser.
try{for(const k of ['ecoloop-pickup-catalog-v2','ecoloop-pickup-rewards-v2','ecoloop-user-lots-meta','ecoloop-data-mode'])localStorage.removeItem(k);}catch{/* storage unavailable */}

interface RewardItem {id:number;name:string;cost:number;stock:number;active:boolean}
interface ReceiptItem {id:number;reward:number;owner:string;done:boolean}

const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const total=(weights:number[])=>weights.reduce((a,b)=>a+b,0)/1000;
const points=(weights:number[])=>weights.reduce((a,b,i)=>a+b*materials[i].rate/1000,0);

export default function Pickup({account,admin,onConnect,page='home',role='seller',createRequest=0,onSettings,children,walletSlot}:{children?:ReactNode;walletSlot?:ReactNode;account?:Address;demo?:boolean;admin:boolean;onConnect:()=>void;page?:'home'|'orders'|'wallet'|'rewards'|'settings';role?:'seller'|'collector';createRequest?:number;onSettings?:()=>void}){
  const [address,setAddress]=useState<Address>();const [onChainLots,setOnChainLots]=useState<Lot[]>([]);const [count,setCount]=useState(0);const [limit,setLimit]=useState(100);
  const [balance,setBalance]=useState(0);const [view,setView]=useState<'grid'|'map'>('grid');const [v2Admin,setV2Admin]=useState(false);const [loading,setLoading]=useState(true);const [category,setCategory]=useState(-1);const [query,setQuery]=useState('');const [collector,setCollector]=useState(false);const [paused,setPaused]=useState(false);
  const [selected,setSelected]=useState<number>();const [creating,setCreating]=useState(false);const [filter,setFilter]=useState('showcase');const [radius,setRadius]=useState(0);const [center,setCenter]=useState<[number,number]>();
  const [filtersOpen,setFiltersOpen]=useState(false);const [sort,setSort]=useState<SortOption>('newest');const [tokenFilter,setTokenFilter]=useState<string>('ALL');const [pageNum,setPageNum]=useState(1);const [pageSize,setPageSize]=useState(12);
  const [busy,setBusy]=useState(false);const lock=useRef(false);const version=useRef(0);const detailVersion=useRef(0);
  const [message,setMessage]=useState('');const [failure,setFailure]=useState(false);const [hash,setHash]=useState<Hash>();const [detail,setDetail]=useState<{contact:string;address:string}>();const [photo,setPhoto]=useState('');
  const [actual,setActual]=useState(['0','0','0','0']);const [consent,setConsent]=useState(false);const [deployConsent,setDeployConsent]=useState(false);
  const [gasless,setGasless]=useState(false);const [legacyPickup,setLegacyPickup]=useState<Address>();const [prices,setPrices]=useState<number[]>([]);const [certAddress,setCertAddress]=useState<Address>();const [pendingAvax,setPendingAvax]=useState(0);
  const [depositWei,setDepositWei]=useState<bigint>();const [payoutWei,setPayoutWei]=useState<bigint>();
  const [importAddress,setImportAddress]=useState(localStorage.getItem(`ecoloop-pickup-deployed-${chain.id}`)||'');

  // Only real on-chain data: lots, balances and rewards all come from the V3 contract.
  const lots=onChainLots;
  const current=lots.find(l=>l.id===selected);
  const isCurrentOnChain=!!address&&!!current;
  const user=account;
  const myCertificates=account?onChainLots.filter(l=>l.status===4&&same(l.owner,account)):[];
  const avax=(wei:bigint)=>fmt(Number(formatEther(wei)),6);
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
  const isOwner=same(user,current?.owner);

  const effectiveBalance=balance;
  // Value of a lot in AVAX at the contract's current buying prices (what a collector pays for it).
  const avaxValue=(grams:number[])=>prices.length?grams.reduce((sum,g,i)=>sum+g/1000*(prices[i]||0),0):undefined;

  const statusFilterMap:Record<string,ListingStatus[]|undefined>={
    open:['ACTIVE'],
    escrow:['IN_ESCROW'],
    sold:['SOLD'],
    cancelled:['CANCELLED'],
    showcase:['ACTIVE','IN_ESCROW'],
    all:['ACTIVE','IN_ESCROW','SOLD','CANCELLED'],
    mine:['ACTIVE','IN_ESCROW','SOLD','CANCELLED'],
    assigned:['IN_ESCROW','SOLD'],
  };

  const marketplaceResult=queryProductCards(
    lots,
    {
      sort,
      status:statusFilterMap[filter]??['ACTIVE','IN_ESCROW'],
      tokens:tokenFilter==='ALL'?undefined:[tokenFilter],
      materialIndex:category>=0?category:undefined,
      lat:center?.[0],
      lng:center?.[1],
      radiusKm:radius>0?radius:undefined,
      q:query,
      owner:filter==='mine'?(account||ZERO):undefined,
      collector:filter==='assigned'?(account||ZERO):undefined,
      page:pageNum,
      limit:pageSize,
    },
    {chainId:chain.id,contractAddress:address,role}
  );

  const activeFilters=(filter!=='showcase'&&filter!=='mine'&&filter!=='assigned'?1:0)+(tokenFilter!=='ALL'?1:0)+(radius>0?1:0);
  const cards=marketplaceResult.items;
  const facets=marketplaceResult.meta.facets.statusCounts;
  const pagination=marketplaceResult.meta.pagination;
  const visible=cards.map(c=>lots.find(l=>l.id===c.lotId)!).filter(Boolean);
  const selectedCard:ShopeeWeb3ProductCard|undefined=current?queryProductCards([current],{status:['ACTIVE','IN_ESCROW','SOLD','CANCELLED']},{chainId:chain.id,contractAddress:address,role,}).items[0]:undefined;
  const allCards=queryProductCards(
    lots,
    {
      sort:'newest',
      status:['ACTIVE','IN_ESCROW','SOLD','CANCELLED'],
      page:1,
      limit:500,
    },
    {chainId:chain.id,contractAddress:address,role}
  ).items;

  async function refresh(){
    const v=version.current;

    try{
      const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)return;
      const config=await response.json();
      if(v!==version.current)return;
      const configured=config.pickupContract as Address|undefined;
      setGasless(!!config.gasless);
      if(!configured||config.chainId!==chain.id){setAddress(undefined);setLegacyPickup(undefined);setOnChainLots([]);setCount(0);return;}
      // An older pickup contract (V2, no real escrow) is reported to admins instead of being shown as live data.
      if(await pickupVersion(configured)!=='v3'){if(v!==version.current)return;setAddress(undefined);setLegacyPickup(configured);setOnChainLots([]);setCount(0);return;}
      setLegacyPickup(undefined);setAddress(configured);
      const data=await pickupRead(configured,account,limit);
      if(v!==version.current)return;
      setOnChainLots(data.lots);setCount(data.count);setBalance(data.balance);setCollector(data.collector);setPaused(data.paused);setV2Admin(data.admin);
      setPrices(data.prices);setCertAddress(data.certificate);setPendingAvax(data.pending);
    }catch{
      if(v!==version.current)return;
      setOnChainLots([]);setCount(0);
    }
  }
  async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');setFailure(false);try{await fn();}catch(e){setFailure(true);setMessage(errorMessage(e));}finally{lock.current=false;setBusy(false);}}
  useEffect(()=>{
    version.current++;
    setSelected(undefined);
    setDetail(undefined);
    setPhoto('');
    setHash(undefined);
    setMessage('');
    setCreating(false);
    setLoading(true);
    refresh().finally(()=>setLoading(false));
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
  useEffect(()=>{setSelected(undefined);setCreating(false);setPageNum(1);setFilter(page==='orders'?(role==='collector'?'assigned':'mine'):'showcase');},[page,role]);
  useEffect(()=>{setPageNum(1);setPageSize(12);},[filter,category,query,radius,sort,tokenFilter]);
  useEffect(()=>{if(!createRequest)return;setCreating(true);setSelected(undefined);},[createRequest]);
  useEffect(()=>{detailVersion.current++;setDetail(undefined);setPhoto('');setConsent(false);setActual((current?.estimated||[0,0,0,0]).map(n=>String(n/1000)));},[selected,user,current?.status]);
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo);},[photo]);
  // Exact escrow figures for the selected on-chain lot (deposit to lock, payout preview).
  useEffect(()=>{setDepositWei(undefined);setPayoutWei(undefined);if(!address||!current||!onChainLots.some(l=>l.id===current.id))return;let live=true;
    if(current.status===1)requiredDeposit(address,current.id).then(v=>{if(live)setDepositWei(v);}).catch(()=>{});
    if(current.status===3)payoutPreview(address,current).then(v=>{if(live)setPayoutWei(v);}).catch(()=>{});
    return()=>{live=false;};},[address,current?.id,current?.status,onChainLots]);
  // Esc closes the lot detail (a bottom sheet on phones)
  useEffect(()=>{if(selected===undefined)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelected(undefined);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[selected]);

  async function change(fn:string,args:unknown[]){
    if(!current)return;
    if(!account){onConnect();return;}
    if(!address)throw new Error(tr('Chưa kích hoạt thu gom.'));
    const id=current.id;
    if(fn==='claimLot'){
      const deposit=await requiredDeposit(address,id);
      setHash(await pickupWrite(address,account,fn,args,deposit));
      await refresh();setFilter('assigned');
      setMessage(tr('🔒 Đã nhận việc và khóa {avax} AVAX ký quỹ trong contract.',{avax:fmt(Number(formatEther(deposit)),6)}));
      return;
    }
    const household=same(account,current.owner);
    setHash(household?await householdWrite(address,account,fn,args,gasless):await pickupWrite(address,account,fn,args));
    await refresh();
    setMessage(fn==='acceptLot'?tr('🎉 Đã xác nhận bàn giao: tiền ký quỹ đã chuyển cho bạn và chứng nhận tái chế NFT đã được tạo.')
      :household&&gasless?tr('✅ Đã gửi giao dịch on-chain, miễn phí gas.'):tr('🎉 Đã ký và gửi giao dịch thu gom on-chain thành công lên mạng Fuji.'));
  }
  function locate(){run(async()=>{if(!navigator.geolocation)throw new Error(tr('Trình duyệt chưa hỗ trợ vị trí. Chọn khu vực trên bản đồ khi đăng lô.'));const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:15000}));setCenter([p.coords.latitude,p.coords.longitude]);setSort('distance_asc');setMessage(tr('Đã lấy vị trí để lọc khoảng cách. Không lưu vị trí vào hồ sơ hay blockchain; OpenStreetMap cung cấp nền bản đồ.'));});}
  async function create(weights:number[],file:File,evidence:Hash,point:[number,number],contact:string,location:string){
    if(!account){onConnect();return;}
    if(!address)throw new Error(tr('Chưa kích hoạt thu gom.'));
    const lat=Math.round(point[0]*100),lng=Math.round(point[1]*100);
    if(pendingPickup())throw new Error(tr('Kiểm tra giao dịch đang chờ trước khi đăng lô mới.'));
    await publicClient.simulateContract({address,abi:pickupAbi,functionName:'createLot',args:[weights.map(BigInt) as [bigint,bigint,bigint,bigint],evidence,lat,lng],account});
    // Photo and contact stay on the EcoLoop server (owner + assigned collector only); only the hash goes on-chain.
    await savePickupPhoto(account,address,file,evidence,contact,location);
    setHash(await householdWrite(address,account,'createLot',[weights.map(BigInt),evidence,lat,lng],gasless));
    setCreating(false);setPageNum(1);setCategory(-1);setQuery('');setRadius(0);setSort('newest');setFilter('mine');
    await refresh();
    setMessage(gasless?tr('🎉 Đã đăng lô lên Avalanche, miễn phí gas.'):tr('🎉 Đã ký và gửi giao dịch tạo lô on-chain thành công lên mạng Fuji.'));
  }
  return <section className={`pickup-workspace pickup-page-${page}`}><div className="pickup-page-title"><span className="eyebrow">{tr('ECOLOOP · SÀN C2C WEB3 AVALANCHE FUJI')}</span><h2>{({home:tr("Sàn phế liệu Web3 gần bạn"),orders:tr("Đơn thu gom & Ký quỹ của bạn"),wallet:tr("Ví xanh của bạn"),rewards:tr("Đổi điểm, nhận điều xanh"),settings:tr("Thiết lập hệ thống")})[page]}</h2><p>{page==='settings'?tr('Ngôn ngữ, giao diện, đơn vị, thông báo và cấu hình hệ thống.'):tr('Lô, ký quỹ và chứng nhận ghi trên Avalanche. Ảnh và liên hệ lưu riêng, chỉ chủ lô và người nhận việc xem được.')}</p></div>
    {page==='settings'&&children}
    {page==='settings'&&(admin||v2Admin||!address)&&<h3 className="set-section-title">{tr('Quản trị hệ thống')}</h3>}
    {(page==='home'||page==='orders')&&<div className="pickup-intro"><div><span className="eyebrow">{tr('TỪ NHÀ BẠN ĐẾN MỘT VÒNG ĐỜI MỚI')}</span><h2>{tr('Thu gom tận nơi')}</h2><p>{tr('Gom nhiều vật liệu trong một lô. Khóa ký quỹ (Escrow), cân thực tế, hai bên xác nhận rồi giải ngân ECO.')}</p></div><button className="primary" disabled={busy||paused} onClick={()=>setCreating(!creating)}><Plus size={18}/>{creating?tr('Đóng biểu mẫu'):tr('Đăng lô thu gom')}</button></div>}
    {(page==='home'||page==='orders')&&<div className="pickup-steps"><span><b>1</b> {tr('Đăng listing (Active)')}</span><span><b>2</b> {tr('Khóa ký quỹ (In Escrow)')}</span><span><b>3</b> {tr('Cân & đề xuất on-chain')}</span><span><b>4</b> {tr('Giải ngân (Sold)')}</span></div>}
    {loading&&!lots.length&&<p role="status">{tr('Đang tải dữ liệu từ mạng…')}</p>}
    {!address&&page==='settings'&&<div className="pickup-callout"><strong>{legacyPickup?tr('Nâng cấp contract thu gom lên V3'):tr('Chờ kích hoạt contract thu gom V3')}</strong><p>{tr('V3 có ký quỹ AVAX thật, chứng nhận tái chế NFT và miễn phí gas cho hộ gia đình. Quản trị viên triển khai một lần (2 giao dịch: forwarder rồi contract thu gom) rồi kích hoạt dùng chung.')}</p>{legacyPickup&&<p className="footnote">{tr('Contract cũ: {address}. Lô và ECO trên contract cũ không tự chuyển sang V3.',{address:legacyPickup})}</p>}{!account&&<button className="primary" onClick={onConnect}>{tr('Kết nối ví quản trị')}</button>}{account&&!admin&&<p>{tr('Ví này chưa có quyền quản trị trên hệ thống hiện tại. Hãy dùng ví đã triển khai EcoLoop.')}</p>}{admin&&account&&<><label className="checkbox"><input type="checkbox" checked={deployConsent} onChange={e=>setDeployConsent(e.target.checked)}/>{tr('Tạo bộ contract V3 mới bằng AVAX testnet. ECO V3 được quản lý riêng với ECO cũ.')}</label><button className="primary" disabled={busy||!deployConsent||!!pendingPickup()} onClick={()=>run(async()=>{const a=await deployPickup(account);setImportAddress(a);setMessage(tr('Đã triển khai. Nhấn kích hoạt dùng chung bên dưới để hoàn tất.'));})}>{tr('Triển khai bằng ví quản trị')}</button><label>{tr('Địa chỉ V3 đã triển khai')}<input value={importAddress} onChange={e=>setImportAddress(e.target.value)} placeholder="0x…"/></label><button className="secondary" disabled={busy||!isAddress(importAddress)} onClick={()=>run(async()=>{await activatePickup(account,importAddress as Address);await refresh();setMessage(tr('Đã kích hoạt contract chung cho Chrome và Edge.'));})}>{tr('Kích hoạt dùng chung')}</button></>}</div>}
    {pendingPickup()&&<div className="pickup-callout"><strong>{tr('Giao dịch đang chờ xác nhận')}</strong><code>{pendingPickup()}</code><button className="secondary" disabled={busy} onClick={()=>run(async()=>{const r=await resumePickup();if(r?.contractAddress){setImportAddress(r.contractAddress);localStorage.setItem(`ecoloop-pickup-deployed-${chain.id}`,r.contractAddress);}await refresh();setMessage(tr('Đã kiểm tra giao dịch.'));})}>{tr('Kiểm tra giao dịch')}</button></div>}
    {message&&<div className={failure?'pickup-feedback error':'pickup-feedback'} role={failure?'alert':'status'}>{tr(message)}</div>}
    {hash&&<a className="text-link" href={txUrl(hash)} target="_blank" rel="noreferrer">{tr('Xem giao dịch trên Fuji ↗')}</a>}
    {paused&&<p role="alert">{tr('Thu gom đang tạm dừng. Vẫn có thể hủy, yêu cầu cân lại hoặc trả việc.')}</p>}
    {address&&page!=='settings'&&<div className="data-mode-bar"><span className="live-chip"><ShieldCheck size={15}/>{tr('Dữ liệu thật trên Avalanche')}</span>{gasless&&<span className="gasless-chip"><Fuel size={14}/>{tr('Miễn phí gas cho hộ gia đình')}</span>}</div>}
    {!address&&page!=='settings'&&!loading&&<div className="pickup-callout"><strong>{legacyPickup?tr('Contract thu gom cần nâng cấp lên V3'):tr('Chưa có contract thu gom V3')}</strong><p>{legacyPickup?tr('Contract đang dùng là bản cũ, chưa có ký quỹ AVAX thật. Quản trị viên vào Thiết lập để triển khai và kích hoạt V3.'):tr('Quản trị viên vào Thiết lập để triển khai và kích hoạt contract. Sau đó các lô thật sẽ hiện ở đây.')}</p>{onSettings&&<button type="button" className="secondary" onClick={onSettings}>{tr('Mở Thiết lập')}</button>}</div>}
    {page==='wallet'&&walletSlot}
    {address&&<>
      {page!=='settings'&&<div className="pickup-summary">
        <span><strong>{lots.length}</strong> {tr('tổng sản phẩm')}</span>
        <span><strong>{facets.ACTIVE}</strong> {tr('đang mở bán')}</span>
        <span><strong>{facets.IN_ESCROW}</strong> {tr('đang khóa ký quỹ')}</span>
        <span><strong>{facets.SOLD}</strong> {tr('đã bán hoàn tất')}</span>
        <span><strong>{fmt(effectiveBalance)}</strong> {tr('ECO khả dụng')}</span>
        {address&&<a className="text-link" href={addressUrl(address)} target="_blank" rel="noreferrer"><Database size={14}/>{tr('Contract trên Snowtrace')}<ExternalLink size={12}/></a>}
      </div>}
      {creating&&(page==='home'||page==='orders')&&<LotForm busy={busy} center={center} onCreate={(...args)=>run(()=>create(...args))}/>}
      {!creating&&(page==='home'||page==='orders')&&<>
        <div className={filtersOpen?'pickup-toolbar filters-open':'pickup-toolbar'}>
          <label className="pickup-search">{tr('Tìm sản phẩm / cửa hàng / khu vực')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("VD: đồng, nhôm, PET, carton, Quận 7, Thủ Đức, Hà Nội…")}/></label>
          <button type="button" className="pickup-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(o=>!o)}><SlidersHorizontal size={16}/>{tr('Bộ lọc')}{activeFilters>0&&<b>{activeFilters}</b>}</button>
          <label>{tr('Trạng thái Web3')}<select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="showcase">{tr('Kệ hàng (Đang bán & Ký quỹ · {n})',{n:facets.ACTIVE+facets.IN_ESCROW})}</option>
            <option value="open">{tr('🟢 Đang mở bán (Active · {n})',{n:facets.ACTIVE})}</option>
            <option value="escrow">{tr('🔒 Đang khóa ký quỹ (In Escrow · {n})',{n:facets.IN_ESCROW})}</option>
            <option value="sold">{tr('⚪ Đã bán (Sold · {n})',{n:facets.SOLD})}</option>
            <option value="cancelled">{tr('🔴 Đã hủy listing ({n})',{n:facets.CANCELLED})}</option>
            <option value="all">{tr('Tất cả trạng thái ({n})',{n:lots.length})}</option>
            <option value="mine">{tr('👤 Lô của tôi ({n})',{n:lots.filter(l=>same(l.owner,account)).length})}</option>
            <option value="assigned">{tr('🚚 Việc tôi đã nhận ({n})',{n:lots.filter(l=>same(l.collector,account)).length})}</option>
          </select></label>
          <label>{tr('Token thanh toán')}<select value={tokenFilter} onChange={e=>setTokenFilter(e.target.value)}>
            <option value="ALL">{tr('Mọi Token (ECO · USDT · AVAX)')}</option>
            <option value="ECO">ECO Token (Fuji #43113)</option>
            <option value="USDT">USDT Equivalent</option>
            <option value="AVAX">AVAX Testnet</option>
          </select></label>
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
                onClick={()=>setSort(id)}
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
        {view==='map'&&<PickupMap lots={visible} center={center} onSelect={setSelected}/>}
        <div className={`pickup-columns ${current?'has-selection':''}`}>
          {current&&<div className="lot-sheet-backdrop" aria-hidden="true" onClick={()=>setSelected(undefined)}/>}
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
                  {st==='IN_ESCROW'&&<span className="shopee-stamp stamp-escrow">{tr('ĐANG KÝ QUỸ')}</span>}
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
                  {avaxValue(lots.find(l=>l.id===card.lotId)?.estimated||[])!==undefined&&<small className="fiat-equiv">≈ {fmt(avaxValue(lots.find(l=>l.id===card.lotId)!.estimated)!,4)} AVAX</small>}
                </span>
                <span className="shopee-rating-row">
                  {card.seller.reputationScore>0&&<span className="star-badge"><Star size={11} fill="currentColor"/> {card.seller.reputationScore.toFixed(1)}</span>}
                  <span className="sales-count">{tr('Đã bán {n}',{n:card.seller.completedSalesCount})}</span>
                  {card.badges.isEscrowProtected&&<span className="escrow-tag">Escrow</span>}
                </span>
                <span className="shopee-location-row">
                  <span><MapPin size={12}/> {card.seller.location.distanceKm!==undefined
                    ?tr('Cách ~{d} · {district}',{d:unit()==='lb'?`${fmt(card.seller.location.distanceKm*0.621371)} mi`:`${fmt(card.seller.location.distanceKm)} km`,district:card.seller.location.district})
                    :`${card.seller.location.district}, ${card.seller.location.province}`}</span>
                </span>
                <small className="shopee-shop-row">{card.seller.displayName} · {short(card.onChain.sellerWallet)}</small>
                <span className={`lot-card-action action-${st.toLowerCase()}`}>
                  {tr(card.uiState.ctaTextVi)} ↗
                </span>
              </button>;
            })}
            {!cards.length&&!lots.length&&<div className="pickup-empty"><PackageCheck size={30}/><h3>{tr('Chưa có lô on-chain nào')}</h3><p>{tr('Hãy đăng lô phế liệu đầu tiên. Lô sẽ được ghi lên Avalanche và người thu gom phải khóa AVAX ký quỹ khi nhận việc.')}</p></div>}
            {!cards.length&&lots.length>0&&<div className="pickup-empty"><PackageCheck size={30}/><h3>{tr('Chưa có lô phù hợp với bộ lọc hiện tại')}</h3><p>{tr('Thử bỏ bớt bộ lọc hoặc xem toàn bộ kệ hàng.')}</p><div className="shopee-pagination-controls"><button type="button" className="primary" onClick={()=>{setFilter('showcase');setCategory(-1);setQuery('');}}>{tr('Xem toàn bộ kệ hàng ({n} lô)',{n:facets.ACTIVE+facets.IN_ESCROW})}</button></div></div>}
            <div className="shopee-pagination-footer">
              <p className="footnote">{tr('Hiển thị {shown} / {total} sản phẩm phù hợp · Trang {page}/{pages} (Tổng kho: {all} lô).',{shown:cards.length,total:pagination.totalItems,page:pagination.currentPage,pages:pagination.totalPages,all:lots.length})}</p>
              <div className="shopee-pagination-controls">
                {pagination.currentPage>1&&<button type="button" className="secondary" onClick={()=>setPageNum(p=>Math.max(1,p-1))}>{tr('← Trang trước')}</button>}
                {pagination.hasNextPage&&<button type="button" className="secondary" onClick={()=>setPageSize(s=>s+12)}>{tr('Xem thêm +12 sản phẩm')}</button>}
                {pagination.hasNextPage&&<button type="button" className="primary" onClick={()=>setPageNum(p=>p+1)}>{tr('Trang tiếp theo →')}</button>}
              </div>
            </div>
          </div>
          <div className="lot-detail" role={current?'dialog':undefined} aria-label={current?selectedCard?.title:undefined}>{current&&selectedCard?<><span className="lot-sheet-handle" aria-hidden="true"/><button className="text-link" onClick={()=>setSelected(undefined)}>{tr('Đóng chi tiết ×')}</button>
            <span className="eyebrow">{tr('BIÊN NHẬN WEB3 #{id}',{id:current.id})} · {selectedCard.uiState.status}</span>
            <h3>{selectedCard.title}</h3>
            <img className="pickup-evidence" src={photo||selectedCard.thumbnail.previewUrl} alt={selectedCard.title}/>
            <p>{selectedCard.shortDescription}</p>
            <div className="web3-metadata-box">
              <div><span>{tr('Trạng thái Ký quỹ:')}</span> <strong>{tr(selectedCard.uiState.statusLabelVi)} — {tr(selectedCard.uiState.subStatusLabelVi)}</strong></div>
              <div><span>{tr('Cửa hàng / Chủ lô:')}</span> <strong>{selectedCard.seller.displayName}</strong> (<code>{short(current.owner)}</code>) · {tr('({n} lô hoàn tất)',{n:selectedCard.seller.completedSalesCount})}</div>
              <div><span>{tr('Ví thu gom (Escrow):')}</span> <code>{current.collector===ZERO?tr('Chưa khóa ký quỹ'):short(current.collector)}</code></div>
              <div><span>{tr('Khu vực bàn giao:')}</span> {selectedCard.seller.location.district}, {selectedCard.seller.location.province}</div>
              <div><span>Contract V3 (Chain {chain.id}):</span> <code>{address?short(address):'—'}</code></div>
              <div><span>{tr('SHA-256 ảnh lô:')}</span> <code>{short(current.evidence)}</code></div>
              {selectedCard.onChain.escrowLockExpiresAt&&<div><span>{tr('Hạn bảo vệ ký quỹ:')}</span> {dateTime(selectedCard.onChain.escrowLockExpiresAt)}</div>}
            </div>
            <table><thead><tr><th>{tr('Vật liệu')}</th><th>{tr('Dự kiến')}</th><th>{tr('Thực tế')}</th></tr></thead><tbody>{materials.map((m,i)=><tr key={m.name}><td>{m.symbol} {tr(m.name)}</td><td>{wt(current.estimated[i]/1000)}</td><td>{[3,4].includes(current.status)?wt(current.actual[i]/1000):'—'}</td></tr>)}</tbody></table>
            <p className="lot-points">
              <strong>+{selectedCard.pricing.amountFormatted} ECO</strong>
              {avaxValue(current.estimated)!==undefined&&<span> · {tr('giá trị ước tính ≈ {avax} AVAX',{avax:fmt(avaxValue([3,4].includes(current.status)&&current.actual.some(w=>w>0)?current.actual:current.estimated)!,6)})}</span>}
            </p>
            {isCurrentOnChain&&<div className="escrow-box">
              <strong><Lock size={15}/>{tr('Ký quỹ AVAX trên contract')}</strong>
              {current.status===1&&<p>{depositWei!==undefined?tr('Người nhận việc phải khóa {avax} AVAX (giá ước tính + 20%). Tiền nằm trong contract cho tới khi hai bên xác nhận số cân.',{avax:avax(depositWei)}):tr('Đang tính số AVAX cần khóa…')}</p>}
              {[2,3].includes(current.status)&&<p>{tr('Đang khóa {avax} AVAX trong contract.',{avax:fmt(current.deposit||0,6)})}</p>}
              {current.status===3&&payoutWei!==undefined&&<p className="escrow-payout">{tr('Chủ lô sẽ nhận {avax} AVAX theo số cân thực tế; phần dư hoàn lại người thu gom.',{avax:avax(payoutWei)})}</p>}
              {current.status===4&&<p className="escrow-payout">{tr('Đã trả {avax} AVAX cho chủ lô từ ký quỹ.',{avax:fmt(current.paid||0,6)})}</p>}
              {current.status===5&&<p>{tr('Lô đã hủy, không có tiền ký quỹ.')}</p>}
            </div>}
            <button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(!account||!address){onConnect();return;}const v=detailVersion.current;const d=await pickupDetails(account,address,current);const p=await viewEvidence(account,current.evidence,address,current.id);if(v!==detailVersion.current){URL.revokeObjectURL(p);return;}setDetail(d);setPhoto(p);})}>{tr('Xem liên hệ & địa chỉ bàn giao')}</button>
            {detail&&<div className="pickup-callout"><strong>{detail.contact}</strong><p>{detail.address}</p></div>}
            {current.status===1&&<button className="primary full-width" disabled={busy||paused} onClick={()=>run(()=>change('claimLot',[BigInt(current.id)]))}>{isCurrentOnChain&&depositWei!==undefined?tr('Nhận việc & khóa {avax} AVAX ký quỹ',{avax:avax(depositWei)}):tr('Ký hợp đồng nhận thu gom & Khóa ký quỹ (Escrow)')} <ArrowRight size={16}/></button>}
            {current.status===1&&isOwner&&<button className="secondary" disabled={busy} onClick={()=>run(()=>change('cancelLot',[BigInt(current.id)]))}>{tr('Hủy listing')}{freeGas}</button>}
            {current.status===2&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const weights=actual.map(s=>Math.round(Number(s)*1000));if(weights.some(n=>!Number.isSafeInteger(n)||n<0)||total(weights)<=0||total(weights)>1000)throw new Error(tr('Tổng khối lượng thực tế từ 0,001 đến 1.000 kg.'));await change('proposeLot',[BigInt(current.id),weights.map(BigInt)]);});}}><h4>{tr('Kết quả cân thực tế tại điểm bàn giao')}</h4><WeightInputs values={actual} onChange={setActual}/><p>{tr('Nhập số cân thực tế trên bàn cân điện tử để ký số và gửi đề xuất on-chain cho chủ lô xác nhận.')}</p><button className="primary" disabled={busy||paused}>{tr('Ký số & Gửi kết quả cân (Đề xuất Escrow)')}</button></form>}
            {current.status===3&&<><p>{tr('Kiểm tra bảng khối lượng thực tế trước khi xác nhận giải ngân. Đề xuất có hiệu lực 7 ngày.')}</p><label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{tr('Tôi đã bàn giao vật liệu và đồng ý khối lượng thực tế trên.')}</label><button className="primary full-width" disabled={busy||paused||!consent||Date.now()>current.updatedAt+7*86400000} onClick={()=>run(()=>change('acceptLot',[BigInt(current.id)]))}><CheckCircle2 size={16}/>{isCurrentOnChain&&payoutWei!==undefined?tr('Xác nhận & nhận {avax} AVAX',{avax:avax(payoutWei)}):tr('Ký xác nhận bàn giao & Giải ngân ECO')}{freeGas}</button><button className="secondary" disabled={busy} onClick={()=>run(()=>change('disputeLot',[BigInt(current.id)]))}>{tr('Chưa đồng ý · yêu cầu cân lại')}{freeGas}</button></>}
            {[2,3].includes(current.status)&&<button className="text-link" disabled={busy} onClick={()=>run(()=>change('releaseLot',[BigInt(current.id)]))}>{tr('Trả lại việc thu gom (Mở lại listing Active)')}</button>}
            {current.status===4&&<p className="pickup-success"><CheckCircle2 size={18}/>{tr('Hai phía đã xác nhận. ECO đã được giải ngân cho chủ lô.')}</p>}
            {current.status===4&&isCurrentOnChain&&certAddress&&<CertificateCard certificate={certAddress} lotId={current.id}/>}
          </>:<div className="pickup-empty"><MapPin size={30}/><h3>{tr('Chọn một thẻ sản phẩm để xem')}</h3><p>{tr('Xem ảnh chụp thực tế tại bãi cân, dữ liệu on-chain/off-chain, nhận thu gom và thử luồng khóa ký quỹ tại đây.')}</p></div>}</div>
        </div>
      </>}
      {(page==='home'||page==='orders'||page==='wallet')&&<PickupHistorySection
        allCards={allCards}
        lots={lots}
        account={account}
        role={role}
        selected={selected}
        onSelectLot={id=>{
          setCreating(false);
          setSelected(id);
          setTimeout(()=>{
            document.querySelector('.lot-detail')?.scrollIntoView({behavior:'smooth',block:'nearest'});
          },80);
        }}
      />}
      {address&&(admin||v2Admin)&&account&&page==='settings'&&<form className="pickup-callout" onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const value=String(fields.get('collector'));const action=fields.get('action')==='revoke'?'revokeRole':'grantRole';run(async()=>{if(!isAddress(value))throw new Error(tr('Địa chỉ ví thu gom không hợp lệ.'));setHash(await pickupWrite(address,account,action,[keccak256(stringToHex('COLLECTOR_ROLE')),value]));setMessage(tr('Đã cập nhật quyền thu gom.'));await refresh();});}}><h3>{tr('Quyền thu gom V3')}</h3><p>{tr('Quyền trên contract cũ không tự chuyển sang V3. Chỉ cấp cho điểm thu gom đã được xác minh.')}</p><label>{tr('Ví người thu gom')}<input name="collector" required placeholder="0x…"/></label><label>{tr('Thao tác')}<select name="action"><option value="grant">{tr('Cấp quyền nhận việc')}</option><option value="revoke">{tr('Thu hồi quyền')}</option></select></label><button className="secondary" disabled={busy}>{tr('Cập nhật quyền')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{setHash(await pickupWrite(address,account,'setPaused',[!paused]));await refresh();})}>{paused?tr('Mở lại thu gom'):tr('Tạm dừng thu gom')}</button><p className="footnote">Contract V3: {address}{certAddress?<> · NFT: {certAddress}</>:null}</p></form>}
      {address&&(admin||v2Admin)&&account&&page==='settings'&&<form className="pickup-callout" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{const next=[0,1,2,3].map(i=>{const v=String(f.get('price'+i)||'').replace(',','.');if(!/^\d*\.?\d+$/.test(v)||Number(v)>1)throw new Error(tr('Giá phải là số AVAX từ 0 đến 1 cho mỗi kg.'));return parseEther(v);});setHash(await pickupWrite(address,account,'setPrices',[next]));await refresh();setMessage(tr('Đã cập nhật giá thu mua.'));});}}><h3>{tr('Giá thu mua (AVAX/kg)')}</h3><p>{tr('Người thu gom khóa số AVAX = giá × khối lượng ước tính + 20%. Chủ lô nhận theo số cân thực tế.')}</p><div className="pickup-weights">{materials.map((m,i)=><label key={m.name}>{tr(m.name)}<input name={'price'+i} inputMode="decimal" defaultValue={prices[i]??''} key={String(prices[i])}/></label>)}</div><button className="secondary" disabled={busy}>{tr('Cập nhật giá')}</button></form>}
      {page==='wallet'&&!walletSlot&&<div className="pickup-callout wallet-live"><span>{tr('VÍ ĐIỂM THU GOM ECOLOOP')}</span><h2>{fmt(effectiveBalance)} ECO</h2><p>{account?tr('Ví đã kết nối: {wallet} · Số dư ECO on-chain trên contract V3.',{wallet:short(account)}):tr('Kết nối ví để xem số dư ECO on-chain của bạn.')}</p>{address&&<code>{address}</code>}<p>{tr('ECO là token thưởng khi hoàn tất bàn giao phế liệu qua hợp đồng ký quỹ (Escrow); dùng để đổi các phần thưởng xanh bên dưới.')}</p></div>}
      {page==='wallet'&&address&&account&&pendingAvax>0&&<div className="pickup-callout"><strong>{tr('Có {avax} AVAX chờ rút',{avax:fmt(pendingAvax,6)})}</strong><p>{tr('Contract chưa chuyển thẳng được khoản này vào ví của bạn. Bấm rút để nhận.')}</p><button className="primary" disabled={busy} onClick={()=>run(async()=>{setHash(await pickupWrite(address,account,'withdrawPending'));await refresh();setMessage(tr('Đã rút AVAX về ví.'));})}>{tr('Rút về ví')}</button></div>}
      {page==='wallet'&&address&&certAddress&&<section className="pickup-callout"><h3><Award size={18}/> {tr('Chứng nhận tái chế của tôi ({n})',{n:myCertificates.length})}</h3>{myCertificates.length?<div className="cert-grid">{myCertificates.map(l=><CertificateCard key={l.id} certificate={certAddress} lotId={l.id} compact/>)}</div>:<p>{account?tr('Hoàn tất một lô thu gom để nhận chứng nhận NFT đầu tiên.'):tr('Kết nối ví để xem chứng nhận của bạn.')}</p>}</section>}
      {(page==='rewards'||page==='wallet')&&<PickupRewards gasless={gasless} admin={admin||v2Admin} address={address} account={account} collector={collector||role==='collector'} busy={busy} balance={effectiveBalance} run={run} onChange={refresh} onDone={text=>setMessage(text)}/>}
    </>}
    {busy&&<p role="status" className="pickup-busy">{tr('Đang xử lý… Kiểm tra cửa sổ ví nếu được yêu cầu ký. Không đóng trang khi gửi giao dịch.')}</p>}
  </section>;
}

function PickupHistorySection({
  allCards,
  lots,
  account,
  role,
  selected,
  onSelectLot,
}:{
  allCards:ShopeeWeb3ProductCard[];
  lots:Lot[];
  account?:Address;
  role?:'seller'|'collector';
  selected?:number;
  onSelectLot:(id:number)=>void;
}){
  const [tab,setTab]=useState<'posted'|'collected'|'recent'>(role==='collector'?'collected':'posted');

  useEffect(()=>{
    setTab(role==='collector'?'collected':'posted');
  },[role]);

  const lotMap=new Map(lots.map(l=>[l.id,l]));
  const byNewest=(a:ShopeeWeb3ProductCard,b:ShopeeWeb3ProductCard)=>(lotMap.get(b.lotId)?.updatedAt||0)-(lotMap.get(a.lotId)?.updatedAt||0);
  // 1. Lots I posted  2. Lots I collected  3. Everyone's activity in the last 24 hours
  const postedCards=account?allCards.filter(card=>same(card.onChain.sellerWallet,account)).sort(byNewest):[];
  const collectedCards=account?allCards.filter(card=>same(lotMap.get(card.lotId)?.collector,account)).sort(byNewest):[];
  const recentCards=allCards.filter(card=>{const lot=lotMap.get(card.lotId);return !!lot&&Date.now()-lot.updatedAt<24*3600_000;}).sort(byNewest);

  const activeList=tab==='posted'?postedCards:tab==='collected'?collectedCards:recentCards;

  const totalKg=activeList.reduce((sum,c)=>sum+c.totalKilograms,0);
  const totalEco=activeList.reduce((sum,c)=>sum+c.pricing.ecoAmount,0);
  const completedCount=activeList.filter(c=>c.uiState.status==='SOLD').length;
  const inProgressCount=activeList.filter(c=>c.uiState.status==='IN_ESCROW'||c.uiState.status==='ACTIVE').length;

  return (
    <section className="pickup-history-panel" aria-label={tr("Lịch sử đã đăng lô và thu gom lô")}>
      <div className="pickup-history-header">
        <div>
          <span className="eyebrow"><History size={14}/> {tr('SỔ CÁI THEO DÕI ĐƠN HÀNG & KÝ QUỸ')}</span>
          <h3>{tr('Lịch sử đã đăng lô & Lịch sử thu gom lô')}</h3>
          <p>{tr('Theo dõi toàn bộ lô phế liệu đã đăng bán, các chuyến thu gom đã nhận việc, kết quả cân thực tế và điểm thưởng ECO giải ngân.')}</p>
        </div>
        <div className="history-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab==='posted'}
            className={`history-tab-btn ${tab==='posted'?'active':''}`}
            onClick={()=>setTab('posted')}
          >
            <ClipboardList size={16}/>
            <span>{tr('Đã đăng lô')}</span>
            <b className="history-tab-badge">{postedCards.length}</b>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab==='collected'}
            className={`history-tab-btn ${tab==='collected'?'active':''}`}
            onClick={()=>setTab('collected')}
          >
            <Truck size={16}/>
            <span>{tr('Đã thu gom lô')}</span>
            <b className="history-tab-badge">{collectedCards.length}</b>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab==='recent'}
            className={`history-tab-btn ${tab==='recent'?'active':''}`}
            onClick={()=>setTab('recent')}
          >
            <History size={16}/>
            <span>{tr('Lô mới & Vừa giao dịch')}</span>
            <b className="history-tab-badge">{recentCards.length}</b>
          </button>
        </div>
      </div>

      <div className="history-kpis">
        <div className="history-kpi-card">
          <span>{tab==='posted'?tr('Tổng lô đã đăng'):tab==='collected'?tr('Tổng chuyến thu gom'):tr('Số lô mới / vừa cập nhật')}</span>
          <strong>{tr('{n} lô',{n:activeList.length})}</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('Đang mở / Đang ký quỹ')}</span>
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
          <p>{tr('Khi bạn đăng lô phế liệu mới hoặc nhận thu gom một lô trên sàn, lịch sử chi tiết sẽ xuất hiện ngay tại đây.')}</p>
        </div>
      ):(
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>{tr('Mã lô & Phế liệu')}</th>
                <th>{tr('Vật liệu & Cân nặng')}</th>
                <th>{tab==='posted'?tr('Người thu gom (Escrow)'):tr('Chủ lô & Người thu gom')}</th>
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
                        {lot&&lot.status===4&&(lot.paid||0)>0&&<small>{tr('Đã trả {avax} AVAX',{avax:fmt(lot.paid||0,6)})}</small>}
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
    const finalPoint=point||center||[10.78,106.70];
    setHashing(true);
    try{
      // A real photo of the lot is required: its SHA-256 is the on-chain evidence.
      if(!file){setError(tr('Chụp hoặc chọn ảnh thật của lô phế liệu.'));return;}
      const hash=await digest(await file.arrayBuffer());
      onCreate(grams,file,hash,finalPoint,String(f.get('contact')||'').trim(),String(f.get('address')||'').trim());
    }catch{
      setError(tr('Lỗi xử lý ảnh. Hãy chọn lại.'));
    }finally{
      setHashing(false);
    }
  }
  return <form className="lot-form" onSubmit={submit}><h3>{tr('Một lô, nhiều loại vật liệu')}</h3><p>{tr('Ước lượng khối lượng từng loại. Ảnh minh họa cả lô; ECO cuối cùng tính theo kết quả cân thực tế.')}</p><WeightInputs values={weights} onChange={setWeights}/><label>{tr('Ảnh thật của cả lô (bắt buộc)')}<input type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setFile(e.target.files?.[0])}/></label><div className="pickup-weights"><label>{tr('Số điện thoại / cách liên hệ')}<input name="contact" minLength={3} maxLength={120} required placeholder={tr("Người nhận việc sẽ dùng thông tin này")}/></label><label>{tr('Địa chỉ & thời gian bàn giao')}<input name="address" minLength={5} maxLength={400} required placeholder={tr("Số nhà, đường, khung giờ thuận tiện")}/></label></div><p>{tr('Địa chỉ và liên hệ chỉ chia sẻ với chủ lô và người đã nhận việc.')} {tr('Ảnh được lưu riêng trên server local; không đưa ảnh hoặc số điện thoại lên blockchain.')}</p><h4>{tr('Vị trí bàn giao trên bản đồ (mặc định: {lat}, {lng})',{lat:point[0].toFixed(2),lng:point[1].toFixed(2)})}</h4><PickupMap lots={[]} center={point} onPin={setPoint}/><div className="pickup-weights"><label>{tr('Vĩ độ')}<input type="number" step="any" min="-90" max="90" value={point?.[0]??''} onChange={e=>setPoint([Number(e.target.value),point?.[1]??106.69])}/></label><label>{tr('Kinh độ')}<input type="number" step="any" min="-180" max="180" value={point?.[1]??''} onChange={e=>setPoint([point?.[0]??10.78,Number(e.target.value)])}/></label></div><p className="footnote">{tr('Chỉ tọa độ làm tròn khoảng 1 km được ghi công khai, vĩnh viễn trên blockchain. Có thể nhập tọa độ nếu bản đồ không tải được.')}</p><div className="estimate"><span>{tr('Tổng dự kiến: {kg}',{kg:wt(total(weights.map(v=>Number(v)*1000)))})}</span><strong>+{fmt(points(weights.map(v=>Number(v)*1000)))} ECO</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full-width" disabled={busy||hashing}>{hashing?tr('Đang đọc ảnh & tạo mã băm…'):tr('Ký hợp đồng & Đăng lô tìm người thu gom')}<ArrowRight size={17}/></button></form>;
}
function PickupRewards({gasless,admin,address,account,collector,busy,balance,run,onChange,onDone}:{gasless:boolean;admin:boolean;address?:Address;account?:Address;collector:boolean;busy:boolean;balance:number;run:(f:()=>Promise<void>)=>Promise<void>;onChange:()=>Promise<void>;onDone:(message:string)=>void}){
  const [rewards,setRewards]=useState<RewardItem[]>([]);
  const [receipts,setReceipts]=useState<ReceiptItem[]>([]);
  async function reload(){
    if(!address){setRewards([]);setReceipts([]);return;}
    try{
      const read=(functionName:string,args:unknown[]=[])=>publicClient.readContract({address,abi:pickupAbi,functionName,args} as never) as Promise<any>;
      const n=Number(await read('rewardCount'));
      setRewards(await Promise.all(Array.from({length:n},async(_,i)=>{const r=await read('rewards',[BigInt(i+1)]);return{id:i+1,name:r[0],cost:Number(r[1])/1e18,stock:Number(r[2]),active:r[3]};})));
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
  return <section className="pickup-callout"><h3>{tr('Đổi điểm ECO lấy quà tặng xanh ({n} phần thưởng)',{n:active.length})}</h3><p>{tr('Sử dụng số dư ECO tích lũy từ các lô phế liệu đã hoàn tất để đổi voucher và sản phẩm thân thiện môi trường.')}</p>
    {!address&&<p>{tr('Phần thưởng sẽ hiện khi contract thu gom V3 được kích hoạt.')}</p>}
    {address&&!active.length&&<p>{tr('Chưa có phần thưởng nào trên contract.')}</p>}
    <div className="pickup-reward-list">{active.map(r=><div key={r.id}><strong>{tr(r.name)}</strong><p>{tr('{cost} ECO · còn {n} suất',{cost:fmt(r.cost),n:r.stock})}</p><button className="secondary" disabled={busy||balance<r.cost||!r.stock} onClick={()=>run(async()=>{if(!address||!account)throw new Error(tr('Kết nối ví để đổi quà.'));await householdWrite(address,account,'redeemReward',[BigInt(r.id)],gasless);await onChange();await reload();onDone(tr('Đã đổi quà thành công (-{cost} ECO). Biên nhận đã được tạo!',{cost:fmt(r.cost)}));})}>{balance<r.cost?tr('Cần thêm {n} ECO',{n:fmt(r.cost-balance)}):tr('Đổi quà ngay')}</button></div>)}</div>
    {admin&&address&&account&&<form className="reward-admin" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const form=e.currentTarget;run(async()=>{const name=String(f.get('name')||'').trim();const cost=String(f.get('cost')||'').replace(',','.');const stock=Number(f.get('stock'));if(!name||name.length>120)throw new Error(tr('Nhập tên phần thưởng (tối đa 120 ký tự).'));if(!/^\d*\.?\d+$/.test(cost)||Number(cost)<=0)throw new Error(tr('Số ECO phải lớn hơn 0.'));if(!Number.isInteger(stock)||stock<0)throw new Error(tr('Số suất phải là số nguyên không âm.'));await pickupWrite(address,account,'addReward',[name,parseEther(cost),BigInt(stock)]);form.reset();await reload();onDone(tr('Đã thêm phần thưởng lên contract.'));});}}><h4>{tr('Thêm phần thưởng thật (quản trị)')}</h4><div className="pickup-weights"><label>{tr('Tên phần thưởng')}<input name="name" required maxLength={120} placeholder={tr('VD: Voucher cà phê của đối tác')}/></label><label>{tr('Giá (ECO)')}<input name="cost" required inputMode="decimal" placeholder="100"/></label><label>{tr('Số suất')}<input name="stock" required type="number" min="0" step="1" placeholder="20"/></label></div><button className="secondary" disabled={busy}>{tr('Thêm phần thưởng')}</button></form>}
    <h4>{tr('Biên nhận đổi quà ({n})',{n:receipts.length})}</h4>{receipts.length?receipts.map(r=><div className="pickup-receipt" key={r.id}><span>#{r.id} · <strong>{tr(rewards.find(x=>x.id===r.reward)?.name||'')||tr('Quà #{id}',{id:r.reward})}</strong> {tr('· Ví nhận:')} <code>{short(r.owner)}</code> · {r.done?tr('✅ Đã giao quà'):tr('⏳ Chờ nhận tại trạm')}</span>{collector&&!r.done&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(!address||!account)throw new Error(tr('Kết nối ví để xác nhận.'));await pickupWrite(address,account,'fulfillRedemption',[BigInt(r.id)]);await reload();})}>{tr('Xác nhận đã giao quà')}</button>}</div>):<p>{tr('Chưa có biên nhận.')}</p>}</section>;
}
function CertificateCard({certificate,lotId,compact}:{certificate:Address;lotId:number;compact?:boolean}){
  const [cert,setCert]=useState<CertificateView|null>();
  useEffect(()=>{let live=true;setCert(undefined);readCertificate(certificate,lotId).then(c=>{if(live)setCert(c||null);});return()=>{live=false;};},[certificate,lotId]);
  if(cert===undefined)return <p role="status" className="footnote">{tr('Đang tải chứng nhận NFT…')}</p>;
  if(!cert)return null;
  return <div className={compact?'cert-card compact':'cert-card'}><img src={cert.image} alt={cert.name}/><div><strong><Award size={15}/>{tr('Chứng nhận tái chế NFT #{id}',{id:lotId})}</strong>{!compact&&<p>{tr('Lưu vĩnh viễn trên Avalanche: ai cũng kiểm chứng được số kg đã tái chế, ví dụ doanh nghiệp cần báo cáo trách nhiệm tái chế.')}</p>}<a className="text-link" href={certificateUrl(certificate,lotId)} target="_blank" rel="noreferrer">{tr('Xem trên Snowtrace')}<ExternalLink size={12}/></a></div></div>;
}
