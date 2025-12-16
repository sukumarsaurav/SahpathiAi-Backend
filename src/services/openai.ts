import { supabaseAdmin } from '../db/supabase';

// OpenAI API types
interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface GeneratedQuestion {
    question_text: string;
    options: string[];
    correct_answer_index: number;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    concept_ids?: string[];
}

interface GenerateQuestionsParams {
    topicName: string;
    concepts: { id: string; name: string; description?: string }[];
    languages: { id: string; code: string; name: string }[];
    difficultyDistribution: { easy: number; medium: number; hard: number };
    count: number;
    customInstructions?: string;
    existingQuestions?: string[]; // For duplicate prevention
}

interface TranslateParams {
    questionText: string;
    options: string[];
    explanation: string;
    targetLanguage: { code: string; name: string };
}

interface SimilarityResult {
    questionId: string;
    questionText: string;
    similarity: number; // 0-1, where 1 is exact match
}

/**
 * Fetch OpenAI API key from admin settings
 */
async function getApiKey(): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'openai_api_key')
            .single();

        if (error || !data) return null;
        return data.setting_value;
    } catch {
        return null;
    }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages: OpenAIMessage[], responseFormat?: 'json'): Promise<any> {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add it in Admin Settings.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.7,
            max_tokens: 4096,
            ...(responseFormat === 'json' && { response_format: { type: 'json_object' } })
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(error.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
}

/**
 * Generate questions using OpenAI
 */
export async function generateQuestions(params: GenerateQuestionsParams): Promise<{
    questions: Record<string, GeneratedQuestion[]>; // Keyed by language code
    warnings: string[];
}> {
    const { topicName, concepts, languages, difficultyDistribution, count, customInstructions, existingQuestions } = params;

    const conceptList = concepts.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n');
    const languageList = languages.map(l => l.name).join(', ');

    // Calculate question counts per difficulty
    const total = count;
    const easyCount = Math.round(total * difficultyDistribution.easy / 100);
    const mediumCount = Math.round(total * difficultyDistribution.medium / 100);
    const hardCount = total - easyCount - mediumCount;

    const existingQuestionsContext = existingQuestions?.length
        ? `\n\nIMPORTANT: Do NOT generate questions similar to these existing ones:\n${existingQuestions.slice(0, 20).map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '';

    const systemPrompt = `You are an expert educational content creator specializing in creating multiple-choice questions (MCQs) for competitive exams.

Your task is to generate high-quality MCQs based on the given topic and concepts.

RULES:
1. Each question must have exactly 4 options
2. Only one option should be correct
3. Options should be plausible and educational
4. Explanations should be clear and teach the concept
5. Follow the exact difficulty distribution requested
6. Generate questions in ALL requested languages
7. Ensure questions are unique and don't repeat concepts unnecessarily
8. Make questions suitable for exam preparation

DIFFICULTY GUIDELINES:
- Easy: Basic recall, simple concepts, straightforward questions
- Medium: Application of concepts, some calculation or reasoning
- Hard: Complex scenarios, multi-step reasoning, advanced concepts`;

    const userPrompt = `Generate ${count} multiple-choice questions for the topic: "${topicName}"

CONCEPTS TO COVER:
${conceptList}

LANGUAGES: ${languageList}

DIFFICULTY DISTRIBUTION:
- Easy: ${easyCount} questions (${difficultyDistribution.easy}%)
- Medium: ${mediumCount} questions (${difficultyDistribution.medium}%)
- Hard: ${hardCount} questions (${difficultyDistribution.hard}%)

${customInstructions ? `SPECIAL INSTRUCTIONS:\n${customInstructions}` : ''}
${existingQuestionsContext}

Respond with a JSON object in this exact format:
{
  "questions": {
    "en": [
      {
        "question_text": "Question in English...",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_answer_index": 0,
        "explanation": "Explanation in English...",
        "difficulty": "easy",
        "suggested_concept_names": ["Concept Name 1"]
      }
    ],
    "hi": [
      {
        "question_text": "Question in Hindi...",
        "options": ["विकल्प A", "विकल्प B", "विकल्प C", "विकल्प D"],
        "correct_answer_index": 0,
        "explanation": "Explanation in Hindi...",
        "difficulty": "easy",
        "suggested_concept_names": ["Concept Name 1"]
      }
    ]
  }
}

Use language codes: ${languages.map(l => l.code).join(', ')}`;

    try {
        const response = await callOpenAI(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            'json'
        );

        const parsed = JSON.parse(response);

        // Map suggested concept names to concept IDs
        const conceptNameToId: Record<string, string> = {};
        concepts.forEach(c => {
            conceptNameToId[c.name.toLowerCase()] = c.id;
        });

        // Add concept_ids based on suggested_concept_names
        for (const langCode of Object.keys(parsed.questions)) {
            for (const q of parsed.questions[langCode]) {
                if (q.suggested_concept_names) {
                    q.concept_ids = q.suggested_concept_names
                        .map((name: string) => conceptNameToId[name.toLowerCase()])
                        .filter(Boolean);
                    delete q.suggested_concept_names;
                }
            }
        }

        return {
            questions: parsed.questions,
            warnings: []
        };
    } catch (error: any) {
        throw new Error(`Failed to generate questions: ${error.message}`);
    }
}

/**
 * Translate a question to a new language
 */
export async function translateQuestion(params: TranslateParams): Promise<{
    question_text: string;
    options: string[];
    explanation: string;
}> {
    const { questionText, options, explanation, targetLanguage } = params;

    const systemPrompt = `You are an expert translator specializing in educational content. 
Translate the given MCQ question accurately while maintaining its educational value and clarity.
Preserve technical terms where appropriate. Ensure the translation sounds natural in the target language.`;

    const userPrompt = `Translate the following MCQ to ${targetLanguage.name} (${targetLanguage.code}):

QUESTION:
${questionText}

OPTIONS:
${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

EXPLANATION:
${explanation}

Respond with JSON:
{
  "question_text": "Translated question...",
  "options": ["Translated Option 1", "Translated Option 2", "Translated Option 3", "Translated Option 4"],
  "explanation": "Translated explanation..."
}`;

    const response = await callOpenAI(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        'json'
    );

    return JSON.parse(response);
}

/**
 * Suggest new concepts for a topic based on existing concepts
 */
export async function suggestNewConcepts(params: {
    topicName: string;
    subjectName: string;
    existingConcepts: { name: string; description?: string }[];
    count?: number;
}): Promise<{ name: string; description: string; difficulty_level: number }[]> {
    const { topicName, subjectName, existingConcepts, count = 10 } = params;

    const existingList = existingConcepts.length > 0
        ? existingConcepts.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')
        : 'No existing concepts yet.';

    const systemPrompt = `You are an expert curriculum designer specializing in creating comprehensive learning content for competitive exams.
Your task is to suggest NEW concepts that are missing from a topic's coverage.`;

    const userPrompt = `Suggest ${count} NEW concepts for the following topic that are NOT already covered:

SUBJECT: ${subjectName}
TOPIC: ${topicName}

EXISTING CONCEPTS (do NOT suggest these):
${existingList}

Suggest concepts that:
1. Are fundamental to understanding this topic
2. Are commonly tested in competitive exams
3. Fill gaps in the existing concept coverage
4. Progress from basic to advanced understanding

Respond with JSON:
{
  "suggestions": [
    {
      "name": "Concept Name",
      "description": "Brief description of what this concept covers",
      "difficulty_level": 5
    }
  ]
}

difficulty_level: 1-10 where 1=very easy, 10=very hard`;

    const response = await callOpenAI(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        'json'
    );

    const parsed = JSON.parse(response);
    return parsed.suggestions || [];
}

/**
 * Suggest concepts for a question based on its content
 */
export async function suggestConcepts(
    questionText: string,
    options: string[],
    availableConcepts: { id: string; name: string; description?: string }[]
): Promise<{ concept_id: string; confidence: number }[]> {
    const conceptList = availableConcepts.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n');

    const systemPrompt = `You are an expert at categorizing educational content.
Given a question and a list of possible concepts, identify which concepts the question tests.
Return concepts ordered by relevance.`;

    const userPrompt = `Analyze this question and suggest matching concepts:

QUESTION: ${questionText}
OPTIONS: ${options.join(', ')}

AVAILABLE CONCEPTS:
${conceptList}

Respond with JSON:
{
  "suggested_concepts": [
    { "name": "Concept Name", "confidence": 0.9 }
  ]
}

confidence is 0-1, where 1 means definitely tests this concept.`;

    const response = await callOpenAI(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        'json'
    );

    const parsed = JSON.parse(response);
    const conceptNameToId: Record<string, string> = {};
    availableConcepts.forEach(c => {
        conceptNameToId[c.name.toLowerCase()] = c.id;
    });

    return parsed.suggested_concepts
        .map((s: any) => ({
            concept_id: conceptNameToId[s.name.toLowerCase()],
            confidence: s.confidence
        }))
        .filter((s: any) => s.concept_id);
}

/**
 * Generate content hash for duplicate detection
 */
export function generateContentHash(text: string): string {
    // Simple hash for Node.js (can use crypto module)
    const crypto = require('crypto');
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check for similar questions in database
 */
export async function checkForDuplicates(
    newQuestionText: string,
    topicId: string
): Promise<SimilarityResult[]> {
    const newHash = generateContentHash(newQuestionText);

    // Check for exact hash match
    const { data: exactMatch } = await supabaseAdmin
        .from('questions')
        .select('id')
        .eq('content_hash', newHash)
        .eq('topic_id', topicId)
        .limit(1);

    if (exactMatch && exactMatch.length > 0) {
        // Get the question text for display
        const { data: translation } = await supabaseAdmin
            .from('question_translations')
            .select('question_text')
            .eq('question_id', exactMatch[0].id)
            .limit(1)
            .single();

        return [{
            questionId: exactMatch[0].id,
            questionText: translation?.question_text || 'Unknown',
            similarity: 1.0
        }];
    }

    // For semantic similarity, we'd need embeddings
    // For now, we do a simple text comparison
    // This can be enhanced with vector search later

    return [];
}

/**
 * Test OpenAI connection
 */
export async function testConnection(): Promise<boolean> {
    try {
        await callOpenAI([
            { role: 'user', content: 'Say "OK" if you can hear me.' }
        ]);
        return true;
    } catch {
        return false;
    }
}
