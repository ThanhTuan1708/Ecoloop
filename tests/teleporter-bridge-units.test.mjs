// Granular tests for EcoLoopTeleporterBridge (Avalanche ICM): configuration, sending, receiving, spoofing and replay.
import {describe,test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256,stringToHex} from 'viem';
import {pickupFixture,bridgeArt,certificateArt,mockTeleporter,ADMIN,H1,H2,VC,UC,OUT,zeroAddress} from './helpers/fixture.mjs';

const FUJI='0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5';
const L1=keccak256(stringToHex('ecoloop-esg-l1'));
const L1B=keccak256(stringToHex('second-esg-l1'));
const attestationType=[{type:'tuple',components:[{name:'lotId',type:'uint256'},{name:'household',type:'address'},{name:'collector',type:'address'},{name:'grams',type:'uint64[4]'},{name:'completedAt',type:'uint64'},{name:'paidEco',type:'uint256'}]}];
const payload=(lotId,household,grams=[1000n,0n,0n,0n])=>encodeAbiParameters(attestationType,[{lotId,household,collector:household,grams,completedAt:1n,paidEco:1n}]);

let f,mock,src,dst;
const errorsOf=a=>a.abi.filter(x=>x.type==='error');
// Reverts bubble up from the certificate / bridge, so include their error definitions when decoding.
const bridgeAbi=[...bridgeArt.abi,...errorsOf(certificateArt)],mockAbi=()=>[...mockTeleporter().abi,...errorsOf(bridgeArt)];
const b=(addr,w,fn,args=[])=>f.exec(w,addr,bridgeAbi,fn,args);
const rb=(addr,fn,args=[])=>f.call(addr,bridgeArt.abi,fn,args);
const m=(w,fn,args=[])=>f.exec(w,mock,mockAbi(),fn,args);
before(async()=>{
  f=await pickupFixture();
  mock=await f.deploy(ADMIN,mockTeleporter(),[FUJI]);
  src=await f.deploy(ADMIN,bridgeArt,[f.accounts[ADMIN],mock,f.certificate]);
  dst=await f.deploy(ADMIN,bridgeArt,[f.accounts[ADMIN],mock,zeroAddress]);
  await f.rebase();
});
after(async()=>{await f.connection.close();});
beforeEach(async()=>{await f.reset();});
const link=async()=>{await b(src,ADMIN,'setTrustedRemote',[L1,dst]);await b(dst,ADMIN,'setTrustedRemote',[FUJI,src]);};

describe('configuration',()=>{
  test('constructor rejects zero admin or messenger',async()=>{
    await assert.rejects(f.deploy(ADMIN,bridgeArt,[zeroAddress,mock,f.certificate]),/InvalidConfiguration|reverted/);
    await assert.rejects(f.deploy(ADMIN,bridgeArt,[f.accounts[ADMIN],zeroAddress,f.certificate]),/InvalidConfiguration|reverted/);
  });
  test('canonical Teleporter address constant matches Fuji/Mainnet deployment',async()=>{
    assert.equal(await rb(src,'CANONICAL_TELEPORTER'),'0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf');
  });
  test('setTrustedRemote is admin-only and rejects zero values',async()=>{
    await assert.rejects(b(src,OUT,'setTrustedRemote',[L1,dst]),/AccessControlUnauthorizedAccount/);
    await assert.rejects(b(src,ADMIN,'setTrustedRemote',['0x'+'0'.repeat(64),dst]),/InvalidConfiguration/);
    await assert.rejects(b(src,ADMIN,'setTrustedRemote',[L1,zeroAddress]),/InvalidConfiguration/);
    await b(src,ADMIN,'setTrustedRemote',[L1,dst]);
    assert.equal((await rb(src,'trustedRemotes',[L1])).toLowerCase(),dst.toLowerCase());
  });
});

describe('bridgeCertificate (send)',()=>{
  test('fails without a trusted remote for the destination',async()=>{
    await f.complete();
    await assert.rejects(b(src,H1,'bridgeCertificate',[L1,1n,0n]),/InvalidConfiguration/);
  });
  test('fails for a certificate that does not exist',async()=>{
    await link();
    await assert.rejects(b(src,ADMIN,'bridgeCertificate',[L1,42n,0n]),/ERC721NonexistentToken/);
  });
  test('holder sends; message carries the on-chain certificate data',async()=>{
    await link();
    await f.complete({actual:[2000n,1000n,0n,500n]});
    const {result:messageID}=await b(src,H1,'bridgeCertificate',[L1,1n,0n]);
    assert.equal(await rb(src,'outboundMessageIds',[L1,1n]),messageID);
    const att=await rb(dst,'getInboundAttestation',[FUJI,1n]);
    assert.deepEqual(att.grams,[2000n,1000n,0n,500n]);
    assert.equal(att.household.toLowerCase(),f.accounts[H1].toLowerCase());
    assert.equal(att.collector.toLowerCase(),f.accounts[VC].toLowerCase());
  });
  test('default gas limit is used when 0 is passed, custom otherwise',async()=>{
    await link();
    await f.complete();await f.complete({owner:H2});
    await b(src,H1,'bridgeCertificate',[L1,1n,0n]);
    assert.equal(await f.call(mock,mockTeleporter().abi,'lastGasLimit'),250000n);
    await b(src,H2,'bridgeCertificate',[L1,2n,400000n]);
    assert.equal(await f.call(mock,mockTeleporter().abi,'lastGasLimit'),400000n);
  });
  test('admin may bridge on behalf of a holder; strangers may not',async()=>{
    await link();
    await f.complete();
    await assert.rejects(b(src,OUT,'bridgeCertificate',[L1,1n,0n]),/NotCertificateHolder/);
    await b(src,ADMIN,'bridgeCertificate',[L1,1n,0n]);
  });
  test('after an NFT transfer the new holder controls bridging',async()=>{
    await link();
    await f.complete();
    await f.exec(H1,f.certificate,certificateArt.abi,'transferFrom',[f.accounts[H1],f.accounts[H2],1n]);
    await assert.rejects(b(src,H1,'bridgeCertificate',[L1,1n,0n]),/NotCertificateHolder/);
    await b(src,H2,'bridgeCertificate',[L1,1n,0n]);
    assert.equal((await rb(dst,'getInboundAttestation',[FUJI,1n])).household.toLowerCase(),f.accounts[H2].toLowerCase());
  });
  test('unverified (peer-to-peer) certificates are refused',async()=>{
    await link();
    await f.complete({collector:UC});
    await assert.rejects(b(src,H1,'bridgeCertificate',[L1,1n,0n]),/UnverifiedCertificate/);
  });
  test('same lot can go to two different L1s but only once to each',async()=>{
    const dst2=await f.deploy(ADMIN,bridgeArt,[f.accounts[ADMIN],mock,zeroAddress]);
    await link();
    await b(src,ADMIN,'setTrustedRemote',[L1B,dst2]);
    await b(dst2,ADMIN,'setTrustedRemote',[FUJI,src]);
    await f.complete();
    await b(src,H1,'bridgeCertificate',[L1,1n,0n]);
    await b(src,H1,'bridgeCertificate',[L1B,1n,0n]);
    await assert.rejects(b(src,H1,'bridgeCertificate',[L1,1n,0n]),/AttestationAlreadyBridged/);
    assert.equal(await rb(src,'totalOutboundAttestations'),2n);
  });
  test('receive-only bridge cannot send',async()=>{
    await b(dst,ADMIN,'setTrustedRemote',[FUJI,src]);
    await assert.rejects(b(dst,ADMIN,'bridgeCertificate',[FUJI,1n,0n]),/InvalidConfiguration/);
  });
});

describe('receiveTeleporterMessage (receive)',()=>{
  test('only the Teleporter messenger may deliver',async()=>{
    await link();
    await assert.rejects(b(dst,OUT,'receiveTeleporterMessage',[FUJI,src,payload(1n,f.accounts[H1])]),/UnauthorizedTeleporter/);
  });
  test('messages from an untrusted source bridge are rejected',async()=>{
    await link();
    await assert.rejects(m(OUT,'deliver',[dst,FUJI,f.accounts[OUT],payload(1n,f.accounts[H1])]),/UntrustedRemoteBridge/);
  });
  test('messages from an unknown source chain are rejected',async()=>{
    await link();
    await assert.rejects(m(OUT,'deliver',[dst,L1B,src,payload(1n,f.accounts[H1])]),/UntrustedRemoteBridge/);
  });
  test('replayed delivery of the same lot is rejected',async()=>{
    await link();
    await m(OUT,'deliver',[dst,FUJI,src,payload(7n,f.accounts[H1])]);
    await assert.rejects(m(OUT,'deliver',[dst,FUJI,src,payload(7n,f.accounts[H1])]),/AttestationAlreadyBridged/);
  });
  test('per-chain and global certified grams accumulate',async()=>{
    await link();
    await m(OUT,'deliver',[dst,FUJI,src,payload(1n,f.accounts[H1],[1000n,2000n,0n,0n])]);
    await m(OUT,'deliver',[dst,FUJI,src,payload(2n,f.accounts[H2],[0n,0n,500n,0n])]);
    assert.equal(await rb(dst,'remoteCertifiedGramsByChain',[FUJI]),3500n);
    assert.equal(await rb(dst,'totalRemoteCertifiedGrams'),3500n);
    assert.equal(await rb(dst,'totalInboundAttestations'),2n);
    assert.equal(await rb(dst,'hasInboundAttestation',[FUJI,2n]),true);
  });
  test('malformed payload reverts without recording anything',async()=>{
    await link();
    await assert.rejects(m(OUT,'deliver',[dst,FUJI,src,'0x1234']),/reverted/);
    assert.equal(await rb(dst,'totalInboundAttestations'),0n);
  });
  test('re-pointing a trusted remote cuts off the old bridge',async()=>{
    await link();
    await b(dst,ADMIN,'setTrustedRemote',[FUJI,f.accounts[OUT]]);
    await assert.rejects(m(OUT,'deliver',[dst,FUJI,src,payload(1n,f.accounts[H1])]),/UntrustedRemoteBridge/);
  });
});
