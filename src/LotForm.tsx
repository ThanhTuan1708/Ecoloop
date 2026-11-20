import {lazy,Suspense,useRef,useState,type FormEvent} from 'react';
import {ArrowRight} from 'lucide-react';
import type {Hash} from 'viem';
import {materials} from './model';
import {tr,num as fmt,wt} from './settings';
import {digest} from './pickupClient';
import {ScrapPhotoSmartBox,ScrapQuickPresets} from './ScrapSmartEstimate';
import {totalKg as total,pointsEco as points,buyCashVnd} from './EcoEconomics';

const PickupMap=lazy(()=>import('./PickupMap'));

export function WeightInputs({values,onChange}:{values:string[];onChange:(v:string[])=>void}){return <div className="pickup-weights">{materials.map((m,i)=><label key={m.name}>{tr(m.name)} (kg)<input type="number" min="0" max="1000" step="0.001" required value={values[i]} onChange={e=>onChange(values.map((v,j)=>j===i?e.target.value:v))}/></label>)}</div>;}
export function LotForm({busy,center,onCreate}:{busy:boolean;center?:[number,number];onCreate:(weights:number[],file:File,evidence:Hash,point:[number,number],contact:string,address:string)=>void}){
  const [address,setAddress]=useState('');
  const lastSelectedAddress=useRef('');
  function selectAddress(label:string){
    const next=label.slice(0,400);
    const previousSelection=lastSelectedAddress.current;
    lastSelectedAddress.current=next;
    setAddress(previous=>!previous.trim()||previous===previousSelection?next:previous);
  }
  const [weights,setWeights]=useState(['0','0','0','0']);
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
    const [lat,lng]=point;
    if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180){
      setError(tr('Tọa độ bàn giao không hợp lệ. Chọn lại vị trí trên bản đồ hoặc nhập vĩ độ từ -90 đến 90 và kinh độ từ -180 đến 180.'));
      return;
    }
    setHashing(true);
    try{
      // A real photo of the lot is required: its SHA-256 is the on-chain evidence.
      if(!file){setError(tr('Chụp hoặc chọn ảnh thật của lô phế liệu.'));return;}
      if(file.size>4*1024*1024){setError(tr('Chọn ảnh tối đa 4 MB.'));return;}
      const hash=await digest(await file.arrayBuffer());
      onCreate(grams,file,hash,point,String(f.get('contact')||'').trim(),String(f.get('address')||'').trim());
    }catch{
      setError(tr('Lỗi xử lý ảnh. Hãy chọn lại.'));
    }finally{
      setHashing(false);
    }
  }
  return <form className="lot-form" onSubmit={submit}><h3>{tr('Một lô, nhiều loại vật liệu')}</h3><p>{tr('Ước lượng khối lượng từng loại. Ảnh minh họa cả lô; ECO cuối cùng tính theo kết quả cân thực tế.')}</p><label>{tr('Ảnh thật của cả lô (bắt buộc)')}<input type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setFile(e.target.files?.[0])}/></label><ScrapPhotoSmartBox file={file} onApplyWeights={setWeights}/><ScrapQuickPresets weights={weights} onChangeWeights={setWeights}/><WeightInputs values={weights} onChange={setWeights}/><div className="pickup-weights"><label>{tr('Số điện thoại / cách liên hệ')}<input name="contact" minLength={3} maxLength={120} required placeholder={tr("Người nhận việc sẽ dùng thông tin này")}/></label><label>{tr('Địa chỉ & thời gian bàn giao')}<input name="address" value={address} onChange={e=>setAddress(e.target.value)} minLength={5} maxLength={400} required placeholder={tr("Số nhà, đường, khung giờ thuận tiện")}/></label></div><p>{tr('Địa chỉ và liên hệ chỉ chia sẻ với chủ lô và người đã nhận việc.')} {tr('Ảnh được lưu riêng trên server local; không đưa ảnh hoặc số điện thoại lên blockchain.')}</p><h4>{tr('Vị trí bàn giao trên bản đồ (mặc định: {lat}, {lng})',{lat:point[0].toFixed(2),lng:point[1].toFixed(2)})}</h4><Suspense fallback={<p>{tr('Đang tải bản đồ…')}</p>}><PickupMap lots={[]} center={point} onPin={setPoint} onPlace={selectAddress}/></Suspense><div className="pickup-weights"><label>{tr('Vĩ độ')}<input type="number" step="any" min="-90" max="90" value={point?.[0]??''} onChange={e=>setPoint([Number(e.target.value),point?.[1]??106.69])}/></label><label>{tr('Kinh độ')}<input type="number" step="any" min="-180" max="180" value={point?.[1]??''} onChange={e=>setPoint([point?.[0]??10.78,Number(e.target.value)])}/></label></div><p className="footnote">{tr('Chỉ tọa độ làm tròn khoảng 1 km được ghi công khai, vĩnh viễn trên blockchain. Có thể nhập tọa độ nếu bản đồ không tải được.')}</p><div className="estimate"><span>{tr('Tổng dự kiến: {kg}',{kg:wt(total(weights.map(v=>Number(v)*1000)))})} · {tr('Tiền bán phế liệu ≈ {vnd} ₫',{vnd:fmt(buyCashVnd(weights.map(v=>Number(v)*1000)))})}</span><strong>+{fmt(points(weights.map(v=>Number(v)*1000)))} ECO</strong></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full-width" disabled={busy||hashing}>{hashing?tr('Đang đọc ảnh & tạo mã băm…'):tr('Ký hợp đồng & Đăng lô tìm người thu gom')}<ArrowRight size={17}/></button></form>;
}
