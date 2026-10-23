/**
 * Supabase client configuration for Spooktacular Halloween Party.
 * Uses service role key on the secure backend to interact with Supabase PostgreSQL.
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

function getSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.SUPABASE_URL;
  // Prioritize service role key for trusted backend operations (bypasses RLS where necessary)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseClient;
}

module.exports = {
  getSupabase,
  isSupabaseConfigured
};
