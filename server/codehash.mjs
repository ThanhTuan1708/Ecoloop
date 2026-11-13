import { keccak256 } from 'viem';
/** keccak256 of deployed runtime code with immutable byte ranges zeroed, comparable to the compiled runtimeHash. */
export function codeHash(code, immutables = []) {
  if (!code || code === '0x') return undefined;
  if (!immutables.length) return keccak256(code);
  let hex = code.slice(2);
  for (const [start, length] of immutables) hex = hex.slice(0, start * 2) + '0'.repeat(length * 2) + hex.slice((start + length) * 2);
  return keccak256(`0x${hex}`);
}
