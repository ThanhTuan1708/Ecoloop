import {useState} from 'react';
import {formatEther,parseEther} from 'viem';
import {tr} from './settings';

export type EcoExchangeProps = {
  exchange?:{rate:bigint;inventory:bigint;sponsorPool?:bigint};
  busy:boolean;
  buy:(avax:bigint,minimumEco:bigint)=>void;
  needed?:bigint;
};

const avaxUnit=10n**18n;
function decimalAmount(input:string,maxLength:number){
  const value=input.trim().replace(',','.');
  return value.length<=maxLength&&/^\d+(?:\.\d{1,18})?$/.test(value)?parseEther(value):undefined;
}

export function EcoExchange({exchange,busy,buy,needed}:EcoExchangeProps){
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
