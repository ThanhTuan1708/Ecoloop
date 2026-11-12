import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {network} from 'hardhat';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex,parseEther} from 'viem';
import {hardhat} from 'viem/chains';
const artifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json','utf8'));
const hash=s=>keccak256(stringToHex(s));
async function fixture(){
 const connection=await network.create('local');const transport=custom(connection.provider);
 const client=createPublicClient({chain:hardhat,transport});const accounts=await connection.provider.request({method:'eth_accounts'});
 const wallets=accounts.slice(0,4).map(account=>createWalletClient({account,chain:hardhat,transport}));
 const tx=await wallets[0].deployContract({...artifact,args:[accounts[0]]});const address=(await client.waitForTransactionReceipt({hash:tx})).contractAddress;
 const read=(functionName,args=[])=>client.readContract({address,abi:artifact.abi,functionName,args});
 const write=async(w,functionName,args=[])=>{const {request}=await client.simulateContract({address,abi:artifact.abi,functionName,args,account:wallets[w].account});const h=await wallets[w].writeContract(request);assert.equal((await client.waitForTransactionReceipt({hash:h})).status,'success');};
 const create=(owner=1,label='lot')=>write(owner,'createLot',[[3000n,5000n,1000n,0n],hash(label),1078,10669]);
 return {connection,client,accounts,address,read,write,create};
}
test('multi-material pickup requires collector proposal and owner acceptance, then rewards and fulfillment work',async()=>{
 const f=await fixture();try{
  await f.create();await f.write(0,'claimLot',[1n]);await f.write(0,'proposeLot',[1n,[2500n,4000n,1000n,0n]]);
  assert.equal(await f.read('balanceOf',[f.accounts[1]]),0n);
  await assert.rejects(f.write(0,'acceptLot',[1n]),/InvalidStatus/);
  await assert.rejects(f.write(2,'acceptLot',[1n]),/InvalidStatus/);
  await f.write(1,'acceptLot',[1n]);
  assert.equal(await f.read('balanceOf',[f.accounts[1]]),parseEther('130'));
  assert.equal(await f.read('recycledGrams',[f.accounts[1]]),7500n);
  assert.equal((await f.read('getLot',[1n])).status,4);
  await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
  await f.write(1,'redeem',[1n]);await f.write(0,'fulfillRedemption',[1n]);
  assert.equal(await f.read('balanceOf',[f.accounts[1]]),parseEther('30'));
 }finally{await f.connection.close();}
});
test('claim race, self-claim, duplicate evidence and invalid totals are rejected',async()=>{
 const f=await fixture();try{
  await f.create();await assert.rejects(f.write(2,'claimLot',[1n]),/AccessControlUnauthorizedAccount/);
  await f.write(0,'grantRole',[hash('COLLECTOR_ROLE'),f.accounts[1]]);
  await assert.rejects(f.write(1,'claimLot',[1n]),/SelfApproval/);
  await f.write(0,'grantRole',[hash('COLLECTOR_ROLE'),f.accounts[2]]);
  await f.write(0,'claimLot',[1n]);await assert.rejects(f.write(2,'claimLot',[1n]),/InvalidStatus/);
  await assert.rejects(f.write(2,'proposeLot',[1n,[1000n,0n,0n,0n]]),/InvalidStatus/);
  await assert.rejects(f.create(2),/DuplicateEvidence/);
  for(const weights of [[0n,0n,0n,0n],[500001n,500000n,0n,0n]])await assert.rejects(f.write(1,'createLot',[weights,hash('bad'),1078,10669]),/InvalidInput/);
  await assert.rejects(f.write(1,'createLot',[[1n,0n,0n,0n],hash('bad'),9001,10669]),/InvalidInput/);
 }finally{await f.connection.close();}
});
test('dispute invalidates old proposal; revoked collector cannot settle; stalled jobs can reopen',async()=>{
 const f=await fixture();try{
  await f.create();await f.write(0,'claimLot',[1n]);await f.write(0,'proposeLot',[1n,[1000n,0n,0n,0n]]);
  await f.write(1,'disputeLot',[1n]);assert.deepEqual((await f.read('getLot',[1n])).actual,[0n,0n,0n,0n]);
  await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
  await f.write(0,'proposeLot',[1n,[2000n,0n,0n,0n]]);await f.write(0,'revokeRole',[hash('COLLECTOR_ROLE'),f.accounts[0]]);
  await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
  await assert.rejects(f.write(1,'releaseLot',[1n]),/InvalidStatus/);
  await f.connection.provider.request({method:'evm_increaseTime',params:[7*86400+1]});await f.connection.provider.request({method:'evm_mine'});
  await f.write(1,'releaseLot',[1n]);assert.equal((await f.read('getLot',[1n])).status,1);
  await f.write(1,'cancelLot',[1n]);assert.equal((await f.read('getLot',[1n])).status,5);
 }finally{await f.connection.close();}
});
test('expired proposal and pause block minting, but release/cancel remain available',async()=>{
 const f=await fixture();try{
  await f.create();await f.write(0,'claimLot',[1n]);await f.write(0,'proposeLot',[1n,[1000n,0n,0n,0n]]);
  await f.connection.provider.request({method:'evm_increaseTime',params:[7*86400+1]});await f.connection.provider.request({method:'evm_mine'});
  await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
  await f.write(0,'setPaused',[true]);await assert.rejects(f.create(2,'paused'),/EnforcedPause/);
  await f.write(0,'releaseLot',[1n]);await f.write(1,'cancelLot',[1n]);assert.equal(await f.read('totalSupply'),0n);
 }finally{await f.connection.close();}
});
