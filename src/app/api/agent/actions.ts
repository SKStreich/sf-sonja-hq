'use server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { getAnthropicApiKey, anthropicKeyEnvName } from '@/lib/anthropic-key'
import { fetchEntryEntityMap, fetchEntryIdsForEntity } from '@/lib/entities/multi-entity'
import { classifyEntry } from '@/lib/knowledge/classify'
import { insertInboxEntry } from '@/lib/knowledge/inbox-create'
import { ENTITY_SLUGS } from '@/lib/entities/config'

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
        entity_type: { type: 'string', description: 'Optional entity filter: tm, cthq, sfe, sfo, sfs, sfc, personal' },
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
        entity_type: { type: 'string', description: 'Optional entity filter: tm, cthq, sfe, sfo, sfs, sfc, personal' },
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
        entity_type: { type: 'string', description: 'Entity: tm, cthq, sfe, sfo, sfs, sfc, personal' },
        due_date: { type: 'string', description: 'ISO date string YYYY-MM-DD, optional' },
      },
      required: ['title'],
    },
  },
  {
    name: 'log_capture',
    description: 'Add a quick idea / note to the Knowledge triage inbox. It lands un-filed (no entity) for Sonja to file later; if you know the entity, pass it as entity_context so it is pre-selected.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The capture text' },
        type: { type: 'string', description: 'idea or note (default note)' },
        entity_context: { type: 'string', description: 'Optional entity slug: tm, cthq, sfe, sfo, sfs, sfc, personal' },
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
        entity_type: { type: 'string', description: 'Optional entity filter: tm, cthq, sfe, sfo, sfs, sfc, personal' },
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
    const [tasksRes, projectsRes, inboxRes] = await Promise.all([
      (supabase as any).from('tasks').select('title, status, priority, due_date, gtd_bucket')
        .eq('archived', false).not('status', 'in', '("done","cancelled")').limit(20),
      supabase.from('projects').select('name, status, next_action, entities(name,type)')
        .eq('status', 'active').limit(15),
      (supabase as any).from('knowledge_entries').select('title, kind')
        .eq('access', 'standard').eq('status', 'active').eq('triage_status', 'inbox').limit(10),
    ])
    const lines = [`Today: ${today}`, `Open tasks: ${tasksRes.data?.length ?? 0}`, `Active projects: ${projectsRes.data?.length ?? 0}`, `Inbox to triage: ${inboxRes.data?.length ?? 0}`, '']
    tasksRes.data?.forEach((t: any) => lines.push(`Task: ${t.title} [${t.status}${t.priority ? ` ${t.priority}` : ''}${t.due_date ? ` due:${t.due_date}` : ''}]`))
    projectsRes.data?.forEach((p: any) => lines.push(`Project: ${p.name} — next: ${p.next_action ?? '(none set)'})`))
    inboxRes.data?.forEach((c: any) => lines.push(`Inbox: [${c.kind ?? 'note'}] ${c.title ?? '(untitled)'}`))
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
    const content = String(input.content ?? '').trim()
    if (!content) return 'Failed to log capture: content is required'
    const kind = input.type === 'idea' ? 'idea' : 'note'
    const c = await classifyEntry(content, { apiKey: getAnthropicApiKey() })
    const hinted = typeof input.entity_context === 'string' ? input.entity_context.trim().toLowerCase() : null
    const suggestedEntity = (hinted && (ENTITY_SLUGS as readonly string[]).includes(hinted))
      ? hinted
      : c.suggested_entity
    try {
      await insertInboxEntry(supabase, user.id, org_id, {
        body: content,
        kind,
        title: c.title,
        summary: c.summary,
        typeHint: c.type_hint,
        tags: c.tags,
        suggestedEntity,
        source: 'agent',
      })
    } catch (e: any) {
      return `Failed to log capture: ${e.message}`
    }
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/knowledge')
    return `Added to the triage inbox: "${content}"${suggestedEntity ? ` (suggested entity: ${suggestedEntity})` : ''}`
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
      .select('id, title, summary, kind, tags, updated_at')
      .eq('org_id', org_id)
      .eq('status', 'active')
      .neq('access', 'vault')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (input.kind) query = query.eq('kind', input.kind)
    // Entity filter routes through the junction (OR-semantics).
    if (input.entity_type) {
      const ids = await fetchEntryIdsForEntity(supabase, input.entity_type as string)
      if (ids.length === 0) return 'No matching knowledge entries found.'
      query = query.in('id', ids)
    }
    if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,summary.ilike.%${q}%`)
    const { data, error } = await query
    if (error) return `Search failed: ${error.message}`
    if (!data || data.length === 0) return 'No matching knowledge entries found.'
    const entityMap = await fetchEntryEntityMap(supabase, data.map((e: any) => e.id))
    return data.map((e: any) =>
      `- [${e.kind}/${(entityMap[e.id] ?? []).join('+') || '—'}] ${e.title ?? '(untitled)'} — ${e.summary ?? '(no summary)'} (id: ${e.id})`
    ).join('\n')
  }

  if (name === 'read_knowledge_entry') {
    const id = String(input.entry_id ?? '').trim()
    if (!id) return 'entry_id is required.'
    const { data: entry, error } = await (supabase as any)
      .from('knowledge_entries')
      .select('id, title, body, summary, kind, tags, access, user_id, status')
      .eq('id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (error) return `Read failed: ${error.message}`
    if (!entry) return 'Entry not found or not in your org.'
    if (entry.status !== 'active') return 'Entry is archived or deleted.'
    if (entry.access === 'vault' && entry.user_id !== user.id) {
      return 'This entry is in the vault and only the owner can read it.'
    }
    const entryEntities = (await fetchEntryEntityMap(supabase, [id]))[id] ?? []
    const body = (entry.body ?? '').slice(0, 30000)
    return [
      `title: ${entry.title ?? '(untitled)'}`,
      `kind: ${entry.kind}  entity: ${entryEntities.join('+') || '—'}`,
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
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    const envName = anthropicKeyEnvName()
    return {
      content: `The HQ Agent is offline — ${envName} is not set. Add it in Vercel → Settings → Environment Variables and redeploy.`,
    }
  }

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

  // Agentic loop — max 5 tool rounds.
  // Anthropic SDK errors are surfaced to the user with a specific message
  // instead of being re-thrown — a thrown error in a server action becomes
  // an opaque 500 with the generic "Server Components render" message,
  // which is useless for the user (and surfaced once in prod when a stale
  // ANTHROPIC_API_KEY made the agent unusable).
  for (let round = 0; round < 5; round++) {
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages,
      })
    } catch (e: any) {
      return { content: formatAnthropicError(e), navigateTo }
    }

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

/**
 * Turn an Anthropic SDK error into a sentence the user can act on. The SDK
 * exposes `status` and a structured `error.error.type` on auth/rate/etc;
 * fall back to the generic message for anything else.
 *
 * We also log the original error server-side so Vercel function logs still
 * show the full stack — the user-facing string is just the executive summary.
 */
function formatAnthropicError(e: any): string {
  console.error('[sendAgentMessage] Anthropic call failed:', e)
  const status = e?.status as number | undefined
  const apiType = e?.error?.error?.type as string | undefined
  if (status === 401 || apiType === 'authentication_error') {
    return `The HQ Agent is offline — Anthropic rejected the API key (401). The ${anthropicKeyEnvName()} in Vercel needs to be rotated to a valid value.`
  }
  if (status === 429 || apiType === 'rate_limit_error') {
    return 'The HQ Agent is rate-limited right now. Try again in a minute.'
  }
  if (status === 400 && apiType === 'invalid_request_error') {
    return `The HQ Agent rejected the request — ${e?.error?.error?.message ?? 'invalid request'}.`
  }
  if (status && status >= 500) {
    return 'Anthropic returned a server error. Try again shortly; if it persists, check status.anthropic.com.'
  }
  return `The HQ Agent hit an unexpected error: ${e?.message ?? 'unknown'}. Check Vercel function logs for details.`
}
