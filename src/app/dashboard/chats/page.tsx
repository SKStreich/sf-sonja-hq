import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatsClient } from './ChatsClient'

export default async function ChatsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [chatsRes, entitiesRes] = await Promise.all([
    (supabase as any)
      .from('chat_history')
      .select('id, title, summary, key_decisions, entity_id, url, chat_date, tags, indexed_at')
      .order('chat_date', { ascending: false, nullsFirst: false })
      .order('indexed_at', { ascending: false }),
    supabase
      .from('entities')
      .select('id, name, type')
      .eq('active', true)
      .order('name'),
  ])

  return (
    <ChatsClient
      chats={chatsRes.data ?? []}
      entities={entitiesRes.data ?? []}
      anthropicConfigured={!!process.env.ANTHROPIC_API_KEY}
    />
  )
}
