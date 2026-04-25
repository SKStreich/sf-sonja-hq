'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { KnowledgeEntry } from '@/app/api/knowledge/actions'
import {
  findDuplicatePairs, dismissDuplicatePair, mergeDuplicateEntries, getPairBodies,
  type DuplicatePair, type PairBodies,
} from '@/app/api/knowledge/insights'
import { useEffect, useMemo, useState, useTransition } from 'react'

interface Props {
  entries: KnowledgeEntry[]
}

export function InsightsView({ entries }: Props) {
  const router = useRouter()
  const stats = useMemo(() => {
    const byType: Record<string, number> = {}
    const byEntity: Record<string, number> = {}
    const tagCounts: Record<string, number> = {}
    let rawIdeas = 0
    entries.forEach(e => {
      if (e.type_hint) byType[e.type_hint] = (byType[e.type_hint] ?? 0) + 1
      byEntity[e.entity] = (byEntity[e.entity] ?? 0) + 1
      if (e.kind === 'idea' && e.idea_status === 'raw') rawIdeas++
      e.tags.forEach(t => { tagCounts[t] = (tagCounts[t] ?? 0) + 1 })
    })
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)
    return { byType, byEntity, rawIdeas, topTags }
  }, [entries])

  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null)
  const [pairsLoading, setPairsLoading] = useState(true)

  const reload = () => {
    setPairsLoading(true)
    findDuplicatePairs(0.35, 30)
      .then(p => setPairs(p))
      .catch(() => setPairs([]))
      .finally(() => setPairsLoading(false))
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  return (
    <div className="space-y-5">
      <Panel title="Possible duplicates">
        <p className="mb-3 text-xs text-gray-500">
          Pairs above 35% similarity. <strong>Merge</strong> keeps the first entry, archives the second, and unions tags. <strong>Not a duplicate</strong> dismisses the pair so it won't reappear.
        </p>
        {pairsLoading ? (
          <p className="text-xs text-gray-400">Scanning for similar entries…</p>
        ) : !pairs || pairs.length === 0 ? (
          <p className="text-xs text-gray-400">No near-duplicates found above 35% similarity.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pairs.map(p => (
              <DuplicateRow
                key={`${p.a_id}-${p.b_id}`}
                pair={p}
                onResolved={reload}
                onMerged={() => { reload(); router.refresh() }}
              />
            ))}
          </ul>
        )}
      </Panel>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="By type hint">
          {Object.keys(stats.byType).length === 0
            ? <Empty />
            : <BarList items={Object.entries(stats.byType)} />}
        </Panel>
        <Panel title="By entity">
          <BarList items={Object.entries(stats.byEntity)} />
        </Panel>
      </div>

      <Panel title="Top tags">
        {stats.topTags.length === 0 ? <Empty /> : (
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map(([tag, count]) => (
              <span key={tag} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700">
                #{tag} <span className="ml-1 text-gray-400">{count}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      {stats.rawIdeas > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {stats.rawIdeas} raw idea{stats.rawIdeas === 1 ? '' : 's'} awaiting review
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Switch to the Cards view and triage — promote to &quot;developing&quot; or park.
          </p>
        </div>
      )}
    </div>
  )
}

function DuplicateRow({
  pair, onResolved, onMerged,
}: {
  pair: DuplicatePair
  onResolved: () => void
  onMerged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [bodies, setBodies] = useState<PairBodies | null>(null)
  const [loadingBodies, setLoadingBodies] = useState(false)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  const expand = () => {
    setOpen(o => !o)
    if (!bodies && !loadingBodies) {
      setLoadingBodies(true)
      getPairBodies(pair.a_id, pair.b_id)
        .then(b => setBodies(b))
        .catch(() => {})
        .finally(() => setLoadingBodies(false))
    }
  }

  const dismiss = () => {
    setErr('')
    startBusy(async () => {
      try { await dismissDuplicatePair(pair.a_id, pair.b_id); onResolved() }
      catch (e: any) { setErr(e?.message ?? 'Dismiss failed') }
    })
  }

  const merge = (keepId: string, removeId: string) => {
    if (!confirm(`Merge "${keepId === pair.a_id ? pair.a_title : pair.b_title}" + "${removeId === pair.a_id ? pair.a_title : pair.b_title}"?\n\nThe second entry will be archived. Tags will be combined. This can be undone by un-archiving the entry.`)) return
    setErr('')
    startBusy(async () => {
      try { await mergeDuplicateEntries(keepId, removeId); onMerged() }
      catch (e: any) { setErr(e?.message ?? 'Merge failed') }
    })
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
          {Math.round(pair.similarity * 100)}%
        </span>
        <div className="flex-1 min-w-0 text-sm">
          <Link href={`/dashboard/knowledge/${pair.a_id}`} className="block truncate text-gray-900 hover:text-indigo-700">
            <span className="text-[10px] uppercase text-gray-400">{pair.a_kind}/{pair.a_entity}</span>{' '}
            {pair.a_title ?? '(untitled)'}
          </Link>
          <Link href={`/dashboard/knowledge/${pair.b_id}`} className="block truncate text-gray-600 hover:text-indigo-700">
            <span className="text-[10px] uppercase text-gray-400">{pair.b_kind}/{pair.b_entity}</span>{' '}
            {pair.b_title ?? '(untitled)'}
          </Link>
        </div>
        <button onClick={expand} disabled={busy}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-40">
          {open ? 'Hide' : 'Compare'}
        </button>
        <button onClick={dismiss} disabled={busy}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Not a duplicate
        </button>
      </div>

      {err && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{err}</div>}

      {open && (
        <div className="mt-3 space-y-3">
          {loadingBodies && <p className="text-xs text-gray-400">Loading bodies…</p>}
          {bodies && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <BodyCard
                label="A"
                title={bodies.a.title ?? '(untitled)'}
                body={bodies.a.body ?? ''}
                updatedAt={bodies.a.updated_at}
                onMergeKeep={() => merge(pair.a_id, pair.b_id)}
                busy={busy}
              />
              <BodyCard
                label="B"
                title={bodies.b.title ?? '(untitled)'}
                body={bodies.b.body ?? ''}
                updatedAt={bodies.b.updated_at}
                onMergeKeep={() => merge(pair.b_id, pair.a_id)}
                busy={busy}
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function BodyCard({
  label, title, body, updatedAt, onMergeKeep, busy,
}: {
  label: string
  title: string
  body: string
  updatedAt: string
  onMergeKeep: () => void
  busy: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
        <span className="flex-1 truncate text-sm font-medium text-gray-900">{title}</span>
        <button onClick={onMergeKeep} disabled={busy}
          className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          Keep this, archive other
        </button>
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-400">Updated {new Date(updatedAt).toLocaleDateString()}</div>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 text-xs text-gray-700">
        {body || '(empty body)'}
      </pre>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">{title}</h3>
      {children}
    </div>
  )
}

function BarList({ items }: { items: [string, number][] }) {
  const max = Math.max(...items.map(([, v]) => v), 1)
  return (
    <div className="space-y-2">
      {items.sort((a, b) => b[1] - a[1]).map(([label, value]) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-20 text-xs uppercase tracking-wide text-gray-600">{label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-gray-700">{value}</span>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return <p className="text-xs text-gray-400">No data yet.</p>
}
