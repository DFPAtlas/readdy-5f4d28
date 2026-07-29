// ============================================================
// DFP UAT Agent — Supabase Server Client
// ============================================================
// This client is for use in Supabase Edge Functions (Deno runtime).
// It uses the current authenticated session and respects RLS.
//
// ⚠️  This module must ONLY be imported from Edge Functions.
//    It will throw at runtime if imported in a browser context.
// ============================================================

// In Edge Functions (Deno), imports use the deno: specifier
// This file serves as documentation of the expected server-client pattern.
// The actual Edge Function code lives in supabase/functions/.

/*
// Example server-client usage in an Edge Function:

import { createClient } from 'jsr:@supabase/supabase-js@2';

export function getSupabaseServerClient(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
*/

// For the Vite SPA frontend, there is no Node.js server process.
// Browser code uses client.ts. Admin operations use admin.ts (Edge Functions only).
// This file exists as a documentation reference for Edge Function patterns.

export {};