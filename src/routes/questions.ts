import { Router } from 'express';
import { supabase } from '../db/supabase';
import { optionalAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/questions/:id
 * Get single question with translation
 */
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const languageId = req.user?.preferred_language_id || req.query.language_id;

        const { data, error } = await supabase
            .from('questions')
            .select(`
        *,
        topic:topics(*),
        translations:question_translations(*)
      `)
            .eq('id', id)
            .single();

        if (error) throw error;

        // Get preferred translation
        const translation = languageId
            ? data.translations.find((t: any) => t.language_id === languageId)
            : data.translations[0];

        res.json({ ...data, translation });
    } catch (error) {
        console.error('Get question error:', error);
        res.status(500).json({ error: 'Failed to fetch question' });
    }
});

/**
 * GET /api/questions/:id/exam-history
 * Get exam history for a question (which exams it appeared in)
 */
router.get('/:id/exam-history', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('question_exam_history')
            .select('*, exam:exams(*)')
            .eq('question_id', id)
            .order('year_asked', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get exam history error:', error);
        res.status(500).json({ error: 'Failed to fetch exam history' });
    }
});

export default router;
