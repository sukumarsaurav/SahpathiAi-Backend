
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
const projectRoot = '/Users/sukumarsaurav/Project/sahpathi.ai';
dotenv.config({ path: path.join(projectRoot, 'backend/.env') });
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    dotenv.config({ path: path.join(projectRoot, '.env') });
}

console.log('Project Root:', projectRoot);
console.log('Supabase URL found:', !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL));
console.log('Service Key found:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('Anon Key found:', !!process.env.VITE_SUPABASE_ANON_KEY);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    console.error('URL:', supabaseUrl);
    console.error('Key (first 5 chars):', supabaseKey ? supabaseKey.substring(0, 5) : 'null');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuestions() {
    console.log('--- Checking Tests ---');
    const { data: tests, error: testError } = await supabase
        .from('tests')
        .select('*');

    if (testError) console.error(testError);
    else {
        console.log(`Found ${tests.length} tests.`);
        console.table(tests.map(t => ({ id: t.id, title: t.title, category: t.test_category_id })));
    }

    if (tests && tests.length > 0) {
        console.log('\n--- Checking Test Questions ---');
        for (const test of tests) {
            const { count, error } = await supabase
                .from('test_questions')
                .select('*', { count: 'exact', head: true })
                .eq('test_id', test.id);

            if (error) console.error(`Error checking questions for test ${test.id}:`, error);
            else console.log(`Test "${test.title}" (${test.id}) has ${count} questions.`);
        }
    }
}

checkQuestions();
