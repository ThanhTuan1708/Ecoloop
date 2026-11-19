// Verifies the EcoLoop V4 contracts on Snowtrace (Routescan, Etherscan-compatible API, no API key needed).
// Reads addresses and constructor arguments from deployments/<chainId>-latest.json (written by deploy:pickup)
// and deployments/icm-latest.json (written by deploy:bridge), then submits the exact standard-JSON input
// that scripts/compile.mjs uses, so the on-chain metadata hash matches.
//
// Usage: npm run verify:fuji
// Optional .env: SNOWTRACE_API_URL (default Routescan Fuji endpoint), SNOWTRACE_API_KEY (default "verifyContract")
import fs from 'node:fs';
import solc from 'solc';
import { encodeAbiParameters } from 'viem';
import { pickupInputSources, resolvePickupImport, solcSettings } from './compile.mjs';

const chainId = 43113;
// Routescan documents the endpoint without and with a trailing /api; try both if the first one is not JSON.
const apiCandidates = process.env.SNOWTRACE_API_URL ? [process.env.SNOWTRACE_API_URL] : [`https://api.routescan.io/v2/network/testnet/evm/${chainId}/etherscan`, `https://api.routescan.io/v2/network/testnet/evm/${chainId}/etherscan/api`];
let api = apiCandidates[0];
const apiKey = process.env.SNOWTRACE_API_KEY || 'verifyContract';
const explorer = 'https://testnet.snowtrace.io';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const deploymentFile = `deployments/${chainId}-latest.json`;
if (!fs.existsSync(deploymentFile)) throw new Error(`${deploymentFile} not found. Run npm run deploy:pickup:fuji first.`);
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
const icm = fs.existsSync('deployments/icm-latest.json') ? JSON.parse(fs.readFileSync('deployments/icm-latest.json', 'utf8')) : undefined;

// 1. Build the full standard-JSON input: project sources + every OpenZeppelin file they import.
const sources = pickupInputSources();
const withMetadata = { language: 'Solidity', sources, settings: { ...solcSettings, outputSelection: { '*': { '*': ['abi', 'metadata'] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(withMetadata), { import: resolvePickupImport }));
const errors = (output.errors || []).filter(e => e.severity === 'error');
if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
for (const contracts of Object.values(output.contracts)) {
  for (const c of Object.values(contracts)) {
    for (const file of Object.keys(JSON.parse(c.metadata).sources)) {
      if (!sources[file]) {
        const resolved = resolvePickupImport(file);
        if (resolved.error) throw new Error(resolved.error);
        sources[file] = { content: resolved.contents };
      }
    }
  }
}
const standardInput = JSON.stringify({ language: 'Solidity', sources, settings: { ...solcSettings, outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'] } } } });
const compilerVersion = 'v' + solc.version().replace(/\.Emscripten.*$/, '');
const abiOf = (file, name) => output.contracts[file][name].abi;

function encodeArgs(file, name, args) {
  const ctor = abiOf(file, name).find(x => x.type === 'constructor');
  if (!ctor || !ctor.inputs.length) return '';
  const values = ctor.inputs.map((input, i) => input.type.startsWith('uint') || input.type.startsWith('int') ? BigInt(args[i]) : args[i]);
  return encodeAbiParameters(ctor.inputs, values).slice(2);
}

async function call(params, method = 'POST') {
  const body = new URLSearchParams({ apikey: apiKey, ...params });
  let lastError;
  for (const candidate of [api, ...apiCandidates.filter(a => a !== api)]) {
    const response = method === 'POST'
      ? await fetch(candidate, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      : await fetch(`${candidate}?${body}`);
    const text = await response.text();
    try { const json = JSON.parse(text); api = candidate; return json; }
    catch { lastError = new Error(`Snowtrace API ${response.status} at ${candidate}: ${text.slice(0, 200)}`); }
  }
  throw lastError;
}

async function verify(label, address, file, name, args = []) {
  if (!address) return console.log(`- ${label}: skipped (no address)`);
  process.stdout.write(`- ${label} ${address} ... `);
  const submit = await call({
    module: 'contract', action: 'verifysourcecode', contractaddress: address,
    sourceCode: standardInput, codeformat: 'solidity-standard-json-input',
    contractname: `${file}:${name}`, compilerversion: compilerVersion,
    constructorArguements: encodeArgs(file, name, args),
  });
  if (submit.status !== '1') {
    if (/already verified/i.test(String(submit.result))) return console.log(`already verified  ${explorer}/address/${address}#code`);
    return console.log(`FAILED: ${submit.result || submit.message}`);
  }
  for (let i = 0; i < 20; i++) {
    await sleep(5000);
    const status = await call({ module: 'contract', action: 'checkverifystatus', guid: submit.result }, 'GET');
    if (/pending/i.test(String(status.result))) continue;
    if (status.status === '1' || /already verified/i.test(String(status.result))) return console.log(`verified  ${explorer}/address/${address}#code`);
    return console.log(`FAILED: ${status.result}`);
  }
  console.log(`still pending, check ${explorer}/address/${address}#code`);
}

console.log(`Verifying on ${apiCandidates[0]}\nCompiler ${compilerVersion}, optimizer 200 runs, evm cancun\n`);
const c = deployment.contracts;
await verify('Forwarder  ', c.forwarder?.address, 'EcoLoopForwarder.sol', 'EcoLoopForwarder');
await verify('Pickup V4  ', c.pickup?.address, 'EcoLoopPickup.sol', 'EcoLoopPickup', c.pickup?.args);
await verify('Certificate', c.certificate?.address, 'EcoLoopCertificate.sol', 'EcoLoopCertificate');
await verify('Rewards    ', c.rewards?.address, 'EcoLoopRewards.sol', 'EcoLoopRewards', c.rewards?.args);
if (icm?.source) await verify('ICM bridge ', icm.source.address, 'EcoLoopTeleporterBridge.sol', 'EcoLoopTeleporterBridge', icm.source.args);
console.log('\nPut the verified Snowtrace links in README.md (section "Hợp đồng trên Fuji").');
