import {History,MapPin,PackageCheck} from 'lucide-react';
import {tr,num as fmt,wt,dateTime} from './settings';
import {short} from './model';
import {ZERO,type Lot} from './pickupClient';
import {totalKg as total} from './EcoEconomics';
import type {ShopeeWeb3ProductCard} from './marketplace';

/** History table of lots posted (seller) or collected (collector) by the connected wallet. */
export function PickupHistorySection({
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
                        {selected===card.lotId?tr('Đang xem'):lot?.status===4?tr('⭐ Đánh giá & Xem'):tr('Xem & xử lý →')}
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
