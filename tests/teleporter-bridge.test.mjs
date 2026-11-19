import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import {network} from 'hardhat';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex,parseEther} from 'viem';
import {hardhat} from 'viem/chains';

const pickupArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopPickup.json','utf8'));
const forwarderArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopForwarder.json','utf8'));
const bridgeArtifact=JSON.parse(fs.readFileSync('artifacts/EcoLoopTeleporterBridge.json','utf8'));

function compileMockTeleporter(){
  const source=`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ITeleporterMessenger, TeleporterMessageInput} from "interfaces/ITeleporterMessenger.sol";
import {ITeleporterReceiver} from "interfaces/ITeleporterReceiver.sol";

contract MockTeleporterMessenger is ITeleporterMessenger {
    bytes32 public immutable localBlockchainID;
    uint256 public nonce;
    constructor(bytes32 chainIdBytes) { localBlockchainID = chainIdBytes; }
    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32 messageID) {
        messageID = keccak256(abi.encode(localBlockchainID, msg.sender, ++nonce));
        ITeleporterReceiver(input.destinationAddress).receiveTeleporterMessage(
            localBlockchainID,
            msg.sender,
            input.message
        );
    }
}`;
  const input={
    language:'Solidity',
    sources:{'MockTeleporterMessenger.sol':{content:source}},
    settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}},
  };
  const out=JSON.parse(solc.compile(JSON.stringify(input),{
    import:name=>{
      try{return {contents:fs.readFileSync(path.join('contracts',name),'utf8')};}
      catch{return {error:`Missing ${name}`};}
    },
  }));
  const errs=(out.errors||[]).filter(e=>e.severity==='error');
  if(errs.length)throw new Error(errs.map(e=>e.formattedMessage).join('\n'));
  const c=out.contracts['MockTeleporterMessenger.sol'].MockTeleporterMessenger;
  return {abi:c.abi,bytecode:`0x${c.evm.bytecode.object}`};
}

const mockTeleporter=compileMockTeleporter();
const FUJI_CHAIN_ID_BYTES='0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5';
const ESG_L1_CHAIN_ID_BYTES=keccak256(stringToHex('ecoloop-esg-audit-l1'));

test('Avalanche ICM Teleporter bridge attests ECOREC certificates cross-chain and blocks spoofing & replay',async()=>{
  const connection=await network.create('local');
  try{
    const transport=custom(connection.provider);
    const client=createPublicClient({chain:hardhat,transport});
    const accounts=await connection.provider.request({method:'eth_accounts'});
    const wallets=accounts.slice(0,4).map(account=>createWalletClient({account,chain:hardhat,transport}));

    const deploy=async(w,art,args=[])=>{
      const h=await wallets[w].deployContract({abi:art.abi,bytecode:art.bytecode,args});
      return (await client.waitForTransactionReceipt({hash:h})).contractAddress;
    };

    const forwarder=await deploy(0,forwarderArtifact);
    const pickup=await deploy(0,pickupArtifact,[accounts[0],forwarder,parseEther('1000'),parseEther('50000')]);
    const certificate=await client.readContract({address:pickup,abi:pickupArtifact.abi,functionName:'certificate'});
    const messenger=await deploy(0,mockTeleporter,[FUJI_CHAIN_ID_BYTES]);

    // Source bridge on Fuji C-Chain & Destination bridge on ESG Audit Avalanche L1
    const sourceBridge=await deploy(0,bridgeArtifact,[accounts[0],messenger,certificate]);
    // Destination L1 has no ECOREC contract: receive-only registry (certificate = address(0)).
    const destBridge=await deploy(0,bridgeArtifact,[accounts[0],messenger,'0x0000000000000000000000000000000000000000']);

    const exec=async(w,address,abi,functionName,args=[],value)=>{
      const {request}=await client.simulateContract({address,abi,functionName,args,account:wallets[w].account,...(value!==undefined?{value}:{})});
      const h=await wallets[w].writeContract(request);
      assert.equal((await client.waitForTransactionReceipt({hash:h})).status,'success');
    };

    // Complete a real recycling lot so household (accounts[1]) receives ECOREC NFT #1
    await exec(1,pickup,pickupArtifact.abi,'createLot',[[2000n,3000n,1000n,500n],keccak256(stringToHex('icm-lot-1')),1078,10669]);
    await exec(2,pickup,pickupArtifact.abi,'buyEco',[parseEther('500')],parseEther('0.5'));
    const reqDeposit=await client.readContract({address:pickup,abi:pickupArtifact.abi,functionName:'requiredDeposit',args:[1n]});
    await exec(2,pickup,pickupArtifact.abi,'claimLot',[1n,reqDeposit]);
    await exec(2,pickup,pickupArtifact.abi,'proposeLot',[1n,[2000n,3000n,1000n,500n]]); // 6.5 kg total
    await exec(1,pickup,pickupArtifact.abi,'acceptLot',[1n]);

    // Configure trusted remote bridges
    await exec(0,sourceBridge,bridgeArtifact.abi,'setTrustedRemote',[ESG_L1_CHAIN_ID_BYTES,destBridge]);
    await exec(0,destBridge,bridgeArtifact.abi,'setTrustedRemote',[FUJI_CHAIN_ID_BYTES,sourceBridge]);

    // Non-holder cannot bridge someone else's ECOREC certificate
    await assert.rejects(
      exec(2,sourceBridge,bridgeArtifact.abi,'bridgeCertificate',[ESG_L1_CHAIN_ID_BYTES,1n,0n]),
      /NotCertificateHolder/
    );

    // Direct spoofing bypassing Teleporter Messenger is rejected
    await assert.rejects(
      exec(2,destBridge,bridgeArtifact.abi,'receiveTeleporterMessage',[FUJI_CHAIN_ID_BYTES,sourceBridge,'0x00']),
      /UnauthorizedTeleporter/
    );

    // Certificate holder dispatches ICM cross-chain EPR proof -> delivered to destination Avalanche L1
    await exec(1,sourceBridge,bridgeArtifact.abi,'bridgeCertificate',[ESG_L1_CHAIN_ID_BYTES,1n,300000n]);

    assert.equal(await client.readContract({address:sourceBridge,abi:bridgeArtifact.abi,functionName:'totalOutboundAttestations'}),1n);
    assert.equal(await client.readContract({address:destBridge,abi:bridgeArtifact.abi,functionName:'totalInboundAttestations'}),1n);
    assert.equal(await client.readContract({address:destBridge,abi:bridgeArtifact.abi,functionName:'totalRemoteCertifiedGrams'}),6500n);

    const inbound=await client.readContract({address:destBridge,abi:bridgeArtifact.abi,functionName:'getInboundAttestation',args:[FUJI_CHAIN_ID_BYTES,1n]});
    assert.equal(inbound.household.toLowerCase(),accounts[1].toLowerCase());
    assert.equal(inbound.collector.toLowerCase(),accounts[2].toLowerCase());
    assert.deepEqual(inbound.grams,[2000n,3000n,1000n,500n]);

    // A receive-only destination bridge cannot send certificates
    await assert.rejects(
      exec(0,destBridge,bridgeArtifact.abi,'bridgeCertificate',[FUJI_CHAIN_ID_BYTES,1n,0n]),
      /InvalidConfiguration/
    );

    // Duplicate cross-chain attestation of the same lot to the same destination L1 is blocked
    await assert.rejects(
      exec(1,sourceBridge,bridgeArtifact.abi,'bridgeCertificate',[ESG_L1_CHAIN_ID_BYTES,1n,300000n]),
      /AttestationAlreadyBridged/
    );
  }finally{
    await connection.close();
  }
});
