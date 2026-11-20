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

  // Pick completed lots whose ECOREC certificate is verified (settled by a station); unverified ones are refused on-chain.
  const certAbi = JSON.parse(fs.readFileSync('artifacts/EcoLoopCertificate.json', 'utf8')).abi;
  const maxLots = Number(env.ICM_MAX_LOTS || 5);
  let lotIds = env.ICM_LOT_ID ? env.ICM_LOT_ID.split(',').map(s => BigInt(s.trim())) : [];
  if (!lotIds.length) {
    const count = await src.client.readContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'lotCount' });
    for (let id = 1n; id <= count && lotIds.length < maxLots; id++) {
      const lot = await src.client.readContract({ address: config.pickupContract, abi: pickup.abi, functionName: 'getLot', args: [id] });
      if (Number(lot.status) !== 4) continue;
      const cert = await src.client.readContract({ address: certificate, abi: certAbi, functionName: 'certificate', args: [id] });
      if (cert.verified) lotIds.push(id);
    }
  }
  if (!lotIds.length) fail('No verified completed lot yet. Run npm run seed:scenarios (or complete a lot with a verified station), then rerun with ICM_SOURCE_BRIDGE and ICM_DEST_BRIDGE set.');
  const zero = '0x' + '0'.repeat(64);
  record.messages = [];
  for (const lotId of lotIds) {
    const entry = { lotId: lotId.toString() };
    const existing = await readBridge(src, srcBridge, 'outboundMessageIds', [dstId, lotId]);
    if (existing === zero) { const sent = await write(src, srcBridge, 'bridgeCertificate', [dstId, lotId, 0n]); entry.bridgeTx = sent.hash; entry.messageId = sent.result; }
    else { entry.messageId = existing; console.log(`  Lot #${lotId} was already sent (message ${existing}).`); }
    const previous = (JSON.parse(fs.existsSync('deployments/icm-latest.json') ? fs.readFileSync('deployments/icm-latest.json', 'utf8') : '{}').messages || []).find(m => m.lotId === entry.lotId && m.messageId === entry.messageId);
    if (previous?.bridgeTx && !entry.bridgeTx) entry.bridgeTx = previous.bridgeTx;
    record.messages.push(entry);
  }

  const waitSeconds = Number(env.ICM_WAIT_SECONDS || 300);
  process.stdout.write(`  Waiting up to ${waitSeconds}s for an ICM relayer to deliver ${record.messages.length} message(s) `);
  const deadline = Date.now() + waitSeconds * 1000;
  const pending = () => record.messages.filter(m => !m.delivered);
  while (Date.now() < deadline && pending().length) {
    for (const m of pending()) if (await readBridge(dst, dstBridge, 'hasInboundAttestation', [srcId, BigInt(m.lotId)])) m.delivered = true;
    if (!pending().length) break;
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 10_000));
  }
  console.log(pending().length ? ` ${record.messages.length - pending().length}/${record.messages.length} delivered.` : ' all delivered!');
  // Find the delivery transaction on the destination L1 for each attestation.
  const receivedEvent = bridge.abi.find(x => x.type === 'event' && x.name === 'ImpactAttestationReceived');
  const latest = await dst.client.getBlockNumber();
  const logs = await dst.client.getLogs({ address: dstBridge, event: receivedEvent, fromBlock: latest > 5000n ? latest - 5000n : 0n, toBlock: latest }).catch(() => []);
  for (const m of record.messages.filter(m => m.delivered)) {
    const att = await readBridge(dst, dstBridge, 'getInboundAttestation', [srcId, BigInt(m.lotId)]);
    m.received = { household: att.household, collector: att.collector, grams: att.grams.map(String), paidEco: att.paidEco.toString() };
    m.deliveryTx = logs.find(l => l.args.lotId === BigInt(m.lotId))?.transactionHash;
    console.log(`  Lot #${m.lotId}: Fuji ${txLink(src, m.bridgeTx || '')} -> ${dst.name} ${m.deliveryTx ? txLink(dst, m.deliveryTx) : '(delivered)'}`);
  }
  Object.assign(record, { lotId: record.messages[0].lotId, messageId: record.messages[0].messageId, bridgeTx: record.messages[0].bridgeTx, delivered: record.messages.every(m => m.delivered) });
  if (!record.delivered) console.log('  Check that an ICM relayer runs between Fuji and your L1, then rerun with ICM_SOURCE_BRIDGE/ICM_DEST_BRIDGE to keep waiting.');
}

fs.mkdirSync('deployments', { recursive: true });
fs.writeFileSync('deployments/icm-latest.json', JSON.stringify(record, null, 2) + '\n');
fs.writeFileSync('config/app.json', JSON.stringify({ ...config, teleporterBridge: record.source.address, ...(record.destination ? { icmDestination: { name: record.destination.chain, chainId: record.destination.chainId, blockchainId: record.destination.blockchainId, sourceBlockchainId: record.source.blockchainId, bridge: record.destination.address, rpc: record.destination.rpc, explorer: record.destination.explorer } } : {}) }, null, 2) + '\n');
updateReadmeContracts();
console.log(`
Saved deployments/icm-latest.json and config/app.json (teleporterBridge).
Source bridge: ${fujiExplorer}/address/${record.source.address}${record.bridgeTx ? `\nICM send tx:   ${fujiExplorer}/tx/${record.bridgeTx}` : ''}${record.destination ? `\nDestination:   ${record.destination.chain} bridge ${record.destination.address}` : ''}
Next: npm run verify:fuji, then commit deployments/ and config/app.json.`);
