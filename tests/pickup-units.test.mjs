// Granular unit tests for EcoLoopPickup V4: one behaviour per test, fresh EVM snapshot per test.
import {describe,test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData} from 'viem';
import {pickupFixture,pickupArt,forwarderArt,hash,COLLECTOR_ROLE,ADMIN,H1,H2,VC,UC,SC,OUT,RATE,RESERVE,POOL,parseEther} from './helpers/fixture.mjs';

const W=[3000n,5000n,1000n,0n]; // 150 ECO estimate, 180 ECO escrow
const DAY=86400;
let f;
before(async()=>{f=await pickupFixture();});
after(async()=>{await f.connection.close();});
beforeEach(async()=>{await f.reset();});
const rejects=(p,re)=>assert.rejects(p,re);

describe('deployment & configuration',()=>{
  test('constructor wires certificate, forwarder, prices, rate and reserve',async()=>{
    assert.equal((await f.cert('minter')).toLowerCase(),f.pickup.toLowerCase());
    assert.equal(await f.read('isTrustedForwarder',[f.forwarder]),true);
    assert.equal(await f.read('pricePerKg',[2n]),parseEther('40'));
    assert.equal(await f.read('ecoPerAvax'),RATE);
    assert.equal(await f.read('VERSION'),4n);
    assert.equal(await f.read('adminIssued'),RESERVE+POOL);
  });
  test('setPrices is admin-only and bounded by MAX_PRICE_PER_KG',async()=>{
    await rejects(f.write(OUT,'setPrices',[[1n,1n,1n,1n]]),/AccessControlUnauthorizedAccount/);
    await rejects(f.write(ADMIN,'setPrices',[[parseEther('1000001'),1n,1n,1n]]),/InvalidInput/);
    await f.write(ADMIN,'setPrices',[[parseEther('30'),1n,1n,1n]]);
    assert.equal(await f.read('pricePerKg',[0n]),parseEther('30'));
  });
  test('collector bonus is capped at 50%',async()=>{
    await rejects(f.write(ADMIN,'setCollectorBonusBps',[5001]),/InvalidInput/);
    await f.write(ADMIN,'setCollectorBonusBps',[5000]);
    assert.equal(await f.read('collectorBonusBps'),5000);
  });
  test('exchange rate is bounded and admin-only',async()=>{
    await rejects(f.write(OUT,'setExchangeRate',[1n]),/AccessControlUnauthorizedAccount/);
    await rejects(f.write(ADMIN,'setExchangeRate',[parseEther('1000000001')]),/InvalidInput/);
  });
});

describe('admin issuance cap',()=>{
  test('fundExchange and fundSponsorPool count toward ADMIN_ISSUANCE_CAP',async()=>{
    const cap=await f.read('ADMIN_ISSUANCE_CAP');
    const room=cap-await f.read('adminIssued');
    await f.write(ADMIN,'fundExchange',[room-parseEther('1')]);
    await f.write(ADMIN,'fundSponsorPool',[parseEther('1')]);
    assert.equal(await f.read('adminIssued'),cap);
    await rejects(f.write(ADMIN,'fundExchange',[1n]),/IssuanceCapExceeded/);
    await rejects(f.write(ADMIN,'fundSponsorPool',[1n]),/IssuanceCapExceeded/);
  });
  test('zero issuance is rejected',async()=>{
    await rejects(f.write(ADMIN,'fundExchange',[0n]),/InvalidInput/);
    await rejects(f.write(ADMIN,'fundSponsorPool',[0n]),/InvalidInput/);
  });
  test('non-admin cannot issue ECO',async()=>{
    await rejects(f.write(VC,'fundSponsorPool',[1n]),/AccessControlUnauthorizedAccount/);
  });
  test('inherited V1 submit/approve can no longer mint ECO (collusion path closed)',async()=>{
    await f.write(H1,'submit',[0,1000,hash('v1')]);
    await rejects(f.write(VC,'approve',[1n,1000]),/LegacyMintDisabled/);
    assert.equal(await f.eco(H1),0n);
  });
});

describe('AVAX → ECO exchange',()=>{
  test('buyEco transfers rate × AVAX and records proceeds',async()=>{
    const before=await f.eco(OUT);
    await f.write(OUT,'buyEco',[parseEther('500')],parseEther('0.5'));
    assert.equal(await f.eco(OUT)-before,parseEther('500'));
    assert.equal(await f.read('exchangeProceeds'),parseEther('4.5')); // 2+2 from fixture + 0.5
  });
  test('slippage guard and empty orders',async()=>{
    await rejects(f.write(OUT,'buyEco',[parseEther('501')],parseEther('0.5')),/ExchangeQuoteChanged/);
    await rejects(f.write(OUT,'buyEco',[0n],parseEther('0.5')),/InvalidInput/);
  });
  test('exchange never sells escrowed ECO or the sponsor pool',async()=>{
    const inv=await f.read('exchangeInventory');
    await rejects(f.write(OUT,'buyEco',[1n],inv*10n**18n/RATE+parseEther('1')),/ExchangeUnavailable/);
  });
  test('disabled exchange rejects purchases',async()=>{
    await f.write(ADMIN,'setExchangeRate',[0n]);
    await rejects(f.write(OUT,'buyEco',[1n],parseEther('1')),/ExchangeUnavailable/);
  });
  test('admin withdraws proceeds only up to the recorded amount',async()=>{
    await rejects(f.write(ADMIN,'withdrawExchangeProceeds',[f.accounts[OUT],parseEther('5')]),/InvalidInput/);
    const before=await f.client.getBalance({address:f.accounts[OUT]});
    await f.write(ADMIN,'withdrawExchangeProceeds',[f.accounts[OUT],parseEther('1')]);
    assert.equal(await f.client.getBalance({address:f.accounts[OUT]})-before,parseEther('1'));
  });
});

describe('createLot',()=>{
  test('stores owner, weights, area and opens the lot',async()=>{
    const id=await f.create(H1,W);
    const lot=await f.read('getLot',[id]);
    assert.equal(lot.owner.toLowerCase(),f.accounts[H1].toLowerCase());
    assert.deepEqual(lot.estimated,W);
    assert.equal(lot.status,1);
    assert.equal(lot.latitude,1078);
  });
  test('rejects zero / over-tonne weights',async()=>{
    await rejects(f.write(H1,'createLot',[[0n,0n,0n,0n],hash('z'),0,0]),/InvalidInput/);
    await rejects(f.write(H1,'createLot',[[1_000_001n,0n,0n,0n],hash('t'),0,0]),/InvalidInput/);
  });
  test('rejects empty evidence and out-of-range coordinates',async()=>{
    await rejects(f.write(H1,'createLot',[W,'0x'+'0'.repeat(64),0,0]),/InvalidInput/);
    await rejects(f.write(H1,'createLot',[W,hash('lat'),9001,0]),/InvalidInput/);
    await rejects(f.write(H1,'createLot',[W,hash('lng'),0,-18001]),/InvalidInput/);
  });
  test('rejects reused evidence',async()=>{
    await f.write(H1,'createLot',[W,hash('same'),0,0]);
    await rejects(f.write(H2,'createLot',[W,hash('same'),0,0]),/DuplicateEvidence/);
  });
  test('owner may cancel only while open',async()=>{
    const id=await f.create();
    await rejects(f.write(H2,'cancelLot',[id]),/InvalidStatus/);
    await f.write(H1,'cancelLot',[id]);
    assert.equal((await f.read('getLot',[id])).status,5);
    await rejects(f.claim(VC,id),/InvalidStatus/);
  });
  test('createLot is blocked while paused',async()=>{
    await f.write(ADMIN,'setPaused',[true]);
    await rejects(f.create(),/EnforcedPause/);
  });
});

describe('claimLot (collector escrow)',()=>{
  test('locks 120% of the estimate from the collector',async()=>{
    const id=await f.create();
    const before=await f.eco(VC);
    await f.claim(VC,id);
    assert.equal(before-await f.eco(VC),parseEther('180'));
    assert.equal(await f.read('totalEscrowed'),parseEther('180'));
    assert.equal((await f.read('getLot',[id])).status,2);
  });
  test('owner cannot claim own lot',async()=>{
    const id=await f.create(UC);
    await rejects(f.claim(UC,id),/SelfApproval/);
  });
  test('second collector loses the race',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await rejects(f.claim(UC,id),/InvalidStatus/);
  });
  test('maximumDeposit protects against price changes',async()=>{
    const id=await f.create();
    const deposit=await f.read('requiredDeposit',[id]);
    await rejects(f.write(VC,'claimLot',[id,deposit-1n]),/DepositAboveMaximum/);
  });
  test('collector without ECO cannot claim',async()=>{
    const id=await f.create();
    await rejects(f.write(OUT,'claimLot',[id,parseEther('180')]),/ERC20InsufficientBalance/);
  });
  test('prices are snapshotted at claim time',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.write(ADMIN,'setPrices',[[1n,1n,1n,1n]]);
    await f.write(VC,'proposeLot',[id,W]);
    assert.equal(await f.read('quotedPayout',[id]),parseEther('150'));
  });
});

describe('claimLotSponsored (sponsor pool)',()=>{
  test('verified station with 0 ECO claims from the pool',async()=>{
    const id=await f.create();
    assert.equal(await f.eco(SC),0n);
    await f.claim(SC,id);
    assert.equal(await f.read('sponsorPool'),POOL-parseEther('180'));
    assert.equal(await f.read('activeSponsored',[f.accounts[SC]]),1n);
    assert.equal(await f.read('lotSponsored',[id]),true);
  });
  test('unverified wallet cannot use the pool',async()=>{
    const id=await f.create();
    await rejects(f.write(UC,'claimLotSponsored',[id,parseEther('180')]),/SponsorUnavailable/);
  });
  test('at most MAX_SPONSORED_ACTIVE concurrent sponsored jobs',async()=>{
    for(let i=0;i<3;i++)await f.claim(SC,await f.create());
    await rejects(f.claim(SC,await f.create()),/SponsorUnavailable/);
  });
  test('pool cannot go negative',async()=>{
    const id=await f.create(H1,[1_000_000n,0n,0n,0n]); // 20,000 ECO estimate > pool
    await rejects(f.claim(SC,id),/SponsorUnavailable/);
  });
  test('settlement pays the household and returns the surplus to the pool',async()=>{
    const id=await f.create();
    await f.claim(SC,id);
    await f.write(SC,'proposeLot',[id,[1000n,0n,0n,0n]]); // 20 ECO
    await f.write(H1,'acceptLot',[id]);
    assert.equal(await f.eco(H1),parseEther('20'));
    assert.equal(await f.read('sponsorPool'),POOL-parseEther('20'));
    assert.equal(await f.read('activeSponsored',[f.accounts[SC]]),0n);
    assert.equal(await f.eco(SC),0n,'collector never receives pool refunds');
  });
  test('release returns the whole sponsored deposit to the pool',async()=>{
    const id=await f.create();
    await f.claim(SC,id);
    await f.write(SC,'releaseLot',[id]);
    assert.equal(await f.read('sponsorPool'),POOL);
    assert.equal(await f.read('activeSponsored',[f.accounts[SC]]),0n);
  });
});

describe('proposeLot',()=>{
  test('only the assigned collector proposes',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await rejects(f.write(UC,'proposeLot',[id,W]),/InvalidStatus/);
    await f.write(VC,'proposeLot',[id,W]);
    assert.equal((await f.read('getLot',[id])).status,3);
  });
  test('cannot propose on an open lot or with zero weight',async()=>{
    const id=await f.create();
    await rejects(f.write(VC,'proposeLot',[id,W]),/InvalidStatus/);
    await f.claim(VC,id);
    await rejects(f.write(VC,'proposeLot',[id,[0n,0n,0n,0n]]),/InvalidInput/);
  });
  test('payout is capped by the escrow when the real weight is higher',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.write(VC,'proposeLot',[id,[30000n,0n,0n,0n]]); // 600 ECO > 180 escrow
    assert.equal(await f.read('quotedPayout',[id]),parseEther('180'));
  });
});

describe('acceptLot (settlement)',()=>{
  test('pays real weight, refunds surplus, mints certificate',async()=>{
    const before=await f.eco(VC);
    const id=await f.complete({actual:[1000n,1000n,0n,0n]}); // 20 + 10 = 30 ECO
    assert.equal(await f.eco(H1),parseEther('30'));
    assert.equal(await f.eco(VC),before-parseEther('30'));
    assert.equal(await f.read('totalEscrowed'),0n);
    assert.equal(await f.read('totalPaid'),parseEther('30'));
    assert.equal((await f.cert('ownerOf',[id])).toLowerCase(),f.accounts[H1].toLowerCase());
  });
  test('only the owner accepts, only once',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.write(VC,'proposeLot',[id,W]);
    await rejects(f.write(H2,'acceptLot',[id]),/InvalidStatus/);
    await f.write(H1,'acceptLot',[id]);
    await rejects(f.write(H1,'acceptLot',[id]),/InvalidStatus/);
  });
  test('verified station settlement counts as verified impact',async()=>{
    await f.complete();
    assert.equal(await f.read('verifiedRecycledGrams',[f.accounts[H1]]),9000n);
    assert.equal((await f.cert('certificate',[1n])).verified,true);
  });
  test('peer-to-peer settlement is recorded but not verified',async()=>{
    await f.complete({collector:UC});
    assert.equal(await f.read('recycledGrams',[f.accounts[H1]]),9000n);
    assert.equal(await f.read('verifiedRecycledGrams',[f.accounts[H1]]),0n);
    assert.equal((await f.cert('certificate',[1n])).verified,false);
  });
  test('peer-to-peer settlement never changes total supply',async()=>{
    const supply=await f.read('totalSupply');
    await f.complete({collector:UC});
    assert.equal(await f.read('totalSupply'),supply);
  });
  test('bonus is minted only for verified stations',async()=>{
    await f.write(ADMIN,'setCollectorBonusBps',[1000]);
    await f.complete({collector:UC});
    assert.equal(await f.eco(H1),parseEther('150'));
    await f.complete({owner:H2});
    assert.equal(await f.eco(H2),parseEther('165'));
  });
  test('expired proposal cannot be accepted',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.write(VC,'proposeLot',[id,W]);
    await f.increaseTime(7*DAY+1);
    await rejects(f.write(H1,'acceptLot',[id]),/InvalidStatus/);
  });
  test('settlement is blocked while paused',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.write(VC,'proposeLot',[id,W]);
    await f.write(ADMIN,'setPaused',[true]);
    await rejects(f.write(H1,'acceptLot',[id]),/EnforcedPause/);
  });
});

describe('disputeLot',()=>{
  const proposed=async()=>{const id=await f.create();await f.claim(VC,id);await f.write(VC,'proposeLot',[id,W]);return id;};
  test('returns the lot to Claimed and clears the weigh-in',async()=>{
    const id=await proposed();
    await f.write(H1,'disputeLot',[id]);
    const lot=await f.read('getLot',[id]);
    assert.equal(lot.status,2);
    assert.deepEqual(lot.actual,[0n,0n,0n,0n]);
    assert.equal(lot.deposit,parseEther('180'),'escrow stays locked');
  });
  test('only the owner disputes, only a proposed lot',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await rejects(f.write(H1,'disputeLot',[id]),/InvalidStatus/);
    await f.write(VC,'proposeLot',[id,W]);
    await rejects(f.write(VC,'disputeLot',[id]),/InvalidStatus/);
  });
  test('at most MAX_DISPUTES re-weighs per claim',async()=>{
    const id=await proposed();
    for(let i=0;i<2;i++){await f.write(H1,'disputeLot',[id]);await f.write(VC,'proposeLot',[id,W]);}
    await rejects(f.write(H1,'disputeLot',[id]),/DisputeLimitReached/);
    await f.write(H1,'acceptLot',[id]);
  });
  test('dispute counter resets when the job is released to a new collector',async()=>{
    const id=await proposed();
    await f.write(H1,'disputeLot',[id]);
    await f.write(VC,'releaseLot',[id]);
    assert.equal(await f.read('disputeCount',[id]),0);
  });
});

describe('releaseLot',()=>{
  test('collector releases any time and gets 100% back',async()=>{
    const id=await f.create();
    const before=await f.eco(VC);
    await f.claim(VC,id);
    await f.write(VC,'releaseLot',[id]);
    assert.equal(await f.eco(VC),before);
    assert.equal((await f.read('getLot',[id])).status,1);
  });
  test('owner can reopen a stalled job only after the timeout',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await rejects(f.write(H1,'releaseLot',[id]),/InvalidStatus/);
    await f.increaseTime(7*DAY+1);
    await f.write(H1,'releaseLot',[id]);
    assert.equal((await f.read('getLot',[id])).collector,'0x0000000000000000000000000000000000000000');
  });
  test('release works while paused so escrow is never trapped',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.write(ADMIN,'setPaused',[true]);
    await f.write(VC,'releaseLot',[id]);
    assert.equal(await f.read('totalEscrowed'),0n);
  });
  test('strangers cannot release',async()=>{
    const id=await f.create();
    await f.claim(VC,id);
    await f.increaseTime(8*DAY);
    await rejects(f.write(OUT,'releaseLot',[id]),/InvalidStatus/);
  });
});

describe('rewards & redemption',()=>{
  test('redeemReward burns ECO and decrements stock',async()=>{
    await f.complete({actual:[5000n,0n,0n,0n]}); // 100 ECO
    const supply=await f.read('totalSupply');
    await f.write(H1,'redeemReward',[1n]);
    assert.equal(await f.eco(H1),0n);
    assert.equal(await f.read('totalSupply'),supply-parseEther('100'));
    assert.equal((await f.read('rewards',[1n]))[2],49n);
  });
  test('cannot redeem without balance or from an inactive reward',async()=>{
    await rejects(f.write(H1,'redeemReward',[1n]),/ERC20InsufficientBalance/);
    await f.write(ADMIN,'configureReward',[1n,parseEther('100'),10n,false]);
    await rejects(f.write(VC,'redeemReward',[1n]),/UnavailableReward/);
  });
  test('fulfillment is collector-only and once',async()=>{
    await f.complete({actual:[5000n,0n,0n,0n]});
    await f.write(H1,'redeemReward',[1n]);
    await rejects(f.write(OUT,'fulfillRewardRedemption',[1n]),/AccessControlUnauthorizedAccount/);
    await f.write(VC,'fulfillRewardRedemption',[1n]);
    await rejects(f.write(VC,'fulfillRewardRedemption',[1n]),/InvalidStatus/);
  });
  test('check-in requires verified recycling and pays from the funded pool',async()=>{
    const {rewardsArt}=await import('./helpers/fixture.mjs');
    await f.write(VC,'transfer',[f.rewards,parseEther('100')]);
    const day=await f.call(f.rewards,rewardsArt.abi,'currentDay');
    await rejects(f.exec(H1,f.rewards,rewardsArt.abi,'claimCheckIn',[day]),/CheckInRequiresVerifiedRecycling/);
    await f.complete();
    await f.exec(H1,f.rewards,rewardsArt.abi,'claimCheckIn',[day]);
    await rejects(f.exec(H1,f.rewards,rewardsArt.abi,'claimCheckIn',[day]),/EcoRewardAlreadyClaimed/);
    await f.exec(H1,f.rewards,rewardsArt.abi,'claimMission',[1]); // 9 kg verified >= 5 kg
  });
});

describe('certificate NFT',()=>{
  test('tokenURI is fully on-chain JSON with an SVG image',async()=>{
    await f.complete();
    const uri=await f.cert('tokenURI',[1n]);
    assert.match(uri,/^data:application\/json;base64,/);
    const meta=JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());
    assert.match(meta.image,/^data:image\/svg\+xml;base64,/);
  });
  test('only the pickup contract can mint',async()=>{
    const {certificateArt}=await import('./helpers/fixture.mjs');
    await rejects(f.exec(OUT,f.certificate,certificateArt.abi,'mint',[f.accounts[OUT],99n,W,f.accounts[OUT],1n,true]),/OnlyMinter/);
  });
  test('certificate totals track verified grams',async()=>{
    await f.complete();
    await f.complete({owner:H2,collector:UC});
    assert.equal(await f.cert('totalSupply'),2n);
    assert.equal(await f.cert('totalCertifiedGrams'),18000n);
    assert.equal(await f.cert('totalVerifiedGrams'),9000n);
  });
});

describe('ERC-2771 gasless',()=>{
  test('forged forwarder suffix from a non-forwarder is ignored',async()=>{
    // Appending an address to calldata does not impersonate it unless msg.sender is the trusted forwarder.
    const data=encodeFunctionData({abi:pickupArt.abi,functionName:'createLot',args:[W,hash('spoof'),0,0]})+f.accounts[H2].slice(2);
    const h=await f.wallets[OUT].sendTransaction({to:f.pickup,data});
    await f.client.waitForTransactionReceipt({hash:h});
    assert.equal((await f.read('getLot',[1n])).owner.toLowerCase(),f.accounts[OUT].toLowerCase());
  });
  test('expired forward request is rejected by the forwarder',async()=>{
    const data=encodeFunctionData({abi:pickupArt.abi,functionName:'createLot',args:[W,hash('late'),0,0]});
    const nonce=await f.call(f.forwarder,forwarderArt.abi,'nonces',[f.accounts[H1]]);
    const deadline=1;
    const signature=await f.wallets[H1].signTypedData({account:f.accounts[H1],domain:{name:'EcoLoopForwarder',version:'1',chainId:31337,verifyingContract:f.forwarder},types:{ForwardRequest:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'gas',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint48'},{name:'data',type:'bytes'}]},primaryType:'ForwardRequest',message:{from:f.accounts[H1],to:f.pickup,value:0n,gas:400000n,nonce,deadline,data}});
    await rejects(f.exec(OUT,f.forwarder,forwarderArt.abi,'execute',[{from:f.accounts[H1],to:f.pickup,value:0n,gas:400000n,deadline,data,signature}]),/ERC2771ForwarderExpiredRequest/);
  });
});

describe('access control',()=>{
  test('admin can revoke a station; later settlements are unverified',async()=>{
    await f.write(ADMIN,'revokeRole',[COLLECTOR_ROLE,f.accounts[VC]]);
    await f.complete();
    assert.equal(await f.read('verifiedRecycledGrams',[f.accounts[H1]]),0n);
  });
  test('only admin pauses',async()=>{
    await rejects(f.write(VC,'setPaused',[true]),/AccessControlUnauthorizedAccount/);
  });
});
