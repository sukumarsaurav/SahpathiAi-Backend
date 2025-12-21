-- Add password_hash and auth_provider columns to users table
-- for custom authentication (moving away from Supabase Auth)

-- Run this migration on your Supabase database:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Copy and paste this SQL
-- 3. Run the query

-- Add password_hash column for users who sign up with email/password
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add auth_provider column to track how user signed up
-- Values: 'email', 'google', 'github'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email';

-- Add email_verified column if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Add email_verified_at column if not exists  
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Create index for faster email lookups during auth
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create refresh tokens table for session management
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Optional: Clean up expired tokens periodically
-- You can run this manually or set up a cron job
-- DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL;

COMMENT ON COLUMN users.password_hash IS 'bcrypt hashed password for email/password signups';
COMMENT ON COLUMN users.auth_provider IS 'Authentication provider: email, google, or github';
