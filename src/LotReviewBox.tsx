import {useEffect,useState,type FormEvent} from 'react';
import {Star,CheckCircle2,MessageSquare} from 'lucide-react';
import type {Address} from 'viem';
import {short} from './model';
import {tr,dateTime} from './settings';
import {speakFeedback} from './voiceFeedback';
import {signAuthorizationMessage} from './wallet';

export interface LotReview {
  lotId: number;
  reviewer: string;
  target: string;
  role: 'seller'|'collector';
  stars: number;
  tags: string[];
  comment: string;
  createdAt: number;
}

const STORAGE_KEY = 'ecoloop-lot-reviews-v1';
let cachedReviews: LotReview[] = loadLocalReviews();
const listeners = new Set<() => void>();

function loadLocalReviews(): LotReview[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalReviews(next: LotReview[]) {
  cachedReviews = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  for (const fn of listeners) fn();
}

export async function syncLotReviewsFromServer(): Promise<LotReview[]> {
  try {
    const res = await fetch('/api/reviews', {cache: 'no-store'});
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.reviews)) {
        const mergedMap = new Map<string, LotReview>();
        for (const r of [...data.reviews, ...cachedReviews]) {
          mergedMap.set(`${r.lotId}:${String(r.reviewer).toLowerCase()}`, r);
        }
        saveLocalReviews(Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt));
      }
    }
  } catch {
    // offline fallback
  }
  return cachedReviews;
}

export async function submitLotReview(review: Omit<LotReview, 'createdAt'>): Promise<LotReview[]> {
  const full: LotReview = {...review, createdAt: Date.now()};
  const timestamp = full.createdAt;
  const msg = `EcoLoop Review\nLot: ${full.lotId}\nReviewer: ${full.reviewer.toLowerCase()}\nStars: ${full.stars}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(full.reviewer as Address, msg);
  const filtered = cachedReviews.filter(
    r => !(r.lotId === full.lotId && r.reviewer.toLowerCase() === full.reviewer.toLowerCase())
  );
  saveLocalReviews([full, ...filtered]);
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...full, timestamp, signature}),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.reviews)) saveLocalReviews(data.reviews);
    }
  } catch {
    // already saved locally
  }
  return cachedReviews;
}

export function useLotReviews(): LotReview[] {
  const [reviews, setReviews] = useState<LotReview[]>(cachedReviews);
  useEffect(() => {
    const onChange = () => setReviews(cachedReviews);
    listeners.add(onChange);
    void syncLotReviewsFromServer();
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return reviews;
}

export function getWalletRatingSummary(reviews: LotReview[], wallet?: string) {
  if (!wallet) return {avg: 0, count: 0};
  const w = wallet.toLowerCase();
  const mine = reviews.filter(r => r.target.toLowerCase() === w);
  if (!mine.length) return {avg: 0, count: 0};
  const sum = mine.reduce((s, r) => s + r.stars, 0);
  return {avg: Math.round((sum / mine.length) * 10) / 10, count: mine.length};
}

export function LotReviewBox({
  lotId,
  sellerWallet,
  collectorWallet,
  currentAccount,
  role,
  admin,
  onReviewed,
}:{
  lotId: number;
  sellerWallet: string;
  collectorWallet: string;
  currentAccount?: string;
  role: 'seller'|'collector';
  admin: boolean;
  onReviewed?: (msg: string) => void;
}) {
  const reviews = useLotReviews();
  const [stars, setStars] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const me = currentAccount?.toLowerCase() || '';
  const isSeller = !!me && me === sellerWallet.toLowerCase();
  const isCollector = !!me && me === collectorWallet.toLowerCase();
  const canRate = (isSeller || isCollector) && !admin && collectorWallet !== '0x0000000000000000000000000000000000000000';

  const lotReviews = reviews.filter(r => r.lotId === lotId);
  const myReview = lotReviews.find(r => r.reviewer.toLowerCase() === me);

  const quickTags = isSeller || role === 'seller'
    ? [tr('Đúng giờ'), tr('Cân chuẩn xác'), tr('Thanh toán nhanh'), tr('Thân thiện')]
    : [tr('Phân loại sạch'), tr('Đúng số cân'), tr('Dễ liên hệ'), tr('Nhiệt tình')];

  function toggleTag(tag: string) {
    setSelectedTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!currentAccount || !canRate || submitting) return;
    setSubmitting(true);
    const target = isSeller ? collectorWallet : sellerWallet;
    await submitLotReview({
      lotId,
      reviewer: currentAccount,
      target,
      role: isSeller ? 'seller' : 'collector',
      stars,
      tags: selectedTags,
      comment: comment.trim(),
    });
    setSubmitting(false);
    speakFeedback('Cảm ơn bạn đã gửi đánh giá.');
    onReviewed?.(tr('⭐ Đã gửi đánh giá {n} sao cho chuyến thu gom #{id}!', {n: stars, id: lotId}));
  }

  if (!canRate && lotReviews.length === 0) return null;

  return (
    <section className="pickup-callout" style={{marginTop: '12px', border: '1px solid rgba(245, 158, 11, 0.35)'}} aria-label={tr('Đánh giá sau thu gom')}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
        <strong>⭐ {tr('Chấm điểm & Đánh giá Chuyến thu gom #{id}', {id: lotId})}</strong>
        {lotReviews.length > 0 && (
          <span className="star-badge">
            <Star size={12} fill="currentColor"/> {lotReviews[0].stars}.0 ({lotReviews.length})
          </span>
        )}
      </div>

      {canRate && !myReview && (
        <form onSubmit={e => void handleSubmit(e)} style={{marginTop: '10px', display: 'grid', gap: '10px'}}>
          <p className="footnote" style={{margin: 0}}>
            {isSeller
              ? tr('Hãy chấm điểm Người thu gom ({w}) để giúp cộng đồng nhận biết đối tác uy tín:', {w: short(collectorWallet)})
              : tr('Hãy chấm điểm Người bán ({w}) để cộng điểm uy tín cho hộ gia đình:', {w: short(sellerWallet)})}
          </p>

          <div style={{display: 'flex', gap: '6px', alignItems: 'center'}} role="radiogroup" aria-label={tr('Chọn số sao')}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                aria-label={tr('{n} sao', {n})}
                aria-pressed={stars === n}
                onClick={() => setStars(n)}
                style={{
                  border: '1px solid rgba(245,158,11,0.45)',
                  background: n <= stars ? '#fef3c7' : 'transparent',
                  color: n <= stars ? '#d97706' : '#9ca3af',
                  borderRadius: '10px',
                  padding: '6px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                <Star size={18} fill={n <= stars ? '#f59e0b' : 'none'}/>
                <span>{n}</span>
              </button>
            ))}
          </div>

          <div className="filter-tabs">
            {quickTags.map(tag => (
              <button
                key={tag}
                type="button"
                aria-pressed={selectedTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          <label>
            {tr('Nhận xét thêm (không bắt buộc)')}
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={240}
              placeholder={tr('VD: Thu gom rất đúng giờ, cân minh bạch và nhiệt tình!')}
            />
          </label>

          <button type="submit" className="primary" disabled={submitting}>
            <Star size={15}/> {submitting ? tr('Đang gửi đánh giá…') : tr('Gửi đánh giá {n} sao', {n: stars})}
          </button>
        </form>
      )}

      {myReview && (
        <p className="pickup-success" style={{marginTop: '8px', marginBottom: 0}}>
          <CheckCircle2 size={16}/> {tr('Bạn đã đánh giá {n} sao cho đơn này. Cảm ơn đóng góp của bạn!', {n: myReview.stars})}
        </p>
      )}

      {lotReviews.length > 0 && (
        <div style={{marginTop: '10px', display: 'grid', gap: '8px'}}>
          {lotReviews.map(rev => (
            <div
              key={`${rev.lotId}-${rev.reviewer}`}
              style={{background: 'rgba(245,158,11,0.07)', padding: '10px 12px', borderRadius: '10px', display: 'grid', gap: '4px'}}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                <strong>
                  {rev.role === 'seller' ? tr('🏠 Người bán đánh giá') : tr('🚚 Người thu gom đánh giá')} ({short(rev.reviewer)})
                </strong>
                <span style={{color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 700}}>
                  {Array.from({length: rev.stars}).map((_, idx) => (
                    <Star key={idx} size={13} fill="#f59e0b"/>
                  ))}
                  {' '}{rev.stars}/5
                </span>
              </div>
              {rev.tags.length > 0 && (
                <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                  {rev.tags.map(t => (
                    <span key={t} className="escrow-tag" style={{background: 'rgba(245,158,11,0.16)', color: '#92400e'}}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {rev.comment && (
                <p style={{margin: 0, display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <MessageSquare size={13}/> <span>“{rev.comment}”</span>
                </p>
              )}
              <small className="footnote">{dateTime(rev.createdAt)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
