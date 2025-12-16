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
        const { plan_id, billing_cycle = 'monthly', promo_code } = req.body;

        console.log('[Payment] Creating order for plan:', plan_id, 'billing:', billing_cycle, 'promo:', promo_code);

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        // Check if Razorpay credentials are configured
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('[Payment] Razorpay credentials not configured');
            return res.status(500).json({ error: 'Payment gateway not configured. Please contact support.' });
        }

        console.log('[Payment] Razorpay credentials present');

        // Get plan details
        const { data: plan, error: planError } = await supabaseAdmin
            .from('subscription_plans')
            .select('*')
            .eq('id', plan_id)
            .single();

        if (planError || !plan) {
            console.error('[Payment] Plan not found:', planError);
            return res.status(404).json({ error: 'Plan not found' });
        }

        console.log('[Payment] Plan found:', plan.name, 'Price:', plan.price_monthly);

        // Get price based on billing cycle
        const originalAmount = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
        let finalAmount = originalAmount;
        let discountAmount = 0;
        let promoCodeId: string | null = null;
        let promoCodeData: any = null;

        // Validate and apply promo code if provided
        if (promo_code) {
            const { data: promoCode, error: promoError } = await supabaseAdmin
                .from('promo_codes')
                .select('*')
                .eq('code', promo_code.toUpperCase())
                .eq('is_active', true)
                .single();

            if (promoError || !promoCode) {
                return res.status(400).json({ error: 'Invalid promo code' });
            }

            // Validate promo code
            const now = new Date();
            const startDate = new Date(promoCode.start_date);
            const endDate = new Date(promoCode.end_date);

            if (now < startDate || now > endDate) {
                return res.status(400).json({ error: 'Promo code is expired or not yet active' });
            }

            if (promoCode.max_uses !== null && promoCode.current_uses >= promoCode.max_uses) {
                return res.status(400).json({ error: 'Promo code has reached maximum usage limit' });
            }

            // Check if user already used this promo
            const { data: existingUsage } = await supabaseAdmin
                .from('promo_code_usages')
                .select('id')
                .eq('promo_code_id', promoCode.id)
                .eq('user_id', req.user!.id)
                .single();

            if (existingUsage) {
                return res.status(400).json({ error: 'You have already used this promo code' });
            }

            // Check plan applicability
            if (promoCode.applicable_plan_ids !== null) {
                const applicablePlans = promoCode.applicable_plan_ids as string[];
                if (!applicablePlans.includes(plan_id)) {
                    return res.status(400).json({ error: 'Promo code is not applicable to this plan' });
                }
            }

            // Check minimum order amount
            if (promoCode.min_order_amount && originalAmount < promoCode.min_order_amount) {
                return res.status(400).json({
                    error: `Minimum order amount of ₹${promoCode.min_order_amount} required`
                });
            }

            // Calculate discount
            if (promoCode.discount_type === 'percentage') {
                discountAmount = (originalAmount * promoCode.discount_value) / 100;
            } else {
                discountAmount = Math.min(promoCode.discount_value, originalAmount);
            }

            finalAmount = Math.max(0, originalAmount - discountAmount);
            promoCodeId = promoCode.id;
            promoCodeData = {
                code: promoCode.code,
                discount_type: promoCode.discount_type,
                discount_value: promoCode.discount_value
            };

            console.log('[Payment] Promo code applied:', promoCode.code, 'Discount:', discountAmount);
        }

        // If free plan or discount makes it free, activate directly without payment
        if (finalAmount === 0) {
            console.log('[Payment] Free/fully discounted plan detected, activating directly');

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

            if (subError) {
                console.error('[Payment] Error creating free subscription:', subError);
                throw subError;
            }

            // Record promo code usage if used
            if (promoCodeId) {
                await supabaseAdmin
                    .from('promo_code_usages')
                    .insert({
                        promo_code_id: promoCodeId,
                        user_id: req.user!.id,
                        discount_amount: discountAmount
                    });

                // Increment promo code usage count
                await supabaseAdmin.rpc('increment_promo_uses', { promo_id: promoCodeId });
            }

            console.log('[Payment] Free subscription activated');
            return res.json({
                success: true,
                is_free: true,
                subscription,
                promo_applied: promoCodeData
            });
        }

        // Create Razorpay order for paid plans
        console.log('[Payment] Creating Razorpay order for amount:', finalAmount);

        // Create a short receipt (max 40 chars for Razorpay)
        // Format: sub_<timestamp>_<last-8-chars-of-user-id>
        const timestamp = Date.now();
        const userIdShort = req.user!.id.slice(-8);
        const receipt = `sub_${timestamp}_${userIdShort}`;

        const options = {
            amount: Math.round(finalAmount * 100), // Razorpay expects amount in paise
            currency: 'INR',
            receipt: receipt,
            notes: {
                user_id: req.user!.id,
                plan_id: plan_id,
                billing_cycle: billing_cycle,
                promo_code_id: promoCodeId || undefined
            }
        };

        console.log('[Payment] Razorpay order options:', JSON.stringify(options, null, 2));

        try {
            const razorpayOrder = await razorpay.orders.create(options as any) as { id: string; amount: number; currency: string };
            console.log('[Payment] Razorpay order created:', razorpayOrder.id);

            // Store order in database
            const { data: paymentOrder, error: orderError } = await supabaseAdmin
                .from('payment_orders')
                .insert({
                    user_id: req.user!.id,
                    razorpay_order_id: razorpayOrder.id,
                    plan_id,
                    billing_cycle,
                    amount: finalAmount,
                    original_amount: originalAmount,
                    discount_amount: discountAmount,
                    promo_code_id: promoCodeId,
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
                    original_price: originalAmount,
                    discount_amount: discountAmount,
                    final_price: finalAmount
                },
                promo_applied: promoCodeData
            });
        } catch (razorpayError: any) {
            console.error('[Payment] Razorpay order creation failed:', razorpayError);
            console.error('[Payment] Razorpay error details:', {
                message: razorpayError.message,
                description: razorpayError.description,
                statusCode: razorpayError.statusCode,
                error: razorpayError.error
            });
            return res.status(500).json({
                error: 'Failed to create payment order with Razorpay',
                details: razorpayError.description || razorpayError.message
            });
        }
    } catch (error: any) {
        console.error('[Payment] Create order error:', error);
        console.error('[Payment] Error stack:', error.stack);
        res.status(500).json({
            error: 'Failed to create payment order',
            details: error.message
        });
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

        // Record promo code usage if a promo code was used
        if (paymentOrder.promo_code_id && paymentOrder.discount_amount > 0) {
            // Record the usage
            await supabaseAdmin
                .from('promo_code_usages')
                .insert({
                    promo_code_id: paymentOrder.promo_code_id,
                    user_id: req.user!.id,
                    payment_order_id: paymentOrder.id,
                    discount_amount: paymentOrder.discount_amount
                });

            // Increment promo code usage count
            await supabaseAdmin.rpc('increment_promo_uses', { promo_id: paymentOrder.promo_code_id });
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

/**
 * POST /api/payment/validate-promo
 * Validate a promo code and return discount information
 */
router.post('/validate-promo', authenticate, async (req, res) => {
    try {
        const { code, plan_id, billing_cycle = 'monthly' } = req.body;

        if (!code || !plan_id) {
            return res.status(400).json({ error: 'Code and plan_id are required' });
        }

        // Get promo code
        const { data: promoCode, error: promoError } = await supabaseAdmin
            .from('promo_codes')
            .select('*')
            .eq('code', code.toUpperCase())
            .eq('is_active', true)
            .single();

        if (promoError || !promoCode) {
            return res.status(404).json({ error: 'Invalid promo code' });
        }

        // Check if code is within valid date range
        const now = new Date();
        const startDate = new Date(promoCode.start_date);
        const endDate = new Date(promoCode.end_date);

        if (now < startDate) {
            return res.status(400).json({ error: 'Promo code is not yet active' });
        }

        if (now > endDate) {
            return res.status(400).json({ error: 'Promo code has expired' });
        }

        // Check usage limits
        if (promoCode.max_uses !== null && promoCode.current_uses >= promoCode.max_uses) {
            return res.status(400).json({ error: 'Promo code has reached maximum usage limit' });
        }

        // Check if user has already used this promo code
        const { data: existingUsage } = await supabaseAdmin
            .from('promo_code_usages')
            .select('id')
            .eq('promo_code_id', promoCode.id)
            .eq('user_id', req.user!.id)
            .single();

        if (existingUsage) {
            return res.status(400).json({ error: 'You have already used this promo code' });
        }

        // Check if promo code is applicable to this plan
        if (promoCode.applicable_plan_ids !== null) {
            const applicablePlans = promoCode.applicable_plan_ids as string[];
            if (!applicablePlans.includes(plan_id)) {
                return res.status(400).json({ error: 'Promo code is not applicable to this plan' });
            }
        }

        // Get plan details to calculate discount
        const { data: plan, error: planError } = await supabaseAdmin
            .from('subscription_plans')
            .select('*')
            .eq('id', plan_id)
            .single();

        if (planError || !plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        const originalPrice = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

        // Check minimum order amount
        if (promoCode.min_order_amount && originalPrice < promoCode.min_order_amount) {
            return res.status(400).json({
                error: `Minimum order amount of ₹${promoCode.min_order_amount} required`
            });
        }

        // Calculate discount
        let discountAmount: number;
        if (promoCode.discount_type === 'percentage') {
            discountAmount = (originalPrice * promoCode.discount_value) / 100;
        } else {
            discountAmount = Math.min(promoCode.discount_value, originalPrice);
        }

        const finalPrice = Math.max(0, originalPrice - discountAmount);

        res.json({
            valid: true,
            promo_code: {
                id: promoCode.id,
                code: promoCode.code,
                discount_type: promoCode.discount_type,
                discount_value: promoCode.discount_value,
                description: promoCode.description
            },
            original_price: originalPrice,
            discount_amount: discountAmount,
            final_price: finalPrice
        });
    } catch (error) {
        console.error('Validate promo code error:', error);
        res.status(500).json({ error: 'Failed to validate promo code' });
    }
});

export default router;
