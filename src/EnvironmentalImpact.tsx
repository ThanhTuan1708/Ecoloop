import {Leaf,Droplets,Zap,TreePine,Globe2} from 'lucide-react';
import {materials} from './model';
import {tr,num as fmt,wt} from './settings';
import type {Lot} from './pickupClient';

// Standard LCA (Life Cycle Assessment) recycling savings per 1 kg of material:
// [Plastic (PET/HDPE), Paper/Cardboard, Metal (Al/Fe/Cu), Glass]
const CO2_PER_KG = [1.8, 1.2, 4.5, 0.35]; // kg CO2e avoided per kg recycled
const WATER_PER_KG = [22, 26, 40, 4];     // liters of water saved per kg recycled
const ENERGY_PER_KG = [5.7, 4.0, 14.0, 0.42]; // kWh of energy saved per kg recycled

export function calcEnvironmentalMetrics(lots: Lot[]) {
  const activeLots = lots.filter(l => l.status !== 5);
  const kgByMaterial = [0, 0, 0, 0];

  for (const lot of activeLots) {
    const grams = [3, 4].includes(lot.status) && lot.actual.some(x => x > 0) ? lot.actual : lot.estimated;
    for (let i = 0; i < 4; i++) {
      kgByMaterial[i] += (grams[i] || 0) / 1000;
    }
  }

  const totalKg = kgByMaterial.reduce((a, b) => a + b, 0);
  const co2Kg = kgByMaterial.reduce((sum, kg, i) => sum + kg * CO2_PER_KG[i], 0);
  const waterLiters = kgByMaterial.reduce((sum, kg, i) => sum + kg * WATER_PER_KG[i], 0);
  const energyKwh = kgByMaterial.reduce((sum, kg, i) => sum + kg * ENERGY_PER_KG[i], 0);
  // 1 mature tree absorbs ~21 kg CO2/year + paper pulp conservation impact
  const treesEquivalent = co2Kg / 15 + kgByMaterial[1] / 58;

  return {
    lotCount: activeLots.length,
    completedCount: activeLots.filter(l => l.status === 4).length,
    kgByMaterial,
    totalKg,
    co2Kg,
    waterLiters,
    energyKwh,
    treesEquivalent,
  };
}

export function EnvironmentalImpactBanner({
  lots,
  personal = false,
}:{
  lots: Lot[];
  personal?: boolean;
}) {
  const m = calcEnvironmentalMetrics(lots);

  return (
    <section
      className="pickup-history-panel"
      style={{marginBottom: '16px', background: 'linear-gradient(135deg, rgba(16,185,129,0.09), rgba(5,150,105,0.03))', border: '1px solid rgba(16,185,129,0.28)'}}
      aria-label={personal ? tr('Đóng góp Môi trường của bạn') : tr('Thống kê Tác động Môi trường Toàn Sàn EcoLoop')}
    >
      <div className="pickup-history-header">
        <div>
          <span className="eyebrow">
            <Globe2 size={14}/>{' '}
            {personal ? tr('HỒ SƠ TÁC ĐỘNG XANH CÁ NHÂN') : tr('CHỈ SỐ TÁC ĐỘNG MÔI TRƯỜNG & ESG TOÀN SÀN')}
          </span>
          <h3>
            🌱 {personal ? tr('Đóng góp Môi trường của bạn cùng EcoLoop') : tr('Thống kê Tác động Môi trường & Giảm phát thải CO₂')}
          </h3>
          <p>
            {personal
              ? tr('Quy đổi lượng phế liệu bạn đã đăng bán / thu gom thành lượng khí nhà kính CO₂ giảm phát thải, nước sạch và năng lượng tiết kiệm được.')
              : tr('Dữ liệu thực tế từ {n} lô phế liệu trên Avalanche Fuji ({kg} thu hồi tái chế), quy đổi theo hệ số Đánh giá Vòng đời Sản phẩm (LCA).', {
                  n: m.lotCount,
                  kg: wt(m.totalKg, 1),
                })}
          </p>
        </div>
      </div>

      <div className="history-kpis">
        <div className="history-kpi-card highlight">
          <span><Leaf size={14}/> {tr('🌍 Giảm phát thải CO₂')}</span>
          <strong>-{fmt(m.co2Kg, 1)} kg CO₂e</strong>
        </div>
        <div className="history-kpi-card">
          <span><TreePine size={14}/> {tr('🌳 Cây xanh tương đương')}</span>
          <strong>{fmt(m.treesEquivalent, 1)} {tr('cây/năm')}</strong>
        </div>
        <div className="history-kpi-card">
          <span><Droplets size={14}/> {tr('💧 Nước sạch tiết kiệm')}</span>
          <strong>{fmt(m.waterLiters, 0)} {tr('lít')}</strong>
        </div>
        <div className="history-kpi-card">
          <span><Zap size={14}/> {tr('⚡ Điện năng tiết kiệm')}</span>
          <strong>{fmt(m.energyKwh, 1)} kWh</strong>
        </div>
        <div className="history-kpi-card">
          <span>♻️ {tr('Tổng khối lượng tái sinh')}</span>
          <strong>{wt(m.totalKg, 1)}</strong>
        </div>
      </div>

      <div className="pickup-weights" style={{marginTop: '10px'}}>
        {materials.map((mat, i) => (
          <div key={mat.name} className="pickup-callout" style={{margin: 0, padding: '10px 12px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <strong>{mat.symbol} {tr(mat.name)}</strong>
              <b>{wt(m.kgByMaterial[i], 1)}</b>
            </div>
            <small className="footnote">
              -{fmt(m.kgByMaterial[i] * CO2_PER_KG[i], 1)} kg CO₂ · {fmt(m.kgByMaterial[i] * WATER_PER_KG[i], 0)} {tr('lít nước')}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
