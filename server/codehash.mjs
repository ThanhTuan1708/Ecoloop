import { keccak256 } from 'viem';
import pickupRuntime from '../config/pickup-runtime.json' with {type:'json'};
/** keccak256 of deployed runtime code with immutable byte ranges zeroed, comparable to the compiled runtimeHash. */
export function codeHash(code, immutables = []) {
  if (!code || code === '0x') return undefined;
  if (!immutables.length) return keccak256(code);
  let hex = code.slice(2);
  for (const [start, length] of immutables) hex = hex.slice(0, start * 2) + '0'.repeat(length * 2) + hex.slice((start + length) * 2);
  return keccak256(`0x${hex}`);
}

export function pickupAccess(code, artifact) {
  if (!code || code === '0x' || !artifact.runtimeHash) return undefined;
  if (codeHash(code, artifact.immutables) === artifact.runtimeHash) return 'public';
  if (codeHash(code) === pickupRuntime.roleRestrictedEco) return 'restricted';
}
