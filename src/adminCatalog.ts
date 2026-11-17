import {useEffect,useState} from 'react';
import {ADMIN_WALLET} from './useWalletSession';

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

export interface AdminCatalogState {
  lotOverrides: Record<number, LotOverride>;
  customLots: CustomLotItem[];
  rewardOverrides: Record<number, RewardOverride>;
  customRewards: CustomRewardItem[];
  customReceipts: CustomReceiptItem[];
  customMissions: CustomMissionItem[];
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

function notifyListeners() {
  for (const fn of listeners) fn();
}

export function getAdminCatalog(): AdminCatalogState {
  return currentState;
}

export async function syncAdminCatalogFromServer(): Promise<AdminCatalogState> {
  try {
    const res = await fetch('/api/admin/catalog', {cache: 'no-store'});
    if (res.ok) {
      const data = (await res.json()) as Partial<AdminCatalogState>;
      currentState = mergeCatalog({
        ...currentState,
        ...data,
        dummyPayments: {...currentState.dummyPayments, ...(data.dummyPayments || {})},
        dummyVndBalances: {...currentState.dummyVndBalances, ...(data.dummyVndBalances || {})},
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
      } catch {
        // ignore storage quota errors
      }
      notifyListeners();
    }
  } catch {
    // offline or local fallback
  }
  return currentState;
}

export async function saveAdminCatalog(
  updater: (prev: AdminCatalogState) => AdminCatalogState,
  adminAccount?: string
): Promise<AdminCatalogState> {
  const next = mergeCatalog(updater(currentState));
  currentState = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  notifyListeners();
  try {
    await fetch('/api/admin/catalog', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        adminAccount: adminAccount || ADMIN_WALLET,
        catalog: next,
      }),
    });
  } catch {
    // local state already updated
  }
  return next;
}

export async function recordDummyLotPayment(receipt: DummyPaymentReceipt): Promise<AdminCatalogState> {
  const sellerKey = receipt.sellerWallet.toLowerCase();
  const collectorKey = receipt.collectorWallet.toLowerCase();
  const adminKey = ADMIN_WALLET.toLowerCase();

  return saveAdminCatalog(prev => {
    const alreadyPaid = !!prev.dummyPayments[receipt.lotId];
    const nextBalances = {...prev.dummyVndBalances};
    if (!alreadyPaid) {
      const currentCollectorBal = nextBalances[collectorKey] ?? 2_000_000;
      nextBalances[collectorKey] = Math.max(0, currentCollectorBal - receipt.sellerCashVnd) + receipt.collectorFeeVnd;
      nextBalances[sellerKey] = (nextBalances[sellerKey] ?? 0) + receipt.sellerCashVnd;
      nextBalances[adminKey] = (nextBalances[adminKey] ?? 0) + receipt.appProfitVnd;
    }
    return {
      ...prev,
      dummyPayments: {
        ...prev.dummyPayments,
        [receipt.lotId]: receipt,
      },
      dummyVndBalances: nextBalances,
    };
  });
}

export async function adjustDummyVndBalance(wallet: string, deltaVnd: number, defaultStart = 500_000): Promise<AdminCatalogState> {
  const key = wallet.toLowerCase();
  return saveAdminCatalog(prev => {
    const current = prev.dummyVndBalances[key] ?? defaultStart;
    return {
      ...prev,
      dummyVndBalances: {
        ...prev.dummyVndBalances,
        [key]: Math.max(0, current + deltaVnd),
      },
    };
  });
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
