/**
 * Personalization Service
 * 
 * Handles concept stats tracking and proficiency calculations
 * Uses hybrid approach:
 * - Real-time: Update counters (total_attempts, correct_attempts, last_practiced)
 * - Batch: Calculate proficiency metrics on session completion
 */

import { supabaseAdmin } from '../db/supabase';

/**
 * Update concept stats in real-time after each answer
 * Called immediately after a question is answered
 */
export async function updateConceptStatsRealtime(
    userId: string,
    questionId: string,
    isCorrect: boolean,
    timeTakenSeconds: number
): Promise<void> {
    try {
        // Get concepts linked to this question
        const { data: concepts } = await supabaseAdmin
            .from('question_concepts')
            .select('concept_id')
            .eq('question_id', questionId);

        if (!concepts || concepts.length === 0) {
            // Question not linked to any concepts, skip
            return;
        }

        // Update stats for each concept
        for (const { concept_id } of concepts) {
            // Check if user already has stats for this concept
            const { data: existingStats } = await supabaseAdmin
                .from('user_concept_stats')
                .select('id, total_attempts, correct_attempts, avg_time_seconds')
                .eq('user_id', userId)
                .eq('concept_id', concept_id)
                .single();

            if (existingStats) {
                // Update existing stats
                const newTotalAttempts = existingStats.total_attempts + 1;
                const newCorrectAttempts = existingStats.correct_attempts + (isCorrect ? 1 : 0);

                // Calculate new average time (running average)
                const oldAvg = existingStats.avg_time_seconds || 0;
                const newAvgTime = oldAvg > 0
                    ? (oldAvg * existingStats.total_attempts + timeTakenSeconds) / newTotalAttempts
                    : timeTakenSeconds;

                await supabaseAdmin
                    .from('user_concept_stats')
                    .update({
                        total_attempts: newTotalAttempts,
                        correct_attempts: newCorrectAttempts,
                        avg_time_seconds: newAvgTime,
                        last_practiced: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingStats.id);
            } else {
                // Create new stats record
                await supabaseAdmin
                    .from('user_concept_stats')
                    .insert({
                        user_id: userId,
                        concept_id: concept_id,
                        total_attempts: 1,
                        correct_attempts: isCorrect ? 1 : 0,
                        avg_time_seconds: timeTakenSeconds,
                        last_practiced: new Date().toISOString(),
                        proficiency_level: 'unknown',
                        accuracy_rate: isCorrect ? 100 : 0
                    });
            }
        }
    } catch (error) {
        console.error('[Personalization] Failed to update concept stats:', error);
        // Don't throw - we don't want to break the main flow
    }
}

/**
 * Calculate proficiency metrics for concepts (batch operation)
 * Called when a session is completed
 */
export async function calculateConceptProficiency(
    userId: string,
    questionIds: string[]
): Promise<void> {
    try {
        if (questionIds.length === 0) return;

        // Get all concepts linked to these questions
        const { data: questionConcepts } = await supabaseAdmin
            .from('question_concepts')
            .select('concept_id')
            .in('question_id', questionIds);

        if (!questionConcepts || questionConcepts.length === 0) return;

        // Get unique concept IDs
        const conceptIds = [...new Set(questionConcepts.map(qc => qc.concept_id))];

        // Update proficiency for each concept
        for (const conceptId of conceptIds) {
            const { data: stats } = await supabaseAdmin
                .from('user_concept_stats')
                .select('*')
                .eq('user_id', userId)
                .eq('concept_id', conceptId)
                .single();

            if (!stats) continue;

            // Calculate accuracy rate
            const accuracyRate = stats.total_attempts > 0
                ? (stats.correct_attempts / stats.total_attempts) * 100
                : 0;

            // Determine proficiency level based on accuracy and attempts
            const proficiencyLevel = calculateProficiencyLevel(
                accuracyRate,
                stats.total_attempts
            );

            // Calculate next review date using spaced repetition
            const nextReviewDate = calculateNextReviewDate(
                proficiencyLevel,
                stats.correct_attempts,
                stats.total_attempts
            );

            // Determine recent trend (would need historical data, simplified here)
            const recentTrend = determineRecentTrend(accuracyRate, stats.accuracy_rate);

            // Calculate confidence score (0-100)
            const confidenceScore = calculateConfidenceScore(
                stats.total_attempts,
                accuracyRate
            );

            // Update stats
            await supabaseAdmin
                .from('user_concept_stats')
                .update({
                    accuracy_rate: accuracyRate,
                    proficiency_level: proficiencyLevel,
                    next_review_date: nextReviewDate,
                    recent_trend: recentTrend,
                    confidence_score: confidenceScore,
                    updated_at: new Date().toISOString()
                })
                .eq('id', stats.id);
        }
    } catch (error) {
        console.error('[Personalization] Failed to calculate proficiency:', error);
        // Don't throw - we don't want to break the main flow
    }
}

/**
 * Calculate proficiency level based on accuracy and attempt count
 */
function calculateProficiencyLevel(accuracyRate: number, totalAttempts: number): string {
    // Need minimum attempts for reliable proficiency
    if (totalAttempts < 2) return 'unknown';

    if (accuracyRate >= 90 && totalAttempts >= 10) return 'mastered';
    if (accuracyRate >= 75 && totalAttempts >= 5) return 'strong';
    if (accuracyRate >= 50 && totalAttempts >= 3) return 'medium';
    if (accuracyRate >= 25 && totalAttempts >= 2) return 'developing';
    return 'weak';
}

/**
 * Calculate next review date using simplified spaced repetition
 * Better proficiency = longer interval before review
 */
function calculateNextReviewDate(
    proficiencyLevel: string,
    correctAttempts: number,
    totalAttempts: number
): string {
    const today = new Date();
    let daysToAdd = 1; // Default: review tomorrow

    // Base interval on proficiency level
    switch (proficiencyLevel) {
        case 'mastered':
            daysToAdd = 30; // Review in a month
            break;
        case 'strong':
            daysToAdd = 14; // Review in 2 weeks
            break;
        case 'medium':
            daysToAdd = 7; // Review in a week
            break;
        case 'developing':
            daysToAdd = 3; // Review in 3 days
            break;
        case 'weak':
            daysToAdd = 1; // Review tomorrow
            break;
        default:
            daysToAdd = 1;
    }

    // Adjust based on streak (consecutive correct answers bonus)
    const streakBonus = Math.min(correctAttempts, 5); // Cap at 5
    daysToAdd += streakBonus;

    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate.toISOString().split('T')[0]; // Return YYYY-MM-DD
}

/**
 * Determine if user is improving, stable, or declining
 */
function determineRecentTrend(newAccuracy: number, oldAccuracy: number | null): string {
    if (oldAccuracy === null) return 'stable';

    const difference = newAccuracy - oldAccuracy;
    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
}

/**
 * Calculate confidence score (0-100) based on attempts and accuracy
 * More attempts + higher accuracy = higher confidence
 */
function calculateConfidenceScore(totalAttempts: number, accuracyRate: number): number {
    // Weight accuracy more heavily, but require minimum attempts
    const attemptsWeight = Math.min(totalAttempts / 20, 1); // Max out at 20 attempts
    const accuracyWeight = accuracyRate / 100;

    // Combined score with attempts providing a multiplier
    const score = accuracyWeight * 100 * (0.5 + 0.5 * attemptsWeight);
    return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Get concepts that need review for a user (due for spaced repetition)
 */
export async function getConceptsDueForReview(userId: string, limit: number = 10) {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabaseAdmin
        .from('user_concept_stats')
        .select(`
            concept_id,
            proficiency_level,
            next_review_date,
            concept:concepts(id, name, topic_id)
        `)
        .eq('user_id', userId)
        .lte('next_review_date', today)
        .order('next_review_date', { ascending: true })
        .limit(limit);

    return data || [];
}

/**
 * Get user's weak concepts
 */
export async function getWeakConcepts(userId: string, limit: number = 10) {
    const { data } = await supabaseAdmin
        .from('user_concept_stats')
        .select(`
            concept_id,
            accuracy_rate,
            proficiency_level,
            total_attempts,
            concept:concepts(id, name, topic_id)
        `)
        .eq('user_id', userId)
        .in('proficiency_level', ['weak', 'developing'])
        .order('accuracy_rate', { ascending: true })
        .limit(limit);

    return data || [];
}
