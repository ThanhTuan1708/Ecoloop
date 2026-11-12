import {useEffect,useRef,useState,type FormEvent} from 'react';
import {MapPin,Plus,RefreshCw,Navigation,ArrowRight,CheckCircle2,PackageCheck,ShieldCheck,Lock,Star,Coins,SlidersHorizontal,ChevronLeft,ChevronRight,Database,History,ClipboardList,Truck} from 'lucide-react';
import {isAddress,keccak256,stringToHex,type Address,type Hash} from 'viem';
import {chain, assertWallet} from './wallet';
import {errorMessage,txUrl,publicClient} from './chain';
import {materials,fmt,short} from './model';
import {viewEvidence} from './evidence';
import {pickupAbi} from './generated/pickup';
import {activatePickup,deployPickup,digest,distanceKm,pendingPickup,pickupDetails,pickupRead,pickupWrite,resumePickup,savePickupPhoto,DEMO_OWNER,DEMO_COLLECTOR,ZERO,type Lot} from './pickupClient';
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

export default function Pickup({account,demo=false,admin,onConnect,page='home',role='seller',createRequest=0,onSettings}:{account?:Address;demo?:boolean;admin:boolean;onConnect:()=>void;page?:'home'|'orders'|'wallet'|'rewards'|'settings';role?:'seller'|'collector';createRequest?:number;onSettings?:()=>void}){
  const [address,setAddress]=useState<Address>();const [onChainLots,setOnChainLots]=useState<Lot[]>([]);const [catalogLots,setCatalogLots]=useState<Lot[]>(()=>loadCatalogLots());const [includeCatalog,setIncludeCatalog]=useState(true);const [count,setCount]=useState(0);const [limit,setLimit]=useState(100);
  const [balance,setBalance]=useState(0);const [spentCatalogEco,setSpentCatalogEco]=useState(()=>loadCatalogRewardsState().spent);const [view,setView]=useState<'grid'|'map'>('grid');const [v2Admin,setV2Admin]=useState(false);const [loading,setLoading]=useState(true);const [category,setCategory]=useState(-1);const [query,setQuery]=useState('');const [collector,setCollector]=useState(false);const [paused,setPaused]=useState(false);
  const [selected,setSelected]=useState<number>();const [creating,setCreating]=useState(false);const [filter,setFilter]=useState('showcase');const [radius,setRadius]=useState(0);const [center,setCenter]=useState<[number,number]>();
  const [sort,setSort]=useState<SortOption>('newest');const [tokenFilter,setTokenFilter]=useState<string>('ALL');const [pageNum,setPageNum]=useState(1);const [pageSize,setPageSize]=useState(12);
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
    setMessage('Đã nạp lại 28 sản phẩm mẫu và phần thưởng trên sàn C2C Web3.');
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
      const actionName = fn==='claimLot' ? 'HỢP ĐỒNG NHẬN THU GOM & KHÓA KÝ QUỸ (ESCROW)'
        : fn==='proposeLot' ? 'BIÊN BẢN CÂN THỰC TẾ TẠI ĐIỂM BÀN GIAO'
        : fn==='acceptLot' ? 'CHẤP THUẬN KẾT QUẢ CÂN & GIẢI NGÂN ĐIỂM THƯỞNG ECO'
        : fn==='cancelLot' ? 'HỦY NIÊM YẾT LÔ PHẾ LIỆU'
        : 'TRẢ LẠI VIỆC THU GOM';
      
      const actionDetails = fn==='proposeLot' 
        ? `Khối lượng thực tế: ${(args[1] as bigint[]).map((w,i)=>Number(w)>0?`${materials[i].name}: ${(Number(w)/1000).toFixed(2)} kg`:null).filter(Boolean).join(' · ')}`
        : fn==='acceptLot'
        ? `Xác nhận giải ngân điểm thưởng ECO cho Lô #${id}`
        : `Người thu gom: ${account}`;

      try {
        signature = await wallet.signMessage({
          account,
          message: `[ECOLOOP WEB3 ESCROW - ${actionName}]
Mã lô hàng: #${id}
Ví thực hiện: ${account}
${actionDetails}
Thời gian: ${new Date().toLocaleString('vi-VN')}
Thỏa thuận được mã hóa và chứng thực mật mã bằng ví trên mạng Avalanche Fuji.`
        });
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.toLowerCase().includes('reject') || err?.message?.toLowerCase().includes('denied')) {
          throw new Error('Bạn đã từ chối ký hợp đồng trong ví. Thao tác đã bị hủy.');
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
      const sigMsg = signature ? ` · Đã ký số xác thực ví: ${short(signature)}` : '';
      setMessage(`🎉 Đã ký hợp đồng và cập nhật trạng thái lô #${id} thành công!${sigMsg}`);
      return;
    }
    if(!account){onConnect();return;}
    if(!address)throw new Error('Chưa kích hoạt thu gom.');
    setHash(await pickupWrite(address,account,fn,args));
    await refresh();if(fn==='claimLot')setFilter('assigned');setMessage('🎉 Đã ký và gửi giao dịch thu gom on-chain thành công lên mạng Fuji.');
  }
  function locate(){run(async()=>{if(!navigator.geolocation)throw new Error('Trình duyệt chưa hỗ trợ vị trí. Chọn khu vực trên bản đồ khi đăng lô.');const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:15000}));setCenter([p.coords.latitude,p.coords.longitude]);setSort('distance_asc');setMessage('Đã lấy vị trí để lọc khoảng cách. Không lưu vị trí vào hồ sơ hay blockchain; OpenStreetMap cung cấp nền bản đồ.');});}
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
          message: `[ECOLOOP WEB3 SMART ESCROW - CAM KẾT NIÊM YẾT LÔ PHẾ LIỆU]
Chủ lô: ${account}
Vật liệu: ${materials.map((m,i)=>weights[i]>0?`${m.name}: ${(weights[i]/1000).toFixed(2)} kg`:null).filter(Boolean).join(' · ')}
Tổng dự kiến: ${(total(weights)).toFixed(2)} kg
Địa chỉ bàn giao: ${location || 'TP. Hồ Chí Minh'}
Bằng chứng SHA-256: ${evidence}
Thời gian: ${new Date().toLocaleString('vi-VN')}
Tôi cam kết thông tin phân loại chính xác và đồng ý tham gia hợp đồng ký quỹ EcoLoop.`
        });
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.toLowerCase().includes('reject') || err?.message?.toLowerCase().includes('denied')) {
          throw new Error('Bạn đã từ chối ký hợp đồng niêm yết trong ví. Lô phế liệu chưa được tạo.');
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
      const sigMsg = ownerSignature ? ` · Chữ ký ví: ${short(ownerSignature)}` : '';
      setMessage(`🎉 Đã ký hợp đồng và đăng thành công Lô #${nextId}! Lô mới đã xuất hiện ở đầu danh sách.${sigMsg}`);

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
    if(pendingPickup())throw new Error('Kiểm tra giao dịch đang chờ trước khi đăng lô mới.');
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
    setMessage('🎉 Đã ký và gửi giao dịch tạo lô on-chain thành công lên mạng Fuji.');
  }
  return <section className={`pickup-workspace pickup-page-${page}`}><div className="pickup-page-title"><span className="eyebrow">ECOLOOP · SÀN C2C WEB3 AVALANCHE FUJI</span><h2>{({home:"Sàn phế liệu Web3 gần bạn",orders:"Đơn thu gom & Ký quỹ của bạn",wallet:"Ví xanh của bạn",rewards:"Đổi điểm, nhận điều xanh",settings:"Thiết lập hệ thống"})[page]}</h2><p>{page==='settings'?'Cấu hình contract dùng chung cho tất cả người dùng.':'Dữ liệu on-chain kết hợp IPFS/off-chain. Ký quỹ thông minh bảo vệ hai chiều.'}</p></div>
    {(page==='home'||page==='orders')&&<div className="pickup-intro"><div><span className="eyebrow">TỪ NHÀ BẠN ĐẾN MỘT VÒNG ĐỜI MỚI</span><h2>Thu gom tận nơi</h2><p>Gom nhiều vật liệu trong một lô. Khóa ký quỹ (Escrow), cân thực tế, hai bên xác nhận rồi giải ngân ECO.</p></div><button className="primary" disabled={busy||paused} onClick={()=>setCreating(!creating)}><Plus size={18}/>{creating?'Đóng biểu mẫu':'Đăng lô thu gom'}</button></div>}
    {(page==='home'||page==='orders')&&<div className="pickup-steps"><span><b>1</b> Đăng listing (Active)</span><span><b>2</b> Khóa ký quỹ (In Escrow)</span><span><b>3</b> Cân & đề xuất on-chain</span><span><b>4</b> Giải ngân (Sold)</span></div>}
    {demo&&<div className="pickup-callout"><strong>Demo mô phỏng · không gửi giao dịch</strong><p>Dùng hai vai trò dưới đây để thử đủ quy trình. Điểm demo không phải ECO trên Fuji.</p><div className="filter-tabs"><button className={demoRole==='owner'?'selected':''} onClick={()=>setDemoRole('owner')}>Chủ lô</button><button className={demoRole==='collector'?'selected':''} onClick={()=>setDemoRole('collector')}>Người thu gom</button></div></div>}
    {loading&&!lots.length&&<p role="status">Đang tải dữ liệu từ mạng…</p>}
    {!demo&&!address&&page==='settings'&&<div className="pickup-callout"><strong>Chờ kích hoạt contract thu gom V2</strong><p>Luồng nhiều vật liệu và xác nhận hai phía cần contract thu gom. Quản trị viên triển khai một lần rồi kích hoạt dùng chung. ECO cũ không tự chuyển sang contract mới.</p>{!account&&<button className="primary" onClick={onConnect}>Kết nối ví quản trị</button>}{account&&!admin&&<p>Ví này chưa có quyền quản trị trên hệ thống hiện tại. Hãy dùng ví đã triển khai EcoLoop.</p>}{admin&&account&&<><label className="checkbox"><input type="checkbox" checked={deployConsent} onChange={e=>setDeployConsent(e.target.checked)}/>Tạo contract V2 mới bằng AVAX testnet. ECO V2 được quản lý riêng với ECO cũ.</label><button className="primary" disabled={busy||!deployConsent||!!pendingPickup()} onClick={()=>run(async()=>{const a=await deployPickup(account);setImportAddress(a);setMessage('Đã triển khai. Nhấn kích hoạt dùng chung bên dưới để hoàn tất.');})}>Triển khai bằng ví quản trị</button><label>Địa chỉ V2 đã triển khai<input value={importAddress} onChange={e=>setImportAddress(e.target.value)} placeholder="0x…"/></label><button className="secondary" disabled={busy||!isAddress(importAddress)} onClick={()=>run(async()=>{await activatePickup(account,importAddress as Address);await refresh();setMessage('Đã kích hoạt contract chung cho Chrome và Edge.');})}>Kích hoạt dùng chung</button></>}</div>}
    {!demo&&pendingPickup()&&<div className="pickup-callout"><strong>Giao dịch đang chờ xác nhận</strong><code>{pendingPickup()}</code><button className="secondary" disabled={busy} onClick={()=>run(async()=>{const r=await resumePickup();if(r?.contractAddress){setImportAddress(r.contractAddress);localStorage.setItem(`ecoloop-pickup-deployed-${chain.id}`,r.contractAddress);}await refresh();setMessage('Đã kiểm tra giao dịch.');})}>Kiểm tra giao dịch</button></div>}
    {message&&<div className={failure?'pickup-feedback error':'pickup-feedback'} role={failure?'alert':'status'}>{message}</div>}
    {hash&&<a className="text-link" href={txUrl(hash)} target="_blank" rel="noreferrer">Xem giao dịch trên Fuji ↗</a>}
    {paused&&<p role="alert">Thu gom đang tạm dừng. Vẫn có thể hủy, yêu cầu cân lại hoặc trả việc.</p>}
    {(demo||address||includeCatalog)&&<>
      <div className="pickup-summary">
        <span><strong>{lots.length}</strong> tổng sản phẩm</span>
        <span><strong>{facets.ACTIVE}</strong> đang mở bán</span>
        <span><strong>{facets.IN_ESCROW}</strong> đang khóa ký quỹ</span>
        <span><strong>{facets.SOLD}</strong> đã bán hoàn tất</span>
        <span><strong>{fmt(effectiveBalance)}</strong> ECO khả dụng</span>
        {!demo&&<button type="button" className="text-link" onClick={()=>setIncludeCatalog(v=>!v)}><Database size={14}/>{includeCatalog?`Đang gộp 28 lô mẫu + ${onChainLots.length} on-chain`:`Chỉ hiện ${onChainLots.length} lô on-chain`}</button>}
        <button type="button" className="text-link" disabled={busy} onClick={resetCatalog}><RefreshCw size={14}/>Khôi phục 28 lô mẫu</button>
      </div>
      {creating&&(page==='home'||page==='orders')&&<LotForm busy={busy} demo={demo} center={center} onCreate={(...args)=>run(()=>create(...args))}/>}
      {!creating&&(page==='home'||page==='orders')&&<>
        <div className="pickup-toolbar">
          <label>Tìm sản phẩm / cửa hàng / khu vực<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="VD: đồng, nhôm, PET, carton, Quận 7, Thủ Đức, Hà Nội…"/></label>
          <label>Trạng thái Web3<select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="showcase">Kệ hàng (Đang bán & Ký quỹ · {facets.ACTIVE+facets.IN_ESCROW})</option>
            <option value="open">🟢 Đang mở bán (Active · {facets.ACTIVE})</option>
            <option value="escrow">🔒 Đang khóa ký quỹ (In Escrow · {facets.IN_ESCROW})</option>
            <option value="sold">⚪ Đã bán (Sold · {facets.SOLD})</option>
            <option value="cancelled">🔴 Đã hủy listing ({facets.CANCELLED})</option>
            <option value="all">Tất cả trạng thái ({lots.length})</option>
            <option value="mine">👤 Lô của tôi ({lots.filter(l=>same(l.owner,account||DEMO_OWNER)).length})</option>
            <option value="assigned">🚚 Việc tôi đã nhận ({lots.filter(l=>same(l.collector,account||DEMO_COLLECTOR)).length})</option>
          </select></label>
          <label>Token thanh toán<select value={tokenFilter} onChange={e=>setTokenFilter(e.target.value)}>
            <option value="ALL">Mọi Token (ECO · USDT · AVAX)</option>
            <option value="ECO">ECO Token (Fuji #43113)</option>
            <option value="USDT">USDT Equivalent</option>
            <option value="AVAX">AVAX Testnet</option>
          </select></label>
          <label>Bán kính gần đúng<select value={radius} onChange={e=>setRadius(Number(e.target.value))} disabled={!center}><option value={0}>Tất cả khu vực</option><option value={.5}>500 m</option><option value={1}>1 km</option><option value={2}>2 km</option><option value={5}>5 km</option><option value={15}>15 km</option><option value={50}>50 km</option></select></label>
          <button className="secondary" disabled={busy} onClick={locate}><Navigation size={16}/>Vị trí của tôi</button>
          <button className="text-link" onClick={()=>{setCenter([10.78,106.70]);setSort('distance_asc');setMessage('Đã đặt tâm bản đồ tại Quận 1, TP.HCM để sắp xếp khoảng cách.');}}>Tâm TP.HCM</button>
        </div>

        <div className="shopee-sort-bar" role="region" aria-label="Thanh sắp xếp và lọc kiểu Shopee">
          <div className="shopee-sort-left">
            <span className="shopee-sort-label"><SlidersHorizontal size={14}/> Sắp xếp theo</span>
            {([
              ['newest','Mới nhất'],
              ['popular','Phổ biến'],
              ['top_sales','Bán chạy'],
              ['distance_asc','Gần bạn'],
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
              aria-label="Sắp xếp theo giá"
              className={`shopee-price-select ${sort==='price_asc'||sort==='price_desc'?'active':''}`}
              value={sort==='price_asc'||sort==='price_desc'?sort:''}
              onChange={e=>{if(e.target.value)setSort(e.target.value as SortOption);}}
            >
              <option value="" disabled>Giá: Chọn thứ tự</option>
              <option value="price_asc">Giá: Thấp đến Cao</option>
              <option value="price_desc">Giá: Cao đến Thấp</option>
            </select>
          </div>
          <div className="shopee-sort-right">
            <span className="shopee-page-counter"><b>{pagination.currentPage}</b>/{pagination.totalPages}</span>
            <div className="shopee-page-nav">
              <button type="button" aria-label="Trang trước" disabled={pagination.currentPage<=1} onClick={()=>setPageNum(p=>Math.max(1,p-1))}><ChevronLeft size={15}/></button>
              <button type="button" aria-label="Trang sau" disabled={!pagination.hasNextPage} onClick={()=>setPageNum(p=>p+1)}><ChevronRight size={15}/></button>
            </div>
          </div>
        </div>

        <div className="pickup-view-controls">
          <div className="filter-tabs">{['Tất cả',...materials.map(m=>m.name)].map((name,i)=><button key={name} aria-pressed={category===i-1} onClick={()=>setCategory(i-1)}>{name}</button>)}</div>
          <div className="filter-tabs"><button aria-pressed={view==='grid'} onClick={()=>setView('grid')}>Dạng lưới ({pagination.totalItems})</button><button aria-pressed={view==='map'} onClick={()=>setView('map')}>Bản đồ ({visible.length})</button></div>
        </div>
        {view==='map'&&<PickupMap lots={visible} center={center} onSelect={setSelected}/>}
        <div className={`pickup-columns ${current?'has-selection':''}`}>
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
                      {card.uiState.statusLabelVi}
                    </span>
                    <span className="web3-chain-pill"><ShieldCheck size={11}/>Fuji #{card.lotId}</span>
                  </span>
                  {st==='SOLD'&&<span className="shopee-stamp stamp-sold">ĐÃ BÁN</span>}
                  {st==='IN_ESCROW'&&<span className="shopee-stamp stamp-escrow">ĐANG KÝ QUỸ</span>}
                  {st==='CANCELLED'&&<span className="shopee-stamp stamp-cancelled">ĐÃ HỦY</span>}
                  <span className="shopee-card-badges-bottom">
                    <span className="web3-ipfs-pill">IPFS · {card.category.name}</span>
                    <span className="web3-distance-pill">{fmt(card.totalKilograms)} kg</span>
                  </span>
                </span>
                <span className="lot-top">
                  <strong className="lot-card-title">{card.title}</strong>
                </span>
                <span className="lot-materials">
                  {card.materialTags.map(m=>`${m.symbol} ${m.name} ${fmt(m.kilograms)} kg`).join(' · ')}
                </span>
                <span className="shopee-price-row">
                  <b className="lot-eco"><Coins size={14}/> +{card.pricing.amountFormatted} {card.pricing.tokenSymbol}</b>
                  <small className="fiat-equiv">≈ {card.pricing.vndEquivalent.toLocaleString('vi-VN')} ₫</small>
                </span>
                <span className="shopee-rating-row">
                  <span className="star-badge"><Star size={11} fill="currentColor"/> {card.seller.reputationScore.toFixed(1)}</span>
                  <span className="sales-count">Đã bán {card.seller.completedSalesCount}</span>
                  {card.badges.isEscrowProtected&&<span className="escrow-tag">Escrow</span>}
                </span>
                <span className="shopee-location-row">
                  <span><MapPin size={12}/> {card.seller.location.distanceKm!==undefined
                    ?`Cách ~${fmt(card.seller.location.distanceKm)} km · ${card.seller.location.district}`
                    :`${card.seller.location.district}, ${card.seller.location.province}`}</span>
                </span>
                <small className="shopee-shop-row">{card.seller.displayName} · {short(card.onChain.sellerWallet)}</small>
                <span className={`lot-card-action action-${st.toLowerCase()}`}>
                  {card.uiState.ctaTextVi} ↗
                </span>
              </button>;
            })}
            {!cards.length&&<div className="pickup-empty"><PackageCheck size={30}/><h3>Chưa có lô phù hợp với bộ lọc hiện tại</h3><p>Nhấn nút bên dưới để xem toàn bộ kệ hàng 28 sản phẩm trên sàn hoặc khôi phục dữ liệu mẫu.</p><div className="shopee-pagination-controls"><button type="button" className="primary" onClick={()=>{setFilter('showcase');setCategory(-1);setQuery('');}}>Xem toàn bộ kệ hàng ({facets.ACTIVE+facets.IN_ESCROW} lô)</button><button type="button" className="secondary" onClick={resetCatalog}>Khôi phục 28 sản phẩm mẫu</button></div></div>}
            <div className="shopee-pagination-footer">
              <p className="footnote">Hiển thị {cards.length} / {pagination.totalItems} sản phẩm phù hợp · Trang {pagination.currentPage}/{pagination.totalPages} (Tổng kho: {lots.length} lô).</p>
              <div className="shopee-pagination-controls">
                {pagination.currentPage>1&&<button type="button" className="secondary" onClick={()=>setPageNum(p=>Math.max(1,p-1))}>← Trang trước</button>}
                {pagination.hasNextPage&&<button type="button" className="secondary" onClick={()=>setPageSize(s=>s+12)}>Xem thêm +12 sản phẩm</button>}
                {pagination.hasNextPage&&<button type="button" className="primary" onClick={()=>setPageNum(p=>p+1)}>Trang tiếp theo →</button>}
              </div>
            </div>
          </div>
          <div className="lot-detail">{current&&selectedCard?<><button className="text-link" onClick={()=>setSelected(undefined)}>Đóng chi tiết ×</button>
            <span className="eyebrow">BIÊN NHẬN WEB3 #{current.id} · {selectedCard.uiState.status}</span>
            <h3>{selectedCard.title}</h3>
            <img className="pickup-evidence" src={photo||selectedCard.thumbnail.previewUrl} alt={selectedCard.title}/>
            <p>{selectedCard.shortDescription}</p>
            <div className="web3-metadata-box">
              <div><span>Trạng thái Ký quỹ:</span> <strong>{selectedCard.uiState.statusLabelVi} — {selectedCard.uiState.subStatusLabelVi}</strong></div>
              <div><span>Cửa hàng / Chủ lô:</span> <strong>{selectedCard.seller.displayName}</strong> (<code>{short(current.owner)}</code>) · ★ {selectedCard.seller.reputationScore} ({selectedCard.seller.completedSalesCount} lô hoàn tất)</div>
              <div><span>Ví thu gom (Escrow):</span> <code>{current.collector===ZERO?'Chưa khóa ký quỹ':short(current.collector)}</code></div>
              <div><span>Khu vực bàn giao:</span> {selectedCard.seller.location.district}, {selectedCard.seller.location.province}</div>
              <div><span>Contract V2 (Chain {chain.id}):</span> <code>{address?short(address):'Fuji Escrowed Catalog'}</code></div>
              <div><span>IPFS CID / SHA-256:</span> <code>{selectedCard.thumbnail.gatewayUrl.slice(0,28)}…</code> · <code>{short(current.evidence)}</code></div>
              {selectedCard.onChain.escrowLockExpiresAt&&<div><span>Hạn bảo vệ ký quỹ:</span> {new Date(selectedCard.onChain.escrowLockExpiresAt).toLocaleString('vi-VN')}</div>}
            </div>
            {(() => {
              const meta = current ? getUserLotMeta(current.id, current.evidence) : undefined;
              const hasSig = meta?.ownerSignature || meta?.claimSignature || meta?.proposeSignature || meta?.acceptSignature;
              return hasSig ? (
                <div className="escrow-signatures-box">
                  <strong>✍️ HỢP ĐỒNG ĐÃ ĐƯỢC KÝ SỐ MẬT MÃ (EIP-191)</strong>
                  {meta?.ownerSignature && (
                    <div><span>Chữ ký Chủ lô:</span> <code>{short(meta.ownerSignature)} (Cam kết niêm yết)</code></div>
                  )}
                  {meta?.claimSignature && (
                    <div><span>Chữ ký Người gom:</span> <code>{short(meta.claimSignature)} (Khóa ký quỹ Escrow)</code></div>
                  )}
                  {meta?.proposeSignature && (
                    <div><span>Chữ ký Biên bản cân:</span> <code>{short(meta.proposeSignature)} (Chứng thực số cân)</code></div>
                  )}
                  {meta?.acceptSignature && (
                    <div><span>Chữ ký Giải ngân:</span> <code>{short(meta.acceptSignature)} (Tất toán hoàn tất)</code></div>
                  )}
                </div>
              ) : null;
            })()}
            <table><thead><tr><th>Vật liệu</th><th>Dự kiến</th><th>Thực tế</th></tr></thead><tbody>{materials.map((m,i)=><tr key={m.name}><td>{m.symbol} {m.name}</td><td>{fmt(current.estimated[i]/1000)} kg</td><td>{[3,4].includes(current.status)?`${fmt(current.actual[i]/1000)} kg`:'—'}</td></tr>)}</tbody></table>
            <p className="lot-points">
              <strong>+{selectedCard.pricing.amountFormatted} ECO</strong>
              <span> · ≈ {selectedCard.pricing.vndEquivalent.toLocaleString('vi-VN')} ₫ (${selectedCard.pricing.usdEquivalent.toFixed(2)} USD)</span>
            </p>
            <button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(selectedCard.contactPreview&&!isCurrentOnChain){setDetail(selectedCard.contactPreview);return;}if(demo){setDetail({contact:'Liên hệ mẫu · 0903 881 245',address:'Địa chỉ minh họa tại TP.HCM.'});return;}if(!account||!address){if(selectedCard.contactPreview){setDetail(selectedCard.contactPreview);return;}onConnect();return;}const v=detailVersion.current;const d=await pickupDetails(account,address,current);const p=await viewEvidence(account,current.evidence,address,current.id);if(v!==detailVersion.current){URL.revokeObjectURL(p);return;}setDetail(d);setPhoto(p);})}>Xem liên hệ & địa chỉ bàn giao</button>
            {detail&&<div className="pickup-callout"><strong>{detail.contact}</strong><p>{detail.address}</p></div>}
            {current.status===1&&<button className="primary full-width" disabled={busy||paused} onClick={()=>run(()=>change('claimLot',[BigInt(current.id)],2))}>Ký hợp đồng nhận thu gom & Khóa ký quỹ (Escrow) <ArrowRight size={16}/></button>}
            {current.status===1&&isOwner&&<button className="secondary" disabled={busy} onClick={()=>run(()=>change('cancelLot',[BigInt(current.id)],5))}>Hủy listing</button>}
            {current.status===2&&<form onSubmit={e=>{e.preventDefault();run(async()=>{const weights=actual.map(s=>Math.round(Number(s)*1000));if(weights.some(n=>!Number.isSafeInteger(n)||n<0)||total(weights)<=0||total(weights)>1000)throw new Error('Tổng khối lượng thực tế từ 0,001 đến 1.000 kg.');await change('proposeLot',[BigInt(current.id),weights.map(BigInt)],3);});}}><h4>Kết quả cân thực tế tại điểm bàn giao</h4><WeightInputs values={actual} onChange={setActual}/><p>Nhập số cân thực tế trên bàn cân điện tử để ký số và gửi đề xuất on-chain cho chủ lô xác nhận.</p><button className="primary" disabled={busy||paused}>Ký số & Gửi kết quả cân (Đề xuất Escrow)</button></form>}
            {current.status===3&&<><p>Kiểm tra bảng khối lượng thực tế trước khi xác nhận giải ngân. Đề xuất có hiệu lực 7 ngày.</p><label className="checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Tôi đã bàn giao vật liệu và đồng ý khối lượng thực tế trên.</label><button className="primary full-width" disabled={busy||paused||!consent||Date.now()>current.updatedAt+7*86400000} onClick={()=>run(()=>change('acceptLot',[BigInt(current.id)],4))}><CheckCircle2 size={16}/>Ký xác nhận bàn giao & Giải ngân ECO</button><button className="secondary" disabled={busy} onClick={()=>run(()=>change('disputeLot',[BigInt(current.id)],2))}>Chưa đồng ý · yêu cầu cân lại</button></>}
            {[2,3].includes(current.status)&&<button className="text-link" disabled={busy} onClick={()=>run(()=>change('releaseLot',[BigInt(current.id)],1))}>Trả lại việc thu gom (Mở lại listing Active)</button>}
            {current.status===4&&<p className="pickup-success"><CheckCircle2 size={18}/>Hai phía đã xác nhận. ECO đã được giải ngân cho chủ lô.</p>}
          </>:<div className="pickup-empty"><MapPin size={30}/><h3>Chọn một thẻ sản phẩm để xem</h3><p>Xem ảnh chụp thực tế tại bãi cân, dữ liệu on-chain/off-chain, nhận thu gom và thử luồng khóa ký quỹ tại đây.</p></div>}</div>
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
      {!demo&&address&&(admin||v2Admin)&&account&&page==='settings'&&<form className="pickup-callout" onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const value=String(fields.get('collector'));const action=fields.get('action')==='revoke'?'revokeRole':'grantRole';run(async()=>{if(!isAddress(value))throw new Error('Địa chỉ ví thu gom không hợp lệ.');setHash(await pickupWrite(address,account,action,[keccak256(stringToHex('COLLECTOR_ROLE')),value]));setMessage('Đã cập nhật quyền thu gom V2.');await refresh();});}}><h3>Quyền thu gom V2</h3><p>Quyền trên contract cũ không tự chuyển sang V2. Chỉ cấp cho điểm thu gom đã được xác minh.</p><label>Ví người thu gom<input name="collector" required placeholder="0x…"/></label><label>Thao tác<select name="action"><option value="grant">Cấp quyền nhận việc</option><option value="revoke">Thu hồi quyền</option></select></label><button className="secondary" disabled={busy}>Cập nhật quyền</button><button type="button" className="secondary" disabled={busy} onClick={()=>run(async()=>{setHash(await pickupWrite(address,account,'setPaused',[!paused]));await refresh();})}>{paused?'Mở lại thu gom':'Tạm dừng thu gom'}</button><p className="footnote">Contract V2: {address}</p></form>}
      {page==='wallet'&&<div className="pickup-callout wallet-live"><span>VÍ ĐIỂM THU GOM ECOLOOP</span><h2>{fmt(effectiveBalance)} ECO</h2><p>{account?`Ví đã kết nối: ${short(account)} · Bao gồm ${fmt(balance)} ECO on-chain và ${fmt(Math.max(0,catalogEarnedEco-spentCatalogEco))} ECO từ các lô hoàn tất trên sàn`:'Đang hiển thị số dư mẫu trên sàn. Kết nối ví để đồng bộ với địa chỉ của bạn.'}</p><code>{address||'0x01578d5d538db64a1ebef96920813e619060acc9'}</code><p>ECO là token thưởng khi hoàn tất bàn giao phế liệu qua hợp đồng ký quỹ (Escrow); dùng để đổi các phần thưởng xanh bên dưới.</p></div>}
      {(page==='rewards'||page==='wallet')&&<PickupRewards address={address} account={account} collector={collector||role==='collector'} busy={busy} balance={effectiveBalance} run={run} onChange={refresh} onSpendCatalog={cost=>{setSpentCatalogEco(s=>s+cost);setMessage(`Đã đổi quà thành công (-${fmt(cost)} ECO). Biên nhận đã được tạo!`);}}/>}
    </>}
    {busy&&<p role="status" className="pickup-busy">Đang xử lý… Kiểm tra cửa sổ ví nếu được yêu cầu ký. Không đóng trang khi gửi giao dịch.</p>}
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
  const totalEco=activeList.reduce((sum,c)=>sum+Number(c.pricing.amountFormatted.replace(/,/g,'')),0);
  const completedCount=activeList.filter(c=>c.uiState.status==='SOLD').length;
  const inProgressCount=activeList.filter(c=>c.uiState.status==='IN_ESCROW'||c.uiState.status==='ACTIVE').length;

  return (
    <section className="pickup-history-panel" aria-label="Lịch sử đã đăng lô và thu gom lô">
      <div className="pickup-history-header">
        <div>
          <span className="eyebrow"><History size={14}/> SỔ CÁI THEO DÕI ĐƠN HÀNG & KÝ QUỸ</span>
          <h3>Lịch sử đã đăng lô & Lịch sử thu gom lô</h3>
          <p>Theo dõi toàn bộ lô phế liệu đã đăng bán, các chuyến thu gom đã nhận việc, kết quả cân thực tế và điểm thưởng ECO giải ngân.</p>
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
            <span>Đã đăng lô</span>
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
            <span>Đã thu gom lô</span>
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
            <span>Lô mới & Vừa giao dịch</span>
            <b className="history-tab-badge">{recentCards.length}</b>
          </button>
        </div>
      </div>

      <div className="history-kpis">
        <div className="history-kpi-card">
          <span>{tab==='posted'?'Tổng lô đã đăng':tab==='collected'?'Tổng chuyến thu gom':'Số lô mới / vừa cập nhật'}</span>
          <strong>{activeList.length} lô</strong>
        </div>
        <div className="history-kpi-card">
          <span>Đang mở / Đang ký quỹ</span>
          <strong>{inProgressCount} lô</strong>
        </div>
        <div className="history-kpi-card">
          <span>Đã hoàn tất bàn giao</span>
          <strong>{completedCount} lô</strong>
        </div>
        <div className="history-kpi-card">
          <span>Tổng khối lượng</span>
          <strong>{fmt(totalKg)} kg</strong>
        </div>
        <div className="history-kpi-card highlight">
          <span>Tổng giá trị quy đổi</span>
          <strong>+{fmt(totalEco)} ECO</strong>
        </div>
      </div>

      {activeList.length===0?(
        <div className="pickup-empty">
          <PackageCheck size={28}/>
          <h4>Chưa có bản ghi nào trong mục này</h4>
          <p>Khi bạn đăng lô phế liệu mới hoặc nhận thu gom một lô trên sàn, lịch sử chi tiết sẽ xuất hiện ngay tại đây.</p>
        </div>
      ):(
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Mã lô & Phế liệu</th>
                <th>Vật liệu & Cân nặng</th>
                <th>{tab==='posted'?'Người thu gom (Escrow)':'Chủ lô & Người thu gom'}</th>
                <th>Điểm thưởng & Giá trị</th>
                <th>Trạng thái & Thời gian</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {activeList.map(card=>{
                const lot=lotMap.get(card.lotId);
                const estKg=lot?total(lot.estimated):card.totalKilograms;
                const actKg=lot&&lot.actual.some(w=>w>0)?total(lot.actual):null;
                const isNewUserLot=card.lotId>28;
                const updatedStr=lot?new Date(lot.updatedAt).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}):'Vừa xong';
                return (
                  <tr key={card.id} className={`history-row ${selected===card.lotId?'selected':''} ${isNewUserLot?'new-user-lot':''}`}>
                    <td>
                      <div className="history-lot-cell">
                        <img src={card.thumbnail.previewUrl} alt="" className="history-thumb" loading="lazy"/>
                        <div>
                          <div className="history-lot-badges">
                            <span className="history-id-pill">#{card.lotId}</span>
                            {isNewUserLot&&<span className="history-new-pill">MỚI ĐĂNG</span>}
                            <span className="history-cat-pill">{card.category.name}</span>
                          </div>
                          <strong className="history-lot-title">{card.title}</strong>
                          <small className="history-lot-loc"><MapPin size={11}/> {card.seller.location.district}, {card.seller.location.province}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="history-weight-cell">
                        <span>{card.materialTags.map(m=>`${m.symbol} ${m.name} ${fmt(m.kilograms)}kg`).join(' · ')}</span>
                        <small>
                          Dự kiến: <b>{fmt(estKg)} kg</b>
                          {actKg!==null?<> · Cân thực tế: <b className="actual-weight-highlight">{fmt(actKg)} kg</b></>:<> · Cân thực tế: <em>Chưa cân</em></>}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="history-wallet-cell">
                        <div><small>Chủ lô:</small> <code>{short(card.onChain.sellerWallet)}</code></div>
                        <div>
                          <small>Thu gom:</small>{' '}
                          {card.onChain.buyerWallet&&card.onChain.buyerWallet!==ZERO?(
                            <code>{short(card.onChain.buyerWallet)}</code>
                          ):(
                            <span className="unassigned-tag">Chưa có người nhận</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="history-price-cell">
                        <strong className="history-eco">+{card.pricing.amountFormatted} ECO</strong>
                        <small>≈ {card.pricing.vndEquivalent.toLocaleString('vi-VN')} ₫</small>
                      </div>
                    </td>
                    <td>
                      <div className="history-status-cell">
                        <span className={`web3-status-pill pill-${card.uiState.badgeColor}`}>
                          {card.uiState.statusLabelVi}
                        </span>
                        <small className="history-substatus">{card.uiState.subStatusLabelVi}</small>
                        <small className="history-time">Cập nhật: {updatedStr}</small>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={selected===card.lotId?'primary history-action-btn':'secondary history-action-btn'}
                        onClick={()=>onSelectLot(card.lotId)}
                      >
                        {selected===card.lotId?'Đang xem':'Xem & xử lý →'}
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
function WeightInputs({values,onChange}:{values:string[];onChange:(v:string[])=>void}){return <div className="pickup-weights">{materials.map((m,i)=><label key={m.name}>{m.name} (kg)<input type="number" min="0" max="1000" step="0.001" required value={values[i]} onChange={e=>onChange(values.map((v,j)=>j===i?e.target.value:v))}/></label>)}</div>;}
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
      setError('Nhập ít nhất một vật liệu (từ 0,001 đến 1.000 kg).');
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
      setError('Lỗi xử lý ảnh. Hãy chọn lại.');
    }finally{
      setHashing(false);
    }
  }
  return <form className="lot-form" onSubmit={submit}><h3>Một lô, nhiều loại vật liệu</h3><p>Ước lượng khối lượng từng loại. Ảnh minh họa cả lô; ECO cuối cùng tính theo kết quả cân thực tế.</p><WeightInputs values={weights} onChange={setWeights}/><label>Ảnh cả lô (nếu chưa có ảnh sẽ tự dùng ảnh mẫu)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0])}/></label><div className="pickup-weights"><label>Số điện thoại / cách liên hệ<input name="contact" minLength={3} maxLength={120} required defaultValue="Chủ nhà (0903 881 245)" placeholder="Người nhận việc sẽ dùng thông tin này"/></label><label>Địa chỉ & thời gian bàn giao<input name="address" minLength={5} maxLength={400} required defaultValue="Quận 7, TP. Hồ Chí Minh" placeholder="Số nhà, đường, khung giờ thuận tiện"/></label></div><p>Địa chỉ và liên hệ chỉ chia sẻ với chủ lô và người đã nhận việc. {demo?'Demo không gửi ảnh hay liên hệ lên server.':'Ảnh được lưu riêng trên server local; không đưa ảnh hoặc số điện thoại lên blockchain.'}</p><h4>Vị trí bàn giao trên bản đồ (mặc định: {point[0].toFixed(2)}, {point[1].toFixed(2)})</h4><PickupMap lots={[]} center={point} onPin={setPoint}/><div className="pickup-weights"><label>Vĩ độ<input type="number" step="any" min="-90" max="90" value={point?.[0]??''} onChange={e=>setPoint([Number(e.target.value),point?.[1]??106.69])}/></label><label>Kinh độ<input type="number" step="any" min="-180" max="180" value={point?.[1]??''} onChange={e=>setPoint([point?.[0]??10.78,Number(e.target.value)])}/></label></div><p className="footnote">Chỉ tọa độ làm tròn khoảng 1 km được ghi công khai, vĩnh viễn trên blockchain. Có thể nhập tọa độ nếu bản đồ không tải được.</p><div className="estimate"><span>Tổng dự kiến: {fmt(total(weights.map(v=>Number(v)*1000)))} kg</span><strong>+{fmt(points(weights.map(v=>Number(v)*1000)))} ECO</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full-width" disabled={busy||hashing}>{hashing?'Đang đọc ảnh & tạo mã băm…':'Ký hợp đồng & Đăng lô tìm người thu gom'}<ArrowRight size={17}/></button></form>;
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

  return <section className="pickup-callout"><h3>Đổi điểm ECO lấy quà tặng xanh ({rewards.filter(r=>r.active).length} phần thưởng)</h3><p>Sử dụng số dư ECO tích lũy từ các lô phế liệu đã hoàn tất để đổi voucher và sản phẩm thân thiện môi trường.</p><div className="pickup-reward-list">{rewards.filter(r=>r.active).map(r=><div key={r.id}><strong>{r.name}</strong><p>{fmt(r.cost)} ECO · còn {r.stock} suất</p><button className="secondary" disabled={busy||balance<r.cost||!r.stock} onClick={()=>run(async()=>{if(r.isCatalog||!address||!account){redeemCatalog(r);return;}await pickupWrite(address,account,'redeem',[BigInt(r.id)]);await onChange();await reload();})}>{balance<r.cost?`Cần thêm ${fmt(r.cost-balance)} ECO`:'Đổi quà ngay'}</button></div>)}</div><h4>Biên nhận đổi quà ({receipts.length})</h4>{receipts.length?receipts.map(r=><div className="pickup-receipt" key={r.id}><span>#{r.id} · <strong>{rewards.find(x=>x.id===r.reward)?.name||`Quà #${r.reward}`}</strong> · Ví nhận: <code>{short(r.owner)}</code> · {r.done?'✅ Đã giao quà':'⏳ Chờ nhận tại trạm'}</span>{collector&&!r.done&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>{if(r.isCatalog||!address||!account){fulfillCatalog(r.id);return;}await pickupWrite(address,account,'fulfillRedemption',[BigInt(r.id)]);await reload();})}>Xác nhận đã giao quà</button>}</div>):<p>Chưa có biên nhận.</p>}</section>;
}
