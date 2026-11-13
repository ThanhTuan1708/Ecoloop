import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowDownLeft,ArrowUpRight,Copy,ExternalLink,History,QrCode,ScanLine,Send,Wallet,X,Fuel,Check} from 'lucide-react';
import type {Address,Hash} from 'viem';
import {tr,num,dateTime} from './settings';
import {txUrl} from './chain';
import {addressUrl,pickupVersion} from './pickupClient';
import {balances,cardHistory,fromWei,parsePayment,pay,paymentUri,toWei,type HistoryItem,type PaymentRequest,type Token} from './payments';
import {qrSvg,decodeQr,decodeQrFile} from './qr';
import {errorMessage} from './errors';
import './walletcard.css';

type Sheet=null|'receive'|'send'|'scan'|'history';
type Draft={to:string;token:Token;amount:string;note:string;locked:boolean};
const emptyDraft:Draft={to:'',token:'AVAX',amount:'',note:'',locked:false};
const same=(a?:string,b?:string)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const shortAddr=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;

/** "Card number" style: 0x + 40 hex digits in groups of four, on two lines. */
function cardNumber(address:string){const g=address.slice(2).match(/.{4}/g)||[];return [g.slice(0,5).join(' '),g.slice(5).join(' ')];}

export default function WalletCard({account,holder,compact,onConnect,onOpenFull}:{account?:Address;holder?:string;compact?:boolean;onConnect?:()=>void;onOpenFull?:()=>void}){
  const [eco,setEco]=useState<Address>();const [gasless,setGasless]=useState(false);
  const [bal,setBal]=useState<{avax:bigint;eco:bigint}>();
  const [sheet,setSheet]=useState<Sheet>(null);
  const [copied,setCopied]=useState(false);
  const refresh=async()=>{if(!account)return;try{setBal(await balances(account,eco));}catch{/* RPC hiccup: keep last */}};
  useEffect(()=>{let live=true;(async()=>{try{const c=await (await fetch('/api/config',{cache:'no-store'})).json();setGasless(!!c.gasless);if(c.pickupContract&&await pickupVersion(c.pickupContract)==='v3'&&live)setEco(c.pickupContract);}catch{/* offline */}})();return()=>{live=false;};},[]);
  useEffect(()=>{setBal(undefined);if(!account)return;refresh();const t=setInterval(()=>{if(!document.hidden)refresh();},15000);return()=>clearInterval(t);},[account,eco]);
  async function copy(){if(!account)return;try{await navigator.clipboard.writeText(account);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{/* user can select the text */}}

  const face=<div className={compact?'eco-card compact':'eco-card'} aria-label={tr('Thẻ ví EcoLoop')}>
    <div className="eco-card-top"><span className="eco-card-brand"><span>ecoloop<b>.</b></span><small>{tr('THẺ VÍ XANH')}</small></span><span className="eco-card-net">AVALANCHE · {/* network */}FUJI</span></div>
    <div className="eco-card-mid"><span className="eco-card-chip" aria-hidden="true"/><svg className="eco-card-wave" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></div>
    {account?<div className="eco-card-number">{cardNumber(account).map((l,i)=><span key={i}>{i===0?'0x ':''}{l}</span>)}</div>:<div className="eco-card-number empty">{tr('Chưa kết nối ví')}</div>}
    <div className="eco-card-bottom">
      <div><small>{tr('CHỦ THẺ')}</small><b>{account?(holder||tr('Ví của bạn')):'—'}</b></div>
      <div><small>AVAX</small><b>{bal?num(fromWei(bal.avax),4):'…'}</b></div>
      {eco&&<div><small>ECO</small><b>{bal?num(fromWei(bal.eco),2):'…'}</b></div>}
    </div>
  </div>;

  if(!account)return <div className="eco-card-wrap">{face}{onConnect&&<button type="button" className="primary eco-card-connect" onClick={onConnect}><Wallet size={16}/>{tr('Kết nối ví để dùng thẻ')}</button>}</div>;

  return <div className={compact?'eco-card-wrap compact':'eco-card-wrap'}>
    {face}
    <div className="eco-card-actions">
      {compact?<>
        <button type="button" onClick={copy}>{copied?<Check size={18}/>:<Copy size={18}/>}<span>{copied?tr('Đã chép'):tr('Sao chép')}</span></button>
        <button type="button" onClick={()=>setSheet('receive')}><QrCode size={18}/><span>{tr('Nhận')}</span></button>
        {onOpenFull&&<button type="button" onClick={onOpenFull}><Wallet size={18}/><span>{tr('Mở thẻ')}</span></button>}
      </>:<>
        <button type="button" onClick={()=>setSheet('receive')}><ArrowDownLeft size={18}/><span>{tr('Nhận')}</span></button>
        <button type="button" onClick={()=>setSheet('send')}><Send size={18}/><span>{tr('Chuyển')}</span></button>
        <button type="button" onClick={()=>setSheet('scan')}><ScanLine size={18}/><span>{tr('Quét QR trả tiền')}</span></button>
        <button type="button" onClick={()=>setSheet('history')}><History size={18}/><span>{tr('Lịch sử')}</span></button>
      </>}
    </div>
    {!compact&&<p className="eco-card-note">{gasless&&eco?<><Fuel size={13}/> {tr('Chuyển ECO miễn phí gas. Chuyển AVAX dùng phí mạng từ ví của bạn.')}</>:tr('Mọi giao dịch đều được ký trong ví của bạn và ghi trên Avalanche Fuji (testnet).')}</p>}
    {sheet&&<CardSheets sheet={sheet} setSheet={setSheet} account={account} eco={eco} gasless={gasless} bal={bal} onPaid={refresh} copy={copy} copied={copied}/>}
  </div>;
}

function Sheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
  return <div className="card-sheet-layer" role="dialog" aria-modal="true" aria-label={title}><div className="card-sheet-backdrop" onClick={onClose}/><div className="card-sheet"><div className="card-sheet-head"><h3>{title}</h3><button type="button" aria-label={tr('Đóng')} onClick={onClose}><X size={20}/></button></div><div className="card-sheet-body">{children}</div></div></div>;
}

function CardSheets({sheet,setSheet,account,eco,gasless,bal,onPaid,copy,copied}:{sheet:Exclude<Sheet,null>;setSheet:(s:Sheet)=>void;account:Address;eco?:Address;gasless:boolean;bal?:{avax:bigint;eco:bigint};onPaid:()=>Promise<void>|void;copy:()=>void;copied:boolean}){
  const [draft,setDraft]=useState<Draft>(emptyDraft);
  const close=()=>setSheet(null);
  if(sheet==='receive')return <Sheet title={tr('Nhận tiền · Tạo mã thu tiền')} onClose={close}><Receive account={account} eco={eco} copy={copy} copied={copied}/></Sheet>;
  if(sheet==='scan')return <Sheet title={tr('Quét mã QR để trả tiền')} onClose={close}><Scan eco={eco} onResult={req=>{setDraft({to:req.to,token:req.token,amount:req.amountWei!==undefined?String(fromWei(req.amountWei)):'',note:req.note||'',locked:req.amountWei!==undefined});setSheet('send');}}/></Sheet>;
  if(sheet==='history')return <Sheet title={tr('Lịch sử giao dịch của thẻ')} onClose={close}><HistoryList account={account}/></Sheet>;
  return <Sheet title={tr('Chuyển tiền')} onClose={close}><SendFlow account={account} eco={eco} gasless={gasless} bal={bal} initial={draft} onScan={()=>setSheet('scan')} onPaid={onPaid}/></Sheet>;
}

function Receive({account,eco,copy,copied}:{account:Address;eco?:Address;copy:()=>void;copied:boolean}){
  const [token,setToken]=useState<Token>('AVAX');const [amount,setAmount]=useState('');const [note,setNote]=useState('');const [linkCopied,setLinkCopied]=useState(false);
  let error='';let uri='';
  try{uri=paymentUri({to:account,token,amountWei:amount.trim()?toWei(amount):undefined,note:note.trim()||undefined},eco);}catch(e){error=e instanceof Error?tr(e.message):'';uri=paymentUri({to:account,token:'AVAX'});}
  const svg=useMemo(()=>qrSvg(uri,232),[uri]);
  return <div className="card-receive">
    <div className="card-qr" dangerouslySetInnerHTML={{__html:svg}}/>
    <p className="card-qr-caption">{amount.trim()&&!error?tr('Mã thu {amount} {token}. Người trả quét bằng EcoLoop hoặc ví Core.',{amount,token}):tr('Mã nhận {token} vào ví của bạn. Người trả quét bằng EcoLoop hoặc ví Core.',{token})}</p>
    <div className="card-seg" role="radiogroup" aria-label={tr('Loại tiền')}>{(['AVAX','ECO'] as Token[]).map(t=><button key={t} type="button" role="radio" aria-checked={token===t} disabled={t==='ECO'&&!eco} onClick={()=>setToken(t)}>{t}</button>)}</div>
    <label>{tr('Số tiền cần thu (không bắt buộc)')}<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.01"/></label>
    <label>{tr('Nội dung (không bắt buộc)')}<input value={note} maxLength={80} onChange={e=>setNote(e.target.value)} placeholder={tr('VD: Tiền thu gom lô #12')}/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="card-address"><code>{account}</code></div>
    <div className="card-row"><button type="button" className="secondary" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>}{tr('Sao chép địa chỉ')}</button><button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(uri);setLinkCopied(true);setTimeout(()=>setLinkCopied(false),1800);}catch{/* select manually */}}}>{linkCopied?<Check size={16}/>:<Copy size={16}/>}{tr('Sao chép link thanh toán')}</button></div>
    <p className="footnote">{tr('Chỉ gửi AVAX hoặc ECO trên mạng Avalanche Fuji (testnet) tới địa chỉ này.')}</p>
  </div>;
}

function SendFlow({account,eco,gasless,bal,initial,onScan,onPaid}:{account:Address;eco?:Address;gasless:boolean;bal?:{avax:bigint;eco:bigint};initial:Draft;onScan:()=>void;onPaid:()=>Promise<void>|void}){
  const [d,setD]=useState<Draft>(initial);const [step,setStep]=useState<'form'|'confirm'|'done'>(initial.locked&&initial.to?'confirm':'form');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [hash,setHash]=useState<Hash>();
  const [req,setReq]=useState<PaymentRequest&{amountWei:bigint}>();
  const available=d.token==='ECO'?bal?.eco:bal?.avax;
  function review(){
    setError('');
    try{
      const parsed=parsePayment(d.to.trim(),eco);
      const amountWei=toWei(d.amount);
      if(same(parsed.to,account))throw new Error('Không thể chuyển cho chính ví của bạn.');
      if(available!==undefined&&amountWei>available)throw new Error(d.token==='ECO'?'Số dư ECO không đủ.':'Số dư AVAX không đủ (cần chừa phí gas).');
      setReq({to:parsed.to,token:d.token,amountWei,note:d.note.trim()||undefined});setStep('confirm');
    }catch(e){setError(e instanceof Error?tr(e.message):tr('Kiểm tra lại thông tin.'));}
  }
  // A scanned request with a fixed amount goes straight to confirmation.
  useEffect(()=>{if(initial.locked&&initial.to)review();},[]);
  async function submit(){
    if(!req)return;setBusy(true);setError('');
    try{const h=await pay(account,req,eco,gasless);setHash(h);setStep('done');await onPaid();}
    catch(e){setError(tr(errorMessage(e)));}
    finally{setBusy(false);}
  }
  if(step==='done'&&req)return <div className="card-done"><Check size={34}/><h4>{tr('Đã chuyển {amount} {token}',{amount:num(fromWei(req.amountWei),6),token:req.token})}</h4><p>{tr('Tới {to}',{to:shortAddr(req.to)})}</p>{hash&&<a className="text-link" href={txUrl(hash)} target="_blank" rel="noreferrer">{tr('Xem giao dịch')}<ExternalLink size={13}/></a>}</div>;
  if(step==='confirm'&&req)return <div className="card-confirm">
    <p className="eyebrow">{tr('XÁC NHẬN CHUYỂN TIỀN')}</p>
    <div className="card-confirm-amount">{num(fromWei(req.amountWei),6)} <small>{req.token}</small></div>
    <dl>
      <dt>{tr('Người nhận')}</dt><dd><code>{req.to}</code></dd>
      {req.note&&<><dt>{tr('Nội dung')}</dt><dd>{req.note}</dd></>}
      <dt>{tr('Mạng')}</dt><dd>Avalanche Fuji (testnet)</dd>
      <dt>{tr('Phí gas')}</dt><dd>{req.token==='ECO'&&gasless?tr('Miễn phí (EcoLoop trả)'):tr('Trả bằng AVAX từ ví của bạn')}</dd>
    </dl>
    <p className="footnote">{tr('Giao dịch trên blockchain không hoàn tác được. Kiểm tra kỹ địa chỉ người nhận.')}</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="card-row"><button type="button" className="secondary" disabled={busy} onClick={()=>{setStep('form');setError('');}}>{tr('Sửa')}</button><button type="button" className="primary" disabled={busy} onClick={submit}>{busy?tr('Đang chờ ký trong ví…'):tr('Xác nhận & ký')}</button></div>
  </div>;
  return <form className="card-send" onSubmit={e=>{e.preventDefault();review();}}>
    <label>{tr('Người nhận (địa chỉ ví 0x…)')}<div className="card-input-row"><input value={d.to} required onChange={e=>setD({...d,to:e.target.value})} placeholder="0x…" spellCheck={false} autoComplete="off"/><button type="button" className="secondary" onClick={onScan} aria-label={tr('Quét mã QR')}><ScanLine size={17}/></button></div></label>
    <div className="card-seg" role="radiogroup" aria-label={tr('Loại tiền')}>{(['AVAX','ECO'] as Token[]).map(t=><button key={t} type="button" role="radio" aria-checked={d.token===t} disabled={(t==='ECO'&&!eco)||d.locked} onClick={()=>setD({...d,token:t})}>{t}</button>)}</div>
    <label>{tr('Số tiền')}<div className="card-input-row"><input inputMode="decimal" required readOnly={d.locked} value={d.amount} onChange={e=>setD({...d,amount:e.target.value})} placeholder="0.00"/>{!d.locked&&available!==undefined&&<button type="button" className="secondary" onClick={()=>setD({...d,amount:String(fromWei(d.token==='AVAX'?(available>2n*10n**15n?available-2n*10n**15n:0n):available))})}>{tr('Tối đa')}</button>}</div></label>
    <p className="footnote">{tr('Số dư: {amount} {token}',{amount:available!==undefined?num(fromWei(available),6):'…',token:d.token})}{d.locked?' · '+tr('số tiền theo yêu cầu thanh toán'):''}</p>
    <label>{tr('Nội dung (không bắt buộc)')}<input value={d.note} maxLength={80} onChange={e=>setD({...d,note:e.target.value})}/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="primary full-width"><ArrowUpRight size={17}/>{tr('Tiếp tục')}</button>
  </form>;
}

function Scan({eco,onResult}:{eco?:Address;onResult:(r:PaymentRequest)=>void}){
  const video=useRef<HTMLVideoElement>(null);const [error,setError]=useState('');const [camera,setCamera]=useState<'starting'|'on'|'off'>('starting');const [paste,setPaste]=useState('');
  const done=useRef(false);
  function accept(text:string){
    if(done.current)return;
    try{const r=parsePayment(text,eco);done.current=true;onResult(r);}catch(e){setError(e instanceof Error?tr(e.message):tr('Mã QR không hợp lệ.'));}
  }
  useEffect(()=>{
    let stream:MediaStream|undefined;let timer:number|undefined;let stopped=false;
    (async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('no camera');
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
        if(stopped){stream.getTracks().forEach(t=>t.stop());return;}
        const v=video.current!;v.srcObject=stream;await v.play();setCamera('on');
        const Detector=(window as unknown as {BarcodeDetector?:new(o:{formats:string[]})=>{detect:(s:HTMLVideoElement)=>Promise<{rawValue:string}[]>}}).BarcodeDetector;
        const detector=Detector?new Detector({formats:['qr_code']}):undefined;
        const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
        const tick=async()=>{
          if(stopped||done.current||!v.videoWidth)return;
          try{
            let text:string|undefined;
            if(detector)text=(await detector.detect(v))[0]?.rawValue;
            else{canvas.width=v.videoWidth;canvas.height=v.videoHeight;ctx.drawImage(v,0,0);text=await decodeQr(ctx.getImageData(0,0,canvas.width,canvas.height));}
            if(text)accept(text);
          }catch{/* keep scanning */}
        };
        timer=window.setInterval(tick,350);
      }catch{setCamera('off');}
    })();
    return()=>{stopped=true;if(timer)clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());};
  },[]);
  return <div className="card-scan">
    <div className="card-scan-view">{camera!=='off'?<video ref={video} playsInline muted/>:<p>{tr('Không mở được camera. Chọn ảnh có mã QR hoặc dán link thanh toán bên dưới.')}</p>}<span className="card-scan-frame" aria-hidden="true"/></div>
    <p className="footnote">{camera==='on'?tr('Đưa mã QR vào khung. Thanh toán chỉ được gửi sau khi bạn xác nhận.'):camera==='starting'?tr('Đang mở camera…'):''}</p>
    <label className="secondary card-file">{tr('Chọn ảnh có mã QR')}<input type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setError('');try{const t=await decodeQrFile(f);if(!t)throw new Error('Không tìm thấy mã QR trong ảnh.');accept(t);}catch(err){setError(err instanceof Error?tr(err.message):'');}}}/></label>
    <form className="card-input-row" onSubmit={e=>{e.preventDefault();setError('');accept(paste);}}><input value={paste} onChange={e=>setPaste(e.target.value)} placeholder={tr('Hoặc dán link ethereum:… / địa chỉ ví')} spellCheck={false}/><button className="secondary">{tr('Dùng')}</button></form>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}

function HistoryList({account}:{account:Address}){
  const [items,setItems]=useState<HistoryItem[]>();const [complete,setComplete]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{let live=true;cardHistory(account).then(r=>{if(live){setItems(r.items);setComplete(r.complete);}}).catch(e=>{if(live){setError(errorMessage(e));setItems([]);}});return()=>{live=false;};},[account]);
  const zero='0x0000000000000000000000000000000000000000';
  const label=(h:HistoryItem)=>{
    if(h.kind==='eco'){if(h.from===zero)return tr('Thưởng ECO');if(h.to===zero)return tr('Đổi quà bằng ECO');return h.direction==='in'?tr('Nhận ECO từ {a}',{a:shortAddr(h.from||'')}):tr('Chuyển ECO tới {a}',{a:shortAddr(h.to||'')});}
    if(h.kind==='lock')return tr('Khóa ký quỹ lô #{id}',{id:h.lot??''});
    if(h.kind==='paid')return tr('Nhận tiền bán lô #{id}',{id:h.lot??''});
    if(h.kind==='refund')return tr('Hoàn ký quỹ lô #{id}',{id:h.lot??''});
    if(h.kind==='deferred')return tr('Khoản chờ rút');
    return tr('Chuyển AVAX tới {a}',{a:shortAddr(h.to||'')});
  };
  if(items===undefined)return <p role="status">{tr('Đang tải lịch sử…')}</p>;
  return <div className="card-history">
    {error&&<p className="form-error">{tr(error)}</p>}
    {!items.length&&<p>{tr('Chưa có giao dịch nào của thẻ.')}</p>}
    <ul>{items.map(h=><li key={h.tx+h.kind+(h.index??'')}>
      <span className={h.direction==='in'?'card-h-icon in':'card-h-icon out'}>{h.direction==='in'?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</span>
      <div><strong>{label(h)}</strong><small>{h.time?dateTime(h.time*1000,{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):''} · <a href={txUrl(h.tx)} target="_blank" rel="noreferrer">{tr('Giao dịch')}</a></small></div>
      <b className={h.direction==='in'?'in':'out'}>{h.direction==='in'?'+':'−'}{num(fromWei(BigInt(h.amount)),6)} {h.kind==='eco'?'ECO':'AVAX'}</b>
    </li>)}</ul>
    {!complete&&<p className="footnote">{tr('Đang quét thêm các khối cũ, mở lại sau ít phút để thấy đủ.')}</p>}
    <a className="text-link" href={addressUrl(account)} target="_blank" rel="noreferrer">{tr('Xem toàn bộ trên Snowtrace (gồm AVAX nhận từ ví khác)')}<ExternalLink size={13}/></a>
  </div>;
}
