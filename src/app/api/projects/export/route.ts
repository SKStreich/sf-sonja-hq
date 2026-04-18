import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: projects } = await supabase
    .from('projects')
    .select('*, entities(name, type)')
    .order('status').order('name')

  const header = ['Name', 'Status', 'Priority', 'Phase', 'Entity', 'Due Date', 'Next Action', 'Next Action Due', 'Created']
  const rows = (projects ?? []).map((p: any) => [
    `"${(p.name ?? '').replace(/"/g, '""')}"`,
    p.status ?? '',
    p.priority ?? '',
    p.phase ?? '',
    p.entities?.name ?? '',
    p.due_date ?? '',
    `"${(p.next_action ?? '').replace(/"/g, '""')}"`,
    p.next_action_due ?? '',
    p.created_at ? p.created_at.slice(0, 10) : '',
  ])

  const csv = [header.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="projects-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
