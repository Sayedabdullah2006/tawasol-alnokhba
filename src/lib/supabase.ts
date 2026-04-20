import { createBrowserClient } from '@supabase/ssr'

// Placeholders let static prerender succeed when env vars aren't injected at build time.
// At runtime, Railway exposes the real values and the client connects normally.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  )
}
