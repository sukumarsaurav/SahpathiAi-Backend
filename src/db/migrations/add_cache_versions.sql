-- Migration: Add cache_versions table for client cache invalidation
-- This table stores version strings that clients check to invalidate stale caches

CREATE TABLE IF NOT EXISTS cache_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_hierarchy_version VARCHAR(20) DEFAULT '1.0',
    questions_version VARCHAR(20) DEFAULT '1.0',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO cache_versions (exam_hierarchy_version, questions_version)
SELECT '1.0', '1.0'
WHERE NOT EXISTS (SELECT 1 FROM cache_versions);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cache_version_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-update
DROP TRIGGER IF EXISTS cache_versions_updated_at ON cache_versions;
CREATE TRIGGER cache_versions_updated_at
    BEFORE UPDATE ON cache_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_cache_version_timestamp();

-- Grant access (adjust based on your RLS policy)
ALTER TABLE cache_versions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read cache versions (public endpoint)
CREATE POLICY "Anyone can read cache versions"
    ON cache_versions FOR SELECT
    USING (true);

-- Only service role can update
CREATE POLICY "Only service role can update cache versions"
    ON cache_versions FOR UPDATE
    USING (auth.role() = 'service_role');
