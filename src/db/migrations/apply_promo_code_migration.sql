-- Promo Code Feature Migration
-- Run this SQL in Supabase SQL Editor to add promo code tables

-- =====================================================
-- PROMO CODE TABLES
-- =====================================================

-- Promo Codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  discount_type VARCHAR(20) DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
  max_uses INT, -- NULL = unlimited
  current_uses INT DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  applicable_plan_ids JSONB, -- NULL = all plans, or array of plan IDs
  min_order_amount DECIMAL(10, 2) DEFAULT 0, -- Minimum order amount to apply
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Promo Code Usage tracking
CREATE TABLE IF NOT EXISTS promo_code_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  payment_order_id UUID REFERENCES payment_orders(id) ON DELETE SET NULL,
  discount_amount DECIMAL(10, 2) NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promo_code_id, user_id) -- Prevent same user using same code twice
);

-- Add promo code reference to payment_orders
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id);
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS original_amount DECIMAL(10, 2);
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_user ON promo_code_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_promo ON promo_code_usages(promo_code_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_usages ENABLE ROW LEVEL SECURITY;

-- Admin can manage all promo codes
CREATE POLICY promo_codes_admin_all ON promo_codes FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Public read access for active promo codes validation
CREATE POLICY promo_codes_read ON promo_codes FOR SELECT USING (is_active = true);

-- Users can only see their own promo code usages
CREATE POLICY promo_code_usages_policy ON promo_code_usages FOR ALL USING (auth.uid() = user_id);

-- Admin can see all usages
CREATE POLICY promo_code_usages_admin ON promo_code_usages FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to increment promo code usage count atomically
CREATE OR REPLACE FUNCTION increment_promo_uses(promo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE promo_codes
  SET current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = promo_id;
END;
$$;
