// Runs every EcoLoop flow end-to-end on Fuji with real transactions from dedicated TEST wallets, and writes
// a proof log (deployments/scenarios-<chainId>-<ts>.json) plus docs/ON-CHAIN-PROOF.md with a Snowtrace link per tx.
//
// Flows per round:
//   A  verified station locks its own ECO escrow  -> household accepts (gasless)    -> verified ECOREC
//   B  verified station with 0 ECO / 0 AVAX uses the sponsor pool, every step gasless via ERC-2771
//   C  unverified peer-to-peer collector           -> unverified ECOREC (not counted for ESG / missions)
//   D  household disputes the weigh-in (gasless)   -> collector re-weighs -> accepted
//   E  collector releases the job (100% refund)    -> sponsored station takes it over and completes it
//   F  household cancels an open lot (gasless)
// Then: G reward redemption (gasless, burns ECO) + station fulfils delivery, H daily check-in and missions.
// Finally a few lots are left open / claimed / proposed so the live app has work to show.
//
// Wallets: DEPLOYER_PRIVATE_KEY (admin), SEED_COLLECTOR_KEY (verified station), RELAYER_PRIVATE_KEY (pays gas for
// signed ERC-2771 requests). Extra household / station keys are derived deterministically from the deployer key,
// so they are reproducible test wallets and never need to be stored. Testnet only.
//
// Usage: npm run seed:scenarios            (ROUNDS=4 by default; add -- --dry-run to print the plan)
import fs from 'node:fs';
import { createPublicClient, createWalletClient, encodeFunctionData, encodePacked, formatEther, getAddress, http, keccak256, parseEther, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { codeHash } from '../server/codehash.mjs';

const env = process.env, args = process.argv.slice(2), dryRun = args.includes('--dry-run');
const ROUNDS = Number(env.ROUNDS || 4);
const keyPattern = /^0x[0-9a-fA-F]{64}$/;
function fail(m) { console.error('\n[!] ' + m); process.exit(1); }
for (const k of ['DEPLOYER_PRIVATE_KEY', 'SEED_COLLECTOR_KEY', 'RELAYER_PRIVATE_KEY']) if (!keyPattern.test(env[k] || '')) fail(`Set ${k} in .env / .env.local (dedicated Fuji test wallet).`);

const art = n => JSON.parse(fs.readFileSync(`artifacts/${n}.json`, 'utf8'));
const pickupArt = art('EcoLoopPickup'), forwarderArt = art('EcoLoopForwarder'), rewardsArt = art('EcoLoopRewards'), certArt = art('EcoLoopCertificate');
const config = JSON.parse(fs.readFileSync('config/app.json', 'utf8'));
if (config.chainId !== 43113) fail('config/app.json is not a Fuji config.');
const pickup = getAddress(config.pickupContract), forwarder = getAddress(config.forwarderContract), rewards = getAddress(config.rewardsContract), certificate = getAddress(config.certificateContract);
const rpc = env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0];
const client = createPublicClient({ chain: avalancheFuji, transport: http(rpc), pollingInterval: 500 });
if (codeHash(await client.getCode({ address: pickup }), pickupArt.immutables) !== pickupArt.runtimeHash) fail(`${pickup} is not the pickup V4 compiled from this repo. Run npm run deploy:pickup:fuji first.`);

const derive = label => privateKeyToAccount(keccak256(encodePacked(['bytes32', 'string'], [env.DEPLOYER_PRIVATE_KEY, `ecoloop-test-wallet:${label}`])));
const admin = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const relayer = privateKeyToAccount(env.RELAYER_PRIVATE_KEY);
const station = privateKeyToAccount(env.SEED_COLLECTOR_KEY); // verified, has AVAX + ECO
const sponsoredStation = derive('station-sponsored'); // verified, 0 ECO, 0 AVAX: everything gasless
const peer = derive('collector-p2p'); // unverified collector, pays own gas
const households = [...String(env.SEED_HOUSEHOLD_KEYS || '').split(',').map(s => s.trim()).filter(k => keyPattern.test(k)).map(k => privateKeyToAccount(k)), ...Array.from({ length: 6 }, (_, i) => derive(`household-${i + 1}`))];
const name = new Map([[admin.address, 'admin'], [relayer.address, 'relayer'], [station.address, 'station'], [sponsoredStation.address, 'station-sponsored'], [peer.address, 'collector-p2p'], ...households.map((h, i) => [h.address, `household-${i + 1}`])]);

const wallet = a => createWalletClient({ account: a, chain: avalancheFuji, transport: http(rpc) });
const read = (fn, a = [], address = pickup, abi = pickupArt.abi) => client.readContract({ address, abi, functionName: fn, args: a });
const proof = { chainId: 43113, test: true, createdAt: new Date().toISOString(), contracts: { pickup, forwarder, certificate, rewards }, wallets: Object.fromEntries([...name].map(([a, n]) => [n, a])), flows: {}, txs: [] };
const record = (flow, step, from, hash, gasless, extra = {}) => { proof.txs.push({ flow, step, from: name.get(from) || from, gasless, hash, ...extra }); (proof.flows[flow] ||= []).push(hash); console.log(`  ${flow.padEnd(10)} ${step.padEnd(26)} ${(name.get(from) || from).padEnd(18)} ${gasless ? 'gasless ' : '        '}https://testnet.snowtrace.io/tx/${hash}`); };

async function direct(flow, account, fn, a = [], { value, address = pickup, abi = pickupArt.abi } = {}) {
  const { request, result } = await client.simulateContract({ address, abi, functionName: fn, args: a, account, ...(value ? { value } : {}) });
  const hash = await wallet(account).writeContract(request);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${fn} failed ${hash}`);
  record(flow, fn, account.address, hash, false);
  return result;
}
const RELAY_GAS = { createLot: 450_000n, claimLotSponsored: 350_000n, proposeLot: 250_000n, acceptLot: 800_000n, disputeLot: 150_000n, cancelLot: 120_000n, releaseLot: 200_000n, redeemReward: 250_000n };
async function gasless(flow, account, fn, a = []) {
  const data = encodeFunctionData({ abi: pickupArt.abi, functionName: fn, args: a });
  const nonce = await read('nonces', [account.address], forwarder, forwarderArt.abi);
  const gas = RELAY_GAS[fn] || 400_000n, deadline = Math.floor(Date.now() / 1000) + 600;
  const signature = await account.signTypedData({ domain: { name: 'EcoLoopForwarder', version: '1', chainId: 43113, verifyingContract: forwarder }, types: { ForwardRequest: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'gas', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint48' }, { name: 'data', type: 'bytes' }] }, primaryType: 'ForwardRequest', message: { from: account.address, to: pickup, value: 0n, gas, nonce, deadline, data } });
  const request = { from: account.address, to: pickup, value: 0n, gas, deadline, data, signature };
  // Simulate the inner call as the user first, so a revert reason is readable instead of a silent forwarder failure.
  await client.simulateContract({ address: pickup, abi: pickupArt.abi, functionName: fn, args: a, account });
  const { request: exec } = await client.simulateContract({ address: forwarder, abi: forwarderArt.abi, functionName: 'execute', args: [request], account: relayer });
  const hash = await wallet(relayer).writeContract(exec);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`relayed ${fn} failed ${hash}`);
  record(flow, fn, account.address, hash, true);
}

// Deterministic pseudo-random weights / areas so reruns produce varied but plausible lots.
let seed = Number(env.SCENARIO_SEED || Date.now() % 100000);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const kg = (min, max) => BigInt(Math.round((min + rnd() * (max - min)) * 10) * 100);
const areas = [[1073, 10672, 'Quận 7'], [1080, 10671, 'Bình Thạnh'], [1078, 10668, 'Quận 3'], [1085, 10675, 'Thủ Đức'], [2103, 10585, 'Hoàn Kiếm'], [2101, 10580, 'Đống Đa'], [1606, 10822, 'Hải Châu'], [1003, 10578, 'Ninh Kiều']];
const estimate = () => { const w = [kg(0, 4), kg(0, 8), kg(0, 2), kg(0, 3)]; if (w.every(x => x === 0n)) w[1] = 3000n; return w; };
const weighIn = est => est.map(g => g === 0n ? 0n : BigInt(Math.max(100, Math.round(Number(g) * (0.85 + rnd() * 0.25) / 100) * 100)));
let lotSerial = 0;
async function createLot(flow, household) {
  const [lat, lng, area] = areas[Math.floor(rnd() * areas.length)];
  const est = estimate();
  await gasless(flow, household, 'createLot', [est, keccak256(stringToHex(`EcoLoop TEST scenario ${proof.createdAt} #${++lotSerial}`)), lat, lng]);
  const id = await read('lotCount');
  proof.txs.at(-1).lot = Number(id); proof.txs.at(-1).area = area;
  return { id, est };
}
const claim = async (flow, collector, id) => collector === sponsoredStation
  ? gasless(flow, collector, 'claimLotSponsored', [id, await read('requiredDeposit', [id])])
  : direct(flow, collector, 'claimLot', [id, await read('requiredDeposit', [id])]);
const propose = (flow, collector, id, actual) => collector === sponsoredStation ? gasless(flow, collector, 'proposeLot', [id, actual]) : direct(flow, collector, 'proposeLot', [id, actual]);

// ---------------- setup ----------------
const bal = async a => formatEther(await client.getBalance({ address: a.address }));
console.log(`EcoLoop TEST scenarios on Fuji · pickup ${pickup}\n  admin ${admin.address} ${await bal(admin)} AVAX · relayer ${relayer.address} ${await bal(relayer)} AVAX · station ${station.address} ${await bal(station)} AVAX`);
console.log(`  ${households.length} households, sponsored station ${sponsoredStation.address}, p2p collector ${peer.address}, ${ROUNDS} rounds`);
if (dryRun) process.exit(0);

const ROLE = await read('COLLECTOR_ROLE');
for (const s of [station, sponsoredStation]) if (!await read('hasRole', [ROLE, s.address])) await direct('setup', admin, 'grantRole', [ROLE, s.address]);
// Small AVAX top-ups: the p2p collector and households pay their own gas only for buyEco / check-in (rewards contract is not ERC-2771).
async function topUp(account, min, amount) {
  if (await client.getBalance({ address: account.address }) >= parseEther(min)) return;
  const hash = await wallet(admin).sendTransaction({ to: account.address, value: parseEther(amount) });
  await client.waitForTransactionReceipt({ hash });
  record('setup', 'fund AVAX ' + amount, admin.address, hash, false, { to: name.get(account.address) });
}
await topUp(relayer, '0.05', '0.1');
await topUp(peer, '0.02', '0.05');
for (const h of households) await topUp(h, '0.0005', '0.001');
// ECO comes from the on-chain testnet exchange. A wallet without enough AVAX gets ECO bought by the admin and transferred.
async function needEco(account, amount) {
  const have = await read('balanceOf', [account.address]);
  if (have >= amount) return;
  const want = amount - have, rate = await read('ecoPerAvax'), avax = (want * 10n ** 18n + rate - 1n) / rate + 1n;
  const buyer = await client.getBalance({ address: account.address }) > avax + parseEther('0.01') ? account : admin;
  await direct('setup', buyer, 'buyEco', [want], { value: avax });
  if (buyer !== account) await direct('setup', admin, 'transfer', [account.address, want]);
}
// Budget for ROUNDS rounds: station pays ~2 lots/round + one live escrow, p2p collector 1 lot/round.
await needEco(station, parseEther(String(250 * ROUNDS + 400)));
await needEco(peer, parseEther(String(120 * ROUNDS + 350)));
const rewardsEco = await read('balanceOf', [rewards]);
if (rewardsEco < parseEther('600')) { const add = parseEther('600') - rewardsEco; await needEco(admin, add); await direct('setup', admin, 'transfer', [rewards, add]); }

// ---------------- flows ----------------
let h = 0;
const nextHousehold = () => households[h++ % households.length];
for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\nRound ${round}/${ROUNDS}`);
  { const u = nextHousehold(), { id, est } = await createLot('A-escrow', u); await claim('A-escrow', station, id); await propose('A-escrow', station, id, weighIn(est)); await gasless('A-escrow', u, 'acceptLot', [id]); }
  { const u = nextHousehold(), { id, est } = await createLot('B-sponsor', u); await claim('B-sponsor', sponsoredStation, id); await propose('B-sponsor', sponsoredStation, id, weighIn(est)); await gasless('B-sponsor', u, 'acceptLot', [id]); }
  { const u = nextHousehold(), { id, est } = await createLot('C-p2p', u); await claim('C-p2p', peer, id); await propose('C-p2p', peer, id, weighIn(est)); await gasless('C-p2p', u, 'acceptLot', [id]); }
  { const u = nextHousehold(), { id, est } = await createLot('D-dispute', u); await claim('D-dispute', station, id); await propose('D-dispute', station, id, est.map(g => g / 2n)); await gasless('D-dispute', u, 'disputeLot', [id]); await propose('D-dispute', station, id, weighIn(est)); await gasless('D-dispute', u, 'acceptLot', [id]); }
  { const u = nextHousehold(), { id, est } = await createLot('E-release', u); await claim('E-release', station, id); await direct('E-release', station, 'releaseLot', [id]); await claim('E-release', sponsoredStation, id); await propose('E-release', sponsoredStation, id, weighIn(est)); await gasless('E-release', u, 'acceptLot', [id]); }
  if (round % 2 === 1) { const u = nextHousehold(), { id } = await createLot('F-cancel', u); await gasless('F-cancel', u, 'cancelLot', [id]); }
}

// G: rewards redemption (gasless burn) and fulfilment by the station
console.log('\nRewards');
const rewardCount = await read('rewardCount');
for (const u of households) {
  const ecoBal = await read('balanceOf', [u.address]);
  for (let r = rewardCount; r >= 1n; r--) {
    const [, cost, stock, active] = await read('rewards', [r]);
    if (active && stock > 0n && ecoBal >= cost) {
      await gasless('G-redeem', u, 'redeemReward', [r]);
      const redemption = await read('redemptionCount');
      await direct('G-redeem', station, 'fulfillRewardRedemption', [redemption]);
      break;
    }
  }
}
// H: check-in + missions for households with verified recycling (anti-Sybil: unverified wallets are refused)
const day = await read('currentDay', [], rewards, rewardsArt.abi);
for (const u of households) {
  const s = await read('rewardStatus', [u.address], rewards, rewardsArt.abi);
  if (s.recycledGrams === 0n) continue;
  if (!s.checkInClaimed) await direct('H-checkin', u, 'claimCheckIn', [day], { address: rewards, abi: rewardsArt.abi });
  for (const [i, m] of s.missions.entries()) if (!m.claimed && s.recycledGrams >= m.targetGrams) await direct('H-mission', u, 'claimMission', [i], { address: rewards, abi: rewardsArt.abi });
}

// Live state for the demo: one open, one claimed (sponsored), one awaiting the household's acceptance.
console.log('\nLive demo state');
await createLot('live-open', nextHousehold());
{ const { id } = await createLot('live-claimed', nextHousehold()); await claim('live-claimed', sponsoredStation, id); }
{ const { id, est } = await createLot('live-proposed', nextHousehold()); await claim('live-proposed', station, id); await propose('live-proposed', station, id, weighIn(est)); }

// ---------------- summary ----------------
const [lots, certs, verifiedGrams, totalPaid, pool] = await Promise.all([read('lotCount'), read('totalSupply', [], certificate, certArt.abi), read('totalVerifiedGrams'), read('totalPaid'), read('sponsorPool')]);
proof.summary = { transactions: proof.txs.length, gasless: proof.txs.filter(t => t.gasless).length, lots: Number(lots), certificates: Number(certs), verifiedKg: Number(verifiedGrams) / 1000, totalPaidEco: formatEther(totalPaid), sponsorPoolEco: formatEther(pool), wallets: new Set(proof.txs.map(t => t.from)).size };
fs.mkdirSync('deployments', { recursive: true });
const file = `deployments/scenarios-43113-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(proof, null, 2) + '\n');
writeProofDoc();
console.log(`\nDone: ${proof.summary.transactions} tx (${proof.summary.gasless} gasless) from ${proof.summary.wallets} wallets · ${proof.summary.lots} lots · ${proof.summary.certificates} ECOREC\nLog: ${file} · docs/ON-CHAIN-PROOF.md updated.`);

function writeProofDoc() {
  const logs = fs.readdirSync('deployments').filter(f => /^scenarios-43113-\d+\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(`deployments/${f}`, 'utf8'))).filter(l => l.contracts.pickup === pickup);
  const txs = logs.flatMap(l => l.txs);
  const titles = { 'A-escrow': 'A · Trạm xác minh khóa ký quỹ ECO 120%', 'B-sponsor': 'B · Trạm 0 ECO/0 AVAX dùng quỹ ứng trước (toàn bộ miễn gas)', 'C-p2p': 'C · Người thu gom chưa xác minh (P2P, NFT không verified)', 'D-dispute': 'D · Hộ dân yêu cầu cân lại rồi chấp nhận', 'E-release': 'E · Trả đơn (hoàn 100% ký quỹ), trạm khác nhận tiếp', 'F-cancel': 'F · Hộ dân hủy lô đang mở', 'G-redeem': 'G · Đổi quà (đốt ECO) + trạm xác nhận giao', 'H-checkin': 'H · Điểm danh (chỉ ví có lô đã xác minh)', 'H-mission': 'H · Nhiệm vụ tái chế', 'live-open': 'Trạng thái demo: lô đang mở', 'live-claimed': 'Trạng thái demo: lô đã nhận', 'live-proposed': 'Trạng thái demo: chờ hộ dân xác nhận', setup: 'Chuẩn bị (cấp quyền, nạp AVAX/ECO test)' };
  const s = logs.at(-1).summary;
  let md = `# Bằng chứng on-chain (Avalanche Fuji)\n\n> Đây là **giao dịch kiểm thử** do nhóm chạy bằng các ví test (\`npm run seed:scenarios\`), không phải người dùng thật. Mục đích: chứng minh mọi luồng của contract chạy thật trên Fuji. File được tạo tự động từ \`deployments/scenarios-43113-*.json\`.\n\n`;
  md += `Contract: [EcoLoopPickup V4](https://testnet.snowtrace.io/address/${pickup}) · [Forwarder](https://testnet.snowtrace.io/address/${forwarder}) · [ECOREC](https://testnet.snowtrace.io/address/${certificate}) · [Rewards](https://testnet.snowtrace.io/address/${rewards})\n\n`;
  md += `| Chỉ số | Giá trị |\n|---|---|\n| Giao dịch trong kịch bản | ${txs.length} |\n| Trong đó miễn gas (ERC-2771 qua relayer) | ${txs.filter(t => t.gasless).length} |\n| Số ví tham gia | ${new Set(txs.map(t => t.from)).size} |\n| Tổng số lô trên contract | ${s.lots} |\n| Chứng nhận ECOREC đã đúc | ${s.certificates} |\n| Khối lượng đã xác minh | ${s.verifiedKg} kg |\n| ECO đã trả từ ký quỹ | ${Number(s.totalPaidEco).toFixed(2)} |\n\n`;
  for (const [flow, title] of Object.entries(titles)) {
    const rows = txs.filter(t => t.flow === flow);
    if (!rows.length) continue;
    md += `## ${title}\n\n| Bước | Ví | Lô | Gas | Tx |\n|---|---|---|---|---|\n`;
    let lot;
    for (const t of rows) { if (t.lot) lot = t.lot; md += `| \`${t.step}\` | ${t.from}${t.to ? ' → ' + t.to : ''} | ${t.step === 'createLot' || t.flow.startsWith('A') || t.flow.startsWith('B') || t.flow.startsWith('C') || t.flow.startsWith('D') || t.flow.startsWith('E') || t.flow.startsWith('live') ? '#' + (t.lot || lot || '') : ''} | ${t.gasless ? 'relayer trả' : 'ví tự trả'} | [${t.hash.slice(0, 10)}…](https://testnet.snowtrace.io/tx/${t.hash}) |\n`; }
    md += '\n';
  }
  fs.writeFileSync('docs/ON-CHAIN-PROOF.md', md);
}
