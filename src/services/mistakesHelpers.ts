import { supabaseAdmin } from '../db/supabase';

/**
 * Shared data fetching helpers for mistakes-related queries
 */

export interface QuestionData {
    id: string;
    topic_id: string | null;
    correct_answer_index: number;
    difficulty?: string;
}

export interface TopicData {
    id: string;
    name: string;
    subject_id: string;
}

export interface TranslationData {
    question_id: string;
    language_id: string;
    question_text: string;
    options: string[];
    explanation?: string;
}

/**
 * Fetch questions by IDs
 */
export async function fetchQuestionsByIds(questionIds: string[]): Promise<QuestionData[]> {
    if (!questionIds.length) return [];
    const { data } = await supabaseAdmin
        .from('questions')
        .select('id, topic_id, correct_answer_index, difficulty')
        .in('id', questionIds);
    return data || [];
}

/**
 * Fetch topics by IDs
 */
export async function fetchTopicsByIds(topicIds: string[]): Promise<TopicData[]> {
    if (!topicIds.length) return [];
    const { data } = await supabaseAdmin
        .from('topics')
        .select('id, name, subject_id')
        .in('id', topicIds);
    return data || [];
}

/**
 * Fetch translations for questions in preferred language
 */
export async function fetchTranslations(
    questionIds: string[],
    preferredLanguageId?: string
): Promise<TranslationData[]> {
    if (!questionIds.length) return [];
    const { data } = await supabaseAdmin
        .from('question_translations')
        .select('question_id, language_id, question_text, options, explanation')
        .in('question_id', questionIds);

    if (!data) return [];

    // If preferred language specified, prefer those translations
    if (preferredLanguageId) {
        const preferredMap = new Map<string, TranslationData>();
        const fallbackMap = new Map<string, TranslationData>();

        for (const t of data) {
            if (t.language_id === preferredLanguageId) {
                preferredMap.set(t.question_id, t);
            } else if (!fallbackMap.has(t.question_id)) {
                fallbackMap.set(t.question_id, t);
            }
        }

        // Merge preferred with fallback
        return questionIds.map(qId =>
            preferredMap.get(qId) || fallbackMap.get(qId)
        ).filter((t): t is TranslationData => !!t);
    }

    return data;
}

/**
 * Build lookup maps for efficient access
 */
export function buildLookupMaps(
    questions: QuestionData[],
    topics: TopicData[],
    translations: TranslationData[]
) {
    const questionMap = new Map(questions.map(q => [q.id, q]));
    const topicMap = new Map(topics.map(t => [t.id, t]));
    const translationMap = new Map(translations.map(t => [t.question_id, t]));

    return { questionMap, topicMap, translationMap };
}
