import {useEffect,useState} from 'react';
import {ArrowRight,Check,Coins,Copy,Eye,EyeOff,Gift,Pencil,Plus,QrCode,Trash2} from 'lucide-react';
import {formatEther,parseEther,type Address} from 'viem';
import {publicClient} from './chain';
import {short} from './model';
import {tr,num as fmt} from './settings';
import {pickupAbi} from './generated/pickup';
import {householdWrite,pickupWrite} from './pickupClient';
import {ADMIN_WALLET} from './useWalletSession';
import {saveAdminCatalog,useAdminCatalog,redeemCustomRewardOnServer,type CustomRewardItem} from './adminCatalog';
import {qrSvg} from './qr';

interface RewardItem {id:number;name:string;cost:number;costAtomic:bigint;stock:number;active:boolean}
interface ReceiptItem {id:number;reward:number;owner:string;done:boolean}

const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();

const rewardArtwork=new Map([
  ['Coffee voucher',{image:'/rewards/coffee.webp',name:'Voucher cà phê',tone:'coffee'}],
  ['Canvas tote bag',{image:'/rewards/tote.webp',name:'Túi vải canvas',tone:'tote'}],
  ['Green shopping voucher',{image:'/rewards/shopping.webp',name:'Voucher mua sắm xanh',tone:'shopping'}],
]);

export function PickupRewards({
  balanceAtomic,
  gasless,
  admin,
  address,
  account,
  collector,
  busy,
  balance,
  run,
  onChange,
  onConnect,
  onDone,
}:{
  balanceAtomic:bigint;
  gasless:boolean;
  admin:boolean;
  address?:Address;
  account?:Address;
  collector:boolean;
  busy:boolean;
  balance:number;
  run:(f:()=>Promise<void>)=>Promise<void>;
  onChange:()=>Promise<void>;
  onConnect:()=>void;
  onDone:(message:string)=>void;
}){
  const [rewards,setRewards]=useState<RewardItem[]>([]);
  const [receipts,setReceipts]=useState<ReceiptItem[]>([]);
  const catalog=useAdminCatalog();
  const [editingRewardId,setEditingRewardId]=useState<number|null>(null);
  const [showHiddenRewards,setShowHiddenRewards]=useState(false);
  const [addingReward,setAddingReward]=useState(false);
  const [receiptFilter,setReceiptFilter]=useState<'all'|'pending'|'done'>('all');
  const [expandedQrReceiptId,setExpandedQrReceiptId]=useState<number|null>(null);
  const [copiedCodeId,setCopiedCodeId]=useState<number|null>(null);

  function voucherCodeFor(r:ReceiptItem){
    const prefix=r.reward===1?'CF':r.reward===2?'TB':r.reward===3?'SH':'VC';
    const ownerSuffix=(r.owner||'0x0000').slice(2,6).toUpperCase();
    return `ECO-${prefix}-${String(r.id).padStart(4,'0')}-${ownerSuffix}`;
  }

  async function reload(autoExpandLatest=false){
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
      if(autoExpandLatest&&list.length>0)setExpandedQrReceiptId(list[0].id);
    }catch{/* keep the last loaded list when RPC fails */}
  }
  useEffect(()=>{reload().catch(()=>{});},[address,account,balance,collector]);

  const customRewardItems:RewardItem[]=catalog.customRewards.map(c=>({
    id:c.id,
    name:c.name,
    cost:c.cost,
    costAtomic:parseEther(String(c.cost)),
    stock:c.stock,
    active:!c.hidden,
  }));

  const mergedRewards=[...rewards,...customRewardItems].map(r=>{
    const ov=catalog.rewardOverrides[r.id];
    if(!ov)return r;
    const nextCost=ov.cost!==undefined?ov.cost:r.cost;
    return {
      ...r,
      name:ov.name||r.name,
      cost:nextCost,
      costAtomic:parseEther(String(nextCost)),
      stock:ov.stock!==undefined?ov.stock:r.stock,
      active:ov.hidden!==undefined?!ov.hidden:r.active,
    };
  });

  const active=mergedRewards.filter(r=>r.active||(admin&&showHiddenRewards));
  const hiddenRewardsCount=mergedRewards.filter(r=>!r.active).length;
  const rewardName=(name:string)=>tr(rewardArtwork.get(name)?.name??name);
  const toneImage=(tone?:string,name?:string)=>{
    if(tone==='coffee')return {image:'/rewards/coffee.webp',tone:'coffee'};
    if(tone==='shopping')return {image:'/rewards/shopping.webp',tone:'shopping'};
    if(tone==='tote')return {image:'/rewards/tote.webp',tone:'tote'};
    return rewardArtwork.get(name||'');
  };
  const customReceiptsForUser:ReceiptItem[]=catalog.customReceipts.filter(r=>same(r.owner,account)||collector);
  const allReceipts=[...customReceiptsForUser,...receipts];
  const filteredReceipts=allReceipts.filter(r=>receiptFilter==='all'?true:receiptFilter==='pending'?!r.done:r.done);

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

    {admin&&(
      <section className="pickup-callout" aria-label={tr('Quản trị Kho quà tặng')}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
          <div>
            <strong>🛡️ {tr('Quản trị Kho quà — Thêm, Sửa, Xóa / Ẩn phần thưởng')}</strong>
            <p className="footnote">{tr('Chủ App có thể thêm quà mới, chỉnh sửa tên/giá ECO/số suất hoặc ẩn/xóa bất kỳ phần thưởng nào trên quầy.')}</p>
          </div>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            <button type="button" className="primary" onClick={()=>setAddingReward(v=>!v)}>
              <Plus size={15}/> {addingReward?tr('Đóng biểu mẫu'):tr('Thêm phần thưởng mới')}
            </button>
            <button type="button" className="secondary" onClick={()=>setShowHiddenRewards(v=>!v)}>
              {showHiddenRewards?<><EyeOff size={15}/> {tr('Ẩn quà đã xóa')}</>:<><Eye size={15}/> {tr('Hiện quà đã ẩn ({n})',{n:hiddenRewardsCount})}</>}
            </button>
          </div>
        </div>

        {addingReward&&(
          <form className="reward-admin" style={{marginTop:'12px'}} onSubmit={e=>{
            e.preventDefault();
            const f=new FormData(e.currentTarget);
            const form=e.currentTarget;
            const name=String(f.get('name')||'').trim();
            const costStr=String(f.get('cost')||'').replace(',','.');
            const stock=Number(f.get('stock'));
            const tone=(String(f.get('tone')||'tote') as 'coffee'|'tote'|'shopping');
            const syncOnChain=f.get('syncOnChain')==='on';
            if(!name||name.length>120){onDone(tr('Nhập tên phần thưởng (tối đa 120 ký tự).'));return;}
            if(!/^\d*\.?\d+$/.test(costStr)||Number(costStr)<=0){onDone(tr('Số ECO phải lớn hơn 0.'));return;}
            if(!Number.isInteger(stock)||stock<0){onDone(tr('Số suất phải là số nguyên không âm.'));return;}
            if(syncOnChain&&address&&account){
              void run(async()=>{
                await pickupWrite(address,account,'addReward',[name,parseEther(costStr),BigInt(stock)]);
                form.reset();
                setAddingReward(false);
                await reload();
                onDone(tr('Đã thêm phần thưởng mới lên Smart Contract.'));
              });
              return;
            }
            const nextId=Math.max(100,...mergedRewards.map(r=>r.id))+1;
            const newReward:CustomRewardItem={id:nextId,name,cost:Number(costStr),stock,tone,hidden:false};
            void saveAdminCatalog(prev=>({...prev,customRewards:[...prev.customRewards,newReward]}),account).then(()=>{
              form.reset();
              setAddingReward(false);
              onDone(tr('Đã thêm phần thưởng "{name}" lên quầy đổi quà.',{name}));
            }).catch(err=>onDone(err instanceof Error?err.message:tr('Chưa lưu được cấu hình quản trị.')));
          }}>
            <h4>{tr('Thêm phần thưởng mới (Quản trị)')}</h4>
            <div className="pickup-weights">
              <label>{tr('Tên phần thưởng')}<input name="name" required maxLength={120} placeholder={tr('VD: Voucher cà phê Highlands 50k')}/></label>
              <label>{tr('Giá đổi (ECO)')}<input name="cost" required inputMode="decimal" placeholder="100"/></label>
              <label>{tr('Số suất tồn kho')}<input name="stock" required type="number" min="0" step="1" placeholder="20"/></label>
              <label>{tr('Mẫu ảnh minh họa')}
                <select name="tone" defaultValue="coffee">
                  <option value="coffee">{tr('☕ Voucher cà phê')}</option>
                  <option value="tote">{tr('👜 Túi vải canvas')}</option>
                  <option value="shopping">{tr('🛒 Voucher mua sắm xanh')}</option>
                </select>
              </label>
            </div>
            {address&&account&&(
              <label className="checkbox" style={{marginBottom:'8px'}}>
                <input type="checkbox" name="syncOnChain"/>
                {tr('Ghi trực tiếp lên Smart Contract V4 (cần ký giao dịch)')}
              </label>
            )}
            <button type="submit" className="primary" disabled={busy}>{tr('Lưu & Thêm phần thưởng')}</button>
          </form>
        )}
      </section>
    )}

    {!address&&<p>{tr('Phần thưởng sẽ hiện khi contract thu gom V4 được kích hoạt.')}</p>}
    {address&&!active.length&&<p>{tr('Chưa có phần thưởng nào trên contract.')}</p>}
    {active.length>0&&<div className="reward-vouchers">{active.map(reward=>{
      const customItem=catalog.customRewards.find(c=>c.id===reward.id);
      const ov=catalog.rewardOverrides[reward.id];
      const art=toneImage(ov?.tone||customItem?.tone,reward.name);
      const unavailable=reward.stock===0||!reward.active;
      const shortfall=!!account&&balanceAtomic<reward.costAtomic;
      const isOnChainReward=rewards.some(r=>r.id===reward.id);

      return <article className="reward-voucher" key={reward.id} data-tone={art?.tone??'tote'} style={!reward.active?{opacity:0.55}:undefined}>
        <div className="reward-voucher-cover">
          {art?<img src={art.image} alt="" width={768} height={512}/>:<Gift size={48} aria-hidden="true"/>}
        </div>
        <div className="reward-voucher-body">
          {admin&&editingRewardId===reward.id?(
            <form onSubmit={e=>{
              e.preventDefault();
              const f=new FormData(e.currentTarget);
              const name=String(f.get('name')||'').trim();
              const cost=Number(String(f.get('cost')||reward.cost).replace(',','.'));
              const stock=Math.max(0,Math.round(Number(f.get('stock')??reward.stock)));
              const tone=(String(f.get('tone')||'tote') as 'coffee'|'tote'|'shopping');
              const syncChain=f.get('syncChain')==='on';
              if(!name||cost<=0)return;
              void saveAdminCatalog(prev=>{
                if(customItem){
                  return {...prev,customRewards:prev.customRewards.map(c=>c.id===reward.id?{...c,name,cost,stock,tone}:c)};
                }
                return {
                  ...prev,
                  rewardOverrides:{
                    ...prev.rewardOverrides,
                    [reward.id]:{...prev.rewardOverrides[reward.id],id:reward.id,name,cost,stock,tone},
                  },
                };
              },account).then(()=>{
                if(syncChain&&isOnChainReward&&address&&account){
                  void run(async()=>{
                    await pickupWrite(address,account,'configureReward',[BigInt(reward.id),parseEther(String(cost)),BigInt(stock),reward.active]);
                    await reload();
                  });
                }
                setEditingRewardId(null);
                onDone(tr('Đã cập nhật phần thưởng #{id}.',{id:reward.id}));
              }).catch(err=>onDone(err instanceof Error?err.message:tr('Chưa lưu được cấu hình quản trị.')));
            }}>
              <label>{tr('Tên phần thưởng')}<input name="name" defaultValue={rewardName(reward.name)} required/></label>
              <label>{tr('Giá (ECO)')}<input name="cost" type="number" step="1" min="1" defaultValue={reward.cost} required/></label>
              <label>{tr('Số suất')}<input name="stock" type="number" step="1" min="0" defaultValue={reward.stock} required/></label>
              <label>{tr('Ảnh minh họa')}
                <select name="tone" defaultValue={ov?.tone||customItem?.tone||art?.tone||'tote'}>
                  <option value="coffee">{tr('☕ Voucher cà phê')}</option>
                  <option value="tote">{tr('👜 Túi vải canvas')}</option>
                  <option value="shopping">{tr('🛒 Voucher mua sắm xanh')}</option>
                </select>
              </label>
              {isOnChainReward&&address&&account&&(
                <label className="checkbox">
                  <input type="checkbox" name="syncChain"/>
                  {tr('Đồng bộ giá & tồn kho lên Contract')}
                </label>
              )}
              <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
                <button type="submit" className="primary">{tr('Lưu')}</button>
                <button type="button" className="secondary" onClick={()=>setEditingRewardId(null)}>{tr('Hủy')}</button>
              </div>
            </form>
          ):(
            <>
              <h3>{rewardName(reward.name)} {!reward.active&&<small>({tr('Đã ẩn')})</small>}</h3>
              <div className="reward-voucher-meta">
                <strong>{fmt(reward.cost)} <small>ECO</small></strong>
                <span>{unavailable?tr('Hết lượt đổi'):tr('Còn {n} suất',{n:reward.stock})}</span>
              </div>
              {!admin&&(
                <button type="button" className="reward-voucher-action" disabled={busy||unavailable||shortfall} onClick={()=>{
                  if(!account){onConnect();return;}
                  if(!address)return;
                  void run(async()=>{
                    if(isOnChainReward){
                      await householdWrite(address,account,'redeemReward',[BigInt(reward.id)],gasless);
                      await onChange();
                      await reload(true);
                    }else{
                      await householdWrite(address,account,'transfer',[ADMIN_WALLET as Address,reward.costAtomic],gasless);
                      const created=await redeemCustomRewardOnServer(account,reward.id);
                      await onChange();
                      setExpandedQrReceiptId(created.id);
                    }
                    onDone(tr('🎉 Đã đổi quà thành công (-{cost} ECO). Mã QR Voucher & Mã Code nhận quà đã sẵn sàng bên dưới!',{cost:fmt(reward.cost)}));
                  });
                }}>{unavailable?tr('Hết lượt đổi'):shortfall?tr('Cần thêm {n} ECO',{n:formatEther(reward.costAtomic-balanceAtomic)}):tr('Đổi quà ngay')}<ArrowRight size={17} aria-hidden="true"/></button>
              )}
              {admin&&(
                <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>
                  <button type="button" className="secondary" onClick={()=>setEditingRewardId(reward.id)}>
                    <Pencil size={14}/> {tr('Sửa quà')}
                  </button>
                  <button type="button" className="secondary" onClick={()=>{
                    const nextHidden=reward.active;
                    void saveAdminCatalog(prev=>{
                      if(customItem&&nextHidden){
                        return {...prev,customRewards:prev.customRewards.filter(c=>c.id!==reward.id)};
                      }
                      return {
                        ...prev,
                        rewardOverrides:{
                          ...prev.rewardOverrides,
                          [reward.id]:{...prev.rewardOverrides[reward.id],id:reward.id,hidden:nextHidden},
                        },
                      };
                    },account).then(()=>{
                      onDone(nextHidden?tr('Đã xóa / ẩn phần thưởng khỏi quầy đổi quà.'):tr('Đã khôi phục hiển thị phần thưởng.'));
                    }).catch(err=>onDone(err instanceof Error?err.message:tr('Chưa lưu được cấu hình quản trị.')));
                  }}>
                    <Trash2 size={14}/> {reward.active?tr('Xóa / Ẩn'):tr('Khôi phục')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </article>;
    })}</div>}
    <section className="reward-receipts">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
        <h4>{tr('Biên nhận đổi quà ({n})',{n:filteredReceipts.length})}</h4>
        {admin&&(
          <div className="filter-tabs">
            <button type="button" aria-pressed={receiptFilter==='all'} onClick={()=>setReceiptFilter('all')}>{tr('Tất cả')}</button>
            <button type="button" aria-pressed={receiptFilter==='pending'} onClick={()=>setReceiptFilter('pending')}>{tr('Chờ giao quà')}</button>
            <button type="button" aria-pressed={receiptFilter==='done'} onClick={()=>setReceiptFilter('done')}>{tr('Đã giao quà')}</button>
          </div>
        )}
      </div>
      {filteredReceipts.length?filteredReceipts.map(r=>{
        const code=voucherCodeFor(r);
        const rName=rewardName(mergedRewards.find(x=>x.id===r.reward)?.name||'')||tr('Quà #{id}',{id:r.reward});
        const qrOpen=expandedQrReceiptId===r.id;
        const isCustomReceipt=catalog.customReceipts.some(c=>c.id===r.id);
        const qrPayload=`ECOLOOP-VOUCHER|CODE:${code}|RECEIPT:#${r.id}|REWARD:${rName}|OWNER:${r.owner}|STATUS:${r.done?'USED':'ACTIVE'}`;
        return (
          <div className="pickup-receipt" key={r.id} style={{display:'grid',gap:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
              <span>
                #{r.id} · <strong>{rName}</strong> · {tr('Mã Code:')} <code>{code}</code> {tr('· Ví nhận:')} <code>{short(r.owner)}</code> ·{' '}
                {r.done?tr('✅ Đã giao quà'):tr('⏳ Chờ nhận tại trạm')}
              </span>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                <button
                  type="button"
                  className="secondary"
                  onClick={()=>{
                    void navigator.clipboard?.writeText(code);
                    setCopiedCodeId(r.id);
                    setTimeout(()=>setCopiedCodeId(prev=>prev===r.id?null:prev),1800);
                  }}
                >
                  {copiedCodeId===r.id?<Check size={14}/>:<Copy size={14}/>}{' '}
                  {copiedCodeId===r.id?tr('Đã chép mã'):tr('Sao chép mã')}
                </button>
                <button
                  type="button"
                  className={qrOpen?'primary':'secondary'}
                  onClick={()=>setExpandedQrReceiptId(qrOpen?null:r.id)}
                >
                  <QrCode size={14}/> {qrOpen?tr('Ẩn Mã QR'):tr('Mã QR Nhận Quà')}
                </button>
                {collector&&!r.done&&(
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={()=>run(async()=>{
                      if(!address||!account)throw new Error(tr('Kết nối ví để xác nhận.'));
                      if(isCustomReceipt){
                        await saveAdminCatalog(prev=>({
                          ...prev,
                          customReceipts:prev.customReceipts.map(c=>c.id===r.id?{...c,done:true}:c),
                        }),account);
                      }else{
                        await pickupWrite(address,account,'fulfillRedemption',[BigInt(r.id)]);
                        await reload();
                      }
                      onDone(tr('Đã xác nhận giao quà cho mã {code}.',{code}));
                    })}
                  >
                    {tr('Xác nhận đã giao quà')}
                  </button>
                )}
              </div>
            </div>
            {qrOpen&&(
              <div style={{display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap',background:'rgba(16,185,129,0.07)',padding:'14px',borderRadius:'14px',border:'1px dashed rgba(16,185,129,0.4)'}}>
                <div
                  style={{background:'#fff',padding:'8px',borderRadius:'12px',lineHeight:0,boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}
                  dangerouslySetInnerHTML={{__html:qrSvg(qrPayload,164)}}
                />
                <div style={{flex:1,minWidth:'200px',display:'grid',gap:'6px'}}>
                  <span className="eyebrow">🎟️ {tr('PHIẾU VOUCHER ĐIỆN TỬ ECOLOOP')}</span>
                  <h4 style={{margin:0}}>{rName}</h4>
                  <div>
                    <span>{tr('Mã Code đổi quà:')} </span>
                    <code style={{fontSize:'1.08em',fontWeight:700,padding:'2px 8px',background:'rgba(16,185,129,0.15)',borderRadius:'6px'}}>{code}</code>
                  </div>
                  <div><span>{tr('Trạng thái phiếu:')} </span><strong>{r.done?tr('✅ Đã sử dụng / Đã nhận quà'):tr('🟢 Có hiệu lực — Sẵn sàng quét nhận quà')}</strong></div>
                  <p className="footnote" style={{margin:0}}>
                    {tr('Đưa mã QR hoặc đọc mã Code này cho nhân viên cửa hàng đối tác / trạm thu gom EcoLoop để nhận phần thưởng.')}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      }):<p>{tr('Chưa có biên nhận.')}</p>}
    </section>
  </section>;
}
