import { Router } from 'express';
import { supabase } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/wallet
 * Get wallet balance
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json(data || { balance: 0, total_earned: 0, total_spent: 0 });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

/**
 * GET /api/wallet/transactions
 * Get transaction history
 */
router.get('/transactions', authenticate, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        // Get wallet ID
        const { data: wallet } = await supabase
            .from('wallets')
            .select('id')
            .eq('user_id', req.user!.id)
            .single();

        if (!wallet) {
            return res.json([]);
        }

        const { data, error } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('wallet_id', wallet.id)
            .order('created_at', { ascending: false })
            .range(Number(offset), Number(offset) + Number(limit) - 1);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

/**
 * POST /api/wallet/add-money
 * Initiate add money (returns payment link)
 */
router.post('/add-money', authenticate, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // In production, integrate with payment gateway (Razorpay, Stripe, etc.)
        // For now, simulate success
        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Add transaction
        await supabase.from('wallet_transactions').insert({
            wallet_id: wallet.id,
            type: 'credit',
            amount,
            description: 'Added money to wallet',
            category: 'add_money'
        });

        // Update balance
        const newBalance = (wallet.balance || 0) + amount;
        const newEarned = (wallet.total_earned || 0) + amount;

        await supabase
            .from('wallets')
            .update({ balance: newBalance, total_earned: newEarned })
            .eq('id', wallet.id);

        res.json({
            success: true,
            new_balance: newBalance,
            message: `₹${amount} added to wallet`
        });
    } catch (error) {
        console.error('Add money error:', error);
        res.status(500).json({ error: 'Failed to add money' });
    }
});

/**
 * POST /api/wallet/withdraw
 * Request withdrawal
 */
router.post('/withdraw', authenticate, async (req, res) => {
    try {
        const { amount } = req.body;

        const { data: wallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Add transaction
        await supabase.from('wallet_transactions').insert({
            wallet_id: wallet.id,
            type: 'debit',
            amount,
            description: 'Withdrawal request',
            category: 'withdraw'
        });

        // Update balance
        const newBalance = wallet.balance - amount;
        const newSpent = (wallet.total_spent || 0) + amount;

        await supabase
            .from('wallets')
            .update({ balance: newBalance, total_spent: newSpent })
            .eq('id', wallet.id);

        res.json({
            success: true,
            new_balance: newBalance,
            message: `Withdrawal of ₹${amount} initiated`
        });
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Failed to process withdrawal' });
    }
});

export default router;
