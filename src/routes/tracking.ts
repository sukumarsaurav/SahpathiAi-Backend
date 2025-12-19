import express from 'express';
import { supabaseAdmin } from '../db/supabase';

const router = express.Router();

// Rate limiting map (in-memory, resets on server restart)
const visitTrackingLimits = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/track/visit
 * Track anonymous website visitor (public endpoint, no auth required)
 */
router.post('/visit', async (req, res) => {
    try {
        const {
            visitor_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer_url,
            landing_page,
            device_type
        } = req.body;

        if (!visitor_id) {
            return res.status(400).json({ error: 'visitor_id is required' });
        }

        // Rate limiting: 1 track per visitor per hour
        const now = Date.now();
        const lastTrack = visitTrackingLimits.get(visitor_id);
        if (lastTrack && now - lastTrack < RATE_LIMIT_WINDOW_MS) {
            return res.json({ success: true, rate_limited: true });
        }
        visitTrackingLimits.set(visitor_id, now);

        // Clean up old rate limit entries periodically (every 100th request)
        if (visitTrackingLimits.size > 10000) {
            const cutoff = now - RATE_LIMIT_WINDOW_MS;
            for (const [key, timestamp] of visitTrackingLimits.entries()) {
                if (timestamp < cutoff) {
                    visitTrackingLimits.delete(key);
                }
            }
        }

        // Get geolocation from IP (optional)
        let country = null;
        let countryCode = null;
        const forwarded = req.headers['x-forwarded-for'];
        const ip = typeof forwarded === 'string'
            ? forwarded.split(',')[0].trim()
            : req.socket.remoteAddress;

        if (ip && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.') && ip !== '::1') {
            try {
                const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`);
                if (geoResponse.ok) {
                    const geo = await geoResponse.json() as { status: string; country?: string; countryCode?: string };
                    if (geo.status === 'success') {
                        country = geo.country || null;
                        countryCode = geo.countryCode || null;
                    }
                }
            } catch (geoError) {
                // Non-critical, continue without geo data
            }
        }

        // Check if visitor already exists
        const { data: existing } = await supabaseAdmin
            .from('website_visitors')
            .select('id, visit_count')
            .eq('visitor_id', visitor_id)
            .single();

        if (existing) {
            // Update existing visitor
            await supabaseAdmin
                .from('website_visitors')
                .update({
                    visit_count: (existing.visit_count || 1) + 1,
                    last_visit_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            return res.json({ success: true, returning: true });
        }

        // Create new visitor record
        const { error } = await supabaseAdmin
            .from('website_visitors')
            .insert({
                visitor_id,
                utm_source: utm_source || null,
                utm_medium: utm_medium || null,
                utm_campaign: utm_campaign || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null,
                referrer_url: referrer_url || null,
                landing_page: landing_page || null,
                device_type: device_type || null,
                country,
                country_code: countryCode
            });

        if (error) {
            console.error('Error tracking visitor:', error);
            // Don't fail the request, tracking is non-critical
            return res.json({ success: true, error: 'tracking_failed' });
        }

        res.json({ success: true, new_visitor: true });
    } catch (error) {
        console.error('Tracking error:', error);
        // Non-critical, return success anyway
        res.json({ success: true, error: 'internal_error' });
    }
});

/**
 * POST /api/track/link-visitor
 * Link an anonymous visitor to a user after signup
 * Called from auth signup flow
 */
router.post('/link-visitor', async (req, res) => {
    try {
        const { visitor_id, user_id } = req.body;

        if (!visitor_id || !user_id) {
            return res.status(400).json({ error: 'visitor_id and user_id are required' });
        }

        const { error } = await supabaseAdmin
            .from('website_visitors')
            .update({
                user_id,
                converted_to_signup: true,
                signup_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('visitor_id', visitor_id);

        if (error) {
            console.error('Error linking visitor:', error);
            return res.json({ success: false, error: error.message });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Link visitor error:', error);
        res.json({ success: false });
    }
});

export default router;
