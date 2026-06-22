'use client'
/**
 * Databases tab — Phase B2.
 *
 * Master/detail inside the Knowledge hub: a list of the org's databases →
 * click one → its records rendered as a typed table. B2 adds an "Import from
 * Notion" panel (paste a Notion DB URL + a read-only integration token →
 * recreate the schema + rows in HQ). In-app row/column editing + inline-page
 * embeds are still B3. Cell rendering is driven by the pure `cellModel` helper
 * so this component stays presentational.
 */
import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDatabaseDetail } from '@/app/api/knowledge/databases'
import { importNotionDatabase, type ImportNotionReport } from '@/app/api/knowledge/database-import'
import { EntityChips } from '@/components/shared/EntityChips'
import { ENTITY_SELECT_OPTIONS } from '@/lib/entities/config'
import { cellModel, orderedProperties } from '@/lib/databases/format'
import type { HqDatabase, DatabaseDetail, DbProperty, DbRecord } from '@/lib/databases/types'

function Cell({ property, record }: { property: DbProperty; record: DbRecord }) {
  const model = cellModel(property, record.values[property.id])
  const titleCls = property.is_title ? 'font-medium text-gray-900' : 'text-gray-700'

  switch (model.kind) {
    case 'empty':
      return <span className="text-gray-300">—</span>
    case 'checkbox':
      return (
        <span className={model.checked ? 'text-green-600' : 'text-gray-300'}>
          {model.checked ? '✓' : '□'}
        </span>
      )
    case 'url':
      return (
        <a
          href={model.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 underline decoration-indigo-200 hover:decoration-indigo-500"
        >
          {model.text}
        </a>
      )
    case 'chips':
      return (
        <span className="inline-flex flex-wrap gap-1">
          {model.chips.map((c, i) => (
            <span key={i} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c.className}`}>
              {c.label}
            </span>
          ))}
        </span>
      )
    case 'text':
    default:
      return <span className={titleCls}>{model.text}</span>
  }
}

function RecordsTable({ detail }: { detail: DatabaseDetail }) {
  const cols = orderedProperties(detail.properties)

  if (cols.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
        This database has no columns yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            {cols.map((p) => (
              <th key={p.id} className="px-4 py-2 text-left font-semibold whitespace-nowrap">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {detail.records.map((rec) => (
            <tr key={rec.id} className="align-top hover:bg-gray-50">
              {cols.map((p) => (
                <td key={p.id} className="px-4 py-2.5">
                  <Cell property={p} record={rec} />
                </td>
              ))}
            </tr>
          ))}
          {detail.records.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-4 py-6 text-center text-sm text-gray-500">
                No records yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ImportPanel({ onImported }: { onImported: (r: ImportNotionReport) => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [entity, setEntity] = useState('tm') // OQ-6 default
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const report = await importNotionDatabase({ url, token, entity })
        setUrl('')
        setToken('')
        setOpen(false)
        onImported(report)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed.')
      }
    })
  }

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ▤ Import from Notion
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Import a Notion database</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-700">
          Cancel
        </button>
      </div>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Notion database URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.notion.so/…?v=…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            Notion integration token
            <span className="font-normal text-gray-400"> — used once for this import, not stored</span>
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="secret_… or ntn_…"
            autoComplete="off"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          >
            {ENTITY_SELECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || !url.trim() || !token.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? 'Importing…' : 'Import'}
          </button>
          <span className="text-xs text-gray-400">
            Share the database with your integration in Notion first (••• → Connections).
          </span>
        </div>
      </div>
    </div>
  )
}

function ReportBanner({ report, onDismiss }: { report: ImportNotionReport; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
      <div className="flex items-start justify-between gap-3">
        <p>
          Imported <strong>{report.title}</strong> — {report.recordCount}{' '}
          {report.recordCount === 1 ? 'row' : 'rows'} · {report.propertyCount}{' '}
          {report.propertyCount === 1 ? 'column' : 'columns'}.
          {report.unmappedColumns.length > 0 && (
            <>
              {' '}
              <span className="text-green-700">
                {report.unmappedColumns.length} column
                {report.unmappedColumns.length === 1 ? '' : 's'} imported as a text snapshot (
                {report.unmappedColumns.map((c) => `${c.name} · ${c.notionType}`).join(', ')}).
              </span>
            </>
          )}
        </p>
        <button onClick={onDismiss} className="shrink-0 text-green-600 hover:text-green-900">
          ✕
        </button>
      </div>
    </div>
  )
}

export function DatabasesView({ databases, openDatabaseId }: { databases: HqDatabase[]; openDatabaseId?: string | null }) {
  const router = useRouter()
  const [detail, setDetail] = useState<DatabaseDetail | null>(null)
  const [report, setReport] = useState<ImportNotionReport | null>(null)
  const [pending, startTransition] = useTransition()

  function open(id: string) {
    startTransition(async () => {
      const d = await getDatabaseDetail(id)
      setDetail(d)
    })
  }

  // Open a specific database when asked from the unified browser ("All" → a
  // database node). Re-runs only when the requested id changes.
  useEffect(() => {
    if (openDatabaseId) open(openDatabaseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDatabaseId])

  function handleImported(r: ImportNotionReport) {
    setReport(r)
    router.refresh() // re-fetch the server-rendered list with the new database
    startTransition(async () => {
      const d = await getDatabaseDetail(r.databaseId)
      setDetail(d)
    })
  }

  // Detail view
  if (detail) {
    const db = detail.database
    return (
      <div>
        <button
          onClick={() => setDetail(null)}
          className="mb-4 text-sm text-gray-500 hover:text-gray-800"
        >
          ← All databases
        </button>
        {report && <ReportBanner report={report} onDismiss={() => setReport(null)} />}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            {db.icon && <span className="text-xl">{db.icon}</span>}
            <h2 className="text-lg font-semibold text-gray-900">{db.title}</h2>
            <EntityChips entities={db.entities} />
          </div>
          {db.description && <p className="mt-1 text-sm text-gray-500">{db.description}</p>}
          <p className="mt-1 text-xs text-gray-400">
            {detail.records.length} {detail.records.length === 1 ? 'record' : 'records'} ·{' '}
            {detail.properties.length} {detail.properties.length === 1 ? 'column' : 'columns'}
          </p>
        </div>
        <RecordsTable detail={detail} />
      </div>
    )
  }

  // List view
  if (databases.length === 0) {
    return (
      <div>
        {report && <ReportBanner report={report} onDismiss={() => setReport(null)} />}
        <ImportPanel onImported={handleImported} />
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">No databases yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Databases are typed, tabular collections (Notion-style). Import one from Notion to get started.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={pending ? 'opacity-60' : ''}>
      {report && <ReportBanner report={report} onDismiss={() => setReport(null)} />}
      <ImportPanel onImported={handleImported} />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Database</th>
            <th className="px-4 py-2 text-left font-semibold">Entities</th>
            <th className="px-4 py-2 text-right font-semibold">Records</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {databases.map((db) => (
            <tr
              key={db.id}
              onClick={() => open(db.id)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                  {db.icon && <span>{db.icon}</span>}
                  {db.title}
                </span>
                {db.description && (
                  <span className="mt-0.5 block text-xs text-gray-400 line-clamp-1">{db.description}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <EntityChips entities={db.entities} variant="plain" />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{db.record_count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
