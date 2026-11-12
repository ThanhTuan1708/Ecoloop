import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createMarketplaceHandler,
  lotToProductCard,
  queryMarketplaceCards,
} from '../server/marketplace.mjs'

async function call(handler, path, method = 'GET', bodyData = null) {
  let status, headers, body
  const res = {
    headersSent: false,
    writeHead(s, h) {
      status = s
      headers = h
      this.headersSent = true
    },
    end(b) {
      body = Buffer.isBuffer(b) ? b.toString() : b
    },
  }
  const req = {
    method,
    socket: { remoteAddress: 'local' },
    async *[Symbol.asyncIterator]() {
      if (bodyData) yield Buffer.from(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData))
    },
  }
  await handler(req, res, new URL(path, 'http://localhost'))
  return { status, headers, body, json: () => JSON.parse(body) }
}

const SAMPLE_LOTS = [
  {
    id: 1,
    owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    collector: '0x0000000000000000000000000000000000000000',
    status: 1, // Open -> ACTIVE
    estimated: [4500, 1000, 0, 0],
    actual: [0, 0, 0, 0],
    latitude: 1078,
    longitude: 10670,
    evidence: '0x1111111111111111111111111111111111111111111111111111111111111111',
    updatedAt: 1715000000,
  },
  {
    id: 2,
    owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    collector: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    status: 2, // Claimed -> IN_ESCROW
    estimated: [0, 0, 3000, 500],
    actual: [0, 0, 0, 0],
    latitude: 1073,
    longitude: 10672,
    evidence: '0x2222222222222222222222222222222222222222222222222222222222222222',
    updatedAt: 1715003600,
  },
  {
    id: 3,
    owner: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    collector: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    status: 4, // Completed -> SOLD
    estimated: [2000, 2000, 1000, 0],
    actual: [2100, 2000, 1100, 0],
    latitude: 1080,
    longitude: 10673,
    evidence: '0x3333333333333333333333333333333333333333333333333333333333333333',
    updatedAt: 1715007200,
  },
  {
    id: 4,
    owner: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    collector: '0x0000000000000000000000000000000000000000',
    status: 5, // Cancelled -> CANCELLED
    estimated: [1000, 0, 0, 2000],
    actual: [0, 0, 0, 0],
    latitude: 2103,
    longitude: 10585,
    evidence: '0x4444444444444444444444444444444444444444444444444444444444444444',
    updatedAt: 1715010800,
  },
]

describe('Shopee-style C2C Web3 Marketplace Engine & API', () => {
  it('transforms a PickupLot into a hybrid ShopeeWeb3ProductCard with off-chain & on-chain fields', () => {
    const card = lotToProductCard(SAMPLE_LOTS[1], {
      chainId: 31337,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      center: [10.7769, 106.7009],
      allLots: SAMPLE_LOTS,
    })

    assert.equal(card.lotId, 2)
    assert.equal(card.thumbnail.protocol, 'ipfs')
    assert.equal(card.seller.location.district, 'Quận 7')
    assert.equal(card.seller.location.province, 'TP. Hồ Chí Minh')
    assert.ok(typeof card.seller.location.distanceKm === 'number' && card.seller.location.distanceKm > 0)
    assert.equal(card.onChain.escrowStatus, 'IN_ESCROW')
    assert.equal(card.pricing.tokenSymbol, 'ECO')
    assert.equal(card.pricing.ecoAmount, 124)
    assert.ok(card.pricing.vndEquivalent > 0)
    assert.ok(card.onChain.escrowLockExpiresAt)
    assert.equal(card.uiState.canBuyNow, false)
    assert.equal(card.uiState.status, 'IN_ESCROW')
  })

  it('supports Shopee sorting (price_asc, price_desc, top_sales) and status/category filtering', () => {
    const ascResult = queryMarketplaceCards(SAMPLE_LOTS, {
      status: 'ALL',
      sort: 'price_asc',
      limit: 10,
    })
    assert.equal(ascResult.items.length, 4)
    for (let i = 1; i < ascResult.items.length; i++) {
      assert.ok(
        ascResult.items[i].pricing.usdEquivalent >=
          ascResult.items[i - 1].pricing.usdEquivalent,
      )
    }

    const activeOnly = queryMarketplaceCards(SAMPLE_LOTS, {
      status: 'ACTIVE',
      sort: 'newest',
    })
    assert.equal(activeOnly.items.length, 1)
    assert.equal(activeOnly.items[0].onChain.escrowStatus, 'ACTIVE')
    assert.equal(activeOnly.meta.facets.statusCounts.ACTIVE, 1)
    assert.equal(activeOnly.meta.facets.statusCounts.IN_ESCROW, 1)
    assert.equal(activeOnly.meta.facets.statusCounts.SOLD, 1)
    assert.equal(activeOnly.meta.facets.statusCounts.CANCELLED, 1)
  })

  it('serves GET /api/marketplace/listings with cursor & page pagination', async () => {
    const mockContract = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
    const handler = createMarketplaceHandler({
      chainId: 31337,
      configFile: 'non-existent-config.json',
      pickupArtifact: { abi: [] },
      client: {
        async readContract({ functionName, args }) {
          if (functionName === 'lotCount') return BigInt(SAMPLE_LOTS.length)
          if (functionName === 'getLot') {
            const id = Number(args[0])
            return SAMPLE_LOTS.find((l) => l.id === id)
          }
          throw new Error(`Unexpected call: ${functionName}`)
        },
      },
    })

    const page1Res = await call(
      handler,
      `/api/marketplace/listings?contract=${mockContract}&status=ALL&sort=newest&limit=2`,
    )
    assert.equal(page1Res.status, 200)
    const page1 = page1Res.json()

    assert.equal(page1.items.length, 2)
    assert.equal(page1.meta.pagination.hasNextPage, true)
    assert.ok(page1.meta.pagination.nextCursor)
    assert.equal(page1.meta.pagination.totalItems, 4)

    // Fetch next page using cursor (infinite scroll mode)
    const page2Res = await call(
      handler,
      `/api/marketplace/listings?contract=${mockContract}&status=ALL&sort=newest&limit=2&cursor=${encodeURIComponent(page1.meta.pagination.nextCursor)}`,
    )
    assert.equal(page2Res.status, 200)
    const page2 = page2Res.json()
    assert.equal(page2.items.length, 2)
    assert.notEqual(page1.items[0].lotId, page2.items[0].lotId)
    assert.equal(page2.meta.pagination.hasNextPage, false)
  })

  it('serves GET and POST /api/marketplace/catalog for cross-browser synchronization', async () => {
    const handler = createMarketplaceHandler({
      chainId: 31337,
      configFile: 'non-existent-config.json',
      pickupArtifact: { abi: [] },
      client: {},
    })

    // Reset catalog first
    const resetRes = await call(handler, '/api/marketplace/catalog', 'POST', { action: 'reset' })
    assert.equal(resetRes.status, 200)

    // GET empty/null
    const getRes = await call(handler, '/api/marketplace/catalog', 'GET')
    assert.equal(getRes.status, 200)
    const emptyCatalog = getRes.json()
    assert.equal(emptyCatalog.ok, true)

    // Account 1 creates a new lot
    const newLot = {
      id: 999,
      owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      collector: '0x0000000000000000000000000000000000000000',
      estimated: [5000, 2000, 1000, 0],
      actual: [0, 0, 0, 0],
      evidence: '0xabcdef9999999999999999999999999999999999999999999999999999999999',
      latitude: 10.78,
      longitude: 106.70,
      updatedAt: Date.now(),
      status: 1,
    }
    const newMeta = {
      id: 999,
      evidence: newLot.evidence,
      title: 'Lô thử nghiệm đồng bộ Account 1 sang Account 2',
      contact: 'Chủ lô 0903881245',
      address: 'Quận 1, TP.HCM',
      imageUrl: '/sample-scrap-metal.jpg',
    }

    const createRes = await call(handler, '/api/marketplace/catalog', 'POST', {
      action: 'create',
      lot: newLot,
      meta: newMeta,
    })
    assert.equal(createRes.status, 200)
    const createData = createRes.json()
    assert.equal(createData.ok, true)
    assert.ok(createData.lots.some(l => l.id === 999))
    assert.ok(createData.userMeta.some(m => m.id === 999))

    // Account 2 in a different browser GETs the catalog and immediately sees Account 1's lot
    const acc2GetRes = await call(handler, '/api/marketplace/catalog', 'GET')
    assert.equal(acc2GetRes.status, 200)
    const acc2Data = acc2GetRes.json()
    assert.equal(acc2Data.ok, true)
    const foundLot = acc2Data.lots.find(l => l.id === 999)
    assert.ok(foundLot)
    assert.equal(foundLot.owner, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
    assert.equal(foundLot.status, 1)

    // Account 2 claims the lot (locks escrow)
    const claimRes = await call(handler, '/api/marketplace/catalog', 'POST', {
      action: 'change',
      id: 999,
      status: 2,
      collector: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    })
    assert.equal(claimRes.status, 200)
    const claimData = claimRes.json()
    const claimedLot = claimData.lots.find(l => l.id === 999)
    assert.equal(claimedLot.status, 2)
    assert.equal(claimedLot.collector, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')

    // Clean up
    await call(handler, '/api/marketplace/catalog', 'POST', { action: 'reset' })
  })
})
