import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { razorpay, verifyPaymentSignature } from '../config/razorpay';

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
 * POST /api/payment/create-order
 * Create a Razorpay order for subscription payment
 * Now supports duration-based pricing and optional auto-renewal
 */
router.post('/create-order', authenticate, async (req, res) => {
    try {
        const {
            plan_id,
            duration = '1_month', // New: duration type
            is_recurring = false, // New: auto-renewal flag
            promo_code,
            billing_cycle // Legacy: for backward compatibility
        } = req.body;

        // Handle legacy billing_cycle conversion
        let finalDuration: DurationType = duration as DurationType;
        if (!duration && billing_cycle) {
            finalDuration = billing_cycle === 'yearly' ? '1_year' : '1_month';
        }

        console.log('[Payment] Creating order for plan:', plan_id, 'duration:', finalDuration, 'recurring:', is_recurring, 'promo:', promo_code);

        // Validate duration type
        if (!DURATION_MONTHS[finalDuration]) {
            return res.status(400).json({ error: 'Invalid duration. Use: 1_month, 3_months, 6_months, or 1_year' });
        }

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }

        // Check if Razorpay credentials are configured
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('[Payment] Razorpay credentials not configured');
            return res.status(500).json({ error: 'Payment gateway not configured. Please contact support.' });
        }

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

        console.log('[Payment] Plan found:', plan.name);

        // Get price based on duration
        const priceField = DURATION_PRICE_FIELD[finalDuration];
        let originalAmount = plan[priceField];

        // Fallback to calculated price if specific duration price not set
        if (!originalAmount || originalAmount === 0) {
            const monthlyPrice = plan.price_monthly || 0;
            const months = DURATION_MONTHS[finalDuration];
            const discountMultiplier =
                finalDuration === '3_months' ? 0.9 :
                    finalDuration === '6_months' ? 0.83 :
                        finalDuration === '1_year' ? 0.7 : 1;
            originalAmount = Math.round(monthlyPrice * months * discountMultiplier);
        }

        console.log('[Payment] Price for', finalDuration, ':', originalAmount);

        let finalAmount = originalAmount;
        let discountAmount = 0;
        let promoCodeId: string | null = null;
        let promoCodeData: any = null;

        // Check for early renewal discount
        let earlyRenewalDiscount = 0;
        const { data: currentSub } = await supabaseAdmin
            .from('user_subscriptions')
            .select('expires_at, plan_id')
            .eq('user_id', req.user!.id)
            .eq('status', 'active')
            .single();

        if (currentSub?.expires_at) {
            const expiryDate = new Date(currentSub.expires_at);
            const now = new Date();
            const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry > 0 && daysUntilExpiry <= EARLY_RENEWAL_DAYS) {
                earlyRenewalDiscount = Math.round(originalAmount * EARLY_RENEWAL_DISCOUNT);
                finalAmount = originalAmount - earlyRenewalDiscount;
                console.log('[Payment] Early renewal discount applied:', earlyRenewalDiscount);
            }
        }

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
            if (promoCode.min_order_amount && finalAmount < promoCode.min_order_amount) {
                return res.status(400).json({
                    error: `Minimum order amount of ₹${promoCode.min_order_amount} required`
                });
            }

            // Calculate discount
            if (promoCode.discount_type === 'percentage') {
                discountAmount = (finalAmount * promoCode.discount_value) / 100;
            } else {
                discountAmount = Math.min(promoCode.discount_value, finalAmount);
            }

            finalAmount = Math.max(0, finalAmount - discountAmount);
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

            // Calculate expiry
            const expiresAt = new Date();
            const months = DURATION_MONTHS[finalDuration];
            expiresAt.setMonth(expiresAt.getMonth() + months);

            // Create subscription
            const { data: subscription, error: subError } = await supabaseAdmin
                .from('user_subscriptions')
                .insert({
                    user_id: req.user!.id,
                    plan_id,
                    status: 'active',
                    duration_type: finalDuration,
                    is_recurring: is_recurring,
                    started_at: new Date().toISOString(),
                    expires_at: plan.name === 'Free' ? null : expiresAt.toISOString()
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
                duration: finalDuration,
                is_recurring: is_recurring.toString(),
                promo_code_id: promoCodeId || undefined
            }
        };

        console.log('[Payment] Razorpay order options:', JSON.stringify(options, null, 2));

        try {
            const razorpayOrder = await razorpay.orders.create(options as any) as { id: string; amount: number; currency: string };
            console.log('[Payment] Razorpay order created:', razorpayOrder.id);

            // Store order in database with new duration fields
            const { error: orderError } = await supabaseAdmin
                .from('payment_orders')
                .insert({
                    user_id: req.user!.id,
                    razorpay_order_id: razorpayOrder.id,
                    plan_id,
                    billing_cycle: finalDuration === '1_year' ? 'yearly' : 'monthly', // Legacy field
                    duration: finalDuration,
                    is_recurring: is_recurring,
                    amount: finalAmount,
                    original_amount: originalAmount,
                    discount_amount: discountAmount + earlyRenewalDiscount,
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
                    early_renewal_discount: earlyRenewalDiscount,
                    promo_discount: discountAmount,
                    discount_amount: discountAmount + earlyRenewalDiscount,
                    final_price: finalAmount
                },
                duration: finalDuration,
                is_recurring: is_recurring,
                promo_applied: promoCodeData
            });
        } catch (razorpayError: any) {
            console.error('[Payment] Razorpay order creation failed:', razorpayError);
            return res.status(500).json({
                error: 'Failed to create payment order with Razorpay',
                details: razorpayError.description || razorpayError.message
            });
        }
    } catch (error: any) {
        console.error('[Payment] Create order error:', error);
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

        // Calculate expiry date based on duration
        const duration = (paymentOrder.duration || '1_month') as DurationType;
        const months = DURATION_MONTHS[duration] || 1;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + months);

        // Create new subscription
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('user_subscriptions')
            .insert({
                user_id: req.user!.id,
                plan_id: paymentOrder.plan_id,
                status: 'active',
                duration_type: duration,
                is_recurring: paymentOrder.is_recurring || false,
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
            const durationLabel = duration.replace('_', ' ');
            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: wallet.id,
                type: 'debit',
                amount: paymentOrder.amount,
                description: `${paymentOrder.plan.name} subscription (${durationLabel}) via Razorpay`,
                category: 'subscription'
            });
        }

        // Record promo code usage if a promo code was used
        if (paymentOrder.promo_code_id && paymentOrder.discount_amount > 0) {
            await supabaseAdmin
                .from('promo_code_usages')
                .insert({
                    promo_code_id: paymentOrder.promo_code_id,
                    user_id: req.user!.id,
                    payment_order_id: paymentOrder.id,
                    discount_amount: paymentOrder.discount_amount
                });

            await supabaseAdmin.rpc('increment_promo_uses', { promo_id: paymentOrder.promo_code_id });
        }

        res.json({
            success: true,
            subscription,
            message: `Successfully subscribed to ${paymentOrder.plan.name} for ${duration.replace('_', ' ')}`
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
 * Now supports duration-based pricing
 */
router.post('/validate-promo', authenticate, async (req, res) => {
    try {
        const {
            code,
            plan_id,
            duration = '1_month', // New: duration type
            billing_cycle // Legacy: for backward compatibility
        } = req.body;

        if (!code || !plan_id) {
            return res.status(400).json({ error: 'Code and plan_id are required' });
        }

        // Handle legacy billing_cycle conversion
        let finalDuration: DurationType = duration as DurationType;
        if (!duration && billing_cycle) {
            finalDuration = billing_cycle === 'yearly' ? '1_year' : '1_month';
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

        // Get price based on duration
        const priceField = DURATION_PRICE_FIELD[finalDuration];
        let originalPrice = plan[priceField];

        // Fallback to calculated price if specific duration price not set
        if (!originalPrice || originalPrice === 0) {
            const monthlyPrice = plan.price_monthly || 0;
            const months = DURATION_MONTHS[finalDuration];
            const discountMultiplier =
                finalDuration === '3_months' ? 0.9 :
                    finalDuration === '6_months' ? 0.83 :
                        finalDuration === '1_year' ? 0.7 : 1;
            originalPrice = Math.round(monthlyPrice * months * discountMultiplier);
        }

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
            final_price: finalPrice,
            duration: finalDuration
        });
    } catch (error) {
        console.error('Validate promo code error:', error);
        res.status(500).json({ error: 'Failed to validate promo code' });
    }
});

export default router;
