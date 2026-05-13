import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Use in Server Components / Route Handlers
export function createServerClient() {
  return createServerComponentClient({ cookies });
}

// Service-role client — bypasses RLS. Server-only, never import in client code.
// Uses cache: 'no-store' on the underlying fetch to bypass Next.js 14 Data Cache,
// ensuring Supabase queries always return live data from the database.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  console.log('[adminClient] url:', !!url, 'key:', !!key, 'keyStart:', key?.slice(0, 15));
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url: RequestInfo | URL, options: RequestInit = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}
