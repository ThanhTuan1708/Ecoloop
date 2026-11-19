import {useEffect,useState} from 'react';
import type {Address} from 'viem';
import {ADMIN_WALLET} from './useWalletSession';
import {signAuthorizationMessage} from './wallet';

export interface LotOverride {
  lotId: number;
  title?: string;
  description?: string;
  estimatedGrams?: [number,number,number,number];
  hidden?: boolean;
  adminNote?: string;
}

export interface CustomLotItem {
  id: number;
  title: string;
  description: string;
  district: string;
  province: string;
  estimatedGrams: [number,number,number,number];
  ownerWallet: string;
  status: 1|2|3|4|5;
  createdAt: number;
}

export interface RewardOverride {
  id: number;
  name?: string;
  cost?: number;
  stock?: number;
  tone?: 'coffee'|'tote'|'shopping';
  hidden?: boolean;
}

export interface CustomRewardItem {
  id: number;
  name: string;
  cost: number;
  stock: number;
  tone: 'coffee'|'tote'|'shopping';
  hidden?: boolean;
}

export interface CustomMissionItem {
  id: string;
  title: string;
  description: string;
  targetKg: number;
  rewardEco: number;
  hidden?: boolean;
}

export interface EconomicsConfig {
  buyVnd: [number,number,number,number];
  stationVnd: [number,number,number,number];
  collectorSharePct: number;
  eprVndPerKg: number;
}

export interface ManagedAccount {
  username: string;
  address: string;
  role: 'seller'|'collector';
  blocked?: boolean;
  createdAt: number;
}

export type DummyPaymentMethod = 'vietqr'|'ecopay'|'cash';

export interface DummyPaymentReceipt {
  lotId: number;
  txCode: string;
  method: DummyPaymentMethod;
  bankName: string;
  sellerWallet: string;
  collectorWallet: string;
  sellerCashVnd: number;
  collectorFeeVnd: number;
  appProfitVnd: number;
  paidAt: number;
}

export interface CustomReceiptItem {
  id: number;
  reward: number;
  owner: string;
  done: boolean;
  createdAt: number;
}

export interface MissionClaimRecord {
  missionId: string;
  account: string;
  rewardEco: number;
  claimedAt: number;
}

export interface AdminCatalogState {
  lotOverrides: Record<number, LotOverride>;
  customLots: CustomLotItem[];
  rewardOverrides: Record<number, RewardOverride>;
  customRewards: CustomRewardItem[];
  customReceipts: CustomReceiptItem[];
  customMissions: CustomMissionItem[];
  missionClaims: Record<string, MissionClaimRecord>;
  hideCheckIn?: boolean;
  checkInBonusOverride?: number;
  economics: EconomicsConfig;
  accounts: ManagedAccount[];
  dummyPayments: Record<number, DummyPaymentReceipt>;
  dummyVndBalances: Record<string, number>;
}

const STORAGE_KEY = 'ecoloop-admin-catalog-v1';

export const DEFAULT_ECONOMICS: EconomicsConfig = {
  buyVnd: [3500, 2200, 12000, 1000],
  stationVnd: [4200, 2600, 14500, 1300],
  collectorSharePct: 60,
  eprVndPerKg: 800,
};

export const DEFAULT_ADMIN_CATALOG: AdminCatalogState = {
  lotOverrides: {},
  customLots: [],
  rewardOverrides: {},
  customRewards: [],
  customReceipts: [],
  customMissions: [],
  missionClaims: {},
  hideCheckIn: false,
  economics: DEFAULT_ECONOMICS,
  accounts: [],
  dummyPayments: {},
  dummyVndBalances: {},
};

let currentState: AdminCatalogState = loadLocalCatalog();
const listeners = new Set<() => void>();

function loadLocalCatalog(): AdminCatalogState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ADMIN_CATALOG;
    const parsed = JSON.parse(raw) as Partial<AdminCatalogState>;
    return mergeCatalog(parsed);
  } catch {
    return DEFAULT_ADMIN_CATALOG;
  }
}

function mergeCatalog(parsed: Partial<AdminCatalogState>): AdminCatalogState {
  return {
    lotOverrides: parsed.lotOverrides && typeof parsed.lotOverrides === 'object' ? parsed.lotOverrides : {},
    customLots: Array.isArray(parsed.customLots) ? parsed.customLots : [],
    rewardOverrides: parsed.rewardOverrides && typeof parsed.rewardOverrides === 'object' ? parsed.rewardOverrides : {},
    customRewards: Array.isArray(parsed.customRewards) ? parsed.customRewards : [],
    customReceipts: Array.isArray(parsed.customReceipts) ? parsed.customReceipts : [],
    customMissions: Array.isArray(parsed.customMissions) ? parsed.customMissions : [],
    missionClaims: parsed.missionClaims && typeof parsed.missionClaims === 'object' ? parsed.missionClaims : {},
    hideCheckIn: !!parsed.hideCheckIn,
    checkInBonusOverride: typeof parsed.checkInBonusOverride === 'number' ? parsed.checkInBonusOverride : undefined,
    economics: {
      buyVnd: Array.isArray(parsed.economics?.buyVnd) && parsed.economics.buyVnd.length === 4
        ? (parsed.economics.buyVnd.map(Number) as [number,number,number,number])
        : DEFAULT_ECONOMICS.buyVnd,
      stationVnd: Array.isArray(parsed.economics?.stationVnd) && parsed.economics.stationVnd.length === 4
        ? (parsed.economics.stationVnd.map(Number) as [number,number,number,number])
        : DEFAULT_ECONOMICS.stationVnd,
      collectorSharePct: typeof parsed.economics?.collectorSharePct === 'number'
        ? Math.min(100, Math.max(0, parsed.economics.collectorSharePct))
        : DEFAULT_ECONOMICS.collectorSharePct,
      eprVndPerKg: typeof parsed.economics?.eprVndPerKg === 'number'
        ? Math.max(0, parsed.economics.eprVndPerKg)
        : DEFAULT_ECONOMICS.eprVndPerKg,
    },
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    dummyPayments: parsed.dummyPayments && typeof parsed.dummyPayments === 'object' ? parsed.dummyPayments : {},
    dummyVndBalances: parsed.dummyVndBalances && typeof parsed.dummyVndBalances === 'object' ? parsed.dummyVndBalances : {},
  };
}

function persistLocal(next: AdminCatalogState) {
  currentState = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  for (const fn of listeners) fn();
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export function getAdminCatalog(): AdminCatalogState {
  return currentState;
}

export async function syncAdminCatalogFromServer(): Promise<AdminCatalogState> {
  try {
    const [adminRes, userRes] = await Promise.all([
      fetch('/api/admin/catalog', {cache: 'no-store'}),
      fetch('/api/user-state', {cache: 'no-store'}),
    ]);
    const adminData = adminRes.ok ? ((await adminRes.json()) as Partial<AdminCatalogState>) : {};
    const userData = userRes.ok ? ((await userRes.json()) as Partial<AdminCatalogState>) : {};
    persistLocal(mergeCatalog({
      ...currentState,
      ...adminData,
      dummyPayments: {...currentState.dummyPayments, ...(userData.dummyPayments || {})},
      dummyVndBalances: {...currentState.dummyVndBalances, ...(userData.dummyVndBalances || {})},
      customReceipts: Array.isArray(userData.customReceipts) && userData.customReceipts.length
        ? userData.customReceipts
        : currentState.customReceipts,
      missionClaims: {...currentState.missionClaims, ...(userData.missionClaims || {})},
    }));
  } catch {
    // offline or local fallback
  }
  return currentState;
}

export async function fetchAdminAccountsWithSignature(adminAccount: string): Promise<AdminCatalogState> {
  const normalized = adminAccount.toLowerCase();
  const timestamp = Date.now();
  const message = `EcoLoop Admin Catalog Read\nAdmin: ${normalized}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(adminAccount as Address, message);
  const res = await fetch('/api/admin/catalog', {
    cache: 'no-store',
    headers: {
      'X-EcoLoop-Admin': normalized,
      'X-EcoLoop-Timestamp': String(timestamp),
      'X-EcoLoop-Signature': signature,
    },
  });
  if (res.ok) {
    const adminData = (await res.json()) as Partial<AdminCatalogState>;
    persistLocal(mergeCatalog({...currentState, ...adminData}));
  }
  return currentState;
}

export async function saveAdminCatalog(
  updater: (prev: AdminCatalogState) => AdminCatalogState,
  adminAccount?: string
): Promise<AdminCatalogState> {
  if (!adminAccount) {
    throw new Error('Chỉ ví Quản trị viên mới có quyền lưu thay đổi quản trị.');
  }
  const next = mergeCatalog(updater(currentState));
  const adminPayload = {
    lotOverrides: next.lotOverrides,
    customLots: next.customLots,
    rewardOverrides: next.rewardOverrides,
    customRewards: next.customRewards,
    customMissions: next.customMissions,
    hideCheckIn: next.hideCheckIn,
    checkInBonusOverride: next.checkInBonusOverride,
    economics: next.economics,
    accounts: next.accounts,
  };
  const timestamp = Date.now();
  const digest = await sha256Hex(JSON.stringify(adminPayload));
  const message = `EcoLoop Admin Catalog Update\nAdmin: ${adminAccount.toLowerCase()}\nHash: ${digest}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(adminAccount as Address, message);

  const res = await fetch('/api/admin/catalog', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      adminAccount,
      timestamp,
      signature,
      catalog: adminPayload,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Không lưu được cấu hình quản trị lên máy chủ.');
  }
  persistLocal(next);
  return next;
}

export async function recordDummyLotPayment(account: string, receipt: DummyPaymentReceipt): Promise<AdminCatalogState> {
  const sellerKey = receipt.sellerWallet.toLowerCase();
  const collectorKey = receipt.collectorWallet.toLowerCase();
  const adminKey = ADMIN_WALLET.toLowerCase();
  const timestamp = Date.now();
  const msg = `EcoLoop Dummy Payment\nAccount: ${account.toLowerCase()}\nLot: ${receipt.lotId}\nAmount: ${receipt.sellerCashVnd}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(account as Address, msg);

  const alreadyPaid = !!currentState.dummyPayments[receipt.lotId];
  const nextBalances = {...currentState.dummyVndBalances};
  if (!alreadyPaid) {
    const currentCollectorBal = nextBalances[collectorKey] ?? 2_000_000;
    nextBalances[collectorKey] = Math.max(0, currentCollectorBal - receipt.sellerCashVnd) + receipt.collectorFeeVnd;
    nextBalances[sellerKey] = (nextBalances[sellerKey] ?? 0) + receipt.sellerCashVnd;
    nextBalances[adminKey] = (nextBalances[adminKey] ?? 0) + receipt.appProfitVnd;
  }
  persistLocal({
    ...currentState,
    dummyPayments: {...currentState.dummyPayments, [receipt.lotId]: receipt},
    dummyVndBalances: nextBalances,
  });

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({account, timestamp, signature, receipt}),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) persistLocal(mergeCatalog({...currentState, ...data.state}));
    }
  } catch {
    // local state already updated
  }
  return currentState;
}

export async function adjustDummyVndBalance(wallet: string, deltaVnd: number, defaultStart = 500_000): Promise<AdminCatalogState> {
  const key = wallet.toLowerCase();
  const timestamp = Date.now();
  const msg = `EcoLoop Dummy Balance\nAccount: ${key}\nDelta: ${Math.round(deltaVnd)}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(wallet as Address, msg);

  const cur = currentState.dummyVndBalances[key] ?? defaultStart;
  persistLocal({
    ...currentState,
    dummyVndBalances: {...currentState.dummyVndBalances, [key]: Math.max(0, cur + deltaVnd)},
  });

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'balance',
        account: key,
        deltaVnd: Math.round(deltaVnd),
        defaultStart,
        timestamp,
        signature,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) persistLocal(mergeCatalog({...currentState, ...data.state}));
    }
  } catch {
    // local state already updated
  }
  return currentState;
}

export async function redeemCustomRewardOnServer(account: string, rewardId: number): Promise<CustomReceiptItem> {
  const timestamp = Date.now();
  const msg = `EcoLoop Custom Redeem\nAccount: ${account.toLowerCase()}\nReward: ${rewardId}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(account as Address, msg);

  const res = await fetch('/api/rewards/custom-redeem', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({account, rewardId, timestamp, signature}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Không thể đổi phần thưởng này.');
  }
  const data = await res.json();
  persistLocal(mergeCatalog({
    ...currentState,
    ...(data.catalog || {}),
    ...(data.state || {}),
  }));
  return data.receipt as CustomReceiptItem;
}

export async function claimCustomMissionOnServer(account: string, missionId: string, rewardEco: number): Promise<void> {
  const timestamp = Date.now();
  const msg = `EcoLoop Custom Mission Claim\nAccount: ${account.toLowerCase()}\nMission: ${missionId}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(account as Address, msg);

  const res = await fetch('/api/missions/custom-claim', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({account, missionId, rewardEco, timestamp, signature}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Không thể nhận thưởng nhiệm vụ.');
  }
  const data = await res.json();
  persistLocal(mergeCatalog({...currentState, ...(data.state || {})}));
}

export function useAdminCatalog(): AdminCatalogState {
  const [state, setState] = useState<AdminCatalogState>(currentState);
  useEffect(() => {
    const onChange = () => setState(currentState);
    listeners.add(onChange);
    void syncAdminCatalogFromServer();
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return state;
}
