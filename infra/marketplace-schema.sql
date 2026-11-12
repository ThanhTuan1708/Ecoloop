-- EcoLoop C2C Web3 Marketplace Schema (PostgreSQL + Keyset Pagination)
CREATE TYPE listing_status AS ENUM (
  'PENDING_TX', 'ACTIVE', 'IN_ESCROW', 'DISPUTED', 'SOLD', 'CANCELLED'
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id INTEGER NOT NULL,
  contract_address VARCHAR(42) NOT NULL,
  on_chain_listing_id NUMERIC(78, 0) NOT NULL,
  token_id NUMERIC(78, 0),
  content_hash CHAR(66) NOT NULL,

  seller_wallet VARCHAR(42) NOT NULL,
  buyer_wallet VARCHAR(42),

  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category_id VARCHAR(64) NOT NULL,
  condition VARCHAR(20) NOT NULL,
  media_assets JSONB NOT NULL DEFAULT '[]'::jsonb,

  payment_token_address VARCHAR(42) NOT NULL,
  payment_token_symbol VARCHAR(16) NOT NULL,
  payment_token_decimals SMALLINT NOT NULL,
  price_atomic NUMERIC(78, 0) NOT NULL,
  price_formatted NUMERIC(36, 18) NOT NULL,
  price_usd NUMERIC(18, 4) NOT NULL,
  price_vnd NUMERIC(20, 0) NOT NULL,

  status listing_status NOT NULL DEFAULT 'ACTIVE',
  total_qty INTEGER NOT NULL DEFAULT 1,
  available_qty INTEGER NOT NULL DEFAULT 1,
  locked_escrow_qty INTEGER NOT NULL DEFAULT 0,
  sold_qty INTEGER NOT NULL DEFAULT 0,
  escrow_lock_expires_at TIMESTAMPTZ,

  province VARCHAR(100) NOT NULL,
  district VARCHAR(100),
  approx_lat DOUBLE PRECISION,
  approx_lng DOUBLE PRECISION,

  seller_rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
  seller_rating_count INTEGER NOT NULL DEFAULT 0,
  popularity_score DOUBLE PRECISION NOT NULL DEFAULT 0,

  created_tx_hash CHAR(66) NOT NULL,
  last_event_block BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (chain_id, contract_address, on_chain_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_feed_newest
  ON listings (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_feed_price_asc
  ON listings (status, price_usd ASC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_feed_price_desc
  ON listings (status, price_usd DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_feed_sold
  ON listings (status, sold_qty DESC, popularity_score DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_chain_token
  ON listings (chain_id, payment_token_symbol, status);

CREATE INDEX IF NOT EXISTS idx_listings_seller
  ON listings (seller_wallet, status, created_at DESC);
