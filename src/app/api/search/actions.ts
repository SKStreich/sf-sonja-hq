'use server'
import { createClient } from '@/lib/supabase/server'

export type SearchResultType = 'project' | 'task' | 'note' | 'file'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  href: string
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const supabase = createClient()
  const like = `%${q}%`

  const [projectsRes, tasksRes, updatesRes, filesRes] = await Promise.all([
    (supabase as any)
      .from('projects')
      .select('id, name, status')
      .or(`name.ilike.${like},description.ilike.${like}`)
      .limit(6),
    (supabase as any)
      .from('tasks')
      .select('id, title, project_id, projects(name)')
      .ilike('title', like)
      .eq('archived', false)
      .limit(6),
    (supabase as any)
      .from('project_updates')
      .select('id, content, update_type, project_id, projects(name)')
      .ilike('content', like)
      .limit(6),
    (supabase as any)
      .from('project_files')
      .select('id, filename, project_id, projects(name)')
      .ilike('filename', like)
      .limit(6),
  ])

  const results: SearchResult[] = []

  for (const p of projectsRes.data ?? []) {
    results.push({
      type: 'project',
      id: p.id,
      title: p.name,
      subtitle: p.status?.replace('_', ' ') ?? '',
      href: `/dashboard/projects/${p.id}`,
    })
  }
  for (const t of tasksRes.data ?? []) {
    results.push({
      type: 'task',
      id: t.id,
      title: t.title,
      subtitle: (t as any).projects?.name ?? '',
      href: `/dashboard/projects/${t.project_id}`,
    })
  }
  for (const u of updatesRes.data ?? []) {
    const text: string = u.content ?? ''
    results.push({
      type: 'note',
      id: u.id,
      title: text.length > 90 ? text.slice(0, 90) + '…' : text,
      subtitle: `${(u as any).projects?.name ?? ''} · Log`,
      href: `/dashboard/projects/${u.project_id}`,
    })
  }
  for (const f of filesRes.data ?? []) {
    results.push({
      type: 'file',
      id: f.id,
      title: f.filename,
      subtitle: `${(f as any).projects?.name ?? ''} · Files`,
      href: `/dashboard/projects/${f.project_id}`,
    })
  }

  return results
}
