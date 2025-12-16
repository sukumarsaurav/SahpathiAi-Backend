import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate, optionalAuth } from '../middleware/auth';
import { updateConceptStatsRealtime, calculateConceptProficiency } from '../services/personalization';
import { cache } from '../utils/cache';

const router = Router();

/**
 * GET /api/tests/categories
 * Get test categories with counts (cached 12h)
 * Query params: examId (optional) - filter test count by exam
 */
router.get('/categories', optionalAuth, async (req, res) => {
    try {
        const { examId } = req.query;
        const examIdStr = examId as string | undefined;

        const data = await cache.getOrSet(
            cache.KEYS.testCategories(examIdStr),
            cache.TTL.TEST_CATEGORIES,
            async () => {
                // Fetch categories from DB
                const { data: categories, error } = await supabaseAdmin
                    .from('test_categories')
                    .select('*')
                    .eq('is_active', true)
                    .order('display_order');

                if (error) throw error;

                // Get counts for each category (filtered by exam if provided)
                const categoriesWithCounts = await Promise.all(
                    categories.map(async (cat) => {
                        let query = supabaseAdmin
                            .from('tests')
                            .select('*', { count: 'exact', head: true })
                            .eq('test_category_id', cat.id)
                            .eq('is_active', true);

                        if (examIdStr) {
                            query = query.eq('exam_id', examIdStr);
                        }

                        const { count } = await query;
                        return { ...cat, testCount: count || 0 };
                    })
                );

                return categoriesWithCounts;
            }
        );

        res.json(data);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

/**
 * GET /api/tests/category/:categoryId
 * Get tests by category (optionally filtered by exam) - cached 12h
 * Query params: examId (optional) - filter by exam
 * Returns hasAttempted: true/false for each test if user is authenticated
 */
router.get('/category/:categoryId', optionalAuth, async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { examId } = req.query;
        const userId = req.user?.id;
        const examIdStr = examId as string | undefined;

        // If categoryId is a UUID, use it directly.
        // If it's a slug (e.g., 'topic-wise'), resolve it first.
        let targetId = categoryId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);

        if (!isUuid) {
            // Slug lookup - can also be cached but it's fast
            const { data: cat, error: catError } = await supabaseAdmin
                .from('test_categories')
                .select('id, slug')
                .eq('slug', categoryId)
                .single();

            if (catError || !cat) {
                return res.json([]); // Invalid slug
            }
            targetId = cat.id;
        }

        // Get cached test list (without hasAttempted - we merge that after)
        const cachedTests = await cache.getOrSet(
            cache.KEYS.testsByCategory(targetId, examIdStr),
            cache.TTL.TESTS_LIST,
            async () => {
                let query = supabaseAdmin
                    .from('tests')
                    .select(`
                        *,
                        test_questions(count)
                    `)
                    .eq('test_category_id', targetId)
                    .eq('is_active', true);

                if (examIdStr) {
                    query = query.eq('exam_id', examIdStr);
                }

                const { data, error } = await query.order('created_at', { ascending: false });
                if (error) throw error;

                // Map to include total_questions (without hasAttempted)
                return (data || []).map(test => ({
                    ...test,
                    total_questions: test.test_questions?.[0]?.count || 0
                }));
            }
        );

        // Merge user's attempt status if authenticated
        let attemptedTestIds: Set<string> = new Set();
        if (userId && cachedTests.length > 0) {
            const testIds = cachedTests.map((t: any) => t.id);
            const { data: attempts } = await supabaseAdmin
                .from('test_attempts')
                .select('test_id')
                .eq('user_id', userId)
                .in('test_id', testIds)
                .not('completed_at', 'is', null);

            if (attempts) {
                attemptedTestIds = new Set(attempts.map(a => a.test_id));
            }
        }

        // Add hasAttempted to each test
        const testsWithAttempted = cachedTests.map((test: any) => ({
            ...test,
            hasAttempted: attemptedTestIds.has(test.id)
        }));

        res.json(testsWithAttempted);
    } catch (error) {
        console.error('Get tests by category error:', error);
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
});

/**
 * GET /api/tests/:id
 * Get test with questions (cached 1h, language filter applied on return)
 */
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const languageId = req.user?.preferred_language_id;

        // Get cached test data (without language filter - we apply it after)
        const cachedData = await cache.getOrSet(
            cache.KEYS.testWithQuestions(id),
            cache.TTL.TEST_WITH_QUESTIONS,
            async () => {
                // Get test details
                const { data: test, error } = await supabaseAdmin
                    .from('tests')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                if (!test) return null;

                // Try to get questions from test_questions junction table
                const { data: testQuestions } = await supabaseAdmin
                    .from('test_questions')
                    .select(`
                        order_index,
                        question:questions(
                            *,
                            translations:question_translations(*, language:languages(*))
                        )
                    `)
                    .eq('test_id', id)
                    .order('order_index');

                let rawQuestions: any[] = [];

                if (testQuestions && testQuestions.length > 0) {
                    rawQuestions = testQuestions.map(tq => {
                        const q = tq.question as any;
                        return {
                            id: q.id,
                            order: tq.order_index,
                            difficulty: q.difficulty,
                            correctAnswer: q.correct_answer_index,
                            translations: q.translations
                        };
                    });
                } else {
                    // Fallback: fetch random questions from the database
                    console.log(`[Tests] No test_questions found for test ${id}, fetching from questions pool`);

                    const { data: fallbackQuestions } = await supabaseAdmin
                        .from('questions')
                        .select(`
                            *,
                            translations:question_translations(*, language:languages(*))
                        `)
                        .eq('is_active', true)
                        .limit(test.total_questions || 20);

                    if (fallbackQuestions && fallbackQuestions.length > 0) {
                        // Shuffle and format
                        const shuffled = fallbackQuestions.sort(() => Math.random() - 0.5);
                        rawQuestions = shuffled.map((q, index) => ({
                            id: q.id,
                            order: index + 1,
                            difficulty: q.difficulty,
                            correctAnswer: q.correct_answer_index,
                            translations: q.translations
                        }));
                    }
                }

                return { test, rawQuestions };
            }
        );

        if (!cachedData) {
            return res.status(404).json({ error: 'Test not found' });
        }

        // Apply language filter to translations
        const questions = cachedData.rawQuestions.map((q: any) => {
            const translation = languageId
                ? q.translations?.find((t: any) => t.language_id === languageId)
                : q.translations?.[0];

            return {
                id: q.id,
                order: q.order,
                difficulty: q.difficulty,
                question: translation?.question_text,
                options: translation?.options,
                explanation: translation?.explanation,
                correctAnswer: q.correctAnswer,
                translations: q.translations
            };
        });

        res.json({ ...cachedData.test, questions, totalQuestions: questions.length });
    } catch (error) {
        console.error('Get test error:', error);
        res.status(500).json({ error: 'Failed to fetch test' });
    }
});

/**
 * POST /api/tests/:id/start
 * Start a test attempt
 */
router.post('/:id/start', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Get test details
        const { data: test } = await supabaseAdmin
            .from('tests')
            .select('*')
            .eq('id', id)
            .single();

        if (!test) {
            return res.status(404).json({ error: 'Test not found' });
        }

        // Get question count
        const { count } = await supabaseAdmin
            .from('test_questions')
            .select('*', { count: 'exact', head: true })
            .eq('test_id', id);

        // Create attempt
        const { data: attempt, error } = await supabaseAdmin
            .from('test_attempts')
            .insert({
                user_id: req.user!.id,
                test_id: id,
                language_id: req.user!.preferred_language_id,
                total_questions: count || 0,
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.json(attempt);
    } catch (error) {
        console.error('Start test error:', error);
        res.status(500).json({ error: 'Failed to start test' });
    }
});

/**
 * POST /api/tests/:id/submit
 * Submit test answers
 */
router.post('/:id/submit', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { attempt_id, answers, time_taken_seconds } = req.body;

        // Calculate score
        let score = 0;
        const mistakesToAdd: any[] = [];

        for (const answer of answers) {
            // Get correct answer
            const { data: question } = await supabaseAdmin
                .from('questions')
                .select('correct_answer_index')
                .eq('id', answer.question_id)
                .single();

            const isSkipped = answer.selected_option === null;
            const isCorrect = !isSkipped && question?.correct_answer_index === answer.selected_option;
            if (isCorrect) score++;

            // Save answer
            await supabaseAdmin.from('user_answers').insert({
                attempt_id,
                question_id: answer.question_id,
                selected_option: answer.selected_option,
                is_correct: isCorrect,
                is_skipped: isSkipped,
                time_taken_seconds: answer.time_taken || 0
            });

            // Track mistake if wrong (skipped also counts as mistake/unresolved)
            if (!isCorrect) {
                mistakesToAdd.push({
                    user_id: req.user!.id,
                    question_id: answer.question_id,
                    selected_option: answer.selected_option
                });
            }

            // Real-time: Update concept stats (non-blocking)
            if (!isSkipped) {
                updateConceptStatsRealtime(req.user!.id, answer.question_id, isCorrect, answer.time_taken || 0)
                    .catch(err => console.error('Concept stats update error:', err));
            }
        }

        // Add mistakes
        if (mistakesToAdd.length > 0) {
            for (const mistake of mistakesToAdd) {
                // Upsert mistake
                const { data: existing } = await supabaseAdmin
                    .from('user_mistakes')
                    .select('id, retry_count')
                    .eq('user_id', mistake.user_id)
                    .eq('question_id', mistake.question_id)
                    .single();

                if (existing) {
                    await supabaseAdmin
                        .from('user_mistakes')
                        .update({
                            retry_count: existing.retry_count + 1,
                            is_resolved: false,
                            last_attempted: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                } else {
                    await supabaseAdmin.from('user_mistakes').insert(mistake);
                }
            }
        }

        // Update attempt
        const percentage = Math.round((score / answers.length) * 100);
        const { data: attempt, error } = await supabaseAdmin
            .from('test_attempts')
            .update({
                score,
                percentage,
                time_taken_seconds,
                completed_at: new Date().toISOString()
            })
            .eq('id', attempt_id)
            .select()
            .single();

        if (error) throw error;

        // Update user stats
        await supabaseAdmin.rpc('update_user_stats', { user_id: req.user!.id });

        // Batch: Calculate concept proficiency for all answered questions
        const questionIds = answers.map((a: any) => a.question_id).filter(Boolean);
        if (questionIds.length > 0) {
            calculateConceptProficiency(req.user!.id, questionIds)
                .catch(err => console.error('Proficiency calculation error:', err));
        }

        // Check and complete referral if this is the user's first test
        try {
            const { data: referral } = await supabaseAdmin
                .from('referrals')
                .select('*, referrer:users!referrer_id(id)')
                .eq('referred_id', req.user!.id)
                .eq('status', 'pending')
                .single();

            if (referral) {
                console.log('[Referral] Completing referral for user:', req.user!.id);

                // Update referral status
                await supabaseAdmin
                    .from('referrals')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', referral.id);

                // Add reward to referrer's wallet
                const { data: referrerWallet } = await supabaseAdmin
                    .from('wallets')
                    .select('*')
                    .eq('user_id', (referral.referrer as any).id)
                    .single();

                if (referrerWallet) {
                    await supabaseAdmin
                        .from('wallets')
                        .update({
                            balance: referrerWallet.balance + referral.reward_amount,
                            total_earned: (referrerWallet.total_earned || 0) + referral.reward_amount
                        })
                        .eq('id', referrerWallet.id);

                    await supabaseAdmin.from('wallet_transactions').insert({
                        wallet_id: referrerWallet.id,
                        type: 'credit',
                        amount: referral.reward_amount,
                        description: 'Referral bonus',
                        category: 'referral'
                    });
                }

                // Add reward to referred user's wallet
                const { data: userWallet } = await supabaseAdmin
                    .from('wallets')
                    .select('*')
                    .eq('user_id', req.user!.id)
                    .single();

                if (userWallet) {
                    await supabaseAdmin
                        .from('wallets')
                        .update({
                            balance: userWallet.balance + referral.reward_amount,
                            total_earned: (userWallet.total_earned || 0) + referral.reward_amount
                        })
                        .eq('id', userWallet.id);

                    await supabaseAdmin.from('wallet_transactions').insert({
                        wallet_id: userWallet.id,
                        type: 'credit',
                        amount: referral.reward_amount,
                        description: 'Welcome bonus (referral)',
                        category: 'referral'
                    });
                }

                console.log('[Referral] Completed! Both users received ₹' + referral.reward_amount);
            }
        } catch (referralError) {
            // Log but don't fail the test submission
            console.log('[Referral] Error or no pending referral:', referralError);
        }

        res.json({
            ...attempt,
            correct: score,
            wrong: answers.length - score
        });
    } catch (error) {
        console.error('Submit test error:', error);
        res.status(500).json({ error: 'Failed to submit test' });
    }
});

/**
 * GET /api/tests/:id/result
 * Get test result
 */
router.get('/:id/result', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { attempt_id } = req.query;

        const { data: attempt, error } = await supabaseAdmin
            .from('test_attempts')
            .select('*, test:tests(*)')
            .eq('id', attempt_id)
            .eq('user_id', req.user!.id)
            .single();

        if (error) throw error;

        // Get answers
        const { data: answers } = await supabaseAdmin
            .from('user_answers')
            .select('*, question:questions(*)')
            .eq('attempt_id', attempt_id);

        res.json({ ...attempt, answers });
    } catch (error) {
        console.error('Get result error:', error);
        res.status(500).json({ error: 'Failed to fetch result' });
    }
});

/**
 * GET /api/tests/:id/attempts
 * Get user's attempts for a test
 */
router.get('/:id/attempts', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseAdmin
            .from('test_attempts')
            .select('*')
            .eq('test_id', id)
            .eq('user_id', req.user!.id)
            .order('completed_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get attempts error:', error);
        res.status(500).json({ error: 'Failed to fetch attempts' });
    }
});

export default router;
