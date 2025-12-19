-- Migration: Add Website Visitor Tracking for Marketing Funnel
-- Date: 2024-12-19
-- Description: Track anonymous website visitors for top-of-funnel analytics

-- =====================================================
-- 1. WEBSITE VISITORS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS website_visitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Visitor Identification (cookie-based)
    visitor_id VARCHAR(100) NOT NULL,
    
    -- UTM Parameters (captured on first visit)
    utm_source VARCHAR(50),
    utm_medium VARCHAR(50),
    utm_campaign VARCHAR(100),
    utm_content VARCHAR(100),
    utm_term VARCHAR(100),
    
    -- Additional Context
    referrer_url TEXT,
    landing_page TEXT,
    
    -- Device/Location Info
    device_type VARCHAR(20),  -- mobile, desktop, tablet
    country VARCHAR(100),
    country_code VARCHAR(10),
    
    -- Conversion Tracking
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Linked when visitor signs up
    converted_to_signup BOOLEAN DEFAULT false,
    signup_date TIMESTAMPTZ,
    
    -- Visit Tracking
    visit_count INTEGER DEFAULT 1,
    first_visit_at TIMESTAMPTZ DEFAULT NOW(),
    last_visit_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment
COMMENT ON TABLE website_visitors IS 'Track anonymous website visitors for marketing funnel analytics';

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================

-- Unique visitor lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_visitor_id ON website_visitors(visitor_id);

-- UTM source analytics
CREATE INDEX IF NOT EXISTS idx_visitors_utm_source ON website_visitors(utm_source);
CREATE INDEX IF NOT EXISTS idx_visitors_utm_campaign ON website_visitors(utm_campaign);

-- Conversion tracking
CREATE INDEX IF NOT EXISTS idx_visitors_converted ON website_visitors(converted_to_signup);
CREATE INDEX IF NOT EXISTS idx_visitors_user ON website_visitors(user_id) WHERE user_id IS NOT NULL;

-- Date-based queries
CREATE INDEX IF NOT EXISTS idx_visitors_first_visit ON website_visitors(first_visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_created ON website_visitors(created_at DESC);

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE website_visitors ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY website_visitors_admin ON website_visitors 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

-- =====================================================
-- 4. UPDATE FUNCTION FOR LAST VISIT
-- =====================================================

CREATE OR REPLACE FUNCTION update_visitor_last_visit()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_visit_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_visitor_last_visit
    BEFORE UPDATE ON website_visitors
    FOR EACH ROW
    EXECUTE FUNCTION update_visitor_last_visit();

-- =====================================================
-- 5. MARKETING FUNNEL VIEW
-- =====================================================

CREATE OR REPLACE VIEW marketing_funnel_analytics AS
WITH visitor_stats AS (
    SELECT 
        COALESCE(utm_source, 'direct') AS source,
        COUNT(*) AS total_visits,
        COUNT(CASE WHEN converted_to_signup THEN 1 END) AS signups
    FROM website_visitors
    WHERE first_visit_at >= NOW() - INTERVAL '30 days'
    GROUP BY COALESCE(utm_source, 'direct')
),
user_stats AS (
    SELECT 
        COALESCE(urs.utm_source, 'direct') AS source,
        COUNT(DISTINCT urs.user_id) AS registered_users,
        COUNT(DISTINCT CASE 
            WHEN us.status = 'active' AND sp.name = 'Free' THEN urs.user_id 
            WHEN us.status IS NULL THEN urs.user_id  -- No subscription = free
        END) AS free_users,
        COUNT(DISTINCT CASE 
            WHEN us.status = 'active' AND sp.name != 'Free' THEN urs.user_id 
        END) AS paid_users
    FROM user_referral_sources urs
    LEFT JOIN user_subscriptions us ON us.user_id = urs.user_id AND us.status = 'active'
    LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE urs.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY COALESCE(urs.utm_source, 'direct')
)
SELECT 
    COALESCE(v.source, u.source) AS source,
    COALESCE(v.total_visits, 0) AS visits,
    COALESCE(v.signups, u.registered_users, 0) AS registrations,
    COALESCE(u.free_users, 0) AS free_users,
    COALESCE(u.paid_users, 0) AS paid_users,
    CASE 
        WHEN COALESCE(v.total_visits, 0) > 0 
        THEN ROUND((COALESCE(v.signups, u.registered_users, 0)::numeric / v.total_visits) * 100, 1)
        ELSE 0 
    END AS visit_to_signup_rate,
    CASE 
        WHEN COALESCE(u.registered_users, 0) > 0 
        THEN ROUND((COALESCE(u.paid_users, 0)::numeric / u.registered_users) * 100, 1)
        ELSE 0 
    END AS signup_to_paid_rate
FROM visitor_stats v
FULL OUTER JOIN user_stats u ON v.source = u.source
ORDER BY COALESCE(v.total_visits, 0) DESC;

-- =====================================================
-- 6. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Visitor Tracking Migration completed successfully!';
    RAISE NOTICE 'Created table: website_visitors';
    RAISE NOTICE 'Created view: marketing_funnel_analytics';
END $$;
