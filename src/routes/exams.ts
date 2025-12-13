import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/exam-categories
 * Get all exam categories
 */
router.get('/categories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exam_categories')
            .select('*')
            .order('display_order');

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch exam categories' });
    }
});

/**
 * GET /api/exams
 * Get all exams, optionally filtered by category
 */
router.get('/', async (req, res) => {
    try {
        const { category } = req.query;

        let query = supabase
            .from('exams')
            .select('*, category:exam_categories(*)')
            .eq('is_active', true)
            .order('display_order');

        if (category) {
            query = query.eq('category_id', category);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get exams error:', error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

/**
 * GET /api/exams/:examId
 * Get exam details
 */
router.get('/:examId', async (req, res) => {
    try {
        const { examId } = req.params;

        const { data, error } = await supabase
            .from('exams')
            .select('*, category:exam_categories(*)')
            .eq('id', examId)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get exam error:', error);
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
});

/**
 * GET /api/exams/:examId/subjects
 * Get all subjects for an exam
 */
router.get('/:examId/subjects', async (req, res) => {
    try {
        const { examId } = req.params;

        // Use supabaseAdmin to bypass RLS issues with subjects table join
        const { data, error } = await supabaseAdmin
            .from('exam_subjects')
            .select('*, subject:subjects(*)')
            .eq('exam_id', examId)
            .eq('is_active', true)
            .order('display_order');

        if (error) throw error;

        // Get test counts for each exam_subject
        const subjectsWithCounts = await Promise.all(
            data.map(async (item: any) => {
                // Count tests directly linked to this exam_subject
                const { count: directCount } = await supabaseAdmin
                    .from('tests')
                    .select('*', { count: 'exact', head: true })
                    .eq('subject_id', item.id)
                    .eq('is_active', true);

                // Count exam-wide tests (null subject_id, matching exam_id)
                const { count: examWideCount } = await supabaseAdmin
                    .from('tests')
                    .select('*', { count: 'exact', head: true })
                    .eq('exam_id', examId)
                    .is('subject_id', null)
                    .eq('is_active', true);

                const totalCount = (directCount || 0) + (examWideCount || 0);

                return {
                    ...item,
                    name: item.subject?.name,
                    icon: item.subject?.icon,
                    color: item.subject?.color,
                    description: item.subject?.description,
                    testCount: totalCount,
                    // Keep original subject object accessible if needed
                    subject_details: item.subject
                };
            })
        );

        res.json(subjectsWithCounts);
    } catch (error) {
        console.error('Get subjects error:', error);
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

/**
 * PUT /api/user/target-exam
 * Set user's target exam
 */
router.put('/user/target', authenticate, async (req, res) => {
    try {
        const { exam_id } = req.body;

        const { data, error } = await supabase
            .from('users')
            .update({ target_exam_id: exam_id })
            .eq('id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update target exam error:', error);
        res.status(500).json({ error: 'Failed to update target exam' });
    }
});

export default router;
