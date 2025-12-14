import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { razorpay, verifyPaymentSignature } from '../config/razorpay';

const router = Router();

/**
 * POST /api/payment/create-order
 * Create a Razorpay order for subscription payment
 */
router.post('/create-order', authenticate, async (req, res) => {
    try {
        const { plan_id, billing_cycle = 'monthly' } = req.body;

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        // Get plan details
        const { data: plan, error: planError } = await supabaseAdmin
            .from('subscription_plans')
            .select('*')
            .eq('id', plan_id)
            .single();

        if (planError || !plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Get price based on billing cycle
        const amount = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

        // If free plan, activate directly without payment
        if (amount === 0) {
            // Cancel existing subscription
            await supabaseAdmin
                .from('user_subscriptions')
                .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
                .eq('user_id', req.user!.id)
                .eq('status', 'active');

            // Create free subscription
            const { data: subscription, error: subError } = await supabaseAdmin
                .from('user_subscriptions')
                .insert({
                    user_id: req.user!.id,
                    plan_id,
                    status: 'active',
                    started_at: new Date().toISOString(),
                    expires_at: null // Free plan doesn't expire
                })
                .select('*, plan:subscription_plans(*)')
                .single();

            if (subError) throw subError;

            return res.json({
                success: true,
                is_free: true,
                subscription
            });
        }

        // Create Razorpay order for paid plans
        const options = {
            amount: Math.round(amount * 100), // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `sub_${req.user!.id}_${Date.now()}`,
            notes: {
                user_id: req.user!.id,
                plan_id: plan_id,
                billing_cycle: billing_cycle
            }
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Store order in database
        const { data: paymentOrder, error: orderError } = await supabaseAdmin
            .from('payment_orders')
            .insert({
                user_id: req.user!.id,
                razorpay_order_id: razorpayOrder.id,
                plan_id,
                billing_cycle,
                amount,
                currency: 'INR',
                status: 'created'
            })
            .select()
            .single();

        if (orderError) throw orderError;

        res.json({
            success: true,
            is_free: false,
            order: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                key_id: process.env.RAZORPAY_KEY_ID
            },
            plan: {
                id: plan.id,
                name: plan.name,
                price: amount
            }
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

/**
 * POST /api/payment/verify
 * Verify payment signature and activate subscription
 */
router.post('/verify', authenticate, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment verification data' });
        }

        // Verify signature
        const isValid = verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // Get payment order
        const { data: paymentOrder, error: orderError } = await supabaseAdmin
            .from('payment_orders')
            .select('*, plan:subscription_plans(*)')
            .eq('razorpay_order_id', razorpay_order_id)
            .eq('user_id', req.user!.id)
            .single();

        if (orderError || !paymentOrder) {
            return res.status(404).json({ error: 'Payment order not found' });
        }

        if (paymentOrder.status === 'paid') {
            return res.status(400).json({ error: 'Payment already processed' });
        }

        // Update payment order status
        await supabaseAdmin
            .from('payment_orders')
            .update({
                status: 'paid',
                razorpay_payment_id,
                razorpay_signature,
                paid_at: new Date().toISOString()
            })
            .eq('id', paymentOrder.id);

        // Cancel existing active subscription
        await supabaseAdmin
            .from('user_subscriptions')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('user_id', req.user!.id)
            .eq('status', 'active');

        // Calculate expiry date
        const expiresAt = new Date();
        if (paymentOrder.billing_cycle === 'yearly') {
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        } else {
            expiresAt.setMonth(expiresAt.getMonth() + 1);
        }

        // Create new subscription
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('user_subscriptions')
            .insert({
                user_id: req.user!.id,
                plan_id: paymentOrder.plan_id,
                status: 'active',
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
            })
            .select('*, plan:subscription_plans(*)')
            .single();

        if (subError) throw subError;

        // Record wallet transaction (for tracking)
        const { data: wallet } = await supabaseAdmin
            .from('wallets')
            .select('id')
            .eq('user_id', req.user!.id)
            .single();

        if (wallet) {
            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: wallet.id,
                type: 'debit',
                amount: paymentOrder.amount,
                description: `${paymentOrder.plan.name} subscription (${paymentOrder.billing_cycle}) via Razorpay`,
                category: 'subscription'
            });
        }

        res.json({
            success: true,
            subscription,
            message: `Successfully subscribed to ${paymentOrder.plan.name}`
        });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

/**
 * GET /api/payment/order/:orderId
 * Get order status
 */
router.get('/order/:orderId', authenticate, async (req, res) => {
    try {
        const { orderId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('payment_orders')
            .select('*, plan:subscription_plans(*)')
            .eq('razorpay_order_id', orderId)
            .eq('user_id', req.user!.id)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

export default router;
