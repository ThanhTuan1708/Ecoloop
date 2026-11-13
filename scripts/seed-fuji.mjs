// Creates a small set of TEST lots on the EcoLoop pickup V3 contract with real transactions,
// so every stage of the flow can be checked on Fuji: open → claimed (escrow locked) → proposed → completed (paid + NFT).
// These are test transactions made with your own test wallets. Label them as tests when you show them;
// real activity should come from real households and collectors using the app (see docs/DU-LIEU-THAT.md).
//
// .env (dedicated Fuji TEST wallets only, never a wallet holding real funds):
//   DEPLOYER_PRIVATE_KEY  admin of the pickup contract (grants the collector role)
//   SEED_HOUSEHOLD_KEYS   one or more household wallets, comma separated
//   SEED_COLLECTOR_KEY    collector wallet (locks AVAX in escrow, needs ~0.05 test AVAX)
//   SEED_SERVER_URL       optional, e.g. http://127.0.0.1:4174 — uploads photos + contact so "Xem liên hệ" works
// Optional: put real photos of scrap lots in seed-photos/ (jpg, png, webp). Each lot uses one photo.
//
// Usage: npm run seed:fuji            (add -- --dry-run to only print the plan)
//        npm run seed:local           (local Hardhat node)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createPublicClient, createWalletClient, formatEther, http, keccak256, stringToHex, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { codeHash } from '../server/codehash.mjs';
import { avalancheFuji, hardhat } from 'viem/chains';

const args = process.argv.slice(2);
const local = args.includes('--local');
const dryRun = args.includes('--dry-run');
const chain = local ? hardhat : avalancheFuji;
const rpc = local ? 'http://127.0.0.1:8545' : (process.env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0]);
const explorer = local ? '' : 'https://testnet.snowtrace.io';
const keyPattern = /^0x[0-9a-fA-F]{64}$/;
function fail(message) { console.error('\n[!] ' + message); process.exit(1); }

const pickup = JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('config/app.json', 'utf8'));
const contractArg = args.find(a => a.startsWith('--contract='))?.split('=')[1];
const address = contractArg || (config.chainId === chain.id ? config.pickupContract : undefined);
if (!address || !isAddress(address)) fail('No pickup contract for this chain. Deploy V3 first: npm run deploy:pickup:fuji');

const adminKey = process.env.DEPLOYER_PRIVATE_KEY;
const householdKeys = String(process.env.SEED_HOUSEHOLD_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
const collectorKey = process.env.SEED_COLLECTOR_KEY;
if (!keyPattern.test(adminKey || '')) fail('Set DEPLOYER_PRIVATE_KEY (pickup admin, test wallet) in .env');
if (!householdKeys.length || !householdKeys.every(k => keyPattern.test(k))) fail('Set SEED_HOUSEHOLD_KEYS (one or more test wallets, comma separated) in .env');
if (!keyPattern.test(collectorKey || '')) fail('Set SEED_COLLECTOR_KEY (collector test wallet) in .env');

const client = createPublicClient({ chain, transport: http(rpc) });
if (await client.getChainId() !== chain.id) fail('RPC chain mismatch');
const code = await client.getCode({ address });
if (codeHash(code, pickup.immutables) !== pickup.runtimeHash) fail(`${address} is not the EcoLoop pickup V3 contract compiled from this repo.`);

const admin = privateKeyToAccount(adminKey);
const households = householdKeys.map(k => privateKeyToAccount(k));
const collector = privateKeyToAccount(collectorKey);
const walletOf = account => createWalletClient({ account, chain, transport: http(rpc) });
const read = (functionName, fnArgs = []) => client.readContract({ address, abi: pickup.abi, functionName, args: fnArgs });
async function send(account, functionName, fnArgs = [], value) {
  const { request } = await client.simulateContract({ address, abi: pickup.abi, functionName, args: fnArgs, account, ...(value !== undefined ? { value } : {}) });
  const hash = await walletOf(account).writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} failed: ${hash}`);
  return hash;
}

// Optional real photos
const photoDir = path.resolve('seed-photos');
const photos = fs.existsSync(photoDir) ? fs.readdirSync(photoDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => path.join(photoDir, f)) : [];
const server = process.env.SEED_SERVER_URL?.replace(/\/$/, '');
const sha256 = bytes => '0x' + createHash('sha256').update(bytes).digest('hex');
const mime = file => /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg';
async function authorize(account, action, hash) {
  const identity = { action, account: account.address, contract: address, hash };
  const r = await fetch(`${server}/api/evidence/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity) });
  if (!r.ok) throw new Error('challenge: ' + (await r.text()));
  const { nonce, message } = await r.json();
  return { ...identity, nonce, signature: await account.signMessage({ message }) };
}
async function uploadPhoto(account, file, evidence, contact, addressText) {
  const bytes = fs.readFileSync(file);
  const auth = await authorize(account, 'upload', evidence);
  let r = await fetch(`${server}/api/evidence/upload`, { method: 'POST', headers: { 'Content-Type': mime(file), 'X-EcoLoop-Auth': Buffer.from(JSON.stringify(auth)).toString('base64') }, body: bytes });
  if (!r.ok) throw new Error('upload: ' + (await r.text()));
  const payload = JSON.stringify({ evidence, contact, address: addressText });
  const detailAuth = await authorize(account, 'pickup-save', sha256(Buffer.from(payload)));
  r = await fetch(`${server}/api/pickup/details`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auth: detailAuth, payload }) });
  if (!r.ok) throw new Error('details: ' + (await r.text()));
}

// Four test lots per run, one per stage. Weights in grams: plastic, paper, metal, glass. Coordinates ×100 (~1 km).
const plan = [
  { stage: 'completed', weights: [3000n, 5000n, 1000n, 0n], actual: [2800n, 4900n, 1000n, 0n], lat: 1073, lng: 10672, area: 'Quận 7, TP.HCM' },
  { stage: 'proposed',  weights: [2000n, 0n, 1500n, 0n],    actual: [1900n, 0n, 1600n, 0n],    lat: 1080, lng: 10671, area: 'Bình Thạnh, TP.HCM' },
  { stage: 'claimed',   weights: [0n, 12000n, 0n, 0n],      lat: 1078, lng: 10668, area: 'Quận 3, TP.HCM' },
  { stage: 'open',      weights: [1500n, 2000n, 0n, 3000n], lat: 1085, lng: 10675, area: 'TP. Thủ Đức' },
];

const role = keccak256(stringToHex('COLLECTOR_ROLE'));
const balance = async a => Number(formatEther(await client.getBalance({ address: a.address })));
console.log(`EcoLoop TEST seed on chain ${chain.id}\n  Contract:   ${address}\n  Admin:      ${admin.address} (${await balance(admin)} AVAX)\n  Collector:  ${collector.address} (${await balance(collector)} AVAX)`);
for (const h of households) console.log(`  Household:  ${h.address} (${await balance(h)} AVAX)`);
console.log(`  Photos:     ${photos.length ? photos.length + ' in seed-photos/' : 'none (evidence = hash of a test label)'}${server ? ' · uploading to ' + server : ''}`);
console.log('\nPlan:');
plan.forEach((p, i) => console.log(`  ${i + 1}. ${p.stage.padEnd(9)} ${p.weights.map(w => Number(w) / 1000).join(' / ')} kg · ${p.area}`));
if (dryRun) { console.log('\n--dry-run: nothing sent.'); process.exit(0); }
if (photos.length && !server) fail('Photos found but SEED_SERVER_URL is not set: the app could not show them. Set SEED_SERVER_URL or remove seed-photos/.');

if (!await read('hasRole', [role, collector.address])) {
  console.log('\nGranting COLLECTOR_ROLE to the collector…');
  await send(admin, 'grantRole', [role, collector.address]);
}

const log = { chainId: chain.id, contract: address, test: true, createdAt: new Date().toISOString(), lots: [] };
const tx = h => explorer ? `${explorer}/tx/${h}` : h;
for (const [i, p] of plan.entries()) {
  const household = households[i % households.length];
  const photo = photos[i];
  const label = `EcoLoop TEST lot ${Date.now()}-${i}`;
  const evidence = photo ? sha256(fs.readFileSync(photo)) : keccak256(stringToHex(label));
  if (photo) await uploadPhoto(household, photo, evidence, 'Lô thử nghiệm EcoLoop (ví test)', `${p.area} · lô thử nghiệm, không phải địa chỉ thật`);
  const entry = { stage: p.stage, household: household.address, evidence, txs: {} };
  entry.txs.create = await send(household, 'createLot', [p.weights, evidence, p.lat, p.lng]);
  const id = await read('lotCount');
  entry.id = Number(id);
  if (p.stage !== 'open') {
    const deposit = await read('requiredDeposit', [id]);
    entry.txs.claim = await send(collector, 'claimLot', [id], deposit);
    entry.depositAvax = formatEther(deposit);
  }
  if (p.stage === 'proposed' || p.stage === 'completed') entry.txs.propose = await send(collector, 'proposeLot', [id, p.actual]);
  if (p.stage === 'completed') {
    entry.txs.accept = await send(household, 'acceptLot', [id]);
    entry.paidAvax = formatEther((await read('getLot', [id])).paid);
  }
  log.lots.push(entry);
  console.log(`\nLot #${entry.id} → ${p.stage}${entry.depositAvax ? ` · escrow ${entry.depositAvax} AVAX` : ''}${entry.paidAvax ? ` · paid ${entry.paidAvax} AVAX + NFT` : ''}`);
  for (const [k, h] of Object.entries(entry.txs)) console.log(`   ${k.padEnd(7)} ${tx(h)}`);
}
fs.mkdirSync('deployments', { recursive: true });
const file = `deployments/seed-${chain.id}-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(log, null, 2));
const certificate = await read('certificate');
console.log(`\nDone. Log: ${file}\nCertificate NFT contract: ${certificate}${explorer ? `\n${explorer}/address/${address}` : ''}\nRemember: these are TEST lots from your own test wallets.`);
