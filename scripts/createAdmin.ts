
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
    const email = 'admin@sahpathi.ai';
    const password = 'password123';

    console.log(`Creating/Updating admin user: ${email}`);

    // 1. Use Admin API to create user (bypassing public auth checks)
    // This requires SERVICE_ROLE_KEY

    // Check if user exists first
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();

    let userId = listData?.users.find(u => u.email === email)?.id;

    if (!userId) {
        console.log('User not found, creating new admin user...');
        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (createError) {
            console.error('Failed to create admin user:', createError.message);
            // If it says user already exists but we didn't find it in list, tha's weird.
            // Try updating password to be sure.
        } else {
            userId = createData.user.id;
        }
    } else {
        console.log('User already exists, updating password...');
        await supabase.auth.admin.updateUserById(userId, { password });
    }

    if (!userId) {
        console.error('Could not determine user ID');
        process.exit(1);
    }

    console.log(`User ID: ${userId}`);

    // 2. Ensure user is in public.users

    const { error: upsertError } = await supabase
        .from('users')
        .upsert({
            id: userId,
            email: email,
            full_name: 'Super Admin',
            role: 'admin', // This is the key part!
            updated_at: new Date().toISOString()
        });

    if (upsertError) {
        console.error('Failed to update user role:', upsertError);
        process.exit(1);
    }

    console.log('Successfully set user role to ADMIN.');
}

createAdmin().catch(console.error);
