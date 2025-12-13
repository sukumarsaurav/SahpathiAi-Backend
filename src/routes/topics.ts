import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';

const router = Router();

/**
 * GET /api/topics/subject/:subjectId
 * Get topics for a master subject, optionally filtered by exam
 * Used by Marathon mode
 */
router.get('/subject/:subjectId', async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { examId } = req.query;

        // Build query to fetch topics for the master subject
        // Topics where subject_id matches AND (exam_id is NULL OR exam_id matches)
        let query = supabaseAdmin
            .from('topics')
            .select('*')
            .eq('subject_id', subjectId)
            .eq('is_active', true)
            .order('order_index');

        // If examId is provided, filter to include only topics that are:
        // - Common to all exams (exam_id is null), OR
        // - Specific to this exam (exam_id matches)
        if (examId) {
            query = query.or(`exam_id.is.null,exam_id.eq.${examId}`);
        }

        const { data: topics, error } = await query;

        if (error) throw error;

        // Get actual question counts for each topic
        if (topics && topics.length > 0) {
            const topicIds = topics.map(t => t.id);

            // Count active questions per topic
            const { data: questionCounts, error: countError } = await supabaseAdmin
                .from('questions')
                .select('topic_id')
                .in('topic_id', topicIds)
                .eq('is_active', true);

            if (!countError && questionCounts) {
                // Count questions per topic
                const countMap: Record<string, number> = {};
                questionCounts.forEach(q => {
                    countMap[q.topic_id] = (countMap[q.topic_id] || 0) + 1;
                });

                // Update topic objects with actual counts
                const topicsWithCounts = topics.map(topic => ({
                    ...topic,
                    question_count: countMap[topic.id] || 0
                }));

                return res.json(topicsWithCounts);
            }
        }

        res.json(topics);
    } catch (error) {
        console.error('Get topics for subject error:', error);
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
});

/**
 * GET /api/topics/:topicId/questions
 * Get questions for a topic (with translations)
 */
router.get('/:topicId/questions', async (req, res) => {
    try {
        const { topicId } = req.params;
        const { language_id } = req.query;

        // Get questions with translations
        const { data, error } = await supabase
            .from('questions')
            .select(`
        *,
        translations:question_translations(*)
      `)
            .eq('topic_id', topicId)
            .eq('is_active', true);

        if (error) throw error;

        // Filter translations if language specified
        if (language_id && data) {
            const filtered = data.map(q => ({
                ...q,
                translation: q.translations.find((t: any) => t.language_id === language_id) || q.translations[0]
            }));
            return res.json(filtered);
        }

        res.json(data);
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

export default router;
