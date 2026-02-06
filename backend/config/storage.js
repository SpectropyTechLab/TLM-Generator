require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase storage client
const storageConfig = {
  inputBucket: process.env.INPUT_BUCKET || 'paper2manual-input',
  outputBucket: process.env.OUTPUT_BUCKET || 'paper2manual-output'
};

module.exports = storageConfig;