import {useEffect,useState} from 'react';
import {Network,ExternalLink,CheckCircle2,Loader2} from 'lucide-react';
import type {Address} from 'viem';
import {tr} from './settings';
import {errorMessage,txUrl} from './chain';
import {bridgeCertificate,icmStatus,loadIcmConfig,type IcmConfig,type IcmStatus} from './pickupClient';

/** Avalanche ICM status of one ECOREC certificate, with a send button for its holder. */
export function IcmBridgePanel({certificate,lotId,account,canSend}:{certificate:Address;lotId:number;account?:Address;canSend?:boolean}){
  const [cfg,setCfg]=useState<IcmConfig|null>();
  const [status,setStatus]=useState<IcmStatus>();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [hash,setHash]=useState<string>();
  useEffect(()=>{let live=true;loadIcmConfig().then(c=>{if(live)setCfg(c||null);});return()=>{live=false;};},[]);
  useEffect(()=>{
    if(!cfg)return;
    let live=true;
    const load=()=>icmStatus(cfg,certificate,lotId).then(s=>{if(live)setStatus(s);}).catch(()=>{});
    load();
    // While a message is in transit, poll the destination L1 until the ICM relayer delivers it.
    const timer=setInterval(()=>{if(status?.messageId&&!status.delivered)load();},15000);
    return()=>{live=false;clearInterval(timer);};
  },[cfg,certificate,lotId,hash,status?.messageId,status?.delivered]);
  if(!cfg||!status)return null;
  const l1=cfg.destination.name;
  if(!status.verified)return <p className="footnote">{tr('Chứng nhận P2P chưa qua trạm xác minh nên không gửi sang L1 kiểm toán ESG.')}</p>;
  const send=async()=>{
    if(!account)return;
    setBusy(true);setMessage('');
    try{const h=await bridgeCertificate(cfg,account,lotId);setHash(h);setMessage(tr('Đã gửi qua Avalanche ICM. Relayer sẽ chuyển sang {l1} trong khoảng một phút.',{l1}));}
    catch(e){setMessage(errorMessage(e));}
    finally{setBusy(false);}
  };
  return <div className="icm-panel">
    <strong><Network size={14}/> {tr('Avalanche ICM → {l1}',{l1})}</strong>
    {status.messageId
      ?<p>{status.delivered
        ?<><CheckCircle2 size={13}/> {tr('L1 kiểm toán đã nhận chứng nhận này.')}</>
        :status.delivered===false?<><Loader2 size={13} className="spin"/> {tr('Đang chờ relayer ICM chuyển tới L1 đích…')}</>:tr('Đã gửi qua ICM.')}
        {' '}<code title={status.messageId}>{status.messageId.slice(0,10)}…</code>
        {cfg.destination.explorer&&<> · <a className="text-link" href={`${cfg.destination.explorer}/address/${cfg.destination.bridge}`} target="_blank" rel="noreferrer">{tr('Xem bridge trên L1')}<ExternalLink size={11}/></a></>}
      </p>
      :canSend&&account
        ?<button type="button" className="secondary" disabled={busy} onClick={send}>{busy?tr('Đang gửi…'):tr('Gửi chứng nhận sang {l1}',{l1})}</button>
        :<p>{tr('Chưa gửi sang L1 kiểm toán.')}</p>}
    {hash&&<a className="text-link" href={txUrl(hash as `0x${string}`)} target="_blank" rel="noreferrer">{tr('Xem giao dịch gửi')}<ExternalLink size={11}/></a>}
    {message&&<p role="status" className="footnote">{message}</p>}
  </div>;
}
