-- Migration: Add Marketing & Social Media System
-- Date: 2024-12-19
-- Description: Tables for marketing campaigns, referral tracking, social media management, and ROI analytics

-- =====================================================
-- 1. MARKETING CAMPAIGNS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Campaign Info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- UTM Parameters for Tracking
    utm_source VARCHAR(50),      -- facebook, whatsapp, instagram, google
    utm_medium VARCHAR(50),      -- social, paid, email, referral
    utm_campaign VARCHAR(100),   -- unique campaign identifier
    utm_content VARCHAR(100),    -- ad variant / A-B test
    utm_term VARCHAR(100),       -- search keywords (for paid search)
    
    -- Campaign Duration
    start_date DATE,
    end_date DATE,
    
    -- Budget & Spend Tracking
    budget DECIMAL(12,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    
    -- Goals
    target_signups INTEGER,
    target_conversions INTEGER,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment
COMMENT ON TABLE marketing_campaigns IS 'Marketing campaigns with UTM tracking and budget management';

-- =====================================================
-- 2. CAMPAIGN EXPENSES TABLE (for ROI calculation)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    
    -- Expense Details
    expense_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    category VARCHAR(50),        -- ad_spend, content_creation, influencer, other
    description TEXT,
    platform VARCHAR(50),        -- facebook, instagram, whatsapp, google
    
    -- Proof/Reference
    invoice_reference VARCHAR(100),
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE campaign_expenses IS 'Track marketing spend per campaign for ROI calculation';

-- =====================================================
-- 3. USER REFERRAL SOURCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_referral_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- UTM Parameters (captured on signup)
    utm_source VARCHAR(50),
    utm_medium VARCHAR(50),
    utm_campaign VARCHAR(100),
    utm_content VARCHAR(100),
    utm_term VARCHAR(100),
    
    -- Additional Context
    referrer_url TEXT,           -- document.referrer
    landing_page TEXT,           -- first page visited
    
    -- Link to Campaign (if matched)
    campaign_id UUID REFERENCES marketing_campaigns(id),
    
    -- Device/Context (from user_sessions if available)
    device_type VARCHAR(20),
    country VARCHAR(100),
    
    -- Conversion Tracking
    converted_to_paid BOOLEAN DEFAULT false,
    conversion_date TIMESTAMPTZ,
    conversion_value DECIMAL(12,2),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_referral_sources IS 'Track how users discovered the platform via UTM parameters';

-- =====================================================
-- 4. SOCIAL ACCOUNTS TABLE (Meta API connections)
-- =====================================================

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Platform Info
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'whatsapp')),
    account_name VARCHAR(100),
    account_id VARCHAR(100),     -- Platform's account/page ID
    
    -- OAuth Tokens (encrypted at application level)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    
    -- Account Details
    page_id VARCHAR(100),        -- Facebook Page ID
    instagram_account_id VARCHAR(100),
    whatsapp_business_id VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_status VARCHAR(20) DEFAULT 'pending',
    
    -- Metadata
    connected_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE social_accounts IS 'Connected social media accounts for publishing';

-- =====================================================
-- 5. SOCIAL POSTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Content
    title VARCHAR(200),
    content TEXT NOT NULL,
    media_urls TEXT[],           -- Array of image/video URLs
    link_url TEXT,               -- Link to include in post
    call_to_action VARCHAR(50),  -- LEARN_MORE, SIGN_UP, etc.
    
    -- Targeting
    platforms TEXT[] NOT NULL,   -- ['facebook', 'instagram']
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'deleted')),
    
    -- Campaign Association
    campaign_id UUID REFERENCES marketing_campaigns(id),
    
    -- Platform Response Data
    platform_post_ids JSONB,     -- { "facebook": "123", "instagram": "456" }
    error_message TEXT,
    
    -- Engagement Metrics (synced from platforms)
    engagement_data JSONB,       -- { "likes": 100, "shares": 20, "comments": 15 }
    reach INTEGER,
    impressions INTEGER,
    clicks INTEGER,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE social_posts IS 'Social media posts for Facebook, Instagram, WhatsApp';

-- =====================================================
-- 6. INDEXES FOR PERFORMANCE
-- =====================================================

-- Campaign indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON marketing_campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_utm ON marketing_campaigns(utm_source, utm_campaign);

-- Expense indexes
CREATE INDEX IF NOT EXISTS idx_expenses_campaign ON campaign_expenses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON campaign_expenses(expense_date);

-- Referral source indexes
CREATE INDEX IF NOT EXISTS idx_referral_user ON user_referral_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_campaign ON user_referral_sources(campaign_id);
CREATE INDEX IF NOT EXISTS idx_referral_utm ON user_referral_sources(utm_source, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_referral_created ON user_referral_sources(created_at DESC);

-- Social accounts indexes
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts(platform);

-- Social posts indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_campaign ON social_posts(campaign_id);

-- =====================================================
-- 7. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_referral_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Admin access to all marketing tables
CREATE POLICY marketing_campaigns_admin ON marketing_campaigns 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

CREATE POLICY campaign_expenses_admin ON campaign_expenses 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

CREATE POLICY user_referral_sources_admin ON user_referral_sources 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

CREATE POLICY social_accounts_admin ON social_accounts 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

CREATE POLICY social_posts_admin ON social_posts 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

-- Users can see their own referral source
CREATE POLICY user_referral_sources_user_read ON user_referral_sources 
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- 8. ANALYTICS VIEWS
-- =====================================================

-- Campaign ROI View
CREATE OR REPLACE VIEW campaign_roi_analytics AS
SELECT 
    c.id AS campaign_id,
    c.name AS campaign_name,
    c.utm_source,
    c.utm_campaign,
    c.status,
    c.budget,
    COALESCE(SUM(e.amount), 0) AS total_spent,
    COUNT(DISTINCT r.user_id) AS users_acquired,
    COUNT(DISTINCT CASE WHEN r.converted_to_paid THEN r.user_id END) AS conversions,
    COALESCE(SUM(r.conversion_value), 0) AS revenue,
    CASE 
        WHEN COALESCE(SUM(e.amount), 0) > 0 
        THEN ROUND(((COALESCE(SUM(r.conversion_value), 0) - COALESCE(SUM(e.amount), 0)) / COALESCE(SUM(e.amount), 0)) * 100, 2)
        ELSE 0 
    END AS roi_percentage,
    c.start_date,
    c.end_date
FROM marketing_campaigns c
LEFT JOIN campaign_expenses e ON e.campaign_id = c.id
LEFT JOIN user_referral_sources r ON r.campaign_id = c.id
GROUP BY c.id, c.name, c.utm_source, c.utm_campaign, c.status, c.budget, c.start_date, c.end_date;

-- Referral Source Summary View
CREATE OR REPLACE VIEW referral_source_summary AS
SELECT 
    utm_source,
    utm_medium,
    utm_campaign,
    COUNT(*) AS total_users,
    COUNT(CASE WHEN converted_to_paid THEN 1 END) AS paid_users,
    ROUND(COUNT(CASE WHEN converted_to_paid THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS conversion_rate,
    DATE(created_at) AS signup_date
FROM user_referral_sources
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY utm_source, utm_medium, utm_campaign, DATE(created_at)
ORDER BY signup_date DESC;

-- =====================================================
-- 9. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Marketing System Migration completed successfully!';
    RAISE NOTICE 'Created tables: marketing_campaigns, campaign_expenses, user_referral_sources, social_accounts, social_posts';
    RAISE NOTICE 'Created views: campaign_roi_analytics, referral_source_summary';
END $$;
