import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/referral
 * Get user's referral code and stats
 */
router.get('/', authenticate, async (req, res) => {
    try {
        // Get referral code
        const { data: codeData } = await supabaseAdmin
            .from('referral_codes')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        // Get referral stats
        const { data: referrals } = await supabaseAdmin
            .from('referrals')
            .select('status, reward_amount')
            .eq('referrer_id', req.user!.id);

        const totalReferred = referrals?.length || 0;
        const completedReferrals = referrals?.filter(r => r.status === 'completed') || [];
        const totalEarned = completedReferrals.reduce((sum, r) => sum + (r.reward_amount || 0), 0);

        res.json({
            code: codeData?.code,
            referral_link: codeData?.referral_link,
            stats: {
                total_referred: totalReferred,
                completed: completedReferrals.length,
                pending: totalReferred - completedReferrals.length,
                total_earned: totalEarned
            }
        });
    } catch (error) {
        console.error('Get referral error:', error);
        res.status(500).json({ error: 'Failed to fetch referral info' });
    }
});

/**
 * GET /api/referral/history
 * Get referral history (who signed up)
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('referrals')
            .select('*, referred:users!referred_id(full_name, email, created_at)')
            .eq('referrer_id', req.user!.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const history = data?.map(r => ({
            id: r.id,
            name: (r.referred as any)?.full_name || 'Anonymous',
            email: (r.referred as any)?.email,
            status: r.status,
            reward: r.reward_amount,
            joined_at: (r.referred as any)?.created_at,
            completed_at: r.completed_at
        }));

        res.json(history);
    } catch (error) {
        console.error('Get referral history error:', error);
        res.status(500).json({ error: 'Failed to fetch referral history' });
    }
});

/**
 * POST /api/referral/apply
 * Apply referral code during signup
 */
router.post('/apply', authenticate, async (req, res) => {
    try {
        const { code } = req.body;

        // Find referrer
        const { data: referralCode } = await supabaseAdmin
            .from('referral_codes')
            .select('user_id')
            .eq('code', code.toUpperCase())
            .single();

        if (!referralCode) {
            return res.status(404).json({ error: 'Invalid referral code' });
        }

        // Check if user already has a referrer
        const { data: existing } = await supabaseAdmin
            .from('referrals')
            .select('id')
            .eq('referred_id', req.user!.id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Referral code already applied' });
        }

        // Create referral
        const { data, error } = await supabaseAdmin
            .from('referrals')
            .insert({
                referrer_id: referralCode.user_id,
                referred_id: req.user!.id,
                status: 'pending',
                reward_amount: 15.00
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Referral code applied successfully', referral: data });
    } catch (error) {
        console.error('Apply referral error:', error);
        res.status(500).json({ error: 'Failed to apply referral code' });
    }
});

/**
 * POST /api/referral/complete
 * Complete referral (called when referred user completes first test)
 * This is typically called internally when user completes their first test
 */
router.post('/complete', authenticate, async (req, res) => {
    try {
        // Find pending referral for this user
        const { data: referral } = await supabaseAdmin
            .from('referrals')
            .select('*, referrer:users!referrer_id(id)')
            .eq('referred_id', req.user!.id)
            .eq('status', 'pending')
            .single();

        if (!referral) {
            return res.status(404).json({ error: 'No pending referral found' });
        }

        // Update referral status
        await supabaseAdmin
            .from('referrals')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', referral.id);

        // Add reward to referrer's wallet
        const { data: referrerWallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', (referral.referrer as any).id)
            .single();

        if (referrerWallet) {
            await supabaseAdmin
                .from('wallets')
                .update({
                    balance: referrerWallet.balance + referral.reward_amount,
                    total_earned: (referrerWallet.total_earned || 0) + referral.reward_amount
                })
                .eq('id', referrerWallet.id);

            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: referrerWallet.id,
                type: 'credit',
                amount: referral.reward_amount,
                description: 'Referral bonus',
                category: 'referral'
            });
        }

        // Add reward to referred user's wallet too
        const { data: userWallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (userWallet) {
            await supabaseAdmin
                .from('wallets')
                .update({
                    balance: userWallet.balance + referral.reward_amount,
                    total_earned: (userWallet.total_earned || 0) + referral.reward_amount
                })
                .eq('id', userWallet.id);

            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: userWallet.id,
                type: 'credit',
                amount: referral.reward_amount,
                description: 'Welcome bonus (referral)',
                category: 'referral'
            });
        }

        res.json({ message: 'Referral completed', reward: referral.reward_amount });
    } catch (error) {
        console.error('Complete referral error:', error);
        res.status(500).json({ error: 'Failed to complete referral' });
    }
});

export default router;
