import { createWalletClient, http, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { publicClient } from './chain';
import { chain, registerEmbedded, type Provider } from './wallet';

export type AccountRole = 'seller' | 'collector';

const USERS_STORAGE_KEY = 'ecoloop-password-accounts-v1';
const SESSION_STORAGE_KEY = 'ecoloop-password-session-v1';

interface StoredUser {
  username: string;
  address: Address;
  role: AccountRole;
  createdAt: number;
}

let activeUsername: string | undefined;
let activeRole: AccountRole | undefined;

export function passwordAccountUsername() {
  return activeUsername;
}

export function passwordAccountRole() {
  return activeRole;
}

function loadUsers(): Record<string, StoredUser> {
  try {
    return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveUser(user: StoredUser) {
  try {
    const users = loadUsers();
    users[user.username.toLowerCase()] = user;
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // ignore storage errors
  }
}

async function derivePrivateKey(username: string, password: string): Promise<Hex> {
  const enc = new TextEncoder();
  const normalizedUser = username.trim().toLowerCase();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const salt = enc.encode(`ecoloop-v4-auth-salt:${normalizedUser}`);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return toHex(new Uint8Array(bits));
}

function createAccountProvider(privateKey: Hex): { address: Address; provider: Provider; signMessage: (expected: Address, msg: string) => Promise<Hex> } {
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0];
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const provider: Provider = {
    on: () => {},
    removeListener: () => {},
    request: (async ({ method, params }: { method: string; params?: any[] }) => {
      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [account.address];
        case 'eth_chainId':
          return `0x${chain.id.toString(16)}`;
        case 'personal_sign': {
          const rawMsg = params?.[0];
          if (typeof rawMsg === 'string' && rawMsg.startsWith('0x')) {
            return account.signMessage({ message: { raw: rawMsg as Hex } });
          }
          return account.signMessage({ message: String(rawMsg ?? '') });
        }
        case 'eth_signTypedData_v4': {
          const rawData = typeof params?.[1] === 'string' ? JSON.parse(params[1]) : params?.[1];
          return account.signTypedData(rawData);
        }
        case 'eth_sendTransaction': {
          const tx = params?.[0] || {};
          return wallet.sendTransaction({
            account,
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            chain,
          });
        }
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
          return null;
        default:
          return publicClient.request({ method: method as any, params: params as any });
      }
    }) as Provider['request'],
  };

  return {
    address: account.address,
    provider,
    signMessage: async (expected, message) => {
      if (account.address.toLowerCase() !== expected.toLowerCase()) {
        throw new Error('Tài khoản ví đã thay đổi. Vui lòng kết nối lại.');
      }
      return account.signMessage({ message });
    },
  };
}

export async function connectPasswordAccount(options: {
  mode: 'login' | 'register';
  username: string;
  password: string;
  role: AccountRole;
}): Promise<{ address: Address; username: string; role: AccountRole }> {
  const cleanUser = options.username.trim();
  if (cleanUser.length < 3 || cleanUser.length > 64) {
    throw new Error('Tên tài khoản phải từ 3 đến 64 ký tự.');
  }
  if (options.password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  const privateKey = await derivePrivateKey(cleanUser, options.password);
  const { address, provider, signMessage } = createAccountProvider(privateKey);
  const users = loadUsers();
  const existing = users[cleanUser.toLowerCase()];

  // Check server-side account registry if available, with local fallback
  let serverRole: AccountRole | undefined;
  try {
    const res = await fetch('/api/auth/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: options.mode,
        username: cleanUser,
        address,
        role: options.role,
      }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không xác thực được tài khoản.');
    }
    if (data.role === 'seller' || data.role === 'collector') {
      serverRole = data.role;
    }
  } catch (err: any) {
    if (err?.message && (err.message.includes('Mật khẩu') || err.message.includes('đã tồn tại') || err.message.includes('chưa được đăng ký') || err.message.includes('Sai tài khoản'))) {
      throw err;
    }
    // Local fallback validation if server is unreachable
    if (options.mode === 'register' && existing && existing.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Tên tài khoản này đã tồn tại. Vui lòng chọn tên khác hoặc chuyển sang Đăng nhập.');
    }
    if (options.mode === 'login' && existing && existing.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Sai tài khoản hoặc mật khẩu.');
    }
  }

  const finalRole: AccountRole = serverRole || (options.mode === 'login' && existing ? existing.role : options.role);
  saveUser({
    username: cleanUser,
    address,
    role: finalRole,
    createdAt: existing?.createdAt || Date.now(),
  });

  activeUsername = cleanUser;
  activeRole = finalRole;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: cleanUser, privateKey, role: finalRole }));
  } catch {}

  registerEmbedded(
    provider,
    async () => {
      activeUsername = undefined;
      activeRole = undefined;
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {}
    },
    signMessage,
    { id: 'embedded-password', name: `Tài khoản (${cleanUser})`, rdns: 'ecoloop.password' }
  );

  return { address, username: cleanUser, role: finalRole };
}

export async function restorePasswordAccount(): Promise<{ address: Address; username: string; role: AccountRole } | undefined> {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as { username: string; privateKey: Hex; role: AccountRole };
    if (!saved?.username || !saved?.privateKey) return undefined;
    const { address, provider, signMessage } = createAccountProvider(saved.privateKey);
    activeUsername = saved.username;
    activeRole = saved.role || 'seller';
    registerEmbedded(
      provider,
      async () => {
        activeUsername = undefined;
        activeRole = undefined;
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {}
      },
      signMessage,
      { id: 'embedded-password', name: `Tài khoản (${saved.username})`, rdns: 'ecoloop.password' }
    );
    return { address, username: saved.username, role: activeRole };
  } catch {
    return undefined;
  }
}
