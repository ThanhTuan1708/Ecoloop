import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';

test('wallet rejects refused connections, awaits embedded logout, and never invents a Google account without Client ID',async()=>{
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 globalThis.window=new EventTarget();
 const address='0x1111111111111111111111111111111111111111';let rejected=true;
 window.avalanche={request:async({method})=>{
  if(method==='eth_requestAccounts'){if(rejected)throw Object.assign(new Error('User rejected'),{code:4001});return[address];}
  if(method==='eth_accounts')return[address];if(method==='eth_chainId')return'0xa869';
  if(method==='wallet_switchEthereumChain')return null;throw new Error(method);
 }};
 const output=path.resolve('.data/wallet-session-test.mjs');
 await build({stdin:{contents:"export * from './src/wallet';export * from './src/googleWallet';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify({VITE_CHAIN_ID:'43113'})},logLevel:'silent'});
 try{
  const api=await import(pathToFileURL(output).href+'?'+Date.now());
  await assert.rejects(api.connectWallet('core-legacy'),/reject/i);
  assert.equal(api.getProvider(),undefined);assert.equal(data.has('ecoloop-wallet'),false);
  rejected=false;assert.equal(await api.connectWallet('core-legacy'),address);
  let disconnected=false;api.registerEmbedded(window.avalanche,async()=>{await Promise.resolve();disconnected=true;});
  const logout=api.disconnectWallet();assert.equal(api.getProvider(),undefined);await logout;
  assert.equal(disconnected,true);assert.equal(data.has('ecoloop-wallet'),false);
  await assert.rejects(api.connectGoogle(),/chưa cấu hình/);assert.equal(api.getProvider(),undefined);
 }finally{await fs.unlink(output);delete globalThis.window;delete globalThis.localStorage;}
});
