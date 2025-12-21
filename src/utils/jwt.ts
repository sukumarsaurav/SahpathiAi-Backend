import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const JWT_REFRESH_EXPIRES_IN = '30d';

export interface JwtPayload {
    userId: string;
    email: string;
    type: 'access' | 'refresh';
}

/**
 * Generate an access token for a user
 */
export function generateAccessToken(userId: string, email: string): string {
    const payload: JwtPayload = {
        userId,
        email,
        type: 'access'
    };

    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Generate a refresh token for a user
 */
export function generateRefreshToken(userId: string, email: string): string {
    const payload: JwtPayload = {
        userId,
        email,
        type: 'refresh'
    };

    const options: SignOptions = { expiresIn: JWT_REFRESH_EXPIRES_IN };
    return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(userId: string, email: string): { accessToken: string; refreshToken: string } {
    return {
        accessToken: generateAccessToken(userId, email),
        refreshToken: generateRefreshToken(userId, email)
    };
}

/**
 * Verify a JWT token and return the payload
 */
export function verifyToken(token: string): JwtPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        return decoded;
    } catch (error) {
        return null;
    }
}

/**
 * Decode a token without verification (for debugging)
 */
export function decodeToken(token: string): JwtPayload | null {
    try {
        return jwt.decode(token) as JwtPayload;
    } catch {
        return null;
    }
}
