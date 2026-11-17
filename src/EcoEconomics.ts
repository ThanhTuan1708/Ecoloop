import {materials} from './model';
import {getAdminCatalog} from './adminCatalog';

export const totalKg=(weights:number[])=>weights.reduce((a,b)=>a+b,0)/1000;
export const pointsEco=(weights:number[])=>weights.reduce((a,b,i)=>a+b*materials[i].rate/1000,0);

export const buyCashVnd=(weights:number[])=>{
  const econ=getAdminCatalog().economics;
  return Math.round(weights.reduce((a,b,i)=>a+b*(econ.buyVnd[i]??materials[i]?.buyVnd??3500)/1000,0));
};

export const stationCashVnd=(weights:number[])=>{
  const econ=getAdminCatalog().economics;
  return Math.round(weights.reduce((a,b,i)=>a+b*(econ.stationVnd[i]??materials[i]?.stationVnd??4200)/1000,0));
};

export const eprCreditVnd=(weights:number[])=>{
  const econ=getAdminCatalog().economics;
  return Math.round(totalKg(weights)*(econ.eprVndPerKg??800));
};

export function calcLotEconomics(weights:number[]){
  const econ=getAdminCatalog().economics;
  const sellerCash=buyCashVnd(weights);
  const stationCash=stationCashVnd(weights);
  const spread=Math.max(0,stationCash-sellerCash);
  const sharePct=econ.collectorSharePct??60;
  const collectorFee=Math.round(spread*(sharePct/100));
  const appCommission=spread-collectorFee;
  const eprVnd=eprCreditVnd(weights);
  const appTotalProfit=appCommission+eprVnd;
  return {sellerCash,stationCash,collectorFee,appCommission,eprVnd,appTotalProfit,collectorSharePct:sharePct,appSharePct:100-sharePct};
}
