// ============================================================
// DFP UAT Agent — Supabase Admin Client
// ============================================================
// Uses the service-role key for controlled system tasks.
//
// ⛔ CRITICAL: This module MUST NEVER be imported by browser/client
//    components. It is for Supabase Edge Functions ONLY.
//
// ⛔ CRITICAL: The service-role key bypasses RLS. Use only for:
//    - n8n callbacks saving test results
//    - Evidence processing
//    - Cleanup jobs
//    - Administrative checks
//
//    Normal staff CRUD must use the authenticated server client and RLS.
// ============================================================

// This module can only execute in a Supabase Edge Function (Deno runtime).
// A browser import will fail at the JSR import line.

/*
// Example admin-client usage in an Edge Function:

import { createClient } from 'jsr:@supabase/supabase-js@2';

export function getSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Edge Function secrets.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
*/

// For the Vite SPA frontend, this is a documentation-only file.
// The actual admin client code runs in supabase/functions/.

export {};