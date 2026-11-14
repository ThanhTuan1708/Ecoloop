import {useEffect,useState,type ReactNode} from 'react';
import {Languages,Palette,Ruler,Bell,Wallet,Database,Info,Check,ExternalLink,RotateCcw,Trash2,Send} from 'lucide-react';
import {version} from '../package.json';
import {tr,num,wt,useSettings,useLayout,updateSettings,resetSettings,enableNotifications,notificationSupport,notify,systemLanguage,localDataKeys,localDataSize,clearLocalData,type Settings} from './settings';
import './settings.css';

const REPO='https://github.com/ThanhTuan1708/Ecoloop';

type Option<T extends string>={value:T;label:string;hint?:string};
function Segmented<T extends string>({label,value,options,onChange}:{label:string;value:T;options:Option<T>[];onChange:(v:T)=>void}){
  return <div className="set-segmented" role="radiogroup" aria-label={label}>{options.map(o=><button key={o.value} type="button" role="radio" aria-checked={value===o.value} onClick={()=>onChange(o.value)}>{value===o.value&&<Check size={14}/>}<span>{o.label}</span>{o.hint&&<small>{o.hint}</small>}</button>)}</div>;
}
function Toggle({checked,onChange,label,disabled}:{checked:boolean;onChange:(v:boolean)=>void;label:string;disabled?:boolean}){
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="set-switch" onClick={()=>onChange(!checked)}><span/></button>;
}
function Row({title,desc,children}:{title:string;desc?:string;children:ReactNode}){
  return <div className="set-row"><div className="set-row-text"><strong>{title}</strong>{desc&&<p>{desc}</p>}</div><div className="set-row-control">{children}</div></div>;
}
function Card({icon,title,children}:{icon:ReactNode;title:string;children:ReactNode}){
  return <section className="set-card"><h3>{icon}{title}</h3>{children}</section>;
}

export default function SettingsPanel({account,network,chainId,chainName,walletName}:{account?:string;network?:number;chainId:number;chainName:string;walletName?:string}){
  const s=useSettings();const layout=useLayout();
  const set=<K extends keyof Settings>(key:K)=>(value:Settings[K])=>updateSettings({[key]:value} as Partial<Settings>);
  const [permission,setPermission]=useState(notificationSupport());
  const [dataSize,setDataSize]=useState(0);const [dataKeys,setDataKeys]=useState(0);
  const [confirmClear,setConfirmClear]=useState(false);const [status,setStatus]=useState('');
  useEffect(()=>{setDataSize(localDataSize());setDataKeys(localDataKeys().length);},[status]);
  useEffect(()=>{if(!confirmClear)return;const t=setTimeout(()=>setConfirmClear(false),6000);return()=>clearTimeout(t);},[confirmClear]);

  async function toggleNotifications(on:boolean){
    if(!on){updateSettings({notifications:false});return;}
    const ok=await enableNotifications();setPermission(notificationSupport());
    setStatus(ok?tr('Đã bật thông báo.'):tr('Trình duyệt đang chặn thông báo. Hãy cho phép thông báo cho trang này trong cài đặt trình duyệt.'));
  }
  function testNotification(){notify(tr('EcoLoop · Thông báo thử'),tr('Bạn sẽ nhận thông báo như thế này khi lô của bạn đổi trạng thái.'));setStatus(tr('Đã gửi thông báo thử.'));}
  function clearData(){
    if(!confirmClear){setConfirmClear(true);return;}
    clearLocalData();setConfirmClear(false);setStatus(tr('Đã xóa dữ liệu lưu trên máy. Đang tải lại…'));
    setTimeout(()=>location.reload(),700);
  }

  const kb=(n:number)=>n<1024?`${num(n,0)} B`:`${num(n/1024,1)} KB`;
  const sampleLocale=s.numberFormat==='vi'?'vi-VN':s.numberFormat==='en'?'en-US':undefined;
  const wrongNetwork=!!account&&network!==chainId;

  return <div className="set-panel-frame"><div className="set-panel">
    <div className="set-column">
      <Card icon={<Languages size={18}/>} title={tr('Ngôn ngữ')}>
        <Row title={tr('Ngôn ngữ hiển thị')} desc={tr('Áp dụng ngay cho toàn bộ ứng dụng, kể cả thông báo lỗi.')}>
          <Segmented label={tr('Ngôn ngữ hiển thị')} value={s.language} onChange={set('language')} options={[
            {value:'vi',label:'Tiếng Việt'},
            {value:'en',label:'English'},
            {value:'system',label:tr('Theo hệ thống'),hint:systemLanguage()==='vi'?'Tiếng Việt':'English'},
          ]}/>
        </Row>
      </Card>

      <Card icon={<Ruler size={18}/>} title={tr('Đơn vị & định dạng')}>
        <Row title={tr('Đơn vị khối lượng')} desc={tr('Chỉ đổi cách hiển thị. Ô nhập số cân và hợp đồng vẫn tính bằng kg.')}>
          <Segmented label={tr('Đơn vị khối lượng')} value={s.weightUnit} onChange={set('weightUnit')} options={[{value:'kg',label:'kg',hint:tr('Ki-lô-gam')},{value:'lb',label:'lb',hint:tr('Pound')}]}/>
        </Row>
        <Row title={tr('Định dạng số')} desc={tr('Ví dụ hiện tại: {sample}',{sample:wt(1234.5)})}>
          <Segmented label={tr('Định dạng số')} value={s.numberFormat} onChange={set('numberFormat')} options={[{value:'auto',label:tr('Theo ngôn ngữ')},{value:'vi',label:'1.234,5'},{value:'en',label:'1,234.5'}]}/>
        </Row>
        {sampleLocale&&<p className="set-note">{tr('Ngày giờ vẫn hiển thị theo ngôn ngữ đã chọn.')}</p>}
      </Card>

      <Card icon={<Bell size={18}/>} title={tr('Thông báo')}>
        <Row title={tr('Thông báo trình duyệt')} desc={tr('Báo khi lô bạn đăng hoặc nhận thu gom đổi trạng thái lúc bạn đang ở tab khác.')}>
          <Toggle label={tr('Thông báo trình duyệt')} checked={s.notifications&&permission==='granted'} disabled={permission==='unsupported'} onChange={on=>void toggleNotifications(on)}/>
        </Row>
        <p className="set-note">{permission==='unsupported'?tr('Trình duyệt này không hỗ trợ thông báo.'):permission==='denied'?tr('Thông báo đang bị chặn. Mở biểu tượng ổ khóa cạnh thanh địa chỉ để cho phép lại.'):permission==='granted'?tr('Trình duyệt đã cho phép thông báo.'):tr('Trình duyệt sẽ hỏi quyền khi bạn bật.')}</p>
        {s.notifications&&permission==='granted'&&<button type="button" className="secondary" onClick={testNotification}><Send size={15}/>{tr('Gửi thông báo thử')}</button>}
      </Card>

      <Card icon={<Info size={18}/>} title={tr('Giới thiệu')}>
        <dl className="set-facts">
          <dt>{tr('Phiên bản')}</dt><dd>EcoLoop {version}</dd>
          <dt>{tr('Mã nguồn')}</dt><dd><a href={REPO} target="_blank" rel="noreferrer">github.com/ThanhTuan1708/Ecoloop <ExternalLink size={13}/></a></dd>
          <dt>{tr('Hỗ trợ & góp ý')}</dt><dd><a href={`${REPO}/issues`} target="_blank" rel="noreferrer">{tr('Báo lỗi hoặc đề xuất tính năng')} <ExternalLink size={13}/></a></dd>
          <dt>{tr('Quyền riêng tư')}</dt><dd>{tr('Vị trí chính xác, số điện thoại và ảnh không được đưa lên blockchain.')}</dd>
        </dl>
      </Card>
    </div>

    <div className="set-column">
      <Card icon={<Palette size={18}/>} title={tr('Giao diện')}>
        <Row title={tr('Chủ đề')} desc={tr('Chế độ tối dễ nhìn hơn vào ban đêm và tiết kiệm pin màn hình OLED.')}>
          <Segmented label={tr('Chủ đề')} value={s.theme} onChange={set('theme')} options={[{value:'light',label:tr('Sáng')},{value:'dark',label:tr('Tối')},{value:'system',label:tr('Theo hệ thống')}]}/>
        </Row>
        <Row title={tr('Bố cục')} desc={tr('Tự động: điện thoại dùng giao diện điện thoại, máy tính dùng giao diện máy tính, đổi ngay khi xoay máy hoặc kéo cửa sổ. Đang dùng: {mode}.',{mode:layout==='mobile'?tr('Điện thoại'):tr('Máy tính')})}>
          <Segmented label={tr('Bố cục')} value={s.layout} onChange={set('layout')} options={[{value:'auto',label:tr('Tự động')},{value:'desktop',label:tr('Máy tính')},{value:'mobile',label:tr('Điện thoại')}]}/>
        </Row>
        <Row title={tr('Cỡ chữ')} desc={tr('Phóng to hoặc thu nhỏ chữ và nút bấm.')}>
          <Segmented label={tr('Cỡ chữ')} value={s.fontSize} onChange={set('fontSize')} options={[{value:'small',label:tr('Nhỏ')},{value:'medium',label:tr('Vừa')},{value:'large',label:tr('Lớn')},{value:'xlarge',label:tr('Rất lớn')}]}/>
        </Row>
        <Row title={tr('Giảm hiệu ứng chuyển động')} desc={tr('Tắt hoạt ảnh và cuộn mượt.')}>
          <Toggle label={tr('Giảm hiệu ứng chuyển động')} checked={s.reduceMotion} onChange={set('reduceMotion')}/>
        </Row>
      </Card>

      <Card icon={<Wallet size={18}/>} title={tr('Tài khoản & mạng')}>
        <dl className="set-facts">
          <dt>{tr('Ví đang dùng')}</dt><dd>{account?<><b>{walletName}</b> <code>{account}</code></>:tr('Chưa kết nối')}</dd>
          <dt>{tr('Mạng')}</dt><dd>{chainName} · Chain ID {chainId}{wrongNetwork&&<span className="set-badge warn">{tr('Ví đang ở mạng {id}',{id:String(network)})}</span>}</dd>
        </dl>
      </Card>

      <Card icon={<Database size={18}/>} title={tr('Dữ liệu & bộ nhớ')}>
        <Row title={tr('Dữ liệu lưu trên máy này')} desc={tr('{n} mục · {size}. Gồm ví đã chọn, giao dịch đang chờ và thiết lập hiển thị. Không ảnh hưởng dữ liệu trên blockchain.',{n:dataKeys,size:kb(dataSize)})}>
          <button type="button" className={confirmClear?'set-danger confirm':'set-danger'} onClick={clearData}><Trash2 size={15}/>{confirmClear?tr('Nhấn lần nữa để xóa'):tr('Xóa dữ liệu')}</button>
        </Row>
        <Row title={tr('Đặt lại thiết lập')} desc={tr('Đưa ngôn ngữ, giao diện, đơn vị và thông báo về mặc định.')}>
          <button type="button" className="secondary" onClick={()=>{resetSettings();setStatus(tr('Đã đặt lại thiết lập mặc định.'));}}><RotateCcw size={15}/>{tr('Đặt lại')}</button>
        </Row>
      </Card>
    </div>
    {status&&<p className="set-status" role="status">{status}</p>}
  </div></div>;
}
