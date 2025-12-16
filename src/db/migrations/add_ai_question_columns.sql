-- Migration: Add AI Question Generation Support
-- Run this in Supabase SQL Editor

-- =====================================================
-- 1. ADD COLUMNS TO QUESTIONS TABLE
-- =====================================================

-- Track if question was AI-generated
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;

-- Track if AI question has been manually verified
-- AI questions start as unverified (false), manual questions are always verified (true)
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT true;

-- Content hash for duplicate detection (SHA-256 of normalized question text)
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Index for filtering AI questions by status
CREATE INDEX IF NOT EXISTS idx_questions_ai_status 
ON questions(is_ai_generated, is_verified);

-- Index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_questions_content_hash 
ON questions(content_hash);

-- =====================================================
-- 2. ADMIN SETTINGS TABLE
-- =====================================================

-- Store admin configuration (API keys, settings)
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Enable RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can access settings
CREATE POLICY admin_settings_policy ON admin_settings 
FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- =====================================================
-- 3. UPDATE EXISTING QUESTIONS
-- =====================================================

-- Mark all existing questions as manually created and verified
UPDATE questions 
SET is_ai_generated = false, is_verified = true 
WHERE is_ai_generated IS NULL;

-- =====================================================
-- 4. HELPER FUNCTION FOR CONTENT HASH
-- =====================================================

-- Function to generate content hash for duplicate detection
CREATE OR REPLACE FUNCTION generate_question_hash(question_text TEXT)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normalize: lowercase, trim whitespace, remove extra spaces
  RETURN encode(
    sha256(
      regexp_replace(
        lower(trim(question_text)), 
        '\s+', ' ', 'g'
      )::bytea
    ), 
    'hex'
  );
END;
$$;
