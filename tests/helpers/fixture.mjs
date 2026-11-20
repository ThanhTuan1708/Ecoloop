// Shared EVM fixture for granular contract tests. One in-process Hardhat EDR chain per file, reset between tests
// with evm_snapshot / evm_revert so every test starts from the same deployed state without redeploying.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import {network} from 'hardhat';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex,parseEther,zeroAddress} from 'viem';
import {hardhat} from 'viem/chains';

export const art=name=>JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8'));
export const pickupArt=art('EcoLoopPickup'),forwarderArt=art('EcoLoopForwarder'),certificateArt=art('EcoLoopCertificate'),rewardsArt=art('EcoLoopRewards'),bridgeArt=art('EcoLoopTeleporterBridge');
export const hash=s=>keccak256(stringToHex(s));
export const COLLECTOR_ROLE=hash('COLLECTOR_ROLE');
export const RATE=parseEther('1000'),RESERVE=parseEther('50000'),POOL=parseEther('5000');
// Roles by account index
export const ADMIN=0,H1=1,H2=2,H3=3,VC=4,UC=5,SC=6,OUT=7;

export async function chain(){
  const connection=await network.create('local');
  const transport=custom(connection.provider);
  const client=createPublicClient({chain:hardhat,transport,pollingInterval:10});
  const accounts=await connection.provider.request({method:'eth_accounts'});
  const wallets=accounts.map(account=>createWalletClient({account,chain:hardhat,transport}));
  const rpc=(method,params=[])=>connection.provider.request({method,params});
  const deploy=async(w,a,args=[])=>{
    const h=await wallets[w].deployContract({abi:a.abi,bytecode:a.bytecode,args});
    const r=await client.waitForTransactionReceipt({hash:h});
    assert.equal(r.status,'success');
    return r.contractAddress;
  };
  const exec=async(w,address,abi,functionName,args=[],value)=>{
    const {request,result}=await client.simulateContract({address,abi,functionName,args,account:wallets[w].account,...(value!==undefined?{value}:{})});
    const h=await wallets[w].writeContract(request);
    const receipt=await client.waitForTransactionReceipt({hash:h});
    assert.equal(receipt.status,'success');
    return {receipt,result};
  };
  const call=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args});
  const increaseTime=async seconds=>{await rpc('evm_increaseTime',[seconds]);await rpc('evm_mine');};
  return {connection,client,accounts,wallets,rpc,deploy,exec,call,increaseTime};
}

/** Deploys forwarder + pickup V4 (+ certificate) + rewards, grants VC and SC the collector role, funds the sponsor pool. */
export async function pickupFixture(){
  const c=await chain();
  const forwarder=await c.deploy(ADMIN,forwarderArt);
  const pickup=await c.deploy(ADMIN,pickupArt,[c.accounts[ADMIN],forwarder,RATE,RESERVE]);
  const certificate=await c.call(pickup,pickupArt.abi,'certificate');
  const rewards=await c.deploy(ADMIN,rewardsArt,[pickup]);
  const f={...c,forwarder,pickup,certificate,rewards};
  f.read=(fn,args=[])=>c.call(pickup,pickupArt.abi,fn,args);
  f.write=(w,fn,args=[],value)=>c.exec(w,pickup,pickupArt.abi,fn,args,value);
  f.cert=(fn,args=[])=>c.call(certificate,certificateArt.abi,fn,args);
  f.eco=a=>f.read('balanceOf',[typeof a==='number'?c.accounts[a]:a]);
  await f.write(ADMIN,'grantRole',[COLLECTOR_ROLE,c.accounts[VC]]);
  await f.write(ADMIN,'grantRole',[COLLECTOR_ROLE,c.accounts[SC]]);
  await f.write(ADMIN,'fundSponsorPool',[POOL]);
  for(const w of [VC,UC])await f.write(w,'buyEco',[parseEther('2000')],parseEther('2'));
  let n=0;
  // 3 kg plastic + 5 kg paper + 1 kg metal = 150 ECO estimate, 180 ECO escrow
  f.create=async(owner=H1,weights=[3000n,5000n,1000n,0n])=>{await f.write(owner,'createLot',[weights,hash(`lot-${++n}-${Math.random()}`),1078,10669]);return f.read('lotCount');};
  f.claim=async(w,id)=>f.write(w,w===SC?'claimLotSponsored':'claimLot',[id,await f.read('requiredDeposit',[id])]);
  f.complete=async({owner=H1,collector=VC,weights,actual}={})=>{
    const id=await f.create(owner,weights);
    await f.claim(collector,id);
    await f.write(collector,'proposeLot',[id,actual||weights||[3000n,5000n,1000n,0n]]);
    await f.write(owner,'acceptLot',[id]);
    return id;
  };
  const base=await c.rpc('evm_snapshot');
  let snap=base;
  f.reset=async()=>{await c.rpc('evm_revert',[snap]);snap=await c.rpc('evm_snapshot');};
  /** Re-takes the baseline snapshot after extra setup (e.g. deploying bridges). */
  f.rebase=async()=>{snap=await c.rpc('evm_snapshot');};
  return f;
}

let mockCache;
/** A minimal TeleporterMessenger that delivers synchronously and records the last message input. */
export function mockTeleporter(){
  if(mockCache)return mockCache;
  const source=`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ITeleporterMessenger, TeleporterMessageInput} from "interfaces/ITeleporterMessenger.sol";
import {ITeleporterReceiver} from "interfaces/ITeleporterReceiver.sol";
contract MockTeleporterMessenger is ITeleporterMessenger {
    bytes32 public localBlockchainID;
    uint256 public nonce;
    uint256 public lastGasLimit;
    address public lastDestination;
    bool public autoDeliver = true;
    constructor(bytes32 id) { localBlockchainID = id; }
    function setLocalBlockchainID(bytes32 id) external { localBlockchainID = id; }
    function setAutoDeliver(bool v) external { autoDeliver = v; }
    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32 messageID) {
        messageID = keccak256(abi.encode(localBlockchainID, msg.sender, ++nonce));
        lastGasLimit = input.requiredGasLimit;
        lastDestination = input.destinationAddress;
        if (autoDeliver) ITeleporterReceiver(input.destinationAddress).receiveTeleporterMessage(localBlockchainID, msg.sender, input.message);
    }
    /// Simulates a relayer delivering an arbitrary payload from (sourceID, sender) to a receiver.
    function deliver(address receiver, bytes32 sourceID, address sender, bytes calldata message) external {
        ITeleporterReceiver(receiver).receiveTeleporterMessage(sourceID, sender, message);
    }
}`;
  const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Mock.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:name=>{try{return {contents:fs.readFileSync(path.join('contracts',name),'utf8')};}catch{return {error:`Missing ${name}`};}}}));
  const errs=(out.errors||[]).filter(e=>e.severity==='error');
  if(errs.length)throw new Error(errs.map(e=>e.formattedMessage).join('\n'));
  const m=out.contracts['Mock.sol'].MockTeleporterMessenger;
  return mockCache={abi:m.abi,bytecode:`0x${m.evm.bytecode.object}`};
}
export {zeroAddress,parseEther};
