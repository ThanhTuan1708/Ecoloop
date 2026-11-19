// Deploys EcoLoopTeleporterBridge on Fuji C-Chain (source) and on a destination Avalanche L1 (receive-only),
// links them as trusted remotes, then sends one real ECOREC recycling attestation through Avalanche ICM (Teleporter)
// and waits until the destination L1 has received it.
//
// Run after deploy:pickup:fuji and seed:fuji (a completed lot / ECOREC certificate must exist).
// Usage: npm run deploy:bridge:fuji
//
// .env:
//   DEPLOYER_PRIVATE_KEY     Fuji test wallet (admin of the pickup contract, so it may bridge any certificate)
//   ICM_DEST_RPC_URL         RPC of the destination Avalanche L1 (e.g. an L1 created in the Builder Console with ICM enabled)
//   ICM_DEST_PRIVATE_KEY     optional, funded wallet on the destination L1 (defaults to DEPLOYER_PRIVATE_KEY)
//   ICM_DEST_NAME            optional label, e.g. "EcoLoop ESG L1"
//   ICM_DEST_EXPLORER        optional explorer base URL of the destination L1
//   ICM_TELEPORTER           optional TeleporterMessenger address (default canonical 0x253b…5fcf on both chains)
//   ICM_LOT_ID               optional lot/certificate id to bridge (default: first completed lot)
//   ICM_WAIT_SECONDS         optional, how long to wait for delivery (default 300)
//   ICM_SOURCE_BRIDGE / ICM_DEST_BRIDGE  optional, reuse bridges deployed by an earlier run
// Without ICM_DEST_RPC_URL only the Fuji source bridge is deployed.
// Delivery needs an ICM relayer between the two chains (the Builder Console can run one for your L1).
import fs from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, isAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { compile } from './compile.mjs';
import { updateReadmeContracts } from './readme-contracts.mjs';

const env = process.env;
const keyPattern = /^0x[0-9a-fA-F]{64}$/;
function fail(message) { console.error('\n[!] ' + message); process.exit(1); }
const TELEPORTER = getAddress(env.ICM_TELEPORTER || '0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf');
const WARP_PRECOMPILE = '0x0200000000000000000000000000000000000005';
const FUJI_C_CHAIN_ID = '0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5';
const warpAbi = [{ type: 'function', name: 'getBlockchainID', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] }];
const fujiExplorer = 'https://testnet.snowtrace.io';

if (!keyPattern.test(env.DEPLOYER_PRIVATE_KEY || '')) fail('Set DEPLOYER_PRIVATE_KEY in .env (dedicated Fuji test wallet).');
const sourceAccount = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const destKey = env.ICM_DEST_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
if (!keyPattern.test(destKey)) fail('ICM_DEST_PRIVATE_KEY is not a valid private key.');
const destAccount = privateKeyToAccount(destKey);

compile();
const bridge = JSON.parse(fs.readFileSync('artifacts/EcoLoopTeleporterBridge.json', 'utf8'));
const pickup = JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('config/app.json', 'utf8'));
if (config.chainId !== avalancheFuji.id || !isAddress(config.pickupContract || '')) fail('config/app.json has no Fuji pickupContract. Run npm run deploy:pickup:fuji first.');

const fujiRpc = env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0];
const src = {
  name: 'Avalanche Fuji C-Chain', explorer: fujiExplorer, account: sourceAccount,
  client: createPublicClient({ chain: avalancheFuji, transport: http(fujiRpc) }),
  wallet: createWalletClient({ account: sourceAccount, chain: avalancheFuji, transport: http(fujiRpc) }),
};
let dst;
if (env.ICM_DEST_RPC_URL) {
  const probe = createPublicClient({ transport: http(env.ICM_DEST_RPC_URL) });
  const id = await probe.getChainId();
  const chain = defineChain({ id, name: env.ICM_DEST_NAME || `Avalanche L1 ${id}`, nativeCurrency: { name: 'L1 token', symbol: 'L1', decimals: 18 }, rpcUrls: { default: { http: [env.ICM_DEST_RPC_URL] } } });
  dst = {
    name: chain.name, explorer: env.ICM_DEST_EXPLORER?.replace(/\/$/, ''), account: destAccount,
    client: createPublicClient({ chain, transport: http(env.ICM_DEST_RPC_URL) }),
    wallet: createWalletClient({ account: destAccount, chain, transport: http(env.ICM_DEST_RPC_URL) }),
  };
}

const txLink = (side, hash) => side.explorer ? `${side.explorer}/tx/${hash}` : hash;
async function blockchainId(side, fallback) {
  try { return await side.client.readContract({ address: WARP_PRECOMPILE, abi: warpAbi, functionName: 'getBlockchainID' }); }
  catch { if (fallback) return fallback; throw new Error(`Could not read the Avalanche blockchain ID of ${side.name} (Warp precompile not enabled?)`); }
}
async function requireTeleporter(side) {
  const code = await side.client.getCode({ address: TELEPORTER });
  if (!code || code === '0x') fail(`TeleporterMessenger ${TELEPORTER} is not deployed on ${side.name}. Enable ICM on the L1 or set ICM_TELEPORTER.`);
}
async function deploy(side, args) {
  const hash = await side.wallet.deployContract({ abi: bridge.abi, bytecode: bridge.bytecode, args });
  const receipt = await side.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) fail(`Bridge deployment failed on ${side.name}: ${hash}`);
  console.log(`  Bridge on ${side.name}: ${receipt.contractAddress}  ${txLink(side, hash)}`);
  return { address: getAddress(receipt.contractAddress), txHash: hash, args: args.map(String) };
}
async function write(side, address, functionName, args) {
  const { request, result } = await side.client.simulateContract({ address, abi: bridge.abi, functionName, args, account: side.account });
  const hash = await side.wallet.writeContract(request);
  const receipt = await side.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') fail(`${functionName} failed on ${side.name}: ${hash}`);
  console.log(`  ${functionName} on ${side.name}: ${txLink(side, hash)}`);
  return { hash, result };
}
const readBridge = (side, address, functionName, args = []) => side.client.readContract({ address, abi: bridge.abi, functionName, args });

console.log('EcoLoop Avalanche ICM bridge');
await requireTeleporter(src);
const certificate = getAddress(config.certificateContract || await src.client.readContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'certificate' }));
const srcId = await blockchainId(src, FUJI_C_CHAIN_ID);
const record = { createdAt: new Date().toISOString(), teleporter: TELEPORTER, certificate, source: { chain: src.name, blockchainId: srcId } };

Object.assign(record.source, env.ICM_SOURCE_BRIDGE
  ? { address: getAddress(env.ICM_SOURCE_BRIDGE), args: [sourceAccount.address, TELEPORTER, certificate] }
  : await deploy(src, [sourceAccount.address, TELEPORTER, certificate]));

if (dst) {
  await requireTeleporter(dst);
  const dstId = await blockchainId(dst);
  record.destination = { chain: dst.name, chainId: dst.client.chain.id, blockchainId: dstId, rpc: env.ICM_DEST_RPC_URL, explorer: dst.explorer };
  Object.assign(record.destination, env.ICM_DEST_BRIDGE
    ? { address: getAddress(env.ICM_DEST_BRIDGE), args: [destAccount.address, TELEPORTER, zeroAddress] }
    : await deploy(dst, [destAccount.address, TELEPORTER, zeroAddress]));
  const srcBridge = record.source.address, dstBridge = record.destination.address;
  if (getAddress(await readBridge(src, srcBridge, 'trustedRemotes', [dstId])) !== dstBridge) record.source.trustTx = (await write(src, srcBridge, 'setTrustedRemote', [dstId, dstBridge])).hash;
  if (getAddress(await readBridge(dst, dstBridge, 'trustedRemotes', [srcId])) !== srcBridge) record.destination.trustTx = (await write(dst, dstBridge, 'setTrustedRemote', [srcId, srcBridge])).hash;

  // Pick a completed lot (status 4) whose ECOREC certificate exists.
  let lotId = env.ICM_LOT_ID ? BigInt(env.ICM_LOT_ID) : undefined;
  if (lotId === undefined) {
    const count = await src.client.readContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'lotCount' });
    for (let id = 1n; id <= count && lotId === undefined; id++) {
      const lot = await src.client.readContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'getLot', args: [id] });
      if (Number(lot.status) === 4) lotId = id;
    }
  }
  if (lotId === undefined) fail('No completed lot yet. Run npm run seed:fuji (or complete a lot in the app), then rerun with ICM_SOURCE_BRIDGE and ICM_DEST_BRIDGE set.');
  record.lotId = lotId.toString();

  if (await readBridge(src, srcBridge, 'outboundMessageIds', [dstId, lotId]) === '0x' + '0'.repeat(64)) {
    const sent = await write(src, srcBridge, 'bridgeCertificate', [dstId, lotId, 0n]);
    record.bridgeTx = sent.hash;
    record.messageId = sent.result;
  } else {
    record.messageId = await readBridge(src, srcBridge, 'outboundMessageIds', [dstId, lotId]);
    console.log(`  Lot #${lotId} was already sent (message ${record.messageId}).`);
  }

  const waitSeconds = Number(env.ICM_WAIT_SECONDS || 300);
  process.stdout.write(`  Waiting up to ${waitSeconds}s for an ICM relayer to deliver message ${record.messageId} `);
  const deadline = Date.now() + waitSeconds * 1000;
  record.delivered = false;
  while (Date.now() < deadline) {
    if (await readBridge(dst, dstBridge, 'hasInboundAttestation', [srcId, lotId])) { record.delivered = true; break; }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 10_000));
  }
  console.log(record.delivered ? ' delivered!' : ' not delivered yet.');
  if (record.delivered) {
    const att = await readBridge(dst, dstBridge, 'getInboundAttestation', [srcId, lotId]);
    record.received = { household: att.household, collector: att.collector, grams: att.grams.map(String), paidEco: att.paidEco.toString() };
  } else {
    console.log('  Check that an ICM relayer runs between Fuji and your L1, then rerun with ICM_SOURCE_BRIDGE/ICM_DEST_BRIDGE to keep waiting.');
  }
}

fs.mkdirSync('deployments', { recursive: true });
fs.writeFileSync('deployments/icm-latest.json', JSON.stringify(record, null, 2) + '\n');
fs.writeFileSync('config/app.json', JSON.stringify({ ...config, teleporterBridge: record.source.address, ...(record.destination ? { icmDestination: { name: record.destination.chain, blockchainId: record.destination.blockchainId, bridge: record.destination.address } } : {}) }, null, 2) + '\n');
updateReadmeContracts();
console.log(`
Saved deployments/icm-latest.json and config/app.json (teleporterBridge).
Source bridge: ${fujiExplorer}/address/${record.source.address}${record.bridgeTx ? `\nICM send tx:   ${fujiExplorer}/tx/${record.bridgeTx}` : ''}${record.destination ? `\nDestination:   ${record.destination.chain} bridge ${record.destination.address}` : ''}
Next: npm run verify:fuji, then commit deployments/ and config/app.json.`);
