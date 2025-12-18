-- Migration: Add Subscription Duration Support
-- Date: 2024-12-19
-- Description: Adds support for multi-duration subscriptions (1/3/6/12 months),
--              one-time payments with optional auto-renewal, and early renewal discount

-- =====================================================
-- 1. UPDATE subscription_plans TABLE
-- =====================================================

-- Add new duration-based pricing columns
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS price_3_months DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_6_months DECIMAL(10, 2) DEFAULT 0;

-- Note: price_yearly already exists, but we'll use it for 1_year pricing
-- price_monthly will be used for 1_month pricing

-- Add column comments
COMMENT ON COLUMN subscription_plans.price_monthly IS 'Price for 1-month duration';
COMMENT ON COLUMN subscription_plans.price_3_months IS 'Price for 3-month duration (typically ~10% discount from 3x monthly)';
COMMENT ON COLUMN subscription_plans.price_6_months IS 'Price for 6-month duration (typically ~17% discount from 6x monthly)';
COMMENT ON COLUMN subscription_plans.price_yearly IS 'Price for 12-month duration (typically ~30% discount from 12x monthly)';

-- =====================================================
-- 2. UPDATE user_subscriptions TABLE
-- =====================================================

-- Add new columns for duration tracking and auto-renewal
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(20) DEFAULT '1_month',
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;

-- Add constraint for duration_type
ALTER TABLE user_subscriptions 
DROP CONSTRAINT IF EXISTS user_subscriptions_duration_type_check;

ALTER TABLE user_subscriptions 
ADD CONSTRAINT user_subscriptions_duration_type_check 
CHECK (duration_type IN ('1_month', '3_months', '6_months', '1_year'));

-- Add column comments
COMMENT ON COLUMN user_subscriptions.duration_type IS 'Duration of the subscription: 1_month, 3_months, 6_months, 1_year';
COMMENT ON COLUMN user_subscriptions.is_recurring IS 'Whether auto-renewal is enabled (default: false for one-time payments)';

-- =====================================================
-- 3. UPDATE payment_orders TABLE
-- =====================================================

-- Add duration column to payment orders
ALTER TABLE payment_orders 
ADD COLUMN IF NOT EXISTS duration VARCHAR(20) DEFAULT '1_month',
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;

-- Update constraint for billing_cycle to also support duration values
-- (we keep billing_cycle for backward compatibility but add duration)
COMMENT ON COLUMN payment_orders.duration IS 'Duration of the subscription: 1_month, 3_months, 6_months, 1_year';
COMMENT ON COLUMN payment_orders.is_recurring IS 'Whether auto-renewal is enabled';

-- =====================================================
-- 4. UPDATE EXISTING PLAN PRICES (Example - adjust for your actual prices)
-- =====================================================

-- Update Pro plan prices (example: ₹299/month)
UPDATE subscription_plans 
SET 
    price_3_months = CASE 
        WHEN price_monthly > 0 THEN ROUND(price_monthly * 3 * 0.9, 0) -- 10% off
        ELSE 0 
    END,
    price_6_months = CASE 
        WHEN price_monthly > 0 THEN ROUND(price_monthly * 6 * 0.83, 0) -- 17% off
        ELSE 0 
    END,
    price_yearly = CASE 
        WHEN price_yearly > 0 THEN price_yearly -- Keep existing yearly price
        WHEN price_monthly > 0 THEN ROUND(price_monthly * 12 * 0.7, 0) -- 30% off if no yearly
        ELSE 0 
    END
WHERE price_3_months IS NULL OR price_3_months = 0;

-- =====================================================
-- 5. ADD INDEXES FOR NEW COLUMNS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_duration 
ON user_subscriptions(duration_type);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_recurring 
ON user_subscriptions(is_recurring) WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expiry 
ON user_subscriptions(expires_at) WHERE status = 'active';

-- =====================================================
-- 6. MIGRATE EXISTING SUBSCRIPTIONS
-- =====================================================

-- Set duration_type based on billing_cycle in payment_orders
-- This updates existing subscriptions to have the correct duration_type
UPDATE user_subscriptions us
SET 
    duration_type = CASE 
        WHEN po.billing_cycle = 'yearly' THEN '1_year'
        ELSE '1_month'
    END,
    is_recurring = FALSE -- Existing subscriptions were recurring by default, but let's set them to one-time
FROM payment_orders po
WHERE po.user_id = us.user_id 
AND po.plan_id = us.plan_id
AND po.status = 'paid'
AND us.duration_type IS NULL;

-- For subscriptions without payment orders, default to 1_month
UPDATE user_subscriptions 
SET duration_type = '1_month', is_recurring = FALSE
WHERE duration_type IS NULL;

-- =====================================================
-- 7. HELPER FUNCTION FOR CALCULATING EXPIRY DATES
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_subscription_expiry(
    start_date TIMESTAMPTZ,
    duration VARCHAR(20)
) RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN CASE duration
        WHEN '1_month' THEN start_date + INTERVAL '1 month'
        WHEN '3_months' THEN start_date + INTERVAL '3 months'
        WHEN '6_months' THEN start_date + INTERVAL '6 months'
        WHEN '1_year' THEN start_date + INTERVAL '1 year'
        ELSE start_date + INTERVAL '1 month' -- Default
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 8. FUNCTION TO EXPIRE SUBSCRIPTIONS (for cron job)
-- =====================================================

CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    -- Update expired subscriptions that are not recurring
    WITH expired AS (
        UPDATE user_subscriptions
        SET 
            status = 'expired',
            cancelled_at = NOW()
        WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
        AND is_recurring = FALSE
        RETURNING id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;
    
    -- Log the expiration
    IF expired_count > 0 THEN
        RAISE NOTICE 'Expired % subscriptions', expired_count;
    END IF;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. FUNCTION FOR EARLY RENEWAL DISCOUNT CHECK
-- =====================================================

CREATE OR REPLACE FUNCTION check_early_renewal_eligibility(
    p_user_id UUID,
    p_days_threshold INTEGER DEFAULT 7
) RETURNS TABLE (
    is_eligible BOOLEAN,
    days_until_expiry INTEGER,
    current_plan_id UUID,
    current_plan_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (us.expires_at IS NOT NULL AND 
         us.expires_at > NOW() AND 
         us.expires_at <= NOW() + (p_days_threshold || ' days')::INTERVAL) AS is_eligible,
        EXTRACT(DAY FROM us.expires_at - NOW())::INTEGER AS days_until_expiry,
        us.plan_id AS current_plan_id,
        sp.name AS current_plan_name
    FROM user_subscriptions us
    JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND sp.name != 'Free'
    ORDER BY us.started_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10. VIEW FOR SUBSCRIPTION ANALYTICS
-- =====================================================

CREATE OR REPLACE VIEW subscription_analytics AS
SELECT 
    sp.name AS plan_name,
    us.duration_type,
    us.is_recurring,
    COUNT(*) AS subscription_count,
    COUNT(*) FILTER (WHERE us.status = 'active') AS active_count,
    COUNT(*) FILTER (WHERE us.status = 'expired') AS expired_count,
    COUNT(*) FILTER (WHERE us.status = 'cancelled') AS cancelled_count
FROM user_subscriptions us
JOIN subscription_plans sp ON sp.id = us.plan_id
GROUP BY sp.name, us.duration_type, us.is_recurring
ORDER BY sp.name, us.duration_type;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE 'New columns added:';
    RAISE NOTICE '  - subscription_plans: price_3_months, price_6_months';
    RAISE NOTICE '  - user_subscriptions: duration_type, is_recurring';
    RAISE NOTICE '  - payment_orders: duration, is_recurring';
    RAISE NOTICE 'Helper functions created:';
    RAISE NOTICE '  - calculate_subscription_expiry()';
    RAISE NOTICE '  - expire_subscriptions()';
    RAISE NOTICE '  - check_early_renewal_eligibility()';
END $$;
