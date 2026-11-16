import {useEffect, useState} from 'react';
import {CalendarCheck, Target} from 'lucide-react';
import {formatEther, isAddressEqual, type Address, type Hash} from 'viem';
import {publicClient} from './chain';
import {rewardsAbi} from './generated/rewards';
import {pendingPickup, pickupWrite} from './pickupClient';
import {num, tr} from './settings';

const readStatus = (address: Address, user: Address) =>
  publicClient.readContract({address, abi: rewardsAbi, functionName: 'rewardStatus', args: [user]});
type Status = Awaited<ReturnType<typeof readStatus>>;

type Props = {
  pool?: Address;
  token?: Address;
  account?: Address;
  busy: boolean;
  onConnect: () => void;
  run: (action: () => Promise<void>) => Promise<void>;
  onClaim: (hash: Hash, amount: string) => Promise<void>;
};

export default function EarnEco({pool, token, account, busy, onConnect, run, onClaim}: Props) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!pool || !token || !account || busy) return;
    let active = true;
    let request = 0;
    const load = async () => {
      const id = ++request;
      try {
        const eco = await publicClient.readContract({address: pool, abi: rewardsAbi, functionName: 'eco'});
        if (!isAddressEqual(eco, token)) throw new Error('Rewards token mismatch');
        const next = await readStatus(pool, account);
        if (active && id === request) {
          setStatus(next);
          setError(false);
        }
      } catch {
        if (active && id === request) setError(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [pool, token, account, busy, revision]);

  function claim(amount: bigint, functionName: 'claimCheckIn' | 'claimMission', args: [bigint | number]) {
    if (!pool || !account) return;
    void run(async () => {
      const hash = await pickupWrite(pool, account, functionName, args, undefined, rewardsAbi);
      setStatus(undefined);
      await onClaim(hash, num(Number(formatEther(amount))));
    });
  }

  function claimLabel(claimed: boolean, eligible: boolean, amount: bigint, action: string) {
    if (claimed) return tr('Đã nhận ECO');
    if (!eligible) return tr('Chưa đạt mục tiêu');
    if (status?.paused) return tr('Đang tạm dừng');
    if (status && status.available < amount) return tr('Quỹ thưởng chưa đủ ECO');
    return action;
  }

  const disabled = busy || !!pendingPickup() || error || status?.paused;
  return <section className="pickup-callout" aria-labelledby="earn-eco-title">
    <h3 id="earn-eco-title">{tr('Kiếm thêm ECO')}</h3>
    <p>{tr('Điểm danh mỗi ngày và nhận thưởng khi đạt các mốc tái chế đã xác nhận.')}</p>
    {!pool || !token ? <p>{tr('Chương trình nhận ECO chưa được kích hoạt.')}</p>
      : !account ? <button type="button" className="secondary" onClick={onConnect}>{tr('Kết nối ví để nhận ECO')}</button>
      : error ? <div role="alert">
        <p>{tr('Chưa đọc được trạng thái nhận ECO.')}</p>
        <button type="button" className="secondary" onClick={() => setRevision(n => n + 1)}>{tr('Thử lại')}</button>
      </div>
      : !status ? <p role="status">{tr('Đang tải dữ liệu từ mạng…')}</p>
      : <><div className="pickup-reward-list earn-eco-list">
        <div>
          <CalendarCheck size={20} aria-hidden="true"/>
          <h4>{tr('Điểm danh hằng ngày')}</h4>
          <p>{tr('Lượt mới mỗi ngày lúc 00:00 (giờ Việt Nam).')}</p>
          <p><strong>+{num(Number(formatEther(status.checkInAmount)))} ECO</strong></p>
          <button type="button" className="secondary"
            disabled={disabled || status.checkInClaimed || status.available < status.checkInAmount}
            onClick={() => claim(status.checkInAmount, 'claimCheckIn', [status.day])}>
            {claimLabel(status.checkInClaimed, true, status.checkInAmount, tr('Điểm danh'))}
          </button>
        </div>
        {status.missions.map(({targetGrams, amount, claimed}, id) => {
          const eligible = status.recycledGrams >= targetGrams;
          const target = Number(targetGrams) / 1000;
          const progress = eligible ? target : Number(status.recycledGrams) / 1000;
          const title = tr('Tái chế {target} kg', {target: num(target)});
          return <div key={id}>
            <Target size={20} aria-hidden="true"/>
            <h4>{title}</h4>
            <p>{num(progress, 3)} / {num(target)} kg</p>
            <progress aria-label={title} value={progress} max={target}/>
            <p><strong>+{num(Number(formatEther(amount)))} ECO</strong></p>
            <button type="button" className="secondary" disabled={disabled || claimed || !eligible || status.available < amount}
              onClick={() => claim(amount, 'claimMission', [id])}>
              {claimLabel(claimed, eligible, amount, tr('Nhận thưởng'))}
            </button>
          </div>;
        })}
      </div>
      <p className="footnote">{tr('Mỗi mốc tái chế nhận một lần cho mỗi ví. Giao dịch nhận ECO cần AVAX testnet để trả phí.')}</p></>}
  </section>;
}
