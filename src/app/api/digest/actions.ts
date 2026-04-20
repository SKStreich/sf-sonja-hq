'use server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id }
}

export interface InsightData {
  overdueTaskCount: number
  stalledProjects: { id: string; name: string; entity_name?: string }[]
  unreviewedCaptureCount: number
  todayTaskCount: number
}

export async function getInsights(): Promise<InsightData> {
  const { supabase } = await getContext()
  const today = new Date().toISOString().slice(0, 10)

  const [overdueRes, activeProjectsRes, capturesRes, todayRes] = await Promise.all([
    (supabase as any)
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', today)
      .eq('archived', false)
      .not('status', 'in', '("done","cancelled")'),

    supabase
      .from('projects')
      .select('id, name, next_action, entities(name, type)')
      .eq('status', 'active')
      .limit(30),

    supabase
      .from('captures')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed', false),

    (supabase as any)
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('gtd_bucket', 'today')
      .eq('archived', false)
      .not('status', 'in', '("done","cancelled")'),
  ])

  const stalledProjects = (activeProjectsRes.data ?? [])
    .filter((p: any) => !p.next_action?.trim())
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      entity_name: Array.isArray(p.entities) ? p.entities[0]?.name : (p.entities as any)?.name,
    }))

  return {
    overdueTaskCount: overdueRes.count ?? 0,
    stalledProjects,
    unreviewedCaptureCount: capturesRes.count ?? 0,
    todayTaskCount: todayRes.count ?? 0,
  }
}

interface TaskCtx { title: string; status: string; priority?: string; due_date?: string; gtd_bucket?: string }
interface ProjectCtx { name: string; next_action?: string; next_action_due?: string; entity_name?: string }
interface CaptureCtx { content: string; type?: string }

interface DigestCtx {
  today: string
  openTasks: TaskCtx[]
  activeProjects: ProjectCtx[]
  recentCaptures: CaptureCtx[]
}

async function buildDigestCtx(): Promise<DigestCtx> {
  const { supabase } = await getContext()
  const today = new Date().toISOString().slice(0, 10)

  const [tasksRes, projectsRes, capturesRes] = await Promise.all([
    (supabase as any)
      .from('tasks')
      .select('title, status, priority, due_date, gtd_bucket')
      .eq('archived', false)
      .not('status', 'in', '("done","cancelled")')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(25),

    supabase
      .from('projects')
      .select('name, next_action, next_action_due, entities(name)')
      .eq('status', 'active')
      .order('next_action_due', { ascending: true, nullsFirst: false })
      .limit(15),

    supabase
      .from('captures')
      .select('content, type')
      .eq('reviewed', false)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const openTasks: TaskCtx[] = (tasksRes.data ?? []).map((t: any) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    gtd_bucket: t.gtd_bucket,
  }))

  const activeProjects: ProjectCtx[] = (projectsRes.data ?? []).map((p: any) => ({
    name: p.name,
    next_action: p.next_action,
    next_action_due: p.next_action_due,
    entity_name: Array.isArray(p.entities) ? p.entities[0]?.name : (p.entities as any)?.name,
  }))

  const recentCaptures: CaptureCtx[] = (capturesRes.data ?? []).map((c: any) => ({
    content: c.content,
    type: c.type,
  }))

  return { today, openTasks, activeProjects, recentCaptures }
}

function formatCtxString(ctx: DigestCtx): string {
  const lines: string[] = [`Today is ${ctx.today}.`, '']

  if (ctx.openTasks.length > 0) {
    lines.push(`OPEN TASKS (${ctx.openTasks.length}):`)
    ctx.openTasks.forEach(t => {
      const parts = [`- ${t.title}`, `[${t.status}]`]
      if (t.priority) parts.push(`priority:${t.priority}`)
      if (t.due_date) parts.push(`due:${t.due_date}`)
      if (t.gtd_bucket) parts.push(`bucket:${t.gtd_bucket}`)
      lines.push(parts.join(' '))
    })
    lines.push('')
  }

  if (ctx.activeProjects.length > 0) {
    lines.push(`ACTIVE PROJECTS (${ctx.activeProjects.length}):`)
    ctx.activeProjects.forEach(p => {
      const parts = [`- ${p.name}`]
      if (p.entity_name) parts.push(`[${p.entity_name}]`)
      if (p.next_action) parts.push(`next: ${p.next_action}`)
      else parts.push('(no next action set)')
      if (p.next_action_due) parts.push(`due: ${p.next_action_due}`)
      lines.push(parts.join(' '))
    })
    lines.push('')
  }

  if (ctx.recentCaptures.length > 0) {
    lines.push(`UNREVIEWED CAPTURES (${ctx.recentCaptures.length}):`)
    ctx.recentCaptures.forEach(c => {
      lines.push(`- [${c.type ?? 'note'}] ${c.content}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

export interface DailyDigest {
  brief: string
  top_priorities: string[]
  watch_items: string[]
  recommendation: string
}

export async function getDailyDigest(): Promise<DailyDigest> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const ctx = await buildDigestCtx()
  const contextStr = formatCtxString(ctx)

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are Sonja's personal operations assistant. Based on the current state of her work below, generate a concise daily brief. Respond ONLY with valid JSON matching this schema:

{
  "brief": "2-3 sentence overview of today's situation",
  "top_priorities": ["3-4 specific actionable priorities for today"],
  "watch_items": ["1-3 things to watch — at-risk items, stalled work, aging captures"],
  "recommendation": "One clear, direct recommendation for the most impactful thing to do first"
}

Current workspace state:
${contextStr}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      brief: parsed.brief ?? '',
      top_priorities: Array.isArray(parsed.top_priorities) ? parsed.top_priorities : [],
      watch_items: Array.isArray(parsed.watch_items) ? parsed.watch_items : [],
      recommendation: parsed.recommendation ?? '',
    }
  } catch {
    throw new Error('Failed to parse AI response')
  }
}

export async function askAnything(question: string): Promise<string> {
  if (!question.trim()) throw new Error('Question is required')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const ctx = await buildDigestCtx()
  const contextStr = formatCtxString(ctx)

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are Sonja's personal operations assistant. Answer her question based on the current state of her work. Be concise and direct.

Current workspace state:
${contextStr}

Question: ${question}`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
