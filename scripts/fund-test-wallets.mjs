// Tops up the seed collector and household TEST wallets from DEPLOYER_PRIVATE_KEY on Fuji,
// so only the admin wallet needs AVAX from the faucet. Usage: node --env-file=.env scripts/fund-test-wallets.mjs
import { createPublicClient, createWalletClient, formatEther, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
const rpc = process.env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0];
const client = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const admin = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account: admin, chain: avalancheFuji, transport: http(rpc) });
const targets = [
  [privateKeyToAccount(process.env.SEED_COLLECTOR_KEY).address, parseEther('0.15')],
  ...String(process.env.SEED_HOUSEHOLD_KEYS || '').split(',').filter(Boolean).map(k => [privateKeyToAccount(k.trim()).address, parseEther('0.06')]),
];
console.log(`Admin ${admin.address}: ${formatEther(await client.getBalance({ address: admin.address }))} AVAX`);
for (const [to, want] of targets) {
  const have = await client.getBalance({ address: to });
  if (have >= want) { console.log(`  ${to} has ${formatEther(have)} AVAX, ok`); continue; }
  const hash = await wallet.sendTransaction({ to, value: want - have });
  await client.waitForTransactionReceipt({ hash });
  console.log(`  ${to} +${formatEther(want - have)} AVAX  https://testnet.snowtrace.io/tx/${hash}`);
}
