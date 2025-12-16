import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/analytics/overview
 * Get overall user performance - aggregates from all test modes (except marathon)
 */
router.get('/overview', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // 1. Count total tests from all sources (except marathon)
        const { count: regularTests } = await supabaseAdmin
            .from('test_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .not('completed_at', 'is', null);

        const { count: customTests } = await supabaseAdmin
            .from('custom_tests')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'completed');

        const { count: dailyPracticeSessions } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'completed');

        const totalTests = (regularTests || 0) + (customTests || 0) + (dailyPracticeSessions || 0);

        // 2. Calculate overall accuracy from all answers
        // Regular test answers
        const { data: testAttemptIds } = await supabaseAdmin
            .from('test_attempts')
            .select('id')
            .eq('user_id', userId);
        const attemptIds = testAttemptIds?.map(a => a.id) || [];

        let totalAnswers = 0;
        let correctAnswers = 0;

        if (attemptIds.length > 0) {
            const { data: answers } = await supabaseAdmin
                .from('user_answers')
                .select('is_correct')
                .in('attempt_id', attemptIds);
            totalAnswers += answers?.length || 0;
            correctAnswers += answers?.filter(a => a.is_correct).length || 0;
        }

        // Custom test answers
        const { data: customTestIds } = await supabaseAdmin
            .from('custom_tests')
            .select('id')
            .eq('user_id', userId);

        if (customTestIds && customTestIds.length > 0) {
            const { data: customAnswers } = await supabaseAdmin
                .from('custom_test_questions')
                .select('is_correct')
                .in('custom_test_id', customTestIds.map(t => t.id))
                .not('answered_at', 'is', null);
            totalAnswers += customAnswers?.length || 0;
            correctAnswers += customAnswers?.filter(a => a.is_correct).length || 0;
        }

        // Daily practice answers
        const { data: dailySessionIds } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('id')
            .eq('user_id', userId);

        if (dailySessionIds && dailySessionIds.length > 0) {
            const { data: dailyAnswers } = await supabaseAdmin
                .from('daily_practice_questions')
                .select('is_correct')
                .in('session_id', dailySessionIds.map(s => s.id))
                .eq('is_answered', true);
            totalAnswers += dailyAnswers?.length || 0;
            correctAnswers += dailyAnswers?.filter(a => a.is_correct).length || 0;
        }

        const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

        // 3. Get this week vs last week performance for trend
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        // This week's regular test scores
        const { data: thisWeekRegular } = await supabaseAdmin
            .from('test_attempts')
            .select('percentage')
            .eq('user_id', userId)
            .gte('completed_at', weekAgo.toISOString())
            .not('completed_at', 'is', null);

        // Last week's regular test scores
        const { data: lastWeekRegular } = await supabaseAdmin
            .from('test_attempts')
            .select('percentage')
            .eq('user_id', userId)
            .gte('completed_at', twoWeeksAgo.toISOString())
            .lt('completed_at', weekAgo.toISOString())
            .not('completed_at', 'is', null);

        const thisWeekScores = thisWeekRegular?.map(a => a.percentage) || [];
        const lastWeekScores = lastWeekRegular?.map(a => a.percentage) || [];

        const thisWeekAvg = thisWeekScores.length > 0
            ? Math.round(thisWeekScores.reduce((a, b) => a + b, 0) / thisWeekScores.length)
            : 0;
        const lastWeekAvg = lastWeekScores.length > 0
            ? Math.round(lastWeekScores.reduce((a, b) => a + b, 0) / lastWeekScores.length)
            : 0;

        const change = thisWeekAvg - lastWeekAvg;

        // 4. Calculate streak from completed sessions
        const { data: recentSessions } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('started_at')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('started_at', { ascending: false });

        let currentStreak = 0;
        if (recentSessions && recentSessions.length > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let lastDate: Date | null = null;

            for (const session of recentSessions) {
                const sessionDate = new Date(session.started_at);
                sessionDate.setHours(0, 0, 0, 0);

                if (!lastDate) {
                    // Check if most recent is today or yesterday
                    const daysDiff = Math.floor((today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff <= 1) {
                        currentStreak = 1;
                        lastDate = sessionDate;
                    } else {
                        break;
                    }
                } else {
                    const daysDiff = Math.floor((lastDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff === 1) {
                        currentStreak++;
                        lastDate = sessionDate;
                    } else {
                        break;
                    }
                }
            }
        }

        res.json({
            overall_score: accuracy,
            accuracy: accuracy,
            change: change > 0 ? `+${change}%` : `${change}%`,
            trending: change >= 0 ? 'up' : 'down',
            total_tests: totalTests,
            current_streak: currentStreak
        });
    } catch (error) {
        console.error('Get overview error:', error);
        res.status(500).json({ error: 'Failed to fetch overview' });
    }
});

/**
 * GET /api/analytics/subjects
 * Get subject-wise performance for user's target exam
 * Shows ALL subjects for the exam with questions attempted and accuracy from regular tests + custom tests
 */
router.get('/subjects', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Fetch target_exam_id directly from users table to ensure we have it
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('target_exam_id')
            .eq('id', userId)
            .single();

        const targetExamId = userData?.target_exam_id;

        console.log('[Analytics Subjects] User:', userId, 'Target Exam:', targetExamId);

        if (!targetExamId) {
            console.log('[Analytics Subjects] No target exam selected');
            return res.json([]); // No target exam selected
        }

        // 1. Get all subjects for the user's target exam
        const { data: examSubjects, error: examSubjectsError } = await supabaseAdmin
            .from('exam_subjects')
            .select('id, subject:subjects(id, name, icon, color)')
            .eq('exam_id', targetExamId)
            .eq('is_active', true)
            .order('display_order');

        console.log('[Analytics Subjects] Exam subjects found:', examSubjects?.length, 'Error:', examSubjectsError);

        if (!examSubjects || examSubjects.length === 0) {
            return res.json([]);
        }

        // 2. Get all topics for these subjects under this exam
        const subjectIds = examSubjects.map(es => (es.subject as any)?.id).filter(Boolean);

        const { data: topics } = await supabaseAdmin
            .from('topics')
            .select('id, subject_id')
            .in('subject_id', subjectIds)
            .or(`exam_id.is.null,exam_id.eq.${targetExamId}`);

        // Map: subject_id -> topic_ids[]
        const subjectTopicsMap = new Map<string, string[]>();
        for (const topic of topics || []) {
            const existing = subjectTopicsMap.get(topic.subject_id) || [];
            existing.push(topic.id);
            subjectTopicsMap.set(topic.subject_id, existing);
        }

        // 3. Get all question IDs for these topics
        const allTopicIds = Array.from(subjectTopicsMap.values()).flat();

        const { data: questions } = await supabaseAdmin
            .from('questions')
            .select('id, topic_id')
            .in('topic_id', allTopicIds.length > 0 ? allTopicIds : ['none']);

        // Map: topic_id -> question_ids[]
        const topicQuestionsMap = new Map<string, string[]>();
        for (const q of questions || []) {
            const existing = topicQuestionsMap.get(q.topic_id) || [];
            existing.push(q.id);
            topicQuestionsMap.set(q.topic_id, existing);
        }

        // 4. Get user's answered questions from regular tests
        const { data: testAttemptIds } = await supabaseAdmin
            .from('test_attempts')
            .select('id')
            .eq('user_id', userId);

        const userAnswers = new Map<string, boolean>(); // question_id -> is_correct (last attempt)

        if (testAttemptIds && testAttemptIds.length > 0) {
            const { data: answers } = await supabaseAdmin
                .from('user_answers')
                .select('question_id, is_correct')
                .in('attempt_id', testAttemptIds.map(a => a.id));

            for (const answer of answers || []) {
                userAnswers.set(answer.question_id, answer.is_correct);
            }
        }

        // 5. Get user's answered questions from custom tests
        const { data: customTestIds } = await supabaseAdmin
            .from('custom_tests')
            .select('id')
            .eq('user_id', userId);

        if (customTestIds && customTestIds.length > 0) {
            const { data: customAnswers } = await supabaseAdmin
                .from('custom_test_questions')
                .select('question_id, is_correct')
                .in('custom_test_id', customTestIds.map(t => t.id))
                .not('answered_at', 'is', null);

            for (const answer of customAnswers || []) {
                if (answer.is_correct !== null) {
                    // Only update if not already answered or update with latest
                    userAnswers.set(answer.question_id, answer.is_correct);
                }
            }
        }

        // 6. Calculate per-subject stats
        const result = examSubjects.map(es => {
            const subject = es.subject as any;
            if (!subject) return null;

            const topicIds = subjectTopicsMap.get(subject.id) || [];
            const questionIds = topicIds.flatMap(tid => topicQuestionsMap.get(tid) || []);

            // Filter to unique user-answered questions for this subject
            const answeredQuestions = questionIds.filter(qid => userAnswers.has(qid));
            const correctCount = answeredQuestions.filter(qid => userAnswers.get(qid) === true).length;
            const attemptedCount = answeredQuestions.length;
            const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

            return {
                id: subject.id,
                name: subject.name,
                icon: subject.icon || '📚',
                color: subject.color || '#3b82f6',
                questionsAttempted: attemptedCount,
                correctAnswers: correctCount,
                accuracy: accuracy,
                score: accuracy // For compatibility with existing UI
            };
        }).filter(Boolean);

        res.json(result);
    } catch (error) {
        console.error('Get subject analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch subject analytics' });
    }
});

/**
 * GET /api/analytics/history
 * Get recent test history with scores
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const { data, error } = await supabaseAdmin
            .from('test_attempts')
            .select('*, test:tests(id, title)')
            .eq('user_id', req.user!.id)
            .not('completed_at', 'is', null)
            .order('completed_at', { ascending: false })
            .limit(Number(limit));

        if (error) {
            console.error('History query error:', error);
            throw error;
        }

        const history = (data || []).map(attempt => ({
            id: attempt.id,
            title: (attempt.test as any)?.title || 'Untitled Test',
            date: attempt.completed_at,
            score: attempt.percentage || 0,
            totalQuestions: attempt.total_questions || 0,
            correctAnswers: attempt.score || 0,
            duration: attempt.time_taken_seconds
                ? `${Math.floor(attempt.time_taken_seconds / 60)} min`
                : '-',
            passed: (attempt.percentage || 0) >= 70
        }));

        res.json(history);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * GET /api/analytics/all-tests
 * Get all test types combined (regular, custom, daily practice) for Analytics page
 */
router.get('/all-tests', authenticate, async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const userId = req.user!.id;
        const allTests: any[] = [];

        // 1. Regular tests
        const { data: regularTests } = await supabaseAdmin
            .from('test_attempts')
            .select('*, test:tests(id, title)')
            .eq('user_id', userId)
            .not('completed_at', 'is', null)
            .order('completed_at', { ascending: false });

        for (const attempt of regularTests || []) {
            allTests.push({
                id: attempt.id,
                type: 'regular',
                typeName: 'Test',
                title: (attempt.test as any)?.title || 'Untitled Test',
                date: attempt.completed_at,
                score: attempt.percentage || 0,
                totalQuestions: attempt.total_questions || 0,
                correctAnswers: attempt.score || 0,
                duration: attempt.time_taken_seconds
                    ? `${Math.floor(attempt.time_taken_seconds / 60)} min`
                    : '-',
                passed: (attempt.percentage || 0) >= 70,
                viewUrl: `/test/${(attempt.test as any)?.id}/result?attempt_id=${attempt.id}`
            });
        }

        // 2. Custom tests
        const { data: customTests } = await supabaseAdmin
            .from('custom_tests')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false });

        for (const test of customTests || []) {
            // Calculate score from custom_test_questions
            const { data: questions } = await supabaseAdmin
                .from('custom_test_questions')
                .select('is_correct')
                .eq('custom_test_id', test.id)
                .not('answered_at', 'is', null);

            const totalQ = questions?.length || 0;
            const correctQ = questions?.filter(q => q.is_correct).length || 0;
            const percentage = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;

            allTests.push({
                id: test.id,
                type: 'custom',
                typeName: 'Custom Test',
                title: `Custom Test`,
                date: test.completed_at,
                score: percentage,
                totalQuestions: totalQ,
                correctAnswers: correctQ,
                duration: test.duration_minutes ? `${test.duration_minutes} min` : '-',
                passed: percentage >= 70,
                viewUrl: `/custom-test/${test.id}/result`
            });
        }

        // 3. Daily practice sessions
        const { data: dailySessions } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false });

        for (const session of dailySessions || []) {
            const percentage = session.questions_answered > 0
                ? Math.round((session.correct_answers / session.questions_answered) * 100)
                : 0;

            allTests.push({
                id: session.id,
                type: 'daily_practice',
                typeName: 'Daily Practice',
                title: `Daily Practice`,
                date: session.completed_at || session.started_at,
                score: percentage,
                totalQuestions: session.total_questions || 0,
                correctAnswers: session.correct_answers || 0,
                duration: '-',
                passed: percentage >= 70,
                viewUrl: `/daily-practice/result/${session.id}`
            });
        }

        // Sort all by date descending and limit
        allTests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const limitedTests = allTests.slice(0, Number(limit));

        res.json(limitedTests);
    } catch (error) {
        console.error('Get all tests error:', error);
        res.status(500).json({ error: 'Failed to fetch all tests' });
    }
});

/**
 * GET /api/analytics/streak
 * Get streak information
 */
router.get('/streak', authenticate, async (req, res) => {
    try {
        const { data: stats } = await supabaseAdmin
            .from('user_stats')
            .select('current_streak, best_streak, last_activity')
            .eq('user_id', req.user!.id)
            .single();

        res.json(stats || { current_streak: 0, best_streak: 0 });
    } catch (error) {
        console.error('Get streak error:', error);
        res.status(500).json({ error: 'Failed to fetch streak' });
    }
});

/**
 * GET /api/analytics/trends
 * Get performance trends (weekly/monthly)
 */
router.get('/trends', authenticate, async (req, res) => {
    try {
        const { period = 'weekly' } = req.query;
        const days = period === 'monthly' ? 30 : 7;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: attempts } = await supabaseAdmin
            .from('test_attempts')
            .select('percentage, completed_at')
            .eq('user_id', req.user!.id)
            .gte('completed_at', startDate.toISOString())
            .not('completed_at', 'is', null)
            .order('completed_at');

        // Group by date
        const dailyScores = new Map<string, number[]>();

        for (const attempt of attempts || []) {
            const date = new Date(attempt.completed_at).toISOString().split('T')[0];
            const existing = dailyScores.get(date) || [];
            existing.push(attempt.percentage);
            dailyScores.set(date, existing);
        }

        const trends = Array.from(dailyScores.entries()).map(([date, scores]) => ({
            date,
            score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            tests: scores.length
        }));

        res.json(trends);
    } catch (error) {
        console.error('Get trends error:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

/**
 * GET /api/analytics/daily-stats
 * Get today's question statistics across all test modes
 */
router.get('/daily-stats', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Get start of today (IST timezone, UTC+5:30)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istNow = new Date(now.getTime() + istOffset);
        const todayStart = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
        // Convert back to UTC for database query
        const todayStartUtc = new Date(todayStart.getTime() - istOffset).toISOString();

        // 1. Get answers from regular test attempts (user_answers)
        const { data: testAttempts } = await supabaseAdmin
            .from('test_attempts')
            .select('id')
            .eq('user_id', userId);

        const attemptIds = testAttempts?.map(a => a.id) || [];

        let testAnswers: { question_id: string; is_correct: boolean }[] = [];
        if (attemptIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('user_answers')
                .select('question_id, is_correct')
                .in('attempt_id', attemptIds)
                .gte('answered_at', todayStartUtc);
            testAnswers = data || [];
        }

        // 2. Get answers from custom tests
        const { data: customTests } = await supabaseAdmin
            .from('custom_tests')
            .select('id')
            .eq('user_id', userId);

        const customTestIds = customTests?.map(t => t.id) || [];

        let customTestAnswers: { question_id: string; is_correct: boolean | null }[] = [];
        if (customTestIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('custom_test_questions')
                .select('question_id, is_correct')
                .in('custom_test_id', customTestIds)
                .not('answered_at', 'is', null)
                .gte('answered_at', todayStartUtc);
            customTestAnswers = data || [];
        }

        // 3. Get answers from marathon sessions
        const { data: marathonSessions } = await supabaseAdmin
            .from('marathon_sessions')
            .select('id')
            .eq('user_id', userId);

        const marathonSessionIds = marathonSessions?.map(s => s.id) || [];

        let marathonAnswersData: { question_id: string; is_correct: boolean }[] = [];
        if (marathonSessionIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('marathon_answers')
                .select('question_id, is_correct')
                .in('session_id', marathonSessionIds)
                .gte('answered_at', todayStartUtc);
            marathonAnswersData = data || [];
        }

        // 4. Get answers from daily practice sessions
        const { data: dailySessions } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('id')
            .eq('user_id', userId);

        const dailySessionIds = dailySessions?.map(s => s.id) || [];

        let dailyAnswers: { question_id: string; is_correct: boolean | null }[] = [];
        if (dailySessionIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('daily_practice_questions')
                .select('question_id, is_correct')
                .in('session_id', dailySessionIds)
                .eq('is_answered', true)
                .gte('answered_at', todayStartUtc);
            dailyAnswers = data || [];
        }

        // Combine all answers for attempted/correct counting (includes marathon)
        const allAnswers = [
            ...testAnswers,
            ...customTestAnswers.filter(a => a.is_correct !== null),
            ...marathonAnswersData,
            ...dailyAnswers.filter(a => a.is_correct !== null)
        ];

        // Answers for mistakes counting (excludes marathon - it's for learning, mistakes are expected)
        const answersForMistakes = [
            ...testAnswers,
            ...customTestAnswers.filter(a => a.is_correct !== null),
            ...dailyAnswers.filter(a => a.is_correct !== null)
        ];

        // Calculate stats
        const uniqueQuestionIds = new Set<string>();
        const correctQuestionIds = new Set<string>();
        let totalMistakes = 0;

        // Count attempted and correct from all sources (including marathon)
        for (const answer of allAnswers) {
            uniqueQuestionIds.add(answer.question_id);
            if (answer.is_correct) {
                correctQuestionIds.add(answer.question_id);
            }
        }

        // Count mistakes only from non-marathon sources
        for (const answer of answersForMistakes) {
            if (!answer.is_correct) {
                totalMistakes++;
            }
        }

        res.json({
            questions_attempted: uniqueQuestionIds.size,
            correct_answers: correctQuestionIds.size,
            total_mistakes: totalMistakes,
            date: todayStart.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Get daily stats error:', error);
        res.status(500).json({ error: 'Failed to fetch daily stats' });
    }
});

/**
 * GET /api/analytics/weak-areas
 * Get concepts where user needs improvement
 * Returns weak concepts with topic and subject info
 */
router.get('/weak-areas', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { limit = 10 } = req.query;

        // Get weak/developing concepts from user_concept_stats
        const { data: weakConcepts, error } = await supabaseAdmin
            .from('user_concept_stats')
            .select(`
                id,
                concept_id,
                accuracy_rate,
                proficiency_level,
                total_attempts,
                correct_attempts,
                next_review_date,
                recent_trend,
                last_practiced,
                concept:concepts(
                    id,
                    name,
                    topic:topics(
                        id,
                        name,
                        subject:subjects(id, name, icon, color)
                    )
                )
            `)
            .eq('user_id', userId)
            .in('proficiency_level', ['weak', 'developing', 'unknown'])
            .order('accuracy_rate', { ascending: true })
            .limit(Number(limit));

        if (error) throw error;

        // Also get concepts due for review (spaced repetition)
        const today = new Date().toISOString().split('T')[0];
        const { data: dueForReview } = await supabaseAdmin
            .from('user_concept_stats')
            .select(`
                id,
                concept_id,
                accuracy_rate,
                proficiency_level,
                total_attempts,
                correct_attempts,
                next_review_date,
                recent_trend,
                last_practiced,
                concept:concepts(
                    id,
                    name,
                    topic:topics(
                        id,
                        name,
                        subject:subjects(id, name, icon, color)
                    )
                )
            `)
            .eq('user_id', userId)
            .not('proficiency_level', 'in', '(weak,developing,unknown)')
            .lte('next_review_date', today)
            .order('next_review_date', { ascending: true })
            .limit(5);

        // Format the response
        const formatConcept = (item: any) => {
            const concept = item.concept;
            const topic = concept?.topic;
            const subject = topic?.subject;

            return {
                id: item.id,
                concept_id: item.concept_id,
                concept_name: concept?.name || 'Unknown Concept',
                topic_id: topic?.id,
                topic_name: topic?.name || 'Unknown Topic',
                subject_id: subject?.id,
                subject_name: subject?.name || 'Unknown Subject',
                subject_icon: subject?.icon || '📚',
                subject_color: subject?.color || '#3b82f6',
                accuracy_rate: Math.round(item.accuracy_rate || 0),
                proficiency_level: item.proficiency_level,
                total_attempts: item.total_attempts,
                correct_attempts: item.correct_attempts,
                next_review_date: item.next_review_date,
                recent_trend: item.recent_trend,
                last_practiced: item.last_practiced
            };
        };

        const weakAreasFormatted = (weakConcepts || []).map(formatConcept);
        const dueForReviewFormatted = (dueForReview || []).map(formatConcept);

        res.json({
            weak_areas: weakAreasFormatted,
            due_for_review: dueForReviewFormatted,
            total_weak: weakAreasFormatted.length,
            total_due: dueForReviewFormatted.length
        });
    } catch (error) {
        console.error('Get weak areas error:', error);
        res.status(500).json({ error: 'Failed to fetch weak areas' });
    }
});

/**
 * GET /api/analytics/concept-progress
 * Get overall concept mastery progress
 */
router.get('/concept-progress', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Get proficiency level counts
        const { data: stats } = await supabaseAdmin
            .from('user_concept_stats')
            .select('proficiency_level')
            .eq('user_id', userId);

        const levelCounts = {
            mastered: 0,
            strong: 0,
            medium: 0,
            developing: 0,
            weak: 0,
            unknown: 0
        };

        for (const stat of stats || []) {
            const level = stat.proficiency_level as keyof typeof levelCounts;
            if (level in levelCounts) {
                levelCounts[level]++;
            }
        }

        const totalConcepts = stats?.length || 0;
        const masteredPercent = totalConcepts > 0
            ? Math.round(((levelCounts.mastered + levelCounts.strong) / totalConcepts) * 100)
            : 0;

        res.json({
            total_concepts: totalConcepts,
            mastered_percent: masteredPercent,
            levels: levelCounts
        });
    } catch (error) {
        console.error('Get concept progress error:', error);
        res.status(500).json({ error: 'Failed to fetch concept progress' });
    }
});

export default router;

