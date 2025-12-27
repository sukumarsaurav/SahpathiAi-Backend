import { supabaseAdmin } from '../db/supabase';

// OpenAI API types
interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface GeneratedMCQQuestion {
    question_text: string;
    options: string[];
    correct_answer_index: number;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    concept_ids?: string[];
}

interface GeneratedFillBlankQuestion {
    question_text: string; // Context/instruction
    blank_text: string; // The sentence with _____ blank
    correct_answers: string[]; // Array of acceptable answers
    hint?: string;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    concept_ids?: string[];
}

type GeneratedQuestion = GeneratedMCQQuestion | GeneratedFillBlankQuestion;

interface GenerateQuestionsParams {
    topicName: string;
    concepts: { id: string; name: string; description?: string }[];
    languages: { id: string; code: string; name: string }[];
    difficultyDistribution: { easy: number; medium: number; hard: number };
    count: number;
    customInstructions?: string;
    existingQuestions?: string[]; // For duplicate prevention
    questionType?: 'mcq' | 'fill_blank';
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
interface CallOpenAIOptions {
    temperature?: number;
    top_p?: number;
}

async function callOpenAI(messages: OpenAIMessage[], responseFormat?: 'json', options?: CallOpenAIOptions): Promise<any> {
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
            temperature: options?.temperature ?? 0.7,
            max_tokens: 4096,
            ...(options?.top_p && { top_p: options.top_p }),
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
    const { topicName, concepts, languages, difficultyDistribution, count, customInstructions, existingQuestions, questionType = 'mcq' } = params;

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

    let systemPrompt: string;
    let userPrompt: string;

    if (questionType === 'fill_blank') {
        // Fill in the Blank question generation
        systemPrompt = `You are an expert educational content creator specializing in creating fill-in-the-blank questions for competitive exams.

Your task is to generate high-quality fill-in-the-blank questions based on the given topic and concepts.

RULES:
1. Each question must have a sentence with a SINGLE blank marked as "_____" (5 underscores)
2. Provide 1-3 acceptable correct answers for each blank
3. The blank should test understanding of key terms, concepts, or facts
4. Include an optional hint that guides without giving away the answer
5. Explanations should be clear and teach the concept
6. Follow the exact difficulty distribution requested
7. Generate questions in ALL requested languages
8. Ensure questions are unique and educational
9. Make questions suitable for exam preparation

DIFFICULTY GUIDELINES:
- Easy: Basic recall, commonly known facts, simple terminology
- Medium: Application of concepts, less common terms, requires understanding
- Hard: Complex terminology, nuanced concepts, requires deep understanding`;

        userPrompt = `Generate ${count} fill-in-the-blank questions for the topic: "${topicName}"

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
        "question_text": "Context or instruction for the question (e.g., 'Complete the following sentence:')",
        "blank_text": "The _____ is the largest organ in the human body.",
        "correct_answers": ["skin", "Skin"],
        "hint": "It covers and protects all other organs",
        "explanation": "The skin is the largest organ, covering about 20 square feet.",
        "difficulty": "easy",
        "suggested_concept_names": ["Human Anatomy"]
      }
    ]
  }
}

Use language codes: ${languages.map(l => l.code).join(', ')}`;

    } else {
        // MCQ question generation (default)
        systemPrompt = `You are an expert educational content creator specializing in creating multiple-choice questions (MCQs) for competitive exams.

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

        userPrompt = `Generate ${count} multiple-choice questions for the topic: "${topicName}"

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
    }

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
 * Suggest new atomic concept tags for a topic based on existing concepts
 * Optimized for competitive exam MCQ tagging
 */
export async function suggestNewConcepts(params: {
    topicName: string;
    subjectName: string;
    existingConcepts: { name: string; description?: string }[];
    count?: number;
    customInstruction?: string;
}): Promise<{ name: string; description: string; difficulty_level: number }[]> {
    const { topicName, subjectName, existingConcepts, count = 10, customInstruction } = params;

    const existingList = existingConcepts.length > 0
        ? existingConcepts.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')
        : 'No existing concepts yet.';

    const systemPrompt = `You are an expert educational content categorizer specializing in creating atomic concept tags for competitive exam MCQs.
Your role is to generate precise, tag-friendly concept names that can be used to classify and organize exam questions.`;

    const userPrompt = `Suggest ${count} NEW ATOMIC CONCEPT TAGS for the topic below.

SUBJECT: ${subjectName}
TOPIC: ${topicName}

EXISTING CONCEPTS (DO NOT repeat or paraphrase these):
${existingList}

What to generate:
- ONLY concepts that are commonly asked in competitive exams
- Concepts must be usable as TAGS to assign MCQs
- Each concept must cover ONE clear examinable idea
- Prefer definition-based, feature-based, identification-based concepts
- Progress from basic → advanced
- Avoid syllabus wording, paragraphs, or umbrella concepts

${customInstruction ? `SPECIAL INSTRUCTION FROM USER:
${customInstruction}

Ensure suggestions strictly follow the user's special instruction above.` : ''}

Respond STRICTLY in the following JSON format ONLY:

{
  "suggestions": [
    {
      "name": "Short, precise concept name (tag-friendly)",
      "description": "What exactly is tested from this concept in exams",
      "difficulty_level": 1
    }
  ]
}

difficulty_level rules:
1-2 = very basic factual
3-4 = standard exam questions
5-6 = high-frequency + conceptual
7-8 = advanced/static + analytical
9-10 = rare or deep analytical`;

    const response = await callOpenAI(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        'json',
        { temperature: 0.2, top_p: 0.9 }
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
 * Suggest Test Details (Title & Description) based on topics
 */
export async function suggestTestDetails(params: {
    examName: string;
    subjectName: string;
    topicNames: string[];
    customInstruction?: string;
}): Promise<{ title: string; description: string }> {
    const { examName, subjectName, topicNames, customInstruction } = params;

    const topicList = topicNames.map(t => `- ${t}`).join('\n');

    const systemPrompt = `You are an expert exam coordinator. Your task is to generate a professional and descriptive title and description for a new test based on the selected syllabus.
IMPORTANT: The title format MUST be: "Topic Name - Subject Name - Exam Name"
Example: "Harappan Civilization - Ancient History - UPSC CSE"`;

    const userPrompt = `Generate a Title and Description for a test with the following configuration:

EXAM: ${examName}
SUBJECT: ${subjectName}
TOPICS INCLUDED:
${topicList}

${customInstruction ? `USER INSTRUCTION: ${customInstruction}` : ''}

TITLE FORMAT (REQUIRED): "Topic Name - Subject Name - Exam Name"
- If multiple topics: use the main/first topic name or a combined name
- Example: "Mauryan Empire - Ancient History - UPSC CSE"
- Example with multiple topics: "Medieval Kingdoms - Medieval History - SSC CGL"

The description should briefly mention the scope and what students should expect.

Respond with JSON:
{
  "title": "Topic Name - Subject Name - Exam Name",
  "description": "Test Description..."
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

// =====================================================
// MAP QUESTION GENERATION
// =====================================================

// Known valid location names for map questions
const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

const WORLD_COUNTRIES = [
    'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria',
    'Bangladesh', 'Belgium', 'Brazil', 'Canada', 'Chile', 'China', 'Colombia',
    'Cuba', 'Czech Republic', 'Denmark', 'Egypt', 'Ethiopia', 'Finland', 'France',
    'Germany', 'Greece', 'Hungary', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
    'Israel', 'Italy', 'Japan', 'Kenya', 'Malaysia', 'Mexico', 'Morocco', 'Myanmar',
    'Nepal', 'Netherlands', 'New Zealand', 'Nigeria', 'North Korea', 'Norway',
    'Pakistan', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Romania', 'Russia',
    'Saudi Arabia', 'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sudan',
    'Sweden', 'Switzerland', 'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates',
    'United Kingdom', 'United States', 'Venezuela', 'Vietnam'
];

interface GeneratedMapQuestion {
    question_text: string;
    question_type: 'map_state' | 'map_multi' | 'map_fill_blank';
    map_data: {
        mapType: 'india' | 'world' | 'state';
        stateName?: string;
        correctAnswers: string[];
        highlightStates?: string[];
        maxSelections?: number;
    };
    blank_data?: {
        blanks: { position: number; answers: string[]; hints?: string[] }[];
        question_template: string;
        case_sensitive?: boolean;
    };
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
}

interface GenerateMapQuestionsParams {
    mapType: 'india' | 'world' | 'state';
    stateName?: string;
    questionTypes: ('map_state' | 'map_multi' | 'map_fill_blank')[];
    difficultyDistribution: { easy: number; medium: number; hard: number };
    count: number;
    customInstructions?: string;
    existingQuestions?: string[];
}

/**
 * Generate map-based geography questions using AI
 */
export async function generateMapQuestions(params: GenerateMapQuestionsParams): Promise<{
    questions: GeneratedMapQuestion[];
    warnings: string[];
}> {
    const { mapType, stateName, questionTypes, difficultyDistribution, count, customInstructions, existingQuestions } = params;

    const total = count;
    const easyCount = Math.round(total * difficultyDistribution.easy / 100);
    const mediumCount = Math.round(total * difficultyDistribution.medium / 100);
    const hardCount = total - easyCount - mediumCount;

    let validLocations: string[];
    let locationContext: string;

    if (mapType === 'world') {
        validLocations = WORLD_COUNTRIES;
        locationContext = 'countries of the world';
    } else if (mapType === 'india') {
        validLocations = INDIAN_STATES;
        locationContext = 'states and union territories of India';
    } else {
        locationContext = `districts of ${stateName || 'the selected state'} in India`;
        validLocations = [];
    }

    const existingQuestionsContext = existingQuestions?.length
        ? `\n\nDo NOT generate questions similar to these:\n${existingQuestions.slice(0, 15).map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '';

    const questionTypeDesc = questionTypes.map(qt => {
        if (qt === 'map_state') return 'Single Click: User clicks on ONE location';
        if (qt === 'map_multi') return 'Multi Select: User clicks on MULTIPLE locations (2-5)';
        if (qt === 'map_fill_blank') return 'Fill Blank: Map shows highlighted area, user types the name';
        return qt;
    }).join('\n');

    const systemPrompt = `You are an expert geography educator creating map-based questions for exams.
You specialize in interactive geography questions testing knowledge of ${locationContext}.

RULES:
1. Location names MUST be spelled exactly as in the valid locations list
2. map_state: ONE correct answer
3. map_multi: 2-5 correct answers
4. map_fill_blank: Question template with _____ blank, map shows highlighted states
5. Include educational explanations with interesting facts
6. Vary questions: capitals, borders, rivers, climate, landmarks

DIFFICULTY:
- Easy: Basic identification of well-known locations
- Medium: Relationship-based (borders, neighbors)
- Hard: Multi-factor criteria, complex analysis`;

    const userPrompt = `Generate ${count} map-based geography questions about ${locationContext}.

MAP TYPE: ${mapType}${stateName ? ` (${stateName})` : ''}

QUESTION TYPES:
${questionTypeDesc}

DIFFICULTY: Easy=${easyCount}, Medium=${mediumCount}, Hard=${hardCount}

${mapType !== 'state' ? `VALID LOCATIONS:\n${validLocations.join(', ')}` : `Use accurate district names of ${stateName}.`}

${customInstructions ? `INSTRUCTIONS: ${customInstructions}` : ''}${existingQuestionsContext}

JSON format:
{
  "questions": [
    {
      "question_text": "Click on the state known as the 'Land of Five Rivers'",
      "question_type": "map_state",
      "map_data": {
        "mapType": "${mapType}",
        ${stateName ? `"stateName": "${stateName}",` : ''}
        "correctAnswers": ["Punjab"],
        "maxSelections": 1
      },
      "explanation": "Punjab means 'five rivers' referring to Indus tributaries.",
      "difficulty": "easy"
    }
  ]
}`;

    try {
        const response = await callOpenAI(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            'json'
        );

        const parsed = JSON.parse(response);
        const questions: GeneratedMapQuestion[] = parsed.questions || [];
        const warnings: string[] = [];

        // Normalize correctAnswers to ensure it's always an array
        for (const q of questions) {
            if (!q.map_data) {
                q.map_data = { mapType, correctAnswers: [] };
            }
            // Handle cases where AI returns string instead of array
            if (typeof q.map_data.correctAnswers === 'string') {
                q.map_data.correctAnswers = [q.map_data.correctAnswers];
            } else if (!Array.isArray(q.map_data.correctAnswers)) {
                q.map_data.correctAnswers = [];
                warnings.push(`Question "${q.question_text?.substring(0, 50)}..." had invalid correctAnswers format`);
            }
            // Normalize highlightStates as well
            if (q.map_data.highlightStates && !Array.isArray(q.map_data.highlightStates)) {
                q.map_data.highlightStates = [];
            }
        }

        // Validate location names for non-state maps
        if (mapType !== 'state') {
            for (const q of questions) {
                const validatedAnswers: string[] = [];
                for (const answer of q.map_data.correctAnswers) {
                    if (validLocations.includes(answer)) {
                        validatedAnswers.push(answer);
                    } else {
                        const found = validLocations.find(loc => loc.toLowerCase() === answer.toLowerCase());
                        if (found) {
                            validatedAnswers.push(found);
                        } else {
                            warnings.push(`Invalid location "${answer}" removed`);
                        }
                    }
                }
                q.map_data.correctAnswers = validatedAnswers;

                if (q.map_data.highlightStates) {
                    q.map_data.highlightStates = q.map_data.highlightStates.filter(hs => {
                        if (validLocations.includes(hs)) return true;
                        const found = validLocations.find(loc => loc.toLowerCase() === hs.toLowerCase());
                        return !!found;
                    });
                }
            }
        }

        const validQuestions = questions.filter(q => {
            if (q.question_type === 'map_fill_blank') {
                return q.blank_data && q.blank_data.blanks && q.blank_data.blanks.length > 0;
            }
            return q.map_data.correctAnswers.length > 0;
        });

        if (validQuestions.length < questions.length) {
            warnings.push(`${questions.length - validQuestions.length} question(s) removed due to invalid answers`);
        }

        return { questions: validQuestions, warnings };
    } catch (error: any) {
        throw new Error(`Failed to generate map questions: ${error.message}`);
    }
}
