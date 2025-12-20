import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';
import { cache } from '../utils/cache';

const router = Router();

/**
 * GET /api/topics/subject/:subjectId
 * Get topics for a master subject, optionally filtered by exam (cached 12h)
 * Used by Marathon mode
 * Optional query params:
 * - examId: filter topics for specific exam
 * - questionType: 'mcq' or 'fill_blank' to get question count for that type only
 */
router.get('/subject/:subjectId', async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { examId, questionType } = req.query;
        const examIdStr = examId as string | undefined;
        const questionTypeStr = questionType as string | undefined;

        // Include questionType in cache key for proper cache separation
        const cacheKey = questionTypeStr
            ? `${cache.KEYS.topics(subjectId, examIdStr)}_type_${questionTypeStr}`
            : cache.KEYS.topics(subjectId, examIdStr);

        const data = await cache.getOrSet(
            cacheKey,
            cache.TTL.TOPICS,
            async () => {
                // Build query to fetch topics for the master subject
                let query = supabaseAdmin
                    .from('topics')
                    .select('*')
                    .eq('subject_id', subjectId)
                    .eq('is_active', true)
                    .order('order_index');

                // If examId is provided, filter to include only topics that are:
                // - Common to all exams (exam_id is null), OR
                // - Specific to this exam (exam_id matches)
                if (examIdStr) {
                    query = query.or(`exam_id.is.null,exam_id.eq.${examIdStr}`);
                }

                const { data: topics, error } = await query;
                if (error) throw error;

                // Get actual question counts for each topic
                if (topics && topics.length > 0) {
                    const topicIds = topics.map(t => t.id);

                    // Build question count query with optional type filter
                    let countQuery = supabaseAdmin
                        .from('questions')
                        .select('topic_id, question_type')
                        .in('topic_id', topicIds)
                        .eq('is_active', true);

                    // Add question type filter if specified
                    if (questionTypeStr && ['mcq', 'fill_blank'].includes(questionTypeStr)) {
                        countQuery = countQuery.eq('question_type', questionTypeStr);
                    }

                    const { data: questionCounts, error: countError } = await countQuery;

                    if (!countError && questionCounts) {
                        const countMap: Record<string, number> = {};
                        questionCounts.forEach(q => {
                            countMap[q.topic_id] = (countMap[q.topic_id] || 0) + 1;
                        });

                        return topics.map(topic => ({
                            ...topic,
                            question_count: countMap[topic.id] || 0
                        }));
                    }
                }

                return topics;
            }
        );

        res.json(data);
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
        const langId = language_id as string | undefined;

        // Try cache first
        const cached = await cache.getTopicQuestions(topicId, langId);
        if (cached) {
            return res.json(cached);
        }

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
        if (langId && data) {
            const filtered = data.map(q => ({
                ...q,
                translation: q.translations.find((t: any) => t.language_id === langId) || q.translations[0]
            }));
            // Cache filtered result
            await cache.setTopicQuestions(topicId, filtered, langId);
            return res.json(filtered);
        }

        // Cache full result
        await cache.setTopicQuestions(topicId, data || []);
        res.json(data);
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

export default router;
