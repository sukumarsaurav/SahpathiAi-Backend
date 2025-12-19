import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';

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

        res.status(201).json({
            message: 'User created successfully',
            user: { id: authData.user.id, email },
            session: authData.session
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Failed to create user' });
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

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

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
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Fetch profile using admin client
        let { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('*, preferred_language:languages(*), target_exam:exams(*)')
            .eq('id', user.id)
            .single();

        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
            console.log('User profile not found in /me, creating one for:', user.email);
            const { data: newProfile } = await supabaseAdmin
                .from('users')
                .insert({
                    id: user.id,
                    email: user.email,
                    full_name: user.email?.split('@')[0] || 'User',
                })
                .select('*, preferred_language:languages(*), target_exam:exams(*)')
                .single();

            profile = newProfile;

            // Also create related records (ignore errors if already exist)
            try { await supabaseAdmin.from('user_stats').insert({ user_id: user.id }); } catch (e) { }
            try { await supabaseAdmin.from('user_preferences').insert({ user_id: user.id }); } catch (e) { }
            try { await supabaseAdmin.from('wallets').insert({ user_id: user.id, balance: 0 }); } catch (e) { }

            // Generate unique referral code for new user
            try {
                const prefix = (profile?.full_name?.substring(0, 3) || 'SAH').toUpperCase().replace(/[^A-Z]/g, 'X');
                const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
                const code = `${prefix}${randomPart}`;
                await supabaseAdmin.from('referral_codes').insert({
                    user_id: user.id,
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
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Get User-Agent and IP
        const userAgent = req.headers['user-agent'] || '';
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded
            ? (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0])
            : req.socket.remoteAddress || '';

        // Parse User-Agent for device info
        const deviceInfo = parseUserAgent(userAgent);

        // Generate unique session ID
        const sessionId = `${user.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
                user_id: user.id,
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

