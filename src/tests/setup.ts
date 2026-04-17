import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export function createTestClient(accessToken: string) {
  return createClient<Database>(
    process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321',
    process.env.SUPABASE_TEST_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

export function createServiceClient() {
  return createClient<Database>(
    process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321',
    process.env.SUPABASE_TEST_SERVICE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
