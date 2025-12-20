-- Migration: Add Email System Tables
-- Date: 2024-12-20
-- Description: Custom email system for branded emails, templates, and tracking

-- =====================================================
-- 1. EMAIL TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_templates IS 'Custom email templates for verification, password reset, etc.';
COMMENT ON COLUMN email_templates.name IS 'Template identifier: verification, password_reset, welcome';
COMMENT ON COLUMN email_templates.variables IS 'List of available template variables like {{name}}, {{link}}';

-- =====================================================
-- 2. EMAIL VERIFICATION TOKENS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('verification', 'password_reset')),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_verification_tokens IS 'Tokens for email verification and password reset';

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_expires ON email_verification_tokens(expires_at);

-- =====================================================
-- 3. EMAIL LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_email VARCHAR(255) NOT NULL,
    template_name VARCHAR(100),
    subject VARCHAR(255),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed')),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('resend', 'smtp')),
    provider_message_id VARCHAR(255),
    utm_source VARCHAR(100),
    utm_campaign VARCHAR(100),
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_logs IS 'Log of all sent emails for analytics and debugging';

-- Indexes for log querying
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent ON email_logs(sent_at DESC);

-- =====================================================
-- 4. EMAIL SETTINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS email_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend', 'smtp')),
    from_email VARCHAR(255) NOT NULL DEFAULT 'onboarding@resend.dev',
    from_name VARCHAR(100) DEFAULT 'SahpathiAi',
    reply_to VARCHAR(255) DEFAULT 'faq@shirash.com',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure only one active settings row
    CONSTRAINT single_active_settings UNIQUE (is_active) 
);

COMMENT ON TABLE email_settings IS 'Email provider configuration - admin-configurable';

-- =====================================================
-- 5. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only access for templates, logs, and settings
CREATE POLICY email_templates_admin ON email_templates 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

CREATE POLICY email_logs_admin ON email_logs 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

CREATE POLICY email_settings_admin ON email_settings 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

-- Users can see their own verification tokens
CREATE POLICY email_tokens_user ON email_verification_tokens 
    FOR SELECT USING (user_id = auth.uid());

-- Admin can manage all tokens
CREATE POLICY email_tokens_admin ON email_verification_tokens 
    FOR ALL USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
    );

-- =====================================================
-- 6. DEFAULT EMAIL TEMPLATES
-- =====================================================

INSERT INTO email_templates (name, subject, html_content, variables) VALUES
(
    'verification',
    'Verify your email for SahpathiAi',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f4f4f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">SahpathiAi</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your AI Learning Companion</p>
            </td>
        </tr>
        <tr>
            <td style="background: white; padding: 40px 32px; border-radius: 0 0 16px 16px;">
                <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px;">Welcome, {{name}}! 🎉</h2>
                <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                    Thanks for signing up for SahpathiAi! Please verify your email address to get started with your personalized learning journey.
                </p>
                <a href="{{verification_link}}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Verify Email Address
                </a>
                <p style="color: #a1a1aa; font-size: 14px; margin: 32px 0 0 0;">
                    This link expires in 24 hours. If you didn''t create an account, you can safely ignore this email.
                </p>
            </td>
        </tr>
        <tr>
            <td style="text-align: center; padding: 24px;">
                <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                    © 2024 SahpathiAi. All rights reserved.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>',
    '["name", "email", "verification_link"]'::jsonb
),
(
    'password_reset',
    'Reset your SahpathiAi password',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f4f4f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">SahpathiAi</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your AI Learning Companion</p>
            </td>
        </tr>
        <tr>
            <td style="background: white; padding: 40px 32px; border-radius: 0 0 16px 16px;">
                <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px;">Password Reset Request 🔐</h2>
                <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                    We received a request to reset your password. Click the button below to create a new password.
                </p>
                <a href="{{reset_link}}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Reset Password
                </a>
                <p style="color: #a1a1aa; font-size: 14px; margin: 32px 0 0 0;">
                    This link expires in 1 hour. If you didn''t request a password reset, you can safely ignore this email.
                </p>
            </td>
        </tr>
        <tr>
            <td style="text-align: center; padding: 24px;">
                <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                    © 2024 SahpathiAi. All rights reserved.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>',
    '["email", "reset_link"]'::jsonb
),
(
    'welcome',
    'Welcome to SahpathiAi! 🎓',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to SahpathiAi</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f4f4f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">SahpathiAi</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your AI Learning Companion</p>
            </td>
        </tr>
        <tr>
            <td style="background: white; padding: 40px 32px; border-radius: 0 0 16px 16px;">
                <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px;">You''re all set, {{name}}! 🚀</h2>
                <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                    Your email has been verified and your account is ready. Start your personalized learning journey today!
                </p>
                <a href="{{app_link}}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Start Learning
                </a>
                <p style="color: #52525b; font-size: 14px; margin: 32px 0 0 0; line-height: 1.6;">
                    <strong>What''s next?</strong><br>
                    ✅ Set your target exam<br>
                    ✅ Take a diagnostic test<br>
                    ✅ Get personalized practice
                </p>
            </td>
        </tr>
        <tr>
            <td style="text-align: center; padding: 24px;">
                <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                    © 2024 SahpathiAi. All rights reserved.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>',
    '["name", "app_link"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 7. DEFAULT EMAIL SETTINGS
-- =====================================================

INSERT INTO email_settings (provider, from_email, from_name, reply_to, is_active)
VALUES ('resend', 'onboarding@resend.dev', 'SahpathiAi', 'faq@shirash.com', true)
ON CONFLICT ON CONSTRAINT single_active_settings DO NOTHING;

-- =====================================================
-- 8. ADD email_verified TO USERS TABLE
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- =====================================================
-- 9. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Email System Migration completed successfully!';
    RAISE NOTICE 'Created tables: email_templates, email_verification_tokens, email_logs, email_settings';
    RAISE NOTICE 'Added default templates: verification, password_reset, welcome';
END $$;
