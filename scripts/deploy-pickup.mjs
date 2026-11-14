// Deploys the EcoLoop pickup V4 suite and activates it in config/app.json:
//   1. EcoLoopForwarder (gas-free relay for households)
//   2. EcoLoopPickup(admin, forwarder) — real AVAX escrow; creates the EcoLoopCertificate NFT contract
// Usage: npm run deploy:pickup:fuji   (needs DEPLOYER_PRIVATE_KEY of a dedicated Fuji test wallet in .env)
//        npm run deploy:pickup:local  (uses the local Hardhat node's first account)
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji, hardhat } from 'viem/chains';
import { compile } from './compile.mjs';
import { codeHash } from '../server/codehash.mjs';
import previousPickup from '../config/pickup-v3.json' with {type:'json'};
const local = process.argv.includes('--local');
const chain = local ? hardhat : avalancheFuji;
const rpc = local ? 'http://127.0.0.1:8545' : (process.env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0]);
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
compile();
const pickup = JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json', 'utf8'));
const forwarderArtifact = JSON.parse(fs.readFileSync('artifacts/EcoLoopForwarder.json', 'utf8'));
const configFile = 'config/app.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
async function checkPreviousEscrow() {
  if (local || config.chainId !== chain.id || !config.pickupContract) return;
  const code = await publicClient.getCode({address:config.pickupContract});
  if (codeHash(code, previousPickup.immutables) !== previousPickup.runtimeHash) return;
  const escrow = await publicClient.readContract({address:config.pickupContract,abi:pickup.abi,functionName:'totalEscrowed'});
  if (escrow > 0n) throw new Error('Settle or release all V3 escrow before switching to V4.');
}
await checkPreviousEscrow();
let deployBlock = 0;
async function deploy(artifact, args) {
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed: ' + hash);
  deployBlock = Number(receipt.blockNumber);
  return getAddress(receipt.contractAddress);
}
const forwarder = await deploy(forwarderArtifact, []);
const address = await deploy(pickup, [admin, forwarder]);
const certificate = await publicClient.readContract({ address, abi: pickup.abi, functionName: 'certificate' });
await checkPreviousEscrow();
if (config.chainId === chain.id || local) {
  fs.writeFileSync(configFile, JSON.stringify({ ...config, chainId: chain.id, pickupContract: address, pickupDeployBlock: deployBlock }, null, 2));
}
console.log(`EcoLoop pickup V4 deployed on chain ${chain.id}
  Pickup (escrow): ${address}
  Forwarder:       ${forwarder}
  Certificate NFT: ${certificate}
  Admin:           ${admin}
config/app.json now points pickupContract to V4. Any wallet can claim open lots.
For gas-free households set RELAYER_PRIVATE_KEY (a separate, small Fuji wallet) in .env and fund it with test AVAX.`);
