
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDb() {
    console.log('--- Checking Test Categories ---');
    const { data: categories, error: catError } = await supabase
        .from('test_categories')
        .select('*');

    if (catError) console.error(catError);
    else console.table(categories);

    console.log('\n--- Checking Tests ---');
    const { data: tests, error: testError } = await supabase
        .from('tests')
        .select('id, title, test_category_id, is_active');

    if (testError) console.error(testError);
    else console.table(tests);

    if (categories && tests) {
        console.log('\n--- Verifying Links ---');
        tests.forEach(t => {
            const cat = categories.find(c => c.id === t.test_category_id);
            console.log(`Test: "${t.title}" -> Category: ${cat ? cat.name + ' (' + cat.slug + ')' : 'UNMATCHED (' + t.test_category_id + ')'}`);
        });
    }
}

checkDb();
