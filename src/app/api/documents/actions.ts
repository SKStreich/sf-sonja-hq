'use server'
import { createClient } from '@/lib/supabase/server'
import { createNotionClient, isNotionConfigured } from '@/lib/notion/client'
import { revalidatePath } from 'next/cache'

async function getOrgId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: (profile as any).org_id }
}

export type SyncResult = { synced: number; error: string | null }

export async function syncNotionPages(): Promise<SyncResult> {
  if (!isNotionConfigured()) return { synced: 0, error: 'NOTION_API_KEY not configured' }

  const { supabase, user, org_id } = await getOrgId()
  const notion = createNotionClient()

  try {
    // Search for all pages accessible to this integration
    const results: any[] = []
    let cursor: string | undefined

    do {
      const res = await notion.search({
        filter: { property: 'object', value: 'page' },
        page_size: 100,
        start_cursor: cursor,
      })
      results.push(...res.results)
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
    } while (cursor)

    let synced = 0

    for (const page of results) {
      if (page.object !== 'page') continue

      const title = extractTitle(page)
      if (!title) continue

      const notionPageId = page.id
      const notionUrl = page.url ?? null
      const contentPreview = extractPreview(page)

      await (supabase as any).from('documents').upsert({
        org_id,
        created_by: user.id,
        title,
        source: 'notion',
        notion_page_id: notionPageId,
        notion_url: notionUrl,
        content_preview: contentPreview,
        last_synced_at: new Date().toISOString(),
        confidentiality_tier: 'team',
      }, { onConflict: 'org_id,notion_page_id' })

      synced++
    }

    // Upsert integration record to track last sync
    await (supabase as any).from('integrations').upsert({
      org_id,
      created_by: user.id,
      type: 'notion',
      status: 'active',
      last_sync_at: new Date().toISOString(),
      config: {},
      scopes: ['read_content'],
    }, { onConflict: 'org_id,type' })

    revalidatePath('/dashboard/documents')
    revalidatePath('/dashboard/settings')
    return { synced, error: null }
  } catch (err: any) {
    return { synced: 0, error: err.message ?? 'Sync failed' }
  }
}

export async function linkProjectToNotion(projectId: string, notionUrl: string | null) {
  const { supabase } = await getOrgId()
  const { error } = await (supabase as any)
    .from('projects')
    .update({ notion_url: notionUrl })
    .eq('id', projectId)
  if (error) throw new Error('Failed to save Notion link')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

export async function deleteDocument(id: string) {
  const { supabase } = await getOrgId()
  await (supabase as any).from('documents').delete().eq('id', id)
  revalidatePath('/dashboard/documents')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTitle(page: any): string {
  // Database pages: properties.Name or properties.title
  if (page.properties) {
    for (const prop of Object.values(page.properties) as any[]) {
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map((t: any) => t.plain_text).join('')
      }
    }
  }
  return ''
}

function extractPreview(page: any): string {
  // Try to pull a short snippet from the page icon + last edited
  const edited = page.last_edited_time
    ? new Date(page.last_edited_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  return edited ? `Last edited ${edited}` : ''
}
