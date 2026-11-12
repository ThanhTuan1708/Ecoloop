export const materials = [
  { name: 'Nhựa', detail: 'Chai PET, hộp nhựa sạch', rate: 20, color: '#c9e9da', symbol: '♳' },
  { name: 'Giấy', detail: 'Bìa carton, sách, báo', rate: 10, color: '#f2e4c5', symbol: '▤' },
  { name: 'Kim loại', detail: 'Lon nhôm, hộp kim loại', rate: 40, color: '#dbe5ed', symbol: '◈' },
  { name: 'Thủy tinh', detail: 'Chai, lọ thủy tinh', rate: 8, color: '#dedaf1', symbol: '◇' },
];
export type RequestItem = { id: number; user: string; material: number; grams: number; verifiedGrams: number; evidenceHash: string; status: 'pending' | 'approved' | 'rejected'; createdAt: number; hash?: string };
export type Reward = { id: number; name: string; cost: number; stock: number; active: boolean };
export type Redemption = { id: number; rewardId: number; user: string; hash?: string; fulfilled?: boolean };
export type State = { requests: RequestItem[]; rewards: Reward[]; redemptions: Redemption[]; balance: number; earned: number; recycledGrams: number; totalGrams: number; totalRequests: number; totalRedemptions?: number; collector: boolean; admin: boolean; paused: boolean };
export const DEMO_USER = 'demo:recycler';
export const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
export const short = (s: string) => s.startsWith('demo:') ? 'Bạn · Demo' : `${s.slice(0, 6)}…${s.slice(-4)}`;
export function initialDemo(): State {
  const now = Date.now();
  const requests: RequestItem[] = [
    { id: 1, user: DEMO_USER, material: 0, grams: 8000, verifiedGrams: 8000, evidenceHash: 'demo-evidence-1', status: 'approved', createdAt: now - 6 * 86400000 },
    { id: 2, user: DEMO_USER, material: 1, grams: 12000, verifiedGrams: 12000, evidenceHash: 'demo-evidence-2', status: 'approved', createdAt: now - 3 * 86400000 },
    { id: 3, user: DEMO_USER, material: 2, grams: 3500, verifiedGrams: 3500, evidenceHash: 'demo-evidence-3', status: 'approved', createdAt: now - 86400000 },
    { id: 4, user: DEMO_USER, material: 0, grams: 2500, verifiedGrams: 0, evidenceHash: 'demo-evidence-4', status: 'pending', createdAt: now - 3600000 },
  ];
  return { requests, rewards: [ { id: 1, name: 'Một ly cà phê xanh', cost: 100, stock: 49, active: true }, { id: 2, name: 'Túi canvas EcoLoop', cost: 200, stock: 30, active: true }, { id: 3, name: 'Voucher mua sắm xanh', cost: 300, stock: 20, active: true } ], redemptions: [{ id: 1, user: DEMO_USER, rewardId: 1 }], balance: 320, earned: 420, recycledGrams: 23500, totalGrams: 23500, totalRequests: 4, collector: true, admin: true, paused: false };
}
const KEY = 'ecoloop-demo-v1';
export function loadDemo(): State {
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && Array.isArray(raw.requests) && Array.isArray(raw.rewards) && Array.isArray(raw.redemptions) && typeof raw.balance === 'number') return raw; } catch { /* fallback to seeded demo */ }
  return initialDemo();
}
export function saveDemo(state: State) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function submitDemo(state: State, material: number, grams: number, evidenceHash: string): State {
  if (state.paused) throw new Error('Hệ thống đang tạm dừng.');
  if (!Number.isInteger(material) || material < 0 || material > 3 || !Number.isInteger(grams) || grams < 1 || grams > 1_000_000 || !/^0x[0-9a-fA-F]{64}$/.test(evidenceHash)) throw new Error('Vật liệu, khối lượng hoặc hash ảnh không hợp lệ.');
  if (state.requests.some(r => r.evidenceHash === evidenceHash)) throw new Error('Ảnh này đã được dùng cho một yêu cầu. Hãy chọn ảnh mới.');
  return { ...state, totalRequests: state.totalRequests + 1, requests: [...state.requests, { id: state.totalRequests + 1, user: DEMO_USER, material, grams, verifiedGrams: 0, evidenceHash, status: 'pending', createdAt: Date.now() }] };
}
export function approveDemo(state: State, id: number, grams: number): State {
  if (state.paused) throw new Error('Hệ thống đang tạm dừng.');
  const r = state.requests.find(r => r.id === id);
  if (!r || r.status !== 'pending') throw new Error('Yêu cầu đã được xử lý.');
  if (!Number.isInteger(grams) || grams <= 0 || grams > 1_000_000) throw new Error('Khối lượng phải từ 1 g đến 1.000 kg.');
  const amount = grams * materials[r.material].rate / 1000;
  return { ...state, requests: state.requests.map(x => x.id === id ? { ...x, status: 'approved', verifiedGrams: grams } : x), balance: state.balance + amount, earned: state.earned + amount, recycledGrams: state.recycledGrams + grams, totalGrams: state.totalGrams + grams };
}
export function redeemDemo(state: State, id: number): State {
  const r = state.rewards.find(r => r.id === id);
  if (!r || !r.active || r.stock < 1) throw new Error('Phần thưởng đã hết.');
  if (state.balance < r.cost) throw new Error('Bạn chưa đủ ECO để đổi quà.');
  if (state.paused) throw new Error('Hệ thống đang tạm dừng.');
  return { ...state, balance: state.balance - r.cost, rewards: state.rewards.map(x => x.id === id ? { ...x, stock: x.stock - 1 } : x), redemptions: [...state.redemptions, { id: state.redemptions.length + 1, user: DEMO_USER, rewardId: id }] };
}
