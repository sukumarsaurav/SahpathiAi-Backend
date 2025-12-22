import { Router } from 'express';
import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../db/supabase';
import { emailService } from '../services/emailService';
import { generateTokenPair, verifyToken } from '../utils/jwt';
import { hashPassword, comparePassword, validatePassword } from '../utils/password';
import { passport, OAuthUser } from '../config/passport';

const router = Router();


/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', async (req, res) => {
    try {
        const {
            email,
            password,
            full_name,
            preferred_language_id,
            target_exam_id,
            referral_code,
            // UTM parameters for marketing attribution
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer_url,
            landing_page,
            // Visitor tracking for marketing funnel
            visitor_id
        } = req.body;

        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            return res.status(400).json({ error: 'Failed to create user' });
        }

        // Create user profile - use admin client to bypass RLS
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authData.user.id,
                email,
                full_name,
                preferred_language_id,
                target_exam_id,
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
        }

        // Create default user stats - use admin client
        await supabaseAdmin.from('user_stats').insert({ user_id: authData.user.id });

        // Create default preferences - use admin client
        await supabaseAdmin.from('user_preferences').insert({ user_id: authData.user.id });

        // Create wallet - use admin client
        await supabaseAdmin.from('wallets').insert({ user_id: authData.user.id, balance: 0 });

        // Generate referral code - use admin client
        const code = `${full_name?.substring(0, 4).toUpperCase() || 'USER'}${Date.now().toString().slice(-4)}`;
        await supabaseAdmin.from('referral_codes').insert({
            user_id: authData.user.id,
            code,
            referral_link: `https://sahpathi-ai.vercel.app/auth?ref=${code}`
        });

        // Apply referral code if provided - use admin client
        if (referral_code) {
            const { data: referrer } = await supabaseAdmin
                .from('referral_codes')
                .select('user_id')
                .eq('code', referral_code)
                .single();

            if (referrer) {
                await supabaseAdmin.from('referrals').insert({
                    referrer_id: referrer.user_id,
                    referred_id: authData.user.id,
                    status: 'pending',
                    reward_amount: 15.00
                });
            }
        }

        // Track marketing referral source if UTM params provided
        if (utm_source || utm_medium || utm_campaign) {
            try {
                // Find matching campaign if exists
                let campaignId = null;
                if (utm_campaign) {
                    const { data: campaign } = await supabaseAdmin
                        .from('marketing_campaigns')
                        .select('id')
                        .eq('utm_campaign', utm_campaign)
                        .single();
                    campaignId = campaign?.id;
                }

                await supabaseAdmin.from('user_referral_sources').insert({
                    user_id: authData.user.id,
                    utm_source,
                    utm_medium,
                    utm_campaign,
                    utm_content,
                    utm_term,
                    referrer_url,
                    landing_page,
                    campaign_id: campaignId
                });
            } catch (utmError) {
                console.error('Failed to track referral source:', utmError);
                // Non-critical, don't fail signup
            }
        }

        // Link anonymous visitor to user for marketing funnel tracking
        if (visitor_id) {
            try {
                await supabaseAdmin
                    .from('website_visitors')
                    .update({
                        user_id: authData.user.id,
                        converted_to_signup: true,
                        signup_date: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('visitor_id', visitor_id);
            } catch (visitorError) {
                console.error('Failed to link visitor:', visitorError);
                // Non-critical, don't fail signup
            }
        }

        // Send verification email (non-blocking)
        emailService.sendVerificationEmail(
            authData.user.id,
            email,
            full_name || 'User'
        ).catch(err => console.error('Failed to send verification email:', err));

        res.status(201).json({
            message: 'User created successfully. Please check your email to verify your account.',
            user: { id: authData.user.id, email, email_verified: false },
            session: authData.session
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * POST /api/auth/save-referral-source
 * Save UTM referral source after successful Supabase signup
 * This is called from the frontend after signup to attribute the user to a campaign
 */
router.post('/save-referral-source', async (req, res) => {
    try {
        const {
            user_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer_url,
            landing_page
        } = req.body;

        if (!user_id) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        // Only save if there's actual UTM data
        if (!utm_source && !utm_campaign) {
            return res.json({ success: true, skipped: true, reason: 'No UTM data' });
        }

        // Find matching campaign if exists
        let campaignId = null;
        if (utm_campaign) {
            const { data: campaign } = await supabaseAdmin
                .from('marketing_campaigns')
                .select('id')
                .eq('utm_campaign', utm_campaign)
                .single();
            campaignId = campaign?.id;
        }

        // Check if referral source already exists for this user
        const { data: existing } = await supabaseAdmin
            .from('user_referral_sources')
            .select('id')
            .eq('user_id', user_id)
            .single();

        if (existing) {
            // Already has a referral source, skip
            return res.json({ success: true, skipped: true, reason: 'Already exists' });
        }

        // Save the referral source
        const { error } = await supabaseAdmin.from('user_referral_sources').insert({
            user_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer_url,
            landing_page,
            campaign_id: campaignId
        });

        if (error) {
            console.error('Error saving referral source:', error);
            return res.json({ success: false, error: error.message });
        }

        res.json({ success: true, campaign_id: campaignId });
    } catch (error) {
        console.error('Save referral source error:', error);
        // Non-critical, return success anyway
        res.json({ success: false, error: 'Internal error' });
    }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return res.status(401).json({ error: error.message });
        }

        // Fetch user profile using admin client
        let { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('*, preferred_language:languages(*), target_exam:exams(*)')
            .eq('id', data.user.id)
            .single();

        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
            console.log('User profile not found, creating one for:', data.user.email);
            const { data: newProfile, error: insertError } = await supabaseAdmin
                .from('users')
                .insert({
                    id: data.user.id,
                    email: data.user.email,
                    full_name: data.user.email?.split('@')[0] || 'User',
                })
                .select('*, preferred_language:languages(*), target_exam:exams(*)')
                .single();

            if (insertError) {
                console.error('Error creating user profile:', insertError);
            } else {
                profile = newProfile;

                // Also create related records (ignore errors if already exist)
                try { await supabaseAdmin.from('user_stats').insert({ user_id: data.user.id }); } catch (e) { }
                try { await supabaseAdmin.from('user_preferences').insert({ user_id: data.user.id }); } catch (e) { }
                try { await supabaseAdmin.from('wallets').insert({ user_id: data.user.id, balance: 0 }); } catch (e) { }

                // Generate unique referral code for new user
                try {
                    const prefix = (profile?.full_name?.substring(0, 3) || 'SAH').toUpperCase().replace(/[^A-Z]/g, 'X');
                    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
                    const code = `${prefix}${randomPart}`;
                    await supabaseAdmin.from('referral_codes').insert({
                        user_id: data.user.id,
                        code,
                        referral_link: `https://sahpathi-ai.vercel.app/auth?ref=${code}`
                    });
                } catch (e) { console.log('Referral code may already exist'); }
            }
        }

        res.json({
            user: profile,
            session: data.session
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ===================================
// V2 AUTH ENDPOINTS (Custom JWT - No Supabase Auth)
// ===================================

/**
 * POST /api/auth/v2/signup
 * Register a new user with custom auth (bcrypt + JWT)
 * This is the new signup endpoint that doesn't use Supabase Auth
 */
router.post('/v2/signup', async (req, res) => {
    try {
        const {
            email,
            password,
            full_name,
            preferred_language_id,
            target_exam_id,
            referral_code,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer_url,
            landing_page,
            visitor_id
        } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        // Check if email already exists
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        // Generate user ID and hash password
        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(password);

        // Create user profile with password hash
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: userId,
                email: email.toLowerCase(),
                full_name,
                password_hash: passwordHash,
                auth_provider: 'email',
                preferred_language_id,
                target_exam_id,
                email_verified: false
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            return res.status(500).json({ error: 'Failed to create user' });
        }

        // Create default user stats
        await supabaseAdmin.from('user_stats').insert({ user_id: userId });

        // Create default preferences
        await supabaseAdmin.from('user_preferences').insert({ user_id: userId });

        // Create wallet
        await supabaseAdmin.from('wallets').insert({ user_id: userId, balance: 0 });

        // Generate referral code
        const code = `${full_name?.substring(0, 4).toUpperCase() || 'USER'}${Date.now().toString().slice(-4)}`;
        await supabaseAdmin.from('referral_codes').insert({
            user_id: userId,
            code,
            referral_link: `https://sahpathi-ai.vercel.app/auth?ref=${code}`
        });

        // Apply referral code if provided
        if (referral_code) {
            const { data: referrer } = await supabaseAdmin
                .from('referral_codes')
                .select('user_id')
                .eq('code', referral_code)
                .single();

            if (referrer) {
                await supabaseAdmin.from('referrals').insert({
                    referrer_id: referrer.user_id,
                    referred_id: userId,
                    status: 'pending',
                    reward_amount: 15.00
                });
            }
        }

        // Track marketing referral source if UTM params provided
        if (utm_source || utm_medium || utm_campaign) {
            try {
                let campaignId = null;
                if (utm_campaign) {
                    const { data: campaign } = await supabaseAdmin
                        .from('marketing_campaigns')
                        .select('id')
                        .eq('utm_campaign', utm_campaign)
                        .single();
                    campaignId = campaign?.id;
                }

                await supabaseAdmin.from('user_referral_sources').insert({
                    user_id: userId,
                    utm_source,
                    utm_medium,
                    utm_campaign,
                    utm_content,
                    utm_term,
                    referrer_url,
                    landing_page,
                    campaign_id: campaignId
                });
            } catch (utmError) {
                console.error('Failed to track referral source:', utmError);
            }
        }

        // Link anonymous visitor
        if (visitor_id) {
            try {
                await supabaseAdmin
                    .from('website_visitors')
                    .update({
                        user_id: userId,
                        converted_to_signup: true,
                        signup_date: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('visitor_id', visitor_id);
            } catch (visitorError) {
                console.error('Failed to link visitor:', visitorError);
            }
        }

        // Generate JWT tokens
        const tokens = generateTokenPair(userId, email.toLowerCase());

        // Store refresh token
        const refreshExpiresAt = new Date();
        refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

        await supabaseAdmin.from('refresh_tokens').insert({
            user_id: userId,
            token: tokens.refreshToken,
            expires_at: refreshExpiresAt.toISOString()
        });

        // Send verification email (non-blocking)
        emailService.sendVerificationEmail(
            userId,
            email,
            full_name || 'User'
        ).catch(err => console.error('Failed to send verification email:', err));

        res.status(201).json({
            message: 'User created successfully. Please check your email to verify your account.',
            user: { id: userId, email: email.toLowerCase(), email_verified: false },
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('V2 Signup error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * POST /api/auth/v2/login
 * Login user with custom auth (bcrypt + JWT)
 */
router.post('/v2/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Fetch user with password hash
        const { data: user, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('*, target_exam:exams(*)')
            .eq('email', email.toLowerCase())
            .single();

        if (fetchError || !user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if user has a password (might be OAuth user)
        if (!user.password_hash) {
            // Check auth provider
            if (user.auth_provider === 'google') {
                return res.status(401).json({ error: 'This account uses Google sign-in. Please use the Google login button.' });
            }
            if (user.auth_provider === 'github') {
                return res.status(401).json({ error: 'This account uses GitHub sign-in. Please use the GitHub login button.' });
            }
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Verify password
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT tokens
        const tokens = generateTokenPair(user.id, user.email);

        // Store refresh token
        const refreshExpiresAt = new Date();
        refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

        await supabaseAdmin.from('refresh_tokens').insert({
            user_id: user.id,
            token: tokens.refreshToken,
            expires_at: refreshExpiresAt.toISOString()
        });

        // Remove password_hash from response
        const { password_hash, ...userWithoutPassword } = user;

        res.json({
            user: userWithoutPassword,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('V2 Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/v2/refresh
 * Refresh access token using refresh token
 */
router.post('/v2/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        // Verify refresh token
        const payload = verifyToken(refreshToken);
        if (!payload || payload.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        // Check if token exists in database and is not revoked
        const { data: storedToken, error } = await supabaseAdmin
            .from('refresh_tokens')
            .select('*')
            .eq('token', refreshToken)
            .is('revoked_at', null)
            .single();

        if (error || !storedToken) {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }

        // Check if expired
        if (new Date(storedToken.expires_at) < new Date()) {
            return res.status(401).json({ error: 'Refresh token has expired' });
        }

        // Generate new token pair
        const tokens = generateTokenPair(payload.userId, payload.email);

        // Revoke old refresh token
        await supabaseAdmin
            .from('refresh_tokens')
            .update({ revoked_at: new Date().toISOString() })
            .eq('token', refreshToken);

        // Store new refresh token
        const refreshExpiresAt = new Date();
        refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

        await supabaseAdmin.from('refresh_tokens').insert({
            user_id: payload.userId,
            token: tokens.refreshToken,
            expires_at: refreshExpiresAt.toISOString()
        });

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

/**
 * POST /api/auth/v2/logout
 * Logout user by revoking refresh token
 */
router.post('/v2/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            // Revoke the refresh token
            await supabaseAdmin
                .from('refresh_tokens')
                .update({ revoked_at: new Date().toISOString() })
                .eq('token', refreshToken);
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// ===================================
// V2 OAUTH ENDPOINTS (Backend OAuth - No Supabase)
// ===================================

/**
 * GET /api/auth/v2/google
 * Initiate Google OAuth flow
 */
router.get('/v2/google', (req, res, next) => {
    // Store return URL if provided
    const returnUrl = req.query.returnUrl as string;
    if (returnUrl) {
        res.cookie('oauth_return_url', returnUrl, { maxAge: 5 * 60 * 1000, httpOnly: true });
    }
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

/**
 * GET /api/auth/v2/google/callback
 * Handle Google OAuth callback
 */
router.get('/v2/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/auth?error=google_failed' }),
    async (req, res) => {
        try {
            const user = req.user as OAuthUser;
            if (!user) {
                return res.redirect(`${process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app'}/auth?error=no_user`);
            }

            // Generate JWT tokens
            const tokens = generateTokenPair(user.id, user.email);

            // Store refresh token
            const refreshExpiresAt = new Date();
            refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

            await supabaseAdmin.from('refresh_tokens').insert({
                user_id: user.id,
                token: tokens.refreshToken,
                expires_at: refreshExpiresAt.toISOString()
            });

            // Redirect to frontend with tokens
            const frontendUrl = process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app';
            const redirectPath = user.isNewUser ? '/onboarding' : '/dashboard';
            res.redirect(`${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}&redirect=${redirectPath}`);
        } catch (error) {
            console.error('Google OAuth callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app'}/auth?error=oauth_failed`);
        }
    }
);

/**
 * GET /api/auth/v2/github
 * Initiate GitHub OAuth flow
 */
router.get('/v2/github', (req, res, next) => {
    const returnUrl = req.query.returnUrl as string;
    if (returnUrl) {
        res.cookie('oauth_return_url', returnUrl, { maxAge: 5 * 60 * 1000, httpOnly: true });
    }
    passport.authenticate('github', { scope: ['user:email'], session: false })(req, res, next);
});

/**
 * GET /api/auth/v2/github/callback
 * Handle GitHub OAuth callback
 */
router.get('/v2/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: '/auth?error=github_failed' }),
    async (req, res) => {
        try {
            const user = req.user as OAuthUser;
            if (!user) {
                return res.redirect(`${process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app'}/auth?error=no_user`);
            }

            // Generate JWT tokens
            const tokens = generateTokenPair(user.id, user.email);

            // Store refresh token
            const refreshExpiresAt = new Date();
            refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

            await supabaseAdmin.from('refresh_tokens').insert({
                user_id: user.id,
                token: tokens.refreshToken,
                expires_at: refreshExpiresAt.toISOString()
            });

            // Redirect to frontend with tokens
            const frontendUrl = process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app';
            const redirectPath = user.isNewUser ? '/onboarding' : '/dashboard';
            res.redirect(`${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}&redirect=${redirectPath}`);
        } catch (error) {
            console.error('GitHub OAuth callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app'}/auth?error=oauth_failed`);
        }
    }
);

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', async (req, res) => {

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.substring(7);

        // Verify custom JWT token
        const jwtPayload = verifyToken(token);
        if (!jwtPayload || jwtPayload.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const userId = jwtPayload.userId;
        const userEmail = jwtPayload.email;

        // Fetch profile using admin client
        let { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('*, preferred_language:languages(*), target_exam:exams(*)')
            .eq('id', userId)
            .single();

        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
            console.log('User profile not found in /me, creating one for:', userEmail);
            const { data: newProfile } = await supabaseAdmin
                .from('users')
                .insert({
                    id: userId,
                    email: userEmail,
                    full_name: userEmail?.split('@')[0] || 'User',
                })
                .select('*, preferred_language:languages(*), target_exam:exams(*)')
                .single();

            profile = newProfile;

            // Also create related records (ignore errors if already exist)
            try { await supabaseAdmin.from('user_stats').insert({ user_id: userId }); } catch (e) { }
            try { await supabaseAdmin.from('user_preferences').insert({ user_id: userId }); } catch (e) { }
            try { await supabaseAdmin.from('wallets').insert({ user_id: userId, balance: 0 }); } catch (e) { }

            // Generate unique referral code for new user
            try {
                const prefix = (profile?.full_name?.substring(0, 3) || 'SAH').toUpperCase().replace(/[^A-Z]/g, 'X');
                const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
                const code = `${prefix}${randomPart}`;
                await supabaseAdmin.from('referral_codes').insert({
                    user_id: userId,
                    code,
                    referral_link: `https://sahpathi-ai.vercel.app/auth?ref=${code}`
                });
            } catch (e) { console.log('Referral code may already exist'); }
        }

        res.json(profile);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * POST /api/auth/track-session
 * Track user session with device and location info
 * Called from frontend after successful login/app load
 */
router.post('/track-session', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.substring(7);

        // Verify custom JWT token
        const jwtPayload = verifyToken(token);
        if (!jwtPayload || jwtPayload.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const userId = jwtPayload.userId;

        // Get User-Agent and IP
        const userAgent = req.headers['user-agent'] || '';
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded
            ? (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0])
            : req.socket.remoteAddress || '';

        // Parse User-Agent for device info
        const deviceInfo = parseUserAgent(userAgent);

        // Generate unique session ID
        const sessionId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Get geolocation from IP (using ip-api.com - free, no API key needed)
        let geoData: {
            country: string | null;
            countryCode: string | null;
            region: string | null;
            city: string | null;
            timezone: string | null;
        } = {
            country: null,
            countryCode: null,
            region: null,
            city: null,
            timezone: null
        };

        // Only fetch geo data if we have a valid public IP (not localhost)
        if (ip && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.') && ip !== '::1') {
            try {
                const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone`);
                if (geoResponse.ok) {
                    const geo = await geoResponse.json() as {
                        status: string;
                        country?: string;
                        countryCode?: string;
                        regionName?: string;
                        city?: string;
                        timezone?: string;
                    };
                    if (geo.status === 'success') {
                        geoData = {
                            country: geo.country || null,
                            countryCode: geo.countryCode || null,
                            region: geo.regionName || null,
                            city: geo.city || null,
                            timezone: geo.timezone || null
                        };
                    }
                }
            } catch (geoError) {
                console.log('Geolocation fetch failed (non-critical):', geoError);
            }
        }

        // Insert session record
        const { error: insertError } = await supabaseAdmin
            .from('user_sessions')
            .insert({
                user_id: userId,
                session_id: sessionId,
                device_type: deviceInfo.deviceType,
                os: deviceInfo.os,
                os_version: deviceInfo.osVersion,
                browser: deviceInfo.browser,
                browser_version: deviceInfo.browserVersion,
                ip_address: ip || null,
                country: geoData.country,
                country_code: geoData.countryCode,
                region: geoData.region,
                city: geoData.city,
                timezone: geoData.timezone,
                user_agent: userAgent,
                is_mobile: deviceInfo.isMobile
            });

        if (insertError) {
            console.error('Session tracking insert error:', insertError);
            // Don't fail the request - session tracking is non-critical
        }

        res.json({ success: true, sessionId });
    } catch (error) {
        console.error('Track session error:', error);
        // Return success anyway - don't break user experience for analytics
        res.json({ success: false, error: 'Failed to track session' });
    }
});

// ===================================
// EMAIL VERIFICATION & PASSWORD RESET
// ===================================

/**
 * POST /api/auth/send-verification
 * Send/resend verification email
 */
router.post('/send-verification', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.substring(7);

        // Verify custom JWT token
        const jwtPayload = verifyToken(token);
        if (!jwtPayload || jwtPayload.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const userId = jwtPayload.userId;
        const userEmail = jwtPayload.email;

        // Get user profile
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('full_name, email_verified')
            .eq('id', userId)
            .single();

        if (profile?.email_verified) {
            return res.json({ success: true, message: 'Email already verified' });
        }

        // Send verification email
        const result = await emailService.sendVerificationEmail(
            userId,
            userEmail,
            profile?.full_name || 'User'
        );

        if (result.success) {
            res.json({ success: true, message: 'Verification email sent' });
        } else {
            res.status(500).json({ error: result.error || 'Failed to send verification email' });
        }
    } catch (error) {
        console.error('Send verification error:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

/**
 * POST /api/auth/verify-email
 * Verify email with token
 */
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        // Verify token
        const tokenResult = await emailService.verifyToken(token, 'verification');

        if (!tokenResult.valid) {
            return res.status(400).json({ error: tokenResult.error });
        }

        // Update user as verified
        await supabaseAdmin
            .from('users')
            .update({
                email_verified: true,
                email_verified_at: new Date().toISOString()
            })
            .eq('id', tokenResult.userId);

        // Mark token as used
        await emailService.markTokenUsed(token);

        // Send welcome email
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('full_name')
            .eq('id', tokenResult.userId)
            .single();

        await emailService.sendWelcomeEmail(
            tokenResult.email!,
            profile?.full_name || 'User'
        );

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email (custom)
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Send reset email (service handles user lookup)
        await emailService.sendPasswordResetEmail(email);

        // Always return success to prevent email enumeration
        res.json({ success: true, message: 'If an account exists, a reset email has been sent' });
    } catch (error) {
        console.error('Forgot password error:', error);
        // Still return success to prevent enumeration
        res.json({ success: true, message: 'If an account exists, a reset email has been sent' });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }

        // Validate password
        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        // Verify token
        const tokenResult = await emailService.verifyToken(token, 'password_reset');

        if (!tokenResult.valid) {
            return res.status(400).json({ error: tokenResult.error });
        }

        // Hash and update password in users table (custom auth)
        const passwordHash = await hashPassword(password);
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                password_hash: passwordHash,
                auth_provider: 'email', // Ensure auth provider is set
                updated_at: new Date().toISOString()
            })
            .eq('id', tokenResult.userId);

        if (updateError) {
            console.error('Password update error:', updateError);
            return res.status(500).json({ error: 'Failed to update password' });
        }

        // Mark token as used
        await emailService.markTokenUsed(token);

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

/**
 * GET /api/auth/verify-token
 * Check if a token is valid (for frontend validation)
 */
router.get('/verify-token', async (req, res) => {
    try {
        const { token, type } = req.query;

        if (!token || !type) {
            return res.status(400).json({ valid: false, error: 'Token and type are required' });
        }

        const tokenType = type as 'verification' | 'password_reset';
        const result = await emailService.verifyToken(token as string, tokenType);

        res.json(result);
    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({ valid: false, error: 'Failed to verify token' });
    }
});

/**
 * Parse User-Agent string to extract device, OS, and browser info
 */
function parseUserAgent(ua: string): {
    deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    os: string;
    osVersion: string;
    browser: string;
    browserVersion: string;
    isMobile: boolean;
} {
    const result = {
        deviceType: 'unknown' as 'mobile' | 'tablet' | 'desktop' | 'unknown',
        os: 'Unknown',
        osVersion: '',
        browser: 'Unknown',
        browserVersion: '',
        isMobile: false
    };

    // Detect device type
    if (/iPad|tablet|Tablet/i.test(ua)) {
        result.deviceType = 'tablet';
    } else if (/Mobile|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
        result.deviceType = 'mobile';
        result.isMobile = true;
    } else if (ua) {
        result.deviceType = 'desktop';
    }

    // Detect OS
    if (/Windows NT 10/i.test(ua)) {
        result.os = 'Windows';
        result.osVersion = ua.includes('Windows NT 10.0') ? '10/11' : '10';
    } else if (/Windows NT/i.test(ua)) {
        result.os = 'Windows';
        const match = ua.match(/Windows NT (\d+\.\d+)/);
        result.osVersion = match ? match[1] : '';
    } else if (/Mac OS X/i.test(ua)) {
        result.os = 'macOS';
        const match = ua.match(/Mac OS X (\d+[._]\d+)/);
        result.osVersion = match ? match[1].replace('_', '.') : '';
    } else if (/iPhone OS|iPad.*OS/i.test(ua)) {
        result.os = 'iOS';
        const match = ua.match(/(?:iPhone|iPad).*OS (\d+_\d+)/);
        result.osVersion = match ? match[1].replace('_', '.') : '';
    } else if (/Android/i.test(ua)) {
        result.os = 'Android';
        const match = ua.match(/Android (\d+(\.\d+)?)/);
        result.osVersion = match ? match[1] : '';
    } else if (/Linux/i.test(ua)) {
        result.os = 'Linux';
    } else if (/CrOS/i.test(ua)) {
        result.os = 'ChromeOS';
    }

    // Detect browser
    if (/Edg\//i.test(ua)) {
        result.browser = 'Edge';
        const match = ua.match(/Edg\/(\d+(\.\d+)?)/);
        result.browserVersion = match ? match[1] : '';
    } else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) {
        result.browser = 'Chrome';
        const match = ua.match(/Chrome\/(\d+(\.\d+)?)/);
        result.browserVersion = match ? match[1] : '';
    } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
        result.browser = 'Safari';
        const match = ua.match(/Version\/(\d+(\.\d+)?)/);
        result.browserVersion = match ? match[1] : '';
    } else if (/Firefox/i.test(ua)) {
        result.browser = 'Firefox';
        const match = ua.match(/Firefox\/(\d+(\.\d+)?)/);
        result.browserVersion = match ? match[1] : '';
    } else if (/Opera|OPR/i.test(ua)) {
        result.browser = 'Opera';
        const match = ua.match(/(?:Opera|OPR)\/(\d+(\.\d+)?)/);
        result.browserVersion = match ? match[1] : '';
    }

    return result;
}

export default router;

