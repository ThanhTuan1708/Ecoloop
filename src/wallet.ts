import { createWalletClient, custom, type Address, type EIP1193Provider } from 'viem';
import { avalancheFuji, hardhat } from 'viem/chains';

export type Provider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: Provider[];
  isMetaMask?: boolean;
  isAvalanche?: boolean;
};
export type WalletOption = { id: string; name: string; rdns: string; provider: Provider };
declare global { interface Window { ethereum?: Provider; avalanche?: Provider } }
export const chain = import.meta.env.VITE_CHAIN_ID === '31337' ? hardhat : avalancheFuji;
let active: Provider | undefined;
let activeId = '';
let embeddedDisconnect: (()=>Promise<void>) | undefined;
const discovered = new Map<string, WalletOption>();
const subscribers = new Set<() => void>();
let snapshot: WalletOption[] = [];
function publish() { snapshot = [...discovered.values()]; subscribers.forEach(fn => fn()); }
function add(option: WalletOption) {
  if (!option.provider || typeof option.provider.request !== 'function') return;
  const existing = [...discovered.values()].find(w => w.provider === option.provider);
  if (existing && existing.rdns !== 'legacy') return;
  if (existing) discovered.delete(existing.id);
  discovered.set(option.id, option); publish();
}
function legacy() {
  if (window.avalanche) add({ id: 'core-legacy', name: 'Core Wallet', rdns: 'legacy', provider: window.avalanche });
  for (const [i, p] of (window.ethereum?.providers || (window.ethereum ? [window.ethereum] : [])).entries()) {
    add({ id: `injected-${i}`, name: p.isAvalanche ? 'Core Wallet' : p.isMetaMask ? 'MetaMask' : 'Ví trình duyệt', rdns: 'legacy', provider: p });
  }
}
window.addEventListener('eip6963:announceProvider', (event) => {
  const detail = (event as CustomEvent).detail;
  if (typeof detail?.info?.uuid !== 'string' || typeof detail?.info?.name !== 'string') return;
  add({ id: detail.info.uuid, name: detail.info.name.slice(0, 80), rdns: String(detail.info.rdns || ''), provider: detail.provider });
});
export function discoverWallets() { window.dispatchEvent(new Event('eip6963:requestProvider')); legacy(); }
export function subscribeWallets(callback: () => void) { subscribers.add(callback); return () => { subscribers.delete(callback); }; }
export function walletSnapshot() { return snapshot; }
export function getProvider() { return active; }
export function getWalletName() { return discovered.get(activeId)?.name || 'Core / ví trình duyệt'; }
export function disconnectWallet() { const cleanup=activeId==='embedded-google'?embeddedDisconnect:undefined;if(activeId==='embedded-google'){discovered.delete(activeId);publish();} active = undefined; activeId = ''; localStorage.removeItem('ecoloop-wallet'); return cleanup?.(); }
export function registerEmbedded(provider:Provider,disconnect:()=>Promise<void>){embeddedDisconnect=disconnect;add({id:'embedded-google',name:'Ví Google',rdns:'ecoloop.google',provider});selectProvider('embedded-google');localStorage.setItem('ecoloop-wallet','ecoloop.google');}
export function selectProvider(id: string) {
  const option = discovered.get(id);
  if (!option) throw new Error('Không tìm thấy ví. Mở app trong Chrome/Edge đã cài Core và tải lại.');
  active = option.provider; activeId = id;
  return option;
}
function hasCode(error: unknown, code: number): boolean {
  let current = error as { code?: number; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 6; depth++, current = current.cause as typeof current) if (current.code === code) return true;
  return false;
}
export async function switchNetwork() {
  if (!active) throw new Error('Hãy chọn và kết nối Core Wallet trước.');
  const wallet = createWalletClient({ chain, transport: custom(active) });
  try { await wallet.switchChain({ id: chain.id }); }
  catch (error) { if (!hasCode(error, 4902)) throw error; await wallet.addChain({ chain }); await wallet.switchChain({ id: chain.id }); }
}
export async function connectWallet(id: string): Promise<Address> {
  const option = selectProvider(id);
  const wallet = createWalletClient({ chain, transport: custom(option.provider) });
  try {
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('Ví chưa cấp địa chỉ tài khoản.');
  await switchNetwork();
  localStorage.setItem('ecoloop-wallet', option.rdns === 'legacy' ? option.name : option.rdns);
  return account;
  } catch(error) { active=undefined;activeId='';localStorage.removeItem('ecoloop-wallet');throw error; }
}
export async function restoreWallet(): Promise<Address | undefined> {
  const saved = localStorage.getItem('ecoloop-wallet');
  const option = snapshot.find(w => w.rdns === saved || w.name === saved);
  if (!option) return;
  selectProvider(option.id);
  const [account] = await option.provider.request({ method: 'eth_accounts' });
  return account;
}
export function walletClient(account: Address) {
  if (!active) throw new Error('Hãy kết nối Core Wallet.');
  return createWalletClient({ account, chain, transport: custom(active) });
}
export async function assertWallet(account: Address) {
  const wallet = walletClient(account);
  if (await wallet.getChainId() !== chain.id) throw new Error(`Ví đang ở sai mạng. Chọn chuyển sang ${chain.name}.`);
  const accounts = await wallet.getAddresses();
  if (!accounts.some(a => a.toLowerCase() === account.toLowerCase())) throw new Error('Tài khoản ví đã thay đổi. Vui lòng kết nối lại.');
  return wallet;
}
discoverWallets();
