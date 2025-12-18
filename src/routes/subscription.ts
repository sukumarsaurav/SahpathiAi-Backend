import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { cache } from '../utils/cache';

const router = Router();

// Duration type definitions
type DurationType = '1_month' | '3_months' | '6_months' | '1_year';

// Map duration to months for expiry calculation
const DURATION_MONTHS: Record<DurationType, number> = {
    '1_month': 1,
    '3_months': 3,
    '6_months': 6,
    '1_year': 12,
};

// Map duration to price field
const DURATION_PRICE_FIELD: Record<DurationType, string> = {
    '1_month': 'price_monthly',
    '3_months': 'price_3_months',
    '6_months': 'price_6_months',
    '1_year': 'price_yearly',
};

// Early renewal constants
const EARLY_RENEWAL_DAYS = 7;
const EARLY_RENEWAL_DISCOUNT = 0.10; // 10%

/**
 * GET /api/subscription/plans
 * Get available subscription plans (cached 6h)
 */
router.get('/plans', async (req, res) => {
    try {
        const data = await cache.getOrSet(
            cache.KEYS.subscriptionPlans(),
            cache.TTL.SUBSCRIPTION_PLANS,
            async () => {
                const { data, error } = await supabaseAdmin
                    .from('subscription_plans')
                    .select('*')
                    .eq('is_active', true)
                    .order('price_monthly');
                if (error) throw error;

                // Normalize plan data - ensure all price fields exist
                return (data || []).map((plan: any) => ({
                    ...plan,
                    price_1_month: plan.price_monthly || 0,
                    price_3_months: plan.price_3_months || Math.round((plan.price_monthly || 0) * 3 * 0.9),
                    price_6_months: plan.price_6_months || Math.round((plan.price_monthly || 0) * 6 * 0.83),
                    price_1_year: plan.price_yearly || Math.round((plan.price_monthly || 0) * 12 * 0.7),
                }));
            }
        );

        res.json(data);
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

/**
 * GET /api/subscription/current
 * Get user's current subscription with days until expiry
 */
router.get('/current', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('user_subscriptions')
            .select('*, plan:subscription_plans(*)')
            .eq('user_id', req.user!.id)
            .eq('status', 'active')
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
            // Get free plan
            const { data: freePlan } = await supabaseAdmin
                .from('subscription_plans')
                .select('*')
                .eq('name', 'Free')
                .single();

            return res.json({ plan: freePlan, status: 'free' });
        }

        // Calculate days until expiry
        let daysUntilExpiry: number | undefined;
        if (data.expires_at) {
            const expiryDate = new Date(data.expires_at);
            const now = new Date();
            const diffMs = expiryDate.getTime() - now.getTime();
            daysUntilExpiry = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }

        res.json({
            ...data,
            days_until_expiry: daysUntilExpiry,
        });
    } catch (error) {
        console.error('Get current subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});

/**
 * POST /api/subscription/subscribe
 * Subscribe to a plan with duration-based pricing
 */
router.post('/subscribe', authenticate, async (req, res) => {
    try {
        const {
            plan_id,
            duration = '1_month', // New: duration type
            is_recurring = false, // New: auto-renewal flag
            billing_cycle // Legacy: for backward compatibility
        } = req.body;

        // Handle legacy billing_cycle conversion
        let finalDuration: DurationType = duration as DurationType;
        if (!duration && billing_cycle) {
            finalDuration = billing_cycle === 'yearly' ? '1_year' : '1_month';
        }

        // Validate duration type
        if (!DURATION_MONTHS[finalDuration]) {
            return res.status(400).json({ error: 'Invalid duration. Use: 1_month, 3_months, 6_months, or 1_year' });
        }

        // Get plan details
        const { data: plan } = await supabaseAdmin
            .from('subscription_plans')
            .select('*')
            .eq('id', plan_id)
            .single();

        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Cancel existing subscription
        await supabaseAdmin
            .from('user_subscriptions')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('user_id', req.user!.id)
            .eq('status', 'active');

        // Calculate expiry based on duration
        const expiresAt = new Date();
        const months = DURATION_MONTHS[finalDuration];
        expiresAt.setMonth(expiresAt.getMonth() + months);

        // Create new subscription
        const { data: subscription, error } = await supabaseAdmin
            .from('user_subscriptions')
            .insert({
                user_id: req.user!.id,
                plan_id,
                status: 'active',
                duration_type: finalDuration,
                is_recurring: is_recurring,
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
            })
            .select('*, plan:subscription_plans(*)')
            .single();

        if (error) throw error;

        // Get price based on duration
        const priceField = DURATION_PRICE_FIELD[finalDuration];
        const price = plan[priceField] || plan.price_monthly;

        // Deduct from wallet if applicable
        const { data: wallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (wallet && wallet.balance >= price) {
            await supabaseAdmin
                .from('wallets')
                .update({
                    balance: wallet.balance - price,
                    total_spent: (wallet.total_spent || 0) + price
                })
                .eq('id', wallet.id);

            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: wallet.id,
                type: 'debit',
                amount: price,
                description: `${plan.name} subscription (${finalDuration})`,
                category: 'subscription'
            });
        }

        res.json(subscription);
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

/**
 * POST /api/subscription/renew
 * Early renewal with discount
 */
router.post('/renew', authenticate, async (req, res) => {
    try {
        const { plan_id, duration = '1_month' } = req.body;

        const finalDuration = duration as DurationType;

        if (!DURATION_MONTHS[finalDuration]) {
            return res.status(400).json({ error: 'Invalid duration' });
        }

        // Get current subscription
        const { data: currentSub } = await supabaseAdmin
            .from('user_subscriptions')
            .select('*, plan:subscription_plans(*)')
            .eq('user_id', req.user!.id)
            .eq('status', 'active')
            .single();

        if (!currentSub || !currentSub.expires_at) {
            return res.status(400).json({ error: 'No active subscription to renew' });
        }

        // Check if eligible for early renewal discount
        const expiryDate = new Date(currentSub.expires_at);
        const now = new Date();
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const isEligibleForDiscount = daysUntilExpiry > 0 && daysUntilExpiry <= EARLY_RENEWAL_DAYS;

        // Get the plan for pricing
        const { data: plan } = await supabaseAdmin
            .from('subscription_plans')
            .select('*')
            .eq('id', plan_id)
            .single();

        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Calculate price with potential early renewal discount
        const priceField = DURATION_PRICE_FIELD[finalDuration];
        let price = plan[priceField] || plan.price_monthly;
        let discountApplied = 0;

        if (isEligibleForDiscount) {
            discountApplied = Math.round(price * EARLY_RENEWAL_DISCOUNT);
            price = price - discountApplied;
        }

        res.json({
            eligible_for_discount: isEligibleForDiscount,
            discount_percent: isEligibleForDiscount ? EARLY_RENEWAL_DISCOUNT * 100 : 0,
            discount_amount: discountApplied,
            original_price: plan[priceField] || plan.price_monthly,
            final_price: price,
            days_until_expiry: daysUntilExpiry,
            duration: finalDuration,
            // Include plan details for display
            plan: {
                id: plan.id,
                name: plan.name,
            }
        });
    } catch (error) {
        console.error('Renew check error:', error);
        res.status(500).json({ error: 'Failed to check renewal' });
    }
});

/**
 * POST /api/subscription/cancel
 * Cancel auto-renewal (subscription remains active until expiry)
 */
router.post('/cancel', authenticate, async (req, res) => {
    try {
        // For one-time subscriptions: just disable auto-renewal
        // For recurring: mark as cancelled (but keep active until expiry)
        const { data, error } = await supabaseAdmin
            .from('user_subscriptions')
            .update({
                is_recurring: false,
                cancelled_at: new Date().toISOString()
            })
            .eq('user_id', req.user!.id)
            .eq('status', 'active')
            .select()
            .single();

        if (error) throw error;

        res.json({
            message: 'Auto-renewal cancelled. Your subscription will remain active until the expiry date.',
            subscription: data
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

export default router;
