'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  updateEntry, deleteEntry,
  type KnowledgeEntry, type Kind, type Entity,
} from '@/app/api/knowledge/actions'
import {
  critiqueAndSave, addFollowUpNote, restoreVersion,
  type EntryVersion, type RelatedEntry,
} from '@/app/api/knowledge/detail'
import { getOriginalView, type OriginalView } from '@/app/api/knowledge/upload'
import { listChatMessages, sendChatMessage, type ChatMessage } from '@/app/api/knowledge/chat'
import {
  getWorkspaceAncestors, createWorkspacePage, listWorkspaceChildren,
  getWorkspaceSiblings,
  type WorkspaceNode,
} from '@/app/api/knowledge/workspace'
import {
  searchLinkTargets, resolveMentionsForRender, getEntryBacklinks,
  getEntryAttachments, attachEntryToProject, detachEntry, type EntryAttachment,
  type LinkTarget, type LinkTargetKind, type Backlink,
} from '@/app/api/knowledge/links'
import {
  detectSlashToken, filterSlashCommands,
  type SlashCommand,
} from '@/lib/knowledge/slash-commands'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  listShares, createShare, revokeShare, extendShare,
  listForwardRequests, decideForwardRequest,
  type Share, type ForwardRequest,
} from '@/app/api/knowledge/shares'
import { createTaskFromWorkspace } from '@/app/api/tasks/actions'
import { getMergedFrom, getMergedInto, type MergedRef } from '@/app/api/knowledge/merge'
import { EntityMultiSelect } from '@/components/shared/EntityMultiSelect'
import { ENTITY_SELECT_OPTIONS } from '@/lib/entities/config'

const KINDS: Kind[] = ['idea', 'doc', 'chat', 'note', 'critique']

interface Props {
  entry: KnowledgeEntry
  versions: EntryVersion[]
  critiques: RelatedEntry[]
  followUpNotes: RelatedEntry[]
}

type Tab = 'content' | 'original' | 'critiques' | 'history' | 'notes' | 'shares'

export function EntryDetail({ entry, versions, critiques, followUpNotes }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(
    !!entry.storage_path || entry.mime_type === 'text/markdown' || entry.source === 'upload'
      ? 'original' : 'content'
  )

  const [title, setTitle] = useState(entry.title ?? '')
  const [body, setBody] = useState(entry.body ?? '')
  const [kind, setKind] = useState<Kind>(entry.kind as Kind)
  const [entities, setEntities] = useState<Entity[]>(entry.entities ?? [entry.entity])
  const [tagsInput, setTagsInput] = useState((entry.tags ?? []).join(', '))
  const [dirty, setDirty] = useState(false)
  const [saving, startSave] = useTransition()
  const [working, startWork] = useTransition()
  const [err, setErr] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [pendingForwards, setPendingForwards] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listForwardRequests(entry.id)
      .then(reqs => { if (!cancelled) setPendingForwards(reqs.filter(r => r.status === 'pending').length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [entry.id, reloadKey])

  const hasOriginal =
    !!entry.storage_path ||
    entry.mime_type === 'text/markdown' ||
    entry.source === 'upload'

  const markDirty = () => setDirty(true)

  const save = () => {
    setErr('')
    startSave(async () => {
      try {
        const tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        await updateEntry(entry.id, {
          title: title.trim() || null,
          body: body || null,
          kind,
          entities,
          tags,
        })
        setDirty(false)
        router.refresh()
      } catch (e: any) { setErr(e.message ?? 'Save failed') }
    })
  }

  const remove = () => {
    if (!confirm('Delete this entry? Linked critiques and notes remain.')) return
    startWork(async () => {
      await deleteEntry(entry.id)
      router.push('/dashboard/knowledge')
    })
  }

  const runCritique = () => {
    setErr('')
    startWork(async () => {
      try {
        await critiqueAndSave(entry.id)
        router.refresh()
        setTab('critiques')
      } catch (e: any) { setErr(e.message ?? 'Critique failed') }
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {entry.kind === 'workspace' && (
        <WorkspaceBreadcrumb entryId={entry.id} currentTitle={title} />
      )}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/dashboard/knowledge" className="text-gray-500 hover:text-indigo-600">← Knowledge</Link>
        <span className="text-gray-300">/</span>
        <span className="text-xs uppercase tracking-wider text-gray-500">v{entry.version}</span>
        <span className="text-xs text-gray-400">
          Updated {new Date(entry.updated_at).toLocaleString()}
        </span>
        <button
          onClick={() => {
            const starter = `ENTRY_CONTEXT: ${entry.id}\n\nI'm reviewing "${entry.title ?? '(untitled)'}". Read the entry body and help me think about it.`
            window.dispatchEvent(new CustomEvent('hq-agent:open', { detail: { starter } }))
          }}
          className="ml-auto rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
          ✦ Discuss with HQ Agent
        </button>
        <button onClick={() => setShareOpen(true)}
          className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
          Share
        </button>
        <button onClick={remove} disabled={working}
          className="text-xs text-red-600 hover:text-red-500 disabled:opacity-40">
          Delete
        </button>
      </div>

      {shareOpen && (
        <ShareDialog entryId={entry.id} onClose={() => setShareOpen(false)} />
      )}

      {pendingForwards > 0 && (
        <button
          onClick={() => setTab('shares')}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="text-base leading-none">⚠</span>
          <span><strong>{pendingForwards}</strong> forward request{pendingForwards === 1 ? '' : 's'} awaiting your approval.</span>
          <span className="ml-auto text-xs font-medium text-amber-700">Review →</span>
        </button>
      )}

      <MergedIntoBanner entryId={entry.id} />

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-1 border-b border-gray-200">
        {hasOriginal && (
          <TabButton active={tab === 'original'} onClick={() => setTab('original')} label="Original" />
        )}
        <TabButton active={tab === 'content'} onClick={() => setTab('content')} label="Content" />
        <TabButton active={tab === 'critiques'} onClick={() => setTab('critiques')} label={`Critiques (${critiques.length})`} />
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')} label={`Follow-ups (${followUpNotes.length})`} />
        <TabButton
          active={tab === 'shares'}
          onClick={() => setTab('shares')}
          label={pendingForwards > 0 ? `Shares · ⚠ ${pendingForwards}` : 'Shares'}
        />
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} label={`History (${versions.length})`} />
      </div>

      {err && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {tab === 'content' && (
        <div className="space-y-4">
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); markDirty() }}
            placeholder="Title"
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-lg font-semibold text-gray-900 outline-none focus:border-indigo-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Field label="Kind">
              <select value={kind} onChange={e => { setKind(e.target.value as Kind); markDirty() }}
                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Entities">
              <EntityMultiSelect
                options={ENTITY_SELECT_OPTIONS}
                selected={entities}
                onChange={v => { setEntities(v as Entity[]); markDirty() }}
              />
            </Field>
            <Field label="Tags (comma-sep)">
              <input
                value={tagsInput}
                onChange={e => { setTagsInput(e.target.value); markDirty() }}
                className="w-64 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
              />
            </Field>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={runCritique} disabled={working || entry.kind === 'critique'}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                {working ? '…' : '✦ New critique'}
              </button>
              <button onClick={save} disabled={!dirty || saving}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>
          </div>
          {entry.kind === 'chat' ? (
            <ChatThread chatId={entry.id} />
          ) : entry.kind === 'workspace' ? (
            <>
              <MarkdownSplitPane
                value={body}
                onChange={v => { setBody(v); markDirty() }}
                pageEntity={entry.entity}
              />
              <WorkspaceChildren parentId={entry.id} />
              <WorkspaceBacklinks entryId={entry.id} reloadKey={reloadKey} />
              <WorkspaceSiblings entryId={entry.id} />
            </>
          ) : (
            <textarea
              value={body}
              onChange={e => { setBody(e.target.value); markDirty() }}
              rows={20}
              placeholder="Body"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-indigo-400"
            />
          )}
          {entry.summary && (
            <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600 italic">
              <span className="font-bold uppercase tracking-widest text-gray-400">Summary: </span>{entry.summary}
            </div>
          )}
          <EntryAttachments entryId={entry.id} reloadKey={reloadKey} />
          <MergedFromBlock entryId={entry.id} />
        </div>
      )}

      {tab === 'original' && hasOriginal && (
        <OriginalTab entryId={entry.id} />
      )}

      {tab === 'critiques' && (
        <CritiquesTab
          entryId={entry.id}
          critiques={critiques}
          onNewCritique={runCritique}
          running={working}
        />
      )}

      {tab === 'notes' && (
        <NotesTab entryId={entry.id} notes={followUpNotes} />
      )}

      {tab === 'shares' && (
        <SharesTab entryId={entry.id} onOpenNewShare={() => setShareOpen(true)} />
      )}

      {tab === 'history' && (
        <HistoryTab versions={versions} currentVersion={entry.version} />
      )}
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}>
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className="uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function CritiquesTab({ entryId, critiques, onNewCritique, running }: {
  entryId: string; critiques: RelatedEntry[]; onNewCritique: () => void; running: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          All Claude critiques of this entry. Each run is saved so you can revisit and compare over time.
        </p>
        <button onClick={onNewCritique} disabled={running}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          {running ? 'Running…' : '✦ Run new critique'}
        </button>
      </div>
      {critiques.length === 0 && <p className="text-xs text-gray-400">No critiques yet.</p>}
      {critiques.map(c => (
        <article key={c.link_id} className="rounded-xl border border-gray-200 bg-white p-5">
          <header className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">
              {c.entry.title ?? 'Critique'}
            </p>
            <span className="text-[11px] text-gray-400">{new Date(c.created_at).toLocaleString()}</span>
          </header>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {c.entry.body}
          </div>
          <footer className="mt-3 flex gap-3">
            <Link href={`/dashboard/knowledge/${c.entry.id}`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
              Open critique →
            </Link>
            <FollowUpInline entryId={entryId} prefill={`Re: ${c.entry.title ?? 'critique'} — `} />
          </footer>
        </article>
      ))}
    </div>
  )
}

function FollowUpInline({ entryId, prefill }: { entryId: string; prefill?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(prefill ?? '')
  const [busy, startBusy] = useTransition()
  const router = useRouter()

  const submit = () => {
    if (!text.trim()) return
    startBusy(async () => {
      await addFollowUpNote(entryId, text)
      setText(''); setOpen(false)
      router.refresh()
    })
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="text-xs font-medium text-gray-600 hover:text-indigo-600">
      + Add follow-up note
    </button>
  )

  return (
    <div className="flex-1 flex gap-2">
      <input value={text} onChange={e => setText(e.target.value)} autoFocus
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
      <button onClick={submit} disabled={busy || !text.trim()}
        className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">
        {busy ? '…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-gray-500">Cancel</button>
    </div>
  )
}

function NotesTab({ entryId, notes }: { entryId: string; notes: RelatedEntry[] }) {
  const [text, setText] = useState('')
  const [busy, startBusy] = useTransition()
  const router = useRouter()

  const submit = () => {
    if (!text.trim()) return
    startBusy(async () => {
      await addFollowUpNote(entryId, text)
      setText('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder="Add a follow-up note — reactions to a critique, new ideas, decisions…"
          className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400" />
        <div className="mt-2 flex justify-end">
          <button onClick={submit} disabled={busy || !text.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>
      {notes.length === 0 && <p className="text-xs text-gray-400">No follow-up notes yet.</p>}
      {notes.map(n => (
        <article key={n.link_id} className="rounded-lg border border-gray-200 bg-white p-4">
          <header className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">{n.entry.title ?? 'Note'}</p>
            <span className="text-[11px] text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
          </header>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{n.entry.body}</p>
          <Link href={`/dashboard/knowledge/${n.entry.id}`}
            className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-500">
            Open note →
          </Link>
        </article>
      ))}
    </div>
  )
}

function HistoryTab({ versions, currentVersion }: { versions: EntryVersion[]; currentVersion: number }) {
  const router = useRouter()
  const [busy, startBusy] = useTransition()

  const restore = (id: string) => {
    if (!confirm('Restore this version? Current content will be snapshotted first.')) return
    startBusy(async () => {
      await restoreVersion(id)
      router.refresh()
    })
  }

  if (versions.length === 0) {
    return <p className="text-xs text-gray-400">No prior versions. Edits will start building history here.</p>
  }
  return (
    <div className="space-y-3">
      {versions.map(v => {
        const isLive = v.version === currentVersion
        return (
          <article key={v.id} className={`rounded-lg border bg-white p-4 ${isLive ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-gray-200'}`}>
            <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-700">
                v{v.version}
              </span>
              {isLive && (
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                  Current
                </span>
              )}
              <span className="text-xs font-medium text-gray-700">{v.title ?? '(untitled)'}</span>
              <span className="text-[11px] text-gray-400">{new Date(v.created_at).toLocaleString()}</span>
              {v.created_by_name && (
                <span className="text-[11px] text-gray-500">by {v.created_by_name}</span>
              )}
              {!isLive && (
                <button onClick={() => restore(v.id)} disabled={busy}
                  className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-40">
                  Restore
                </button>
              )}
            </header>
            <div className="flex gap-3 text-[11px] text-gray-500">
              {v.kind && <span>kind: {v.kind}</span>}
              {v.entity && <span>entity: {v.entity}</span>}
              {v.tags && v.tags.length > 0 && <span>tags: {v.tags.join(', ')}</span>}
            </div>
            {v.body && (
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-600">{v.body}</p>
            )}
          </article>
        )
      })}
    </div>
  )
}


function wrapHtml(inner: string): string {
  // If already a full document, leave it alone.
  if (/<html[\s>]/i.test(inner) || /<!doctype/i.test(inner)) return inner
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; padding: 1rem; margin: 0; background: #fff; }
  h1, h2, h3 { color: #111827; margin: 1rem 0 0.5rem; }
  h2 { font-size: 1.1rem; padding: 0.4rem 0.6rem; background: #eef2ff; border-radius: 4px; }
  table { border-collapse: collapse; margin: 0.5rem 0 1.5rem; font-size: 12px; }
  td, th { border: 1px solid #d1d5db; padding: 4px 8px; vertical-align: top; white-space: nowrap; }
  tr:nth-child(even) td { background: #f9fafb; }
  td:empty { background: #fafafa; }
  img { max-width: 100%; height: auto; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style></head><body>${inner}</body></html>`
}

function OriginalTab({ entryId }: { entryId: string }) {
  const [view, setView] = useState<OriginalView | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getOriginalView(entryId)
      .then(v => { if (!cancelled) setView(v) })
      .catch(e => { if (!cancelled) setErr(e?.message ?? 'Failed to load original') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [entryId])

  if (loading) return <p className="text-sm text-gray-500">Loading original…</p>
  if (err) return <p className="text-sm text-red-600">{err}</p>
  if (!view || view.kind === 'none') {
    return <p className="text-sm text-gray-500">No original view available for this entry.</p>
  }

  if (view.kind === 'html') {
    return (
      <iframe
        srcDoc={wrapHtml(view.html)}
        sandbox=""
        className="h-[80vh] w-full rounded-lg border border-gray-200 bg-white"
        title="Original document"
      />
    )
  }

  if (view.kind === 'pdf') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{view.filename}</span>
          <a href={view.signedUrl} target="_blank" rel="noopener noreferrer"
             className="font-medium text-indigo-600 hover:text-indigo-500">Open in new tab ↗</a>
        </div>
        <iframe
          src={view.signedUrl}
          className="h-[80vh] w-full rounded-lg border border-gray-200 bg-white"
          title="Original PDF"
        />
      </div>
    )
  }

  // text / markdown
  return (
    <pre className="max-h-[80vh] overflow-auto rounded-lg border border-gray-200 bg-white p-4 font-mono text-xs text-gray-900 whitespace-pre-wrap">
      {view.text}
    </pre>
  )
}

function ShareDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const [shares, setShares] = useState<Share[]>([])
  const [forwardReqs, setForwardReqs] = useState<ForwardRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(7)
  const [versionLock, setVersionLock] = useState(true)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([listShares(entryId), listForwardRequests(entryId)])
      .then(([s, r]) => { setShares(s); setForwardReqs(r) })
      .catch(e => setErr(e.message ?? 'Load failed'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [entryId])

  const decide = (id: string, decision: 'approved' | 'denied') => {
    startBusy(async () => {
      try { await decideForwardRequest(id, decision, 7); load() }
      catch (e: any) { setErr(e.message ?? 'Decision failed') }
    })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setCreatedToken(null)
    startBusy(async () => {
      try {
        const { token } = await createShare({
          entryId,
          recipientName: name,
          recipientEmail: email,
          expiresInDays: days,
          versionLock,
        })
        setCreatedToken(token)
        setName(''); setEmail('')
        load()
      } catch (e: any) { setErr(e.message ?? 'Create failed') }
    })
  }

  const revoke = (id: string) => {
    startBusy(async () => {
      try { await revokeShare(id, entryId); load() }
      catch (e: any) { setErr(e.message ?? 'Revoke failed') }
    })
  }

  const extend = (id: string) => {
    startBusy(async () => {
      try { await extendShare(id, entryId, 7); load() }
      catch (e: any) { setErr(e.message ?? 'Extend failed') }
    })
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Share document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        {createdToken && (
          <div className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
            <div className="mb-1 font-medium text-green-900">
              Share link created &middot; emailed to recipient &middot; expires in {days} day{days === 1 ? '' : 's'}
            </div>
            <code className="block break-all rounded bg-white px-2 py-1 text-xs text-gray-800">
              {origin}/share/{createdToken}
            </code>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Recipient name" required
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Recipient email" required
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1 text-gray-700">
              Expires in
              <input type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value) || 7)}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
              days
            </label>
            <label className="ml-auto flex items-center gap-1 text-gray-700">
              <input type="checkbox" checked={versionLock} onChange={e => setVersionLock(e.target.checked)} />
              Lock to current version
            </label>
          </div>
          <button type="submit" disabled={busy}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Working…' : 'Create share link'}
          </button>
        </form>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Active shares</h3>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-gray-500">No shares yet.</p>
          ) : (
            <ul className="space-y-2">
              {shares.map(s => {
                const expired = new Date(s.expires_at).getTime() < Date.now()
                const status = s.revoked_at ? 'revoked' : expired ? 'expired' : 'active'
                return (
                  <li key={s.id} className="rounded border border-gray-200 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{s.recipient_name} <span className="text-gray-500">· {s.recipient_email}</span></div>
                        <div className="text-xs text-gray-500">
                          <span className={
                            status === 'active' ? 'text-green-700' :
                            status === 'expired' ? 'text-amber-700' : 'text-red-700'
                          }>{status}</span>
                          {' · '}
                          {status === 'active' ? `expires ${new Date(s.expires_at).toLocaleDateString()}` : `expired ${new Date(s.expires_at).toLocaleDateString()}`}
                          {s.version_id ? ' · pinned' : ' · live'}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => extend(s.id)} disabled={busy}
                          title="Extend this share's expiration by 7 more days"
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                          Extend +7
                        </button>
                        {!s.revoked_at && (
                          <button onClick={() => revoke(s.id)} disabled={busy}
                            className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40">
                            Revoke
                          </button>
                        )}
                        <button
                          onClick={() => navigator.clipboard?.writeText(`${origin}/share/${s.token}`)}
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50">
                          Copy link
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Forwarding requests</h3>
          {forwardReqs.length === 0 ? (
            <p className="text-sm text-gray-500">No forward requests.</p>
          ) : (
            <ul className="space-y-2">
              {forwardReqs.map(r => (
                <li key={r.id} className="rounded border border-gray-200 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">
                        {r.new_recipient_name} <span className="text-gray-500">· {r.new_recipient_email}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        from <span className="text-gray-700">{r.requested_by_email}</span> · {new Date(r.created_at).toLocaleDateString()}
                        {' · '}
                        <span className={
                          r.status === 'approved' ? 'text-green-700' :
                          r.status === 'denied' ? 'text-red-700' : 'text-amber-700'
                        }>{r.status}</span>
                      </div>
                      {r.reason && (
                        <p className="mt-1 text-xs text-gray-600 italic">"{r.reason}"</p>
                      )}
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => decide(r.id, 'approved')} disabled={busy}
                          className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-800 hover:bg-green-100 disabled:opacity-40">
                          Approve
                        </button>
                        <button onClick={() => decide(r.id, 'denied')} disabled={busy}
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatThread({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listChatMessages(chatId)
      .then(m => { if (!cancelled) setMessages(m) })
      .catch(e => { if (!cancelled) setErr(e?.message ?? 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [chatId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setErr('')
    setMessages(prev => [...prev, { id: 'temp-' + Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }])
    startBusy(async () => {
      try { setMessages(await sendChatMessage(chatId, text)) }
      catch (e: any) { setErr(e?.message ?? 'Send failed') }
    })
  }

  if (loading) return <p className="text-sm text-gray-500">Loading conversation…</p>

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500 italic">No messages yet — say something to start the conversation.</p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 border border-gray-200 text-gray-800'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-xs text-indigo-500 animate-pulse">✦ thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {err && <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-gray-200 p-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask anything…"
          disabled={busy}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 disabled:opacity-50"
        />
        <button type="submit" disabled={busy || !input.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          ↑
        </button>
      </form>
    </div>
  )
}

function SharesTab({ entryId, onOpenNewShare }: { entryId: string; onOpenNewShare: () => void }) {
  const [shares, setShares] = useState<Share[]>([])
  const [forwardReqs, setForwardReqs] = useState<ForwardRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([listShares(entryId), listForwardRequests(entryId)])
      .then(([s, r]) => { setShares(s); setForwardReqs(r) })
      .catch(e => setErr(e?.message ?? 'Load failed'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [entryId])

  const revoke = (id: string) => startBusy(async () => {
    try { await revokeShare(id, entryId); load() } catch (e: any) { setErr(e.message ?? 'Revoke failed') }
  })
  const extend = (id: string) => startBusy(async () => {
    try { await extendShare(id, entryId, 7); load() } catch (e: any) { setErr(e.message ?? 'Extend failed') }
  })
  const decide = (id: string, decision: 'approved' | 'denied') => startBusy(async () => {
    try { await decideForwardRequest(id, decision, 7); load() } catch (e: any) { setErr(e.message ?? 'Decision failed') }
  })

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const activeCount = shares.filter(s => !s.revoked_at && new Date(s.expires_at).getTime() >= Date.now()).length
  const pendingForwards = forwardReqs.filter(r => r.status === 'pending').length

  if (loading) return <p className="text-sm text-gray-500">Loading shares…</p>

  return (
    <div className="space-y-6">
      {err && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {activeCount} active · {shares.length - activeCount} revoked or expired
          {pendingForwards > 0 && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">{pendingForwards} forward request{pendingForwards === 1 ? '' : 's'}</span>}
        </p>
        <button onClick={onOpenNewShare}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
          + New share
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Active shares</h3>
        {shares.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
            No shares yet. Use “+ New share” to send this entry.
          </p>
        ) : (
          <ul className="space-y-2">
            {shares.map(s => {
              const expired = new Date(s.expires_at).getTime() < Date.now()
              const status = s.revoked_at ? 'revoked' : expired ? 'expired' : 'active'
              return (
                <li key={s.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">
                        {s.recipient_name} <span className="text-gray-500">· {s.recipient_email}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        <span className={
                          status === 'active' ? 'text-green-700' :
                          status === 'expired' ? 'text-amber-700' : 'text-red-700'
                        }>{status}</span>
                        {' · '}
                        {status === 'active' ? `expires ${new Date(s.expires_at).toLocaleDateString()}` : `expired ${new Date(s.expires_at).toLocaleDateString()}`}
                        {s.version_id ? ' · pinned' : ' · live'}
                        {' · created '}{new Date(s.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => extend(s.id)} disabled={busy}
                        title="Extend this share's expiration by 7 more days"
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                        Extend +7
                      </button>
                      {!s.revoked_at && (
                        <button onClick={() => revoke(s.id)} disabled={busy}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40">
                          Revoke
                        </button>
                      )}
                      <button
                        onClick={() => navigator.clipboard?.writeText(`${origin}/share/${s.token}`)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                        Copy link
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Forwarding requests</h3>
        {forwardReqs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
            No forward requests for this entry.
          </p>
        ) : (
          <ul className="space-y-2">
            {forwardReqs.map(r => (
              <li key={r.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">
                      {r.new_recipient_name} <span className="text-gray-500">· {r.new_recipient_email}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      from <span className="text-gray-700">{r.requested_by_email}</span> · {new Date(r.created_at).toLocaleDateString()}
                      {' · '}
                      <span className={
                        r.status === 'approved' ? 'text-green-700' :
                        r.status === 'denied' ? 'text-red-700' : 'text-amber-700'
                      }>{r.status}</span>
                    </div>
                    {r.reason && (
                      <p className="mt-1 text-xs text-gray-600 italic">"{r.reason}"</p>
                    )}
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => decide(r.id, 'approved')} disabled={busy}
                        className="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800 hover:bg-green-100 disabled:opacity-40">
                        Approve
                      </button>
                      <button onClick={() => decide(r.id, 'denied')} disabled={busy}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                        Deny
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

type MentionMap = Record<string, { kind: LinkTargetKind; id: string }>

function MarkdownSplitPane({ value, onChange, pageEntity }: {
  value: string
  onChange: (v: string) => void
  pageEntity: Entity
}) {
  const [view, setView] = useState<'split' | 'edit' | 'preview'>('split')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // /task-create popup state. When the user picks /task-create the slash
  // command's insert removes the slash token and we open this popup; on
  // confirm we splice `[[Task: title|<id>]]` at `taskInsertPosRef`.
  const [taskCreateOpen, setTaskCreateOpen] = useState(false)
  const taskInsertPosRef = useRef<number>(-1)

  // [[…]] autocomplete state. The popup opens when the user types `[[` and
  // closes on Esc, blur, or once the token is closed with `]]`.
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<LinkTarget[]>([])
  const [mentionHover, setMentionHover] = useState(0)
  const mentionStartRef = useRef<number>(-1)   // index of the `[[` that opened it

  // /command autocomplete state. Parallel to the mention popup but uses the
  // pure detector in `lib/knowledge/slash-commands` and a static command list.
  // Mentions take priority — if a `[[…` is also open, the slash popup hides.
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashHover, setSlashHover] = useState(0)
  const slashStartRef = useRef<number>(-1)
  const slashResults = filterSlashCommands(slashQuery)

  // Resolved mentions for the Preview pane. Refreshes (debounced) when `value`
  // changes. We render unresolved tokens as broken-link pills.
  const [mentionMap, setMentionMap] = useState<MentionMap>({})

  useEffect(() => {
    const t = setTimeout(() => {
      resolveMentionsForRender(value).then(m => setMentionMap(m)).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [value])

  // Insert text at the textarea cursor (or wrap selected text).
  const insertAtCursor = (opts: {
    before?: string
    after?: string
    placeholder?: string
    block?: boolean   // ensure newline before/after for block-level insertion
  }) => {
    const ta = textareaRef.current
    if (!ta) return
    const before = opts.before ?? ''
    const after = opts.after ?? ''
    const placeholder = opts.placeholder ?? ''
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || placeholder
    let prefix = ''
    let suffix = ''
    if (opts.block) {
      const charBefore = value.slice(Math.max(0, start - 2), start)
      const charAfter = value.slice(end, end + 2)
      if (start > 0 && !charBefore.endsWith('\n\n')) prefix = charBefore.endsWith('\n') ? '\n' : '\n\n'
      if (end < value.length && !charAfter.startsWith('\n')) suffix = '\n'
    }
    const insertion = `${prefix}${before}${selected}${after}${suffix}`
    const next = value.slice(0, start) + insertion + value.slice(end)
    onChange(next)
    setTimeout(() => {
      ta.focus()
      const cursorPos = start + prefix.length + before.length + selected.length
      ta.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }

  // Toggle the Nth GFM task-list checkbox in `value`.
  const toggleTask = (index: number) => {
    let i = 0
    let done = false
    const re = /^(\s*[-*+]\s+\[)([ xX])(\])/gm
    const next = value.replace(re, (full, pre, mark, post) => {
      if (done) return full
      if (i++ === index) {
        done = true
        return pre + (mark === ' ' ? 'x' : ' ') + post
      }
      return full
    })
    if (next !== value) onChange(next)
  }

  // After every change/selection, re-check whether the cursor sits inside an
  // open `[[…` token. If so, fetch search results and show the popup.
  const checkMentionPopup = () => {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart
    const slice = value.slice(0, caret)
    const open = slice.lastIndexOf('[[')
    if (open === -1) { setMentionOpen(false); return }
    // Bail if `]]` appears between `[[` and caret (token already closed) or
    // if there's a newline (linkable label shouldn't span lines).
    const between = slice.slice(open + 2)
    if (between.includes(']]') || between.includes('\n')) { setMentionOpen(false); return }
    mentionStartRef.current = open
    // Detect explicit kind prefix. If present, strip it from the query AND
    // scope the search by kind so the user doesn't get cross-kind matches
    // after they've already committed to one (also how /embed-entry and
    // /embed-project's hand-off lands here filtered).
    const kindMatch = between.match(/^(Entry|Project)\s*:\s*/i)
    const kind: LinkTargetKind | undefined = kindMatch
      ? (kindMatch[1].toLowerCase() === 'project' ? 'project' : 'entry')
      : undefined
    const q = kindMatch ? between.slice(kindMatch[0].length) : between
    // Only refresh hover + results when the query actually changed. Without
    // this guard, every keyup (including ArrowUp/Down releases) would reset
    // hover to 0, yanking the highlight back to the top of the list.
    if (q !== mentionQuery) {
      setMentionHover(0)
      searchLinkTargets(q, kind).then(setMentionResults).catch(() => setMentionResults([]))
    }
    setMentionQuery(q)
    setMentionOpen(true)
  }

  const insertMention = (target: LinkTarget) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = mentionStartRef.current
    const caret = ta.selectionStart
    if (start < 0) { setMentionOpen(false); return }
    const kindLabel = target.kind === 'entry' ? 'Entry' : 'Project'
    const token = `[[${kindLabel}: ${target.label}]]`
    const next = value.slice(0, start) + token + value.slice(caret)
    onChange(next)
    setMentionOpen(false)
    setTimeout(() => {
      ta.focus()
      const pos = start + token.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  // Same pattern as `checkMentionPopup`, but for `/command` tokens. Skipped
  // when the mention popup is already showing, so the two never overlap.
  const checkSlashPopup = () => {
    const ta = textareaRef.current
    if (!ta) return
    if (mentionOpen) { setSlashOpen(false); return }
    const caret = ta.selectionStart
    const match = detectSlashToken(value, caret)
    if (!match.open) { setSlashOpen(false); return }
    slashStartRef.current = match.start
    // Same guard as in checkMentionPopup: only reset hover when the query
    // changes, otherwise ArrowDown's keyup re-runs us and snaps the highlight
    // back to row 0.
    if (match.query !== slashQuery) setSlashHover(0)
    setSlashQuery(match.query)
    setSlashOpen(true)
  }

  const runSlashCommand = (cmd: SlashCommand) => {
    const ta = textareaRef.current
    if (!ta) return
    const tokenStart = slashStartRef.current
    const caret = ta.selectionStart
    if (tokenStart < 0) { setSlashOpen(false); return }
    const { next, cursor, openMention, openTaskCreate } = cmd.insert({ value, tokenStart, caret })
    onChange(next)
    setSlashOpen(false)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(cursor, cursor)
      if (openMention) {
        // Hand off to the mention popup. The freshly inserted token is
        // `[[Kind: ` ending at `cursor`, so the `[[` sits openLen chars back.
        const openLen = openMention === 'entry' ? '[[Entry: '.length : '[[Project: '.length
        const start = cursor - openLen
        mentionStartRef.current = start
        setMentionQuery('')
        setMentionHover(0)
        setMentionOpen(true)
        searchLinkTargets('', openMention)
          .then(setMentionResults)
          .catch(() => setMentionResults([]))
      }
      if (openTaskCreate) {
        // The slash token has already been removed; remember the position so
        // the popup can splice the pill there on confirm.
        taskInsertPosRef.current = cursor
        setTaskCreateOpen(true)
      }
    }, 0)
  }

  // Called by TaskCreatePopup after createManagerTask succeeds. Splices the
  // [[Task: title|<id>]] pill at the position the slash token previously
  // occupied. The dirty flag fires via the parent's onChange wrapper.
  const onTaskCreated = (taskId: string, title: string) => {
    const pos = taskInsertPosRef.current
    if (pos < 0) { setTaskCreateOpen(false); return }
    // Escape `|` and `]` from title to keep the token parseable. `|` is the
    // label/id separator; doubled `]]` closes the token. Replace with safer
    // alternatives so the user still sees the title roughly as they typed.
    const safeTitle = title.replace(/\|/g, '/').replace(/\]/g, ')')
    const token = `[[Task: ${safeTitle}|${taskId}]]`
    const next = value.slice(0, pos) + token + value.slice(pos)
    onChange(next)
    setTaskCreateOpen(false)
    setTimeout(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const cursor = pos + token.length
      ta.setSelectionRange(cursor, cursor)
    }, 0)
  }

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionHover(h => Math.min(h + 1, mentionResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionHover(h => Math.max(h - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        const pick = mentionResults[mentionHover]
        if (pick) { e.preventDefault(); insertMention(pick) }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
      }
      return
    }
    if (slashOpen && slashResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashHover(h => Math.min(h + 1, slashResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashHover(h => Math.max(h - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        const pick = slashResults[slashHover]
        if (pick) { e.preventDefault(); runSlashCommand(pick) }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSlashOpen(false)
      }
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="sticky top-16 z-20 rounded-t-lg border-b border-gray-200 bg-white">
        <div className="flex items-center gap-1 px-2 py-1.5 text-xs">
          <button onClick={() => setView('edit')} className={`rounded px-2 py-1 ${view === 'edit' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>Edit</button>
          <button onClick={() => setView('split')} className={`rounded px-2 py-1 ${view === 'split' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>Split</button>
          <button onClick={() => setView('preview')} className={`rounded px-2 py-1 ${view === 'preview' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>Preview</button>
          <span className="ml-auto text-[11px] text-gray-400 hidden sm:inline">
            Tip: <code className="rounded bg-gray-100 px-1">[[</code> to link · <code className="rounded bg-gray-100 px-1">/</code> for commands
          </span>
        </div>
        {view !== 'preview' && (
          <FormatToolbar onInsert={insertAtCursor} />
        )}
      </div>
      <div className={`grid gap-0 ${view === 'split' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
        {view !== 'preview' && (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => {
                onChange(e.target.value)
                setTimeout(() => { checkMentionPopup(); checkSlashPopup() }, 0)
              }}
              onKeyDown={onTextareaKeyDown}
              onKeyUp={() => { checkMentionPopup(); checkSlashPopup() }}
              onClick={() => { checkMentionPopup(); checkSlashPopup() }}
              onBlur={() => setTimeout(() => { setMentionOpen(false); setSlashOpen(false) }, 150)}
              rows={28}
              placeholder={'Type here, or use the toolbar above to add headings, bullets, links, and more.'}
              className="w-full resize-none border-0 bg-white p-4 font-sans text-sm text-gray-900 outline-none md:border-r md:border-gray-200"
            />
            {mentionOpen && (
              <MentionPopup
                query={mentionQuery}
                results={mentionResults}
                hover={mentionHover}
                onPick={insertMention}
                onHover={setMentionHover}
              />
            )}
            {slashOpen && !mentionOpen && (
              <SlashPopup
                query={slashQuery}
                results={slashResults}
                hover={slashHover}
                onPick={runSlashCommand}
                onHover={setSlashHover}
              />
            )}
            {taskCreateOpen && (
              <TaskCreatePopup
                defaultEntity={pageEntity}
                onCancel={() => setTaskCreateOpen(false)}
                onCreated={onTaskCreated}
              />
            )}
          </div>
        )}
        {view !== 'edit' && (
          <div className="prose prose-sm max-w-none p-4 text-gray-900 prose-headings:font-semibold prose-headings:text-gray-900 prose-a:text-indigo-600 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100">
            {value.trim() ? (
              <MarkdownPreview value={value} onToggleTask={toggleTask} mentionMap={mentionMap} />
            ) : (
              <p className="italic text-gray-400">Preview will appear here.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MentionPopup({ query, results, hover, onPick, onHover }: {
  query: string
  results: LinkTarget[]
  hover: number
  onPick: (t: LinkTarget) => void
  onHover: (i: number) => void
}) {
  return (
    <div className="absolute left-4 right-4 top-[60%] z-30 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg md:right-auto md:w-96">
      <div className="border-b border-gray-100 px-3 py-1.5 text-[11px] uppercase tracking-wider text-gray-400">
        Link a page or project {query && <span className="ml-1 normal-case tracking-normal text-gray-600">— "{query}"</span>}
      </div>
      {results.length === 0 ? (
        <p className="px-3 py-3 text-sm text-gray-500">No matches. Keep typing — full title is fine too.</p>
      ) : (
        <ul>
          {results.map((r, i) => {
            // Tint the highlight to match the pill color the picked result
            // will render as in Preview — emerald for projects, indigo for
            // entries. Helps the user see at a glance what they're picking.
            const isProject = r.kind === 'project'
            const highlightCls = isProject
              ? 'bg-emerald-50 text-emerald-900'
              : 'bg-indigo-50 text-indigo-900'
            return (
              <li key={`${r.kind}:${r.id}`}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onPick(r) }}
                  onMouseEnter={() => onHover(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === hover ? highlightCls : 'text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">{isProject ? '📁' : '📄'}</span>
                  <span className="flex-1 truncate">{r.label}</span>
                  {r.hint && <span className="text-[10px] uppercase tracking-wider text-gray-400">{r.hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">↑↓ navigate · ⏎ insert · Esc close</div>
    </div>
  )
}

function SlashPopup({ query, results, hover, onPick, onHover }: {
  query: string
  results: SlashCommand[]
  hover: number
  onPick: (c: SlashCommand) => void
  onHover: (i: number) => void
}) {
  return (
    <div className="absolute left-4 right-4 top-[60%] z-30 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg md:right-auto md:w-80">
      <div className="border-b border-gray-100 px-3 py-1.5 text-[11px] uppercase tracking-wider text-gray-400">
        Slash commands {query && <span className="ml-1 normal-case tracking-normal text-gray-600">— "/{query}"</span>}
      </div>
      {results.length === 0 ? (
        <p className="px-3 py-3 text-sm text-gray-500">No matching commands. Esc to dismiss.</p>
      ) : (
        <ul>
          {results.map((c, i) => (
            <li key={c.name}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onPick(c) }}
                onMouseEnter={() => onHover(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  i === hover ? 'bg-indigo-50 text-indigo-900' : 'text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="w-4 text-center text-base text-gray-500">{c.icon ?? '·'}</span>
                <span className="flex-1">
                  <span className="font-mono text-[12px] text-gray-700">{c.name}</span>
                  <span className="ml-2 text-gray-500">{c.label}</span>
                </span>
                {c.hint && <span className="text-[10px] uppercase tracking-wider text-gray-400">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">↑↓ navigate · ⏎ insert · Esc close</div>
    </div>
  )
}

// TaskCreatePopup — collects title + optional project for /task-create, then
// calls createTaskFromWorkspace and hands the new id back to the caller so the
// editor can embed `[[Task: title|<id>]]` immediately. Entity defaults to the
// hosting workspace page's entity (UX-wise: tasks from the SF Solutions page
// belong to SF Solutions unless you change it).
const TASK_ENTITIES: Entity[] = [...ENTITY_SELECT_OPTIONS.map(o => o.value)]

function TaskCreatePopup({ defaultEntity, onCancel, onCreated }: {
  defaultEntity: Entity
  onCancel: () => void
  onCreated: (taskId: string, title: string) => void
}) {
  const [title, setTitle] = useState('')
  const [entity, setEntity] = useState<Entity>(defaultEntity)
  const [projectQuery, setProjectQuery] = useState('')
  const [projectResults, setProjectResults] = useState<LinkTarget[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectLabel, setProjectLabel] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search projects as the query changes (only while no project is picked).
  useEffect(() => {
    if (projectId) return
    const t = setTimeout(() => {
      searchLinkTargets(projectQuery, 'project')
        .then(setProjectResults)
        .catch(() => setProjectResults([]))
    }, 150)
    return () => clearTimeout(t)
  }, [projectQuery, projectId])

  const canCreate = title.trim().length > 0 && !submitting

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCreate) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createTaskFromWorkspace({
        title: title.trim(),
        entity_slug: entity,
        project_id: projectId,
      })
      onCreated(created.id, created.title)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create task')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="absolute left-4 right-4 top-[60%] z-30 rounded-lg border border-gray-200 bg-white shadow-lg md:right-auto md:w-96"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5 text-[11px] uppercase tracking-wider text-gray-400">
        <span>📋 New task</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-700"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
      <form onSubmit={submit} className="space-y-2 px-3 py-3">
        <input
          autoFocus
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
          placeholder="Task title"
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-violet-400"
        />
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wider text-gray-400">Entity</label>
          <select
            value={entity}
            onChange={e => setEntity(e.target.value as Entity)}
            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-900 outline-none focus:border-violet-400"
          >
            {TASK_ENTITIES.map(en => (
              <option key={en} value={en}>{en}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Project (optional)</label>
          {projectId ? (
            <button
              type="button"
              onClick={() => { setProjectId(null); setProjectLabel(null); setProjectQuery('') }}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
            >
              📁 {projectLabel} <span className="text-emerald-500">✕</span>
            </button>
          ) : (
            <>
              <input
                type="text"
                value={projectQuery}
                onChange={e => setProjectQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
                placeholder="Search projects (or leave blank)"
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-violet-400"
              />
              {projectResults.length > 0 && (
                <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-gray-100 bg-white">
                  {projectResults.filter(r => r.kind === 'project').map(r => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setProjectId(r.id); setProjectLabel(r.label); setProjectQuery('') }}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-gray-900 hover:bg-emerald-50"
                      >
                        📁 <span className="flex-1 truncate">{r.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canCreate}
            className="rounded-md bg-violet-600 px-3 py-1 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Prefix used to encode resolved `[[…]]` mentions into Markdown link hrefs.
// The Preview's `a` renderer detects this prefix and renders a pill instead.
const MENTION_PREFIX = '/__mention/'

// Icon for each kind, exported here so MentionPopup + pill rendering stay in sync.
const KIND_ICON: Record<'entry' | 'project' | 'task', string> = {
  entry: '📄', project: '📁', task: '📋',
}

function expandMentions(body: string, map: MentionMap): string {
  return body.replace(
    /\[\[(Entry|Project|Task):\s*([^\]\n|]+?)\s*(?:\|\s*([^\]\n\s]+?)\s*)?\]\]/g,
    (_full, rawKind, rawLabel, explicitId) => {
      const kind = ((rawKind as string).toLowerCase() as 'entry' | 'project' | 'task')
      const label = (rawLabel as string).trim()
      const icon = KIND_ICON[kind]
      // Escape `]` inside link text — would otherwise break Markdown parsing.
      const safeLabel = label.replace(/]/g, '\\]')

      // Tasks resolve by explicit id (label alone is ambiguous). The map key is
      // `task::<id>`; missing/invalid ids render as broken pills.
      if (kind === 'task') {
        const id = (explicitId ?? '').trim().toLowerCase()
        const valid = id && map[`task::${id}`]
        if (valid) {
          return `[${icon} ${safeLabel}](${MENTION_PREFIX}task/${id})`
        }
        return `[${icon} ${safeLabel}](${MENTION_PREFIX}task/broken/${encodeURIComponent(label)})`
      }

      // Entry/project — resolve by label.
      const hit = map[`${kind}::${label.toLowerCase()}`]
      if (hit) {
        return `[${icon} ${safeLabel}](${MENTION_PREFIX}${kind}/${hit.id})`
      }
      return `[${icon} ${safeLabel}](${MENTION_PREFIX}${kind}/broken/${encodeURIComponent(label)})`
    },
  )
}

function MarkdownPreview({ value, onToggleTask, mentionMap }: {
  value: string
  onToggleTask: (i: number) => void
  mentionMap: MentionMap
}) {
  const expanded = expandMentions(value, mentionMap)
  const counter = { i: 0 }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, href, children, ...props }: any) => {
          if (typeof href === 'string' && href.startsWith(MENTION_PREFIX)) {
            const rest = href.slice(MENTION_PREFIX.length)
            const [kind, ...tail] = rest.split('/')
            const isBroken = tail[0] === 'broken'
            const targetId = isBroken ? '' : tail[0]
            const isProject = kind === 'project'
            const isTask = kind === 'task'
            const dest = isBroken ? null
              : isTask ? `/dashboard/tasks/${targetId}`
              : isProject ? `/dashboard/projects/${targetId}`
              : `/dashboard/knowledge/${targetId}`
            // Pill palette: amber=broken, emerald=project, violet=task, indigo=entry.
            const pillClass = isBroken
              ? 'inline-flex items-center gap-1 rounded-md border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[0.85em] font-medium text-amber-800 no-underline'
              : isTask
                ? 'inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[0.85em] font-medium text-violet-800 no-underline hover:bg-violet-100'
                : isProject
                  ? 'inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[0.85em] font-medium text-emerald-800 no-underline hover:bg-emerald-100'
                  : 'inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[0.85em] font-medium text-indigo-800 no-underline hover:bg-indigo-100'
            if (dest) {
              return <Link href={dest} className={pillClass}>{children}</Link>
            }
            return <span className={pillClass} title="Unresolved link — no entry/project/task with that reference">{children}</span>
          }
          return <a href={href} {...props}>{children}</a>
        },
        input: ({ node, ...props }: any) => {
          if (props.type === 'checkbox') {
            const idx = counter.i++
            const checked = !!props.checked
            return (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTask(idx) }}
                aria-label={checked ? 'Mark task incomplete' : 'Mark task complete'}
                className={`mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border align-middle ${
                  checked
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-400 bg-white hover:border-indigo-500'
                }`}
                style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              >
                {checked && <span className="text-[10px] leading-none">✓</span>}
              </button>
            )
          }
          return <input {...props} />
        },
      }}
    >
      {expanded}
    </ReactMarkdown>
  )
}

function WorkspaceBreadcrumb({ entryId, currentTitle }: { entryId: string; currentTitle: string }) {
  const [crumbs, setCrumbs] = useState<Array<{ id: string; title: string | null }>>([])
  useEffect(() => {
    let cancelled = false
    getWorkspaceAncestors(entryId)
      .then(c => { if (!cancelled) setCrumbs(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [entryId])

  return (
    <div className="mb-3 flex items-center gap-1 text-xs text-gray-500">
      <Link href="/dashboard/knowledge" className="hover:text-indigo-600">Pages</Link>
      {crumbs.map(c => (
        <span key={c.id} className="flex items-center gap-1">
          <span className="text-gray-300">/</span>
          <Link href={`/dashboard/knowledge/${c.id}`} className="hover:text-indigo-600">
            {c.title || 'Untitled'}
          </Link>
        </span>
      ))}
      <span className="text-gray-300">/</span>
      <span className="font-medium text-gray-700">{currentTitle || 'Untitled page'}</span>
    </div>
  )
}

function FormatToolbar({ onInsert }: {
  onInsert: (opts: { before?: string; after?: string; placeholder?: string; block?: boolean }) => void
}) {
  type Btn = { label: string; title: string; onClick: () => void; bold?: boolean; italic?: boolean }
  const buttons: Btn[] = [
    { label: 'H1', title: 'Big heading', onClick: () => onInsert({ before: '# ', placeholder: 'Heading', block: true }) },
    { label: 'H2', title: 'Section heading', onClick: () => onInsert({ before: '## ', placeholder: 'Section', block: true }) },
    { label: 'H3', title: 'Subsection heading', onClick: () => onInsert({ before: '### ', placeholder: 'Subsection', block: true }) },
    { label: 'B', title: 'Bold', bold: true, onClick: () => onInsert({ before: '**', after: '**', placeholder: 'bold text' }) },
    { label: 'I', title: 'Italic', italic: true, onClick: () => onInsert({ before: '*', after: '*', placeholder: 'italic text' }) },
    { label: '“ ”', title: 'Quote', onClick: () => onInsert({ before: '> ', placeholder: 'Quote', block: true }) },
    { label: '• List', title: 'Bullet list', onClick: () => onInsert({ before: '- ', placeholder: 'item', block: true }) },
    { label: '1. List', title: 'Numbered list', onClick: () => onInsert({ before: '1. ', placeholder: 'item', block: true }) },
    { label: '☐ Task', title: 'Task / checklist item', onClick: () => onInsert({ before: '- [ ] ', placeholder: 'task', block: true }) },
    { label: '🔗 Link', title: 'Link', onClick: () => onInsert({ before: '[', after: '](https://)', placeholder: 'link text' }) },
    { label: '</>', title: 'Code', onClick: () => onInsert({ before: '`', after: '`', placeholder: 'code' }) },
    { label: '⊞ Table', title: 'Insert a 3-column starter table', onClick: () => onInsert({
      before: '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| ',
      after: ' |  |  |\n|  |  |  |',
      placeholder: 'cell',
      block: true,
    }) },
    { label: '— Divider', title: 'Horizontal rule', onClick: () => onInsert({ before: '\n---\n', block: true }) },
  ]
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
      {buttons.map(b => (
        <button
          key={b.label}
          type="button"
          onClick={b.onClick}
          title={b.title}
          className={`rounded px-2 py-1 text-xs text-gray-700 hover:bg-white hover:text-indigo-700 hover:shadow-sm transition-colors ${
            b.bold ? 'font-bold' : b.italic ? 'italic' : 'font-medium'
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

function WorkspaceChildren({ parentId }: { parentId: string }) {
  const router = useRouter()
  const [children, setChildren] = useState<WorkspaceNode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    listWorkspaceChildren(parentId)
      .then(c => setChildren(c))
      .catch(e => setErr(e?.message ?? 'Load failed'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [parentId])

  const addChild = () => {
    setErr('')
    startBusy(async () => {
      try {
        const { id } = await createWorkspacePage({ parentId, title: 'Untitled page' })
        router.push(`/dashboard/knowledge/${id}`)
      } catch (e: any) { setErr(e?.message ?? 'Create failed') }
    })
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Child pages {children.length > 0 && <span className="text-gray-400">({children.length})</span>}
        </h3>
        <button onClick={addChild} disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          {busy ? '…' : '+ Add child page'}
        </button>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : children.length === 0 ? (
        <p className="text-sm text-gray-500">
          No child pages yet. Click <strong>+ Add child page</strong> to nest a page under this one.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {children.map(c => (
            <li key={c.id} className="py-2">
              <Link href={`/dashboard/knowledge/${c.id}`}
                className="flex items-center gap-2 text-sm text-gray-900 hover:text-indigo-700">
                <span className="text-gray-400">📄</span>
                <span className="flex-1 truncate">{c.title || 'Untitled page'}</span>
                {c.has_children && <span className="text-[10px] text-gray-400">has subpages</span>}
                <span className="text-[10px] uppercase tracking-wider text-gray-400">{c.entity}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function WorkspaceSiblings({ entryId }: { entryId: string }) {
  const [data, setData] = useState<{
    parent: { id: string; title: string | null } | null
    siblings: WorkspaceNode[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    getWorkspaceSiblings(entryId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [entryId])

  if (!data) return null
  if (!data.parent && data.siblings.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
      {data.parent && (
        <Link
          href={`/dashboard/knowledge/${data.parent.id}`}
          className="flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-100"
        >
          ← {data.parent.title || 'Untitled parent'}
        </Link>
      )}
      {data.siblings.length > 0 && (
        <>
          <span className="text-gray-400">{data.parent ? 'Siblings:' : 'Other top-level pages:'}</span>
          <div className="flex flex-wrap items-center gap-1">
            {data.siblings.slice(0, 12).map(s => (
              <Link
                key={s.id}
                href={`/dashboard/knowledge/${s.id}`}
                className="rounded border border-gray-200 px-2 py-0.5 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {s.title || 'Untitled'}
              </Link>
            ))}
            {data.siblings.length > 12 && (
              <span className="text-gray-400">+{data.siblings.length - 12} more</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * "Linked to" — the projects this doc is deliberately attached to. Interactive
 * on the doc side: search + attach to MULTIPLE projects, and detach. The
 * project's own Linked tab is the mirror of this. Always renders (even with
 * zero links) so the attach control is reachable from the doc.
 */
function EntryAttachments({ entryId, reloadKey }: { entryId: string; reloadKey: number }) {
  const [links, setLinks] = useState<EntryAttachment[] | null>(null)
  const [bump, setBump] = useState(0)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LinkTarget[]>([])
  const [searching, startSearch] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getEntryAttachments(entryId)
      .then(a => { if (!cancelled) setLinks(a) })
      .catch(() => { if (!cancelled) setLinks([]) })
    return () => { cancelled = true }
  }, [entryId, reloadKey, bump])

  // Search projects as you type (only the 'project' kind).
  useEffect(() => {
    if (!adding) return
    let cancelled = false
    startSearch(async () => {
      const r = await searchLinkTargets(query, 'project').catch(() => [])
      if (!cancelled) setResults(r)
    })
    return () => { cancelled = true }
  }, [query, adding])

  const attachedIds = new Set((links ?? []).map(l => l.projectId))
  const candidates = results.filter(r => !attachedIds.has(r.id))

  const attach = async (projectId: string) => {
    setBusyId(projectId)
    try {
      await attachEntryToProject(entryId, projectId)
      setQuery('')
      setBump(b => b + 1)
    } finally {
      setBusyId(null)
    }
  }

  const detach = async (linkId: string) => {
    setBusyId(linkId)
    try {
      await detachEntry(linkId)
      setBump(b => b + 1)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Linked to <span className="text-gray-400">({links?.length ?? 0})</span>
        </h3>
        <button
          onClick={() => { setAdding(a => !a); setQuery('') }}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          {adding ? 'Done' : '+ Attach project'}
        </button>
      </div>

      {adding && (
        <div className="mb-3">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects to attach…"
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
          />
          <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-100">
            {searching && candidates.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>
            )}
            {!searching && candidates.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400">No matching projects.</li>
            )}
            {candidates.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => attach(c.id)}
                  disabled={busyId === c.id}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span className="text-gray-400">📁</span>
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-indigo-500">attach</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(links?.length ?? 0) === 0 ? (
        !adding && <p className="text-xs text-gray-400">Not attached to any project yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {links!.map(l => (
            <li key={l.linkId} className="group flex items-center gap-2 py-2">
              <Link href={`/dashboard/projects/${l.projectId}`}
                className="flex flex-1 items-center gap-2 text-sm text-gray-900 hover:text-indigo-700">
                <span className="text-gray-400">📁</span>
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">project</span>
              </Link>
              <button
                onClick={() => detach(l.linkId)}
                disabled={busyId === l.linkId}
                title="Detach"
                className="text-gray-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Prominent banner on an archived merge source: "This entry was merged into X."
 * Renders nothing for entries that weren't a merge source.
 */
function MergedIntoBanner({ entryId }: { entryId: string }) {
  const [target, setTarget] = useState<MergedRef | null>(null)
  useEffect(() => {
    let cancelled = false
    getMergedInto(entryId)
      .then(t => { if (!cancelled) setTarget(t) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [entryId])

  if (!target) return null
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      <span className="text-base leading-none">⤳</span>
      <span>This entry was merged into{' '}
        <Link href={`/dashboard/knowledge/${target.id}`} className="font-semibold underline hover:text-violet-700">
          {target.title || 'a merged entry'}
        </Link>
        {' '}and archived.
      </span>
    </div>
  )
}

/** "Merged from (N)" — the archived sources this entry was built from. */
function MergedFromBlock({ entryId }: { entryId: string }) {
  const [sources, setSources] = useState<MergedRef[] | null>(null)
  useEffect(() => {
    let cancelled = false
    getMergedFrom(entryId)
      .then(s => { if (!cancelled) setSources(s) })
      .catch(() => { if (!cancelled) setSources([]) })
    return () => { cancelled = true }
  }, [entryId])

  if (!sources || sources.length === 0) return null
  return (
    <div className="rounded-lg border border-violet-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-violet-500">
        Merged from <span className="text-violet-300">({sources.length})</span>
      </h3>
      <ul className="divide-y divide-gray-100">
        {sources.map(s => (
          <li key={s.linkId} className="py-2">
            <Link href={`/dashboard/knowledge/${s.id}`}
              className="flex items-center gap-2 text-sm text-gray-900 hover:text-violet-700">
              <span className="text-gray-400">⤳</span>
              <span className="flex-1 truncate">{s.title || 'Untitled'}</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">{s.kind} · archived</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkspaceBacklinks({ entryId, reloadKey }: { entryId: string; reloadKey: number }) {
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null)
  useEffect(() => {
    let cancelled = false
    getEntryBacklinks(entryId)
      .then(b => { if (!cancelled) setBacklinks(b) })
      .catch(() => { if (!cancelled) setBacklinks([]) })
    return () => { cancelled = true }
  }, [entryId, reloadKey])

  if (!backlinks || backlinks.length === 0) return null

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Mentioned by <span className="text-gray-400">({backlinks.length})</span>
      </h3>
      <ul className="divide-y divide-gray-100">
        {backlinks.map(b => (
          <li key={b.id} className="py-2">
            <Link href={`/dashboard/knowledge/${b.id}`}
              className="flex items-center gap-2 text-sm text-gray-900 hover:text-indigo-700">
              <span className="text-gray-400">{b.kind === 'workspace' ? '📄' : '🔗'}</span>
              <span className="flex-1 truncate">{b.title || 'Untitled'}</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">{b.kind} · {b.entity}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
