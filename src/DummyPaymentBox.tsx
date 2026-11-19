import {useMemo,useState} from 'react';
import {CheckCircle2,QrCode,Wallet,Banknote,Plus,ArrowUpRight} from 'lucide-react';
import {qrSvg} from './qr';
import {short} from './model';
import {tr,num as fmt,dateTime} from './settings';
import {speakFeedback} from './voiceFeedback';
import {
  adjustDummyVndBalance,
  recordDummyLotPayment,
  useAdminCatalog,
  type DummyPaymentMethod,
} from './adminCatalog';

export function DummyLotPaymentCard({
  lotId,
  sellerWallet,
  collectorWallet,
  currentAccount,
  admin,
  sellerCash,
  collectorFee,
  appTotalProfit,
  ecoFormatted,
  onPaid,
}:{
  lotId: number;
  sellerWallet: string;
  collectorWallet: string;
  currentAccount?: string;
  admin: boolean;
  sellerCash: number;
  collectorFee: number;
  appTotalProfit: number;
  ecoFormatted: string;
  onPaid?: (msg: string) => void;
}) {
  const catalog = useAdminCatalog();
  const receipt = catalog.dummyPayments[lotId];
  const [method, setMethod] = useState<DummyPaymentMethod>('vietqr');
  const [bankName, setBankName] = useState('Vietcombank');
  const [processing, setProcessing] = useState(false);

  const qrPayload = useMemo(
    () => `VIETQR|BANK:${bankName}|ACC:999988886868|AMOUNT:${sellerCash}|MEMO:ECOLOOP LO #${lotId}|SELLER:${sellerWallet}`,
    [bankName, sellerCash, lotId, sellerWallet]
  );
  const svg = useMemo(() => qrSvg(qrPayload, 168), [qrPayload]);

  const methodLabel = (m: DummyPaymentMethod) =>
    m === 'vietqr'
      ? tr('🏦 Chuyển khoản VietQR ({bank})', {bank: bankName})
      : m === 'ecopay'
        ? tr('👛 Ví điện tử EcoPay (mô phỏng)')
        : tr('💵 Tiền mặt trao tay tại nhà');

  async function handleSimulatePay() {
    if (processing) return;
    const signer = currentAccount || collectorWallet || sellerWallet;
    if (!signer) return;
    setProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 450));
      const txCode = `ECOPAY-${lotId}-${String(Date.now()).slice(-6)}`;
      await recordDummyLotPayment(signer, {
        lotId,
        txCode,
        method,
        bankName,
        sellerWallet,
        collectorWallet: collectorWallet || currentAccount || sellerWallet,
        sellerCashVnd: sellerCash,
        collectorFeeVnd: collectorFee,
        appProfitVnd: appTotalProfit,
        paidAt: Date.now(),
      });
      speakFeedback('Đã hoàn tất thanh toán giả lập cho lô phế liệu.');
      onPaid?.(tr('🎉 Đã thanh toán giả lập thành công {vnd} ₫ (Mã GD: {tx})!', {vnd: fmt(sellerCash), tx: txCode}));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="pickup-callout" style={{marginTop: '12px', border: '1px solid rgba(16, 185, 129, 0.35)'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
        <strong>💳 {tr('Thanh toán tiền phế liệu (Giả lập Dummy EcoPay)')}</strong>
        <span className="web3-status-pill pill-green">
          {receipt ? tr('✅ ĐÃ THANH TOÁN VNĐ') : tr('⏳ CHỜ THANH TOÁN VNĐ')}
        </span>
      </div>

      {receipt ? (
        <div style={{marginTop: '10px', display: 'grid', gap: '6px'}}>
          <p className="pickup-success" style={{margin: 0}}>
            <CheckCircle2 size={18}/>{' '}
            {tr('Biên lai thanh toán giả lập đã xác nhận thành công!')}
          </p>
          <div className="web3-metadata-box" style={{marginTop: '4px'}}>
            <div><span>{tr('Mã giao dịch Dummy:')}</span> <code>{receipt.txCode}</code></div>
            <div><span>{tr('Phương thức:')}</span> <strong>{methodLabel(receipt.method)}</strong></div>
            <div><span>{tr('Thời gian thanh toán:')}</span> {dateTime(receipt.paidAt)}</div>
            <div><span>{tr('Người bán nhận tiền mặt:')}</span> <strong>+{fmt(receipt.sellerCashVnd)} ₫ (+{ecoFormatted} ECO)</strong></div>
            <div><span>{tr('Người thu gom nhận thù lao:')}</span> <strong>+{fmt(receipt.collectorFeeVnd)} ₫</strong></div>
            {admin && (
              <div><span>{tr('💎 Lợi nhuận Chủ App ghi nhận:')}</span> <strong>+{fmt(receipt.appProfitVnd)} ₫</strong></div>
            )}
          </div>
        </div>
      ) : (
        <div style={{marginTop: '10px', display: 'grid', gap: '10px'}}>
          <p className="footnote" style={{margin: 0}}>
            {tr('Chọn phương thức bên dưới để mô phỏng trả tiền thu mua phế liệu ngay trên ứng dụng (không tốn tiền thật):')}
          </p>
          <div className="filter-tabs">
            <button type="button" aria-pressed={method === 'vietqr'} onClick={() => setMethod('vietqr')}>
              <QrCode size={14}/> {tr('VietQR Ngân hàng')}
            </button>
            <button type="button" aria-pressed={method === 'ecopay'} onClick={() => setMethod('ecopay')}>
              <Wallet size={14}/> {tr('Ví EcoPay (mô phỏng)')}
            </button>
            <button type="button" aria-pressed={method === 'cash'} onClick={() => setMethod('cash')}>
              <Banknote size={14}/> {tr('Tiền mặt')}
            </button>
          </div>

          {method === 'vietqr' && (
            <div style={{display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(16,185,129,0.06)', padding: '10px', borderRadius: '12px'}}>
              <div style={{background: '#fff', padding: '6px', borderRadius: '10px', lineHeight: 0}} dangerouslySetInnerHTML={{__html: svg}}/>
              <div style={{flex: 1, minWidth: '180px', display: 'grid', gap: '6px'}}>
                <label>{tr('Ngân hàng thụ hưởng (Dummy)')}
                  <select value={bankName} onChange={e => setBankName(e.target.value)}>
                    <option value="Vietcombank">Vietcombank — 9999 8888 6868</option>
                    <option value="MB Bank">MB Bank — 0903 881 245</option>
                    <option value="Techcombank">Techcombank — 1903 6868 9999</option>
                    <option value="BIDV">BIDV — 3141 0001 8888</option>
                  </select>
                </label>
                <div><small>{tr('Người nhận:')}</small> <strong>{short(sellerWallet)}</strong></div>
                <div><small>{tr('Số tiền chuyển:')}</small> <strong>{fmt(sellerCash)} ₫</strong></div>
                <div><small>{tr('Nội dung:')}</small> <code>ECOLOOP LO #{lotId}</code></div>
              </div>
            </div>
          )}

          {method === 'ecopay' && (
            <div style={{background: 'rgba(16,185,129,0.06)', padding: '10px', borderRadius: '12px'}}>
              <strong>👛 {tr('Thanh toán 1 chạm qua Ví EcoPay (mô phỏng)')}</strong>
              <p className="footnote" style={{margin: '4px 0 0'}}>
                {tr('Hệ thống tự động trừ {vnd} ₫ từ vốn lưu động giả lập của Người thu gom, cộng ngay {vnd} ₫ vào ví Người bán và +{fee} ₫ thù lao chuyến đi.', {vnd: fmt(sellerCash), fee: fmt(collectorFee)})}
              </p>
            </div>
          )}

          {method === 'cash' && (
            <div style={{background: 'rgba(16,185,129,0.06)', padding: '10px', borderRadius: '12px'}}>
              <strong>💵 {tr('Xác nhận đã trả tiền mặt trực tiếp tại nhà')}</strong>
              <p className="footnote" style={{margin: '4px 0 0'}}>
                {tr('Người thu gom trao trực tiếp {vnd} ₫ tiền mặt cho chủ nhà và bấm nút xác nhận bên dưới để xuất biên lai điện tử.', {vnd: fmt(sellerCash)})}
              </p>
            </div>
          )}

          <button type="button" className="primary full-width" disabled={processing} onClick={() => void handleSimulatePay()}>
            {processing
              ? tr('Đang xử lý giao dịch giả lập…')
              : tr('⚡ Xác nhận Thanh toán Giả lập ({vnd} ₫)', {vnd: fmt(sellerCash)})}
          </button>
        </div>
      )}
    </div>
  );
}

export function DummyWalletWidget({account, role, admin}:{account?: string; role: 'seller'|'collector'; admin: boolean}) {
  const catalog = useAdminCatalog();
  const [notice, setNotice] = useState('');
  if (!account) return null;

  const key = account.toLowerCase();
  const defaultStart = admin ? 0 : role === 'collector' ? 2_000_000 : 200_000;
  const vndBalance = catalog.dummyVndBalances[key] ?? defaultStart;

  const myReceipts = Object.values(catalog.dummyPayments)
    .filter(r => admin || r.sellerWallet.toLowerCase() === key || r.collectorWallet.toLowerCase() === key)
    .sort((a, b) => b.paidAt - a.paidAt);

  return (
    <section className="pickup-callout" style={{marginTop: '14px'}} aria-label={tr('Ví Tiền Mặt VNĐ Giả Lập (EcoPay Dummy)')}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
        <div>
          <span className="eyebrow">{tr('ECOPAY SANDBOX · VÍ TIỀN MẶT GIẢ LẬP')}</span>
          <h3>💳 {tr('Số dư Ví VNĐ (Dummy): {vnd} ₫', {vnd: fmt(vndBalance)})}</h3>
          <p className="footnote">
            {admin
              ? tr('Tự động cộng dồn lợi nhuận ròng Chủ App từ các giao dịch thanh toán giả lập trên toàn sàn.')
              : role === 'collector'
                ? tr('Vốn lưu động giả lập để trả tiền mua phế liệu cho hộ dân và nhận thù lao vận chuyển.')
                : tr('Tiền bán phế liệu nhận được từ Người thu gom qua VietQR / Ví EcoPay giả lập.')}
          </p>
        </div>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          <button
            type="button"
            className="secondary"
            onClick={() => void adjustDummyVndBalance(account, 500_000, defaultStart).then(() => {
              setNotice(tr('✅ Đã nạp thêm +500.000 ₫ tiền giả lập vào ví EcoPay!'));
            })}
          >
            <Plus size={15}/> {tr('Nạp thử +500.000 ₫')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={vndBalance <= 0}
            onClick={() => void adjustDummyVndBalance(account, -Math.min(vndBalance, 200_000), defaultStart).then(() => {
              setNotice(tr('🏦 Đã rút giả lập 200.000 ₫ về tài khoản Ngân hàng thành công!'));
            })}
          >
            <ArrowUpRight size={15}/> {tr('Rút thử 200.000 ₫ về Ngân hàng')}
          </button>
        </div>
      </div>
      {notice && <p className="pickup-success" style={{marginTop: '8px'}}>{notice}</p>}
      {myReceipts.length > 0 && (
        <div style={{marginTop: '10px'}}>
          <strong>{tr('Biên lai thanh toán VNĐ giả lập gần đây ({n})', {n: myReceipts.length})}</strong>
          <div style={{display: 'grid', gap: '6px', marginTop: '6px'}}>
            {myReceipts.slice(0, 5).map(r => (
              <div key={r.txCode} className="pickup-receipt">
                <span>
                  <code>{r.txCode}</code> · {tr('Lô #{id}', {id: r.lotId})} ·{' '}
                  <strong>+{fmt(admin ? r.appProfitVnd : r.sellerWallet.toLowerCase() === key ? r.sellerCashVnd : r.collectorFeeVnd)} ₫</strong>{' '}
                  · <small>{dateTime(r.paidAt)}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
