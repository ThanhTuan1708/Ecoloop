// Deploys the EcoLoop pickup V4 suite and activates it in config/app.json:
//   1. EcoLoopForwarder (gas-free relay for households)
//   2. EcoLoopPickup(admin, forwarder, ecoPerAvax, exchangeReserve) — ECO escrow; creates the EcoLoopCertificate NFT
//   3. EcoLoopRewards(pickup) — daily check-in & missions, funded with ECO bought on the testnet exchange
// Every address, tx hash and constructor argument is written to deployments/<chainId>-latest.json
// so the contracts can be verified on Snowtrace with `npm run verify:fuji`.
//
// Usage: npm run deploy:pickup:fuji   (needs DEPLOYER_PRIVATE_KEY of a dedicated Fuji test wallet in .env)
//        npm run deploy:pickup:local  (uses the local Hardhat node's first account)
// Optional .env:
//   ECO_PER_AVAX=1000            testnet exchange rate, so collectors can get ECO to lock as escrow (0 disables)
//   EXCHANGE_RESERVE_ECO=1000000 ECO minted into the exchange at deployment
//   REWARDS_FUND_AVAX=0.2        AVAX the deployer swaps to ECO to fund EcoLoopRewards (0 skips funding)
//   DEPLOY_REWARDS=false         keep the current rewardsContract instead of deploying a new one
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, getAddress, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji, hardhat } from 'viem/chains';
import { compile } from './compile.mjs';
import { updateReadmeContracts } from './readme-contracts.mjs';
const local = process.argv.includes('--local');
const chain = local ? hardhat : avalancheFuji;
const rpc = local ? 'http://127.0.0.1:8545' : (process.env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0]);
const explorer = local ? '' : 'https://testnet.snowtrace.io';
const publicClient = createPublicClient({ chain, transport: http(rpc) });
if (await publicClient.getChainId() !== chain.id) throw new Error('RPC chain mismatch');
let account;
if (local) [account] = await publicClient.request({ method: 'eth_accounts' });
else {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Set DEPLOYER_PRIVATE_KEY in .env (dedicated testnet wallet).');
  account = privateKeyToAccount(key);
}
const admin = typeof account === 'string' ? account : account.address;
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const ecoPerAvax = parseEther(process.env.ECO_PER_AVAX ?? '1000');
const exchangeReserve = parseEther(process.env.EXCHANGE_RESERVE_ECO ?? '1000000');
const rewardsFundAvax = parseEther(process.env.REWARDS_FUND_AVAX ?? '0.2');
const deployRewards = (process.env.DEPLOY_REWARDS ?? 'true') !== 'false';

compile();
const pickup = JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json', 'utf8'));
const forwarderArtifact = JSON.parse(fs.readFileSync('artifacts/EcoLoopForwarder.json', 'utf8'));
const rewardsArtifact = JSON.parse(fs.readFileSync('artifacts/EcoLoopRewards.json', 'utf8'));
const configFile = 'config/app.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
async function checkPreviousEscrow() {
  if (local || config.chainId !== chain.id || !config.pickupContract) return;
  // Older deployments may not expose totalEscrowed; only block when it is readable and non-zero.
  const escrow = await publicClient.readContract({address:config.pickupContract,abi:pickup.abi,functionName:'totalEscrowed'}).catch(() => 0n);
  if (escrow === 0n) return;
  // Testnet only: FORCE_REPLACE_PICKUP=true replaces it anyway. Locked ECO stays in the old contract
  // (collectors can still call releaseLot there); its address is kept in deployments/<chainId>-latest.json.
  if (process.env.FORCE_REPLACE_PICKUP === 'true') { console.log(`  Old pickup ${config.pickupContract} still holds ${formatEther(escrow)} ECO escrow (left in place).`); return; }
  throw new Error(`Old pickup ${config.pickupContract} still holds ${formatEther(escrow)} ECO escrow. Settle or release it, or set FORCE_REPLACE_PICKUP=true (testnet only).`);
}
await checkPreviousEscrow();
console.log(`Deploying EcoLoop V4 on chain ${chain.id} from ${admin} (${formatEther(await publicClient.getBalance({address: admin}))} AVAX)`);

const record = { chainId: chain.id, deployer: admin, previousPickup: config.chainId === chain.id ? config.pickupContract : undefined, createdAt: new Date().toISOString(), contracts: {} };
let deployBlock = 0;
async function deploy(name, artifact, args) {
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed: ' + hash);
  deployBlock = Number(receipt.blockNumber);
  const address = getAddress(receipt.contractAddress);
  record.contracts[name] = { address, txHash: hash, block: deployBlock, args: args.map(String) };
  console.log(`  ${name.padEnd(12)} ${address}  ${explorer ? `${explorer}/tx/${hash}` : hash}`);
  return address;
}
async function write(address, abi, functionName, args = [], value) {
  const { request } = await publicClient.simulateContract({ address, abi, functionName, args, account, ...(value ? { value } : {}) });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} failed: ${hash}`);
  return hash;
}

const forwarder = await deploy('forwarder', forwarderArtifact, []);
const address = await deploy('pickup', pickup, [admin, forwarder, ecoPerAvax, exchangeReserve]);
const pickupBlock = deployBlock;
const certificate = getAddress(await publicClient.readContract({ address, abi: pickup.abi, functionName: 'certificate' }));
record.contracts.certificate = { address: certificate, createdBy: address, block: pickupBlock, args: [] };

let rewardsContract = config.chainId === chain.id ? config.rewardsContract : undefined;
if (deployRewards) {
  rewardsContract = await deploy('rewards', rewardsArtifact, [address]);
  if (rewardsFundAvax > 0n && ecoPerAvax > 0n) {
    const eco = rewardsFundAvax * ecoPerAvax / parseEther('1');
    record.rewardsFunding = { avax: formatEther(rewardsFundAvax), eco: formatEther(eco) };
    record.rewardsFunding.buyTx = await write(address, pickup.abi, 'buyEco', [eco], rewardsFundAvax);
    record.rewardsFunding.transferTx = await write(address, pickup.abi, 'transfer', [rewardsContract, eco]);
    console.log(`  Rewards funded with ${formatEther(eco)} ECO`);
  }
}
await checkPreviousEscrow();
if (config.chainId === chain.id || local) {
  const next = { ...config, chainId: chain.id, pickupContract: address, pickupDeployBlock: pickupBlock, forwarderContract: forwarder, certificateContract: certificate };
  if (rewardsContract) next.rewardsContract = rewardsContract;
  // The old ICM bridge points at the previous certificate contract: run deploy:bridge:fuji again.
  delete next.teleporterBridge; delete next.icmDestination;
  fs.writeFileSync(configFile, JSON.stringify(next, null, 2) + '\n');
}
fs.mkdirSync('deployments', { recursive: true });
fs.writeFileSync(`deployments/${chain.id}-latest.json`, JSON.stringify(record, null, 2) + '\n');
if (!local) updateReadmeContracts();
console.log(`
EcoLoop pickup V4 deployed on chain ${chain.id}
  Pickup (escrow): ${address}
  Forwarder:       ${forwarder}
  Certificate NFT: ${certificate}
  Rewards:         ${rewardsContract ?? '(none)'}
  Exchange:        ${formatEther(ecoPerAvax)} ECO/AVAX, reserve ${formatEther(exchangeReserve)} ECO
  Admin:           ${admin}
Saved deployments/${chain.id}-latest.json and updated config/app.json.
Next: npm run seed:fuji (test lots) -> npm run verify:fuji (Snowtrace) -> commit config/app.json + deployments/.
For gas-free households set RELAYER_PRIVATE_KEY (a separate, small Fuji wallet) in .env and fund it with test AVAX.`);
