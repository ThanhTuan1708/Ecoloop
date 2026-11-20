// Rewrites the contract table in README.md (between the contracts:start/end markers) from
// config/app.json, deployments/43113-latest.json and deployments/icm-latest.json.
// Called automatically by deploy:pickup:fuji and deploy:bridge:fuji; can be run alone: node scripts/readme-contracts.mjs
import fs from 'node:fs';

export function updateReadmeContracts() {
  const start = '<!-- contracts:start -->', end = '<!-- contracts:end -->';
  const readme = fs.readFileSync('README.md', 'utf8');
  if (!readme.includes(start) || !readme.includes(end)) return false;
  const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const config = read('config/app.json') || {};
  const deployment = read('deployments/43113-latest.json');
  const icmFile = read('deployments/icm-latest.json');
  // Ignore an ICM record made for an older certificate contract.
  const icm = icmFile && (!config.certificateContract || icmFile.certificate?.toLowerCase() === config.certificateContract.toLowerCase()) ? icmFile : undefined;
  const snow = 'https://testnet.snowtrace.io';
  const addr = a => a ? `[\`${a}\`](${snow}/address/${a}#code)` : '—';
  const tx = h => h ? `[tx](${snow}/tx/${h})` : '';
  const c = deployment?.contracts || {};
  const rows = [
    ['EcoLoopPickup V4 (ECO + escrow + ERC-2771)', config.pickupContract, c.pickup?.txHash],
    ['EcoLoopCertificate (ECOREC NFT, SVG on-chain)', config.certificateContract || c.certificate?.address, undefined],
    ['EcoLoopForwarder (gasless, ERC-2771)', config.forwarderContract || c.forwarder?.address, c.forwarder?.txHash],
    ['EcoLoopRewards (check-in, missions)', config.rewardsContract, c.rewards?.txHash],
    ['EcoLoopTeleporterBridge (Avalanche ICM, source)', icm?.source?.address || config.teleporterBridge, icm?.source?.txHash],
  ];
  const lines = [
    `Mạng: **Avalanche Fuji C-Chain (43113)**${config.pickupDeployBlock ? ` · block triển khai #${config.pickupDeployBlock}` : ''}${deployment?.createdAt ? ` · cập nhật ${deployment.createdAt.slice(0, 10)}` : ''}`,
    '',
    '| Contract | Địa chỉ (Snowtrace) | Deploy |',
    '|---|---|---|',
    ...rows.map(([name, a, h]) => `| ${name} | ${addr(a)} | ${tx(h)} |`),
  ];
  if (icm?.destination) {
    const dst = icm.destination;
    const dstLink = a => dst.explorer ? `[\`${a}\`](${dst.explorer}/address/${a})` : `\`${a}\``;
    lines.push('', `**ICM (Teleporter) thật:** Fuji C-Chain → ${dst.chain} (blockchainID \`${dst.blockchainId}\`), bridge đích ${dstLink(dst.address)}.`);
    const messages = icm.messages || (icm.bridgeTx ? [{ lotId: icm.lotId, bridgeTx: icm.bridgeTx, messageId: icm.messageId, delivered: icm.delivered }] : []);
    if (messages.length) {
      lines.push('', '| Chứng nhận | Gửi trên Fuji | messageID (Teleporter) | Ở L1 đích |', '|---|---|---|---|');
      for (const m of messages) lines.push(`| ECOREC #${m.lotId} | ${tx(m.bridgeTx)} | \`${m.messageId.slice(0, 18)}…\` | ${m.delivered ? '**đã nhận** ✅' : 'đang chờ relayer'}${m.deliveryTx && dst.explorer ? ` ([tx](${dst.explorer}/tx/${m.deliveryTx}))` : ''} |`);
      lines.push('', `Tự kiểm tra trên L1 đích: gọi \`totalInboundAttestations()\` hoặc \`getInboundAttestation(sourceBlockchainID, lotId)\` trên bridge ${dstLink(dst.address)} (RPC \`${dst.rpc || ''}\`).`);
    }
  } else {
    const deployed = icm?.source?.address || config.teleporterBridge;
    lines.push('', `**ICM (Teleporter):** ${deployed ? 'bridge nguồn đã triển khai trên Fuji, chưa kết nối L1 đích' : 'chưa triển khai lên mạng'}. Luồng gửi/nhận, chống giả mạo và chống phát lại được kiểm thử tự động trong \`tests/teleporter-bridge.test.mjs\`.`);
  }
  const next = readme.slice(0, readme.indexOf(start) + start.length) + '\n' + lines.join('\n') + '\n' + readme.slice(readme.indexOf(end));
  fs.writeFileSync('README.md', next);
  return true;
}
if (process.argv[1]?.endsWith('readme-contracts.mjs')) console.log(updateReadmeContracts() ? 'README.md contract table updated.' : 'README.md has no contracts markers.');
