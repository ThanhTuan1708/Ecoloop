// Stateful fuzzing of EcoLoopPickup V4: random sequences of household / collector / admin actions, with the
// escrow and supply invariants checked after every step. Seeds are fixed so failures are reproducible;
// set FUZZ_SEEDS=10 FUZZ_STEPS=200 for a longer run.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {pickupFixture,hash,ADMIN,H1,H2,H3,VC,UC,SC,POOL,parseEther} from './helpers/fixture.mjs';

const SEEDS=Number(process.env.FUZZ_SEEDS||3),STEPS=Number(process.env.FUZZ_STEPS||70);
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

let f;
before(async()=>{f=await pickupFixture();});
after(async()=>{await f.connection.close();});

async function checkInvariants(model,step){
  const ctx=`step ${step} (${model.lastAction})`;
  const n=await f.read('lotCount');
  let escrow=0n,paid=0n,sponsoredDeposits=0n,sponsoredPaid=0n,completed=0n;
  const active=new Map();
  const ids=Array.from({length:Number(n)},(_,i)=>BigInt(i+1));
  const rows=await Promise.all(ids.map(id=>Promise.all([f.read('getLot',[id]),f.read('lotSponsored',[id]),f.read('disputeCount',[id])])));
  for(const [i,[lot,sponsored,disputes]] of rows.entries()){
    const id=ids[i];
    escrow+=lot.deposit;paid+=lot.paid;
    if(lot.status===2||lot.status===3){
      assert.ok(lot.deposit>0n,`${ctx}: active lot ${id} has escrow`);
      if(sponsored){sponsoredDeposits+=lot.deposit;active.set(lot.collector,(active.get(lot.collector)||0n)+1n);}
    }else{
      assert.equal(lot.deposit,0n,`${ctx}: inactive lot ${id} holds no escrow`);
      assert.equal(sponsored,false,`${ctx}: inactive lot ${id} is not sponsored`);
    }
    if(lot.status===4){completed++;if(model.sponsoredPaid.has(id))sponsoredPaid+=lot.paid;}
    assert.ok(disputes<=2,`${ctx}: dispute limit`);
  }
  // 1. Escrow accounting matches the sum of per-lot deposits.
  assert.equal(await f.read('totalEscrowed'),escrow,`${ctx}: totalEscrowed`);
  assert.equal(await f.read('totalPaid'),paid,`${ctx}: totalPaid`);
  // 2. The contract always holds escrow + sponsor pool (exchangeInventory never underflows).
  const held=await f.eco(f.pickup);
  assert.ok(held>=escrow+await f.read('sponsorPool'),`${ctx}: solvency`);
  // 3. Sponsor pool conservation: pool + locked sponsored deposits + sponsored payouts == funded amount.
  assert.equal(await f.read('sponsorPool')+sponsoredDeposits+sponsoredPaid,POOL,`${ctx}: sponsor pool conservation`);
  // 4. Per-collector sponsored job count is exact and capped.
  for(const w of [VC,UC,SC]){
    const a=f.accounts[w];
    const expected=[...active].filter(([c])=>c.toLowerCase()===a.toLowerCase()).reduce((s,[,v])=>s+v,0n);
    const onChain=await f.read('activeSponsored',[a]);
    assert.equal(onChain,expected,`${ctx}: activeSponsored`);
    assert.ok(onChain<=3n,`${ctx}: sponsored cap`);
  }
  // 5. Supply only changes through capped admin issuance (bonus is 0 here): escrow settlement never mints.
  assert.equal(await f.read('totalSupply'),await f.read('adminIssued'),`${ctx}: supply == adminIssued`);
  // 6. One certificate per completed lot.
  assert.equal(await f.cert('totalSupply'),completed,`${ctx}: certificates`);
}

for(let seed=1;seed<=SEEDS;seed++){
  test(`random action sequences keep escrow, sponsor pool and supply invariants (seed ${seed})`,async()=>{
    await f.reset();
    const r=rng(seed*7919);
    const pick=a=>a[Math.floor(r()*a.length)];
    const grams=()=>[0,1,2,3].map(()=>r()<0.5?0n:BigInt(Math.floor(r()*20000)+1));
    const weights=()=>{let w;do{w=grams();}while(w.every(x=>x===0n));return w;};
    const model={lastAction:'start',sponsoredPaid:new Set()};
    let ok=0;
    for(let step=0;step<STEPS;step++){
      const n=await f.read('lotCount');
      const id=n>0n?BigInt(Math.floor(r()*Number(n))+1):1n;
      const lot=n>0n?await f.read('getLot',[id]):undefined;
      const sponsored=n>0n?await f.read('lotSponsored',[id]):false;
      const owners=[H1,H2,H3],collectors=[VC,UC,SC];
      const actions=[
        ['create',async()=>f.write(pick(owners),'createLot',[weights(),hash(`fuzz-${seed}-${step}`),1078,10669])],
        ['claim',async()=>f.claim(pick(collectors),id)],
        ['propose',async()=>f.write(collectors.find(w=>f.accounts[w].toLowerCase()===lot?.collector.toLowerCase())??VC,'proposeLot',[id,weights()])],
        ['accept',async()=>{const owner=owners.find(w=>f.accounts[w].toLowerCase()===lot?.owner.toLowerCase())??H1;await f.write(owner,'acceptLot',[id]);if(sponsored)model.sponsoredPaid.add(id);}],
        ['dispute',async()=>f.write(owners.find(w=>f.accounts[w].toLowerCase()===lot?.owner.toLowerCase())??H1,'disputeLot',[id])],
        ['release',async()=>f.write(r()<0.7?(collectors.find(w=>f.accounts[w].toLowerCase()===lot?.collector.toLowerCase())??VC):(owners.find(w=>f.accounts[w].toLowerCase()===lot?.owner.toLowerCase())??H1),'releaseLot',[id])],
        ['cancel',async()=>f.write(owners.find(w=>f.accounts[w].toLowerCase()===lot?.owner.toLowerCase())??H1,'cancelLot',[id])],
        ['time',async()=>f.increaseTime(Math.floor(r()*5)*86400)],
        ['price',async()=>f.write(ADMIN,'setPrices',[[0,1,2,3].map(()=>parseEther(String(Math.floor(r()*50)+1)))])],
        ['wrong-actor',async()=>f.write(pick([H1,H2,H3,VC,UC,SC]),pick(['acceptLot','proposeLot','releaseLot','disputeLot','cancelLot']),pick([[id],[id,weights()]]))],
      ];
      const [name,run]=n===0n?actions[0]:pick(actions);
      model.lastAction=`${name} #${id}`;
      try{await run();ok++;}catch(e){ /* Reverts are expected for invalid random actions; state must stay consistent. */
        if(!/reverted|InvalidStatus|InvalidInput|SelfApproval|SponsorUnavailable|DisputeLimitReached|ERC20InsufficientBalance|DepositAboveMaximum|EnforcedPause|DuplicateEvidence|Function .* not found|AbiEncodingLengthMismatch|Expected length|Invalid arguments/i.test(String(e?.message||e)))throw e;
      }
      await checkInvariants(model,step);
    }
    assert.ok(ok>STEPS/4,`enough successful actions (${ok}/${STEPS})`);
  });
}
