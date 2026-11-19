import {useState} from 'react';
import {Coins,Download,Plus,Trash2,Users} from 'lucide-react';
import {formatEther,isAddress,keccak256,parseEther,stringToHex,type Address,type Hash} from 'viem';
import {materials,short} from './model';
import {tr,num as fmt,wt} from './settings';
import {lotStatuses,pickupWrite,type Lot} from './pickupClient';
import {fetchAdminAccountsWithSignature,saveAdminCatalog,useAdminCatalog} from './adminCatalog';
import {calcLotEconomics,pointsEco,totalKg} from './EcoEconomics';

export function AdminRevenueDashboard({lots}:{lots:Lot[]}){
  const catalog=useAdminCatalog();
  const activeLots=lots.filter(l=>l.status!==5);
  const rows=activeLots.map(l=>{
    const w=[3,4].includes(l.status)&&l.actual.some(x=>x>0)?l.actual:l.estimated;
    const kg=totalKg(w);
    const eco=pointsEco(w);
    const econ=calcLotEconomics(w);
    return {lot:l,kg,eco,...econ};
  });
  const totalGmv=rows.reduce((s,r)=>s+r.stationCash,0);
  const totalSellerCash=rows.reduce((s,r)=>s+r.sellerCash,0);
  const totalCollectorFee=rows.reduce((s,r)=>s+r.collectorFee,0);
  const totalAppCommission=rows.reduce((s,r)=>s+r.appCommission,0);
  const totalEprRevenue=rows.reduce((s,r)=>s+r.eprVnd,0);
  const totalAppProfit=rows.reduce((s,r)=>s+r.appTotalProfit,0);
  const totalVolumeKg=rows.reduce((s,r)=>s+r.kg,0);
  const appSharePct=100-(catalog.economics.collectorSharePct??60);

  function exportCsv(){
    const header=['Ma Lo','Khoi Luong (kg)','Trang Thai','Gia Nha May Bao Tieu (VND)','Tra Nguoi Ban (VND)','Thuong ECO','Cong Thu Gom (VND)','Chiet Khau San (VND)','Doanh Thu EPR NFT (VND)','Loi Nhuan Chu App (VND)'];
    const csvRows=rows.map(r=>[
      `#${r.lot.id}`,
      r.kg.toFixed(2),
      lotStatuses[r.lot.status]||'',
      r.stationCash,
      r.sellerCash,
      r.eco.toFixed(2),
      r.collectorFee,
      r.appCommission,
      r.eprVnd,
      r.appTotalProfit,
    ].join(','));
    const csvContent='\uFEFF'+[header.join(','),...csvRows].join('\n');
    const blob=new Blob([csvContent],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`ecoloop-doanh-thu-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="pickup-history-panel" aria-label={tr('Thống kê Doanh thu & Lợi nhuận Chủ App EcoLoop')}>
      <div className="pickup-history-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px',flexWrap:'wrap'}}>
        <div>
          <span className="eyebrow"><Coins size={14}/> {tr('BÁO CÁO QUẢN TRỊ DOANH THU & LỢI NHUẬN NỀN TẢNG')}</span>
          <h3>{tr('Thống kê Doanh thu & Lợi nhuận Chủ App EcoLoop')}</h3>
          <p>{tr('Tổng hợp dòng tiền từ chiết khấu điều phối phế liệu ({pct}% chênh lệch bao tiêu) và doanh thu bán Tín chỉ Tái chế EPR (B2B NFT) cho doanh nghiệp.',{pct:appSharePct})}</p>
        </div>
        <button type="button" className="secondary" onClick={exportCsv}>
          <Download size={15}/> {tr('Xuất báo cáo Excel (.CSV)')}
        </button>
      </div>

      <div className="history-kpis">
        <div className="history-kpi-card highlight">
          <span>{tr('💎 Tổng lợi nhuận ròng Chủ App')}</span>
          <strong>+{fmt(totalAppProfit)} ₫</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('💰 Chiết khấu điều phối Sàn')}</span>
          <strong>+{fmt(totalAppCommission)} ₫</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('🏅 Doanh thu Tín chỉ EPR (NFT)')}</span>
          <strong>+{fmt(totalEprRevenue)} ₫</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('🏭 Tổng giá trị qua Sàn (GMV)')}</span>
          <strong>{fmt(totalGmv)} ₫</strong>
        </div>
        <div className="history-kpi-card">
          <span>{tr('♻️ Tổng sản lượng & Tạo thu nhập')}</span>
          <strong>{wt(totalVolumeKg,1)} · {fmt(totalSellerCash+totalCollectorFee)} ₫</strong>
        </div>
      </div>

      {rows.length>0&&(
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>{tr('Mã lô & Khối lượng')}</th>
                <th>{tr('Giá Nhà máy bao tiêu')}</th>
                <th>{tr('Trả Người bán & Thù lao gom')}</th>
                <th>{tr('Chiết khấu Sàn ({pct}%)',{pct:appSharePct})}</th>
                <th>{tr('Doanh thu EPR NFT')}</th>
                <th>{tr('💎 Lợi nhuận Chủ App')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.lot.id} className="history-row">
                  <td>
                    <strong>#{r.lot.id} · {wt(r.kg,1)}</strong>
                    <div><small>{tr(lotStatuses[r.lot.status]||'')}</small></div>
                  </td>
                  <td><b>{fmt(r.stationCash)} ₫</b></td>
                  <td>
                    <div><small>{tr('Người bán:')}</small> <b>{fmt(r.sellerCash)} ₫</b> (+{fmt(r.eco)} ECO)</div>
                    <div><small>{tr('Công thu gom:')}</small> <b>+{fmt(r.collectorFee)} ₫</b></div>
                  </td>
                  <td><b>+{fmt(r.appCommission)} ₫</b></td>
                  <td><b>+{fmt(r.eprVnd)} ₫</b></td>
                  <td><strong className="history-eco">+{fmt(r.appTotalProfit)} ₫</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminEconomicsPanel({account,onDone}:{account?:Address;onDone:(msg:string)=>void}){
  const catalog=useAdminCatalog();
  const econ=catalog.economics;
  return (
    <form className="pickup-callout" onSubmit={e=>{
      e.preventDefault();
      const f=new FormData(e.currentTarget);
      const buyVnd=[0,1,2,3].map(i=>Math.max(0,Math.round(Number(f.get('buy'+i)||econ.buyVnd[i])))) as [number,number,number,number];
      const stationVnd=[0,1,2,3].map(i=>Math.max(0,Math.round(Number(f.get('station'+i)||econ.stationVnd[i])))) as [number,number,number,number];
      const collectorSharePct=Math.min(100,Math.max(0,Math.round(Number(f.get('collectorSharePct')||econ.collectorSharePct))));
      const eprVndPerKg=Math.max(0,Math.round(Number(f.get('eprVndPerKg')||econ.eprVndPerKg)));
      void saveAdminCatalog(prev=>({...prev,economics:{buyVnd,stationVnd,collectorSharePct,eprVndPerKg}}),account)
        .then(()=>onDone(tr('Đã cập nhật bảng giá thu mua VNĐ, giá bao tiêu nhà máy và tỷ lệ lợi nhuận Chủ App.')))
        .catch(err=>onDone(err instanceof Error?err.message:tr('Chưa lưu được cấu hình quản trị.')));
    }}>
      <h3>💵 {tr('Cấu hình Bảng giá Thu mua (VNĐ/kg) & Tỷ lệ Lợi nhuận Chủ App')}</h3>
      <p>{tr('Chỉnh sửa giá tiền mặt trả cho hộ dân, giá Nhà máy tái chế bao tiêu, phần trăm chia thù lao vận chuyển và đơn giá Tín chỉ EPR.')}</p>
      <div className="pickup-weights">
        {materials.map((m,i)=>(
          <label key={'buy'+m.name}>{tr('Giá mua {name} (₫/kg)',{name:tr(m.name)})}
            <input name={'buy'+i} type="number" min="0" step="100" defaultValue={econ.buyVnd[i]} key={'b'+econ.buyVnd[i]} required/>
          </label>
        ))}
      </div>
      <div className="pickup-weights">
        {materials.map((m,i)=>(
          <label key={'st'+m.name}>{tr('Giá Nhà máy bao tiêu {name} (₫/kg)',{name:tr(m.name)})}
            <input name={'station'+i} type="number" min="0" step="100" defaultValue={econ.stationVnd[i]} key={'s'+econ.stationVnd[i]} required/>
          </label>
        ))}
      </div>
      <div className="pickup-weights">
        <label>{tr('Tỷ lệ chia thù lao Người thu gom (%, phần còn lại về Chủ App)')}
          <input name="collectorSharePct" type="number" min="0" max="100" step="1" defaultValue={econ.collectorSharePct} key={'c'+econ.collectorSharePct} required/>
        </label>
        <label>{tr('Đơn giá Tín chỉ Tái chế EPR bán cho Doanh nghiệp (₫/kg)')}
          <input name="eprVndPerKg" type="number" min="0" step="50" defaultValue={econ.eprVndPerKg} key={'e'+econ.eprVndPerKg} required/>
        </label>
      </div>
      <button type="submit" className="secondary">{tr('Lưu bảng giá VNĐ & Tỷ lệ lợi nhuận')}</button>
    </form>
  );
}

export function AdminAccountsPanel({account,address,publicPickup,busy,run,refresh,setHash,onDone}:{account?:Address;address?:Address;publicPickup:boolean;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;setHash:(h:Hash)=>void;onDone:(msg:string)=>void}){
  const catalog=useAdminCatalog();
  const [newUsername,setNewUsername]=useState('');
  const [newWallet,setNewWallet]=useState('');
  const [newRole,setNewRole]=useState<'seller'|'collector'>('seller');
  const [roleTargetWallet,setRoleTargetWallet]=useState('');

  return (
    <section className="pickup-callout" aria-label={tr('Quản lý Tài khoản & Phân quyền Người dùng')}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
        <h3><Users size={18}/> {tr('Quản lý Tài khoản Người dùng & Phân quyền Ví')}</h3>
        {account&&(
          <button type="button" className="secondary" onClick={()=>void fetchAdminAccountsWithSignature(account).then(()=>onDone(tr('Đã tải danh sách tài khoản bảo mật từ máy chủ.')),err=>onDone(err instanceof Error?err.message:tr('Chưa đọc được danh sách tài khoản.')))}>
            {tr('Tải danh sách tài khoản (Ký xác thực Admin)')}
          </button>
        )}
      </div>
      <p>{tr('Xem danh sách tài khoản đã đăng ký, thêm/sửa vai trò (Người Bán / Người Thu Gom), khóa/mở khóa hoặc xóa tài khoản và cấp/thu hồi quyền trên Smart Contract.')}</p>

      <form style={{marginTop:'10px'}} onSubmit={e=>{
        e.preventDefault();
        const u=newUsername.trim();
        const w=newWallet.trim().toLowerCase();
        if(u.length<3||!isAddress(w)){onDone(tr('Nhập tên tài khoản (≥ 3 ký tự) và địa chỉ ví 0x hợp lệ.'));return;}
        void saveAdminCatalog(prev=>{
          const filtered=prev.accounts.filter(a=>a.username.toLowerCase()!==u.toLowerCase());
          return {...prev,accounts:[{username:u,address:w,role:newRole,blocked:false,createdAt:Date.now()},...filtered]};
        },account).then(()=>{
          setNewUsername('');setNewWallet('');
          onDone(tr('Đã thêm / cập nhật tài khoản người dùng.'));
        }).catch(err=>onDone(err instanceof Error?err.message:tr('Chưa lưu được cấu hình quản trị.')));
      }}>
        <div className="pickup-weights">
          <label>{tr('Tên tài khoản / SĐT / Email')}
            <input value={newUsername} onChange={e=>setNewUsername(e.target.value)} placeholder={tr('VD: nguyenvana')} required/>
          </label>
          <label>{tr('Địa chỉ ví (0x…)')}
            <input value={newWallet} onChange={e=>setNewWallet(e.target.value)} placeholder="0x…" required/>
          </label>
          <label>{tr('Vai trò')}
            <select value={newRole} onChange={e=>setNewRole(e.target.value as 'seller'|'collector')}>
              <option value="seller">{tr('🏠 Người Bán (Hộ gia đình)')}</option>
              <option value="collector">{tr('🚚 Người Thu Gom')}</option>
            </select>
          </label>
        </div>
        <button type="submit" className="secondary"><Plus size={15}/> {tr('Thêm / Lưu tài khoản')}</button>
      </form>

      {catalog.accounts.length>0&&(
        <div className="history-table-wrap" style={{marginTop:'12px'}}>
          <table className="history-table">
            <thead>
              <tr>
                <th>{tr('Tài khoản')}</th>
                <th>{tr('Địa chỉ ví')}</th>
                <th>{tr('Vai trò')}</th>
                <th>{tr('Trạng thái')}</th>
                <th>{tr('Thao tác Quản trị')}</th>
              </tr>
            </thead>
            <tbody>
              {catalog.accounts.map(acc=>(
                <tr key={acc.username} className="history-row">
                  <td><strong>{acc.username}</strong></td>
                  <td><code>{short(acc.address)}</code></td>
                  <td>{acc.role==='collector'?tr('🚚 Người Thu Gom'):tr('🏠 Người Bán')}</td>
                  <td>{acc.blocked?tr('🔒 Đã khóa'):tr('🟢 Hoạt động')}</td>
                  <td>
                    <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                      <button type="button" className="secondary" onClick={()=>void saveAdminCatalog(prev=>({
                        ...prev,
                        accounts:prev.accounts.map(a=>a.username===acc.username?{...a,role:a.role==='seller'?'collector':'seller'}:a),
                      }),account)}>
                        {tr('Đổi vai trò')}
                      </button>
                      <button type="button" className="secondary" onClick={()=>void saveAdminCatalog(prev=>({
                        ...prev,
                        accounts:prev.accounts.map(a=>a.username===acc.username?{...a,blocked:!a.blocked}:a),
                      }),account)}>
                        {acc.blocked?tr('Mở khóa'):tr('Khóa')}
                      </button>
                      <button type="button" className="secondary" onClick={()=>void saveAdminCatalog(prev=>({
                        ...prev,
                        accounts:prev.accounts.filter(a=>a.username!==acc.username),
                      }),account)}>
                        <Trash2 size={14}/> {tr('Xóa')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {address&&account&&(
        <div style={{marginTop:'14px',paddingTop:'12px',borderTop:'1px solid rgba(0,0,0,0.08)'}}>
          <h4>{tr('Cấp hoặc Thu hồi quyền trên Smart Contract V4')}</h4>
          <div style={{display:'flex',gap:'8px',alignItems:'flex-end',flexWrap:'wrap'}}>
            <label style={{flex:1}}>{publicPickup?tr('Địa chỉ ví giao quà / thu gom'):tr('Địa chỉ ví thu gom')}
              <input value={roleTargetWallet} onChange={e=>setRoleTargetWallet(e.target.value)} placeholder="0x…"/>
            </label>
            <button type="button" className="secondary" disabled={busy||!isAddress(roleTargetWallet.trim())} onClick={()=>void run(async()=>{
              const target=roleTargetWallet.trim() as Address;
              setHash(await pickupWrite(address,account,'grantRole',[keccak256(stringToHex('COLLECTOR_ROLE')),target]));
              await refresh();
              onDone(tr('Đã cấp quyền trên contract cho ví {w}.',{w:short(target)}));
            })}>{publicPickup?tr('Cấp quyền giao quà'):tr('Cấp quyền thu gom')}</button>
            <button type="button" className="secondary" disabled={busy||!isAddress(roleTargetWallet.trim())} onClick={()=>void run(async()=>{
              const target=roleTargetWallet.trim() as Address;
              setHash(await pickupWrite(address,account,'revokeRole',[keccak256(stringToHex('COLLECTOR_ROLE')),target]));
              await refresh();
              onDone(tr('Đã thu hồi quyền trên contract của ví {w}.',{w:short(target)}));
            })}>{tr('Thu hồi quyền')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function decimalAmount(input:string,maxLength:number){
  const value=input.trim().replace(',','.');
  return value.length<=maxLength&&/^\d+(?:\.\d{1,18})?$/.test(value)?parseEther(value):undefined;
}

export function ExchangeSettings({exchange,busy,submit}:{exchange:{rate:bigint;inventory:bigint};busy:boolean;submit:(fn:'setExchangeRate'|'fundExchange'|'withdrawExchangeProceeds',value:bigint)=>void}){
  return <div className="pickup-callout eco-exchange">
    <h3>{tr('Quầy đổi AVAX → ECO & Rút Doanh thu AVAX')}</h3>
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
    <form onSubmit={e=>{
      e.preventDefault();
      const avaxAmount=decimalAmount(String(new FormData(e.currentTarget).get('withdrawAvax')),36);
      if(avaxAmount!==undefined&&avaxAmount>0n)submit('withdrawExchangeProceeds',avaxAmount);
    }}>
      <label>{tr('Rút doanh thu AVAX từ Contract về ví Quản trị')}
        <input name="withdrawAvax" inputMode="decimal" maxLength={36} placeholder="0.05" required/>
      </label>
      <button className="secondary" disabled={busy}>{tr('Rút AVAX về ví Chủ App')}</button>
    </form>
  </div>;
}
