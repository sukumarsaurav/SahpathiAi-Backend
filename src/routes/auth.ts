import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';

const router = Router();

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', async (req, res) => {
    try {
        const { email, password, full_name, preferred_language_id, target_exam_id, referral_code } = req.body;

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

export default router;
