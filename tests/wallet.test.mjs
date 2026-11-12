import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { network } from 'hardhat';

class MemoryStorage {data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
class CustomEventPolyfill extends Event { constructor(type,options){super(type);this.detail=options?.detail;} }
test('Core EIP-1193/6963 adapter connects before contract, adds/switches chain, deploys, submits, rewards, fulfills and restores pending receipts',async()=>{
  const server=await network.createServer('local','127.0.0.1',0);const {port}=await server.listen();
  const {createPublicClient,http,keccak256,stringToHex}=await import('viem');
  const rpc=createPublicClient({transport:http(`http://127.0.0.1:${port}`)});
  const accounts=await rpc.request({method:'eth_accounts'});let selected=accounts[0];let currentChain=1;let added=false;const calls=[];
  const provider={request:async({method,params})=>{calls.push(method);switch(method){
    case 'eth_accounts':case 'eth_requestAccounts':return [selected];
    case 'eth_chainId':return '0x'+currentChain.toString(16);
    case 'wallet_switchEthereumChain':if(!added)throw Object.assign(new Error('Unknown chain'),{code:4902});currentChain=Number(params[0].chainId);return null;
    case 'wallet_addEthereumChain':added=true;return null;
    case 'wallet_watchAsset':return true;
    default:return rpc.request({method,params});
  }}};
  const windowTarget=new EventTarget();windowTarget.ethereum=provider;
  globalThis.window=windowTarget;globalThis.localStorage=new MemoryStorage();globalThis.CustomEvent=CustomEventPolyfill;
  const file=path.resolve('.data',`wallet-test-${randomUUID()}.mjs`);await fs.mkdir(path.dirname(file),{recursive:true});
  await build({stdin:{contents:"export * from './src/wallet'; export * from './src/chain';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify({VITE_CHAIN_ID:'31337',VITE_RPC_URL:`http://127.0.0.1:${port}`})},logLevel:'silent'});
  try{
    const api=await import(pathToFileURL(file).href);
    windowTarget.dispatchEvent(new CustomEventPolyfill('eip6963:announceProvider',{detail:{info:{uuid:'core-test',name:'Core',rdns:'app.core.extension'},provider}}));
    assert.equal(api.walletSnapshot().length,1);
    assert.equal(api.walletSnapshot()[0].name,'Core');
    const account=await api.connectWallet('core-test');assert.equal(account.toLowerCase(),selected.toLowerCase());
    assert.equal(api.getContractAddress(),undefined);assert.equal(currentChain,31337);assert.ok(calls.includes('wallet_addEthereumChain'));
    let deploymentHash;
    const deployed=await api.deployFromWallet(account,hash=>{deploymentHash=hash;assert.equal(api.getPending().kind,'deploy');});
    assert.equal(api.getPending(),undefined);assert.equal(api.getContractAddress().toLowerCase(),deployed.address.toLowerCase());
    assert.equal((await api.readState(account)).admin,true);
    // A different user submits, collector approves, user burns ECO for a reward, collector hands it over.
    selected=accounts[1];await api.connectWallet('core-test');
    await api.transact(selected,'submit',[0,5000n,keccak256(stringToHex('actual-client-flow'))]);
    await assert.rejects(api.checkSubmission(0,5000,keccak256(stringToHex('actual-client-flow')),selected),error=>{
      assert.match(api.errorMessage(error),/Ảnh này đã được sử dụng/);return true;
    });
    await api.checkSubmission(1,5000,keccak256(stringToHex('fresh-photo')),selected);
    // The deployment wallet is not the sender, while the sender cannot approve itself.
    selected=accounts[0];await api.connectWallet('core-test');
    await api.transact(selected,'submit',[1,5000n,keccak256(stringToHex('admin-own-photo'))]);
    await assert.rejects(api.transact(selected,'approve',[2n,5000n]),error=>{
      assert.match(api.errorMessage(error),/không thể tự duyệt/);return true;
    });
    assert.equal((await api.readState(selected)).balance,0);
    selected=accounts[0];await api.connectWallet('core-test');await api.transact(selected,'approve',[1n,5000n]);
    selected=accounts[1];await api.connectWallet('core-test');assert.equal((await api.readState(selected)).balance,100);
    await api.transact(selected,'redeem',[1n]);assert.equal((await api.readState(selected)).balance,0);
    selected=accounts[0];await api.connectWallet('core-test');await api.transact(selected,'fulfillRedemption',[1n]);assert.equal((await api.readState(selected)).redemptions[0].fulfilled,true);
    await api.importToken(selected);assert.ok(calls.includes('wallet_watchAsset'));
    // Re-open an already mined deployment after a browser reload/receipt timeout.
    localStorage.setItem('ecoloop-pending-31337',JSON.stringify({hash:deploymentHash,account,kind:'deploy'}));
    await assert.rejects(api.checkSubmission(0,1000,keccak256(stringToHex('pending-photo')),selected),/giao dịch chưa xác nhận/);
    assert.equal((await api.settlePending()).address.toLowerCase(),deployed.address.toLowerCase());assert.equal(api.getPending(),undefined);
    await assert.rejects(api.saveContractAddress(accounts[2]),/không phải/);
    currentChain=1;await assert.rejects(api.transact(selected,'submit',[0,1n,keccak256(stringToHex('wrong-chain'))]),/sai mạng/);
    api.disconnectWallet();assert.equal(api.getProvider(),undefined);
    const originalFetch=globalThis.fetch;
    try {
      localStorage.setItem('ecoloop-contract-31337',accounts[2]);
      globalThis.fetch=async()=>new Response(JSON.stringify({chainId:31337,contract:deployed.address,collectionName:'Điểm thử nghiệm',collectionInstructions:'Hẹn trước khi đến.'}));
      await api.initializeConfiguration();
      assert.equal(api.hasSharedContract(),true);
      assert.equal(api.getContractAddress().toLowerCase(),deployed.address.toLowerCase());
      assert.equal(api.appConfiguration.collectionName,'Điểm thử nghiệm');
      globalThis.fetch=async()=>new Response(JSON.stringify({chainId:43113,contract:deployed.address}));
      await assert.rejects(api.initializeConfiguration(),/khác mạng/);
    } finally { globalThis.fetch=originalFetch; }
  }finally{await server.close();await fs.unlink(file);delete globalThis.window;delete globalThis.localStorage;delete globalThis.CustomEvent;}
});
