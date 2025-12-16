import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for API endpoints
 * Limits: 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Stricter rate limiter for sensitive operations
 * Limits: 20 requests per 15 minutes per IP
 */
export const strictRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Rate limit exceeded for this operation' },
    standardHeaders: true,
    legacyHeaders: false,
});
