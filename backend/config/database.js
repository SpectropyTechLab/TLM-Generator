require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase client for database operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = supabase;