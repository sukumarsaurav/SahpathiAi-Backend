-- Payment Orders Migration
-- Tracks Razorpay payment attempts for subscriptions

-- Payment Orders table
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id VARCHAR(100) UNIQUE,
  plan_id UUID REFERENCES subscription_plans(id),
  billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own payment orders
CREATE POLICY payment_orders_policy ON payment_orders FOR ALL USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_razorpay_id ON payment_orders(razorpay_order_id);
