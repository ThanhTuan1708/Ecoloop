// Grants COLLECTOR_ROLE (verified collection station) on the active Fuji pickup contract.
// Addresses come from the command line and/or the pending requests on the EcoLoop server
// (GET /api/collector/verify-request). Signed by DEPLOYER_PRIVATE_KEY (pickup admin).
// Usage: node --env-file=.env scripts/grant-collectors.mjs [0xAddress ...] [--from-server] [--app=https://...]
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, isAddress, keccak256, stringToHex, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const args = process.argv.slice(2);
const app = (args.find(a => a.startsWith('--app='))?.slice(6) || process.env.APP_URL || 'https://ecoloop-pi-six.vercel.app').replace(/\/$/, '');
const config = JSON.parse(fs.readFileSync('config/app.json', 'utf8'));
const pickup = JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json', 'utf8'));
const rpc = process.env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0];
const client = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const admin = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account: admin, chain: avalancheFuji, transport: http(rpc) });
const role = keccak256(stringToHex('COLLECTOR_ROLE'));

const targets = new Set(args.filter(a => isAddress(a)).map(a => getAddress(a)));
if (args.includes('--from-server') || targets.size === 0) {
  const res = await fetch(`${app}/api/collector/verify-request`);
  const data = await res.json();
  for (const r of data.requests ?? []) if (isAddress(r.account)) targets.add(getAddress(r.account));
  console.log(`Pending requests on ${app}: ${(data.requests ?? []).length}`);
}
console.log(`Pickup ${config.pickupContract}, admin ${admin.address}`);
for (const account of targets) {
  if (await client.readContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'hasRole', args: [role, account] })) {
    console.log(`  ${account} already verified`); continue;
  }
  const { request } = await client.simulateContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'grantRole', args: [role, account], account: admin });
  const hash = await wallet.writeContract(request);
  await client.waitForTransactionReceipt({ hash });
  console.log(`  ${account} granted COLLECTOR_ROLE  https://testnet.snowtrace.io/tx/${hash}`);
}
