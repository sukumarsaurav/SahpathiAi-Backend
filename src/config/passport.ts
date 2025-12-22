import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy, Profile as GitHubProfile } from 'passport-github2';
import crypto from 'crypto';
import { supabaseAdmin } from '../db/supabase';
import { generateTokenPair } from '../utils/jwt';

// OAuth user profile interface
interface OAuthUser {
    id: string;
    email: string;
    full_name: string;
    avatar_url?: string;
    auth_provider: 'google' | 'github';
    oauth_provider_id: string;
    isNewUser: boolean;
}

/**
 * Find or create user from OAuth profile
 */
async function findOrCreateOAuthUser(
    email: string,
    name: string,
    avatarUrl: string | undefined,
    provider: 'google' | 'github',
    providerId: string
): Promise<OAuthUser> {
    // Check if user exists with this email
    const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, email, full_name, auth_provider')
        .eq('email', email.toLowerCase())
        .single();

    if (existingUser) {
        // User exists - update OAuth provider ID if not set
        if (!existingUser.auth_provider || existingUser.auth_provider === 'email') {
            await supabaseAdmin
                .from('users')
                .update({
                    auth_provider: provider,
                    oauth_provider_id: providerId,
                    avatar_url: avatarUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingUser.id);
        }

        return {
            id: existingUser.id,
            email: existingUser.email,
            full_name: existingUser.full_name || name,
            avatar_url: avatarUrl,
            auth_provider: provider,
            oauth_provider_id: providerId,
            isNewUser: false
        };
    }

    // Create new user
    const userId = crypto.randomUUID();

    const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
            id: userId,
            email: email.toLowerCase(),
            full_name: name,
            avatar_url: avatarUrl,
            auth_provider: provider,
            oauth_provider_id: providerId,
            email_verified: true, // OAuth users are verified by the provider
            email_verified_at: new Date().toISOString()
        });

    if (insertError) {
        console.error('Error creating OAuth user:', insertError);
        throw new Error('Failed to create user account');
    }

    // Create related records
    try {
        await supabaseAdmin.from('user_stats').insert({ user_id: userId });
        await supabaseAdmin.from('user_preferences').insert({ user_id: userId });
        await supabaseAdmin.from('wallets').insert({ user_id: userId, balance: 0 });

        // Generate referral code
        const prefix = (name?.substring(0, 3) || 'SAH').toUpperCase().replace(/[^A-Z]/g, 'X');
        const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        const code = `${prefix}${randomPart}`;
        await supabaseAdmin.from('referral_codes').insert({
            user_id: userId,
            code,
            referral_link: `https://sahpathi-ai.vercel.app/auth?ref=${code}`
        });
    } catch (e) {
        console.log('Some related records may already exist');
    }

    return {
        id: userId,
        email: email.toLowerCase(),
        full_name: name,
        avatar_url: avatarUrl,
        auth_provider: provider,
        oauth_provider_id: providerId,
        isNewUser: true
    };
}

/**
 * Configure Passport.js with Google and GitHub OAuth strategies
 */
export function configurePassport() {
    // Google OAuth Strategy
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/v2/google/callback',
            scope: ['profile', 'email']
        }, async (accessToken: string, refreshToken: string, profile: GoogleProfile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No email provided by Google'), undefined);
                }

                const user = await findOrCreateOAuthUser(
                    email,
                    profile.displayName || profile.name?.givenName || 'User',
                    profile.photos?.[0]?.value,
                    'google',
                    profile.id
                );

                done(null, user);
            } catch (error) {
                console.error('Google OAuth error:', error);
                done(error as Error, undefined);
            }
        }));
        console.log('✓ Google OAuth strategy configured');
    } else {
        console.log('⚠ Google OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)');
    }

    // GitHub OAuth Strategy
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        passport.use(new GitHubStrategy({
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/auth/v2/github/callback',
            scope: ['user:email']
        }, async (accessToken: string, refreshToken: string, profile: GitHubProfile, done: (error: Error | null, user?: OAuthUser) => void) => {
            try {
                // GitHub may not include email in profile, need to fetch separately
                let email = profile.emails?.[0]?.value;

                if (!email) {
                    // Try to get email from GitHub API
                    try {
                        const response = await fetch('https://api.github.com/user/emails', {
                            headers: {
                                'Authorization': `token ${accessToken}`,
                                'Accept': 'application/vnd.github.v3+json'
                            }
                        });
                        const emails = await response.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
                        const primaryEmail = emails.find(e => e.primary && e.verified);
                        email = primaryEmail?.email || emails[0]?.email;
                    } catch (e) {
                        console.error('Failed to fetch GitHub email:', e);
                    }
                }

                if (!email) {
                    return done(new Error('No email provided by GitHub'), undefined);
                }

                const user = await findOrCreateOAuthUser(
                    email,
                    profile.displayName || profile.username || 'User',
                    profile.photos?.[0]?.value,
                    'github',
                    profile.id
                );

                done(null, user);
            } catch (error) {
                console.error('GitHub OAuth error:', error);
                done(error as Error, undefined);
            }
        }));
        console.log('✓ GitHub OAuth strategy configured');
    } else {
        console.log('⚠ GitHub OAuth not configured (missing GITHUB_CLIENT_ID/SECRET)');
    }

    // Serialize/deserialize (not used with JWT but required by passport)
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
        done(null, user);
    });
}

export { passport, findOrCreateOAuthUser, generateTokenPair };
export type { OAuthUser };
