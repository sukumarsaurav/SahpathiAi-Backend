import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import crypto from 'crypto';
import { supabaseAdmin } from '../db/supabase';

// Types
interface EmailSettings {
    provider: 'resend' | 'smtp';
    from_email: string;
    from_name: string;
    reply_to: string;
}

interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    utmSource?: string;
    utmCampaign?: string;
}

interface TemplateVariables {
    [key: string]: string | undefined;
}

interface EmailLog {
    recipient_email: string;
    template_name?: string;
    subject: string;
    status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed';
    provider: 'resend' | 'smtp';
    provider_message_id?: string;
    utm_source?: string;
    utm_campaign?: string;
    error_message?: string;
}

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize SMTP transporter
const smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // SSL
    auth: {
        user: process.env.SMTP_USER || 'faq@shirash.com',
        pass: process.env.SMTP_PASS
    }
});

/**
 * Email Service - Handles email sending via Resend or SMTP
 */
export class EmailService {
    private settings: EmailSettings | null = null;

    /**
     * Get current email settings from database
     */
    async getSettings(): Promise<EmailSettings> {
        if (this.settings) return this.settings;

        const { data, error } = await supabaseAdmin
            .from('email_settings')
            .select('*')
            .eq('is_active', true)
            .single();

        if (error || !data) {
            // Return default settings if not configured
            return {
                provider: 'resend',
                from_email: process.env.EMAIL_FROM || 'onboarding@resend.dev',
                from_name: process.env.EMAIL_FROM_NAME || 'SahpathiAi',
                reply_to: process.env.EMAIL_REPLY_TO || 'faq@shirash.com'
            };
        }

        this.settings = data as EmailSettings;
        return this.settings;
    }

    /**
     * Clear cached settings (call after updating settings)
     */
    clearSettingsCache(): void {
        this.settings = null;
    }

    /**
     * Update email settings
     */
    async updateSettings(settings: Partial<EmailSettings>): Promise<EmailSettings> {
        const { data, error } = await supabaseAdmin
            .from('email_settings')
            .update({
                ...settings,
                updated_at: new Date().toISOString()
            })
            .eq('is_active', true)
            .select()
            .single();

        if (error) throw error;

        this.clearSettingsCache();
        return data as EmailSettings;
    }

    /**
     * Send email using configured provider
     */
    async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
        const settings = await this.getSettings();

        const logEntry: EmailLog = {
            recipient_email: options.to,
            subject: options.subject,
            status: 'pending',
            provider: settings.provider,
            utm_source: options.utmSource,
            utm_campaign: options.utmCampaign
        };

        try {
            let result: { success: boolean; messageId?: string };

            if (settings.provider === 'resend') {
                result = await this.sendViaResend(options, settings);
            } else {
                result = await this.sendViaSmtp(options, settings);
            }

            logEntry.status = 'sent';
            logEntry.provider_message_id = result.messageId;

            await this.logEmail(logEntry);
            return result;

        } catch (error: any) {
            logEntry.status = 'failed';
            logEntry.error_message = error.message;
            await this.logEmail(logEntry);

            console.error(`Email send failed (${settings.provider}):`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send via Resend API
     */
    private async sendViaResend(
        options: SendEmailOptions,
        settings: EmailSettings
    ): Promise<{ success: boolean; messageId?: string }> {
        const { data, error } = await resend.emails.send({
            from: `${settings.from_name} <${settings.from_email}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo || settings.reply_to
        });

        if (error) {
            throw new Error(error.message);
        }

        return { success: true, messageId: data?.id };
    }

    /**
     * Send via SMTP (Hostinger)
     */
    private async sendViaSmtp(
        options: SendEmailOptions,
        settings: EmailSettings
    ): Promise<{ success: boolean; messageId?: string }> {
        const info = await smtpTransporter.sendMail({
            from: `"${settings.from_name}" <${process.env.SMTP_USER}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo || settings.reply_to
        });

        return { success: true, messageId: info.messageId };
    }

    /**
     * Log email to database
     */
    private async logEmail(log: EmailLog): Promise<void> {
        try {
            await supabaseAdmin.from('email_logs').insert(log);
        } catch (error) {
            console.error('Failed to log email:', error);
        }
    }

    /**
     * Get email template by name
     */
    async getTemplate(name: string): Promise<{ subject: string; html_content: string } | null> {
        const { data, error } = await supabaseAdmin
            .from('email_templates')
            .select('subject, html_content')
            .eq('name', name)
            .eq('is_active', true)
            .single();

        if (error || !data) return null;
        return data;
    }

    /**
     * Render template with variables
     */
    renderTemplate(template: string, variables: TemplateVariables): string {
        const compiled = Handlebars.compile(template);
        return compiled(variables);
    }

    /**
     * Send templated email
     */
    async sendTemplatedEmail(
        templateName: string,
        to: string,
        variables: TemplateVariables,
        utmParams?: { source?: string; campaign?: string }
    ): Promise<{ success: boolean; error?: string }> {
        const template = await this.getTemplate(templateName);

        if (!template) {
            return { success: false, error: `Template '${templateName}' not found` };
        }

        // Add UTM parameters to links in template
        let html = this.renderTemplate(template.html_content, variables);
        if (utmParams?.source || utmParams?.campaign) {
            html = this.addUtmToLinks(html, utmParams);
        }

        const subject = this.renderTemplate(template.subject, variables);

        return this.sendEmail({
            to,
            subject,
            html,
            utmSource: utmParams?.source,
            utmCampaign: utmParams?.campaign
        });
    }

    /**
     * Add UTM parameters to all links in HTML
     */
    private addUtmToLinks(html: string, utmParams: { source?: string; campaign?: string }): string {
        const params = new URLSearchParams();
        if (utmParams.source) params.set('utm_source', utmParams.source);
        if (utmParams.campaign) params.set('utm_campaign', utmParams.campaign);
        params.set('utm_medium', 'email');

        // Add UTM to href links
        return html.replace(
            /href="(https?:\/\/[^"]+)"/g,
            (match, url) => {
                const separator = url.includes('?') ? '&' : '?';
                return `href="${url}${separator}${params.toString()}"`;
            }
        );
    }

    /**
     * Generate secure token for verification/reset
     */
    generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create verification token
     */
    async createVerificationToken(
        userId: string,
        email: string,
        type: 'verification' | 'password_reset'
    ): Promise<string> {
        const token = this.generateToken();
        const expiresAt = new Date();

        if (type === 'verification') {
            expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours
        } else {
            expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour
        }

        // Invalidate existing tokens of same type
        await supabaseAdmin
            .from('email_verification_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('token_type', type);

        // Create new token
        await supabaseAdmin
            .from('email_verification_tokens')
            .insert({
                user_id: userId,
                email,
                token,
                token_type: type,
                expires_at: expiresAt.toISOString()
            });

        return token;
    }

    /**
     * Verify token and return user info
     */
    async verifyToken(
        token: string,
        type: 'verification' | 'password_reset'
    ): Promise<{ valid: boolean; userId?: string; email?: string; error?: string }> {
        const { data, error } = await supabaseAdmin
            .from('email_verification_tokens')
            .select('*')
            .eq('token', token)
            .eq('token_type', type)
            .single();

        if (error || !data) {
            return { valid: false, error: 'Invalid or expired token' };
        }

        // Check expiry
        if (new Date(data.expires_at) < new Date()) {
            return { valid: false, error: 'Token has expired' };
        }

        // Check if already used
        if (data.used_at) {
            return { valid: false, error: 'Token has already been used' };
        }

        return { valid: true, userId: data.user_id, email: data.email };
    }

    /**
     * Mark token as used
     */
    async markTokenUsed(token: string): Promise<void> {
        await supabaseAdmin
            .from('email_verification_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('token', token);
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(
        userId: string,
        email: string,
        name: string
    ): Promise<{ success: boolean; error?: string }> {
        const token = await this.createVerificationToken(userId, email, 'verification');
        const frontendUrl = process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app';
        const verificationLink = `${frontendUrl}/auth?mode=verify-email&token=${token}`;

        return this.sendTemplatedEmail('verification', email, {
            name,
            email,
            verification_link: verificationLink
        }, { source: 'transactional', campaign: 'email_verification' });
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
        // Get user by email
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (!user) {
            // Don't reveal if email exists
            return { success: true };
        }

        const token = await this.createVerificationToken(user.id, email, 'password_reset');
        const frontendUrl = process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app';
        const resetLink = `${frontendUrl}/auth?mode=reset-password&token=${token}`;

        return this.sendTemplatedEmail('password_reset', email, {
            email,
            reset_link: resetLink
        }, { source: 'transactional', campaign: 'password_reset' });
    }

    /**
     * Send welcome email after verification
     */
    async sendWelcomeEmail(email: string, name: string): Promise<{ success: boolean; error?: string }> {
        const frontendUrl = process.env.FRONTEND_URL || 'https://sahpathi-ai.vercel.app';

        return this.sendTemplatedEmail('welcome', email, {
            name,
            app_link: frontendUrl
        }, { source: 'transactional', campaign: 'welcome' });
    }
}

// Export singleton instance
export const emailService = new EmailService();
