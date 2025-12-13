import { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin, getAuthenticatedClient } from '../db/supabase';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                preferred_language_id?: string;
                target_exam_id?: string;
            };
        }
    }
}

/**
 * Authentication middleware
 * Validates the JWT token from the Authorization header
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify the token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Create authenticated client for RLS operations
        const authSupabase = getAuthenticatedClient(token);

        // Fetch additional user data (without deprecated preferred_language_id from users)
        const { data: userData, error: fetchError } = await authSupabase
            .from('users')
            .select('id, email, target_exam_id')
            .eq('id', user.id)
            .single();

        // If user missing in public table, create them
        if (fetchError && fetchError.code === 'PGRST116') {
            const { data: newUser, error: createError } = await authSupabase
                .from('users')
                .insert({
                    id: user.id,
                    email: user.email,
                    username: user.email?.split('@')[0] + '_' + Math.floor(Math.random() * 1000),
                    full_name: user.user_metadata?.full_name || '',
                    avatar_url: user.user_metadata?.avatar_url || ''
                })
                .select()
                .single();

            if (createError) {
                console.error('Failed to auto-create user:', createError);
                return res.status(500).json({ error: 'Failed to create user profile' });
            }
            req.user = newUser;
        } else if (fetchError) {
            console.error('Error fetching user profile:', fetchError);
            // Fallback to basic info
            req.user = { id: user.id, email: user.email || '' };
        } else {
            req.user = userData;
        }

        // Fetch preferred_language_id from user_preferences table
        const { data: prefsData } = await supabaseAdmin
            .from('user_preferences')
            .select('preferred_language_id')
            .eq('user_id', user.id)
            .single();

        if (prefsData?.preferred_language_id) {
            req.user!.preferred_language_id = prefsData.preferred_language_id;
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}


/**
 * Optional authentication middleware
 * Allows unauthenticated requests but attaches user if token is valid
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // Continue without user
        }

        const token = authHeader.substring(7);
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (!error && user) {
            const { data: userData } = await supabase
                .from('users')
                .select('id, email, target_exam_id')
                .eq('id', user.id)
                .single();

            req.user = userData || { id: user.id, email: user.email || '' };

            // Fetch preferred_language_id from user_preferences table
            const { data: prefsData } = await supabaseAdmin
                .from('user_preferences')
                .select('preferred_language_id')
                .eq('user_id', user.id)
                .single();

            if (prefsData?.preferred_language_id && req.user) {
                req.user.preferred_language_id = prefsData.preferred_language_id;
            }
        }

        next();
    } catch (error) {
        // Continue without user on error
        next();
    }
}

