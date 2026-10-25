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
    },
    global: {
      headers: { 'x-application-name': 'spooktacular-halloween' },
      fetch: async (fetchUrl, fetchOptions = {}) => {
        // Enforce 12-second abort signal timeout to prevent database queries hanging indefinitely
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        if (fetchOptions.signal) {
          fetchOptions.signal.addEventListener('abort', () => controller.abort());
        }

        try {
          return await fetch(fetchUrl, {
            ...fetchOptions,
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }
    }
  });

  return supabaseClient;
}

/**
 * Health ping to test connectivity and keep connection pool warm
 */
async function pingDatabase() {
  if (!isSupabaseConfigured()) {
    return { status: 'sqlite', alive: true };
  }
  const client = getSupabase();
  if (!client) {
    return { status: 'supabase', alive: false, error: 'Supabase client uninitialized' };
  }
  try {
    const start = Date.now();
    const { error } = await client.from('admin_users').select('id').limit(1);
    const latencyMs = Date.now() - start;
    if (error) {
      return { status: 'supabase', alive: false, error: error.message, latencyMs };
    }
    return { status: 'supabase', alive: true, latencyMs };
  } catch (err) {
    return { status: 'supabase', alive: false, error: err.message };
  }
}

module.exports = {
  getSupabase,
  isSupabaseConfigured,
  pingDatabase
};
