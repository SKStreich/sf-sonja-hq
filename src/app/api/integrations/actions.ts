'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile found')
  return { supabase, user, org_id: profile.org_id }
}

export interface IntegrationStatus {
  id: string
  name: string
  icon: string
  description: string
  category: 'active' | 'configured' | 'error' | 'disconnected'
  detail: string
  lastSync?: string | null
  canSync: boolean
  errorMessage?: string | null
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const { supabase } = await getContext()
  const { data: records } = await (supabase as any)
    .from('integrations')
    .select('type, status, last_sync_at') as {
      data: { type: string; status: string; last_sync_at: string | null }[] | null
    }
  const byType = Object.fromEntries((records ?? []).map(r => [r.type, r]))
  const notionKey = !!process.env.NOTION_API_KEY
  const anthropicKey = !!process.env.ANTHROPIC_API_KEY
  const githubToken = !!process.env.GITHUB_TOKEN

  const notionRec = byType['notion']
  const notionErrored = notionKey && notionRec?.status === 'error'

  return [
    {
      id: 'notion',
      name: 'Notion',
      icon: 'N',
      description: 'Sync pages from your Notion workspace into the Document Library.',
      category: notionErrored ? 'error' : notionKey ? 'active' : 'disconnected',
      detail: notionErrored
        ? 'Last sync failed — check the error and try again'
        : notionKey
          ? 'Connected via API key'
          : 'Ask your admin to configure the Notion API key to enable sync',
      lastSync: notionRec?.last_sync_at ?? null,
      canSync: notionKey,
      errorMessage: null,
    },
    {
      id: 'claude',
      name: 'Claude API',
      icon: '✦',
      description: 'Powers AI Digest, Ask Anything, chat extraction, and the HQ Agent.',
      category: anthropicKey ? 'active' : 'disconnected',
      detail: anthropicKey
        ? 'API key configured — claude-sonnet-4-6'
        : 'Ask your admin to configure the Anthropic API key to enable AI features',
      canSync: false,
    },
    {
      id: 'github',
      name: 'GitHub',
      icon: 'gh',
      description: 'Link repos to projects and surface recent commits in the project view.',
      category: githubToken ? 'configured' : 'disconnected',
      detail: githubToken
        ? 'Token configured — private repo access enabled'
        : 'Public repos work out of the box. Ask your admin to add a GitHub token for private repos.',
      canSync: false,
    },
    {
      id: 'slack',
      name: 'Slack',
      icon: 'SL',
      description: 'Surface relevant channel activity and threads linked to projects.',
      category: 'disconnected',
      detail: 'Coming soon — requires Slack app installation',
      canSync: false,
    },
    {
      id: 'ms365',
      name: 'MS365 / Outlook',
      icon: 'M',
      description: 'Surface email threads and calendar events linked to projects.',
      category: 'disconnected',
      detail: 'Coming soon — requires Microsoft 365 Business plan',
      canSync: false,
    },
    {
      id: 'stripe',
      name: 'Stripe',
      icon: '$',
      description: 'Surface billing events and subscription status in SF entity views.',
      category: 'disconnected',
      detail: 'Coming soon — Stripe connection pending',
      canSync: false,
    },
    {
      id: 'tm_api',
      name: 'Triplemeter API',
      icon: 'TM',
      description: 'Surface platform status, metrics, and events in the TM entity view.',
      category: 'disconnected',
      detail: 'Coming soon — TM API connection pending',
      canSync: false,
    },
  ]
}

export async function triggerNotionSync(): Promise<void> {
  // Notion sync is on-demand from Knowledge Hub (Sprint 6). No-op here.
  revalidatePath('/dashboard/integrations')
}

export interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

export async function fetchGitHubCommits(repoUrl: string, limit = 10): Promise<GitHubCommit[]> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s?#]+)/)
  if (!match) return []
  const [, owner, repo] = match
  const cleanRepo = repo.replace(/\.git$/, '')
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/commits?per_page=${limit}`,
      { headers, next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data: any[] = await res.json()
    return data.map(c => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }))
  } catch {
    return []
  }
}

export async function saveGitHubUrl(projectId: string, githubUrl: string): Promise<void> {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('projects').update({ github_url: githubUrl }).eq('id', projectId)
  if (error) throw new Error('Failed to save GitHub URL')
  revalidatePath(`/dashboard/projects/${projectId}`)
}
