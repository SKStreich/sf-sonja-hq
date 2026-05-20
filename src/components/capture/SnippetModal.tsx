'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  saveCodeSnippet,
  listProjectsForSnippet,
  listCommitsForProject,
  type ProjectChoice,
} from '@/app/api/knowledge/snippets'
import { defaultSnippetTitle } from '@/lib/knowledge/snippet-body'

interface Props {
  open: boolean
  onClose: () => void
}

interface Commit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

const LANGUAGES = [
  'ts', 'tsx', 'js', 'jsx', 'py', 'sql', 'sh', 'bash', 'json', 'yaml', 'html', 'css',
  'go', 'rs', 'rb', 'php', 'java', 'kt', 'swift', 'c', 'cpp', 'md', 'text',
]

const ENTITY_OPTIONS: Array<{ value: 'tm' | 'sf' | 'sfe' | 'sfc' | 'personal'; label: string }> = [
  { value: 'personal', label: 'Personal' },
  { value: 'sfe',      label: 'SF Enterprises' },
  { value: 'sf',       label: 'SF Solutions' },
  { value: 'sfc',      label: 'SF Construction' },
  { value: 'tm',       label: 'Triplemeter' },
]

export function SnippetModal({ open, onClose }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [titleEdited, setTitleEdited] = useState(false)
  const [language, setLanguage] = useState('ts')
  const [code, setCode] = useState('')
  const [entity, setEntity] = useState<typeof ENTITY_OPTIONS[number]['value']>('personal')
  const [projects, setProjects] = useState<ProjectChoice[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')
  const codeRef = useRef<HTMLTextAreaElement>(null)

  // Load projects + reset state every time the modal opens.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setTitleEdited(false)
    setLanguage('ts')
    setCode('')
    setEntity('personal')
    setProjectId('')
    setCommits(null)
    setSourceUrl('')
    setErr('')
    listProjectsForSnippet().then(setProjects).catch(() => setProjects([]))
    // Focus the code box after render so paste flow is one click.
    setTimeout(() => codeRef.current?.focus(), 50)
  }, [open])

  // Auto-title from first line of code if user hasn't edited the title.
  useEffect(() => {
    if (!titleEdited && code) setTitle(defaultSnippetTitle(code))
  }, [code, titleEdited])

  // When project changes, fetch commits if it has a GitHub URL, otherwise
  // clear the commit picker.
  useEffect(() => {
    setCommits(null)
    setSourceUrl('')
    if (!projectId) return
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    if (!project.github_url) return
    setCommitsLoading(true)
    listCommitsForProject(projectId, 15)
      .then(setCommits)
      .catch(() => setCommits([]))
      .finally(() => setCommitsLoading(false))
    // Inherit entity from project so the snippet lands in the right area.
    setEntity(project.entity)
  }, [projectId, projects])

  if (!open) return null

  const project = projects.find(p => p.id === projectId)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!code.trim()) { setErr('Add the code first.'); return }
    startBusy(async () => {
      try {
        const { id } = await saveCodeSnippet({
          title,
          language,
          code,
          projectId: projectId || null,
          sourceUrl: sourceUrl || null,
          sourceLabel: sourceUrl ? sourceLabelForUrl(sourceUrl, commits) : null,
          entity,
        })
        onClose()
        router.push(`/dashboard/knowledge/${id}`)
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to save')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
      >
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Save code snippet</h3>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <label className="col-span-2 block text-xs font-medium text-gray-700">
            Title
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setTitleEdited(true) }}
              placeholder="(auto from first line)"
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Language
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 font-mono"
            >
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <label className="mb-3 block text-xs font-medium text-gray-700">
          Code
          <textarea
            ref={codeRef}
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={10}
            placeholder="Paste your code here…"
            className="mt-1 w-full rounded border border-gray-300 bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-900 leading-relaxed"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-gray-700">
            Project (optional)
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="">— none —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.github_url ? ' ⎯ ⌥' : ''}
                </option>
              ))}
            </select>
            {project && !project.github_url && (
              <p className="mt-1 text-[11px] text-gray-400">No GitHub URL on this project — commit picker disabled.</p>
            )}
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Entity
            <select
              value={entity}
              onChange={e => setEntity(e.target.value as typeof entity)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
            >
              {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {(commitsLoading || (commits && commits.length > 0)) && (
          <label className="mb-3 block text-xs font-medium text-gray-700">
            GitHub commit (optional)
            <select
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 font-mono"
            >
              <option value="">— none —</option>
              {commitsLoading && <option disabled>Loading…</option>}
              {commits?.map(c => (
                <option key={c.url} value={c.url}>
                  {c.sha} · {truncate(c.message, 80)} · {formatDate(c.date)}
                </option>
              ))}
            </select>
          </label>
        )}

        {projectId && commits && commits.length === 0 && !commitsLoading && (
          <p className="mb-3 text-[11px] text-gray-400">No recent commits found (or rate-limited).</p>
        )}

        {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || !code.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save snippet'}
          </button>
        </div>
      </form>
    </div>
  )
}

function sourceLabelForUrl(url: string, commits: Commit[] | null): string {
  const match = commits?.find(c => c.url === url)
  if (match) return `${match.sha} · ${match.message}`
  return url
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}
