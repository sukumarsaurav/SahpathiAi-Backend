import { Router } from 'express';
import { supabase, supabaseAdmin } from '../db/supabase';
import { authenticate, optionalAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/subjects/:subjectId
 * Get subject details with user stats
 */
router.get('/:subjectId', optionalAuth, async (req, res) => {
    try {
        const { subjectId } = req.params;

        // Get subject details
        const { data: subjectData, error } = await supabaseAdmin
            .from('exam_subjects')
            .select('*, exam:exams(*), subject_details:subjects(*)')
            .eq('id', subjectId)
            .single();

        if (error) throw error;

        // Flatten subject details
        const subject = {
            ...subjectData,
            name: subjectData.subject_details?.name,
            icon: subjectData.subject_details?.icon,
            color: subjectData.subject_details?.color,
            description: subjectData.subject_details?.description
        };

        // Get user progress if authenticated
        let userProgress = null;
        if (req.user) {
            // Get user's attempts for tests in this subject using join
            const { data: attempts } = await supabase
                .from('test_attempts')
                .select('score, total_questions, test:tests!inner(subject_id)')
                .eq('user_id', req.user.id)
                .eq('test.subject_id', subjectId);

            if (attempts && attempts.length > 0) {
                const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);
                const totalQuestions = attempts.reduce((sum, a) => sum + a.total_questions, 0);
                userProgress = {
                    tests_taken: attempts.length,
                    avg_score: totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0
                };
            }
        }

        res.json({ ...subject, user_progress: userProgress });
    } catch (error) {
        console.error('Get subject error:', error);
        res.status(500).json({ error: 'Failed to fetch subject' });
    }
});

/**
 * GET /api/subjects/:subjectId/topics
 * Get topics with user progress including total/attempted/correct counts
 */
router.get('/:subjectId/topics', optionalAuth, async (req, res) => {
    try {
        const { subjectId } = req.params;

        // 1. Get Master Subject ID and Exam ID from the junction table info
        const { data: examSubject, error: subjectError } = await supabaseAdmin
            .from('exam_subjects')
            .select('subject_id, exam_id')
            .eq('id', subjectId)
            .single();

        if (subjectError || !examSubject) {
            throw new Error('Subject context not found');
        }

        // 2. Fetch topics that are common (exam_id is null) OR specific to this exam
        const { data: topics, error } = await supabaseAdmin
            .from('topics')
            .select('*')
            .eq('subject_id', examSubject.subject_id) // Link to Master Subject
            .or(`exam_id.is.null,exam_id.eq.${examSubject.exam_id}`) // Standard logic: Common or Specific
            .eq('is_active', true)
            .order('order_index');

        if (error) throw error;

        if (!topics) return res.json([]);

        // Get question counts per topic
        const topicIds = topics.map(t => t.id);
        const { data: questionCounts } = await supabaseAdmin
            .from('questions')
            .select('topic_id')
            .in('topic_id', topicIds)
            .eq('is_active', true);

        // Build topic -> question count map
        const topicQuestionCount = new Map<string, number>();
        questionCounts?.forEach(q => {
            topicQuestionCount.set(q.topic_id, (topicQuestionCount.get(q.topic_id) || 0) + 1);
        });

        // Add user progress if authenticated
        if (req.user) {
            // Get user's test attempts
            const { data: userAttempts } = await supabaseAdmin
                .from('test_attempts')
                .select('id')
                .eq('user_id', req.user.id);

            const attemptIds = userAttempts?.map(a => a.id) || [];

            // Get all user answers for these attempts
            let userAnswersMap = new Map<string, { attempted: number; correct: number }>();

            if (attemptIds.length > 0) {
                const { data: userAnswers } = await supabaseAdmin
                    .from('user_answers')
                    .select('is_correct, question_id, question:questions!inner(topic_id)')
                    .in('attempt_id', attemptIds);

                // Group by topic
                userAnswers?.forEach((answer: any) => {
                    const topicId = answer.question?.topic_id;
                    if (topicId) {
                        const current = userAnswersMap.get(topicId) || { attempted: 0, correct: 0 };
                        current.attempted++;
                        if (answer.is_correct) current.correct++;
                        userAnswersMap.set(topicId, current);
                    }
                });
            }

            const topicsWithProgress = topics.map(topic => {
                const totalQuestions = topicQuestionCount.get(topic.id) || topic.question_count || 0;
                const progress = userAnswersMap.get(topic.id) || { attempted: 0, correct: 0 };

                return {
                    ...topic,
                    total_questions: totalQuestions,
                    user_progress: {
                        total_questions: totalQuestions,
                        questions_attempted: progress.attempted,
                        correct_answers: progress.correct,
                        accuracy: progress.attempted > 0 ? Math.round((progress.correct / progress.attempted) * 100) : 0
                    }
                };
            });

            return res.json(topicsWithProgress);
        }

        // Return topics with question counts (no user progress)
        const topicsWithCounts = topics.map(topic => ({
            ...topic,
            total_questions: topicQuestionCount.get(topic.id) || topic.question_count || 0
        }));

        res.json(topicsWithCounts);
    } catch (error) {
        console.error('Get topics error:', error);
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
});

/**
 * GET /api/subjects/:subjectId/tests
 * Get tests for a subject
 */
router.get('/:subjectId/tests', async (req, res) => {
    try {
        const { subjectId } = req.params;

        const { data, error } = await supabase
            .from('tests')
            .select('*')
            .eq('subject_id', subjectId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get subject tests error:', error);
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
});

/**
 * GET /api/subjects/:subjectId/resources
 * Get learning resources for a subject
 */
router.get('/:subjectId/resources', optionalAuth, async (req, res) => {
    try {
        const { subjectId } = req.params;

        // Get user's language preference if authenticated
        let preferredLanguageId = null;
        if (req.user?.id) {
            const { data: userPref } = await supabase
                .from('user_preferences')
                .select('preferred_language_id')
                .eq('user_id', req.user.id)
                .single();
            preferredLanguageId = userPref?.preferred_language_id;
        }

        let query = supabaseAdmin
            .from('resources')
            .select('*')
            .eq('exam_subject_id', subjectId)
            .order('created_at', { ascending: false });

        // Filter by language: show resources in user's preferred language OR resources with no language set
        if (preferredLanguageId) {
            query = query.or(`language_id.eq.${preferredLanguageId},language_id.is.null`);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get resources error:', error);
        res.status(500).json({ error: 'Failed to fetch resources' });
    }
});

/**
 * GET /api/subjects/:subjectId/analytics
 * Get user's analytics for a subject with topic-wise breakdown
 * Aggregates data from Regular Tests, Custom Tests, Marathon, and Daily Practice
 */
router.get('/:subjectId/analytics', authenticate, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const userId = req.user!.id;

        // 1. Get exam subject info to get master subject_id
        const { data: examSubject } = await supabaseAdmin
            .from('exam_subjects')
            .select('subject_id, exam_id')
            .eq('id', subjectId)
            .single();

        if (!examSubject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // 2. Get topics for this subject
        const { data: topics } = await supabaseAdmin
            .from('topics')
            .select('id, name')
            .eq('subject_id', examSubject.subject_id)
            .or(`exam_id.is.null,exam_id.eq.${examSubject.exam_id}`)
            .eq('is_active', true);

        if (!topics || topics.length === 0) {
            return res.json({
                total_tests: 0,
                avg_score: 0,
                best_score: 0,
                total_time_hours: 0,
                recent_tests: [],
                topic_analytics: []
            });
        }

        const topicIds = topics.map(t => t.id);

        // 3. AGGREGATE ANSWERS FROM ALL SOURCES
        // We need all answers by this user for questions belonging to these topics

        // A. Regular Tests
        const { data: testAttemptIds } = await supabaseAdmin
            .from('test_attempts')
            .select('id')
            .eq('user_id', userId);

        let regularAnswers: any[] = [];
        if (testAttemptIds && testAttemptIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('user_answers')
                .select('is_correct, time_taken_seconds, question:questions!inner(topic_id)')
                .in('attempt_id', testAttemptIds.map(a => a.id))
                .in('question.topic_id', topicIds); // Filter by subject topics
            regularAnswers = data || [];
        }

        // B. Custom Tests
        const { data: customTestIds } = await supabaseAdmin
            .from('custom_tests')
            .select('id')
            .eq('user_id', userId);

        let customAnswers: any[] = [];
        if (customTestIds && customTestIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('custom_test_questions')
                .select('is_correct, time_taken_seconds, question:questions!inner(topic_id)')
                .in('custom_test_id', customTestIds.map(t => t.id))
                .not('answered_at', 'is', null) // Only answered questions
                .in('question.topic_id', topicIds);
            customAnswers = data || [];
        }

        // C. Marathon
        const { data: marathonSessionIds } = await supabaseAdmin
            .from('marathon_sessions')
            .select('id')
            .eq('user_id', userId);

        let marathonAnswers: any[] = [];
        if (marathonSessionIds && marathonSessionIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('marathon_answers')
                .select('is_correct, time_taken_seconds, question:questions!inner(topic_id)')
                .in('session_id', marathonSessionIds.map(s => s.id))
                .in('question.topic_id', topicIds);
            marathonAnswers = data || [];
        }

        // D. Daily Practice
        const { data: dailySessionIds } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('id')
            .eq('user_id', userId);

        let dailyAnswers: any[] = [];
        if (dailySessionIds && dailySessionIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('daily_practice_questions')
                .select('is_correct, time_taken_seconds, question:questions!inner(topic_id)')
                .in('session_id', dailySessionIds.map(s => s.id))
                .eq('is_answered', true) // Only answered questions
                .in('question.topic_id', topicIds);
            dailyAnswers = data || [];
        }

        // Combine all answers
        const allAnswers = [
            ...regularAnswers,
            ...customAnswers,
            ...marathonAnswers,
            ...dailyAnswers
        ];

        // 4. Calculate Topic-wise Analytics
        const topicStats = new Map<string, { attempted: number; correct: number }>();

        allAnswers.forEach(answer => {
            const topicId = answer.question?.topic_id;
            if (topicId) {
                const current = topicStats.get(topicId) || { attempted: 0, correct: 0 };
                current.attempted++;
                if (answer.is_correct) current.correct++;
                topicStats.set(topicId, current);
            }
        });

        const topicAnalytics = topics.map(topic => {
            const stats = topicStats.get(topic.id) || { attempted: 0, correct: 0 };
            return {
                id: topic.id,
                name: topic.name,
                questions_attempted: stats.attempted,
                correct_answers: stats.correct,
                accuracy: stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0
            };
        }).filter(t => t.questions_attempted > 0); // Only show topics with activity

        // 5. Calculate Overall Stats
        const totalAttempts = allAnswers.length;
        const totalCorrect = allAnswers.filter(a => a.is_correct).length;
        const avgScore = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

        // Total Time (convert seconds to hours)
        const totalSeconds = allAnswers.reduce((sum, a) => sum + (Number(a.time_taken_seconds) || 0), 0);
        const totalTimeHours = Math.round(totalSeconds / 3600 * 10) / 10;

        // Total "Tests" (Sessions) relevant to this subject
        // For Regular Tests: Filter attempts that belong to this subject
        const { count: regularTestCount } = await supabaseAdmin
            .from('test_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('test.subject_id', subjectId) // test.subject_id works if we joined, but here we need inner join logic or check logic
            // To be accurate with RLS/joins, let's just query attempts for tests linked to this subject
            .not('completed_at', 'is', null);
        // Note: Exact filtering on test->subject might effectively be done by the answer filter, 
        // but for "Test Count" we stick to the simpler count of *sessions* if possible.
        // A simpler proxy: Just count distinct sessions involved in the answers? 
        // Better: Let's count properly from the tables if we can link them to the subject.
        // Actually, CustomTests and Marathon store 'exam_subject_id'. Regular tests store 'subject_id' (which is exam_subject_id equivalent).

        // Re-count sessions with explicit subject check
        const { count: testsCount } = await supabaseAdmin
            .from('test_attempts')
            .select('*, test:tests!inner(subject_id)', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('test.subject_id', subjectId);

        const { count: customCount } = await supabaseAdmin
            .from('custom_tests')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('exam_subject_id', subjectId)
            .eq('status', 'completed');

        const { count: marathonCount } = await supabaseAdmin
            .from('marathon_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('exam_subject_id', subjectId)
            .not('status', 'eq', 'active'); // Completed or Exited sessions

        const totalTests = (testsCount || 0) + (customCount || 0) + (marathonCount || 0);

        // Best Score (from Regular Tests + Custom Tests)
        // Marathon doesn't have a single "score" effectively.
        const { data: regularScores } = await supabaseAdmin
            .from('test_attempts')
            .select('percentage')
            .eq('user_id', userId)
            .eq('test.subject_id', subjectId) // joined query usually needs !inner if filtering on joined prop
            // Let's use the explicit query again for safety
            .or(`test.subject_id.eq.${subjectId}`); // This syntax is tricky without explicit join.
        // Correct approach:

        const { data: bestTest } = await supabaseAdmin
            .from('test_attempts')
            .select('percentage, test:tests!inner(subject_id)')
            .eq('user_id', userId)
            .eq('test.subject_id', subjectId)
            .order('percentage', { ascending: false })
            .limit(1);

        const bestRegular = bestTest?.[0]?.percentage || 0;

        // Best Custom
        // Custom tests store score implicitly? No, we calculate it. 
        // For simplicity, let's sticking to best regular test score or 0 if none.
        // Or we can calculate best custom if needed, but it's expensive to calc for all.
        const bestScore = bestRegular;

        // 6. Recent Activity (Tests + Custom + Marathon)
        // fetch last 5 sessions of any type for this subject

        // Regular
        const { data: recentRegular } = await supabaseAdmin
            .from('test_attempts')
            .select('*, test:tests!inner(id, title, subject_id)')
            .eq('user_id', userId)
            .eq('test.subject_id', subjectId)
            .order('completed_at', { ascending: false })
            .limit(5);

        const recentActivity = (recentRegular || []).map(r => ({
            test: { title: (r.test as any)?.title },
            score: r.score,
            total_questions: r.total_questions,
            percentage: r.percentage,
            time_taken_seconds: r.time_taken_seconds,
            completed_at: r.completed_at
        }));

        res.json({
            total_tests: totalTests,
            avg_score: avgScore,
            best_score: bestScore,
            total_time_hours: totalTimeHours,
            recent_tests: recentActivity,
            topic_analytics: topicAnalytics
        });
    } catch (error) {
        console.error('Get subject analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * GET /api/subjects/:subjectId/tests-by-topic
 * Get tests grouped by topic for a subject
 */
router.get('/:subjectId/tests-by-topic', async (req, res) => {
    try {
        const { subjectId } = req.params;

        // Get exam subject info
        const { data: examSubject, error: examSubjectError } = await supabaseAdmin
            .from('exam_subjects')
            .select('subject_id, exam_id')
            .eq('id', subjectId)
            .single();

        if (examSubjectError || !examSubject) {
            console.error('Exam subject lookup error:', examSubjectError);
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Get topics for this subject
        const { data: topics, error: topicsError } = await supabaseAdmin
            .from('topics')
            .select('id, name')
            .eq('subject_id', examSubject.subject_id)
            .or(`exam_id.is.null,exam_id.eq.${examSubject.exam_id}`)
            .eq('is_active', true)
            .order('order_index');

        if (topicsError) {
            console.error('Topics fetch error:', topicsError);
        }

        // Get all exam_subjects that share the same master subject_id and exam_id
        // This allows us to show tests from related exam_subjects
        const { data: relatedExamSubjects } = await supabaseAdmin
            .from('exam_subjects')
            .select('id')
            .eq('subject_id', examSubject.subject_id)
            .eq('exam_id', examSubject.exam_id);

        const relatedSubjectIds = relatedExamSubjects?.map(es => es.id) || [subjectId];

        // Get all tests for this subject WITH category info
        // Include tests that:
        // 1. Have subject_id matching any related exam_subject
        // 2. OR have the same exam_id with null subject_id (exam-wide tests)
        const { data: testsDirectSubject, error: testsError1 } = await supabaseAdmin
            .from('tests')
            .select(`
                id,
                title,
                description,
                test_category_id,
                duration_minutes,
                difficulty,
                created_at,
                subject_id,
                exam_id,
                test_category:test_categories(id, slug, name)
            `)
            .in('subject_id', relatedSubjectIds)
            .eq('is_active', true);

        // Also get tests where exam_id matches but subject_id is null (exam-wide tests)
        const { data: testsExamWide, error: testsError2 } = await supabaseAdmin
            .from('tests')
            .select(`
                id,
                title,
                description,
                test_category_id,
                duration_minutes,
                difficulty,
                created_at,
                subject_id,
                exam_id,
                test_category:test_categories(id, slug, name)
            `)
            .eq('exam_id', examSubject.exam_id)
            .is('subject_id', null)
            .eq('is_active', true);

        if (testsError1) {
            console.error('Tests fetch error (direct):', testsError1);
            throw testsError1;
        }
        if (testsError2) {
            console.error('Tests fetch error (exam-wide):', testsError2);
        }

        // Combine tests, avoiding duplicates
        const testsMap = new Map<string, any>();
        [...(testsDirectSubject || []), ...(testsExamWide || [])].forEach(test => {
            testsMap.set(test.id, test);
        });
        const tests = Array.from(testsMap.values());

        // If no tests, return empty array
        if (!tests || tests.length === 0) {
            return res.json([]);
        }

        // Get test_questions with their topic info separately for each test
        const testIds = tests.map(t => t.id);
        const { data: testQuestions, error: tqError } = await supabaseAdmin
            .from('test_questions')
            .select('test_id, question:questions(topic_id)')
            .in('test_id', testIds);

        if (tqError) {
            console.error('Test questions fetch error:', tqError);
        }

        // Build a map of test_id -> topic counts
        const testTopicCounts = new Map<string, Map<string, number>>();
        testQuestions?.forEach((tq: any) => {
            const topicId = tq.question?.topic_id;
            if (topicId) {
                if (!testTopicCounts.has(tq.test_id)) {
                    testTopicCounts.set(tq.test_id, new Map());
                }
                const topicMap = testTopicCounts.get(tq.test_id)!;
                topicMap.set(topicId, (topicMap.get(topicId) || 0) + 1);
            }
        });

        // Also build test question count
        const testQuestionCounts = new Map<string, number>();
        testQuestions?.forEach((tq: any) => {
            testQuestionCounts.set(tq.test_id, (testQuestionCounts.get(tq.test_id) || 0) + 1);
        });

        // Group tests by topic
        const topicMap = new Map(topics?.map(t => [t.id, t.name]) || []);

        // Separate tests into "topic-wise" and "subject-wise" categories
        const topicWiseTests: any[] = [];
        const subjectWiseTests: any[] = [];

        tests.forEach(test => {
            // Get the category slug from the joined test_category
            const categorySlug = (test.test_category as any)?.slug || '';

            const testWithCount = {
                id: test.id,
                title: test.title,
                description: test.description,
                category: categorySlug, // Use slug as category string for frontend
                duration_minutes: test.duration_minutes,
                difficulty: test.difficulty,
                question_count: testQuestionCounts.get(test.id) || 0
            };

            // Categorize based on the test category slug
            if (categorySlug === 'topic-wise') {
                topicWiseTests.push(testWithCount);
            } else if (categorySlug === 'subject-wise' || categorySlug === 'full-length' || categorySlug === 'previous-year') {
                subjectWiseTests.push(testWithCount);
            } else {
                // Default to subject-wise for any other category
                subjectWiseTests.push(testWithCount);
            }
        });

        // Build result array
        const result: any[] = [];

        if (topicWiseTests.length > 0) {
            result.push({
                topic_id: 'topic-wise',
                topic_name: 'Topic Wise',
                tests: topicWiseTests
            });
        }

        if (subjectWiseTests.length > 0) {
            result.push({
                topic_id: 'subject-wise',
                topic_name: 'Subject Wise',
                tests: subjectWiseTests
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Get tests by topic error:', error);
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
});

export default router;

