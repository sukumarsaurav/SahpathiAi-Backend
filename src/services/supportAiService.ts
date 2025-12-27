import { supabaseAdmin } from '../db/supabase';

// =====================================================
// TYPES
// =====================================================

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface SupportAIResponse {
    message: string;
    tokensUsed: number;
    shouldEscalate: boolean;
    escalationReason?: string;
}

interface TicketMessage {
    message: string;
    message_type: 'user' | 'ai' | 'human' | 'system';
    created_at: string;
}

// =====================================================
// ISSUE TYPE PROMPTS
// =====================================================

const ISSUE_TYPE_PROMPTS: Record<string, string> = {
    'Technical Issue': `You are a helpful technical support agent for Sahpathi.ai, an educational app for competitive exam preparation.
For technical issues:
- Ask clarifying questions about the device, app version, and when the issue started
- Suggest common troubleshooting steps: restart app, clear cache, reinstall, check internet
- If the issue persists after basic troubleshooting, recommend escalating to a human agent
- Be empathetic and patient with users who may be frustrated`,

    'Payment Problem': `You are a helpful payment support agent for Sahpathi.ai.
For payment issues:
- Ask for transaction ID or date of payment attempt
- Explain that you can check their wallet balance and recent transactions
- For failed payments, suggest trying again or using a different payment method
- For refund requests, collect details and recommend escalating to human agent (you cannot process refunds)
- Always reassure users that their money is safe`,

    'Account Issue': `You are a helpful account support agent for Sahpathi.ai.
For account issues:
- Help with password reset by directing them to the forgot password feature
- Explain how to update profile information in the app
- For account locked/suspended issues, recommend escalating to human agent
- For data deletion requests, collect the reason and escalate to human agent`,

    'Test Content Error': `You are a helpful content support agent for Sahpathi.ai.
For content issues:
- Thank the user for reporting the error
- Collect specific details: which test, question number, what was wrong
- Assure them the content team will review and fix it
- Log the report and recommend they continue with other questions
- Offer to escalate if they found multiple errors`,

    'Feature Request': `You are a helpful support agent for Sahpathi.ai handling feature requests.
For feature requests:
- Thank the user for their suggestion
- Ask for more details about what they'd like to see and why
- Explain that their feedback is valuable and will be shared with the product team
- Do NOT promise any features or timelines
- Suggest workarounds if applicable`,

    'Other': `You are a helpful support agent for Sahpathi.ai handling general inquiries.
For general inquiries:
- Be helpful and friendly
- Try to answer common questions about the app
- If the query is complex or requires investigation, offer to escalate to a human agent
- If you're unsure, be honest and recommend speaking with a human agent`
};

// Base system prompt that applies to all issue types
const BASE_SYSTEM_PROMPT = `
You are an AI support agent for Sahpathi.ai, an educational platform for competitive exam preparation in India.

IMPORTANT GUIDELINES:
1. Be polite, professional, and empathetic
2. Keep responses concise but helpful (2-4 sentences typically)
3. If the user seems frustrated or asks to speak with a human, recommend escalating immediately
4. Do NOT make promises you cannot keep (like guaranteeing refunds)
5. Do NOT share user's personal data or account details in responses
6. If you don't know something, be honest and offer to escalate

ESCALATION INDICATORS (recommend human transfer when you detect):
- User explicitly asks for human/real person/manager
- Issue requires access to internal systems you don't have
- User is very frustrated or has tried your suggestions multiple times
- Issue involves money/refunds/billing disputes
- Issue involves account security/data concerns
- Complex technical issue that basic troubleshooting won't fix

When you believe escalation is needed, include "[RECOMMEND_ESCALATION]" at the end of your response.

Always respond in the same language the user uses (Hindi/English/both).
`;

// =====================================================
// API KEY MANAGEMENT
// =====================================================

async function getApiKey(): Promise<string | null> {
    try {
        const { data } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'openai_api_key')
            .single();

        return data?.setting_value || null;
    } catch (error) {
        console.error('Error fetching OpenAI API key:', error);
        return null;
    }
}

// =====================================================
// OPENAI CALL
// =====================================================

async function callOpenAI(messages: OpenAIMessage[], maxTokens = 500): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
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
            max_tokens: maxTokens,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as {
        choices: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
    };
    return {
        content: data.choices[0]?.message?.content || '',
        tokensUsed: data.usage?.total_tokens || 0
    };
}

// =====================================================
// TICKET HISTORY
// =====================================================

async function getTicketHistory(ticketId: string): Promise<TicketMessage[]> {
    const { data: messages, error } = await supabaseAdmin
        .from('support_messages')
        .select('message, message_type, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching ticket history:', error);
        return [];
    }

    return messages || [];
}

// =====================================================
// MAIN AI RESPONSE FUNCTION
// =====================================================

/**
 * Generate an AI response for a support ticket message
 */
export async function generateSupportResponse(
    ticketId: string,
    userMessage: string,
    issueType: string
): Promise<SupportAIResponse> {
    // Get issue-specific prompt
    const issuePrompt = ISSUE_TYPE_PROMPTS[issueType] || ISSUE_TYPE_PROMPTS['Other'];

    // Get conversation history
    const history = await getTicketHistory(ticketId);

    // Build messages array
    const messages: OpenAIMessage[] = [
        {
            role: 'system',
            content: BASE_SYSTEM_PROMPT + '\n\n' + issuePrompt
        }
    ];

    // Add conversation history (limit to last 10 messages to save tokens)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
        if (msg.message_type === 'user') {
            messages.push({ role: 'user', content: msg.message });
        } else if (msg.message_type === 'ai' || msg.message_type === 'human') {
            messages.push({ role: 'assistant', content: msg.message });
        }
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    // Call OpenAI
    const { content, tokensUsed } = await callOpenAI(messages);

    // Check if AI recommends escalation
    const shouldEscalate = content.includes('[RECOMMEND_ESCALATION]');
    const cleanMessage = content.replace('[RECOMMEND_ESCALATION]', '').trim();

    return {
        message: cleanMessage,
        tokensUsed,
        shouldEscalate,
        escalationReason: shouldEscalate ? 'AI recommended escalation based on conversation' : undefined
    };
}

/**
 * Detect if user's message indicates they want to speak with a human
 */
export function detectEscalationIntent(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    const escalationKeywords = [
        'talk to human',
        'speak to human',
        'real person',
        'human agent',
        'customer service',
        'speak to someone',
        'talk to someone',
        'manager',
        'supervisor',
        'not helping',
        'connect me to',
        'transfer to',
        'live agent',
        // Hindi phrases
        'इंसान से बात',
        'असली व्यक्ति',
        'मैनेजर से',
        'किसी से बात करो'
    ];

    return escalationKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Generate a welcome message based on issue type
 */
export function getAIWelcomeMessage(issueType: string): string {
    const welcomeMessages: Record<string, string> = {
        'Technical Issue': "Hi! I'm Sahpathi's AI support assistant 🤖 I understand you're facing a technical issue. Could you please describe what's happening? Include details like which feature isn't working and any error messages you see.",

        'Payment Problem': "Hi! I'm Sahpathi's AI support assistant 🤖 I'm sorry you're experiencing a payment issue. Could you share some details? For example: the date of the payment attempt, the amount, and what happened when you tried to pay.",

        'Account Issue': "Hi! I'm Sahpathi's AI support assistant 🤖 I'll try to help with your account. Could you tell me what specific issue you're facing? Is it related to login, profile, or something else?",

        'Test Content Error': "Hi! I'm Sahpathi's AI support assistant 🤖 Thank you for reporting a content issue! To help our team fix it quickly, could you please tell me: which test, which question (number or text), and what was wrong?",

        'Feature Request': "Hi! I'm Sahpathi's AI support assistant 🤖 We love hearing ideas from our users! What feature would you like to see in Sahpathi? Please describe what you'd like and how it would help your exam preparation.",

        'Other': "Hi! I'm Sahpathi's AI support assistant 🤖 How can I help you today? Please describe your question or concern and I'll do my best to assist."
    };

    return welcomeMessages[issueType] || welcomeMessages['Other'];
}

/**
 * Generate a transfer message when escalating to human
 */
export function getTransferMessage(): string {
    return "I'm connecting you with a human support agent who will be able to help you further. They will respond to you shortly. Thank you for your patience! 🙏";
}

export default {
    generateSupportResponse,
    detectEscalationIntent,
    getAIWelcomeMessage,
    getTransferMessage
};
