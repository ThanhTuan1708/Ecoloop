import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { network } from 'hardhat';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';
// Exercise the actual deployment entry point. Restore the user's frontend config afterward.
const previous = fs.existsSync('.env.local') ? fs.readFileSync('.env.local') : null;
const server = await network.createServer('local', '127.0.0.1', 8545);
try {
  await server.listen();
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/deploy.mjs', '--local']);
  const deployment = JSON.parse(fs.readFileSync('deployments/31337.json', 'utf8'));
  const client = createPublicClient({ chain: hardhat, transport: http('http://127.0.0.1:8545') });
  const receipt = await client.getTransactionReceipt({ hash: deployment.transactionHash });
  if (receipt.status !== 'success' || !await client.getCode({ address: deployment.address })) throw new Error('Deployment verification failed');
  console.log(stdout.trim());
  console.log('Local deployment smoke passed; frontend environment restored.');
} finally {
  if (previous) fs.writeFileSync('.env.local', previous); else if (fs.existsSync('.env.local')) fs.unlinkSync('.env.local');
  await server.close();
}
