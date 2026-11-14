import { materials, short } from './model';
import { tr, num as fmt, wt } from './settings';
import { distanceKm, ZERO, type Lot } from './pickupClient';

export type ListingStatus =
  | 'PENDING_TX'
  | 'ACTIVE'
  | 'IN_ESCROW'
  | 'DISPUTED'
  | 'SOLD'
  | 'CANCELLED';

export type SortOption =
  | 'newest'
  | 'popular'
  | 'top_sales'
  | 'price_asc'
  | 'price_desc'
  | 'distance_asc';

export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'SCRAP';

export interface MediaAsset {
  cidOrTxId: string;
  protocol: 'ipfs' | 'ar';
  gatewayUrl: string;
  previewUrl: string;
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  sha256: `0x${string}`;
}

export interface PaymentPricing {
  chainId: number;
  tokenAddress: `0x${string}`;
  tokenSymbol: 'ECO' | 'USDT' | 'AVAX';
  tokenDecimals: number;
  amountAtomic: string;
  amountFormatted: string;
  ecoAmount: number;
  usdEquivalent: number;
  vndEquivalent: number;
}

export interface OnChainMetadata {
  chainId: number;
  contractAddress: `0x${string}`;
  onChainListingId: string;
  tokenId?: string;
  contentHash: `0x${string}`;
  sellerWallet: `0x${string}`;
  buyerWallet: `0x${string}` | null;
  rawPickupStatus: number;
  escrowStatus: ListingStatus;
  escrowStageLabelVi: string;
  escrowLockExpiresAt: string | null;
  lastSyncedAt: string;
}

export interface SellerSummary {
  walletAddress: `0x${string}`;
  displayName: string;
  isVerifiedCollector: boolean;
  reputationScore: number;
  totalReviews: number;
  completedSalesCount: number;
  location: {
    province: string;
    district: string;
    approxCoordinates: [number, number];
    distanceKm?: number;
  };
}

export interface ShopeeWeb3ProductCard {
  id: string;
  lotId: number;
  slug: string;
  title: string;
  shortDescription: string;
  category: {
    id: string;
    index: number;
    name: string;
  };
  materialTags: {
    index: number;
    name: string;
    symbol: string;
    kilograms: number;
    ecoPoints: number;
  }[];
  totalKilograms: number;
  condition: ItemCondition;
  thumbnail: MediaAsset;
  mediaCount: number;
  pricing: PaymentPricing;
  acceptedTokens: ('ECO' | 'USDT' | 'AVAX')[];
  stock: {
    totalQuantity: number;
    availableQuantity: number;
    lockedInEscrowQuantity: number;
    soldQuantity: number;
  };
  metrics: {
    ratingAvg: number;
    ratingCount: number;
    viewsCount: number;
    favoritesCount: number;
    popularityScore: number;
  };
  badges: {
    isEscrowProtected: boolean;
    isVerifiedOnChain: boolean;
    freeGasSponsored: boolean;
    fastHandover: boolean;
  };
  uiState: {
    status: ListingStatus;
    statusLabelVi: string;
    subStatusLabelVi: string;
    canBuyNow: boolean;
    ctaTextVi: string;
    badgeColor: 'emerald' | 'amber' | 'slate' | 'rose';
  };
  seller: SellerSummary;
  onChain: OnChainMetadata;
  contactPreview?: {
    contact: string;
    address: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceQuery {
  sort?: SortOption;
  status?: ListingStatus[];
  chains?: number[];
  tokens?: string[];
  category?: string;
  materialIndex?: number;
  minPriceUsd?: number;
  maxPriceUsd?: number;
  minRating?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  q?: string;
  owner?: string;
  excludeOwner?: string;
  collector?: string;
  limit?: number;
  page?: number;
  cursor?: string;
}

export interface MarketplaceResponse {
  ok: true;
  meta: {
    requestTime: string;
    appliedFilters: {
      sort: SortOption;
      status: ListingStatus[];
      chains: number[];
      tokens: string[];
      category: string | null;
      minRating: number | null;
      radiusKm: number | null;
      q: string | null;
    };
    exchangeRates: {
      updatedAt: string;
      ratesUsd: Record<string, number>;
      usdToVnd: number;
    };
    pagination: {
      mode: 'cursor' | 'page';
      limit: number;
      totalItems: number;
      totalPages: number;
      currentPage: number;
      hasNextPage: boolean;
      nextCursor: string | null;
    };
    facets: {
      statusCounts: Record<ListingStatus, number>;
      categoryCounts: Record<string, number>;
      tokenCounts: { symbol: string; chainId: number; count: number }[];
    };
  };
  items: ShopeeWeb3ProductCard[];
}

const ECO_USD_RATE = 0.05;
const USD_VND_RATE = 25400;
const SEVEN_DAYS_MS = 7 * 86400 * 1000;

const categorySlugs = ['plastic', 'paper', 'metal', 'glass'] as const;

const CATEGORY_PREVIEW_IMAGES: Record<string, string> = {
  plastic: '/sample-scrap-plastic.jpg',
  paper: '/sample-scrap-paper.jpg',
  metal: '/sample-scrap-metal.jpg',
  glass: '/sample-scrap-glass.jpg',
};

const KNOWN_AREAS: { lat: number; lng: number; province: string; district: string }[] = [
  { lat: 10.78, lng: 106.70, province: 'TP. Hồ Chí Minh', district: 'Quận 1' },
  { lat: 10.78, lng: 106.68, province: 'TP. Hồ Chí Minh', district: 'Quận 3' },
  { lat: 10.76, lng: 106.70, province: 'TP. Hồ Chí Minh', district: 'Quận 4' },
  { lat: 10.75, lng: 106.66, province: 'TP. Hồ Chí Minh', district: 'Quận 5' },
  { lat: 10.73, lng: 106.72, province: 'TP. Hồ Chí Minh', district: 'Quận 7 · Phú Mỹ Hưng' },
  { lat: 10.77, lng: 106.66, province: 'TP. Hồ Chí Minh', district: 'Quận 10' },
  { lat: 10.80, lng: 106.71, province: 'TP. Hồ Chí Minh', district: 'Quận Bình Thạnh' },
  { lat: 10.80, lng: 106.65, province: 'TP. Hồ Chí Minh', district: 'Quận Tân Bình' },
  { lat: 10.83, lng: 106.67, province: 'TP. Hồ Chí Minh', district: 'Quận Gò Vấp' },
  { lat: 10.80, lng: 106.68, province: 'TP. Hồ Chí Minh', district: 'Quận Phú Nhuận' },
  { lat: 10.76, lng: 106.60, province: 'TP. Hồ Chí Minh', district: 'Quận Bình Tân' },
  { lat: 10.80, lng: 106.73, province: 'TP. Hồ Chí Minh', district: 'Thảo Điền · TP. Thủ Đức' },
  { lat: 10.85, lng: 106.75, province: 'TP. Hồ Chí Minh', district: 'Linh Trung · TP. Thủ Đức' },
  { lat: 10.90, lng: 106.77, province: 'Bình Dương', district: 'TP. Dĩ An' },
  { lat: 10.93, lng: 106.71, province: 'Bình Dương', district: 'TP. Thuận An' },
  { lat: 10.95, lng: 106.82, province: 'Đồng Nai', district: 'TP. Biên Hòa' },
  { lat: 21.03, lng: 105.85, province: 'Hà Nội', district: 'Quận Hoàn Kiếm' },
  { lat: 21.03, lng: 105.79, province: 'Hà Nội', district: 'Quận Cầu Giấy' },
  { lat: 21.01, lng: 105.82, province: 'Hà Nội', district: 'Quận Đống Đa' },
  { lat: 16.06, lng: 108.22, province: 'Đà Nẵng', district: 'Quận Hải Châu' },
  { lat: 16.07, lng: 108.24, province: 'Đà Nẵng', district: 'Quận Sơn Trà' },
  { lat: 10.03, lng: 105.78, province: 'Cần Thơ', district: 'Quận Ninh Kiều' },
];

export function resolveArea(lat: number, lng: number): { province: string; district: string } {
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
    province: lat >= 19 ? tr('Khu vực phía Bắc') : lat >= 14 ? tr('Khu vực miền Trung') : tr('Khu vực phía Nam'),
    district: tr('Tọa độ {lat}, {lng}', { lat: lat.toFixed(2), lng: lng.toFixed(2) }),
  };
}

export function mapPickupStatusToWeb3(rawStatus: number): ListingStatus {
  switch (rawStatus) {
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

export function buildUiState(rawStatus: number, role: 'seller' | 'collector' = 'collector'): ShopeeWeb3ProductCard['uiState'] {
  switch (rawStatus) {
    case 1:
      return {
        status: 'ACTIVE',
        statusLabelVi: 'Đang mở bán',
        subStatusLabelVi: 'Sẵn sàng nhận thu gom trên chain',
        canBuyNow: true,
        ctaTextVi: role === 'collector' ? 'Nhận thu gom ngay' : 'Xem & giao dịch',
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

export function lotToProductCard(
  lot: Lot,
  options: {
    chainId?: number;
    contractAddress?: `0x${string}`;
    center?: [number, number];
    role?: 'seller' | 'collector';
    allLots?: Lot[];
  } = {}
): ShopeeWeb3ProductCard {
  const chainId = options.chainId ?? 43113;
  const contractAddress = (options.contractAddress ?? '0x01578d5d538db64a1ebef96920813e619060acc9') as `0x${string}`;
  const weights = [3, 4].includes(lot.status) && lot.actual.some(w => w > 0) ? lot.actual : lot.estimated;
  const materialTags = weights
    .map((grams, index) => ({
      index,
      name: materials[index]?.name ?? 'Vật liệu',
      symbol: materials[index]?.symbol ?? '♻',
      kilograms: Number((grams / 1000).toFixed(3)),
      ecoPoints: Number(((grams * (materials[index]?.rate ?? 10)) / 1000).toFixed(2)),
    }))
    .filter(m => m.kilograms > 0);

  const dominant =
    materialTags.slice().sort((a, b) => b.ecoPoints - a.ecoPoints)[0] ?? {
      index: 0,
      name: materials[0].name,
      symbol: materials[0].symbol,
      kilograms: 0,
      ecoPoints: 0,
    };

  const dominantSlug = categorySlugs[dominant.index] ?? 'plastic';
  const totalKilograms = Number((weights.reduce((a, b) => a + b, 0) / 1000).toFixed(3));
  const ecoAmount = Number(
    weights.reduce((sum, g, i) => sum + (g * (materials[i]?.rate ?? 10)) / 1000, 0).toFixed(2)
  );
  const atomicBigInt = BigInt(Math.max(0, Math.round(ecoAmount * 1000))) * 10n ** 15n;
  const usdEquivalent = Number((ecoAmount * ECO_USD_RATE).toFixed(2));
  const vndEquivalent = Math.round(usdEquivalent * USD_VND_RATE);

  const area = resolveArea(lot.latitude, lot.longitude);
  const dist = options.center ? Number(distanceKm(options.center, [lot.latitude, lot.longitude]).toFixed(2)) : undefined;

  const sellerLots = (options.allLots ?? [lot]).filter(
    l => l.owner.toLowerCase() === lot.owner.toLowerCase()
  );
  const completedOnChain = sellerLots.filter(l => l.status === 4).length;
  // Only real on-chain history: completed lots of this owner. No ratings exist yet, so none are shown.
  const completedSalesCount = completedOnChain;
  const reputationScore = 0;
  const totalReviews = 0;

  const namesList = materialTags.map(m => `${tr(m.name)} ${wt(m.kilograms)}`).join(' + ');
  const title = tr('Lô #{id} · {title}', { id: lot.id, title: namesList || tr('Phế liệu phân loại sạch') });
  const shortDescription = tr('Thu gom tận nơi tại {place}. Tổng khối lượng {kg}, thanh toán & ký quỹ minh bạch trên Avalanche.', { place: `${area.district}, ${area.province}`, kg: wt(totalKilograms) });

  const status = mapPickupStatusToWeb3(lot.status);
  const uiState = buildUiState(lot.status, options.role);
  const updatedMs = lot.updatedAt > 1e11 ? lot.updatedAt : lot.updatedAt * 1000;
  const updatedIso = new Date(updatedMs || Date.now()).toISOString();
  const expiresIso =
    status === 'IN_ESCROW' ? new Date(updatedMs + SEVEN_DAYS_MS).toISOString() : null;

  const cidSuffix = lot.evidence.slice(2, 46).toLowerCase();
  const previewUrl =
    CATEGORY_PREVIEW_IMAGES[dominantSlug] ?? '/sample-scrap-plastic.jpg';
  const popularityScore = Number(
    (completedSalesCount * 2.5 + reputationScore * 10 + (status === 'ACTIVE' ? 25 : 0) + lot.id).toFixed(2)
  );

  return {
    id: `${chainId}:${contractAddress.toLowerCase()}:${lot.id}`,
    lotId: lot.id,
    slug: `lo-tai-che-${lot.id}-${dominantSlug}`,
    title,
    shortDescription,
    category: {
      id: dominantSlug,
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
      previewUrl,
      mimeType: 'image/jpeg',
      width: 600,
      height: 600,
      sha256: lot.evidence as `0x${string}`,
    },
    mediaCount: Math.max(1, materialTags.length),
    pricing: {
      chainId,
      tokenAddress: contractAddress,
      tokenSymbol: 'ECO',
      tokenDecimals: 18,
      amountAtomic: atomicBigInt.toString(),
      amountFormatted: fmt(ecoAmount),
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
      viewsCount: 0, // not tracked
      favoritesCount: 0, // not tracked
      popularityScore,
    },
    badges: {
      isEscrowProtected: true,
      isVerifiedOnChain: lot.evidence !== ('0x' + '0'.repeat(64)),
      freeGasSponsored: import.meta.env?.VITE_SPONSOR_GAS === 'true',
      fastHandover: (dist ?? 2) <= 5,
    },
    uiState,
    seller: {
      walletAddress: lot.owner as `0x${string}`,
      displayName: tr('Chủ lô {wallet}', { wallet: short(lot.owner) }),
      isVerifiedCollector: completedOnChain >= 1,
      reputationScore,
      totalReviews,
      completedSalesCount,
      location: {
        province: area.province,
        district: area.district,
        approxCoordinates: [lot.latitude, lot.longitude],
        distanceKm: dist,
      },
    },
    onChain: {
      chainId,
      contractAddress,
      onChainListingId: String(lot.id),
      contentHash: lot.evidence as `0x${string}`,
      sellerWallet: lot.owner as `0x${string}`,
      buyerWallet:
        lot.collector && lot.collector.toLowerCase() !== ZERO.toLowerCase()
          ? (lot.collector as `0x${string}`)
          : null,
      rawPickupStatus: lot.status,
      escrowStatus: status,
      escrowStageLabelVi: uiState.subStatusLabelVi,
      escrowLockExpiresAt: expiresIso,
      lastSyncedAt: new Date().toISOString(),
    },
    contactPreview: undefined,
    createdAt: updatedIso,
    updatedAt: updatedIso,
  };
}

function encodeCursor(payload: { v: number; id: number }): string {
  const json = JSON.stringify(payload);
  if (typeof btoa === 'function') return btoa(json);
  return Buffer.from(json, 'utf8').toString('base64');
}

function decodeCursor(cursor?: string): { v: number; id: number } | null {
  if (!cursor) return null;
  try {
    const raw =
      typeof atob === 'function' ? atob(cursor) : Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.v === 'number' && typeof parsed?.id === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}

function sortMetric(card: ShopeeWeb3ProductCard, sort: SortOption): number {
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

export function queryProductCards(
  lots: Lot[],
  query: MarketplaceQuery = {},
  context: {
    chainId?: number;
    contractAddress?: `0x${string}`;
    role?: 'seller' | 'collector';
  } = {}
): MarketplaceResponse {
  const center: [number, number] | undefined =
    typeof query.lat === 'number' &&
    Number.isFinite(query.lat) &&
    typeof query.lng === 'number' &&
    Number.isFinite(query.lng)
      ? [query.lat, query.lng]
      : undefined;

  const allCards = lots.map(lot =>
    lotToProductCard(lot, {
      chainId: context.chainId,
      contractAddress: context.contractAddress,
      center,
      role: context.role,
      allLots: lots,
    })
  );

  // Compute facets before status/category filtering so counts remain informative on tabs
  const statusCounts: Record<ListingStatus, number> = {
    PENDING_TX: 0,
    ACTIVE: 0,
    IN_ESCROW: 0,
    DISPUTED: 0,
    SOLD: 0,
    CANCELLED: 0,
  };
  const categoryCounts: Record<string, number> = {
    plastic: 0,
    paper: 0,
    metal: 0,
    glass: 0,
  };

  for (const c of allCards) {
    statusCounts[c.uiState.status] = (statusCounts[c.uiState.status] ?? 0) + 1;
    for (const m of c.materialTags) {
      const slug = categorySlugs[m.index] ?? 'plastic';
      categoryCounts[slug] = (categoryCounts[slug] ?? 0) + 1;
    }
  }

  const sort: SortOption = query.sort ?? (center ? 'distance_asc' : 'newest');
  const allowedStatuses =
    query.status && query.status.length > 0
      ? query.status
      : (['ACTIVE', 'IN_ESCROW', 'SOLD', 'CANCELLED'] as ListingStatus[]);
  const allowedChains = query.chains?.filter(Number.isFinite) ?? [];
  const allowedTokens = query.tokens?.map(t => t.toUpperCase()).filter(Boolean) ?? [];
  const keyword = query.q?.trim().toLowerCase() ?? '';

  const filtered = allCards.filter(card => {
    if (!allowedStatuses.includes(card.uiState.status)) return false;
    if (allowedChains.length > 0 && !allowedChains.includes(card.onChain.chainId)) return false;
    if (
      allowedTokens.length > 0 &&
      !allowedTokens.some(
        t => card.pricing.tokenSymbol === t || card.acceptedTokens.includes(t as 'ECO' | 'USDT' | 'AVAX')
      )
    ) {
      return false;
    }
    if (query.owner && card.onChain.sellerWallet.toLowerCase() !== query.owner.toLowerCase()) {
      return false;
    }
    if (query.excludeOwner && card.onChain.sellerWallet.toLowerCase() === query.excludeOwner.toLowerCase()) {
      return false;
    }
    if (
      query.collector &&
      card.onChain.buyerWallet?.toLowerCase() !== query.collector.toLowerCase()
    ) {
      return false;
    }
    if (typeof query.materialIndex === 'number' && query.materialIndex >= 0) {
      if (!card.materialTags.some(m => m.index === query.materialIndex && m.kilograms > 0)) {
        return false;
      }
    }
    if (query.category && query.category !== 'all') {
      const hasCategory =
        card.category.id === query.category ||
        card.materialTags.some(m => categorySlugs[m.index] === query.category);
      if (!hasCategory) return false;
    }
    if (typeof query.minPriceUsd === 'number' && card.pricing.usdEquivalent < query.minPriceUsd) {
      return false;
    }
    if (typeof query.maxPriceUsd === 'number' && card.pricing.usdEquivalent > query.maxPriceUsd) {
      return false;
    }
    if (typeof query.minRating === 'number' && card.seller.reputationScore < query.minRating) {
      return false;
    }
    if (
      typeof query.radiusKm === 'number' &&
      query.radiusKm > 0 &&
      center &&
      typeof card.seller.location.distanceKm === 'number' &&
      card.seller.location.distanceKm > query.radiusKm
    ) {
      return false;
    }
    if (keyword) {
      const haystack = `${card.title} ${card.shortDescription} ${card.seller.displayName} ${card.onChain.sellerWallet} ${card.onChain.buyerWallet ?? ''} ${card.seller.location.district} ${card.seller.location.province} #${card.lotId}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
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

  const limit = Math.min(60, Math.max(1, Number(query.limit) || 12));
  const decodedCursor = decodeCursor(query.cursor);
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  let paged: ShopeeWeb3ProductCard[];
  let hasNextPage = false;
  let currentPage = Math.max(1, Number(query.page) || 1);

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
        status: allowedStatuses,
        chains: allowedChains,
        tokens: allowedTokens,
        category: query.category ?? null,
        minRating: query.minRating ?? null,
        radiusKm: query.radiusKm ?? null,
        q: keyword || null,
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
          { symbol: 'ECO', chainId: context.chainId ?? 43113, count: allCards.length },
          { symbol: 'USDT', chainId: context.chainId ?? 43113, count: allCards.length },
          { symbol: 'AVAX', chainId: context.chainId ?? 43113, count: allCards.length },
        ],
      },
    },
    items: paged,
  };
}
