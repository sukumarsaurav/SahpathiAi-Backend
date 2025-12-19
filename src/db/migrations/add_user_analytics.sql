-- Migration: Add User Analytics (Device & Location Tracking)
-- Date: 2024-12-19
-- Description: Adds user_sessions table to track device type, browser, OS, and location

-- =====================================================
-- 1. CREATE USER_SESSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    -- Session identifier (can be used to correlate multiple events in same session)
    session_id VARCHAR(64) NOT NULL,
    
    -- Device Information (parsed from User-Agent)
    device_type VARCHAR(20) CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown')),
    os VARCHAR(50),           -- Windows 11, macOS 14, iOS 17, Android 14, etc.
    os_version VARCHAR(20),   -- Version number
    browser VARCHAR(50),      -- Chrome, Safari, Firefox, Edge, etc.
    browser_version VARCHAR(20),
    
    -- Location Information (from IP geolocation)
    ip_address INET,
    country VARCHAR(100),
    country_code VARCHAR(2),  -- ISO 3166-1 alpha-2
    region VARCHAR(100),      -- State/Province
    city VARCHAR(100),
    timezone VARCHAR(50),
    
    -- Additional metadata
    user_agent TEXT,          -- Store full User-Agent for reference
    is_mobile BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE user_sessions IS 'Tracks user session information including device type, browser, OS, and geolocation for analytics';

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- Index for date-based analytics
CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON user_sessions(created_at DESC);

-- Index for device type analytics
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_type ON user_sessions(device_type);

-- Index for country analytics
CREATE INDEX IF NOT EXISTS idx_user_sessions_country ON user_sessions(country_code);

-- Composite index for date + device analytics
CREATE INDEX IF NOT EXISTS idx_user_sessions_date_device ON user_sessions(created_at, device_type);

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions (for "active sessions" feature if needed)
CREATE POLICY user_sessions_user_read ON user_sessions 
    FOR SELECT USING (auth.uid() = user_id);

-- Admin can view all sessions for analytics
CREATE POLICY user_sessions_admin_all ON user_sessions 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

-- Allow insert from service role (backend server)
-- Note: The backend uses supabaseAdmin which bypasses RLS, so this is for safety

-- =====================================================
-- 4. CREATE AGGREGATE VIEW FOR ANALYTICS
-- =====================================================

CREATE OR REPLACE VIEW user_session_analytics AS
SELECT 
    DATE(created_at) AS session_date,
    device_type,
    os,
    browser,
    country_code,
    country,
    city,
    COUNT(*) AS session_count,
    COUNT(DISTINCT user_id) AS unique_users
FROM user_sessions
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY 
    DATE(created_at), 
    device_type, 
    os, 
    browser, 
    country_code,
    country,
    city
ORDER BY session_date DESC;

-- =====================================================
-- 5. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ User Analytics Migration completed successfully!';
    RAISE NOTICE 'Created table: user_sessions';
    RAISE NOTICE 'Created indexes for efficient querying';
    RAISE NOTICE 'Created RLS policies for security';
    RAISE NOTICE 'Created view: user_session_analytics';
END $$;
