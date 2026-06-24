'use server'
/**
 * Granola integration — connection test (Sprint 13 foundation).
 * Verifies the GRANOLA_API_KEY env var reaches the API. Does NOT expose the key.
 * The Granola → inbox importer is built next session.
 */
import { createClient } from '@/lib/supabase/server'
import { getGranolaApiKey, listGranolaNotes } from '@/lib/integrations/granola'

export interface GranolaConnectionStatus {
  ok: boolean
  configured: boolean
  message: string
}

export async function testGranolaConnection(): Promise<GranolaConnectionStatus> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const key = getGranolaApiKey()
  if (!key) {
    return { ok: false, configured: false, message: 'GRANOLA_API_KEY is not set in this environment yet.' }
  }
  try {
    const page = await listGranolaNotes({ key })
    return {
      ok: true,
      configured: true,
      message: `Connected — ${page.notes.length} recent note${page.notes.length === 1 ? '' : 's'} visible${page.hasMore ? ' (more available)' : ''}.`,
    }
  } catch (e: any) {
    const msg = String(e?.message ?? '')
    return {
      ok: false,
      configured: true,
      message: msg.includes('401') || msg.includes('403')
        ? 'Key rejected by Granola — check the token value/scope.'
        : `Connection failed: ${msg || 'unknown error'}`,
    }
  }
}
