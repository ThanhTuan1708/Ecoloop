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
export const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
