// ============================================================
// DFP UAT Agent — Supabase Lib Barrel
// ============================================================

export { getSupabaseBrowserClient, isSupabaseConfigured } from './client';

// server.ts and admin.ts are documentation-only for Edge Functions.
// They must not be imported by browser/client code.