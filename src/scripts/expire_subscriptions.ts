/**
 * Subscription Expiry Cron Job
 * 
 * This script handles:
 * 1. Expiring subscriptions that have passed their expiry date
 * 2. Non-recurring subscriptions are automatically downgraded to Free
 * 3. Sends notification emails (future enhancement)
 * 
 * Run this script via cron every hour or daily:
 * - Hourly: 0 * * * * cd /path/to/backend && npx ts-node src/scripts/expire_subscriptions.ts
 * - Daily: 0 0 * * * cd /path/to/backend && npx ts-node src/scripts/expire_subscriptions.ts
 */

import { supabaseAdmin } from '../db/supabase';

interface ExpiredSubscription {
    id: string;
    user_id: string;
    plan_id: string;
    expires_at: string;
    is_recurring: boolean;
    plan: { name: string }[] | null; // Supabase returns array for joins
}

async function expireSubscriptions(): Promise<void> {
    console.log('🕐 Starting subscription expiry check...');
    console.log('📅 Current time:', new Date().toISOString());

    try {
        // Find all active, non-recurring subscriptions that have expired
        const { data: expiredSubs, error: fetchError } = await supabaseAdmin
            .from('user_subscriptions')
            .select('id, user_id, plan_id, expires_at, is_recurring, plan:subscription_plans(name)')
            .eq('status', 'active')
            .eq('is_recurring', false)
            .not('expires_at', 'is', null)
            .lt('expires_at', new Date().toISOString());

        if (fetchError) {
            throw new Error(`Failed to fetch expired subscriptions: ${fetchError.message}`);
        }

        if (!expiredSubs || expiredSubs.length === 0) {
            console.log('✅ No expired subscriptions found');
            return;
        }

        console.log(`📋 Found ${expiredSubs.length} expired subscription(s)`);

        // Get the Free plan for downgrading
        const { data: freePlan, error: freePlanError } = await supabaseAdmin
            .from('subscription_plans')
            .select('id')
            .eq('name', 'Free')
            .single();

        if (freePlanError || !freePlan) {
            console.error('❌ Free plan not found, cannot downgrade users');
            throw new Error('Free plan not found');
        }

        let expiredCount = 0;
        let errorCount = 0;

        for (const sub of expiredSubs as ExpiredSubscription[]) {
            try {
                console.log(`\n🔄 Processing subscription ${sub.id}`);
                console.log(`   User: ${sub.user_id}`);
                console.log(`   Plan: ${sub.plan?.[0]?.name || 'Unknown'}`);
                console.log(`   Expired at: ${sub.expires_at}`);

                // Mark current subscription as expired
                const { error: updateError } = await supabaseAdmin
                    .from('user_subscriptions')
                    .update({
                        status: 'expired',
                        cancelled_at: new Date().toISOString()
                    })
                    .eq('id', sub.id);

                if (updateError) {
                    console.error(`   ❌ Failed to update subscription: ${updateError.message}`);
                    errorCount++;
                    continue;
                }

                // Create new Free plan subscription
                const { error: insertError } = await supabaseAdmin
                    .from('user_subscriptions')
                    .insert({
                        user_id: sub.user_id,
                        plan_id: freePlan.id,
                        status: 'active',
                        duration_type: '1_month',
                        is_recurring: false,
                        started_at: new Date().toISOString(),
                        expires_at: null // Free plan doesn't expire
                    });

                if (insertError) {
                    console.error(`   ❌ Failed to create Free subscription: ${insertError.message}`);
                    errorCount++;
                    continue;
                }

                console.log(`   ✅ Downgraded to Free plan`);
                expiredCount++;

                // TODO: Send email notification to user
                // await sendExpiryNotification(sub.user_id, sub.plan?.[0]?.name || 'Unknown');

            } catch (subError: any) {
                console.error(`   ❌ Error processing subscription: ${subError.message}`);
                errorCount++;
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Total expired: ${expiredCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log('✅ Subscription expiry check completed');

    } catch (error: any) {
        console.error('❌ Error in subscription expiry job:', error.message);
        process.exit(1);
    }
}

async function checkUpcomingExpiries(): Promise<void> {
    console.log('\n📧 Checking for upcoming expiries (7-day warning)...');

    try {
        // Find subscriptions expiring in the next 7 days
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        const { data: upcomingSubs, error } = await supabaseAdmin
            .from('user_subscriptions')
            .select('id, user_id, expires_at, is_recurring, plan:subscription_plans(name)')
            .eq('status', 'active')
            .eq('is_recurring', false)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString())
            .lte('expires_at', sevenDaysFromNow.toISOString());

        if (error) {
            throw new Error(`Failed to fetch upcoming expiries: ${error.message}`);
        }

        if (!upcomingSubs || upcomingSubs.length === 0) {
            console.log('   No subscriptions expiring in the next 7 days');
            return;
        }

        console.log(`   Found ${upcomingSubs.length} subscription(s) expiring soon`);

        for (const sub of upcomingSubs) {
            const expiryDate = new Date(sub.expires_at);
            const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            console.log(`   - User ${sub.user_id}: ${daysRemaining} days remaining (${(sub.plan as any)?.[0]?.name || 'Unknown'})`);

            // TODO: Send reminder email
            // await sendRenewalReminder(sub.user_id, daysRemaining, (sub.plan as any)?.[0]?.name);
        }

    } catch (error: any) {
        console.error('Error checking upcoming expiries:', error.message);
    }
}

// Main execution
async function main(): Promise<void> {
    console.log('═'.repeat(60));
    console.log('SUBSCRIPTION EXPIRY CRON JOB');
    console.log('═'.repeat(60));

    await expireSubscriptions();
    await checkUpcomingExpiries();

    console.log('\n═'.repeat(60));
    console.log('JOB COMPLETED');
    console.log('═'.repeat(60));

    process.exit(0);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
