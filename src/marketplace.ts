import { materials, short } from './model';
import { tr, num as fmt, wt } from './settings';
import { distanceKm, DEMO_COLLECTOR, DEMO_OWNER, ZERO, type Lot } from './pickupClient';

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

export interface CatalogItemMeta {
  id: number;
  title: string;
  description: string;
  sellerName: string;
  owner: `0x${string}`;
  collector: `0x${string}`;
  estimated: [number, number, number, number]; // [plastic, paper, metal, glass] in grams
  actual: [number, number, number, number];
  status: number; // 1=Open, 2=Claimed, 3=Proposed, 4=Completed, 5=Cancelled
  latitude: number;
  longitude: number;
  district: string;
  province: string;
  imageUrl: string;
  contact: string;
  address: string;
  hoursAgo: number;
  salesBoost: number;
  rating: number;
}

export interface UserLotMeta {
  id: number;
  evidence?: string;
  title?: string;
  contact?: string;
  address?: string;
  imageUrl?: string;
  ownerSignature?: string;
  claimSignature?: string;
  proposeSignature?: string;
  acceptSignature?: string;
}

const memoryUserMeta = new Map<number, UserLotMeta>();

function sanitizeMetaList(list: UserLotMeta[]): UserLotMeta[] {
  return list.map(m => ({
    ...m,
    imageUrl: m.imageUrl && m.imageUrl.length > 80_000 ? '/sample-scrap-plastic.jpg' : m.imageUrl,
  }));
}

export function loadUserLotsMeta(): UserLotMeta[] {
  try {
    const raw: UserLotMeta[] = JSON.parse(localStorage.getItem('ecoloop-user-lots-meta') || '[]');
    const clean = sanitizeMetaList(Array.isArray(raw) ? raw : []);
    for (const m of clean) memoryUserMeta.set(m.id, m);
    if (Array.isArray(raw) && raw.some(m => m.imageUrl && m.imageUrl.length > 80_000)) {
      localStorage.setItem('ecoloop-user-lots-meta', JSON.stringify(clean.slice(0, 50)));
    }
    return clean;
  } catch {
    return Array.from(memoryUserMeta.values());
  }
}

export function saveUserLotMeta(meta: UserLotMeta): void {
  const cleanMeta: UserLotMeta = {
    ...meta,
    imageUrl: meta.imageUrl && meta.imageUrl.length > 80_000 ? '/sample-scrap-plastic.jpg' : meta.imageUrl,
  };
  memoryUserMeta.set(cleanMeta.id, cleanMeta);
  try {
    const list = loadUserLotsMeta();
    const filtered = list.filter(m => m.id !== cleanMeta.id);
    filtered.unshift(cleanMeta);
    localStorage.setItem('ecoloop-user-lots-meta', JSON.stringify(filtered.slice(0, 50)));
  } catch {
    try {
      localStorage.removeItem('ecoloop-user-lots-meta');
      localStorage.setItem('ecoloop-user-lots-meta', JSON.stringify([cleanMeta]));
    } catch {
      // ignore if storage disabled
    }
  }
}

export function getUserLotMeta(id: number, evidence?: string): UserLotMeta | undefined {
  if (memoryUserMeta.has(id)) return memoryUserMeta.get(id);
  try {
    const list = loadUserLotsMeta();
    const byId = list.find(m => m.id === id);
    if (byId) return byId;
    const evLower = evidence?.toLowerCase();
    if (id > 28 && evLower) {
      return list.find(m => m.evidence?.toLowerCase() === evLower);
    }
    return undefined;
  } catch {
    return memoryUserMeta.get(id);
  }
}

const W_SELLER_1 = DEMO_OWNER;
const W_SELLER_2 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const W_SELLER_3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const W_SELLER_4 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const;
const W_SELLER_5 = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as const;
const W_SELLER_6 = '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as const;
const W_COLLECTOR_1 = DEMO_COLLECTOR;
const W_COLLECTOR_2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

export const CATALOG_ITEMS: CatalogItemMeta[] = [
  {
    id: 1,
    title: 'Kiện lon nhôm bia 333 & Hà Nội ép vuông + Cuộn dây đồng bóc vỏ',
    description: 'Lô phế liệu kim loại sạch tại kho Quận 7: 2 kiện lon nhôm ép vuông và cuộn dây đồng đỏ lõi lớn đã bóc vỏ cách điện, cân điện tử tại chỗ.',
    sellerName: 'Vựa Phế Liệu Minh Phát Q7',
    owner: W_SELLER_1,
    collector: ZERO,
    estimated: [0, 0, 18500, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.73,
    longitude: 106.72,
    district: 'Quận 7 · Phú Mỹ Hưng',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Anh Minh (Chủ kho Q7) · 0903 881 245',
    address: '88 Nguyễn Thị Thập, P. Tân Hưng, Quận 7, TP.HCM (Có xe nâng hỗ trợ bốc xếp 8h–17h)',
    hoursAgo: 1,
    salesBoost: 64,
    rating: 5.0,
  },
  {
    id: 2,
    title: 'Bành chai nhựa PET nước suối trong suốt ép kiện 25kg đã tháo nhãn',
    description: 'Chai nhựa PET trong suốt (Aquafina, Lavie) đã tháo nắp và nhãn, ép kiện vuông buộc dây đai gọn gàng, độ ẩm 0%.',
    sellerName: 'Trạm Tái Chế Xanh Thảo Điền',
    owner: W_SELLER_2,
    collector: ZERO,
    estimated: [25000, 0, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.80,
    longitude: 106.73,
    district: 'Thảo Điền · TP. Thủ Đức',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Chị Lan Thảo Điền · 0918 224 109',
    address: '14 Đường Xuân Thủy, P. Thảo Điền, TP. Thủ Đức, TP.HCM',
    hoursAgo: 2,
    salesBoost: 52,
    rating: 4.9,
  },
  {
    id: 3,
    title: 'Chồng thùng carton sóng 5 lớp siêu thị buộc dây nilon vàng (42kg)',
    description: 'Thùng carton 5 lớp khô ráo hoàn toàn từ kho siêu thị điện máy, đã xếp phẳng và buộc dây chịu lực sẵn trên pallet.',
    sellerName: 'Kho Khoáng Sản & Bao Bì Bình Thạnh',
    owner: W_SELLER_3,
    collector: ZERO,
    estimated: [0, 42000, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.80,
    longitude: 106.71,
    district: 'Quận Bình Thạnh',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Quản lý kho Hoàng · 0989 712 330',
    address: '215 Điện Biên Phủ, P. 15, Quận Bình Thạnh, TP.HCM',
    hoursAgo: 3,
    salesBoost: 47,
    rating: 4.9,
  },
  {
    id: 4,
    title: '6 Két vỏ chai thủy tinh xanh & nâu đã phân loại sạch (35kg)',
    description: 'Vỏ chai bia và nước giải khát thủy tinh nguyên vẹn, không lẫn mảnh vỡ, đặt sẵn trong két nhựa công nghiệp dễ vận chuyển.',
    sellerName: 'Nhà Hàng Sân Vườn Quận 1',
    owner: W_SELLER_4,
    collector: ZERO,
    estimated: [0, 0, 0, 35000],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.78,
    longitude: 106.70,
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-glass.jpg',
    contact: 'Quầy Thu Ngân Nhà Hàng · 0909 412 889',
    address: '45 Nguyễn Đình Chiểu, P. Đa Kao, Quận 1, TP.HCM (Nhận sau 14h chiều)',
    hoursAgo: 4,
    salesBoost: 38,
    rating: 4.8,
  },
  {
    id: 5,
    title: 'Lô tổng hợp Căn hộ Vinhomes: Chai PET + Thùng carton + Lon nhôm',
    description: 'Phế liệu sinh hoạt gia đình đã phân loại kỹ 3 túi riêng biệt: 6.5kg nhựa PET, 12kg giấy carton Shopee và 3.2kg vỏ lon bia nhôm.',
    sellerName: 'Hộ Gia Đình Landmark 81',
    owner: W_SELLER_1,
    collector: W_COLLECTOR_1,
    estimated: [6500, 12000, 3200, 0],
    actual: [0, 0, 0, 0],
    status: 2, // Claimed -> IN_ESCROW
    latitude: 10.79,
    longitude: 106.72,
    district: 'Quận Bình Thạnh',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Anh Tuấn (Căn hộ L4) · 0938 115 678',
    address: 'Sảnh B1 Vinhomes Central Park, 208 Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM',
    hoursAgo: 5,
    salesBoost: 29,
    rating: 5.0,
  },
  {
    id: 6,
    title: 'Cuộn cáp đồng motor công nghiệp & thanh nhôm định hình (14.5kg)',
    description: 'Đồng đỏ tháo từ motor máy bơm cũ kèm thanh nhôm Xingfa cắt dư tại xưởng cơ khí Tân Bình, không lẫn tạp chất sắt.',
    sellerName: 'Xưởng Cơ Khí Đại Tín Tân Bình',
    owner: W_SELLER_5,
    collector: ZERO,
    estimated: [0, 0, 14500, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.80,
    longitude: 106.65,
    district: 'Quận Tân Bình',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Kỹ sư Phúc · 0977 302 114',
    address: '112 Cộng Hòa, P. 4, Quận Tân Bình, TP.HCM',
    hoursAgo: 6,
    salesBoost: 81,
    rating: 5.0,
  },
  {
    id: 7,
    title: 'Lô giấy văn phòng A4 1 mặt & Hồ sơ lưu trữ hủy (55kg)',
    description: 'Giấy in văn phòng A4 trắng sạch và bìa hồ sơ thanh lý cuối quý của công ty kiểm toán, đóng sẵn trong 5 thùng lớn.',
    sellerName: 'Văn Phòng Tòa Nhà Viettel Q10',
    owner: W_SELLER_2,
    collector: W_COLLECTOR_2,
    estimated: [0, 55000, 0, 0],
    actual: [0, 56200, 0, 0],
    status: 3, // Proposed -> IN_ESCROW
    latitude: 10.77,
    longitude: 106.66,
    district: 'Quận 10',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Hành chính Nhân sự (Ms. Vy) · 0902 654 991',
    address: '285 Cách Mạng Tháng Tám, P. 12, Quận 10, TP.HCM',
    hoursAgo: 8,
    salesBoost: 44,
    rating: 4.9,
  },
  {
    id: 8,
    title: 'Bao tải chai nhựa PET & Ly nhựa PP quán trà sữa đã súc sạch (16kg)',
    description: 'Toàn bộ chai nhựa PET và can siro HDPE từ chuỗi quán nước Quận 3, đã tráng nước sạch và ép dẹp tiết kiệm diện tích.',
    sellerName: 'Chuỗi Trà & Cà Phê Xanh Q3',
    owner: W_SELLER_6,
    collector: ZERO,
    estimated: [16000, 3500, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.78,
    longitude: 106.68,
    district: 'Quận 3',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Cửa hàng trưởng Khôi · 0966 512 008',
    address: '190 Võ Văn Tần, P. 5, Quận 3, TP.HCM',
    hoursAgo: 9,
    salesBoost: 35,
    rating: 4.8,
  },
  {
    id: 9,
    title: 'Lon nhôm nước ngọt ép khối & Vỏ lon bia sự kiện tất niên (22kg)',
    description: 'Lon nhôm 100% thu gom sau sự kiện hội nghị tại Trung tâm triển lãm SECC Quận 7, đã ép khối vuông trên cân bàn.',
    sellerName: 'Đội Dịch Vụ Sự Kiện SECC Q7',
    owner: W_SELLER_1,
    collector: W_COLLECTOR_1,
    estimated: [2000, 0, 22000, 0],
    actual: [2100, 0, 22400, 0],
    status: 4, // Completed -> SOLD
    latitude: 10.73,
    longitude: 106.72,
    district: 'Quận 7 · Phú Mỹ Hưng',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Điều phối viên Bảo · 0908 773 412',
    address: '799 Nguyễn Văn Linh, P. Tân Phú, Quận 7, TP.HCM',
    hoursAgo: 12,
    salesBoost: 93,
    rating: 5.0,
  },
  {
    id: 10,
    title: 'Thùng carton kho Fulfillment TMĐT & Lõi giấy công nghiệp (68kg)',
    description: 'Thùng carton cỡ lớn từ kho đóng gói hàng thương mại điện tử Gò Vấp, kèm 15kg lõi ống giấy cứng nguyên cây.',
    sellerName: 'Kho Vận Express Gò Vấp',
    owner: W_SELLER_3,
    collector: ZERO,
    estimated: [4000, 68000, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.83,
    longitude: 106.67,
    district: 'Quận Gò Vấp',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Thủ kho Thành · 0914 908 211',
    address: '392 Quang Trung, P. 10, Quận Gò Vấp, TP.HCM',
    hoursAgo: 14,
    salesBoost: 57,
    rating: 4.9,
  },
  {
    id: 11,
    title: 'Vỏ chai rượu vang & Chai nước khoáng thủy tinh khách sạn (28kg)',
    description: 'Chai thủy tinh dày phân loại theo màu (xanh rêu và trong suốt) từ khách sạn boutique Phú Nhuận, đóng sẵn trong thùng nhựa.',
    sellerName: 'Boutique Hotel Phú Nhuận',
    owner: W_SELLER_4,
    collector: ZERO,
    estimated: [0, 4000, 0, 28000],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.80,
    longitude: 106.68,
    district: 'Quận Phú Nhuận',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-glass.jpg',
    contact: 'Quản lý Buồng phòng · 0945 123 780',
    address: '128 Phan Xích Long, P. 2, Quận Phú Nhuận, TP.HCM',
    hoursAgo: 16,
    salesBoost: 26,
    rating: 4.7,
  },
  {
    id: 12,
    title: 'Can nhựa HDPE 5L–20L trắng đục & Vỏ bình nước tinh khiết (19.5kg)',
    description: 'Can nhựa HDPE dày chuyên đựng nước cất phòng thí nghiệm trường đại học tại Thủ Đức, sạch tuyệt đối, không mùi hóa chất.',
    sellerName: 'Khu Đô Thị ĐHQG Linh Trung',
    owner: W_SELLER_5,
    collector: ZERO,
    estimated: [19500, 5000, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.85,
    longitude: 106.75,
    district: 'Linh Trung · TP. Thủ Đức',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Ban Quản Lý Tòa Nhà B6 · 0932 440 198',
    address: 'Khu phố 6, P. Linh Trung, TP. Thủ Đức, TP.HCM',
    hoursAgo: 18,
    salesBoost: 41,
    rating: 4.9,
  },
  {
    id: 13,
    title: 'Mạt đồng vàng, van nước đồng thau & Inox 304 nhà bếp (11.2kg)',
    description: 'Lô kim loại màu giá trị cao: van đồng thau cũ, ống đồng điều hòa và khay Inox 304 dày thu hồi từ công trình cải tạo Quận 4.',
    sellerName: 'Đội Thi Công Điện Lạnh Q4',
    owner: W_SELLER_6,
    collector: W_COLLECTOR_1,
    estimated: [0, 0, 11200, 0],
    actual: [0, 0, 0, 0],
    status: 2, // Claimed -> IN_ESCROW
    latitude: 10.76,
    longitude: 106.70,
    district: 'Quận 4',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Thợ trưởng Hải · 0907 556 321',
    address: '156 Hoàng Diệu, P. 6, Quận 4, TP.HCM',
    hoursAgo: 20,
    salesBoost: 72,
    rating: 5.0,
  },
  {
    id: 14,
    title: 'Sách báo cũ, tạp chí & Giấy bìa cứng trường học (38kg)',
    description: 'Phong trào Kế Hoạch Nhỏ thu gom giấy báo, sách giáo khoa cũ và thùng giấy tại trường học Quận 5, đã buộc từng kiện 10kg.',
    sellerName: 'CLB Môi Trường Xanh Quận 5',
    owner: W_SELLER_2,
    collector: ZERO,
    estimated: [2500, 38000, 1500, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.75,
    longitude: 106.66,
    district: 'Quận 5',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Cô Thảo Phụ Trách · 0919 882 340',
    address: '227 Nguyễn Văn Cừ, P. 4, Quận 5, TP.HCM',
    hoursAgo: 22,
    salesBoost: 60,
    rating: 5.0,
  },
  {
    id: 15,
    title: 'Kiện nhựa PET ép máy thủy lực Khu Công Nghiệp Sóng Thần (45kg)',
    description: 'Chai nhựa PET trắng trong suốt phân loại 100%, ép máy thủy lực thành kiện vuông tiêu chuẩn nhà máy tái chế tại Dĩ An.',
    sellerName: 'Trạm Trung Chuyển Sóng Thần',
    owner: W_SELLER_3,
    collector: ZERO,
    estimated: [45000, 0, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.90,
    longitude: 106.77,
    district: 'TP. Dĩ An',
    province: 'Bình Dương',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Anh Đạt KCN Sóng Thần · 0983 441 902',
    address: 'Đại lộ Độc Lập, KCN Sóng Thần 1, TP. Dĩ An, Bình Dương',
    hoursAgo: 25,
    salesBoost: 88,
    rating: 4.9,
  },
  {
    id: 16,
    title: 'Hũ thủy tinh yến sào & Chai nước trái cây thủy tinh trong (24kg)',
    description: 'Lọ thủy tinh trắng trong suốt đã rửa sạch và phơi khô, đóng khay nhựa cẩn thận tại xưởng chế biến thực phẩm Bình Tân.',
    sellerName: 'Xưởng Thực Phẩm Xanh Bình Tân',
    owner: W_SELLER_4,
    collector: W_COLLECTOR_2,
    estimated: [0, 0, 0, 24000],
    actual: [0, 0, 0, 24500],
    status: 4, // Completed -> SOLD
    latitude: 10.76,
    longitude: 106.60,
    district: 'Quận Bình Tân',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-glass.jpg',
    contact: 'Chị Hạnh Quản Đốc · 0906 239 871',
    address: '510 Tên Lửa, P. Bình Trị Đông B, Quận Bình Tân, TP.HCM',
    hoursAgo: 28,
    salesBoost: 33,
    rating: 4.8,
  },
  {
    id: 17,
    title: 'Dây cáp đồng bóc vỏ & Kiện lon nhôm khu vực Hoàn Kiếm (15.8kg)',
    description: 'Đồng cáp điện lực thanh lý và 2 kiện lon nhôm ép chặt tại điểm thu gom phố cổ Hà Nội, hỗ trợ giao nhận nhanh trong ngày.',
    sellerName: 'Vựa Tái Chế Phố Cổ Hoàn Kiếm',
    owner: W_SELLER_5,
    collector: ZERO,
    estimated: [0, 0, 15800, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 21.03,
    longitude: 105.85,
    district: 'Quận Hoàn Kiếm',
    province: 'Hà Nội',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Anh Kiên Hoàn Kiếm · 0912 345 609',
    address: '36 Hàng Đậu, Q. Hoàn Kiếm, Hà Nội',
    hoursAgo: 30,
    salesBoost: 76,
    rating: 5.0,
  },
  {
    id: 18,
    title: 'Thùng carton kho vận Cầu Giấy & Giấy in văn phòng (48kg)',
    description: 'Thùng carton khô đẹp từ tòa nhà văn phòng công nghệ tại Cầu Giấy, đã xếp gọn và buộc dây đai nhựa sẵn sàng lên xe.',
    sellerName: 'Tổ Hợp Văn Phòng Duy Tân',
    owner: W_SELLER_6,
    collector: ZERO,
    estimated: [3000, 48000, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 21.03,
    longitude: 105.79,
    district: 'Quận Cầu Giấy',
    province: 'Hà Nội',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Ban Quản Lý Tòa Nhà · 0988 601 234',
    address: '78 Duy Tân, P. Dịch Vọng Hậu, Q. Cầu Giấy, Hà Nội',
    hoursAgo: 33,
    salesBoost: 49,
    rating: 4.9,
  },
  {
    id: 19,
    title: 'Chai nhựa PET & Can HDPE khách sạn ven biển Sơn Trà (29kg)',
    description: 'Nhựa PET trong suốt và can nhựa HDPE phân loại tại nguồn từ khu nghỉ dưỡng ven biển Đà Nẵng, sạch 99%.',
    sellerName: 'EcoResort Bán Đảo Sơn Trà',
    owner: W_SELLER_2,
    collector: ZERO,
    estimated: [29000, 6000, 2000, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 16.07,
    longitude: 108.24,
    district: 'Quận Sơn Trà',
    province: 'Đà Nẵng',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Bộ phận Môi trường (Mr. Nam) · 0905 711 892',
    address: 'Đường Võ Nguyên Giáp, P. Phước Mỹ, Q. Sơn Trà, Đà Nẵng',
    hoursAgo: 36,
    salesBoost: 54,
    rating: 4.9,
  },
  {
    id: 20,
    title: '8 Két vỏ chai bia thủy tinh & Lon nhôm nhà hàng Hải Châu (32kg)',
    description: 'Vỏ chai bia thủy tinh nguyên két và 6.5kg lon nhôm đã ép gọn tại trung tâm TP. Đà Nẵng, xe tải nhỏ vào tận cổng.',
    sellerName: 'Nhà Hàng Hải Sản Sông Hàn',
    owner: W_SELLER_3,
    collector: W_COLLECTOR_1,
    estimated: [0, 0, 6500, 25500],
    actual: [0, 0, 0, 0],
    status: 2, // Claimed -> IN_ESCROW
    latitude: 16.06,
    longitude: 108.22,
    district: 'Quận Hải Châu',
    province: 'Đà Nẵng',
    imageUrl: '/sample-scrap-glass.jpg',
    contact: 'Quản lý Hùng · 0905 223 119',
    address: '164 Bạch Đằng, Q. Hải Châu, Đà Nẵng',
    hoursAgo: 40,
    salesBoost: 42,
    rating: 4.8,
  },
  {
    id: 21,
    title: 'Lô phế liệu tổng hợp Hộ gia đình Quận 7: Nhựa + Giấy + Lon nhôm',
    description: 'Dọn nhà cuối tuần tại Khu dân cư Tân Quy, Quận 7: 8kg chai nhựa PET, 14kg thùng carton và 4kg lon nhôm bia nước ngọt.',
    sellerName: 'Gia Đình Chị Mai Tân Quy Q7',
    owner: W_SELLER_1,
    collector: ZERO,
    estimated: [8000, 14000, 4000, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.74,
    longitude: 106.71,
    district: 'Quận 7 · Phú Mỹ Hưng',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Chị Mai · 0903 119 456',
    address: 'Đường Số 15, P. Tân Quy, Quận 7, TP.HCM',
    hoursAgo: 42,
    salesBoost: 31,
    rating: 4.9,
  },
  {
    id: 22,
    title: 'Motor điện cũ, dây đồng cuộn & Vỏ máy nhôm đúc Thuận An (21kg)',
    description: 'Thanh lý lô motor quạt công nghiệp cháy cuộn dây đồng và vỏ nhôm đúc nguyên khối tại xưởng sản xuất Thuận An.',
    sellerName: 'Cơ Sở Cơ Điện Thuận An',
    owner: W_SELLER_5,
    collector: ZERO,
    estimated: [0, 0, 21000, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.93,
    longitude: 106.71,
    district: 'TP. Thuận An',
    province: 'Bình Dương',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Anh Sơn Cơ Điện · 0972 889 104',
    address: 'KDC Việt Sing, P. An Phú, TP. Thuận An, Bình Dương',
    hoursAgo: 45,
    salesBoost: 69,
    rating: 5.0,
  },
  {
    id: 23,
    title: 'Bao bì giấy Kraft & Thùng carton 3 lớp KCN Biên Hòa (52kg)',
    description: 'Bao giấy Kraft nguyên sinh và thùng carton 3 lớp dư từ dây chuyền đóng gói nông sản xuất khẩu tại Biên Hòa.',
    sellerName: 'Nhà Máy Đóng Gói Biên Hòa',
    owner: W_SELLER_4,
    collector: W_COLLECTOR_2,
    estimated: [0, 52000, 0, 0],
    actual: [0, 52800, 0, 0],
    status: 4, // Completed -> SOLD
    latitude: 10.95,
    longitude: 106.82,
    district: 'TP. Biên Hòa',
    province: 'Đồng Nai',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Phòng Vật Tư (Anh Tùng) · 0913 667 890',
    address: 'Đường Số 4, KCN Biên Hòa 2, TP. Biên Hòa, Đồng Nai',
    hoursAgo: 48,
    salesBoost: 63,
    rating: 4.9,
  },
  {
    id: 24,
    title: 'Rổ nhựa công nghiệp HDPE & Kiện chai PET Bến Ninh Kiều (33kg)',
    description: 'Rổ nhựa trái cây HDPE cũ và 20kg chai nhựa PET ép gọn tại trạm thu gom xanh trung tâm Quận Ninh Kiều, Cần Thơ.',
    sellerName: 'Trạm Xanh Tây Đô Cần Thơ',
    owner: W_SELLER_6,
    collector: ZERO,
    estimated: [33000, 0, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.03,
    longitude: 105.78,
    district: 'Quận Ninh Kiều',
    province: 'Cần Thơ',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Anh Vũ Ninh Kiều · 0939 551 208',
    address: '82 Hai Bà Trưng, P. Tân An, Q. Ninh Kiều, Cần Thơ',
    hoursAgo: 50,
    salesBoost: 45,
    rating: 4.8,
  },
  {
    id: 25,
    title: 'Kiện lon nhôm ép & Dây đồng đỏ Đống Đa (17.4kg)',
    description: 'Lon nhôm nước giải khát đã ép thành khối vuông và 5.4kg dây cáp đồng bóc vỏ sẵn trên bàn cân điện tử tại Đống Đa.',
    sellerName: 'Đại Lý Thu Gom Xanh Đống Đa',
    owner: W_SELLER_2,
    collector: W_COLLECTOR_1,
    estimated: [0, 0, 17400, 0],
    actual: [0, 0, 17600, 0],
    status: 4, // Completed -> SOLD
    latitude: 21.01,
    longitude: 105.82,
    district: 'Quận Đống Đa',
    province: 'Hà Nội',
    imageUrl: '/sample-scrap-metal.jpg',
    contact: 'Anh Long Đống Đa · 0984 312 776',
    address: '105 Tây Sơn, Q. Đống Đa, Hà Nội',
    hoursAgo: 54,
    salesBoost: 84,
    rating: 5.0,
  },
  {
    id: 26,
    title: 'Két chai thủy tinh & Thùng giấy carton sự kiện Thủ Đức (26kg)',
    description: '18kg chai thủy tinh phân loại trong két nhựa và 8kg thùng giấy carton sạch sau hội chợ cuối tuần tại TP. Thủ Đức.',
    sellerName: 'Không Gian Sáng Tạo Thủ Đức',
    owner: W_SELLER_1,
    collector: ZERO,
    estimated: [0, 8000, 0, 18000],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.81,
    longitude: 106.74,
    district: 'Thảo Điền · TP. Thủ Đức',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-glass.jpg',
    contact: 'Quản lý Sự kiện (Ms. Linh) · 0901 884 512',
    address: '28 Quốc Hương, P. Thảo Điền, TP. Thủ Đức, TP.HCM',
    hoursAgo: 58,
    salesBoost: 37,
    rating: 4.8,
  },
  {
    id: 27,
    title: 'Lô nhựa PET & Màng bọc PE kho hàng Quận 10 (21.5kg)',
    description: 'Màng PE quấn pallet trắng trong và chai nhựa PET thu gom tại kho dược phẩm Quận 10, khô sạch 100%.',
    sellerName: 'Kho Dược Phẩm Tô Hiến Thành',
    owner: W_SELLER_3,
    collector: ZERO,
    estimated: [21500, 4500, 0, 0],
    actual: [0, 0, 0, 0],
    status: 1,
    latitude: 10.78,
    longitude: 106.66,
    district: 'Quận 10',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-plastic.jpg',
    contact: 'Anh Quang Kho Dược · 0908 114 920',
    address: '334 Tô Hiến Thành, P. 14, Quận 10, TP.HCM',
    hoursAgo: 62,
    salesBoost: 51,
    rating: 4.9,
  },
  {
    id: 28,
    title: 'Lô thùng giấy nhỏ gia đình (Đã gộp sang lô mới #3)',
    description: 'Chủ lô đã hủy niêm yết này để gộp chung vào lô carton lớn hơn.',
    sellerName: 'Hộ Gia Đình Nguyễn Thị Minh Khai',
    owner: W_SELLER_1,
    collector: ZERO,
    estimated: [0, 6000, 0, 0],
    actual: [0, 0, 0, 0],
    status: 5, // Cancelled -> CANCELLED
    latitude: 10.78,
    longitude: 106.69,
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
    imageUrl: '/sample-scrap-paper.jpg',
    contact: 'Chủ lô đã đóng niêm yết',
    address: 'Nguyễn Thị Minh Khai, Quận 1, TP.HCM',
    hoursAgo: 70,
    salesBoost: 15,
    rating: 4.7,
  },
];

function catalogHexHash(id: number): `0x${string}` {
  const hex = id.toString(16).padStart(2, '0');
  return (`0x${hex.repeat(32)}`) as `0x${string}`;
}

const CATALOG_BY_HASH = new Map<string, CatalogItemMeta>(
  CATALOG_ITEMS.map(item => [catalogHexHash(item.id).toLowerCase(), item])
);

const CATALOG_BY_ID = new Map<number, CatalogItemMeta>(
  CATALOG_ITEMS.map(item => [item.id, item])
);

export function createCatalogLots(now = Date.now()): Lot[] {
  return CATALOG_ITEMS.map(item => ({
    id: item.id,
    owner: item.owner,
    collector: item.collector,
    estimated: [...item.estimated],
    actual: [...item.actual],
    evidence: catalogHexHash(item.id),
    latitude: item.latitude,
    longitude: item.longitude,
    updatedAt: now - item.hoursAgo * 3600 * 1000,
    status: item.status,
  }));
}

export function mergeWithCatalogLots(onChainLots: Lot[], catalogLots: Lot[]): Lot[] {
  if (!onChainLots.length) return catalogLots;
  const usedIds = new Set(onChainLots.map(l => l.id));
  const usedHashes = new Set(onChainLots.map(l => l.evidence.toLowerCase()));
  let sampleFallbackId = 29;
  const extras: Lot[] = [];
  for (const c of catalogLots) {
    const isUserCreated = c.id > 28;
    if (!isUserCreated && usedHashes.has(c.evidence.toLowerCase())) continue;
    let id = c.id;
    if (usedIds.has(id)) {
      while (usedIds.has(sampleFallbackId)) sampleFallbackId++;
      id = sampleFallbackId;
    }
    usedIds.add(id);
    extras.push({ ...c, id });
  }
  return [...onChainLots, ...extras];
}

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
  const userMeta = getUserLotMeta(lot.id, lot.evidence);
  const catalogMeta = userMeta
    ? {
        id: lot.id,
        title: userMeta.title ?? tr('Phế liệu phân loại sạch #{id}', { id: lot.id }),
        description: tr('Thu gom tận nơi tại {place}. Tổng khối lượng {kg}, bảo vệ bởi hợp đồng ký quỹ Avalanche.', { place: userMeta.address || 'TP. Hồ Chí Minh', kg: wt(weights.reduce((a, b) => a + b, 0) / 1000) }),
        sellerName: tr('Bạn (Chủ lô)'),
        owner: lot.owner,
        collector: lot.collector,
        estimated: lot.estimated as [number, number, number, number],
        actual: lot.actual as [number, number, number, number],
        status: lot.status,
        latitude: lot.latitude,
        longitude: lot.longitude,
        district: userMeta.address ? userMeta.address.split(',')[0].trim() : tr('Khu vực của bạn'),
        province: 'TP. Hồ Chí Minh',
        imageUrl: userMeta.imageUrl || '',
        contact: userMeta.contact || tr('Liên hệ qua ứng dụng'),
        address: userMeta.address || tr('Địa chỉ do bạn cung cấp'),
        hoursAgo: 0,
        salesBoost: 0,
        rating: 5.0,
      }
    : (CATALOG_BY_HASH.get(lot.evidence.toLowerCase()) ?? CATALOG_BY_ID.get(lot.id));

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

  const area = catalogMeta
    ? { province: catalogMeta.province, district: catalogMeta.district }
    : resolveArea(lot.latitude, lot.longitude);
  const dist = options.center ? Number(distanceKm(options.center, [lot.latitude, lot.longitude]).toFixed(2)) : undefined;

  const sellerLots = (options.allLots ?? [lot]).filter(
    l => l.owner.toLowerCase() === lot.owner.toLowerCase()
  );
  const completedOnChain = sellerLots.filter(l => l.status === 4).length;
  const seedNum = parseInt(lot.evidence.slice(2, 6) || '1a2b', 16) || lot.id * 17;
  const completedSalesCount = catalogMeta
    ? catalogMeta.salesBoost + completedOnChain
    : completedOnChain + (seedNum % 24) + 1;
  const reputationScore = catalogMeta
    ? catalogMeta.rating
    : Number((4.7 + ((seedNum % 4) * 0.1)).toFixed(1));
  const totalReviews = Math.max(1, Math.floor(completedSalesCount * 0.65));

  const namesList = materialTags.map(m => `${tr(m.name)} ${wt(m.kilograms)}`).join(' + ');
  const title = catalogMeta
    ? tr('Lô #{id} · {title}', { id: lot.id, title: catalogMeta.title })
    : tr('Lô #{id} · {title}', { id: lot.id, title: namesList || tr('Phế liệu phân loại sạch') });
  const shortDescription = catalogMeta
    ? catalogMeta.description
    : tr('Thu gom tận nơi tại {place}. Tổng khối lượng {kg}, thanh toán & ký quỹ minh bạch trên Avalanche.', { place: `${area.district}, ${area.province}`, kg: wt(totalKilograms) });

  const status = mapPickupStatusToWeb3(lot.status);
  const uiState = buildUiState(lot.status, options.role);
  const updatedMs = lot.updatedAt > 1e11 ? lot.updatedAt : lot.updatedAt * 1000;
  const updatedIso = new Date(updatedMs || Date.now()).toISOString();
  const expiresIso =
    status === 'IN_ESCROW' ? new Date(updatedMs + SEVEN_DAYS_MS).toISOString() : null;

  const cidSuffix = lot.evidence.slice(2, 46).toLowerCase();
  const previewUrl =
    catalogMeta?.imageUrl ?? CATEGORY_PREVIEW_IMAGES[dominantSlug] ?? '/sample-scrap-plastic.jpg';
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
      viewsCount: 18 + (seedNum % 140),
      favoritesCount: 2 + (seedNum % 25),
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
      displayName: catalogMeta?.sellerName ?? tr('Trạm Xanh {wallet}', { wallet: short(lot.owner) }),
      isVerifiedCollector: completedOnChain >= 1 || (catalogMeta?.salesBoost ?? 0) >= 30,
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
    contactPreview: catalogMeta
      ? { contact: catalogMeta.contact, address: catalogMeta.address }
      : undefined,
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
