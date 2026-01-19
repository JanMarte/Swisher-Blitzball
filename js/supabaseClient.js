import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// REPLACE WITH YOUR ACTUAL SUPABASE URL AND KEY
const SUPABASE_URL = 'https://wurqsmlctaabmmxkuxgm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cnFzbWxjdGFhYm1teGt1eGdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MzIxNTQsImV4cCI6MjA4NDQwODE1NH0.uGaBd2ybDM9vFD7_0Z6BIjyepDtYhISBFcjr7y5pW5M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);