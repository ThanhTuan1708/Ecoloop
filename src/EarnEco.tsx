import {useEffect, useState, type FormEvent} from 'react';
import {CalendarCheck, Target, Plus, Pencil, Trash2, Eye, EyeOff} from 'lucide-react';
import {formatEther, isAddressEqual, parseEther, type Address, type Hash} from 'viem';
import {publicClient} from './chain';
import {rewardsAbi} from './generated/rewards';
import {pendingPickup, pickupWrite} from './pickupClient';
import {num, tr} from './settings';
import {saveAdminCatalog, useAdminCatalog, type CustomMissionItem} from './adminCatalog';

const readStatus = (address: Address, user: Address) =>
  publicClient.readContract({address, abi: rewardsAbi, functionName: 'rewardStatus', args: [user]});
type Status = Awaited<ReturnType<typeof readStatus>>;

type Props = {
  pool?: Address;
  token?: Address;
  account?: Address;
  admin?: boolean;
  busy: boolean;
  onConnect: () => void;
  run: (action: () => Promise<void>) => Promise<void>;
  onClaim: (hash: Hash, amount: string) => Promise<void>;
  onAdminMessage?: (msg: string) => void;
};

export default function EarnEco({pool, token, account, admin, busy, onConnect, run, onClaim, onAdminMessage}: Props) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const catalog = useAdminCatalog();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingMission, setAddingMission] = useState(false);

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

  async function handleAddMission(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get('title') || '').trim();
    const description = String(f.get('description') || '').trim();
    const targetKg = Number(f.get('targetKg'));
    const rewardEco = Number(f.get('rewardEco'));
    if (!title || targetKg <= 0 || rewardEco <= 0) return;
    const nextItem: CustomMissionItem = {
      id: `mission-${Date.now()}`,
      title,
      description,
      targetKg,
      rewardEco,
      hidden: false,
    };
    await saveAdminCatalog(prev => ({
      ...prev,
      customMissions: [...prev.customMissions, nextItem],
    }), account);
    setAddingMission(false);
    onAdminMessage?.(tr('Đã thêm nhiệm vụ thưởng ECO mới.'));
  }

  async function handleUpdateMission(id: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get('title') || '').trim();
    const description = String(f.get('description') || '').trim();
    const targetKg = Number(f.get('targetKg'));
    const rewardEco = Number(f.get('rewardEco'));
    if (!title || targetKg <= 0 || rewardEco <= 0) return;
    await saveAdminCatalog(prev => ({
      ...prev,
      customMissions: prev.customMissions.map(m =>
        m.id === id ? {...m, title, description, targetKg, rewardEco} : m
      ),
    }), account);
    setEditingId(null);
    onAdminMessage?.(tr('Đã cập nhật nhiệm vụ thưởng ECO.'));
  }

  async function handleDeleteMission(id: string) {
    await saveAdminCatalog(prev => ({
      ...prev,
      customMissions: prev.customMissions.filter(m => m.id !== id),
    }), account);
    onAdminMessage?.(tr('Đã xóa nhiệm vụ thưởng ECO.'));
  }

  const disabled = busy || !!pendingPickup() || error || status?.paused;
  const visibleCustomMissions = catalog.customMissions.filter(m => admin || !m.hidden);
  const recycledKg = status ? Number(status.recycledGrams) / 1000 : 0;

  return <section className="pickup-callout" aria-labelledby="earn-eco-title">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
      <div>
        <h3 id="earn-eco-title">{tr('Kiếm thêm ECO')}</h3>
        <p>{tr('Điểm danh mỗi ngày và nhận thưởng khi đạt các mốc tái chế đã xác nhận.')}</p>
      </div>
      {admin && (
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button type="button" className="secondary" onClick={() => setAddingMission(v => !v)}>
            <Plus size={15}/> {addingMission ? tr('Đóng biểu mẫu') : tr('Thêm nhiệm vụ mới')}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void saveAdminCatalog(prev => ({...prev, hideCheckIn: !prev.hideCheckIn}), account)}
          >
            {catalog.hideCheckIn ? <><Eye size={15}/> {tr('Hiện Điểm danh')}</> : <><EyeOff size={15}/> {tr('Ẩn Điểm danh')}</>}
          </button>
        </div>
      )}
    </div>

    {admin && addingMission && (
      <form className="pickup-callout" onSubmit={e => void handleAddMission(e)} style={{marginTop:'12px'}}>
        <h4>{tr('Thêm nhiệm vụ tái chế mới (Quản trị)')}</h4>
        <div className="pickup-weights">
          <label>{tr('Tên nhiệm vụ')}
            <input name="title" required maxLength={80} placeholder={tr('VD: Tái chế 25 kg phế liệu')} />
          </label>
          <label>{tr('Mô tả ngắn')}
            <input name="description" maxLength={140} placeholder={tr('VD: Hoàn tất bàn giao tích lũy đạt 25 kg')} />
          </label>
          <label>{tr('Mục tiêu (kg)')}
            <input name="targetKg" type="number" step="0.1" min="0.1" required defaultValue="25" />
          </label>
          <label>{tr('Thưởng (ECO)')}
            <input name="rewardEco" type="number" step="1" min="1" required defaultValue="50" />
          </label>
        </div>
        <button type="submit" className="primary">{tr('Lưu nhiệm vụ mới')}</button>
      </form>
    )}

    {!pool || !token ? <p>{tr('Chương trình nhận ECO chưa được kích hoạt.')}</p>
      : !account ? <button type="button" className="secondary" onClick={onConnect}>{tr('Kết nối ví để nhận ECO')}</button>
      : error ? <div role="alert">
        <p>{tr('Chưa đọc được trạng thái nhận ECO.')}</p>
        <button type="button" className="secondary" onClick={() => setRevision(n => n + 1)}>{tr('Thử lại')}</button>
      </div>
      : !status ? <p role="status">{tr('Đang tải dữ liệu từ mạng…')}</p>
      : <><div className="pickup-reward-list earn-eco-list">
        {(!catalog.hideCheckIn || admin) && (
          <div style={catalog.hideCheckIn ? {opacity: 0.55} : undefined}>
            <CalendarCheck size={20} aria-hidden="true"/>
            <h4>{tr('Điểm danh hằng ngày')} {catalog.hideCheckIn && <small>({tr('Đang ẩn')})</small>}</h4>
            <p>{tr('Lượt mới mỗi ngày lúc 00:00 (giờ Việt Nam).')}</p>
            <p><strong>+{num(catalog.checkInBonusOverride ?? Number(formatEther(status.checkInAmount)))} ECO</strong></p>
            <button type="button" className="secondary"
              disabled={disabled || status.checkInClaimed || status.available < status.checkInAmount}
              onClick={() => claim(status.checkInAmount, 'claimCheckIn', [status.day])}>
              {claimLabel(status.checkInClaimed, true, status.checkInAmount, tr('Điểm danh'))}
            </button>
          </div>
        )}
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
        {visibleCustomMissions.map(mission => {
          const progress = Math.min(mission.targetKg, recycledKg);
          const eligible = recycledKg >= mission.targetKg;
          return <div key={mission.id}>
            <Target size={20} aria-hidden="true"/>
            {editingId === mission.id && admin ? (
              <form onSubmit={e => void handleUpdateMission(mission.id, e)}>
                <label>{tr('Tên nhiệm vụ')}<input name="title" defaultValue={mission.title} required /></label>
                <label>{tr('Mô tả ngắn')}<input name="description" defaultValue={mission.description} /></label>
                <label>{tr('Mục tiêu (kg)')}<input name="targetKg" type="number" step="0.1" min="0.1" defaultValue={mission.targetKg} required /></label>
                <label>{tr('Thưởng (ECO)')}<input name="rewardEco" type="number" step="1" min="1" defaultValue={mission.rewardEco} required /></label>
                <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
                  <button type="submit" className="primary">{tr('Lưu')}</button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>{tr('Hủy')}</button>
                </div>
              </form>
            ) : (
              <>
                <h4>{mission.title}</h4>
                {mission.description && <p>{mission.description}</p>}
                <p>{num(progress, 2)} / {num(mission.targetKg)} kg</p>
                <progress aria-label={mission.title} value={progress} max={mission.targetKg}/>
                <p><strong>+{num(mission.rewardEco)} ECO</strong></p>
                <button type="button" className="secondary" disabled={!eligible}>
                  {eligible ? tr('Nhận thưởng') : tr('Chưa đạt mục tiêu')}
                </button>
                {admin && (
                  <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>
                    <button type="button" className="secondary" onClick={() => setEditingId(mission.id)}>
                      <Pencil size={14}/> {tr('Sửa')}
                    </button>
                    <button type="button" className="secondary" onClick={() => void handleDeleteMission(mission.id)}>
                      <Trash2 size={14}/> {tr('Xóa')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>;
        })}
      </div>
      {admin && pool && token && account && (
        <form className="pickup-callout" style={{marginTop:'12px'}} onSubmit={e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const ecoAmount = String(f.get('fundEco') || '').trim().replace(',', '.');
          if (!/^\d+(\.\d+)?$/.test(ecoAmount) || Number(ecoAmount) <= 0) return;
          void run(async () => {
            const hash = await pickupWrite(token, account, 'transfer', [pool, parseEther(ecoAmount)]);
            await onClaim(hash, num(Number(ecoAmount)));
            setRevision(n => n + 1);
          });
        }}>
          <h4>{tr('Quỹ thưởng Điểm danh & Nhiệm vụ: đang có {n} ECO', {n: num(Number(formatEther(status.available)))})}</h4>
          <div style={{display:'flex',gap:'8px',alignItems:'flex-end',flexWrap:'wrap'}}>
            <label style={{flex:1}}>{tr('Bổ sung thêm ECO vào Quỹ thưởng')}
              <input name="fundEco" inputMode="decimal" placeholder="100" required />
            </label>
            <button type="submit" className="secondary" disabled={busy}>{tr('Nạp ECO vào Quỹ thưởng')}</button>
          </div>
        </form>
      )}
      <p className="footnote">{tr('Mỗi mốc tái chế nhận một lần cho mỗi ví. Giao dịch nhận ECO cần AVAX testnet để trả phí.')}</p></>}
  </section>;
}
