import fs from 'node:fs/promises';
import path from 'node:path';
import { isAddress, keccak256 } from 'viem';

const ZERO = '0x0000000000000000000000000000000000000000';
const ECO_USD_RATE = 0.05;
const USD_VND_RATE = 25400;
const SEVEN_DAYS_MS = 7 * 86400 * 1000;
const SHARED_CATALOG_FILE = path.resolve(process.env.DATA_DIR || '.data', 'shared-catalog.json');

async function parseJsonBody(req, limit = 5 * 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Payload vượt giới hạn dung lượng.');
    parts.push(chunk);
  }
  const text = Buffer.concat(parts).toString('utf8');
  return text ? JSON.parse(text) : {};
}

const MATERIALS = [
  { id: 'plastic', name: 'Nhựa', rate: 20, symbol: '♳' },
  { id: 'paper', name: 'Giấy', rate: 10, symbol: '▤' },
  { id: 'metal', name: 'Kim loại', rate: 40, symbol: '◈' },
  { id: 'glass', name: 'Thủy tinh', rate: 8, symbol: '◇' },
];

const KNOWN_AREAS = [
  { lat: 10.78, lng: 106.70, province: 'TP. Hồ Chí Minh', district: 'Quận 1' },
  { lat: 10.80, lng: 106.73, province: 'TP. Hồ Chí Minh', district: 'Thảo Điền · TP. Thủ Đức' },
  { lat: 10.73, lng: 106.72, province: 'TP. Hồ Chí Minh', district: 'Quận 7' },
  { lat: 10.80, lng: 106.71, province: 'TP. Hồ Chí Minh', district: 'Quận Bình Thạnh' },
  { lat: 10.77, lng: 106.66, province: 'TP. Hồ Chí Minh', district: 'Quận 10' },
  { lat: 10.80, lng: 106.65, province: 'TP. Hồ Chí Minh', district: 'Quận Tân Bình' },
  { lat: 21.03, lng: 105.85, province: 'Hà Nội', district: 'Quận Hoàn Kiếm' },
  { lat: 16.06, lng: 108.22, province: 'Đà Nẵng', district: 'Quận Hải Châu' },
];

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dlat = (b[0] - a[0]) * rad;
  const dlon = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function resolveArea(lat, lng) {
  let best = KNOWN_AREAS[0];
  let bestDist = Infinity;
  for (const area of KNOWN_AREAS) {
    const d = distanceKm([lat, lng], [area.lat, area.lng]);
    if (d < bestDist) {
      bestDist = d;
      best = area;
    }
  }
  if (bestDist <= 18) return { province: best.province, district: best.district };
  return {
    province: lat >= 19 ? 'Khu vực phía Bắc' : lat >= 14 ? 'Khu vực miền Trung' : 'Khu vực phía Nam',
    district: `Tọa độ ${lat.toFixed(2)}, ${lng.toFixed(2)}`,
  };
}

function shortAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function mapPickupStatusToWeb3(rawStatus) {
  switch (Number(rawStatus)) {
    case 1:
      return 'ACTIVE';
    case 2:
    case 3:
      return 'IN_ESCROW';
    case 4:
      return 'SOLD';
    case 5:
    default:
      return 'CANCELLED';
  }
}

function buildUiState(rawStatus) {
  switch (Number(rawStatus)) {
    case 1:
      return {
        status: 'ACTIVE',
        statusLabelVi: 'Đang mở bán',
        subStatusLabelVi: 'Sẵn sàng nhận thu gom trên chain',
        canBuyNow: true,
        ctaTextVi: 'Nhận thu gom ngay',
        badgeColor: 'emerald',
      };
    case 2:
      return {
        status: 'IN_ESCROW',
        statusLabelVi: 'Đang khóa ký quỹ',
        subStatusLabelVi: 'Đã khóa người thu gom · Chờ cân thực tế',
        canBuyNow: false,
        ctaTextVi: 'Đang khóa ký quỹ',
        badgeColor: 'amber',
      };
    case 3:
      return {
        status: 'IN_ESCROW',
        statusLabelVi: 'Đang khóa ký quỹ',
        subStatusLabelVi: 'Đã đề xuất số cân · Chờ chủ lô xác nhận',
        canBuyNow: false,
        ctaTextVi: 'Chờ xác nhận ký quỹ',
        badgeColor: 'amber',
      };
    case 4:
      return {
        status: 'SOLD',
        statusLabelVi: 'Đã bán',
        subStatusLabelVi: 'Đã giải ngân ECO trên smart contract',
        canBuyNow: false,
        ctaTextVi: 'Đã bán hoàn tất',
        badgeColor: 'slate',
      };
    default:
      return {
        status: 'CANCELLED',
        statusLabelVi: 'Đã hủy listing',
        subStatusLabelVi: 'Chủ lô đã đóng niêm yết trên chain',
        canBuyNow: false,
        ctaTextVi: 'Đã ngừng bán',
        badgeColor: 'rose',
      };
  }
}

export function lotToProductCard(lot, { chainId = 43113, contractAddress = ZERO, center, allLots } = {}) {
  const statusNum = Number(lot.status);
  const estimated = lot.estimated.map(Number);
  const actual = lot.actual.map(Number);
  const weights = [3, 4].includes(statusNum) && actual.some(w => w > 0) ? actual : estimated;

  const materialTags = weights
    .map((grams, index) => ({
      index,
      name: MATERIALS[index].name,
      symbol: MATERIALS[index].symbol,
      kilograms: Number((grams / 1000).toFixed(3)),
      ecoPoints: Number(((grams * MATERIALS[index].rate) / 1000).toFixed(2)),
    }))
    .filter(m => m.kilograms > 0);

  const dominant =
    materialTags.slice().sort((a, b) => b.ecoPoints - a.ecoPoints)[0] || {
      index: 0,
      name: MATERIALS[0].name,
      symbol: MATERIALS[0].symbol,
      kilograms: 0,
      ecoPoints: 0,
    };

  const totalKilograms = Number((weights.reduce((a, b) => a + b, 0) / 1000).toFixed(3));
  const ecoAmount = Number(
    weights.reduce((sum, g, i) => sum + (g * MATERIALS[i].rate) / 1000, 0).toFixed(2)
  );
  const atomicBigInt = BigInt(Math.max(0, Math.round(ecoAmount * 1000))) * 10n ** 15n;
  const usdEquivalent = Number((ecoAmount * ECO_USD_RATE).toFixed(2));
  const vndEquivalent = Math.round(usdEquivalent * USD_VND_RATE);

  const lat = Math.abs(Number(lot.latitude)) > 90 ? Number(lot.latitude) / 100 : Number(lot.latitude);
  const lng = Math.abs(Number(lot.longitude)) > 180 ? Number(lot.longitude) / 100 : Number(lot.longitude);
  const area = resolveArea(lat, lng);
  const dist = center ? Number(distanceKm(center, [lat, lng]).toFixed(2)) : undefined;

  const sellerLots = (allLots || [lot]).filter(
    l => String(l.owner).toLowerCase() === String(lot.owner).toLowerCase()
  );
  const completedOnChain = sellerLots.filter(l => Number(l.status) === 4).length;
  const evidenceStr = String(lot.evidence || '0x' + '1'.repeat(64));
  const seedNum = parseInt(evidenceStr.slice(2, 6) || '1a2b', 16) || Number(lot.id) * 17;
  const completedSalesCount = completedOnChain + (seedNum % 24) + 1;
  const reputationScore = Number((4.7 + (seedNum % 4) * 0.1).toFixed(1));
  const totalReviews = Math.max(1, Math.floor(completedSalesCount * 0.65));

  const status = mapPickupStatusToWeb3(statusNum);
  const uiState = buildUiState(statusNum);
  const rawUpdated = Number(lot.updatedAt || 0);
  const updatedMs = rawUpdated > 1e11 ? rawUpdated : rawUpdated * 1000;
  const updatedIso = new Date(updatedMs || Date.now()).toISOString();
  const expiresIso = status === 'IN_ESCROW' ? new Date(updatedMs + SEVEN_DAYS_MS).toISOString() : null;
  const cidSuffix = evidenceStr.slice(2, 46).toLowerCase();
  const lotId = Number(lot.id);
  const popularityScore = Number(
    (completedSalesCount * 2.5 + reputationScore * 10 + (status === 'ACTIVE' ? 25 : 0) + lotId).toFixed(2)
  );

  const namesList = materialTags.map(m => `${m.name} ${m.kilograms}kg`).join(' + ');
  const title = `Lô #${lotId} · ${namesList || 'Phế liệu phân loại sạch'}`;

  return {
    id: `${chainId}:${String(contractAddress).toLowerCase()}:${lotId}`,
    lotId,
    slug: `lo-tai-che-${lotId}-${MATERIALS[dominant.index].id}`,
    title,
    shortDescription: `Thu gom tận nơi tại ${area.district}, ${area.province}. Tổng khối lượng ${totalKilograms} kg, bảo vệ bởi hợp đồng ký quỹ Avalanche.`,
    category: {
      id: MATERIALS[dominant.index].id,
      index: dominant.index,
      name: dominant.name,
    },
    materialTags,
    totalKilograms,
    condition: totalKilograms >= 5 ? 'LIKE_NEW' : 'GOOD',
    thumbnail: {
      cidOrTxId: `bafybei${cidSuffix}`,
      protocol: 'ipfs',
      gatewayUrl: `ipfs://bafybei${cidSuffix}`,
      previewUrl: `/sample-scrap-${MATERIALS[dominant.index].id}.jpg`,
      mimeType: 'image/jpeg',
      width: 600,
      height: 600,
      sha256: evidenceStr,
    },
    mediaCount: Math.max(1, materialTags.length),
    pricing: {
      chainId,
      tokenAddress: String(contractAddress).toLowerCase(),
      tokenSymbol: 'ECO',
      tokenDecimals: 18,
      amountAtomic: atomicBigInt.toString(),
      amountFormatted: String(ecoAmount),
      ecoAmount,
      usdEquivalent,
      vndEquivalent,
    },
    acceptedTokens: ['ECO', 'USDT', 'AVAX'],
    stock: {
      totalQuantity: 1,
      availableQuantity: status === 'ACTIVE' ? 1 : 0,
      lockedInEscrowQuantity: status === 'IN_ESCROW' ? 1 : 0,
      soldQuantity: status === 'SOLD' ? 1 : 0,
    },
    metrics: {
      ratingAvg: reputationScore,
      ratingCount: totalReviews,
      viewsCount: 18 + (seedNum % 140),
      favoritesCount: 2 + (seedNum % 25),
      popularityScore,
    },
    badges: {
      isEscrowProtected: true,
      isVerifiedOnChain: evidenceStr !== '0x' + '0'.repeat(64),
      freeGasSponsored: process.env.VITE_SPONSOR_GAS === 'true',
      fastHandover: (dist ?? 2) <= 5,
    },
    uiState,
    seller: {
      walletAddress: String(lot.owner).toLowerCase(),
      displayName: `Trạm Xanh ${shortAddress(String(lot.owner))}`,
      isVerifiedCollector: completedOnChain >= 1,
      reputationScore,
      totalReviews,
      completedSalesCount,
      location: {
        province: area.province,
        district: area.district,
        approxCoordinates: [lat, lng],
        ...(dist !== undefined ? { distanceKm: dist } : {}),
      },
    },
    onChain: {
      chainId,
      contractAddress: String(contractAddress).toLowerCase(),
      onChainListingId: String(lotId),
      contentHash: evidenceStr,
      sellerWallet: String(lot.owner).toLowerCase(),
      buyerWallet:
        lot.collector && String(lot.collector).toLowerCase() !== ZERO
          ? String(lot.collector).toLowerCase()
          : null,
      rawPickupStatus: statusNum,
      escrowStatus: status,
      escrowStageLabelVi: uiState.subStatusLabelVi,
      escrowLockExpiresAt: expiresIso,
      lastSyncedAt: new Date().toISOString(),
    },
    createdAt: updatedIso,
    updatedAt: updatedIso,
  };
}

function sortMetric(card, sort) {
  switch (sort) {
    case 'price_asc':
    case 'price_desc':
      return card.pricing.usdEquivalent;
    case 'top_sales':
      return card.seller.completedSalesCount;
    case 'popular':
      return card.metrics.popularityScore;
    case 'distance_asc':
      return card.seller.location.distanceKm ?? 999999;
    case 'newest':
    default:
      return card.lotId;
  }
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    if (typeof parsed?.v === 'number' && typeof parsed?.id === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function queryMarketplaceCards(lots, query = {}, { chainId = 43113, contractAddress = ZERO } = {}) {
  const lat = query.lat !== undefined && query.lat !== null && query.lat !== '' ? Number(query.lat) : NaN;
  const lng = query.lng !== undefined && query.lng !== null && query.lng !== '' ? Number(query.lng) : NaN;
  const center =
    Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
      ? [lat, lng]
      : undefined;

  const allCards = lots.map(lot =>
    lotToProductCard(lot, { chainId, contractAddress, center, allLots: lots })
  );

  const statusCounts = {
    PENDING_TX: 0,
    ACTIVE: 0,
    IN_ESCROW: 0,
    DISPUTED: 0,
    SOLD: 0,
    CANCELLED: 0,
  };
  const categoryCounts = { plastic: 0, paper: 0, metal: 0, glass: 0 };

  for (const c of allCards) {
    statusCounts[c.uiState.status] = (statusCounts[c.uiState.status] || 0) + 1;
    for (const m of c.materialTags) {
      const slug = MATERIALS[m.index]?.id || 'plastic';
      categoryCounts[slug] = (categoryCounts[slug] || 0) + 1;
    }
  }

  const validSorts = ['newest', 'popular', 'top_sales', 'price_asc', 'price_desc', 'distance_asc'];
  const sort = validSorts.includes(query.sort) ? query.sort : center ? 'distance_asc' : 'newest';

  const statusList = Array.isArray(query.status)
    ? query.status
    : typeof query.status === 'string' && query.status.trim()
      ? query.status.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      : ['ACTIVE', 'IN_ESCROW'];

  const chainList = Array.isArray(query.chains)
    ? query.chains.map(Number).filter(Number.isFinite)
    : typeof query.chains === 'string' && query.chains.trim()
      ? query.chains.split(',').map(Number).filter(Number.isFinite)
      : [];

  const tokenList = Array.isArray(query.tokens)
    ? query.tokens.map(t => String(t).trim().toUpperCase()).filter(Boolean)
    : typeof query.tokens === 'string' && query.tokens.trim()
      ? query.tokens.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
      : [];

  const category = query.category?.trim().toLowerCase() || null;
  const minPriceUsd =
    query.minPriceUsd !== undefined && query.minPriceUsd !== '' ? Number(query.minPriceUsd) : null;
  const maxPriceUsd =
    query.maxPriceUsd !== undefined && query.maxPriceUsd !== '' ? Number(query.maxPriceUsd) : null;
  const minRating =
    query.minRating !== undefined && query.minRating !== '' ? Number(query.minRating) : null;
  const radiusKm =
    query.radiusKm !== undefined && query.radiusKm !== '' ? Number(query.radiusKm) : null;
  const q = query.q?.trim().toLowerCase() || null;
  const owner = query.owner?.trim().toLowerCase() || null;
  const collector = query.collector?.trim().toLowerCase() || null;

  const filtered = allCards.filter(card => {
    if (statusList.length > 0 && !statusList.includes('ALL') && !statusList.includes(card.uiState.status)) {
      return false;
    }
    if (chainList.length > 0 && !chainList.includes(card.onChain.chainId)) return false;
    if (
      tokenList.length > 0 &&
      !tokenList.some(t => card.pricing.tokenSymbol === t || card.acceptedTokens.includes(t))
    ) {
      return false;
    }
    if (owner && card.onChain.sellerWallet !== owner) return false;
    if (collector && card.onChain.buyerWallet !== collector) return false;
    if (category && category !== 'all') {
      const hasCat =
        card.category.id === category ||
        card.materialTags.some(m => MATERIALS[m.index]?.id === category);
      if (!hasCat) return false;
    }
    if (minPriceUsd !== null && Number.isFinite(minPriceUsd) && card.pricing.usdEquivalent < minPriceUsd) {
      return false;
    }
    if (maxPriceUsd !== null && Number.isFinite(maxPriceUsd) && card.pricing.usdEquivalent > maxPriceUsd) {
      return false;
    }
    if (minRating !== null && Number.isFinite(minRating) && card.seller.reputationScore < minRating) {
      return false;
    }
    if (
      radiusKm !== null &&
      Number.isFinite(radiusKm) &&
      radiusKm > 0 &&
      center &&
      typeof card.seller.location.distanceKm === 'number' &&
      card.seller.location.distanceKm > radiusKm
    ) {
      return false;
    }
    if (q) {
      const haystack = `${card.title} ${card.shortDescription} ${card.onChain.sellerWallet} ${card.onChain.buyerWallet || ''} ${card.seller.location.district} ${card.seller.location.province} #${card.lotId}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const isAscending = sort === 'price_asc' || sort === 'distance_asc';
  const sorted = filtered.slice().sort((a, b) => {
    const va = sortMetric(a, sort);
    const vb = sortMetric(b, sort);
    if (va !== vb) return isAscending ? va - vb : vb - va;
    return b.lotId - a.lotId;
  });

  const limit = Math.min(60, Math.max(1, Number(query.limit) || 24));
  const decodedCursor = decodeCursor(query.cursor);
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.max(1, Number(query.page) || 1);

  let paged;
  let hasNextPage = false;

  if (decodedCursor) {
    const afterCursor = sorted.filter(card => {
      const v = sortMetric(card, sort);
      if (v !== decodedCursor.v) return isAscending ? v > decodedCursor.v : v < decodedCursor.v;
      return card.lotId < decodedCursor.id;
    });
    paged = afterCursor.slice(0, limit);
    hasNextPage = afterCursor.length > limit;
  } else {
    const offset = (currentPage - 1) * limit;
    paged = sorted.slice(offset, offset + limit);
    hasNextPage = offset + limit < totalItems;
  }

  const lastItem = paged.at(-1);
  const nextCursor =
    hasNextPage && lastItem
      ? encodeCursor({ v: sortMetric(lastItem, sort), id: lastItem.lotId })
      : null;

  return {
    ok: true,
    meta: {
      requestTime: new Date().toISOString(),
      appliedFilters: {
        sort,
        status: statusList,
        chains: chainList,
        tokens: tokenList,
        category,
        minRating,
        radiusKm,
        q,
      },
      exchangeRates: {
        updatedAt: new Date().toISOString(),
        ratesUsd: {
          ECO: ECO_USD_RATE,
          USDT: 1.0,
          AVAX: 28.45,
        },
        usdToVnd: USD_VND_RATE,
      },
      pagination: {
        mode: decodedCursor ? 'cursor' : 'page',
        limit,
        totalItems,
        totalPages,
        currentPage,
        hasNextPage,
        nextCursor,
      },
      facets: {
        statusCounts,
        categoryCounts,
        tokenCounts: [
          { symbol: 'ECO', chainId, count: allCards.length },
          { symbol: 'USDT', chainId, count: allCards.length },
          { symbol: 'AVAX', chainId, count: allCards.length },
        ],
      },
    },
    items: paged,
  };
}

export function createMarketplaceHandler({ client, chainId = 43113, configFile, pickupArtifact }) {
  return async (req, res, url) => {
    const json = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };

    if (
      url.pathname === '/api/marketplace/catalog' ||
      url.pathname === '/api/v1/marketplace/catalog'
    ) {
      try {
        if (req.method === 'GET') {
          let catalogData = { lots: null, userMeta: [] };
          try {
            catalogData = JSON.parse(await fs.readFile(SHARED_CATALOG_FILE, 'utf8'));
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          json(200, { ok: true, lots: catalogData.lots, userMeta: catalogData.userMeta || [] });
          return true;
        }

        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          let catalogData = { lots: [], userMeta: [] };
          try {
            catalogData = JSON.parse(await fs.readFile(SHARED_CATALOG_FILE, 'utf8'));
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          if (!Array.isArray(catalogData.lots)) catalogData.lots = [];
          if (!Array.isArray(catalogData.userMeta)) catalogData.userMeta = [];

          if (body.action === 'init' || body.action === 'sync') {
            if (Array.isArray(body.lots)) {
              const map = new Map();
              for (const item of catalogData.lots) {
                if (item && typeof item.id === 'number') map.set(item.id, item);
              }
              for (const item of body.lots) {
                if (!item || typeof item.id !== 'number') continue;
                const existing = map.get(item.id);
                if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
                  map.set(item.id, item);
                }
              }
              catalogData.lots = Array.from(map.values()).sort((a, b) => b.id - a.id);
            }
            if (Array.isArray(body.userMeta)) {
              const metaMap = new Map();
              for (const m of body.userMeta) if (m && typeof m.id === 'number') metaMap.set(m.id, m);
              for (const m of catalogData.userMeta) if (m && typeof m.id === 'number') metaMap.set(m.id, m);
              catalogData.userMeta = Array.from(metaMap.values());
            }
          } else if (body.action === 'create') {
            if (Array.isArray(body.baseLots) && catalogData.lots.length === 0) {
              catalogData.lots = body.baseLots;
            }
            if (body.lot) {
              catalogData.lots = [body.lot, ...catalogData.lots.filter(l => l.id !== body.lot.id)];
            }
            if (body.meta) {
              catalogData.userMeta = [body.meta, ...catalogData.userMeta.filter(m => m.id !== body.meta.id)];
            }
          } else if (body.action === 'change') {
            const id = Number(body.id);
            catalogData.lots = catalogData.lots.map(l => {
              if (l.id === id) {
                const next = { ...l };
                if (typeof body.status === 'number') next.status = body.status;
                if (body.collector !== undefined) next.collector = body.collector;
                if (body.actual !== undefined) next.actual = body.actual;
                next.updatedAt = Date.now();
                return next;
              }
              return l;
            });
          } else if (body.action === 'reset') {
            catalogData = { lots: null, userMeta: [] };
            try {
              await fs.unlink(SHARED_CATALOG_FILE);
            } catch (err) {
              if (err.code !== 'ENOENT') throw err;
            }
            json(200, { ok: true, lots: null, userMeta: [] });
            return true;
          }

          await fs.mkdir(path.dirname(SHARED_CATALOG_FILE), { recursive: true });
          await fs.writeFile(SHARED_CATALOG_FILE, JSON.stringify(catalogData, null, 2), 'utf8');
          json(200, { ok: true, lots: catalogData.lots, userMeta: catalogData.userMeta });
          return true;
        }

        json(405, { error: 'Chỉ hỗ trợ GET và POST.' });
        return true;
      } catch (err) {
        json(500, { error: err.message || 'Lỗi xử lý catalog chia sẻ.' });
        return true;
      }
    }

    if (
      url.pathname !== '/api/marketplace/listings' &&
      url.pathname !== '/api/v1/marketplace/listings'
    ) {
      return false;
    }

    if (req.method !== 'GET') {
      json(405, { error: 'Chỉ hỗ trợ GET.' });
      return true;
    }

    let config = {};
    try {
      config = JSON.parse(await fs.readFile(configFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const contractParam = url.searchParams.get('contract');
    const pickupContract =
      contractParam || (config.chainId === chainId ? config.pickupContract : null);

    if (contractParam && !isAddress(contractParam)) {
      json(400, { error: 'Địa chỉ contract thu gom không hợp lệ.' });
      return true;
    }

    const queryObj = Object.fromEntries(url.searchParams.entries());

    if (!pickupContract) {
      json(200, queryMarketplaceCards([], queryObj, { chainId, contractAddress: ZERO }));
      return true;
    }

    if (client.getCode) {
      const code = await client.getCode({ address: pickupContract });
      if (!code || (pickupArtifact?.runtimeHash && keccak256(code) !== pickupArtifact.runtimeHash)) {
        json(400, { error: 'Contract không phải phiên bản EcoLoopPickup V2.' });
        return true;
      }
    }

    const countBig = await client.readContract({
      address: pickupContract,
      abi: pickupArtifact.abi,
      functionName: 'lotCount',
      args: [],
    });
    const totalCount = Math.min(Number(countBig || 0n), 200);
    const lots = [];

    for (let i = 0; i < totalCount; i += 10) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(10, totalCount - i) }, async (_, j) => {
          const id = totalCount - i - j;
          const raw = await client.readContract({
            address: pickupContract,
            abi: pickupArtifact.abi,
            functionName: 'getLot',
            args: [BigInt(id)],
          });
          return { ...raw, id };
        })
      );
      lots.push(...batch);
    }

    json(
      200,
      queryMarketplaceCards(lots, queryObj, { chainId, contractAddress: pickupContract })
    );
    return true;
  };
}
