import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tasks } = await (supabase as any)
    .from('tasks')
    .select('*, projects(name), entities(name, type)')
    .eq('archived', false)
    .order('gtd_bucket')
    .order('due_date', { ascending: true, nullsFirst: false })

  const header = ['Title', 'Status', 'Priority', 'Bucket', 'Project', 'Entity', 'Due Date', 'Created']
  const rows = (tasks ?? []).map((t: any) => [
    `"${(t.title ?? '').replace(/"/g, '""')}"`,
    t.status ?? '',
    t.priority ?? '',
    t.gtd_bucket ?? '',
    `"${(t.projects?.name ?? '').replace(/"/g, '""')}"`,
    t.entities?.name ?? '',
    t.due_date ?? '',
    t.created_at ? t.created_at.slice(0, 10) : '',
  ])

  const csv = [header.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
