/**
 * Meta Graph API Service
 * Handles OAuth flow, token management, and posting to Facebook/Instagram
 */

import axios from 'axios';

const META_GRAPH_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const META_OAUTH_URL = 'https://www.facebook.com/' + META_GRAPH_VERSION;

// Permissions available without App Review (for development/testing)
// Note: Advanced permissions like pages_manage_posts, instagram_content_publish
// require Facebook App Review to use with non-admin users
const FACEBOOK_PERMISSIONS = [
    'pages_show_list',        // View list of Pages user manages
    'pages_read_engagement'   // Read Page engagement data
].join(',');

export interface MetaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in?: number;
}

export interface MetaPage {
    id: string;
    name: string;
    access_token: string;
    category?: string;
    instagram_business_account?: {
        id: string;
        username?: string;
    };
}

export interface InstagramAccount {
    id: string;
    username: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
}

export interface MetaUserProfile {
    id: string;
    name: string;
    email?: string;
}

class MetaGraphApiService {
    private appId: string;
    private appSecret: string;
    private redirectUri: string;

    constructor() {
        this.appId = process.env.META_APP_ID || '';
        this.appSecret = process.env.META_APP_SECRET || '';
        this.redirectUri = process.env.META_REDIRECT_URI || '';
    }

    /**
     * Generate OAuth Login URL
     */
    getOAuthLoginUrl(state?: string): string {
        const params = new URLSearchParams({
            client_id: this.appId,
            redirect_uri: this.redirectUri,
            scope: FACEBOOK_PERMISSIONS,
            response_type: 'code',
            ...(state && { state })
        });

        return `${META_OAUTH_URL}/dialog/oauth?${params.toString()}`;
    }

    /**
     * Exchange OAuth code for short-lived access token
     */
    async exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
                params: {
                    client_id: this.appId,
                    client_secret: this.appSecret,
                    redirect_uri: this.redirectUri,
                    code
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Token exchange error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to exchange code for token');
        }
    }

    /**
     * Exchange short-lived token for long-lived token (60 days)
     */
    async getLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: this.appId,
                    client_secret: this.appSecret,
                    fb_exchange_token: shortLivedToken
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Long-lived token error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get long-lived token');
        }
    }

    /**
     * Refresh a long-lived token (must be done before expiry)
     */
    async refreshToken(existingToken: string): Promise<MetaTokenResponse> {
        // Long-lived tokens are refreshed by exchanging them again
        return this.getLongLivedToken(existingToken);
    }

    /**
     * Get user profile
     */
    async getUserProfile(accessToken: string): Promise<MetaUserProfile> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/me`, {
                params: {
                    fields: 'id,name,email',
                    access_token: accessToken
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('User profile error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get user profile');
        }
    }

    /**
     * Get user's Facebook pages
     */
    async getPages(accessToken: string): Promise<MetaPage[]> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/me/accounts`, {
                params: {
                    fields: 'id,name,access_token,category,instagram_business_account{id,username}',
                    access_token: accessToken
                }
            });

            return response.data.data || [];
        } catch (error: any) {
            console.error('Get pages error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get Facebook pages');
        }
    }

    /**
     * Get Instagram Business Account details
     */
    async getInstagramAccount(instagramAccountId: string, accessToken: string): Promise<InstagramAccount> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/${instagramAccountId}`, {
                params: {
                    fields: 'id,username,profile_picture_url,followers_count,media_count',
                    access_token: accessToken
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Instagram account error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to get Instagram account');
        }
    }

    /**
     * Verify token is still valid
     */
    async verifyToken(accessToken: string): Promise<boolean> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/debug_token`, {
                params: {
                    input_token: accessToken,
                    access_token: `${this.appId}|${this.appSecret}`
                }
            });

            return response.data.data?.is_valid || false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get token expiry info
     */
    async getTokenInfo(accessToken: string): Promise<{
        isValid: boolean;
        expiresAt: Date | null;
        scopes: string[];
    }> {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/debug_token`, {
                params: {
                    input_token: accessToken,
                    access_token: `${this.appId}|${this.appSecret}`
                }
            });

            const data = response.data.data;
            return {
                isValid: data.is_valid,
                expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
                scopes: data.scopes || []
            };
        } catch (error) {
            return { isValid: false, expiresAt: null, scopes: [] };
        }
    }

    /**
     * Publish text post to Facebook Page
     */
    async publishToFacebook(pageId: string, pageAccessToken: string, options: {
        message: string;
        link?: string;
        photoUrl?: string;
    }): Promise<{ id: string }> {
        try {
            let endpoint = `${META_GRAPH_URL}/${pageId}/feed`;
            const params: any = {
                access_token: pageAccessToken
            };

            if (options.photoUrl) {
                endpoint = `${META_GRAPH_URL}/${pageId}/photos`;
                params.url = options.photoUrl;
                params.caption = options.message;
            } else {
                params.message = options.message;
                if (options.link) {
                    params.link = options.link;
                }
            }

            const response = await axios.post(endpoint, null, { params });
            return { id: response.data.id || response.data.post_id };
        } catch (error: any) {
            console.error('Facebook publish error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to publish to Facebook');
        }
    }

    /**
     * Publish to Instagram (requires hosted image URL)
     * Instagram publishing is a 2-step process:
     * 1. Create a media container
     * 2. Publish the container
     */
    async publishToInstagram(instagramAccountId: string, accessToken: string, options: {
        caption: string;
        imageUrl: string;  // Must be publicly accessible URL
    }): Promise<{ id: string }> {
        try {
            // Step 1: Create media container
            const containerResponse = await axios.post(
                `${META_GRAPH_URL}/${instagramAccountId}/media`,
                null,
                {
                    params: {
                        image_url: options.imageUrl,
                        caption: options.caption,
                        access_token: accessToken
                    }
                }
            );

            const containerId = containerResponse.data.id;

            // Step 2: Publish the container
            const publishResponse = await axios.post(
                `${META_GRAPH_URL}/${instagramAccountId}/media_publish`,
                null,
                {
                    params: {
                        creation_id: containerId,
                        access_token: accessToken
                    }
                }
            );

            return { id: publishResponse.data.id };
        } catch (error: any) {
            console.error('Instagram publish error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || 'Failed to publish to Instagram');
        }
    }

    /**
     * Check if Meta API is configured
     */
    isConfigured(): boolean {
        return !!(this.appId && this.appSecret && this.redirectUri);
    }

    /**
     * Get configuration status
     */
    getConfigStatus(): {
        configured: boolean;
        missing: string[];
    } {
        const missing: string[] = [];
        if (!this.appId) missing.push('META_APP_ID');
        if (!this.appSecret) missing.push('META_APP_SECRET');
        if (!this.redirectUri) missing.push('META_REDIRECT_URI');

        return {
            configured: missing.length === 0,
            missing
        };
    }
}

export const metaGraphApi = new MetaGraphApiService();
