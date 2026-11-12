import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, isAddress, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji, hardhat } from 'viem/chains';
import { compile } from './compile.mjs';
const local = process.argv.includes('--local');
const chain = local ? hardhat : avalancheFuji;
const rpc = local ? 'http://127.0.0.1:8545' : (process.env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0]);
// Local node's unlocked accounts are used only on the local chain. No bundled private keys.
let account;
const publicClient = createPublicClient({ chain, transport: http(rpc) });
if (await publicClient.getChainId() !== chain.id) throw new Error('RPC chain mismatch');
if (local) {
  const [address] = await publicClient.request({ method: 'eth_accounts' });
  account = address;
} else {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Set DEPLOYER_PRIVATE_KEY in .env (dedicated testnet wallet).');
  account = privateKeyToAccount(key);
}
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const admin = typeof account === 'string' ? account : account.address;
const { abi, bytecode } = compile();
const hash = await wallet.deployContract({ abi, bytecode, args: [admin] });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success' || !isAddress(receipt.contractAddress ?? '')) throw new Error('Deployment failed');
const address = getAddress(receipt.contractAddress);
fs.mkdirSync('deployments', { recursive: true });
fs.writeFileSync(`deployments/${chain.id}.json`, JSON.stringify({ address, chainId: chain.id, transactionHash: hash, admin }, null, 2));
// This file contains public addresses only; never write the private key to frontend configuration.
fs.writeFileSync('.env.local', `VITE_ECOLOOP_ADDRESS=${address}\nVITE_CHAIN_ID=${chain.id}\nVITE_RPC_URL=${rpc}\n`);
console.log(`EcoLoop deployed: ${address}\nChain: ${chain.id}\nTransaction: ${hash}\nRestart the web dev server. Use a second wallet as recycler; admin cannot approve their own requests.`);
