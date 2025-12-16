import { createClient, RedisClientType } from 'redis';

// Redis Labs connection (30MB free tier)
// Configuration from environment or defaults
const REDIS_CONFIG = {
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
};

let client: RedisClientType | null = null;

// Initialize Redis connection
async function initRedis(): Promise<RedisClientType | null> {
    if (!REDIS_CONFIG.password || !REDIS_CONFIG.host) {
        console.log('⚠️ Redis not configured - caching disabled');
        return null;
    }

    try {
        const redisClient = createClient({
            username: REDIS_CONFIG.username,
            password: REDIS_CONFIG.password,
            socket: {
                host: REDIS_CONFIG.host,
                port: REDIS_CONFIG.port,
            },
        });

        redisClient.on('error', (err) => console.error('❌ Redis error:', err.message));
        redisClient.on('connect', () => console.log('✅ Redis connected'));

        await redisClient.connect();
        return redisClient as RedisClientType;
    } catch (err) {
        console.error('❌ Redis connection failed:', err);
        return null;
    }
}

// Initialize on module load
initRedis().then((c) => {
    client = c;
});

// Cache TTLs (in seconds)
const TTL = {
    QUESTION: 60 * 60,           // 1 hour - individual questions
    TOPIC_QUESTIONS: 30 * 60,    // 30 min - topic question list
    EXAM_TREE: 24 * 60 * 60,     // 24 hours - exam/subject/topic hierarchy
    USER_DASHBOARD: 5 * 60,      // 5 min - user stats
    // Static data caching
    EXAM_CATEGORIES: 24 * 60 * 60,   // 24 hours - exam categories
    EXAMS: 24 * 60 * 60,             // 24 hours - exams list
    EXAM_SUBJECTS: 24 * 60 * 60,     // 24 hours - subjects for an exam
    TOPICS: 12 * 60 * 60,            // 12 hours - topics for a subject
    SUBSCRIPTION_PLANS: 6 * 60 * 60, // 6 hours - subscription plans
    // New TTLs
    LANGUAGES: 24 * 60 * 60,         // 24 hours - languages never change
    TEST_CATEGORIES: 12 * 60 * 60,   // 12 hours - test categories with counts
    TESTS_LIST: 12 * 60 * 60,        // 12 hours - tests by category
    TEST_WITH_QUESTIONS: 60 * 60,    // 1 hour - test with questions
} as const;

// Key prefixes
const KEYS = {
    question: (id: string) => `q:${id}`,
    topicQuestions: (topicId: string, langId?: string) => `t:${topicId}:q${langId ? `:${langId}` : ''}`,
    examTree: (examId: string) => `e:${examId}:tree`,
    userDashboard: (userId: string) => `u:${userId}:dash`,
    // Static data keys
    examCategories: () => 'ec:all',
    exams: (categoryId?: string) => categoryId ? `ex:cat:${categoryId}` : 'ex:all',
    examDetails: (examId: string) => `ex:${examId}`,
    examSubjects: (examId: string) => `ex:${examId}:subj`,
    topics: (subjectId: string, examId?: string) => `top:${subjectId}${examId ? `:ex:${examId}` : ''}`,
    subscriptionPlans: () => 'sp:all',
    // New keys for tests and languages
    languages: () => 'lang:all',
    testCategories: (examId?: string) => examId ? `tc:exam:${examId}` : 'tc:all',
    testsByCategory: (categoryId: string, examId?: string) => `tests:cat:${categoryId}${examId ? `:ex:${examId}` : ''}`,
    testWithQuestions: (testId: string) => `test:${testId}:full`,
} as const;

// =====================================================
// CACHE OPERATIONS
// =====================================================

/**
 * Get cached question with translations
 */
export async function getQuestion(questionId: string): Promise<any | null> {
    if (!client) return null;
    try {
        const cached = await client.get(KEYS.question(questionId));
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error('Cache get error:', err);
        return null;
    }
}

/**
 * Cache question with translations
 */
export async function setQuestion(questionId: string, data: any): Promise<void> {
    if (!client) return;
    try {
        // Store minimal data to save memory
        const minimalData = {
            id: data.id,
            topic_id: data.topic_id,
            difficulty: data.difficulty,
            correct_answer_index: data.correct_answer_index,
            translations: data.translations?.map((t: any) => ({
                language_id: t.language_id,
                question_text: t.question_text,
                options: t.options,
                explanation: t.explanation,
            })),
        };
        await client.setEx(KEYS.question(questionId), TTL.QUESTION, JSON.stringify(minimalData));
    } catch (err) {
        console.error('Cache set error:', err);
    }
}

/**
 * Get cached topic questions (list of question IDs or full questions)
 */
export async function getTopicQuestions(topicId: string, languageId?: string): Promise<any[] | null> {
    if (!client) return null;
    try {
        const cached = await client.get(KEYS.topicQuestions(topicId, languageId));
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error('Cache get error:', err);
        return null;
    }
}

/**
 * Cache topic questions
 */
export async function setTopicQuestions(topicId: string, data: any[], languageId?: string): Promise<void> {
    if (!client) return;
    try {
        await client.setEx(KEYS.topicQuestions(topicId, languageId), TTL.TOPIC_QUESTIONS, JSON.stringify(data));
    } catch (err) {
        console.error('Cache set error:', err);
    }
}

/**
 * Get cached exam topic tree
 */
export async function getExamTree(examId: string): Promise<any | null> {
    if (!client) return null;
    try {
        const cached = await client.get(KEYS.examTree(examId));
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error('Cache get error:', err);
        return null;
    }
}

/**
 * Cache exam topic tree
 */
export async function setExamTree(examId: string, data: any): Promise<void> {
    if (!client) return;
    try {
        await client.setEx(KEYS.examTree(examId), TTL.EXAM_TREE, JSON.stringify(data));
    } catch (err) {
        console.error('Cache set error:', err);
    }
}

/**
 * Get cached user dashboard stats
 */
export async function getUserDashboard(userId: string): Promise<any | null> {
    if (!client) return null;
    try {
        const cached = await client.get(KEYS.userDashboard(userId));
        return cached ? JSON.parse(cached) : null;
    } catch (err) {
        console.error('Cache get error:', err);
        return null;
    }
}

/**
 * Cache user dashboard stats
 */
export async function setUserDashboard(userId: string, data: any): Promise<void> {
    if (!client) return;
    try {
        await client.setEx(KEYS.userDashboard(userId), TTL.USER_DASHBOARD, JSON.stringify(data));
    } catch (err) {
        console.error('Cache set error:', err);
    }
}

// =====================================================
// GENERIC CACHE HELPERS
// =====================================================

/**
 * Generic get-or-set helper for caching
 * Returns cached data if available, otherwise fetches and caches
 */
export async function getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
): Promise<T> {
    if (client) {
        try {
            const cached = await client.get(key);
            if (cached) {
                return JSON.parse(cached) as T;
            }
        } catch (err) {
            console.error('Cache get error:', err);
        }
    }

    // Fetch fresh data
    const data = await fetchFn();

    // Cache it
    if (client && data) {
        try {
            await client.setEx(key, ttlSeconds, JSON.stringify(data));
        } catch (err) {
            console.error('Cache set error:', err);
        }
    }

    return data;
}

/**
 * Get cached value directly (or null)
 */
export async function get<T>(key: string): Promise<T | null> {
    if (!client) return null;
    try {
        const cached = await client.get(key);
        return cached ? JSON.parse(cached) as T : null;
    } catch (err) {
        console.error('Cache get error:', err);
        return null;
    }
}

/**
 * Set cached value directly
 */
export async function set(key: string, ttlSeconds: number, data: any): Promise<void> {
    if (!client) return;
    try {
        await client.setEx(key, ttlSeconds, JSON.stringify(data));
    } catch (err) {
        console.error('Cache set error:', err);
    }
}

/**
 * Invalidate cache entries (use when data is updated)
 */
export async function invalidate(...keys: string[]): Promise<void> {
    if (!client || keys.length === 0) return;
    try {
        await client.del(keys);
    } catch (err) {
        console.error('Cache invalidate error:', err);
    }
}

/**
 * Invalidate question cache (use after question update)
 */
export async function invalidateQuestion(questionId: string): Promise<void> {
    await invalidate(KEYS.question(questionId));
}

/**
 * Get Redis connection status
 */
export function isConnected(): boolean {
    return client?.isOpen ?? false;
}

/**
 * Get memory usage info (for debugging)
 */
export async function getMemoryInfo(): Promise<{ used: string; peak: string } | null> {
    if (!client) return null;
    try {
        const info = await client.info('memory');
        const usedMatch = info.match(/used_memory_human:(\S+)/);
        const peakMatch = info.match(/used_memory_peak_human:(\S+)/);
        return {
            used: usedMatch?.[1] || 'unknown',
            peak: peakMatch?.[1] || 'unknown',
        };
    } catch (err) {
        return null;
    }
}

// Export cache object for convenience
export const cache = {
    getQuestion,
    setQuestion,
    getTopicQuestions,
    setTopicQuestions,
    getExamTree,
    setExamTree,
    getUserDashboard,
    setUserDashboard,
    // Generic helpers
    getOrSet,
    get,
    set,
    invalidate,
    invalidateQuestion,
    isConnected,
    getMemoryInfo,
    KEYS,
    TTL,
};

export default cache;

