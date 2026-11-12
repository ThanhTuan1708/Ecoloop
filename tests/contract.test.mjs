import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { network } from 'hardhat';
import { createPublicClient, createWalletClient, custom, keccak256, stringToHex, parseEther } from 'viem';
import { hardhat } from 'viem/chains';
const artifact = JSON.parse(fs.readFileSync('artifacts/EcoLoop.json', 'utf8'));
const evidence = (value) => keccak256(stringToHex(value));
async function fixture() {
  const connection = await network.create('local');
  const transport = custom(connection.provider);
  const client = createPublicClient({ chain: hardhat, transport });
  const accounts = await connection.provider.request({ method: 'eth_accounts' });
  const wallets = accounts.slice(0, 3).map(account => createWalletClient({ account, chain: hardhat, transport }));
  const [admin, user, outsider] = wallets;
  const hash = await admin.deployContract({ ...artifact, args: [accounts[0]] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
  const read = (functionName, args = []) => client.readContract({ address, abi: artifact.abi, functionName, args });
  const write = async (wallet, functionName, args = []) => {
    const { request } = await client.simulateContract({ address, abi: artifact.abi, functionName, args, account: wallet.account });
    const hash = await wallet.writeContract(request);
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    return receipt;
  };
  return { connection, client, admin, user, outsider, accounts, address, read, write };
}
test('submission → verified weight → ECO → redemption burns tokens and decreases stock', async () => {
  const f = await fixture();
  try {
    await f.write(f.user, 'submit', [0, 8000n, evidence('plastic-1')]);
    assert.equal(await f.read('balanceOf', [f.accounts[1]]), 0n);
    await f.write(f.admin, 'approve', [1n, 7500n]);
    assert.equal(await f.read('balanceOf', [f.accounts[1]]), parseEther('150'));
    assert.equal(await f.read('recycledGrams', [f.accounts[1]]), 7500n);
    assert.equal(await f.read('totalRecycledGrams'), 7500n);
    const receipt = await f.write(f.user, 'redeem', [1n]);
    assert.ok(receipt.logs.length >= 2);
    assert.equal(await f.read('balanceOf', [f.accounts[1]]), parseEther('50'));
    assert.equal(await f.read('totalSupply'), parseEther('50'));
    assert.equal(await f.read('earned', [f.accounts[1]]), parseEther('150'));
    assert.equal((await f.read('rewards', [1n]))[2], 49n);
    assert.equal((await f.read('redemptionOwner', [1n])).toLowerCase(), f.accounts[1].toLowerCase());
    assert.equal(await f.read('redemptionFulfilled',[1n]),false);
    await assert.rejects(f.write(f.user,'fulfillRedemption',[1n]),/AccessControlUnauthorizedAccount/);
    await assert.rejects(f.write(f.admin,'fulfillRedemption',[99n]),/InvalidStatus/);
    await f.write(f.admin,'fulfillRedemption',[1n]);
    assert.equal(await f.read('redemptionFulfilled',[1n]),true);
    await assert.rejects(f.write(f.admin,'fulfillRedemption',[1n]),/InvalidStatus/);
  } finally { await f.connection.close(); }
});
test('only collectors may approve; no self approval; no repeated settlement', async () => {
  const f = await fixture();
  try {
    await f.write(f.user, 'submit', [2, 1000n, evidence('metal')]);
    await assert.rejects(f.write(f.outsider, 'approve', [1n, 1000n]), /AccessControlUnauthorizedAccount/);
    await f.write(f.admin, 'approve', [1n, 1000n]);
    await assert.rejects(f.write(f.admin, 'approve', [1n, 1000n]), /InvalidStatus/);
    await assert.rejects(f.write(f.admin, 'reject', [1n]), /InvalidStatus/);
    await f.write(f.admin, 'submit', [0, 1000n, evidence('self')]);
    await assert.rejects(f.write(f.admin, 'approve', [2n, 1000n]), /SelfApproval/);
  } finally { await f.connection.close(); }
});
test('rejects invalid materials, zero/oversized weights, missing and duplicate evidence', async () => {
  const f = await fixture();
  try {
    for (const args of [[4, 1000n, evidence('bad')], [0, 0n, evidence('bad')], [0, 1000001n, evidence('bad')], [0, 1000n, '0x' + '0'.repeat(64)]]) await assert.rejects(f.write(f.user, 'submit', args), /InvalidInput/);
    await f.write(f.user, 'submit', [0, 1000n, evidence('unique')]);
    await assert.rejects(f.write(f.outsider, 'submit', [1, 1000n, evidence('unique')]), /DuplicateEvidence/);
    await assert.rejects(f.write(f.admin, 'approve', [1n, 0n]), /InvalidInput/);
    await assert.rejects(f.write(f.admin, 'approve', [1n, 1000001n]), /InvalidInput/);
  } finally { await f.connection.close(); }
});
test('rejected submissions cannot earn; permission grant and revoke are enforced', async () => {
  const f = await fixture();
  try {
    await f.write(f.user, 'submit', [1, 5000n, evidence('rejected')]);
    const role = await f.read('COLLECTOR_ROLE');
    await assert.rejects(f.write(f.user, 'grantRole', [role, f.accounts[1]]), /AccessControlUnauthorizedAccount/);
    await f.write(f.admin, 'grantRole', [role, f.accounts[2]]);
    await f.write(f.outsider, 'reject', [1n]);
    await assert.rejects(f.write(f.admin, 'approve', [1n, 5000n]), /InvalidStatus/);
    assert.equal(await f.read('balanceOf', [f.accounts[1]]), 0n);
    await f.write(f.user, 'submit', [1, 5000n, evidence('revoked')]);
    await f.write(f.admin, 'revokeRole', [role, f.accounts[2]]);
    await assert.rejects(f.write(f.outsider, 'approve', [2n, 5000n]), /AccessControlUnauthorizedAccount/);
  } finally { await f.connection.close(); }
});
test('insufficient balance, inactive rewards, sold-out rewards and pause cannot be bypassed', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.write(f.user, 'redeem', [1n]), /ERC20InsufficientBalance/);
    assert.equal((await f.read('rewards', [1n]))[2], 50n);
    await assert.rejects(f.write(f.user, 'configureReward', [1n, 1n, 1n, true]), /AccessControlUnauthorizedAccount/);
    await f.write(f.admin, 'configureReward', [1n, parseEther('100'), 0n, true]);
    await assert.rejects(f.write(f.user, 'redeem', [1n]), /UnavailableReward/);
    await f.write(f.admin, 'configureReward', [1n, parseEther('100'), 10n, false]);
    await assert.rejects(f.write(f.user, 'redeem', [1n]), /UnavailableReward/);
    await f.write(f.user, 'submit', [0, 5000n, evidence('pause-pending')]);
    await assert.rejects(f.write(f.user, 'setPaused', [true]), /AccessControlUnauthorizedAccount/);
    await f.write(f.admin, 'setPaused', [true]);
    await assert.rejects(f.write(f.user, 'submit', [0, 1000n, evidence('paused')]), /EnforcedPause/);
    await assert.rejects(f.write(f.admin, 'approve', [1n, 5000n]), /EnforcedPause/);
    await assert.rejects(f.write(f.admin, 'reject', [1n]), /EnforcedPause/);
    await assert.rejects(f.write(f.user, 'redeem', [1n]), /EnforcedPause/);
    await f.write(f.admin, 'setPaused', [false]);
    await f.write(f.admin, 'approve', [1n, 5000n]);
    assert.equal(await f.read('balanceOf', [f.accounts[1]]), parseEther('100'));
  } finally { await f.connection.close(); }
});
test('all material rates, precision and reward administration work', async () => {
  const f = await fixture();
  try {
    for (let m = 0; m < 4; m++) { await f.write(f.user, 'submit', [m, 1n, evidence(`rate-${m}`)]); await f.write(f.admin, 'approve', [BigInt(m+1), 1n]); }
    assert.equal(await f.read('balanceOf', [f.accounts[1]]), parseEther('0.078'));
    await f.write(f.admin, 'addReward', ['Seed packet', parseEther('0.05'), 1n]);
    assert.equal(await f.read('rewardCount'), 4n);
    await f.write(f.user, 'redeem', [4n]);
    await assert.rejects(f.write(f.user, 'redeem', [4n]), /UnavailableReward/);
    assert.equal(await f.read('redemptionReward', [1n]), 4n);
    await assert.rejects(f.write(f.admin, 'configureReward', [99n, 1n, 1n, true]), /InvalidInput/);
  } finally { await f.connection.close(); }
});
