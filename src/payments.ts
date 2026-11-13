// Wallet card payments: EIP-681 payment links/QR codes, sending AVAX or ECO, and history.
import { formatEther, getAddress, isAddress, parseEther, type Address, type Hash } from 'viem';
import { publicClient } from './chain';
import { assertWallet, chain } from './wallet';
import { householdWrite, pendingPickup } from './pickupClient';
import { pickupAbi } from './generated/pickup';

export type Token = 'AVAX' | 'ECO';
export type PaymentRequest = { to: Address; token: Token; amountWei?: bigint; note?: string };

/**
 * EIP-681 link, readable by EcoLoop and by other wallets (e.g. Core):
 *   AVAX: ethereum:<to>@43113?value=<wei>
 *   ECO:  ethereum:<eco token>@43113/transfer?address=<to>&uint256=<wei>
 */
export function paymentUri(req: PaymentRequest, eco?: Address): string {
  const note = req.note ? `${req.amountWei !== undefined ? '&' : '?'}message=${encodeURIComponent(req.note.slice(0, 80))}` : '';
  if (req.token === 'ECO') {
    if (!eco) throw new Error('Chưa có contract ECO.');
    return `ethereum:${eco}@${chain.id}/transfer?address=${req.to}${req.amountWei !== undefined ? `&uint256=${req.amountWei}` : ''}${req.note ? `&message=${encodeURIComponent(req.note.slice(0, 80))}` : ''}`;
  }
  return `ethereum:${req.to}@${chain.id}${req.amountWei !== undefined ? `?value=${req.amountWei}` : ''}${note}`;
}

function bigFrom(value: string | null): bigint | undefined {
  if (value === null || value === '') return undefined;
  // EIP-681 allows scientific notation, e.g. 1.5e18
  const m = /^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i.exec(value.trim());
  if (!m) throw new Error('Số tiền trong mã QR không hợp lệ.');
  const [, int, frac = '', exp = '0'] = m;
  const e = Number(exp);
  if (frac.length > e) throw new Error('Số tiền trong mã QR không hợp lệ.');
  return BigInt(int + frac.padEnd(e, '0'));
}

/** Accepts an EIP-681 link or a plain wallet address. Rejects other networks and unknown tokens. */
export function parsePayment(text: string, eco?: Address): PaymentRequest {
  const raw = text.trim();
  if (isAddress(raw)) return { to: getAddress(raw), token: 'AVAX' };
  const m = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(\/[a-zA-Z]+)?(?:\?(.*))?$/.exec(raw);
  if (!m) throw new Error('Mã QR không phải địa chỉ ví hay yêu cầu thanh toán.');
  const [, target, chainId, fn, query = ''] = m;
  if (chainId && Number(chainId) !== chain.id) throw new Error('Mã QR dành cho mạng khác. EcoLoop chỉ thanh toán trên Avalanche Fuji.');
  const params = new URLSearchParams(query);
  const note = params.get('message') || undefined;
  if (fn === '/transfer') {
    if (!eco || target.toLowerCase() !== eco.toLowerCase()) throw new Error('Mã QR yêu cầu một token không phải ECO.');
    const to = params.get('address') || '';
    if (!isAddress(to)) throw new Error('Địa chỉ người nhận trong mã QR không hợp lệ.');
    return { to: getAddress(to), token: 'ECO', amountWei: bigFrom(params.get('uint256')), note };
  }
  if (fn) throw new Error('Mã QR yêu cầu một thao tác không được hỗ trợ.');
  return { to: getAddress(target), token: 'AVAX', amountWei: bigFrom(params.get('value')), note };
}

export function toWei(amount: string): bigint {
  const v = amount.trim().replace(',', '.');
  if (!/^\d*\.?\d+$/.test(v)) throw new Error('Nhập số tiền hợp lệ.');
  const wei = parseEther(v);
  if (wei <= 0n) throw new Error('Số tiền phải lớn hơn 0.');
  return wei;
}
export const fromWei = (wei: bigint) => Number(formatEther(wei));

export async function balances(account: Address, eco?: Address) {
  const [avax, ecoBal] = await Promise.all([
    publicClient.getBalance({ address: account }),
    eco ? publicClient.readContract({ address: eco, abi: pickupAbi, functionName: 'balanceOf', args: [account] } as never) as Promise<bigint> : Promise.resolve(0n),
  ]);
  return { avax, eco: ecoBal };
}

const sentKey = (account: Address) => `ecoloop-card-sent-${chain.id}-${account.toLowerCase()}`;
export type SentItem = { tx: Hash; to: Address; token: Token; amount: string; time: number; note?: string };
/** AVAX sent from this device (native transfers are not in the contract's events). */
export function localSent(account: Address): SentItem[] {
  try { return JSON.parse(localStorage.getItem(sentKey(account)) || '[]'); } catch { return []; }
}
function remember(account: Address, item: SentItem) {
  try { localStorage.setItem(sentKey(account), JSON.stringify([item, ...localSent(account)].slice(0, 50))); } catch { /* storage unavailable */ }
}

/** Sends AVAX (wallet pays gas) or ECO (gas-free through the relayer when available). */
export async function pay(account: Address, req: PaymentRequest & { amountWei: bigint }, eco: Address | undefined, gasless: boolean): Promise<Hash> {
  if (req.to.toLowerCase() === account.toLowerCase()) throw new Error('Không thể chuyển cho chính ví của bạn.');
  if (pendingPickup()) throw new Error('Có giao dịch đang chờ. Kiểm tra giao dịch trước khi gửi tiếp.');
  if (req.token === 'ECO') {
    if (!eco) throw new Error('Chưa có contract ECO.');
    const hash = await householdWrite(eco, account, 'transfer', [req.to, req.amountWei], gasless);
    return hash;
  }
  const wallet = await assertWallet(account);
  const hash = await wallet.sendTransaction({ account, chain, to: req.to, value: req.amountWei } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120000 });
  if (receipt.status !== 'success') throw new Error('Giao dịch chuyển AVAX thất bại.');
  remember(account, { tx: hash, to: req.to, token: 'AVAX', amount: req.amountWei.toString(), time: Date.now(), note: req.note });
  return hash;
}

export type HistoryItem = { tx: Hash; kind: 'eco' | 'lock' | 'paid' | 'refund' | 'deferred' | 'avax'; direction: 'in' | 'out'; from?: string; to?: string; amount: string; lot?: number; time: number | null; block?: number; index?: number };
export async function cardHistory(account: Address): Promise<{ items: HistoryItem[]; complete: boolean }> {
  const response = await fetch(`/api/history?address=${account}`, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
  const data = response.ok ? await response.json() : { items: [], complete: false };
  const sent: HistoryItem[] = localSent(account).map(s => ({ tx: s.tx, kind: 'avax', direction: 'out', to: s.to, amount: s.amount, time: Math.floor(s.time / 1000) }));
  const items = [...data.items, ...sent].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return { items, complete: !!data.complete };
}
