import { Router } from 'express';
import { getAuthenticatedClient, supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

// Helper to extract token
const getToken = (req: any) => req.headers.authorization?.split(' ')[1] || '';

/**
 * GET /api/user/profile
 * Get user profile
 */
router.get('/profile', authenticate, async (req, res) => {
    try {
        console.log('Profile Request - User ID:', req.user?.id);

        // Use admin client to bypass RLS - user is already authenticated via middleware
        let { data, error } = await supabaseAdmin
            .from('users')
            .select('*, target_exam:exams(*)')
            .eq('id', req.user!.id)
            .single();

        // If profile doesn't exist, create it
        if (error && error.code === 'PGRST116') {
            console.log('User profile not found, creating one for user:', req.user?.id);

            const { data: newProfile, error: insertError } = await supabaseAdmin
                .from('users')
                .insert({
                    id: req.user!.id,
                    email: req.user!.email || '',
                    full_name: req.user!.email?.split('@')[0] || 'User',
                })
                .select('*, target_exam:exams(*)')
                .single();

            if (insertError) {
                console.error('Error creating user profile:', insertError);
                throw insertError;
            }

            data = newProfile;

            // Also create related records (ignore errors if already exist)
            try { await supabaseAdmin.from('user_stats').insert({ user_id: req.user!.id }); } catch (e) { }
            try { await supabaseAdmin.from('user_preferences').insert({ user_id: req.user!.id }); } catch (e) { }
            try { await supabaseAdmin.from('wallets').insert({ user_id: req.user!.id, balance: 0 }); } catch (e) { }
        } else if (error) {
            console.error('Supabase Profile Error:', error);
            throw error;
        }

        // Fetch language preference from user_preferences table
        const { data: prefs } = await supabaseAdmin
            .from('user_preferences')
            .select('*, preferred_language:languages(*)')
            .eq('user_id', req.user!.id)
            .single();

        // Merge language preference into profile response
        const profileWithLanguage = {
            ...data,
            preferred_language: prefs?.preferred_language || null,
            preferred_language_id: prefs?.preferred_language_id || null
        };

        res.json(profileWithLanguage);
    } catch (error) {
        console.error('Get profile error details:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

/**
 * PUT /api/user/profile
 * Update user profile
 */
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { full_name, phone, username, bio, date_of_birth, location } = req.body;
        const supabase = getAuthenticatedClient(getToken(req));

        const { data, error } = await supabase
            .from('users')
            .update({
                full_name,
                phone,
                username,
                bio,
                date_of_birth,
                location,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * POST /api/user/avatar
 * Upload profile avatar
 */
router.post('/avatar', authenticate, async (req, res) => {
    try {
        const { avatar_url } = req.body;
        const supabase = getAuthenticatedClient(getToken(req));

        const { data, error } = await supabase
            .from('users')
            .update({ avatar_url, updated_at: new Date().toISOString() })
            .eq('id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update avatar error:', error);
        res.status(500).json({ error: 'Failed to update avatar' });
    }
});

/**
 * DELETE /api/user/avatar
 * Remove profile avatar
 */
router.delete('/avatar', authenticate, async (req, res) => {
    try {
        const supabase = getAuthenticatedClient(getToken(req));

        const { data, error } = await supabase
            .from('users')
            .update({ avatar_url: null, updated_at: new Date().toISOString() })
            .eq('id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Remove avatar error:', error);
        res.status(500).json({ error: 'Failed to remove avatar' });
    }
});

/**
 * GET /api/user/stats
 * Get user statistics
 */
router.get('/stats', authenticate, async (req, res) => {
    try {
        const supabase = getAuthenticatedClient(getToken(req));

        const { data, error } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json(data || {
            total_tests: 0,
            total_hours: 0,
            avg_score: 0,
            current_streak: 0,
            best_streak: 0
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * PUT /api/user/language
 * Set user's preferred language (saves to user_preferences)
 */
router.put('/language', authenticate, async (req, res) => {
    try {
        const { language_id } = req.body;

        // Upsert into user_preferences table
        const { data, error } = await supabaseAdmin
            .from('user_preferences')
            .upsert({
                user_id: req.user!.id,
                preferred_language_id: language_id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            .select('*, preferred_language:languages(*)')
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update language error:', error);
        res.status(500).json({ error: 'Failed to update language' });
    }
});


/**
 * PUT /api/user/target-exam
 * Set user's target exam
 */
router.put('/target-exam', authenticate, async (req, res) => {
    try {
        const { exam_id } = req.body;
        console.log('Updating target exam for user:', req.user?.id);
        console.log('Exam ID:', exam_id);

        // Use admin client to bypass RLS - user is already authenticated via middleware
        const { data, error } = await supabaseAdmin
            .from('users')
            .update({ target_exam_id: exam_id, updated_at: new Date().toISOString() })
            .eq('id', req.user!.id)
            .select()
            .single();

        if (error) {
            console.error('Supabase Target Exam Update Error:', error);
            throw error;
        }

        res.json(data);
    } catch (error: any) {
        console.error('Update target exam error details:', error);
        res.status(500).json({ error: 'Failed to update target exam', details: error.message });
    }
});

/**
 * GET /api/user/preferences
 * Get user preferences
 */
router.get('/preferences', authenticate, async (req, res) => {
    try {
        // Use admin client to join with languages table
        const { data, error } = await supabaseAdmin
            .from('user_preferences')
            .select('*, preferred_language:languages(*)')
            .eq('user_id', req.user!.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json(data || {
            push_notifications: true,
            test_reminders: true,
            dark_mode: false,
            sound_effects: true,
            download_on_wifi: true,
            preferred_language_id: null,
            preferred_language: null
        });
    } catch (error) {
        console.error('Get preferences error:', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

/**
 * PUT /api/user/preferences
 * Update user preferences
 */
router.put('/preferences', authenticate, async (req, res) => {
    try {
        const { push_notifications, test_reminders, dark_mode, sound_effects, download_on_wifi } = req.body;
        const supabase = getAuthenticatedClient(getToken(req));

        const { data, error } = await supabase
            .from('user_preferences')
            .upsert({
                user_id: req.user!.id,
                push_notifications,
                test_reminders,
                dark_mode,
                sound_effects,
                download_on_wifi,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

/**
 * POST /api/user/change-password
 * Change password
 */
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { new_password } = req.body;
        const supabase = getAuthenticatedClient(getToken(req));
        const { error } = await supabase.auth.updateUser({
            password: new_password
        });

        if (error) throw error;

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

export default router;
