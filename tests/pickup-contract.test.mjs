import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {network} from 'hardhat';
import {createPublicClient,createWalletClient,custom,encodeFunctionData,keccak256,stringToHex,parseEther} from 'viem';
import {hardhat} from 'viem/chains';
const artifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json','utf8'));
const forwarderArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopForwarder.json','utf8'));
const certificateArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopCertificate.json','utf8'));
const hash=s=>keccak256(stringToHex(s));
async function fixture(){
 const connection=await network.create('local');const transport=custom(connection.provider);
 const client=createPublicClient({chain:hardhat,transport});const accounts=await connection.provider.request({method:'eth_accounts'});
 const wallets=accounts.slice(0,4).map(account=>createWalletClient({account,chain:hardhat,transport}));
 const ftx=await wallets[0].deployContract({abi:forwarderArtifact.abi,bytecode:forwarderArtifact.bytecode,args:[]});const forwarder=(await client.waitForTransactionReceipt({hash:ftx})).contractAddress;
 const tx=await wallets[0].deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[accounts[0],forwarder]});const address=(await client.waitForTransactionReceipt({hash:tx})).contractAddress;
 const read=(functionName,args=[])=>client.readContract({address,abi:artifact.abi,functionName,args});
 const write=async(w,functionName,args=[],value)=>{const {request}=await client.simulateContract({address,abi:artifact.abi,functionName,args,account:wallets[w].account,...(value!==undefined?{value}:{})});const h=await wallets[w].writeContract(request);assert.equal((await client.waitForTransactionReceipt({hash:h})).status,'success');};
 const create=(owner=1,label='lot')=>write(owner,'createLot',[[3000n,5000n,1000n,0n],hash(label),1078,10669]);
 // V3: collectors lock AVAX when claiming (estimate value + 20%).
 const claim=async(w,id)=>write(w,'claimLot',[id],await read('requiredDeposit',[id]));
 const balance=a=>client.getBalance({address:a});
 return {connection,client,accounts,wallets,address,forwarder,read,write,create,claim,balance};
}
test('multi-material pickup requires collector proposal and owner acceptance, then rewards and fulfillment work',async()=>{
 const f=await fixture();try{
  await f.create();await f.claim(0,1n);await f.write(0,'proposeLot',[1n,[2500n,4000n,1000n,0n]]);
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
  await f.create();await assert.rejects(f.claim(2,1n),/AccessControlUnauthorizedAccount/);
  await f.write(0,'grantRole',[hash('COLLECTOR_ROLE'),f.accounts[1]]);
  await assert.rejects(f.claim(1,1n),/SelfApproval/);
  await f.write(0,'grantRole',[hash('COLLECTOR_ROLE'),f.accounts[2]]);
  await f.claim(0,1n);await assert.rejects(f.claim(2,1n),/InvalidStatus/);
  await assert.rejects(f.write(2,'proposeLot',[1n,[1000n,0n,0n,0n]]),/InvalidStatus/);
  await assert.rejects(f.create(2),/DuplicateEvidence/);
  for(const weights of [[0n,0n,0n,0n],[500001n,500000n,0n,0n]])await assert.rejects(f.write(1,'createLot',[weights,hash('bad'),1078,10669]),/InvalidInput/);
  await assert.rejects(f.write(1,'createLot',[[1n,0n,0n,0n],hash('bad'),9001,10669]),/InvalidInput/);
 }finally{await f.connection.close();}
});
test('dispute invalidates old proposal; revoked collector cannot settle; stalled jobs can reopen',async()=>{
 const f=await fixture();try{
  await f.create();await f.claim(0,1n);await f.write(0,'proposeLot',[1n,[1000n,0n,0n,0n]]);
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
  await f.create();await f.claim(0,1n);await f.write(0,'proposeLot',[1n,[1000n,0n,0n,0n]]);
  await f.connection.provider.request({method:'evm_increaseTime',params:[7*86400+1]});await f.connection.provider.request({method:'evm_mine'});
  await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
  await f.write(0,'setPaused',[true]);await assert.rejects(f.create(2,'paused'),/EnforcedPause/);
  await f.write(0,'releaseLot',[1n]);await f.write(1,'cancelLot',[1n]);assert.equal(await f.read('totalSupply'),0n);
 }finally{await f.connection.close();}
});

test('V3 escrow pays the household for the real weight, refunds the collector and mints a certificate NFT',async()=>{
 const f=await fixture();try{
  await f.create();
  const deposit=await f.read('requiredDeposit',[1n]);assert.equal(deposit,parseEther('0.006'));
  await assert.rejects(f.write(0,'claimLot',[1n],deposit-1n),/InsufficientDeposit/);
  await f.claim(0,1n);assert.equal(await f.balance(f.address),deposit);
  await f.write(0,'proposeLot',[1n,[2500n,4000n,1000n,0n]]);
  const before=await f.balance(f.accounts[1]);await f.write(1,'acceptLot',[1n]);
  const lot=await f.read('getLot',[1n]);assert.equal(lot.paid,parseEther('0.00445'));assert.equal(lot.deposit,0n);
  assert.ok(await f.balance(f.accounts[1])>before);assert.equal(await f.balance(f.address),0n);
  const certificate=await f.read('certificate');
  const owner=await f.client.readContract({address:certificate,abi:certificateArtifact.abi,functionName:'ownerOf',args:[1n]});
  assert.equal(owner.toLowerCase(),f.accounts[1].toLowerCase());
  const uri=await f.client.readContract({address:certificate,abi:certificateArtifact.abi,functionName:'tokenURI',args:[1n]});
  const meta=JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());assert.match(meta.name,/Certificate #1/);
 }finally{await f.connection.close();}
});
test('V3 release refunds the locked AVAX to the collector',async()=>{
 const f=await fixture();try{
  await f.create();await f.claim(0,1n);const deposit=(await f.read('getLot',[1n])).deposit;assert.ok(deposit>0n);
  await f.write(0,'releaseLot',[1n]);assert.equal(await f.balance(f.address),0n);assert.equal((await f.read('getLot',[1n])).status,1);
 }finally{await f.connection.close();}
});
test('V3 gas-free: a household-signed request relayed by another wallet acts as the household',async()=>{
 const f=await fixture();try{
  const household=f.wallets[3];const data=encodeFunctionData({abi:artifact.abi,functionName:'createLot',args:[[3000n,0n,0n,0n],hash('gasless'),1078,10669]});
  const nonce=await f.client.readContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'nonces',args:[f.accounts[3]]});
  const deadline=Math.floor(Date.now()/1000)+3600;const gas=450000n;
  const signature=await household.signTypedData({account:f.accounts[3],domain:{name:'EcoLoopForwarder',version:'1',chainId:31337,verifyingContract:f.forwarder},
   types:{ForwardRequest:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'gas',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint48'},{name:'data',type:'bytes'}]},
   primaryType:'ForwardRequest',message:{from:f.accounts[3],to:f.address,value:0n,gas,nonce,deadline,data}});
  const request={from:f.accounts[3],to:f.address,value:0n,gas,deadline,data,signature};
  assert.equal(await f.client.readContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'verify',args:[request]}),true);
  const before=await f.balance(f.accounts[3]);
  const {request:exec}=await f.client.simulateContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'execute',args:[request],account:f.wallets[2].account});
  const h=await f.wallets[2].writeContract(exec);assert.equal((await f.client.waitForTransactionReceipt({hash:h})).status,'success');
  assert.equal((await f.read('getLot',[1n])).owner.toLowerCase(),f.accounts[3].toLowerCase());
  assert.equal(await f.balance(f.accounts[3]),before,'household paid no gas');
 }finally{await f.connection.close();}
});
