-- Remove Supabase Auth Dependency Migration
-- This migration removes the foreign key constraint that links the users table
-- to Supabase's auth.users table, allowing fully custom authentication.
-- 
-- Run this in Supabase SQL Editor BEFORE using custom authentication.
-- Last updated: 2024-12-22

-- =====================================================
-- STEP 1: Drop the foreign key constraint to auth.users
-- =====================================================

-- Drop the FK constraint that links users.id to auth.users.id
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- =====================================================
-- STEP 2: Add authentication columns (if not already added)
-- =====================================================

-- Password hash for email/password authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Authentication provider (email, google, github)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email';

-- Email verification status
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Email verification token
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;

-- Password reset token
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

-- OAuth provider user ID
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255);

-- =====================================================
-- STEP 3: Create refresh tokens table for JWT auth
-- =====================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(token)
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- =====================================================
-- STEP 4: Add indexes for new columns
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);

-- =====================================================
-- VERIFICATION
-- =====================================================

-- After running this migration, verify by checking the constraint is removed:
-- SELECT constraint_name FROM information_schema.table_constraints 
-- WHERE table_name = 'users' AND constraint_type = 'FOREIGN KEY';
-- 
-- The users_id_fkey constraint should NOT appear in the results.
