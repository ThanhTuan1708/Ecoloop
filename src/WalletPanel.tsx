import { useEffect, useState, useSyncExternalStore } from 'react';
import { Copy, ExternalLink, Wallet, Rocket, RefreshCw, CheckCircle2, LogOut, ArrowRight } from 'lucide-react';
import type { Address } from 'viem';
import { discoverWallets, subscribeWallets, walletSnapshot, connectWallet, disconnectWallet, getWalletName, switchNetwork, chain } from './wallet';
import { getContractAddress, saveContractAddress, deployFromWallet, getPending, settlePending, walletBalance, txUrl, importToken, hasSharedContract } from './chain';
import { fmt, short } from './model';

type Props = { account?: Address; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; connected: (a: Address) => Promise<void>; disconnected: () => void; notify: (text: string, hash?: string) => void; useDemo: () => void };
export default function WalletPanel({ account, busy, run, connected, disconnected, notify, useDemo }: Props) {
  const wallets = useSyncExternalStore(subscribeWallets, walletSnapshot);
  const [selected, setSelected] = useState('');
  const [balance, setBalance] = useState<number>();
  const [contractInput, setContractInput] = useState(() => new URLSearchParams(location.search).get('contract') || getContractAddress() || '');
  const [pending, setPending] = useState(getPending);
  const [address, setAddress] = useState(getContractAddress);
  const [deployConsent, setDeployConsent] = useState(false);
  const [organizer, setOrganizer] = useState(false);
  useEffect(() => { discoverWallets(); const update=()=>{setPending(getPending());setAddress(getContractAddress());};window.addEventListener('ecoloop:pending',update);return()=>window.removeEventListener('ecoloop:pending',update); }, []);
  useEffect(() => { if (!selected && wallets.length) setSelected((wallets.find(w => /core|avalanche/i.test(w.name + w.rdns)) || wallets[0]).id); }, [wallets, selected]);
  useEffect(() => { let active=true; setBalance(undefined);if(account) walletBalance(account).then(value=>{if(active)setBalance(value);}).catch(()=>{});return()=>{active=false;}; }, [account, pending]);
  async function refresh(a: Address) { setAddress(getContractAddress()); setContractInput(getContractAddress() || ''); await connected(a); }
  return <div className="wallet-panel">
    <div className="network-details"><span className="avax-large">▲</span><div><h3>{chain.name}</h3><p>Chain ID {chain.id} · {chain.id === 43113 ? 'AVAX testnet' : 'ETH local'}</p></div><span className="connection-state">{account ? 'Đã kết nối' : 'Chưa kết nối'}</span></div>
    {!account ? <>
      <h3 className="wallet-step">Kết nối Core Wallet</h3>
      <button className="secondary full-width" disabled={busy||!import.meta.env.VITE_THIRDWEB_CLIENT_ID} onClick={()=>run(async()=>{const {connectGoogle}=await import('./googleWallet');const a=await connectGoogle();await connected(a);notify('Đã đăng nhập Google và kết nối ví nhúng.');})}>Tiếp tục với Google{!import.meta.env.VITE_THIRDWEB_CLIENT_ID?' · Chưa cấu hình':''}</button>
      <p className="footnote">{!import.meta.env.VITE_THIRDWEB_CLIENT_ID?'Đăng nhập Google đang chờ Client ID của đơn vị tổ chức. Core vẫn hoạt động bình thường.':import.meta.env.VITE_SPONSOR_GAS==='true'?'Ví Google dùng tài trợ gas khi chính sách paymaster cho phép. Nếu bị từ chối, app sẽ báo lỗi, không tự chuyển sang trả phí.':'Ví Google tạo địa chỉ riêng; cần AVAX testnet để gửi giao dịch. Không tự chuyển ECO từ ví Core.'}</p>
      {hasSharedContract()&&<p className="muted">EcoLoop đã được cấu hình chung trên Fuji. Bạn chỉ cần kết nối ví, không cần triển khai hay nhập contract.</p>}
      {wallets.length ? <><label>Ví trên trình duyệt<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}>{wallets.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label><button className="primary full-width" disabled={busy || !selected} onClick={()=>run(async()=>{const a=await connectWallet(selected);await connected(a);notify('Đã kết nối ví và chuyển đúng mạng testnet.');})}><Wallet size={17}/>Kết nối ví đã chọn</button></> : <div className="wallet-missing"><Wallet size={30}/><strong>Chưa phát hiện tiện ích ví</strong><p>Mở địa chỉ app bằng Chrome hoặc Edge đã cài Core. Trình duyệt bên trong Codex thường không có tiện ích Core.</p><div className="wallet-links"><a href="https://core.app/" target="_blank" rel="noreferrer">Tải Core từ trang chính thức <ExternalLink size={13}/></a><button onClick={()=>{discoverWallets();notify('Đã quét lại tiện ích ví. Nếu vừa cài Core, hãy tải lại trang.');}}><RefreshCw size={13}/>Quét lại</button></div><button className="secondary full-width" onClick={()=>run(async()=>{await navigator.clipboard.writeText(location.origin + location.pathname + location.search);notify('Đã sao chép URL. Dán vào Chrome/Edge có Core.');})}><Copy size={14}/>Sao chép địa chỉ app</button></div>}
    </> : <>
      <div className="wallet-account"><div><strong>{getWalletName()}</strong><code>{account}</code><span>{balance===undefined?'Đang đọc số dư…':`${balance.toLocaleString('vi-VN',{maximumFractionDigits:6})} ${chain.nativeCurrency.symbol}`}</span></div><button className="icon-button" aria-label="Sao chép địa chỉ ví" onClick={()=>run(async()=>{await navigator.clipboard.writeText(account);notify('Đã sao chép địa chỉ ví.');})}><Copy size={17}/></button></div>
      <div className="wallet-links"><button disabled={busy} onClick={()=>run(async()=>{await switchNetwork();await connected(account);notify('Ví đã chuyển đúng mạng.');})}><RefreshCw size={13}/>Chuyển về {chain.id===43113?'Fuji':'Local'}</button>{chain.id===43113&&<a href="https://core.app/tools/testnet-faucet/" target="_blank" rel="noreferrer">Nạp AVAX testnet <ExternalLink size={13}/></a>}</div>
      {pending && <div className="pending-card"><strong>Giao dịch đang chờ xác nhận</strong><code>{pending.hash}</code><p>Không triển khai hoặc gửi lại. Kiểm tra giao dịch kể cả sau khi tải lại trang.</p><div className="wallet-links">{chain.id===43113&&<a href={txUrl(pending.hash)} target="_blank" rel="noreferrer">Xem explorer <ExternalLink size={12}/></a>}<button disabled={busy} onClick={()=>run(async()=>{const result=await settlePending();await refresh(account);notify('Giao dịch đã được xác nhận.',result.hash);})}>Kiểm tra giao dịch <ArrowRight size={13}/></button></div></div>}
      <div className="admin-divider"/>
      {address ? <>
        <h3 className="wallet-step"><CheckCircle2 size={17}/> Contract đã sẵn sàng</h3><code className="contract-address">{address}</code>
        <div className="wallet-links"><button disabled={busy} onClick={()=>run(async()=>{await importToken(account);notify('Đã gửi yêu cầu thêm ECO vào Core.');})}>Thêm ECO vào ví <Wallet size={13}/></button><button onClick={()=>run(async()=>{const url=new URL(location.href);url.searchParams.set('contract',address);url.searchParams.set('chain',String(chain.id));await navigator.clipboard.writeText(url.href);notify('Đã sao chép link app với contract. Gửi link này cho người dùng và điểm thu gom.');})}>Chia sẻ app <Copy size={13}/></button></div>
      </> : <>
        <p className="muted">Chưa có cấu hình chung. Người dùng nên liên hệ đơn vị tổ chức để nhận địa chỉ contract.</p><button className="secondary full-width" onClick={()=>setOrganizer(!organizer)}>{organizer?'Ẩn thiết lập tổ chức':'Tôi là người tổ chức · thiết lập ban đầu'}</button>
        {organizer&&<>
        <h3 className="wallet-step">2. Khởi tạo ứng dụng trên testnet</h3><p className="muted">Chỉ người tổ chức cần triển khai một lần. Core ký giao dịch tạo EcoLoop; ví triển khai nhận quyền quản trị và thu gom. Các ví khác dùng cùng địa chỉ contract.</p>
        <label className="checkbox deploy-consent"><input type="checkbox" checked={deployConsent} onChange={e=>setDeployConsent(e.target.checked)}/>Tạo contract mới và trả phí bằng AVAX testnet trong Core.</label>
        <button className="primary full-width" disabled={busy||!!pending||!deployConsent} onClick={()=>run(async()=>{const result=await deployFromWallet(account,hash=>notify('Đã gửi giao dịch triển khai. Đang chờ xác nhận…',hash));await refresh(account);notify('Contract EcoLoop đã triển khai thành công. App đã sẵn sàng.',result.hash);})}><Rocket size={16}/>Triển khai bằng ví</button>
        </>}
      </>}
      {!hasSharedContract()&&<details className="contract-import" open={!address}><summary>{address?'Đổi sang contract khác':'Dùng contract do đơn vị tổ chức cung cấp'}</summary><form onSubmit={e=>{e.preventDefault();run(async()=>{if(getPending())throw new Error('Cần xử lý giao dịch đang chờ trước khi đổi contract.');const saved=await saveContractAddress(contractInput.trim());setAddress(saved);await connected(account);notify('Đã kiểm tra và kết nối contract EcoLoop.');});}}><label>Địa chỉ EcoLoop trên {chain.name}<input placeholder="0x…" value={contractInput} onChange={e=>setContractInput(e.target.value)} required disabled={busy}/></label><button className="secondary full-width" disabled={busy||!!pending}>Kiểm tra & sử dụng contract <ArrowRight size={14}/></button></form></details>}
      <div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>run(async()=>{await disconnectWallet();disconnected();})}><LogOut size={14}/>Ngắt kết nối</button>{address&&<button className="primary" disabled={busy} onClick={()=>run(async()=>{await connected(account);notify('Đã tải dữ liệu từ contract.');})}>Vào ứng dụng <ArrowRight size={15}/></button>}</div>
    </>}
    <button className="demo-switch" disabled={busy} onClick={useDemo}>Khám phá bằng dữ liệu demo</button>
  </div>;
}

