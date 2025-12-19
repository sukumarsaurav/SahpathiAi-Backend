/**
 * Social Media Routes
 * OAuth flow, account management, and posting for Facebook/Instagram
 */

import express from 'express';
import { supabaseAdmin } from '../db/supabase';
import { metaGraphApi } from '../services/metaGraphApi';
import crypto from 'crypto';

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Check if user is admin
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (userData?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        (req as any).user = user;
        (req as any).userData = userData;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authentication failed' });
    }
};

// =====================================================
// CONFIGURATION STATUS
// =====================================================

// GET /api/admin/social/config - Get Meta API configuration status
router.get('/config', requireAdmin, async (req, res) => {
    try {
        const status = metaGraphApi.getConfigStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get config status' });
    }
});

// =====================================================
// OAUTH FLOW
// =====================================================

// In-memory store for OAuth state tokens (use Redis in production)
const oauthStates = new Map<string, { userId: string; timestamp: number }>();

// Clean up expired states (older than 10 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [state, data] of oauthStates.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) {
            oauthStates.delete(state);
        }
    }
}, 60000);

// GET /api/admin/social/oauth/facebook/init - Start Facebook OAuth
router.get('/oauth/facebook/init', requireAdmin, async (req, res) => {
    try {
        if (!metaGraphApi.isConfigured()) {
            return res.status(400).json({
                error: 'Meta API not configured',
                missing: metaGraphApi.getConfigStatus().missing
            });
        }

        // Generate state token for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, {
            userId: (req as any).user.id,
            timestamp: Date.now()
        });

        const authUrl = metaGraphApi.getOAuthLoginUrl(state);
        res.json({ authUrl });
    } catch (error: any) {
        console.error('OAuth init error:', error);
        res.status(500).json({ error: 'Failed to initialize OAuth' });
    }
});

// GET /api/admin/social/oauth/callback - Handle OAuth callback
router.get('/oauth/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        // Handle OAuth errors from Meta
        if (error) {
            console.error('OAuth error from Meta:', error, error_description);
            return res.redirect(`${process.env.CLIENT_URL}/admin/social/callback?error=${encodeURIComponent(error_description as string || 'OAuth failed')}`);
        }

        if (!code || !state) {
            return res.redirect(`${process.env.CLIENT_URL}/admin/social/callback?error=Missing code or state`);
        }

        // Verify state token
        const stateData = oauthStates.get(state as string);
        if (!stateData) {
            return res.redirect(`${process.env.CLIENT_URL}/admin/social/callback?error=Invalid or expired state`);
        }
        oauthStates.delete(state as string);

        // Exchange code for access token
        const tokenData = await metaGraphApi.exchangeCodeForToken(code as string);

        // Exchange for long-lived token
        const longLivedToken = await metaGraphApi.getLongLivedToken(tokenData.access_token);

        // Get user profile
        const profile = await metaGraphApi.getUserProfile(longLivedToken.access_token);

        // Get Facebook pages with Instagram accounts
        const pages = await metaGraphApi.getPages(longLivedToken.access_token);

        // Store connected accounts
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (longLivedToken.expires_in || 60 * 24 * 60 * 60) * 1000);

        // Store each page as a Facebook account
        for (const page of pages) {
            // Upsert Facebook page account
            await supabaseAdmin
                .from('social_accounts')
                .upsert({
                    platform: 'facebook',
                    account_name: page.name,
                    account_id: page.id,
                    access_token: page.access_token,
                    page_id: page.id,
                    token_expires_at: expiresAt.toISOString(),
                    is_active: true,
                    last_sync_at: now.toISOString(),
                    connected_by: stateData.userId,
                    updated_at: now.toISOString()
                }, {
                    onConflict: 'account_id,platform',
                    ignoreDuplicates: false
                });

            // If page has linked Instagram, store that too
            if (page.instagram_business_account) {
                try {
                    const instagramDetails = await metaGraphApi.getInstagramAccount(
                        page.instagram_business_account.id,
                        page.access_token
                    );

                    await supabaseAdmin
                        .from('social_accounts')
                        .upsert({
                            platform: 'instagram',
                            account_name: instagramDetails.username || page.instagram_business_account.username,
                            account_id: page.instagram_business_account.id,
                            access_token: page.access_token,
                            page_id: page.id,
                            instagram_account_id: page.instagram_business_account.id,
                            token_expires_at: expiresAt.toISOString(),
                            is_active: true,
                            last_sync_at: now.toISOString(),
                            connected_by: stateData.userId,
                            updated_at: now.toISOString()
                        }, {
                            onConflict: 'account_id,platform',
                            ignoreDuplicates: false
                        });
                } catch (igError) {
                    console.error('Error fetching Instagram details:', igError);
                }
            }
        }

        // Redirect to frontend callback page
        res.redirect(`${process.env.CLIENT_URL}/admin/social/callback?success=true&pages=${pages.length}`);
    } catch (error: any) {
        console.error('OAuth callback error:', error);
        res.redirect(`${process.env.CLIENT_URL}/admin/social/callback?error=${encodeURIComponent(error.message || 'OAuth failed')}`);
    }
});

// =====================================================
// ACCOUNT MANAGEMENT
// =====================================================

// GET /api/admin/social/accounts - List connected accounts
router.get('/accounts', requireAdmin, async (req, res) => {
    try {
        const { data: accounts, error } = await supabaseAdmin
            .from('social_accounts')
            .select('id, platform, account_name, account_id, page_id, instagram_account_id, is_active, last_sync_at, token_expires_at, created_at')
            .order('platform', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Add token expiry status
        const now = new Date();
        const enrichedAccounts = (accounts || []).map((account: any) => ({
            ...account,
            token_status: account.token_expires_at
                ? new Date(account.token_expires_at) < now
                    ? 'expired'
                    : new Date(account.token_expires_at) < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
                        ? 'expiring_soon'
                        : 'valid'
                : 'unknown'
        }));

        res.json({ accounts: enrichedAccounts });
    } catch (error: any) {
        console.error('List accounts error:', error);
        res.status(500).json({ error: 'Failed to list accounts' });
    }
});

// GET /api/admin/social/accounts/:id - Get single account
router.get('/accounts/:id', requireAdmin, async (req, res) => {
    try {
        const { data: account, error } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Don't return the access token in response
        const { access_token, refresh_token, ...safeAccount } = account;
        res.json({ account: safeAccount });
    } catch (error: any) {
        console.error('Get account error:', error);
        res.status(500).json({ error: 'Failed to get account' });
    }
});

// DELETE /api/admin/social/accounts/:id - Disconnect account
router.delete('/accounts/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('social_accounts')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Failed to disconnect account' });
    }
});

// POST /api/admin/social/accounts/:id/test - Test connection
router.post('/accounts/:id/test', requireAdmin, async (req, res) => {
    try {
        const { data: account, error } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const tokenInfo = await metaGraphApi.getTokenInfo(account.access_token);

        // Update last_sync_at
        if (tokenInfo.isValid) {
            await supabaseAdmin
                .from('social_accounts')
                .update({
                    last_sync_at: new Date().toISOString(),
                    is_active: true
                })
                .eq('id', req.params.id);
        } else {
            await supabaseAdmin
                .from('social_accounts')
                .update({ is_active: false })
                .eq('id', req.params.id);
        }

        res.json({
            valid: tokenInfo.isValid,
            expiresAt: tokenInfo.expiresAt,
            scopes: tokenInfo.scopes
        });
    } catch (error: any) {
        console.error('Test connection error:', error);
        res.status(500).json({ error: 'Failed to test connection' });
    }
});

// POST /api/admin/social/accounts/:id/refresh - Refresh token
router.post('/accounts/:id/refresh', requireAdmin, async (req, res) => {
    try {
        const { data: account, error } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Only Facebook page tokens can be refreshed
        if (account.platform !== 'facebook') {
            // For Instagram, we need to refresh the parent Facebook page token
            return res.status(400).json({
                error: 'Instagram tokens are managed through their linked Facebook page'
            });
        }

        const newToken = await metaGraphApi.refreshToken(account.access_token);
        const expiresAt = new Date(Date.now() + (newToken.expires_in || 60 * 24 * 60 * 60) * 1000);

        await supabaseAdmin
            .from('social_accounts')
            .update({
                access_token: newToken.access_token,
                token_expires_at: expiresAt.toISOString(),
                last_sync_at: new Date().toISOString(),
                is_active: true
            })
            .eq('id', req.params.id);

        // Also update linked Instagram accounts
        if (account.page_id) {
            await supabaseAdmin
                .from('social_accounts')
                .update({
                    access_token: newToken.access_token,
                    token_expires_at: expiresAt.toISOString(),
                    last_sync_at: new Date().toISOString()
                })
                .eq('page_id', account.page_id)
                .eq('platform', 'instagram');
        }

        res.json({
            success: true,
            expiresAt: expiresAt.toISOString()
        });
    } catch (error: any) {
        console.error('Refresh token error:', error);
        res.status(500).json({ error: error.message || 'Failed to refresh token' });
    }
});

// =====================================================
// PUBLISHING
// =====================================================

// POST /api/admin/social/publish - Publish to connected accounts
router.post('/publish', requireAdmin, async (req, res) => {
    try {
        const { accountIds, message, link, imageUrl } = req.body;

        if (!accountIds || accountIds.length === 0) {
            return res.status(400).json({ error: 'No accounts selected' });
        }

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const results: { accountId: string; platform: string; success: boolean; postId?: string; error?: string }[] = [];

        for (const accountId of accountIds) {
            const { data: account, error } = await supabaseAdmin
                .from('social_accounts')
                .select('*')
                .eq('id', accountId)
                .single();

            if (error || !account) {
                results.push({ accountId, platform: 'unknown', success: false, error: 'Account not found' });
                continue;
            }

            try {
                if (account.platform === 'facebook') {
                    const result = await metaGraphApi.publishToFacebook(
                        account.page_id,
                        account.access_token,
                        { message, link, photoUrl: imageUrl }
                    );
                    results.push({ accountId, platform: 'facebook', success: true, postId: result.id });
                } else if (account.platform === 'instagram') {
                    if (!imageUrl) {
                        results.push({
                            accountId,
                            platform: 'instagram',
                            success: false,
                            error: 'Image URL required for Instagram'
                        });
                        continue;
                    }
                    const result = await metaGraphApi.publishToInstagram(
                        account.instagram_account_id,
                        account.access_token,
                        { caption: message, imageUrl }
                    );
                    results.push({ accountId, platform: 'instagram', success: true, postId: result.id });
                } else {
                    results.push({ accountId, platform: account.platform, success: false, error: 'Platform not supported' });
                }
            } catch (publishError: any) {
                results.push({
                    accountId,
                    platform: account.platform,
                    success: false,
                    error: publishError.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        res.json({
            success: successCount > 0,
            total: results.length,
            successful: successCount,
            results
        });
    } catch (error: any) {
        console.error('Publish error:', error);
        res.status(500).json({ error: 'Failed to publish' });
    }
});

// =====================================================
// AVAILABLE PAGES (for connecting new accounts)
// =====================================================

// GET /api/admin/social/pages - Get available pages (requires active user token)
router.get('/pages', requireAdmin, async (req, res) => {
    try {
        // Get the most recent Facebook account's token
        const { data: account } = await supabaseAdmin
            .from('social_accounts')
            .select('access_token')
            .eq('platform', 'facebook')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!account) {
            return res.status(400).json({
                error: 'No active Facebook account. Please connect via OAuth first.'
            });
        }

        const pages = await metaGraphApi.getPages(account.access_token);
        res.json({ pages });
    } catch (error: any) {
        console.error('Get pages error:', error);
        res.status(500).json({ error: error.message || 'Failed to get pages' });
    }
});

export default router;
