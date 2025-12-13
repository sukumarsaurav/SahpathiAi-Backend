import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/languages
 * Get all active languages
 */
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('languages')
            .select('*')
            .eq('is_active', true)
            .order('display_order');

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get languages error:', error);
        res.status(500).json({ error: 'Failed to fetch languages' });
    }
});

/**
 * PUT /api/languages/user
 * Set user's preferred language (saves to user_preferences)
 */
router.put('/user', authenticate, async (req, res) => {
    try {
        const { language_id } = req.body;
        console.log('Updating language for user:', req.user?.id);
        console.log('Language ID:', language_id);

        // Use admin client to bypass RLS - user is already authenticated via middleware
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

        if (error) {
            console.error('Supabase Language Update Error:', error);
            throw error;
        }

        console.log('Language updated successfully');
        res.json(data);
    } catch (error: any) {
        console.error('Update language error details:', error);
        res.status(500).json({ error: 'Failed to update language', details: error.message });
    }
});

export default router;
