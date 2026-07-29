// ============================================================
// DFP UAT Agent — Supabase Browser Client
// ============================================================
// Uses only VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY.
// Respects RLS. Supports Realtime when enabled.
// NEVER imports server-only configuration.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnvironmentConfig } from '@/config/environment';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const env = getEnvironmentConfig();

  // Only access VITE_PUBLIC_ variables in the browser
  const supabaseUrl = readPublicEnv('VITE_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = readPublicEnv('VITE_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      '[UAT Agent] Supabase browser client not configured. ' +
      'Set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY in your environment.'
    );
    // Return a no-op-like client that will fail gracefully
    browserClient = createClient(
      supabaseUrl || 'http://localhost:54321',
      supabaseAnonKey || 'missing-anon-key',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      }
    );
    return browserClient;
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  const url = readPublicEnv('VITE_PUBLIC_SUPABASE_URL');
  const key = readPublicEnv('VITE_PUBLIC_SUPABASE_ANON_KEY');
  return Boolean(url && key && key !== 'replace-with-anon-key');
}

// Helper to safely read public env vars
function readPublicEnv(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as Record<string, string>)[key] || '';
  }
  return '';
}