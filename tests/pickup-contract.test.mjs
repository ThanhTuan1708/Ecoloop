import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {network} from 'hardhat';
import {createPublicClient,createWalletClient,custom,decodeEventLog,encodeFunctionData,keccak256,stringToHex,parseEther} from 'viem';
import {hardhat} from 'viem/chains';

const artifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json','utf8'));
const forwarderArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopForwarder.json','utf8'));
const certificateArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopCertificate.json','utf8'));
const hash=s=>keccak256(stringToHex(s));

async function fixture(){
  const connection=await network.create('local');
  const transport=custom(connection.provider);
  const client=createPublicClient({chain:hardhat,transport});
  const accounts=await connection.provider.request({method:'eth_accounts'});
  const wallets=accounts.slice(0,4).map(account=>createWalletClient({account,chain:hardhat,transport}));

  const ftx=await wallets[0].deployContract({abi:forwarderArtifact.abi,bytecode:forwarderArtifact.bytecode,args:[]});
  const forwarder=(await client.waitForTransactionReceipt({hash:ftx})).contractAddress;

  // Deploy V4 with initial exchange rate = 1,000 ECO / AVAX and 50,000 ECO exchange reserve
  const initialRate=parseEther('1000');
  const initialReserve=parseEther('50000');
  const tx=await wallets[0].deployContract({
    abi:artifact.abi,
    bytecode:artifact.bytecode,
    args:[accounts[0],forwarder,initialRate,initialReserve],
  });
  const address=(await client.waitForTransactionReceipt({hash:tx})).contractAddress;

  const read=(functionName,args=[])=>client.readContract({address,abi:artifact.abi,functionName,args});
  const write=async(w,functionName,args=[],value)=>{
    const {request}=await client.simulateContract({
      address,
      abi:artifact.abi,
      functionName,
      args,
      account:wallets[w].account,
      ...(value!==undefined?{value}:{}),
    });
    const h=await wallets[w].writeContract(request);
    const receipt=await client.waitForTransactionReceipt({hash:h});
    assert.equal(receipt.status,'success');
    return receipt;
  };

  // Helper to fund a collector with ECO via the on-chain AVAX -> ECO exchange
  const fundCollectorEco=async(w,avaxAmount=parseEther('1'))=>{
    const minEco=(avaxAmount*initialRate)/parseEther('1');
    await write(w,'buyEco',[minEco],avaxAmount);
  };

  // Lot estimate: 3kg plastic (60) + 5kg paper (50) + 1kg metal (40) = 150 ECO; 120% deposit = 180 ECO
  const create=(owner=1,label='lot')=>write(owner,'createLot',[[3000n,5000n,1000n,0n],hash(label),1078,10669]);
  const claim=async(w,id)=>{
    const reqDeposit=await read('requiredDeposit',[id]);
    const bal=await read('balanceOf',[accounts[w]]);
    if(bal<reqDeposit)await fundCollectorEco(w,parseEther('1'));
    return write(w,'claimLot',[id,reqDeposit]);
  };
  const balance=a=>client.getBalance({address:a});
  return {connection,client,accounts,wallets,address,forwarder,read,write,create,claim,fundCollectorEco,balance};
}

test('multi-material pickup requires collector proposal and owner acceptance, conserves supply for C2C, and supports rewards',async()=>{
  const f=await fixture();
  try{
    await f.create();
    assert.equal(await f.read('hasRole',[hash('COLLECTOR_ROLE'),f.accounts[2]]),false);
    await f.fundCollectorEco(2,parseEther('1')); // buys 1,000 ECO from reserve
    const supplyBefore=await f.read('totalSupply');

    await f.claim(2,1n);
    await f.write(2,'proposeLot',[1n,[2500n,4000n,1000n,0n]]); // 2.5*20 + 4*10 + 1*40 = 130 ECO
    assert.equal(await f.read('balanceOf',[f.accounts[1]]),0n);

    await assert.rejects(f.write(0,'acceptLot',[1n]),/InvalidStatus/);
    await assert.rejects(f.write(2,'acceptLot',[1n]),/InvalidStatus/);
    await f.write(1,'acceptLot',[1n]);

    // Anti-inflation invariant: unverified peer-to-peer trade pays strictly from locked escrow (0 minted ECO)
    assert.equal(await f.read('totalSupply'),supplyBefore,'C2C settlement must not inflate totalSupply');
    assert.equal(await f.read('balanceOf',[f.accounts[1]]),parseEther('130'));
    assert.equal(await f.read('recycledGrams',[f.accounts[1]]),7500n);
    assert.equal((await f.read('getLot',[1n])).status,4);

    await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
    await f.write(1,'redeemReward',[1n]); // burns 100 ECO
    await f.write(0,'fulfillRewardRedemption',[1n]);
    assert.equal(await f.read('balanceOf',[f.accounts[1]]),parseEther('30'));
  }finally{await f.connection.close();}
});

test('verified station bonus mints subsidy only when collector holds COLLECTOR_ROLE and bonusBps > 0',async()=>{
  const f=await fixture();
  try{
    await f.write(0,'setCollectorBonusBps',[1000]); // 10% verified station green bonus
    await f.create(1,'verified-lot');
    // Admin (accounts[0]) holds COLLECTOR_ROLE
    await f.claim(0,1n);
    await f.write(0,'proposeLot',[1n,[2500n,4000n,1000n,0n]]); // 130 ECO base + 13 ECO verified bonus
    const supplyBefore=await f.read('totalSupply');
    await f.write(1,'acceptLot',[1n]);
    assert.equal(await f.read('balanceOf',[f.accounts[1]]),parseEther('143'));
    assert.equal(await f.read('totalSupply'),supplyBefore+parseEther('13'));
  }finally{await f.connection.close();}
});

test('claim race, self-claim, slippage guard, duplicate evidence and invalid totals are rejected',async()=>{
  const f=await fixture();
  try{
    await f.create();
    await f.fundCollectorEco(1,parseEther('1'));
    await assert.rejects(f.write(1,'claimLot',[1n,parseEther('500')]),/SelfApproval/);

    const deposit=await f.read('requiredDeposit',[1n]);
    await f.fundCollectorEco(0,parseEther('1'));
    await assert.rejects(f.write(0,'claimLot',[1n,deposit-1n]),/DepositAboveMaximum/);

    await f.claim(0,1n);
    await assert.rejects(f.claim(2,1n),/InvalidStatus/);
    await assert.rejects(f.write(2,'proposeLot',[1n,[1000n,0n,0n,0n]]),/InvalidStatus/);
    await assert.rejects(f.create(2),/DuplicateEvidence/);

    for(const weights of [[0n,0n,0n,0n],[500001n,500000n,0n,0n]]){
      await assert.rejects(f.write(1,'createLot',[weights,hash('bad'),1078,10669]),/InvalidInput/);
    }
    await assert.rejects(f.write(1,'createLot',[[1n,0n,0n,0n],hash('bad'),9001,10669]),/InvalidInput/);
  }finally{await f.connection.close();}
});

test('dispute invalidates old proposal and stalled jobs can reopen',async()=>{
  const f=await fixture();
  try{
    await f.create();
    await f.claim(0,1n);
    await f.write(0,'proposeLot',[1n,[1000n,0n,0n,0n]]);
    await f.write(1,'disputeLot',[1n]);
    assert.deepEqual((await f.read('getLot',[1n])).actual,[0n,0n,0n,0n]);
    await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);
    await f.write(0,'proposeLot',[1n,[2000n,0n,0n,0n]]);
    await assert.rejects(f.write(1,'releaseLot',[1n]),/InvalidStatus/);
    await f.connection.provider.request({method:'evm_increaseTime',params:[7*86400+1]});
    await f.connection.provider.request({method:'evm_mine'});
    await f.write(1,'releaseLot',[1n]);
    assert.equal((await f.read('getLot',[1n])).status,1);
    await f.write(1,'cancelLot',[1n]);
    assert.equal((await f.read('getLot',[1n])).status,5);
  }finally{await f.connection.close();}
});

test('expired proposal and pause block settlement, while release/cancel and exchange accounting remain safe',async()=>{
  const f=await fixture();
  try{
    await f.create();
    await f.claim(0,1n);
    await f.write(0,'proposeLot',[1n,[1000n,0n,0n,0n]]);
    await f.connection.provider.request({method:'evm_increaseTime',params:[7*86400+1]});
    await f.connection.provider.request({method:'evm_mine'});
    await assert.rejects(f.write(1,'acceptLot',[1n]),/InvalidStatus/);

    await f.write(0,'setPaused',[true]);
    await assert.rejects(f.create(2,'paused'),/EnforcedPause/);
    await f.write(0,'releaseLot',[1n]);
    await f.write(1,'cancelLot',[1n]);
    assert.equal(await f.read('totalEscrowed'),0n);

    // Exchange proceeds accounting check
    const proceeds=await f.read('exchangeProceeds');
    assert.equal(proceeds,parseEther('1'));
    await assert.rejects(f.write(0,'withdrawExchangeProceeds',[f.accounts[0],proceeds+1n]),/InvalidInput/);
    await f.write(0,'withdrawExchangeProceeds',[f.accounts[0],proceeds]);
    assert.equal(await f.read('exchangeProceeds'),0n);
  }finally{await f.connection.close();}
});

test('V4 ECO escrow pays household for real weight, refunds collector surplus, and mints on-chain SVG certificate NFT',async()=>{
  const f=await fixture();
  try{
    await f.create();
    const deposit=await f.read('requiredDeposit',[1n]);
    assert.equal(deposit,parseEther('180')); // (60 + 50 + 40) * 120% = 180 ECO

    await f.fundCollectorEco(2,parseEther('1')); // 1,000 ECO
    const collectorBefore=await f.read('balanceOf',[f.accounts[2]]);
    await f.claim(2,1n);
    assert.equal(await f.read('totalEscrowed'),deposit);
    assert.equal(await f.read('balanceOf',[f.accounts[2]]),collectorBefore-deposit);

    await f.write(2,'proposeLot',[1n,[2500n,4000n,1000n,0n]]); // 130 ECO actual value, 50 ECO refund
    await f.write(1,'acceptLot',[1n]);

    const lot=await f.read('getLot',[1n]);
    assert.equal(lot.paid,parseEther('130'));
    assert.equal(lot.deposit,0n);
    assert.equal(await f.read('totalEscrowed'),0n);
    assert.equal(await f.read('balanceOf',[f.accounts[1]]),parseEther('130'));
    assert.equal(await f.read('balanceOf',[f.accounts[2]]),collectorBefore-parseEther('130'));

    const certificate=await f.read('certificate');
    const owner=await f.client.readContract({address:certificate,abi:certificateArtifact.abi,functionName:'ownerOf',args:[1n]});
    assert.equal(owner.toLowerCase(),f.accounts[1].toLowerCase());
    const uri=await f.client.readContract({address:certificate,abi:certificateArtifact.abi,functionName:'tokenURI',args:[1n]});
    const meta=JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());
    assert.match(meta.name,/Certificate #1/);
  }finally{await f.connection.close();}
});

test('V4 release refunds 100% of locked ECO deposit back to the collector',async()=>{
  const f=await fixture();
  try{
    await f.create();
    await f.fundCollectorEco(2,parseEther('1'));
    const before=await f.read('balanceOf',[f.accounts[2]]);
    await f.claim(2,1n);
    const deposit=(await f.read('getLot',[1n])).deposit;
    assert.equal(deposit,parseEther('180'));
    await f.write(2,'releaseLot',[1n]);
    assert.equal(await f.read('totalEscrowed'),0n);
    assert.equal(await f.read('balanceOf',[f.accounts[2]]),before);
    assert.equal((await f.read('getLot',[1n])).status,1);
  }finally{await f.connection.close();}
});

test('V4 gas-free ERC-2771 forwarder preserves _msgSender() for household & collector actions',async()=>{
  const f=await fixture();
  try{
    const household=f.wallets[3];
    const data=encodeFunctionData({abi:artifact.abi,functionName:'createLot',args:[[5000n,0n,0n,0n],hash('gasless'),1078,10669]});
    const nonce=await f.client.readContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'nonces',args:[f.accounts[3]]});
    const deadline=Math.floor(Date.now()/1000)+3600;
    const gas=450000n;
    const signature=await household.signTypedData({
      account:f.accounts[3],
      domain:{name:'EcoLoopForwarder',version:'1',chainId:31337,verifyingContract:f.forwarder},
      types:{ForwardRequest:[
        {name:'from',type:'address'},
        {name:'to',type:'address'},
        {name:'value',type:'uint256'},
        {name:'gas',type:'uint256'},
        {name:'nonce',type:'uint256'},
        {name:'deadline',type:'uint48'},
        {name:'data',type:'bytes'},
      ]},
      primaryType:'ForwardRequest',
      message:{from:f.accounts[3],to:f.address,value:0n,gas,nonce,deadline,data},
    });
    const request={from:f.accounts[3],to:f.address,value:0n,gas,deadline,data,signature};
    assert.equal(await f.client.readContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'verify',args:[request]}),true);

    const before=await f.balance(f.accounts[3]);
    const {request:exec}=await f.client.simulateContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'execute',args:[request],account:f.wallets[2].account});
    const h=await f.wallets[2].writeContract(exec);
    assert.equal((await f.client.waitForTransactionReceipt({hash:h})).status,'success');
    assert.equal((await f.read('getLot',[1n])).owner.toLowerCase(),f.accounts[3].toLowerCase());
    assert.equal(await f.balance(f.accounts[3]),before,'household paid no gas');

    // Verify fulfillRewardRedemption logs true collector via ERC-2771 rather than forwarder address
    await f.claim(0,1n);
    await f.write(0,'proposeLot',[1n,[5000n,0n,0n,0n]]); // 100 ECO
    await f.write(3,'acceptLot',[1n]);
    await f.write(3,'redeemReward',[1n]);

    const fulfillData=encodeFunctionData({abi:artifact.abi,functionName:'fulfillRewardRedemption',args:[1n]});
    const adminNonce=await f.client.readContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'nonces',args:[f.accounts[0]]});
    const adminSig=await f.wallets[0].signTypedData({
      account:f.accounts[0],
      domain:{name:'EcoLoopForwarder',version:'1',chainId:31337,verifyingContract:f.forwarder},
      types:{ForwardRequest:[
        {name:'from',type:'address'},
        {name:'to',type:'address'},
        {name:'value',type:'uint256'},
        {name:'gas',type:'uint256'},
        {name:'nonce',type:'uint256'},
        {name:'deadline',type:'uint48'},
        {name:'data',type:'bytes'},
      ]},
      primaryType:'ForwardRequest',
      message:{from:f.accounts[0],to:f.address,value:0n,gas:250000n,nonce:adminNonce,deadline,data:fulfillData},
    });
    const fulfillReq={from:f.accounts[0],to:f.address,value:0n,gas:250000n,deadline,data:fulfillData,signature:adminSig};
    const {request:execFulfill}=await f.client.simulateContract({address:f.forwarder,abi:forwarderArtifact.abi,functionName:'execute',args:[fulfillReq],account:f.wallets[2].account});
    const fh=await f.wallets[2].writeContract(execFulfill);
    const freceipt=await f.client.waitForTransactionReceipt({hash:fh});
    const fulfilledLog=freceipt.logs.map(l=>{try{return decodeEventLog({abi:artifact.abi,data:l.data,topics:l.topics});}catch{return null;}}).find(e=>e?.eventName==='RewardFulfilled');
    assert.equal(fulfilledLog.args.collector.toLowerCase(),f.accounts[0].toLowerCase(),'RewardFulfilled must record actual collector, not forwarder');
  }finally{await f.connection.close();}
});
