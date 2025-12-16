import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { cache } from '../utils/cache';

const router = Router();

/**
 * GET /api/exam-categories
 * Get all exam categories (cached 24h)
 */
router.get('/categories', async (req, res) => {
    try {
        const data = await cache.getOrSet(
            cache.KEYS.examCategories(),
            cache.TTL.EXAM_CATEGORIES,
            async () => {
                const { data, error } = await supabase
                    .from('exam_categories')
                    .select('*')
                    .order('display_order');
                if (error) throw error;
                return data;
            }
        );

        res.json(data);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch exam categories' });
    }
});

/**
 * GET /api/exams
 * Get all exams, optionally filtered by category (cached 24h)
 */
router.get('/', async (req, res) => {
    try {
        const { category } = req.query;
        const categoryId = category as string | undefined;

        const data = await cache.getOrSet(
            cache.KEYS.exams(categoryId),
            cache.TTL.EXAMS,
            async () => {
                let query = supabase
                    .from('exams')
                    .select('*, category:exam_categories(*)')
                    .eq('is_active', true)
                    .order('display_order');

                if (categoryId) {
                    query = query.eq('category_id', categoryId);
                }

                const { data, error } = await query;
                if (error) throw error;
                return data;
            }
        );

        res.json(data);
    } catch (error) {
        console.error('Get exams error:', error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

/**
 * GET /api/exams/:examId
 * Get exam details (cached 24h)
 */
router.get('/:examId', async (req, res) => {
    try {
        const { examId } = req.params;

        const data = await cache.getOrSet(
            cache.KEYS.examDetails(examId),
            cache.TTL.EXAMS,
            async () => {
                const { data, error } = await supabase
                    .from('exams')
                    .select('*, category:exam_categories(*)')
                    .eq('id', examId)
                    .single();
                if (error) throw error;
                return data;
            }
        );

        res.json(data);
    } catch (error) {
        console.error('Get exam error:', error);
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
});

/**
 * GET /api/exams/:examId/subjects
 * Get all subjects for an exam (cached 24h)
 */
router.get('/:examId/subjects', async (req, res) => {
    try {
        const { examId } = req.params;

        const data = await cache.getOrSet(
            cache.KEYS.examSubjects(examId),
            cache.TTL.EXAM_SUBJECTS,
            async () => {
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
                        const { count: directCount } = await supabaseAdmin
                            .from('tests')
                            .select('*', { count: 'exact', head: true })
                            .eq('subject_id', item.id)
                            .eq('is_active', true);

                        return {
                            ...item,
                            name: item.subject?.name,
                            icon: item.subject?.icon,
                            color: item.subject?.color,
                            description: item.subject?.description,
                            testCount: directCount || 0,
                            subject_details: item.subject
                        };
                    })
                );

                return subjectsWithCounts;
            }
        );

        res.json(data);
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
