import type {Address} from 'viem';
import {signAuthorizationMessage} from './wallet';

export type VerificationRequest = {account: Address; requestedAt: number};

/** Signs and sends a request to become a verified collection station (COLLECTOR_ROLE). */
export async function requestCollectorVerification(account: Address) {
  const timestamp = Date.now();
  const message = `EcoLoop Collector Verification Request\nAccount: ${account.toLowerCase()}\nTimestamp: ${timestamp}`;
  const signature = await signAuthorizationMessage(account, message);
  const res = await fetch('/api/collector/verify-request', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({account, timestamp, signature}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không gửi được yêu cầu xác minh.');
}

export async function verificationRequested(account: Address): Promise<boolean> {
  const res = await fetch(`/api/collector/verify-request?account=${account}`).catch(() => undefined);
  if (!res?.ok) return false;
  return !!(await res.json().catch(() => ({}))).requested;
}

export async function pendingVerificationRequests(): Promise<VerificationRequest[]> {
  const res = await fetch('/api/collector/verify-request').catch(() => undefined);
  if (!res?.ok) return [];
  return (await res.json().catch(() => ({}))).requests ?? [];
}
