import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/subscription/plans
 * Get available subscription plans
 */
router.get('/plans', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('subscription_plans')
            .select('*')
            .eq('is_active', true)
            .order('price_monthly');

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

/**
 * GET /api/subscription/current
 * Get user's current subscription
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

        res.json(data);
    } catch (error) {
        console.error('Get current subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});

/**
 * POST /api/subscription/subscribe
 * Subscribe to a plan
 */
router.post('/subscribe', authenticate, async (req, res) => {
    try {
        const { plan_id, billing_cycle = 'monthly' } = req.body;

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

        // Calculate expiry
        const expiresAt = new Date();
        if (billing_cycle === 'yearly') {
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        } else {
            expiresAt.setMonth(expiresAt.getMonth() + 1);
        }

        // Create new subscription
        const { data: subscription, error } = await supabaseAdmin
            .from('user_subscriptions')
            .insert({
                user_id: req.user!.id,
                plan_id,
                status: 'active',
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
            })
            .select('*, plan:subscription_plans(*)')
            .single();

        if (error) throw error;

        // Deduct from wallet
        const price = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

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
                description: `${plan.name} subscription (${billing_cycle})`,
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
 * POST /api/subscription/cancel
 * Cancel subscription
 */
router.post('/cancel', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('user_subscriptions')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString()
            })
            .eq('user_id', req.user!.id)
            .eq('status', 'active')
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Subscription cancelled', subscription: data });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

export default router;
