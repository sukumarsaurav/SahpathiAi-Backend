import { OAuth2Client } from 'google-auth-library';

/**
 * Google OAuth2 client for verifying ID tokens
 */
const client = new OAuth2Client();

/**
 * Verified Google user profile
 */
export interface GoogleUserProfile {
    email: string;
    name: string;
    picture?: string;
    googleId: string;
    emailVerified: boolean;
}

/**
 * Verify a Google ID token and extract user profile
 * @param idToken - The ID token from Google Sign-In
 * @returns Verified user profile
 * @throws Error if token is invalid
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUserProfile> {
    try {
        // Get the client IDs from environment
        const webClientId = process.env.GOOGLE_CLIENT_ID;
        const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
        const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID;

        // Build audience array (accept tokens from web, Android, and iOS clients)
        const audience: string[] = [];
        if (webClientId) audience.push(webClientId);
        if (androidClientId) audience.push(androidClientId);
        if (iosClientId) audience.push(iosClientId);

        if (audience.length === 0) {
            throw new Error('No Google client IDs configured. Please set GOOGLE_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, or GOOGLE_IOS_CLIENT_ID in environment variables.');
        }

        // Verify the token
        const ticket = await client.verifyIdToken({
            idToken,
            audience, // Accept tokens from any of our configured clients
        });

        const payload = ticket.getPayload();

        if (!payload) {
            throw new Error('Invalid token payload');
        }

        // Extract user information
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;
        const googleId = payload.sub;
        const emailVerified = payload.email_verified || false;

        if (!email) {
            throw new Error('No email in token payload');
        }

        if (!name) {
            throw new Error('No name in token payload');
        }

        return {
            email,
            name,
            picture,
            googleId,
            emailVerified
        };
    } catch (error) {
        console.error('Google token verification error:', error);

        // Provide more specific error messages
        if (error instanceof Error) {
            if (error.message.includes('Token used too late')) {
                throw new Error('Google token has expired. Please sign in again.');
            }
            if (error.message.includes('Invalid token signature')) {
                throw new Error('Invalid Google token signature.');
            }
            if (error.message.includes('No pem found')) {
                throw new Error('Unable to verify token. Please try again.');
            }
            throw error;
        }

        throw new Error('Failed to verify Google token');
    }
}
