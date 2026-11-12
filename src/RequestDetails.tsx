import { useState } from 'react';
import { ExternalLink, Copy } from 'lucide-react';
import type { Address } from 'viem';
import { materials, fmt, type RequestItem } from './model';
import { appConfiguration, chain, getContractAddress, publicClient, txUrl } from './chain';
import { abi } from './generated/abi';
import EvidenceImage from './EvidenceImage';
import { errorMessage } from './errors';

export default function RequestDetails({ request: r, account, demo, busy, run, copy }: {
  request: RequestItem; account?: Address; demo: boolean; busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>; copy: (text: string) => void;
}) {
  const [events, setEvents] = useState<{ name: string; hash: string; collector?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const material = materials[r.material];
  const code = `REC-${String(r.id).padStart(4, '0')}`;
  async function findTransactions() {
    setLoading(true); setMessage('');
    try {
      const address = getContractAddress(); if (!address) return;
      const latest = await publicClient.getBlockNumber();
      const start = latest > 3000n ? latest - 3000n : 0n;
      const found: { name: string; hash: string; collector?: string }[] = [];
      for (let from = start; from <= latest; from += 1000n) {
        const logs = await publicClient.getContractEvents({ address, abi, fromBlock: from, toBlock: from + 999n > latest ? latest : from + 999n });
        for (const log of logs) {
          const args = log.args as { id?: bigint; collector?: string };
          if (args.id === BigInt(r.id) && ['Submitted','Approved','Rejected'].includes(log.eventName)) {
            found.push({ name: log.eventName, hash: log.transactionHash, collector: args.collector });
          }
        }
      }
      setEvents(found);
      setMessage('Tra cứu trong 3.000 block gần nhất. Với giao dịch cũ hơn, mở lịch sử contract bên dưới.');
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setLoading(false); }
  }
  return <div className="request-detail">
    <div className="detail-code"><strong>{code}</strong><button className="secondary" onClick={()=>copy(code)}><Copy size={14}/>Sao chép mã</button></div>
    <dl className="detail-grid"><div><dt>Vật liệu</dt><dd>{material.name}</dd></div><div><dt>Ngày gửi</dt><dd>{new Date(r.createdAt).toLocaleString('vi-VN')}</dd></div><div><dt>Khối lượng dự kiến</dt><dd>{fmt(r.grams / 1000)} kg</dd></div><div><dt>Khối lượng thực nhận</dt><dd>{r.status === 'approved' ? `${fmt(r.verifiedGrams / 1000)} kg` : 'Chưa xác nhận'}</dd></div><div><dt>Người gửi</dt><dd className="full-address">{r.user}</dd></div><div><dt>ECO {r.status==='approved'?'đã nhận':'dự kiến'}</dt><dd>{r.status==='rejected'?'Không phát thưởng':`${fmt((r.status==='approved'?r.verifiedGrams:r.grams)*material.rate/1000)} ECO`}</dd></div></dl>
    <ol className="request-timeline"><li className="done"><strong>Đã gửi yêu cầu</strong><p>Thông tin vật liệu và mã băm ảnh đã được ghi nhận{demo?' trong demo':' trên chain'}.</p></li><li className={r.status==='approved'?'done':r.status==='rejected'?'rejected':'current'}><strong>{r.status==='approved'?'Điểm thu gom đã xác nhận':r.status==='rejected'?'Yêu cầu đã bị từ chối':'Chờ bàn giao và cân vật liệu'}</strong><p>{r.status==='pending'?'Mang vật liệu và mã yêu cầu đến điểm thu gom. Ví thu gom phải khác ví gửi.':r.status==='rejected'?'Yêu cầu này đã kết thúc và không được phát ECO. Liên hệ điểm thu gom để làm rõ.':'Khối lượng thực tế đã được xác nhận bởi ví có quyền thu gom.'}</p></li>{r.status!=='rejected'&&<li className={r.status==='approved'?'done':''}><strong>{r.status==='approved'?'ECO đã được cấp vào ví':'Nhận ECO sau khi được duyệt'}</strong><p>{r.status==='approved'?'Bạn có thể dùng số dư ECO để đổi quà.':'ECO dự kiến chưa phải số dư có thể sử dụng.'}</p></li>}</ol>
    <div className="handover-note"><strong>{appConfiguration.collectionName}</strong><p>{appConfiguration.collectionInstructions}</p><small>Đây là hướng dẫn bàn giao hiện tại của đơn vị tổ chức.</small></div>
    {!demo&&<><EvidenceImage key={r.evidenceHash} account={account} hash={r.evidenceHash} busy={busy} run={run}/><details className="chain-proof"><summary>Bằng chứng và lịch sử blockchain</summary><p className="hash-note">SHA-256: <code>{r.evidenceHash}</code></p><button className="secondary" disabled={loading} onClick={findTransactions}>{loading?'Đang tra cứu…':'Tra giao dịch gần đây'}</button>{events.map(e=><div className="event-proof" key={e.hash}><a href={txUrl(e.hash)} target="_blank" rel="noreferrer">{e.name==='Submitted'?'Giao dịch gửi':e.name==='Approved'?'Giao dịch xác nhận':'Giao dịch từ chối'} <ExternalLink size={12}/></a>{e.collector&&<small>Ví xử lý: {e.collector}</small>}</div>)}{message&&<p role="status" className="footnote">{message}</p>}{chain.id===43113&&<a href={`https://testnet.snowtrace.io/address/${getContractAddress()}`} target="_blank" rel="noreferrer">Mở lịch sử contract <ExternalLink size={12}/></a>}</details></>}
  </div>;
}
