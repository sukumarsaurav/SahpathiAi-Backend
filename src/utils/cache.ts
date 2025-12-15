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
} as const;

// Key prefixes
const KEYS = {
    question: (id: string) => `q:${id}`,
    topicQuestions: (topicId: string, langId?: string) => `t:${topicId}:q${langId ? `:${langId}` : ''}`,
    examTree: (examId: string) => `e:${examId}:tree`,
    userDashboard: (userId: string) => `u:${userId}:dash`,
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
    invalidate,
    invalidateQuestion,
    isConnected,
    getMemoryInfo,
    KEYS,
    TTL,
};

export default cache;
