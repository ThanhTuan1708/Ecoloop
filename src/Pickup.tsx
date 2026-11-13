import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {MapPin,Plus,RefreshCw,Navigation,ArrowRight,CheckCircle2,PackageCheck,ShieldCheck,Lock,Star,Coins,SlidersHorizontal,ChevronLeft,ChevronRight,Database,History,ClipboardList,Truck} from 'lucide-react';
import {isAddress,keccak256,stringToHex,type Address,type Hash} from 'viem';
import {chain, assertWallet} from './wallet';
import {errorMessage,txUrl,publicClient} from './chain';
import {materials,short} from './model';
import {tr,num as fmt,wt,money,dateTime,notify,unit} from './settings';
import {viewEvidence} from './evidence';
import {pickupAbi} from './generated/pickup';
import {lotStatuses,activatePickup,deployPickup,digest,distanceKm,pendingPickup,pickupDetails,pickupRead,pickupWrite,resumePickup,savePickupPhoto,DEMO_OWNER,DEMO_COLLECTOR,ZERO,type Lot} from './pickupClient';
import {createCatalogLots,mergeWithCatalogLots,queryProductCards,saveUserLotMeta,loadUserLotsMeta,getUserLotMeta,type ListingStatus,type SortOption,type ShopeeWeb3ProductCard} from './marketplace';
import PickupMap from './PickupMap';
import './pickup.css';

const demoKey='ecoloop-pickup-catalog-v2';
const rewardKey='ecoloop-pickup-rewards-v2';

interface CatalogRewardItem {
  id:number;
  name:string;
  cost:number;
  stock:number;
  active:boolean;
  isCatalog?:boolean;
}
interface CatalogReceiptItem {
  id:number;
  reward:number;
  owner:string;
  done:boolean;
  isCatalog?:boolean;
}

const DEFAULT_REWARDS:CatalogRewardItem[]=[
  {id:101,name:'Voucher Highlands Coffee 50.000đ',cost:180,stock:45,active:true,isCatalog:true},
  {id:102,name:'Túi Canvas Tái Chế EcoLoop Phiên Bản Giới Hạn',cost:250,stock:30,active:true,isCatalog:true},
  {id:103,name:'Bình Giữ Nhiệt Vỏ Tre Tự Nhiên 500ml',cost:420,stock:18,active:true,isCatalog:true},
  {id:104,name:'Chậu Cây Sen Đá Để Bàn Thanh Lọc Không Khí',cost:150,stock:50,active:true,isCatalog:true},
  {id:105,name:'Thẻ Nạp Điện Thoại Đa Mạng 50.000đ',cost:320,stock:60,active:true,isCatalog:true},
  {id:106,name:'Bộ Ống Hút & Muỗng Inox 304 Kèm Túi Vải',cost:120,stock:80,active:true,isCatalog:true},
  {id:107,name:'Vé Xe Buýt Điện Xanh 10 Lượt Nội Đô',cost:220,stock:40,active:true,isCatalog:true},
  {id:108,name:'Phiếu Mua Hàng Siêu Thị Co.opmart 100.000đ',cost:600,stock:25,active:true,isCatalog:true},
];

const DEFAULT_RECEIPTS:CatalogReceiptItem[]=[
  {id:501,reward:101,owner:DEMO_OWNER,done:true,isCatalog:true},
  {id:502,reward:104,owner:DEMO_OWNER,done:false,isCatalog:true},
  {id:503,reward:102,owner:'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',done:false,isCatalog:true},
];

function loadCatalogLots():Lot[]{
  const defaults=createCatalogLots();
  try{
    const data=JSON.parse(localStorage.getItem(demoKey)||'null');
    if(Array.isArray(data)&&data.length>=10&&data.every(l=>Array.isArray(l.estimated)&&Array.isArray(l.actual)))return data;
    return defaults;
  }catch{
    return defaults;
  }
}

function saveCatalogLots(items:Lot[]):void{
  try{
    localStorage.setItem(demoKey,JSON.stringify(items));
  }catch{
    try{
      localStorage.removeItem('ecoloop-user-lots-meta');
      localStorage.setItem(demoKey,JSON.stringify(items));
    }catch{/* ignore quota error */}
  }
}

function mergeCatalogLists(local:Lot[],remote:Lot[]):Lot[]{
  const map=new Map<number,Lot>();
  for(const item of local){
    if(item&&typeof item.id==='number')map.set(item.id,item);
  }
  for(const item of remote){
    if(!item||typeof item.id!=='number')continue;
    const existing=map.get(item.id);
    if(!existing||(item.updatedAt||0)>=(existing.updatedAt||0)){
      map.set(item.id,item);
    }
  }
  return Array.from(map.values()).sort((a,b)=>b.id-a.id);
}

async function compressImageToDataUrl(file:File,fallback:string):Promise<string>{
  if(!file||file.name==='scrap-sample.jpg'||file.size<=32)return fallback;
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      try{
        const maxDim=360;
        const scale=Math.min(1,maxDim/Math.max(img.width||1,img.height||1));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d');
        if(!ctx){URL.revokeObjectURL(url);resolve(fallback);return;}
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const dataUrl=canvas.toDataURL('image/jpeg',0.72);
        URL.revokeObjectURL(url);
        resolve(dataUrl&&dataUrl.length<=80_000?dataUrl:fallback);
      }catch{
        URL.revokeObjectURL(url);
        resolve(fallback);
      }
    };
    img.onerror=()=>{
      URL.revokeObjectURL(url);
      resolve(fallback);
    };
    img.src=url;
  });
}

function loadCatalogRewardsState():{rewards:CatalogRewardItem[];receipts:CatalogReceiptItem[];spent:number}{
  try{
    const raw=JSON.parse(localStorage.getItem(rewardKey)||'null');
    if(raw&&Array.isArray(raw.rewards)&&Array.isArray(raw.receipts)){
      return {rewards:raw.rewards,receipts:raw.receipts,spent:Number(raw.spent||0)};
    }
  }catch{/* ignore */}
  return {rewards:DEFAULT_REWARDS,receipts:DEFAULT_RECEIPTS,spent:0};
}

const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const total=(weights:number[])=>weights.reduce((a,b)=>a+b,0)/1000;
const points=(weights:number[])=>weights.reduce((a,b,i)=>a+b*materials[i].rate/1000,0);

export default function Pickup({account,demo=false,admin,onConnect,page='home',role='seller',createRequest=0,onSettings,children}:{children?:ReactNode;account?:Address;demo?:boolean;admin:boolean;onConnect:()=>void;page?:'home'|'orders'|'wallet'|'rewards'|'settings';role?:'seller'|'collector';createRequest?:number;onSettings?:()=>void}){
  const [address,setAddress]=useState<Address>();const [onChainLots,setOnChainLots]=useState<Lot[]>([]);const [catalogLots,setCatalogLots]=useState<Lot[]>(()=>loadCatalogLots());const [includeCatalog,setIncludeCatalog]=useState(true);const [count,setCount]=useState(0);const [limit,setLimit]=useState(100);
  const [balance,setBalance]=useState(0);const [spentCatalogEco,setSpentCatalogEco]=useState(()=>loadCatalogRewardsState().spent);const [view,setView]=useState<'grid'|'map'>('grid');const [v2Admin,setV2Admin]=useState(false);const [loading,setLoading]=useState(true);const [category,setCategory]=useState(-1);const [query,setQuery]=useState('');const [collector,setCollector]=useState(false);const [paused,setPaused]=useState(false);
  const [selected,setSelected]=useState<number>();const [creating,setCreating]=useState(false);const [filter,setFilter]=useState('showcase');const [radius,setRadius]=useState(0);const [center,setCenter]=useState<[number,number]>();
  const [filtersOpen,setFiltersOpen]=useState(false);const [sort,setSort]=useState<SortOption>('newest');const [tokenFilter,setTokenFilter]=useState<string>('ALL');const [pageNum,setPageNum]=useState(1);const [pageSize,setPageSize]=useState(12);
  const [demoRole,setDemoRole]=useState('owner');const [busy,setBusy]=useState(false);const lock=useRef(false);const version=useRef(0);const detailVersion=useRef(0);
  const [message,setMessage]=useState('');const [failure,setFailure]=useState(false);const [hash,setHash]=useState<Hash>();const [detail,setDetail]=useState<{contact:string;address:string}>();const [photo,setPhoto]=useState('');
  const [actual,setActual]=useState(['0','0','0','0']);const [consent,setConsent]=useState(false);const [deployConsent,setDeployConsent]=useState(false);
  const [importAddress,setImportAddress]=useState(localStorage.getItem(`ecoloop-pickup-deployed-${chain.id}`)||'');

  // Bind DEMO_OWNER & DEMO_COLLECTOR in catalog lots to the connected wallet `account`
  // so connecting a wallet never causes "Lô của tôi" / "Việc tôi đã nhận" / "Ví xanh" to appear empty!
  const activeWallet:Address=demo?(demoRole==='owner'?DEMO_OWNER:DEMO_COLLECTOR):(account||(role==='collector'?DEMO_COLLECTOR:DEMO_OWNER));
  const personalizedCatalogLots:Lot[]=catalogLots.map(lot=>{
    if(!account||demo)return lot;
    let nextOwner=lot.owner;
    let nextCollector=lot.collector;
    if(same(lot.owner,DEMO_OWNER)&&role==='seller'){
      nextOwner=account;
    }else if(same(lot.owner,DEMO_OWNER)&&!same(lot.collector,DEMO_COLLECTOR)){
      nextOwner=account;
    }
    if(same(lot.collector,DEMO_COLLECTOR)&&role==='collector'){
      nextCollector=account;
    }else if(same(lot.collector,DEMO_COLLECTOR)&&!same(lot.owner,DEMO_OWNER)){
      nextCollector=account;
    }
    return nextOwner===lot.owner&&nextCollector===lot.collector?lot:{...lot,owner:nextOwner,collector:nextCollector};
  });

  const lots=demo?personalizedCatalogLots:(includeCatalog?mergeWithCatalogLots(onChainLots,personalizedCatalogLots):onChainLots);
  const onChainIdSet=new Set(onChainLots.map(l=>l.id));
  const current=lots.find(l=>l.id===selected);
  const isCurrentOnChain=!demo&&!!current&&onChainIdSet.has(current.id);
  const user=activeWallet;

  // Browser notification when one of my lots (posted or collected) changes status while the tab is in the background.
  const watchedStatus=lots.filter(l=>same(l.owner,user)||same(l.collector,user)).map(l=>`${l.id}:${l.status}`).join(',');
  const lastStatus=useRef<{wallet:string;map:Map<number,number>}>();
  useEffect(()=>{
    const map=new Map(watchedStatus?watchedStatus.split(',').map(x=>x.split(':').map(Number) as [number,number]):[]);
    const prev=lastStatus.current;
    if(prev&&prev.wallet===user&&typeof document!=='undefined'&&document.hidden){
      for(const [id,status] of map){const before=prev.map.get(id);if(before!==undefined&&before!==status)notify(tr('EcoLoop · Lô #{id}',{id}),tr('Trạng thái mới: {status}',{status:tr(lotStatuses[status]||'')}));}
    }
    lastStatus.current={wallet:user,map};
  },[watchedStatus,user]);
  const isOwner=same(user,current?.owner)||(!isCurrentOnChain&&role==='seller');

  const catalogEarnedEco=personalizedCatalogLots
    .filter(l=>l.status===4&&(same(l.owner,account||DEMO_OWNER)||same(l.owner,DEMO_OWNER)))
    .reduce((sum,l)=>sum+points(l.actual.some(w=>w>0)?l.actual:l.estimated),0);
  const effectiveBalance=Math.max(0,balance+(includeCatalog||demo?catalogEarnedEco-spentCatalogEco:0));

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
      owner:filter==='mine'?(account||DEMO_OWNER):undefined,
      collector:filter==='assigned'?(account||DEMO_COLLECTOR):undefined,
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

    // 1. Sync shared catalog from backend server without overwriting newer local lots
    try {
      const response = await fetch('/api/marketplace/catalog', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (response.ok) {
        const data = await response.json();
        if (data.ok && Array.isArray(data.lots) && data.lots.length > 0) {
          if (v === version.current) {
            if (Array.isArray(data.userMeta)) {
              for (const m of data.userMeta) {
                saveUserLotMeta(m);
              }
            }
            setCatalogLots(prev => {
              const merged = mergeCatalogLists(prev, data.lots);
              saveCatalogLots(merged);
              return merged;
            });
          }
        } else if (data.ok && data.lots === null) {
          // Server not seeded yet, seed with current catalog
          const initial = loadCatalogLots();
          if (v === version.current) setCatalogLots(prev => mergeCatalogLists(prev, initial));
          fetch('/api/marketplace/catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync', lots: initial, userMeta: loadUserLotsMeta() }),
          }).catch(() => {});
        }
      } else {
        const savedCatalog=loadCatalogLots();
        if (v === version.current) setCatalogLots(prev => mergeCatalogLists(prev, savedCatalog));
      }
    } catch {
      const savedCatalog=loadCatalogLots();
      if (v === version.current) setCatalogLots(prev => mergeCatalogLists(prev, savedCatalog));
    }

    setSpentCatalogEco(loadCatalogRewardsState().spent);
    if(demo){setCount(catalogLots.length);setBalance(0);return;}
    try{
      const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)return;
      const config=await response.json();
      if(v!==version.current)return;
      const next=config.pickupContract as Address|undefined;
      setAddress(next||undefined);
      if(!next||config.chainId!==chain.id){setOnChainLots([]);setCount(0);return;}
      const data=await pickupRead(next,account,limit);
      if(v!==version.current)return;
      setOnChainLots(data.lots);setCount(data.count);setBalance(data.balance);setCollector(data.collector);setPaused(data.paused);setV2Admin(data.admin);
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

    // Cross-tab and window focus sync so Account 2 immediately sees changes from Account 1
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel('ecoloop_catalog_sync');
      channel.onmessage = () => {
        if (!lock.current) refresh().catch(() => {});
      };
    } catch {}

    const handleFocus = () => {
      if (!lock.current) refresh().catch(() => {});
    };
    window.addEventListener('focus', handleFocus);

    return()=>{
      version.current++;
      clearInterval(timer);
      if (channel) channel.close();
      window.removeEventListener('focus', handleFocus);
    };
  },[account,demo,limit]);
  useEffect(()=>{setSelected(undefined);setCreating(false);setPageNum(1);setFilter(page==='orders'?(role==='collector'?'assigned':'mine'):'showcase');},[page,role]);
  useEffect(()=>{setPageNum(1);setPageSize(12);},[filter,category,query,radius,sort,tokenFilter,includeCatalog]);
  useEffect(()=>{if(!createRequest)return;setCreating(true);setSelected(undefined);},[createRequest]);
  useEffect(()=>{detailVersion.current++;setDetail(undefined);setPhoto('');setConsent(false);setActual((current?.estimated||[0,0,0,0]).map(n=>String(n/1000)));},[selected,user,current?.status]);
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo);},[photo]);
  // Esc closes the lot detail (a bottom sheet on phones)
  useEffect(()=>{if(selected===undefined)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelected(undefined);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[selected]);

  function resetCatalog(){
    try {
      localStorage.removeItem(demoKey);
      localStorage.removeItem(rewardKey);
      localStorage.removeItem('ecoloop-user-lots-meta');
    } catch {}
    const fresh=createCatalogLots();
    setCatalogLots(fresh);
    setSpentCatalogEco(0);
    setIncludeCatalog(true);
    setFilter(page==='orders'?(role==='collector'?'assigned':'mine'):'showcase');
    setCategory(-1);
    setQuery('');
    fetch('/api/marketplace/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    }).catch(() => {});
    try {
      const channel = new BroadcastChannel('ecoloop_catalog_sync');
      channel.postMessage({ type: 'reset' });
      channel.close();
    } catch {}
    setMessage(tr('Đã nạp lại 28 sản phẩm mẫu và phần thưởng trên sàn C2C Web3.'));
  }

  async function change(fn:string,args:unknown[],status:number){
    if(!current)return;
    const id=current.id;

    if(!account && !demo){
      onConnect();
      return;
    }

    let signature = '';
    if(account && !demo){
      const wallet = await assertWallet(account);
      const actionName = fn==='claimLot' ? tr('HỢP ĐỒNG NHẬN THU GOM & KHÓA KÝ QUỸ (ESCROW)')
        : fn==='proposeLot' ? tr('BIÊN BẢN CÂN THỰC TẾ TẠI ĐIỂM BÀN GIAO')
        : fn==='acceptLot' ? tr('CHẤP THUẬN KẾT QUẢ CÂN & GIẢI NGÂN ĐIỂM THƯỞNG ECO')
        : fn==='cancelLot' ? tr('HỦY NIÊM YẾT LÔ PHẾ LIỆU')
        : tr('TRẢ LẠI VIỆC THU GOM');
      
      const actionDetails = fn==='proposeLot' 
        ? tr('Khối lượng thực tế: {list}',{list:(args[1] as bigint[]).map((w,i)=>Number(w)>0?`${tr(materials[i].name)}: ${(Number(w)/1000).toFixed(2)} kg`:null).filter(Boolean).join(' · ')})
        : fn==='acceptLot'
        ? tr('Xác nhận giải ngân điểm thưởng ECO cho Lô #{id}',{id})
        : tr('Người thu gom: {account}',{account});

      try {
        signature = await wallet.signMessage({
          account,
          message: `[ECOLOOP WEB3 ESCROW - ${actionName}]
${tr('Mã lô hàng: #{id}',{id})}
${tr('Ví thực hiện: {account}',{account})}
${actionDetails}
${tr('Thời gian: {time}',{time:dateTime(Date.now())})}
${tr('Thỏa thuận được mã hóa và chứng thực mật mã bằng ví trên mạng Avalanche Fuji.')}`
        });
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.toLowerCase().includes('reject') || err?.message?.toLowerCase().includes('denied')) {
          throw new Error(tr('Bạn đã từ chối ký hợp đồng trong ví. Thao tác đã bị hủy.'));
        }
        throw err;
      }
    }

    const currentMeta = getUserLotMeta(id, current.evidence) || { id, evidence: current.evidence };
    if (fn === 'claimLot') currentMeta.claimSignature = signature;
    if (fn === 'proposeLot') currentMeta.proposeSignature = signature;
    if (fn === 'acceptLot') currentMeta.acceptSignature = signature;
    saveUserLotMeta(currentMeta);

    if(demo||!isCurrentOnChain){
      const weights=fn==='proposeLot'?(args[1] as bigint[]).map(Number):current.actual;
      const collectorAddr = fn==='claimLot'?(account||DEMO_COLLECTOR):fn==='releaseLot'?ZERO:current.collector;
      const now = Date.now();
      const updated=catalogLots.map(l=>l.id===id?{...l,status,actual:fn==='disputeLot'||fn==='releaseLot'?[0,0,0,0]:weights,collector:collectorAddr,updatedAt:now}:l);
      saveCatalogLots(updated);
      setCatalogLots(updated);

      // Sync to shared backend server and wait before broadcasting
      try {
        await fetch('/api/marketplace/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'change',
            id,
            evidence: current.evidence,
            status,
            collector: collectorAddr,
            actual: fn==='disputeLot'||fn==='releaseLot'?[0,0,0,0]:weights,
            meta: currentMeta,
          }),
          signal: AbortSignal.timeout(4000),
        });
      } catch {}

      // Broadcast to other tabs
      try {
        const channel = new BroadcastChannel('ecoloop_catalog_sync');
        channel.postMessage({ type: 'lot_updated', id, status });
        channel.close();
      } catch {}

      if(fn==='claimLot')setFilter(page==='orders'?'assigned':'showcase');
      const sigMsg = signature ? tr(' · Đã ký số xác thực ví: {sig}',{sig:short(signature)}) : '';
      setMessage(tr('🎉 Đã ký hợp đồng và cập nhật trạng thái lô #{id} thành công!',{id})+sigMsg);
      return;
    }
    if(!account){onConnect();return;}
    if(!address)throw new Error(tr('Chưa kích hoạt thu gom.'));
    setHash(await pickupWrite(address,account,fn,args));
    await refresh();if(fn==='claimLot')setFilter('assigned');setMessage(tr('🎉 Đã ký và gửi giao dịch thu gom on-chain thành công lên mạng Fuji.'));
  }
  function locate(){run(async()=>{if(!navigator.geolocation)throw new Error(tr('Trình duyệt chưa hỗ trợ vị trí. Chọn khu vực trên bản đồ khi đăng lô.'));const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:15000}));setCenter([p.coords.latitude,p.coords.longitude]);setSort('distance_asc');setMessage(tr('Đã lấy vị trí để lọc khoảng cách. Không lưu vị trí vào hồ sơ hay blockchain; OpenStreetMap cung cấp nền bản đồ.'));});}
  async function create(weights:number[],file:File,evidence:Hash,point:[number,number],contact:string,location:string){
    if(!account && !demo){
      onConnect();
      return;
    }

    const lat=Math.round(point[0]*100),lng=Math.round(point[1]*100);
    const dominantIndex = weights.indexOf(Math.max(...weights));
    const sampleImages = ['/sample-scrap-plastic.jpg', '/sample-scrap-paper.jpg', '/sample-scrap-metal.jpg', '/sample-scrap-glass.jpg'];
    const defaultSample = sampleImages[dominantIndex >= 0 ? dominantIndex : 0];

    const previewUrl = await compressImageToDataUrl(file, defaultSample);

    let ownerSignature = '';
    if(account && !demo){
      try {
        const wallet = await assertWallet(account);
        ownerSignature = await wallet.signMessage({
          account,
          message: `[ECOLOOP WEB3 SMART ESCROW - ${tr('CAM KẾT NIÊM YẾT LÔ PHẾ LIỆU')}]
${tr('Chủ lô: {account}',{account})}
${tr('Vật liệu: {list}',{list:materials.map((m,i)=>weights[i]>0?`${tr(m.name)}: ${(weights[i]/1000).toFixed(2)} kg`:null).filter(Boolean).join(' · ')})}
${tr('Tổng dự kiến: {kg} kg',{kg:(total(weights)).toFixed(2)})}
${tr('Địa chỉ bàn giao: {address}',{address:location || 'TP. Hồ Chí Minh'})}
${tr('Bằng chứng SHA-256: {hash}',{hash:evidence})}
${tr('Thời gian: {time}',{time:dateTime(Date.now())})}
${tr('Tôi cam kết thông tin phân loại chính xác và đồng ý tham gia hợp đồng ký quỹ EcoLoop.')}`
        });
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.toLowerCase().includes('reject') || err?.message?.toLowerCase().includes('denied')) {
          throw new Error(tr('Bạn đã từ chối ký hợp đồng niêm yết trong ví. Lô phế liệu chưa được tạo.'));
        }
        throw err;
      }
    }

    if(demo||!account||!address||includeCatalog){
      const currentCatalog = mergeCatalogLists(catalogLots, loadCatalogLots());
      const nextId = Math.max(100, ...lots.map(l => l.id), ...currentCatalog.map(l => l.id)) + 1;
      const newLot:Lot = {
        id:nextId,
        owner:account||DEMO_OWNER,
        collector:ZERO,
        estimated:weights,
        actual:[0,0,0,0],
        evidence,
        latitude:lat/100,
        longitude:lng/100,
        updatedAt:Date.now(),
        status:1,
      };
      const updatedCatalog = [newLot, ...currentCatalog.filter(l => l.id !== nextId)];
      const userMeta = {
        id: nextId,
        evidence,
        title: `${location || 'Thu gom tận nơi'}`,
        contact: contact || 'Chủ lô (Liên hệ qua app)',
        address: location || 'TP. Hồ Chí Minh',
        imageUrl: previewUrl,
        ownerSignature,
      };
      saveUserLotMeta(userMeta);
      saveCatalogLots(updatedCatalog);
      setCatalogLots(updatedCatalog);

      // Reset all filters and select the new lot immediately so it is guaranteed visible at #1
      setIncludeCatalog(true);
      setCreating(false);
      setPageNum(1);
      setCategory(-1);
      setTokenFilter('ALL');
      setQuery('');
      setRadius(0);
      setSort('newest');
      setFilter(page==='orders'?'mine':'showcase');
      setSelected(nextId);
      const sigMsg = ownerSignature ? tr(' · Chữ ký ví: {sig}',{sig:short(ownerSignature)}) : '';
      setMessage(tr('🎉 Đã ký hợp đồng và đăng thành công Lô #{id}! Lô mới đã xuất hiện ở đầu danh sách.',{id:nextId})+sigMsg);

      // Sync to shared backend server and wait before notifying other tabs
      try {
        await fetch('/api/marketplace/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', lot: newLot, meta: userMeta, baseLots: currentCatalog }),
          signal: AbortSignal.timeout(4000),
        });
      } catch {}

      // Broadcast to other tabs after server has saved the new lot
      try {
        const channel = new BroadcastChannel('ecoloop_catalog_sync');
        channel.postMessage({ type: 'lot_created', id: nextId });
        channel.close();
      } catch {}
      return;
    }
    if(pendingPickup())throw new Error(tr('Kiểm tra giao dịch đang chờ trước khi đăng lô mới.'));
    await publicClient.simulateContract({address,abi:pickupAbi,functionName:'createLot',args:[weights.map(BigInt) as [bigint,bigint,bigint,bigint],evidence,lat,lng],account});
    await savePickupPhoto(account,address,file,evidence,contact,location);
    setHash(await pickupWrite(address,account,'createLot',[weights.map(BigInt),evidence,lat,lng]));
    setCreating(false);
    setPageNum(1);
    setCategory(-1);
    setQuery('');
    setRadius(0);
    setSort('newest');
    setFilter('mine');
    await refresh();
    setMessage(tr('🎉 Đã ký và gửi giao dịch tạo lô on-chain thành công lên mạng Fuji.'));
  }
  return <section className={`pickup-workspace pickup-page-${page}`}><div className="pickup-page-title"><span className="eyebrow">{tr('ECOLOOP · SÀN C2C WEB3 AVALANCHE FUJI')}</span><h2>{({home:tr("Sàn phế liệu Web3 gần bạn"),orders:tr("Đơn thu gom & Ký quỹ của bạn"),wallet:tr("Ví xanh của bạn"),rewards:tr("Đổi điểm, nhận điều xanh"),settings:tr("Thiết lập hệ thống")})[page]}</h2><p>{page==='settings'?tr('Ngôn ngữ, giao diện, đơn vị, thông báo và cấu hình hệ thống.'):tr('Dữ liệu on-chain kết hợp IPFS/off-chain. Ký quỹ thông minh bảo vệ hai chiều.')}</p></div>
    {page==='settings'&&children}
    {page==='settings'&&(admin||v2Admin||!address)&&!demo&&<h3 className="set-section-title">{tr('Quản trị hệ thống')}</h3>}
    {(page==='home'||page==='orders')&&<div className="pickup-intro"><div><span className="eyebrow">{tr('TỪ NHÀ BẠN ĐẾN MỘT VÒNG ĐỜI MỚI')}</span><h2>{tr('Thu gom tận nơi')}</h2><p>{tr('Gom nhiều vật liệu trong một lô. Khóa ký quỹ (Escrow), cân thực tế, hai bên xác nhận rồi giải ngân ECO.')}</p></div><button className="primary" disabled={busy||paused} onClick={()=>setCreating(!creating)}><Plus size={18}/>{creating?tr('Đóng biểu mẫu'):tr('Đăng lô thu gom')}</button></div>}
    {(page==='home'||page==='orders')&&<div className="pickup-steps"><span><b>1</b> {tr('Đăng listing (Active)')}</span><span><b>2</b> {tr('Khóa ký quỹ (In Escrow)')}</span><span><b>3</b> {tr('Cân & đề xuất on-chain')}</span><span><b>4</b> {tr('Giải ngân (Sold)')}</span></div>}
    {demo&&<div className="pickup-callout"><strong>{tr('Demo mô phỏng · không gửi giao dịch')}</strong><p>{tr('Dùng hai vai trò dưới đây để thử đủ quy trình. Điểm demo không phải ECO trên Fuji.')}</p><div className="filter-tabs"><button className={demoRole==='owner'?'selected':''} onClick={()=>setDemoRole('owner')}>{tr('Chủ lô')}</button><button className={demoRole==='collector'?'selected':''} onClick={()=>setDemoRole('collector')}>{tr('Người thu gom')}</button></div></div>}
    {loading&&!lots.length&&<p role="status">{tr('Đang tải dữ liệu từ mạng…')}</p>}
    {!demo&&!address&&page==='settings'&&<div className="pickup-callout"><strong>{tr('Chờ kích hoạt contract thu gom V2')}</strong><p>{tr('Luồng nhiều vật liệu và xác nhận hai phía cần contract thu gom. Quản trị viên triển khai một lần rồi kích hoạt dùng chung. ECO cũ không tự chuyển sang contract mới.')}</p>{!account&&<button className="primary" onClick={onConnect}>{tr('Kết nối ví quản trị')}</button>}{account&&!admin&&<p>{tr('Ví này chưa có quyền quản trị trên hệ thống hiện tại. Hãy dùng ví đã triển khai EcoLoop.')}</p>}{admin&&account&&<><label className="checkbox"><input type="checkbox" checked={deployConsent} onChange={e=>setDeployConsent(e.target.checked)}/>{tr('Tạo contract V2 mới bằng AVAX testnet. ECO V2 được quản lý riêng với ECO cũ.')}</label><button className="primary" disabled={busy||!deployConsent||!!pendingPickup()} onClick={()=>run(async()=>{const a=await deployPickup(account);setImportAddress(a);setMessage(tr('Đã triển khai. Nhấn kích hoạt dùng chung bên dưới để hoàn tất.'));})}>{tr('Triển khai bằng ví quản trị')}</button><label>{tr('Địa chỉ V2 đã triển khai')}<input value={importAddress} onChange={e=>setImportAddress(e.target.value)} placeholder="0x…"/></label><button className="secondary" disabled={busy||!isAddress(importAddress)} onClick={()=>run(async()=>{await activatePickup(account,importAddress as Address);await refresh();setMessage(tr('Đã kích hoạt contract chung cho Chrome và Edge.'));})}>{tr('Kích hoạt dùng chung')}</button></>}</div>}
    {!demo&&pendingPickup()&&<div className="pickup-callout"><strong>{tr('Giao dịch đang chờ xác nhận')}</strong><code>{pendingPickup()}</code><button className="secondary" disabled={busy} onClick={()=>run(async()=>{const r=await resumePickup();if(r?.contractAddress){setImportAddress(r.contractAddress);localStorage.setItem(`ecoloop-pickup-deployed-${chain.id}`,r.contractAddress);}await refresh();setMessage(tr('Đã kiểm tra giao dịch.'));})}>{tr('Kiểm tra giao dịch')}</button></div>}
    {message&&<div className={failure?'pickup-feedback error':'pickup-feedback'} role={failure?'alert':'status'}>{tr(message)}</div>}
    {hash&&<a className="text-link" href={txUrl(hash)} target="_blank" rel="noreferrer">{tr('Xem giao dịch trên Fuji ↗')}</a>}
    {paused&&<p role="alert">{tr('Thu gom đang tạm dừng. Vẫn có thể hủy, yêu cầu cân lại hoặc trả việc.')}</p>}
    {(demo||address||includeCatalog)&&<>
      {page!=='settings'&&<div className="pickup-summary">
        <span><strong>{lots.length}</strong> {tr('tổng sản phẩm')}</span>
        <span><strong>{facets.ACTIVE}</strong> {tr('đang mở bán')}</span>
        <span><strong>{facets.IN_ESCROW}</strong> {tr('đang khóa ký quỹ')}</span>
        <span><strong>{facets.SOLD}</strong> {tr('đã bán hoàn tất')}</span>
        <span><strong>{fmt(effectiveBalance)}</strong> {tr('ECO khả dụng')}</span>
        {!demo&&<button type="button" className="text-link" onClick={()=>setIncludeCatalog(v=>!v)}><Database size={14}/>{includeCatalog?tr('Đang gộp 28 lô mẫu + {n} on-chain',{n:onChainLots.length}):tr('Chỉ hiện {n} lô on-chain',{n:onChainLots.length})}</button>}
        <button type="button" className="text-link" disabled={busy} onClick={resetCatalog}><RefreshCw size={14}/>{tr('Khôi phục 28 lô mẫu')}</button>
      </div>}
      {creating&&(page==='home'||page==='orders')&&<LotForm busy={busy} demo={demo} center={center} onCreate={(...args)=>run(()=>create(...args))}/>}
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
            <option value="mine">{tr('👤 Lô của tôi ({n})',{n:lots.filter(l=>same(l.owner,account||DEMO_OWNER)).length})}</option>
            <option value="assigned">{tr('🚚 Việc tôi đã nhận ({n})',{n:lots.filter(l=>same(l.collector,account||DEMO_COLLECTOR)).length})}</option>
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
                    <span className="web3-ipfs-pill">IPFS · {tr(card.category.name)}</span>
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
                  <small className="fiat-equiv">≈ {money(card.pricing.vndEquivalent)}</small>
                </span>
                <span className="shopee-rating-row">
                  <span className="star-badge"><Star size={11} fill="currentColor"/> {card.seller.reputationScore.toFixed(1)}</span>
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
            {!cards.length&&<div className="pickup-empty"><PackageCheck size={30}/><h3>{tr('Chưa có lô phù hợp với bộ lọc hiện tại')}</h3><p>{tr('Nhấn nút bên dưới để xem toàn bộ kệ hàng 28 sản phẩm trên sàn hoặc khôi phục dữ liệu mẫu.')}</p><div className="shopee-pagination-controls"><button type="button" className="primary" onClick={()=>{setFilter('showcase');setCategory(-1);setQuery('');}}>{tr('Xem toàn bộ kệ hàng ({n} lô)',{n:facets.ACTIVE+facets.IN_ESCROW})}</button><button type="button" className="secondary" onClick={resetCatalog}>{tr('Khôi phục 28 sản phẩm mẫu')}</button></div></div>}
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
              <div><span>{tr('Cửa hàng / Chủ lô:')}</span> <strong>{selectedCard.seller.displayName}</strong> (<code>{short(current.owner)}</code>) · ★ {selectedCard.seller.reputationScore} {tr('({n} lô hoàn tất)',{n:selectedCard.seller.completedSalesCount})}</div>
              <div><span>{tr('Ví thu gom (Escrow):')}</span> <code>{current.collector===ZERO?tr('Chưa khóa ký quỹ'):short(current.collector)}</code></div>
              <div><span>{tr('Khu vực bàn giao:')}</span> {selectedCard.seller.location.district}, {selectedCard.seller.location.province}</div>
              <div><span>Contract V2 (Chain {chain.id}):</span> <code>{address?short(address):'Fuji Escrowed Catalog'}</code></div>
              <div><span>IPFS CID / SHA-256:</span> <code>{selectedCard.thumbnail.gatewayUrl.slice(0,28)}…</code> · <code>{short(current.evidence)}</code></div>
              {selectedCard.onChain.escrowLockExpiresAt&&<div><span>{tr('Hạn bảo vệ ký quỹ:')}</span> {dateTime(selectedCard.onChain.escrowLockExpiresAt)}</div>}
            </div>
            {(() => {
              const meta = current ? getUserLotMeta(current.id, current.evidence) : undefined;
              const hasSig = meta?.ownerSignature || meta?.claimSignature || meta?.proposeSignature || meta?.acceptSignature;
              return hasSig ? (
                <div className="escrow-signatures-box">
                  <strong>{tr('✍️ HỢP ĐỒNG ĐÃ ĐƯỢC KÝ SỐ MẬT MÃ (EIP-191)')}</strong>
                  {meta?.ownerSignature && (
                    <div><span>{tr('Chữ ký Chủ lô:')}</span> <code>{short(meta.ownerSignature)} {tr('(Cam kết niêm yết)')}</code></div>
                  )}
                  {meta?.claimSignature && (
                    <div><span>{tr('Chữ ký Người gom:')}</span> <code>{short(meta.claimSignature)} {tr('(Khóa ký quỹ Escrow)')}</code></div>
                  )}
                  {meta?.proposeSignature && (
                    <div><span>{tr('Chữ ký Biên bản cân:')}</span> <code>{short(meta.proposeSignature)} {tr('(Chứng thực số cân)')}</code></div>
                  )}
                  {meta?.acceptSignature && (
                    <div><span>{tr('Chữ ký Giải ngân:')}</span> <code>{short(meta.acceptSignature)} {tr('(Tất toán hoàn tất)')}</code></div>
                  )}
                </div>
              ) : null;
            })()}
            <table><thead><tr><th>{tr('Vật liệu')}</th><th>{tr('Dự kiến')}</th><th>{tr('Thực tế')}</th></tr></thead><tbody>{materials.map((m,i)=><tr key={m.name}><td>{m.symbol} {tr(m.name)}</td><td>{wt(current.estimated[i]/1000)}</td><td>{[3,4].includes(current.status)?wt(current.actual[i]/1000):'—'}</td></tr>)}</tbody></table>
            <p className="lot-points">
              <strong>+{selectedCard.pricing.amountFormatted} ECO</strong>
              <span> · ≈ {money(selectedCard.pricing.vndEquivalent)} (${selectedCard.pricing.usdEquivalent.toFixed(2)} USD)</span>
            </p>
            <button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(selectedCard.contactPreview&&!isCurrentOnChain){setDetail(selectedCard.contactPreview);return;}if(demo){setDetail({contact:tr('Liên hệ mẫu · 0903 881 245'),address:tr('Địa chỉ minh họa tại TP.HCM.')});return;}if(!account||!address){if(selectedCard.contactPreview){setDetail(selectedCard.contactPreview);return;}onConnect();return;}const v=detailVersion.current;const d=await pickupDetails(account,address,current);const p=await viewEvidence(account,current.evidence,address,current.id);if(v!==detailVersion.current){URL.revokeObjectURL(p);return;}setDetail(d);setPhoto(p);})}>{tr('Xem liên hệ & địa chỉ bàn giao')}</button>
            {detail&&<div className="pickup-callout"><strong>{detail.contact}</strong><p>{detail.address}</p></div>}
            {current.status===1&&<button className="primary full-width" disabled={busy||paused} onClick={()=>run(()=>change('claimLot',[BigInt(current.id)],2))}>{tr('Ký hợp đồng nhận thu gom & Khóa ký quỹ (Escrow)')} <ArrowRight size={16}/></button>}
            {current.status===1&&isOwner&&<button className="secondary" disabled={busy} onClick={()=>run(()=>change('cancelLot',[BigInt(current.id)],5))}>{tr('Hủy listing')}</button>}
            {current.status===2&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const weights=actual.map(s=>Math.round(Number(s)*1000));if(weights.some(n=>!Number.isSafeInteger(n)||n<0)||total(weights)<=0||total(weights)>1000)throw new Error(tr('Tổng khối lượng thực tế từ 0,001 đến 1.000 kg.'));await change('proposeLot',[BigInt(current.id),weights.map(BigInt)],3);});}}><h4>{tr('Kết quả cân thực tế tại điểm bàn giao')}</h4><WeightInputs values={actual} onChange={setActual}/><p>{tr('Nhập số cân thực tế trên bàn cân điện tử để ký số và gửi đề xuất on-chain cho chủ lô xác nhận.')}</p><button className="primary" disabled={busy||paused}>{tr('Ký số & Gửi kết quả cân (Đề xuất Escrow)')}</button></form>}
            {current.status===3&&<><p>{tr('Kiểm tra bảng khối lượng thực tế trước khi xác nhận giải ngân. Đề xuất có hiệu lực 7 ngày.')}</p><label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{tr('Tôi đã bàn giao vật liệu và đồng ý khối lượng thực tế trên.')}</label><button className="primary full-width" disabled={busy||paused||!consent||Date.now()>current.updatedAt+7*86400000} onClick={()=>run(()=>change('acceptLot',[BigInt(current.id)],4))}><CheckCircle2 size={16}/>{tr('Ký xác nhận bàn giao & Giải ngân ECO')}</button><button className="secondary" disabled={busy} onClick={()=>run(()=>change('disputeLot',[BigInt(current.id)],2))}>{tr('Chưa đồng ý · yêu cầu cân lại')}</button></>}
            {[2,3].includes(current.status)&&<button className="text-link" disabled={busy} onClick={()=>run(()=>change('releaseLot',[BigInt(current.id)],1))}>{tr('Trả lại việc thu gom (Mở lại listing Active)')}</button>}
            {current.status===4&&<p className="pickup-success"><CheckCircle2 size={18}/>{tr('Hai phía đã xác nhận. ECO đã được giải ngân cho chủ lô.')}</p>}
          </>:<div className="pickup-empty"><MapPin size={30}/><h3>{tr('Chọn một thẻ sản phẩm để xem')}</h3><p>{tr('Xem ảnh chụp thực tế tại bãi cân, dữ liệu on-chain/off-chain, nhận thu gom và thử luồng khóa ký quỹ tại đây.')}</p></div>}</div>
        </div>
      </>}
      {(page==='home'||page==='orders'||page==='wallet')&&<PickupHistorySection
        allCards={allCards}
        lots={lots}
        catalogLots={catalogLots}
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
      {!demo&&address&&(admin||v2Admin)&&account&&page==='settings'&&<form className="pickup-callout" onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const value=String(fields.get('collector'));const action=fields.get('action')==='revoke'?'revokeRole':'grantRole';run(async()=>{if(!isAddress(value))throw new Error(tr('Địa chỉ ví thu gom không hợp lệ.'));setHash(await pickupWrite(address,account,action,[keccak256(stringToHex('COLLECTOR_ROLE')),value]));setMessage(tr('Đã cập nhật quyền thu gom V2.'));await refresh();});}}><h3>{tr('Quyền thu gom V2')}</h3><p>{tr('Quyền trên contract cũ không tự chuyển sang V2. Chỉ cấp cho điểm thu gom đã được xác minh.')}</p><label>{tr('Ví người thu gom')}<input name="collector" required placeholder="0x…"/></label><label>{tr('Thao tác')}<select name="action"><option value="grant">{tr('Cấp quyền nhận việc')}</option><option value="revoke">{tr('Thu hồi quyền')}</option></select></label><button className="secondary" disabled={busy}>{tr('Cập nhật quyền')}</button><button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{setHash(await pickupWrite(address,account,'setPaused',[!paused]));await refresh();})}>{paused?tr('Mở lại thu gom'):tr('Tạm dừng thu gom')}</button><p className="footnote">Contract V2: {address}</p></form>}
      {page==='wallet'&&<div className="pickup-callout wallet-live"><span>{tr('VÍ ĐIỂM THU GOM ECOLOOP')}</span><h2>{fmt(effectiveBalance)} ECO</h2><p>{account?tr('Ví đã kết nối: {wallet} · Bao gồm {chain} ECO on-chain và {market} ECO từ các lô hoàn tất trên sàn',{wallet:short(account),chain:fmt(balance),market:fmt(Math.max(0,catalogEarnedEco-spentCatalogEco))}):tr('Đang hiển thị số dư mẫu trên sàn. Kết nối ví để đồng bộ với địa chỉ của bạn.')}</p><code>{address||'0x01578d5d538db64a1ebef96920813e619060acc9'}</code><p>{tr('ECO là token thưởng khi hoàn tất bàn giao phế liệu qua hợp đồng ký quỹ (Escrow); dùng để đổi các phần thưởng xanh bên dưới.')}</p></div>}
      {(page==='rewards'||page==='wallet')&&<PickupRewards address={address} account={account} collector={collector||role==='collector'} busy={busy} balance={effectiveBalance} run={run} onChange={refresh} onSpendCatalog={cost=>{setSpentCatalogEco(s=>s+cost);setMessage(tr('Đã đổi quà thành công (-{cost} ECO). Biên nhận đã được tạo!',{cost:fmt(cost)}));}}/>}
    </>}
    {busy&&<p role="status" className="pickup-busy">{tr('Đang xử lý… Kiểm tra cửa sổ ví nếu được yêu cầu ký. Không đóng trang khi gửi giao dịch.')}</p>}
  </section>;
}

function PickupHistorySection({
  allCards,
  lots,
  catalogLots,
  account,
  role,
  selected,
  onSelectLot,
}:{
  allCards:ShopeeWeb3ProductCard[];
  lots:Lot[];
  catalogLots:Lot[];
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
  const rawCatalogMap=new Map(catalogLots.map(l=>[l.id,l]));

  // 1. Lịch sử đã đăng lô (Posted Lots)
  const postedCards=allCards.filter(card=>{
    const raw=rawCatalogMap.get(card.lotId);
    const isUserCreated=card.lotId>28;
    if(isUserCreated&&(!account||same(card.onChain.sellerWallet,account)||same(card.onChain.sellerWallet,DEMO_OWNER))){
      return true;
    }
    if(same(card.onChain.sellerWallet,account||DEMO_OWNER))return true;
    if(raw&&same(raw.owner,DEMO_OWNER))return true;
    return false;
  }).sort((a,b)=>{
    const aUser=a.lotId>28?1:0;
    const bUser=b.lotId>28?1:0;
    if(aUser!==bUser)return bUser-aUser;
    return b.lotId-a.lotId;
  });

  // 2. Lịch sử thu gom lô (Collected Lots)
  const collectedCards=allCards.filter(card=>{
    const raw=rawCatalogMap.get(card.lotId);
    const lot=lotMap.get(card.lotId);
    const collectorAddr=card.onChain.buyerWallet||lot?.collector||ZERO;
    if(collectorAddr===ZERO)return false;
    if(same(collectorAddr,account||DEMO_COLLECTOR))return true;
    if(raw&&same(raw.collector,DEMO_COLLECTOR))return true;
    if(card.lotId>28)return true;
    return false;
  }).sort((a,b)=>{
    const aUser=a.lotId>28?1:0;
    const bUser=b.lotId>28?1:0;
    if(aUser!==bUser)return bUser-aUser;
    const aTime=lotMap.get(a.lotId)?.updatedAt||0;
    const bTime=lotMap.get(b.lotId)?.updatedAt||0;
    return bTime-aTime;
  });

  // 3. Lô mới đăng & Giao dịch vừa thực hiện (All user-created lots + recent activity across accounts)
  const recentCards=allCards.filter(card=>{
    const lot=lotMap.get(card.lotId);
    if(card.lotId>28)return true;
    if(lot&&Date.now()-lot.updatedAt<6*3600_000)return true;
    return false;
  }).sort((a,b)=>{
    const aUser=a.lotId>28?1:0;
    const bUser=b.lotId>28?1:0;
    if(aUser!==bUser)return bUser-aUser;
    const aTime=lotMap.get(a.lotId)?.updatedAt||0;
    const bTime=lotMap.get(b.lotId)?.updatedAt||0;
    return bTime-aTime;
  });

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
                const isNewUserLot=card.lotId>28;
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
                        <small>≈ {money(card.pricing.vndEquivalent)}</small>
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
function LotForm({busy,demo,center,onCreate}:{busy:boolean;demo:boolean;center?:[number,number];onCreate:(weights:number[],file:File,evidence:Hash,point:[number,number],contact:string,address:string)=>void}){
  const [weights,setWeights]=useState(['2.5','0','0','0']);
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
      let finalFile=file;
      let hash:Hash;
      if(!finalFile){
        finalFile=new File(['ecoloop-sample'],'scrap-sample.jpg',{type:'image/jpeg'});
        hash=keccak256(stringToHex(`ecoloop-lot-${Date.now()}-${Math.random()}`));
      }else{
        hash=await digest(await finalFile.arrayBuffer());
      }
      onCreate(grams,finalFile,hash,finalPoint,String(f.get('contact')||'').trim(),String(f.get('address')||'').trim());
    }catch{
      setError(tr('Lỗi xử lý ảnh. Hãy chọn lại.'));
    }finally{
      setHashing(false);
    }
  }
  return <form className="lot-form" onSubmit={submit}><h3>{tr('Một lô, nhiều loại vật liệu')}</h3><p>{tr('Ước lượng khối lượng từng loại. Ảnh minh họa cả lô; ECO cuối cùng tính theo kết quả cân thực tế.')}</p><WeightInputs values={weights} onChange={setWeights}/><label>{tr('Ảnh cả lô (nếu chưa có ảnh sẽ tự dùng ảnh mẫu)')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0])}/></label><div className="pickup-weights"><label>{tr('Số điện thoại / cách liên hệ')}<input name="contact" minLength={3} maxLength={120} required defaultValue={tr("Chủ nhà (0903 881 245)")} placeholder={tr("Người nhận việc sẽ dùng thông tin này")}/></label><label>{tr('Địa chỉ & thời gian bàn giao')}<input name="address" minLength={5} maxLength={400} required defaultValue={tr("Quận 7, TP. Hồ Chí Minh")} placeholder={tr("Số nhà, đường, khung giờ thuận tiện")}/></label></div><p>{tr('Địa chỉ và liên hệ chỉ chia sẻ với chủ lô và người đã nhận việc.')} {demo?tr('Demo không gửi ảnh hay liên hệ lên server.'):tr('Ảnh được lưu riêng trên server local; không đưa ảnh hoặc số điện thoại lên blockchain.')}</p><h4>{tr('Vị trí bàn giao trên bản đồ (mặc định: {lat}, {lng})',{lat:point[0].toFixed(2),lng:point[1].toFixed(2)})}</h4><PickupMap lots={[]} center={point} onPin={setPoint}/><div className="pickup-weights"><label>{tr('Vĩ độ')}<input type="number" step="any" min="-90" max="90" value={point?.[0]??''} onChange={e=>setPoint([Number(e.target.value),point?.[1]??106.69])}/></label><label>{tr('Kinh độ')}<input type="number" step="any" min="-180" max="180" value={point?.[1]??''} onChange={e=>setPoint([point?.[0]??10.78,Number(e.target.value)])}/></label></div><p className="footnote">{tr('Chỉ tọa độ làm tròn khoảng 1 km được ghi công khai, vĩnh viễn trên blockchain. Có thể nhập tọa độ nếu bản đồ không tải được.')}</p><div className="estimate"><span>{tr('Tổng dự kiến: {kg}',{kg:wt(total(weights.map(v=>Number(v)*1000)))})}</span><strong>+{fmt(points(weights.map(v=>Number(v)*1000)))} ECO</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full-width" disabled={busy||hashing}>{hashing?tr('Đang đọc ảnh & tạo mã băm…'):tr('Ký hợp đồng & Đăng lô tìm người thu gom')}<ArrowRight size={17}/></button></form>;
}
function PickupRewards({address,account,collector,busy,balance,run,onChange,onSpendCatalog}:{address?:Address;account?:Address;collector:boolean;busy:boolean;balance:number;run:(f:()=>Promise<void>)=>Promise<void>;onChange:()=>Promise<void>;onSpendCatalog:(cost:number)=>void}){
  const [onChainRewards,setOnChainRewards]=useState<CatalogRewardItem[]>([]);
  const [onChainReceipts,setOnChainReceipts]=useState<CatalogReceiptItem[]>([]);
  const [catalogState,setCatalogState]=useState(loadCatalogRewardsState);

  async function reload(){
    setCatalogState(loadCatalogRewardsState());
    if(!address)return;
    try{
      const read=(functionName:string,args:unknown[]=[])=>publicClient.readContract({address,abi:pickupAbi,functionName,args} as never) as Promise<any>;
      const n=Number(await read('rewardCount'));
      setOnChainRewards(await Promise.all(Array.from({length:n},async(_,i)=>{const r=await read('rewards',[BigInt(i+1)]);return{id:i+1,name:r[0],cost:Number(r[1])/1e18,stock:Number(r[2]),active:r[3]};})));
      if(!account)return;
      const count=Number(await read('redemptionCount'));
      const list:CatalogReceiptItem[]=[];
      for(let i=count;i>Math.max(0,count-50);i--){
        const [owner,reward,done]=await Promise.all([read('redemptionOwner',[BigInt(i)]),read('redemptionReward',[BigInt(i)]),read('redemptionFulfilled',[BigInt(i)])]);
        if(same(owner,account)||collector)list.push({id:i,reward:Number(reward),owner,done});
      }
      setOnChainReceipts(list);
    }catch{/* keep catalog rewards when RPC fails */}
  }
  useEffect(()=>{reload().catch(()=>{});},[address,account,balance,collector]);

  const rewards=[...onChainRewards,...catalogState.rewards];
  const receipts=[
    ...onChainReceipts,
    ...catalogState.receipts.map(r=>({
      ...r,
      owner:same(r.owner,DEMO_OWNER)&&account?account:r.owner,
    })),
  ];

  function redeemCatalog(r:CatalogRewardItem){
    const current=loadCatalogRewardsState();
    const updatedRewards=current.rewards.map(item=>item.id===r.id?{...item,stock:Math.max(0,item.stock-1)}:item);
    const nextReceiptId=Math.max(500,...current.receipts.map(x=>x.id))+1;
    const updatedReceipts=[{id:nextReceiptId,reward:r.id,owner:account||DEMO_OWNER,done:false,isCatalog:true},...current.receipts];
    const nextState={rewards:updatedRewards,receipts:updatedReceipts,spent:current.spent+r.cost};
    localStorage.setItem(rewardKey,JSON.stringify(nextState));
    setCatalogState(nextState);
    onSpendCatalog(r.cost);
  }

  function fulfillCatalog(receiptId:number){
    const current=loadCatalogRewardsState();
    const updatedReceipts=current.receipts.map(x=>x.id===receiptId?{...x,done:true}:x);
    const nextState={...current,receipts:updatedReceipts};
    localStorage.setItem(rewardKey,JSON.stringify(nextState));
    setCatalogState(nextState);
  }

  return <section className="pickup-callout"><h3>{tr('Đổi điểm ECO lấy quà tặng xanh ({n} phần thưởng)',{n:rewards.filter(r=>r.active).length})}</h3><p>{tr('Sử dụng số dư ECO tích lũy từ các lô phế liệu đã hoàn tất để đổi voucher và sản phẩm thân thiện môi trường.')}</p><div className="pickup-reward-list">{rewards.filter(r=>r.active).map(r=><div key={r.id}><strong>{tr(r.name)}</strong><p>{tr('{cost} ECO · còn {n} suất',{cost:fmt(r.cost),n:r.stock})}</p><button className="secondary" disabled={busy||balance<r.cost||!r.stock} onClick={()=>run(async()=>{if(r.isCatalog||!address||!account){redeemCatalog(r);return;}await pickupWrite(address,account,'redeem',[BigInt(r.id)]);await onChange();await reload();})}>{balance<r.cost?tr('Cần thêm {n} ECO',{n:fmt(r.cost-balance)}):tr('Đổi quà ngay')}</button></div>)}</div><h4>{tr('Biên nhận đổi quà ({n})',{n:receipts.length})}</h4>{receipts.length?receipts.map(r=><div className="pickup-receipt" key={r.id}><span>#{r.id} · <strong>{tr(rewards.find(x=>x.id===r.reward)?.name||'')||tr('Quà #{id}',{id:r.reward})}</strong> {tr('· Ví nhận:')} <code>{short(r.owner)}</code> · {r.done?tr('✅ Đã giao quà'):tr('⏳ Chờ nhận tại trạm')}</span>{collector&&!r.done&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(r.isCatalog||!address||!account){fulfillCatalog(r.id);return;}await pickupWrite(address,account,'fulfillRedemption',[BigInt(r.id)]);await reload();})}>{tr('Xác nhận đã giao quà')}</button>}</div>):<p>{tr('Chưa có biên nhận.')}</p>}</section>;
}
