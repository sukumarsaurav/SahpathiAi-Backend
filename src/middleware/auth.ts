import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { verifyToken } from '../utils/jwt';

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
 * Validates custom JWT tokens from the Authorization header
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify custom JWT token
        const jwtPayload = verifyToken(token);

        if (!jwtPayload || jwtPayload.type !== 'access') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Fetch user data from database
        const { data: userData, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('id, email, target_exam_id')
            .eq('id', jwtPayload.userId)
            .single();

        if (fetchError || !userData) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = userData;

        // Fetch preferred_language_id from user_preferences table
        const { data: prefsData } = await supabaseAdmin
            .from('user_preferences')
            .select('preferred_language_id')
            .eq('user_id', jwtPayload.userId)
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
        const jwtPayload = verifyToken(token);

        if (jwtPayload && jwtPayload.type === 'access') {
            const { data: userData } = await supabaseAdmin
                .from('users')
                .select('id, email, target_exam_id')
                .eq('id', jwtPayload.userId)
                .single();

            if (userData) {
                req.user = userData;

                // Fetch preferred_language_id from user_preferences table
                const { data: prefsData } = await supabaseAdmin
                    .from('user_preferences')
                    .select('preferred_language_id')
                    .eq('user_id', jwtPayload.userId)
                    .single();

                if (prefsData?.preferred_language_id) {
                    req.user.preferred_language_id = prefsData.preferred_language_id;
                }
            }
        }

        next();
    } catch (error) {
        // Continue without user on error
        next();
    }
}


