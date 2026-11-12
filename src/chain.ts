import { createPublicClient, http, formatEther, keccak256, stringToHex, getAddress, isAddress, encodeDeployData, type Address, type Hash } from 'viem';
import { abi } from './generated/abi';
import { chain, assertWallet } from './wallet';
import type { State, RequestItem } from './model';
export { chain, connectWallet } from './wallet';
const addressKey = `ecoloop-contract-${chain.id}`;
let sharedAddress: Address | undefined;
export let appConfiguration = { collectionName: 'Điểm thu gom EcoLoop', collectionInstructions: 'Liên hệ đơn vị tổ chức để thống nhất địa điểm và giờ bàn giao.' };
export function hasSharedContract() { return !!sharedAddress; }
export async function initializeConfiguration() {
  const response = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Không tải được cấu hình ứng dụng. Hãy kiểm tra server và thử lại.');
  const config = await response.json();
  if (config.chainId !== chain.id) throw new Error('Server và giao diện đang cấu hình khác mạng. Liên hệ đơn vị tổ chức.');
  if (config.contract && !isAddress(config.contract)) throw new Error('Địa chỉ contract chung không hợp lệ.');
  const configured = config.contract || import.meta.env.VITE_ECOLOOP_ADDRESS;
  sharedAddress = configured && isAddress(configured) ? getAddress(configured) : undefined;
  appConfiguration = { collectionName: config.collectionName, collectionInstructions: config.collectionInstructions };
}
export function getContractAddress(): Address | undefined {
  if (sharedAddress) return sharedAddress;
  const value = localStorage.getItem(addressKey) || import.meta.env.VITE_ECOLOOP_ADDRESS;
  return value && isAddress(value) ? getAddress(value) : undefined;
}
export const publicClient = createPublicClient({ chain, transport: http(import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0], { timeout: 20000, retryCount: 1 }) });
export async function validateContract(value: string) {
  if (!isAddress(value)) throw new Error('Địa chỉ smart contract không hợp lệ.');
  const address = getAddress(value);
  if (await publicClient.getChainId() !== chain.id) throw new Error('RPC đang trỏ tới sai mạng.');
  const { runtimeHash } = await import('./generated/deployment');
  const code = await publicClient.getCode({ address });
  if (!code || keccak256(code) !== runtimeHash) throw new Error('Địa chỉ không phải phiên bản EcoLoop này trên mạng đã chọn.');
  return address;
}
export async function saveContractAddress(value: string) {
  const address = await validateContract(value);
  if (sharedAddress && address !== sharedAddress) throw new Error('App đang dùng contract chung của đơn vị tổ chức. Không thể đổi sang một hệ thống khác.');
  localStorage.setItem(addressKey, address);
  return address;
}
export function clearContractAddress() { localStorage.removeItem(addressKey); }
export function txUrl(hash: string) { return `https://build.avax.network/explorer/tx/${hash}?network=fuji`; }
export async function walletBalance(account: Address) { return Number(formatEther(await publicClient.getBalance({ address: account }))); }
async function mapBatched<T>(count: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < count; i += 10) results.push(...await Promise.all(Array.from({ length: Math.min(10, count - i) }, (_, j) => fn(i + j))));
  return results;
}
export async function readState(account: Address, limit=100): Promise<State> {
  const address = getContractAddress();
  if (!address) throw new Error('Ví đã kết nối. Hãy triển khai hoặc chọn contract để bắt đầu.');
  const read = (functionName: string, args: unknown[] = []) => publicClient.readContract({ address, abi, functionName, args } as never) as Promise<any>;
  const [count, rewardCount, redemptionCount, balance, earned, grams, total, collector, admin, paused] = await Promise.all([
    read('submissionCount'), read('rewardCount'), read('redemptionCount'), read('balanceOf', [account]), read('earned', [account]), read('recycledGrams', [account]), read('totalRecycledGrams'), read('hasRole', [keccak256(stringToHex('COLLECTOR_ROLE')), account]), read('hasRole', ['0x' + '0'.repeat(64), account]), read('paused'),
  ]);
  const requests = await mapBatched(Math.min(Number(count), limit), async i => {
    const id = Number(count) - i;
    const s = await read('submissions', [BigInt(id)]);
    return { id, user: s[0], material: s[1], grams: Number(s[2]), verifiedGrams: Number(s[3]), evidenceHash: s[4], status: ['none', 'pending', 'approved', 'rejected'][s[5]], createdAt: Number(s[6]) * 1000 } as RequestItem;
  });
  const rewards = await mapBatched(Number(rewardCount), async i => { const id = i + 1; const r = await read('rewards', [BigInt(id)]); return { id, name: r[0], cost: Number(formatEther(r[1])), stock: Number(r[2]), active: r[3] }; });
  const redemptions = await mapBatched(Math.min(Number(redemptionCount), limit), async i => { const id = Number(redemptionCount) - i; const [user, rewardId, fulfilled] = await Promise.all([read('redemptionOwner', [BigInt(id)]), read('redemptionReward', [BigInt(id)]), read('redemptionFulfilled', [BigInt(id)])]); return { id, user, rewardId: Number(rewardId), fulfilled }; });
  return { requests, rewards, redemptions, balance: Number(formatEther(balance)), earned: Number(formatEther(earned)), recycledGrams: Number(grams), totalGrams: Number(total), totalRequests: Number(count), totalRedemptions: Number(redemptionCount), collector, admin, paused };
}
const pendingKey = `ecoloop-pending-${chain.id}`;
export type PendingTransaction = { hash: Hash; account: Address; kind: string; contract?: Address };
export function getPending(): PendingTransaction | undefined { try { const p = JSON.parse(localStorage.getItem(pendingKey) || 'null'); return p && /^0x[\da-f]{64}$/i.test(p.hash) && isAddress(p.account) ? p : undefined; } catch { return; } }
function remember(pending: PendingTransaction) { localStorage.setItem(pendingKey, JSON.stringify(pending)); window.dispatchEvent(new Event('ecoloop:pending')); }
export async function settlePending() {
  const pending = getPending();
  if (!pending) throw new Error('Không có giao dịch chờ xác nhận.');
  let replaced=pending.kind==='cancelled';
  const receipt = await publicClient.waitForTransactionReceipt({ hash: pending.hash, timeout: 120000, onReplaced: ({ reason, transaction }) => {replaced=reason!=='repriced';remember({ ...pending, hash: transaction.hash, kind:replaced?'cancelled':pending.kind });} });
  if(replaced){localStorage.removeItem(pendingKey);window.dispatchEvent(new Event('ecoloop:pending'));throw new Error('Giao dịch đã bị hủy hoặc thay thế trong ví. Kiểm tra explorer trước khi thử lại.');}
  if (receipt.status === 'success' && pending.kind === 'deploy') {
    if (!receipt.contractAddress) throw new Error('Giao dịch không tạo contract.');
    await saveContractAddress(receipt.contractAddress);
  }
  localStorage.removeItem(pendingKey); window.dispatchEvent(new Event('ecoloop:pending'));
  if (receipt.status !== 'success') throw new Error('Giao dịch đã bị revert. Không có thay đổi được áp dụng.');
  return { hash: receipt.transactionHash, address: receipt.contractAddress };
}
export async function deployFromWallet(account: Address, onHash: (hash: Hash) => void) {
  if (getPending()) throw new Error('Hãy kiểm tra giao dịch đang chờ trước khi triển khai thêm.');
  const wallet = await assertWallet(account);
  const { bytecode } = await import('./generated/deployment');
  const balance = await publicClient.getBalance({ address: account });
  if(balance===0n)throw new Error('Ví chưa có AVAX testnet. Mở faucet để nạp Fuji AVAX trước khi triển khai.');
  const data = encodeDeployData({ abi, bytecode, args: [account] });
  const gas = await publicClient.estimateGas({ account, data });
  const price = await publicClient.getGasPrice();
  if (balance < gas * price * 12n / 10n) throw new Error('Ví chưa đủ AVAX testnet để triển khai. Mở faucet, nạp Fuji AVAX rồi thử lại.');
  const hash = await wallet.deployContract({ abi, bytecode, args: [account], gas: gas * 12n / 10n });
  remember({ hash, account, kind: 'deploy' }); onHash(hash);
  return settlePending();
}
export async function transact(account: Address, functionName: string, args: unknown[]) {
  const address = getContractAddress();
  if (!address) throw new Error('Hãy triển khai hoặc chọn contract trước.');
  if (getPending()) throw new Error('Đang có giao dịch chưa xác nhận. Hãy kiểm tra trạng thái trước.');
  const wallet = await assertWallet(account);
  const { request } = await publicClient.simulateContract({ address, abi, functionName, args, account } as never);
  const hash = await wallet.writeContract(request);
  remember({ hash, account, kind: functionName, contract: address });
  return (await settlePending()).hash;
}
export async function checkSubmission(material: number, grams: number, evidenceHash: string, account: Address) {
  const address = getContractAddress();
  if (!address) throw new Error('Ứng dụng chưa được cấu hình contract.');
  if (getPending()) throw new Error('Đang có giao dịch chưa xác nhận. Hãy kiểm tra trạng thái trước khi gửi yêu cầu mới.');
  await assertWallet(account);
  await publicClient.simulateContract({ address, abi, functionName: 'submit', args: [material, BigInt(grams), evidenceHash], account } as never);
}
export async function importToken(account: Address) {
  const address = getContractAddress(); if (!address) throw new Error('Chưa có contract.');
  const wallet = await assertWallet(account);
  return wallet.watchAsset({ type: 'ERC20', options: { address, symbol: 'ECO', decimals: 18 } });
}
export { errorMessage } from './errors';
