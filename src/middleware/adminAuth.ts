import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin as supabase } from '../db/supabase';

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Check user role
        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        if (error || !user) {
            console.error('Admin check failed:', error);
            return res.status(403).json({ error: 'Access denied' });
        }

        if (user.role !== 'admin' && user.role !== 'content_manager') {
            return res.status(403).json({ error: 'Admin privileges required' });
        }

        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
