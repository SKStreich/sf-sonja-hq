'use server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id }
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentResponse {
  content: string
  navigateTo?: string
}

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_workspace_summary',
    description: 'Get a snapshot of the current workspace: open tasks, active projects, and unreviewed captures.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_tasks',
    description: 'Search open tasks by keyword, optionally filtered by entity type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        entity_type: { type: 'string', description: 'Optional entity filter: tm, sf, sfe, personal' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_projects',
    description: 'Search projects by keyword, optionally filtered by status or entity type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        status: { type: 'string', description: 'Optional status filter: planning, active, on-hold, complete' },
        entity_type: { type: 'string', description: 'Optional entity filter: tm, sf, sfe, personal' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        priority: { type: 'string', description: 'high, medium, or low' },
        entity_type: { type: 'string', description: 'Entity: tm, sf, sfe, personal' },
        due_date: { type: 'string', description: 'ISO date string YYYY-MM-DD, optional' },
      },
      required: ['title'],
    },
  },
  {
    name: 'log_capture',
    description: 'Add a quick capture / idea / note to the captures inbox.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The capture text' },
        type: { type: 'string', description: 'idea, task, or note' },
        entity_context: { type: 'string', description: 'Optional entity context label' },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_project_next_action',
    description: "Update a project's next action field to unblock it.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name_contains: { type: 'string', description: 'Partial project name to find the project' },
        next_action: { type: 'string', description: 'The new next action text' },
      },
      required: ['project_name_contains', 'next_action'],
    },
  },
  {
    name: 'search_knowledge',
    description: 'Search Knowledge Hub entries (docs, notes, ideas, critiques, chats) by keyword. Returns titles, summaries, and ids — use read_knowledge_entry for full body content. Excludes vault entries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword (matches title and body)' },
        kind: { type: 'string', description: 'Optional: idea | doc | chat | note | critique' },
        entity_type: { type: 'string', description: 'Optional entity filter: tm, sf, sfe, personal' },
        limit: { type: 'number', description: 'Max results, default 10' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_knowledge_entry',
    description: 'Fetch the full body of a single Knowledge Hub entry by id. Use this after search_knowledge or when the user references a specific entry. Returns title, body (truncated to 30k chars), summary, kind, entity, tags. Refuses to read vault entries unless the caller is the owner.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entry_id: { type: 'string', description: 'The knowledge_entries.id UUID' },
      },
      required: ['entry_id'],
    },
  },
  {
    name: 'navigate_to',
    description: 'Send the user to a specific page within HQ.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page: {
          type: 'string',
          description: 'One of: dashboard, tasks, projects, documents, chats, digest, captures, settings, cost',
        },
        project_id: { type: 'string', description: 'Optional — if navigating to a specific project' },
      },
      required: ['page'],
    },
  },
]

const PAGE_URLS: Record<string, string> = {
  dashboard: '/dashboard',
  tasks: '/dashboard/tasks',
  projects: '/dashboard/projects',
  documents: '/dashboard/documents',
  chats: '/dashboard/chats',
  digest: '/dashboard/digest',
  captures: '/dashboard/captures',
  settings: '/dashboard/settings',
  cost: '/dashboard/cost',
}

async function executeTool(name: string, input: Record<string, any>, ctx: Awaited<ReturnType<typeof getContext>>): Promise<string> {
  const { supabase, user, org_id } = ctx

  if (name === 'get_workspace_summary') {
    const today = new Date().toISOString().slice(0, 10)
    const [tasksRes, projectsRes, capturesRes] = await Promise.all([
      (supabase as any).from('tasks').select('title, status, priority, due_date, gtd_bucket')
        .eq('archived', false).not('status', 'in', '("done","cancelled")').limit(20),
      supabase.from('projects').select('name, status, next_action, entities(name,type)')
        .eq('status', 'active').limit(15),
      supabase.from('captures').select('content, type').eq('reviewed', false).limit(10),
    ])
    const lines = [`Today: ${today}`, `Open tasks: ${tasksRes.data?.length ?? 0}`, `Active projects: ${projectsRes.data?.length ?? 0}`, `Unreviewed captures: ${capturesRes.data?.length ?? 0}`, '']
    tasksRes.data?.forEach((t: any) => lines.push(`Task: ${t.title} [${t.status}${t.priority ? ` ${t.priority}` : ''}${t.due_date ? ` due:${t.due_date}` : ''}]`))
    projectsRes.data?.forEach((p: any) => lines.push(`Project: ${p.name} — next: ${p.next_action ?? '(none set)'})`))
    capturesRes.data?.forEach((c: any) => lines.push(`Capture: [${c.type ?? 'note'}] ${c.content}`))
    return lines.join('\n')
  }

  if (name === 'search_tasks') {
    const q = (input.query as string).toLowerCase()
    const res = await (supabase as any).from('tasks')
      .select('id, title, status, priority, due_date, entities(name, type)')
      .eq('archived', false).not('status', 'in', '("done","cancelled")').limit(30)
    const tasks = (res.data ?? []).filter((t: any) =>
      t.title.toLowerCase().includes(q) ||
      (input.entity_type && t.entities?.[0]?.type === input.entity_type)
    )
    if (tasks.length === 0) return 'No matching tasks found.'
    return tasks.map((t: any) => `- ${t.title} [${t.status}, ${t.priority ?? 'no priority'}${t.due_date ? `, due ${t.due_date}` : ''}] (id: ${t.id})`).join('\n')
  }

  if (name === 'search_projects') {
    const q = (input.query as string).toLowerCase()
    const res = await supabase.from('projects')
      .select('id, name, status, priority, next_action, entities(name, type)').limit(40)
    const projects = (res.data ?? []).filter((p: any) =>
      p.name.toLowerCase().includes(q) ||
      (p.next_action ?? '').toLowerCase().includes(q) ||
      (input.status && p.status === input.status) ||
      (input.entity_type && (Array.isArray(p.entities) ? p.entities[0]?.type : (p.entities as any)?.type) === input.entity_type)
    )
    if (projects.length === 0) return 'No matching projects found.'
    return projects.map((p: any) => `- ${p.name} [${p.status}] next: ${p.next_action ?? '(none)'} (id: ${p.id})`).join('\n')
  }

  if (name === 'create_task') {
    let entityId: string | null = null
    if (input.entity_type) {
      const { data: ent } = await supabase.from('entities').select('id').eq('type', input.entity_type).eq('active', true).limit(1).single() as { data: { id: string } | null }
      entityId = ent?.id ?? null
    }
    const { error } = await (supabase as any).from('tasks').insert({
      org_id,
      user_id: user.id,
      created_by: user.id,
      title: input.title,
      priority: input.priority ?? 'medium',
      entity_id: entityId,
      due_date: input.due_date ?? null,
      status: 'todo',
      gtd_bucket: 'backlog',
      archived: false,
    })
    if (error) return `Failed to create task: ${error.message}`
    revalidatePath('/dashboard/tasks')
    revalidatePath('/dashboard')
    return `Task created: "${input.title}"`
  }

  if (name === 'log_capture') {
    const { error } = await (supabase as any).from('captures').insert({
      org_id,
      user_id: user.id,
      content: input.content,
      type: input.type ?? 'note',
      entity_context: input.entity_context ?? null,
      reviewed: false,
    })
    if (error) return `Failed to log capture: ${error.message}`
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/captures')
    return `Capture logged: "${input.content}"`
  }

  if (name === 'update_project_next_action') {
    const { data: projects } = await (supabase as any).from('projects')
      .select('id, name').ilike('name', `%${input.project_name_contains}%`).limit(5) as { data: { id: string; name: string }[] | null }
    if (!projects || projects.length === 0) return `No project found matching "${input.project_name_contains}"`
    const project = projects[0]
    const { error } = await (supabase as any).from('projects').update({ next_action: input.next_action }).eq('id', project.id)
    if (error) return `Failed to update: ${error.message}`
    revalidatePath('/dashboard/projects')
    revalidatePath('/dashboard')
    return `Updated next action on "${project.name}" to: "${input.next_action}"`
  }

  if (name === 'search_knowledge') {
    const q = (input.query as string ?? '').trim()
    const limit = Math.min(20, Math.max(1, Number(input.limit) || 10))
    let query = (supabase as any)
      .from('knowledge_entries')
      .select('id, title, summary, kind, entity, tags, updated_at')
      .eq('org_id', org_id)
      .eq('status', 'active')
      .neq('access', 'vault')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (input.kind) query = query.eq('kind', input.kind)
    if (input.entity_type) query = query.eq('entity', input.entity_type)
    if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,summary.ilike.%${q}%`)
    const { data, error } = await query
    if (error) return `Search failed: ${error.message}`
    if (!data || data.length === 0) return 'No matching knowledge entries found.'
    return data.map((e: any) =>
      `- [${e.kind}/${e.entity}] ${e.title ?? '(untitled)'} — ${e.summary ?? '(no summary)'} (id: ${e.id})`
    ).join('\n')
  }

  if (name === 'read_knowledge_entry') {
    const id = String(input.entry_id ?? '').trim()
    if (!id) return 'entry_id is required.'
    const { data: entry, error } = await (supabase as any)
      .from('knowledge_entries')
      .select('id, title, body, summary, kind, entity, tags, access, user_id, status')
      .eq('id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (error) return `Read failed: ${error.message}`
    if (!entry) return 'Entry not found or not in your org.'
    if (entry.status !== 'active') return 'Entry is archived or deleted.'
    if (entry.access === 'vault' && entry.user_id !== user.id) {
      return 'This entry is in the vault and only the owner can read it.'
    }
    const body = (entry.body ?? '').slice(0, 30000)
    return [
      `title: ${entry.title ?? '(untitled)'}`,
      `kind: ${entry.kind}  entity: ${entry.entity}`,
      `tags: ${(entry.tags ?? []).join(', ') || '(none)'}`,
      `summary: ${entry.summary ?? '(no summary)'}`,
      '',
      'BODY:',
      body || '(empty)',
    ].join('\n')
  }

  if (name === 'navigate_to') {
    const url = input.project_id
      ? `/dashboard/projects/${input.project_id}`
      : (PAGE_URLS[input.page] ?? '/dashboard')
    return `NAVIGATE:${url}`
  }

  return 'Unknown tool.'
}

export async function sendAgentMessage(
  history: AgentMessage[],
  userMessage: string,
): Promise<AgentResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const ctx = await getContext()
  const client = new Anthropic({ apiKey })

  const systemPrompt = `You are the HQ Agent — Sonja's personal operations assistant embedded in Sonja HQ. You help her find information, navigate the app, take quick actions, and make sense of her work across Triplemeter, SF Solutions, SF Enterprises, and Personal.

Be concise and direct. When you create or update something, confirm it briefly. When asked to navigate, use the navigate_to tool and tell her where you're sending her. You have access to live workspace data via tools — use them when you need current information rather than guessing.

When the user asks about a specific document, idea, note, chat, or critique, use search_knowledge to find candidates and read_knowledge_entry to get the full body before answering. Don't claim you only have metadata — pull the body. Vault entries are private to their owner; respect that.

If the user message includes a token like "ENTRY_CONTEXT: <uuid>" you should immediately call read_knowledge_entry on that uuid before responding.

Entities: tm = Triplemeter, sf = SF Solutions, sfe = SF Enterprises, personal = Personal.`

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  let navigateTo: string | undefined
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Agentic loop — max 5 tool rounds
  for (let round = 0; round < 5; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages,
    })

    totalInputTokens += response.usage?.input_tokens ?? 0
    totalOutputTokens += response.usage?.output_tokens ?? 0

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      try {
        const { logAnthropicCall } = await import('@/app/api/usage/actions')
        await logAnthropicCall(ctx.org_id, totalInputTokens, totalOutputTokens)
      } catch {}
      return { content: text, navigateTo }
    }

    if (response.stop_reason === 'tool_use') {
      const assistantMessage: Anthropic.MessageParam = { role: 'assistant', content: response.content }
      messages.push(assistantMessage)

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const result = await executeTool(block.name, block.input as Record<string, any>, ctx)
        if (result.startsWith('NAVIGATE:')) {
          navigateTo = result.slice('NAVIGATE:'.length)
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // Unexpected stop reason
    break
  }

  try {
    const { logAnthropicCall } = await import('@/app/api/usage/actions')
    await logAnthropicCall(ctx.org_id, totalInputTokens, totalOutputTokens)
  } catch {}

  return { content: 'I ran into an issue processing that. Please try again.', navigateTo }
}
