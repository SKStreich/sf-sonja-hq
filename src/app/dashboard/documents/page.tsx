import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isNotionConfigured } from '@/lib/notion/client'
import { DocumentsClient } from './DocumentsClient'

export default async function DocumentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [documentsRes, integrationRes] = await Promise.all([
    (supabase as any)
      .from('documents')
      .select('id, title, source, notion_url, content_preview, last_synced_at, entity_id, tags')
      .order('last_synced_at', { ascending: false, nullsFirst: false }),
    (supabase as any)
      .from('integrations')
      .select('status, last_sync_at')
      .eq('type', 'notion')
      .maybeSingle(),
  ])

  return (
    <DocumentsClient
      documents={documentsRes.data ?? []}
      notionIntegration={integrationRes.data ?? null}
      notionConfigured={isNotionConfigured()}
    />
  )
}
