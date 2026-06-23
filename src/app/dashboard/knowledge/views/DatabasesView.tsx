'use client'
/**
 * Databases tab — Phase U3a (in-app editing).
 *
 * Master/detail inside the Knowledge hub: a list of the org's databases →
 * click one → its records rendered as a typed, EDITABLE table. U3a adds inline
 * cell editing, add/delete rows, and add/rename/retype/delete columns on top of
 * the B1 read view + B2 Notion import + U2 CSV download. Every mutation routes
 * through the server actions in api/knowledge/database-edit and returns fresh
 * DatabaseDetail, so the table always re-renders from one authoritative shape.
 * Cell display is driven by the pure `cellModel` helper; cell *editing* by the
 * pure `parseCellInput` / `cellInputValue` helpers.
 */
import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getDatabaseDetail } from '@/app/api/knowledge/databases'
import {
  addRecord,
  updateCell,
  deleteRecord,
  addProperty,
  updateProperty,
  deleteProperty,
} from '@/app/api/knowledge/database-edit'
import {
  importNotionDatabase,
  backfillNotionPageIds,
  type ImportNotionReport,
  type BackfillPageIdsReport,
} from '@/app/api/knowledge/database-import'
import { EntityChips } from '@/components/shared/EntityChips'
import { ENTITY_SELECT_OPTIONS } from '@/lib/entities/config'
import { cellModel, orderedProperties, type RelationResolver } from '@/lib/databases/format'
import {
  PROPERTY_TYPES,
  typeUsesOptions,
  cellInputValue,
  parseOptionsInput,
} from '@/lib/databases/edit'
import { databaseToCsv } from '@/lib/databases/csv'
import { downloadText, safeDownloadName } from '@/lib/knowledge/download'
import type {
  HqDatabase,
  DatabaseDetail,
  DbProperty,
  DbPropertyType,
  DbRecord,
  DbSelectOption,
} from '@/lib/databases/types'

/** A relation resolver for one property, from the detail's prebuilt index. */
function relationResolverFor(detail: DatabaseDetail, propertyId: string): RelationResolver | undefined {
  const map = detail.relationIndex?.[propertyId]
  if (!map) return undefined
  return (id) => map[id] ?? null
}

// ── Read-only cell display ─────────────────────────────────────────────────────
function CellDisplay({
  property,
  record,
  resolve,
}: {
  property: DbProperty
  record: DbRecord
  resolve?: RelationResolver
}) {
  const model = cellModel(property, record.values[property.id], resolve)
  const titleCls = property.is_title ? 'font-medium text-gray-900' : 'text-gray-700'

  switch (model.kind) {
    case 'empty':
      return <span className="text-gray-300">—</span>
    case 'relation':
      return (
        <span className="inline-flex flex-wrap gap-1">
          {model.items.map((it, i) => (
            <span
              key={i}
              title={it.resolved ? undefined : 'Unresolved — related record not found'}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                it.resolved ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400 italic'
              }`}
            >
              {it.label}
            </span>
          ))}
        </span>
      )
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
          onClick={(e) => e.stopPropagation()}
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

// ── Editable cell ──────────────────────────────────────────────────────────────
// Click to edit; the editor shape follows the column type. Checkbox + select /
// status commit immediately; text-like editors commit on blur / Enter, cancel
// on Escape. `raw` is whatever the editor holds; the server normalizes it.
function EditableCell({
  property,
  record,
  disabled,
  onCommit,
  resolve,
}: {
  property: DbProperty
  record: DbRecord
  disabled: boolean
  onCommit: (raw: unknown) => void
  resolve?: RelationResolver
}) {
  const [editing, setEditing] = useState(false)
  const value = record.values[property.id]

  // Checkbox: no edit mode — the display IS the control.
  if (property.type === 'checkbox') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCommit(value !== true)}
        className={`text-base ${value === true ? 'text-green-600' : 'text-gray-300'} hover:text-green-700 disabled:opacity-50`}
        aria-label={value === true ? 'Checked' : 'Unchecked'}
      >
        {value === true ? '✓' : '□'}
      </button>
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className="block w-full text-left disabled:cursor-default"
      >
        <CellDisplay property={property} record={record} resolve={resolve} />
      </button>
    )
  }

  const commit = (raw: unknown) => {
    setEditing(false)
    onCommit(raw)
  }

  // Select / status: dropdown from config.options, commit on change.
  if (property.type === 'select' || property.type === 'status') {
    const options = property.config.options ?? []
    return (
      <select
        autoFocus
        defaultValue={value == null ? '' : String(value)}
        onBlur={() => setEditing(false)}
        onChange={(e) => commit(e.target.value)}
        className="w-full rounded border border-indigo-300 bg-white px-1.5 py-1 text-sm focus:outline-none"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.name} value={o.name}>
            {o.name}
          </option>
        ))}
        {/* keep a current value that isn't in the option list selectable */}
        {value != null && !options.some((o) => o.name === String(value)) && (
          <option value={String(value)}>{String(value)}</option>
        )}
      </select>
    )
  }

  // Text-like: text / number / date / url / multi_select / relation.
  const inputType =
    property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : 'text'
  const placeholder =
    property.type === 'multi_select' || property.type === 'relation' ? 'comma, separated' : undefined

  return (
    <input
      autoFocus
      type={inputType}
      defaultValue={cellInputValue(value)}
      placeholder={placeholder}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setEditing(false)
        }
      }}
      className="w-full rounded border border-indigo-300 bg-white px-1.5 py-1 text-sm focus:outline-none"
    />
  )
}

// ── Column editor (add or edit a property) ─────────────────────────────────────
function ColumnEditor({
  initial,
  canDelete,
  disabled,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: { name: string; type: DbPropertyType; options?: DbSelectOption[] }
  canDelete: boolean
  disabled: boolean
  onSave: (input: { name: string; type: DbPropertyType; options?: DbSelectOption[] }) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<DbPropertyType>(initial?.type ?? 'text')
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).map((o) => o.name).join(', '))

  function save() {
    if (!name.trim()) return
    onSave({ name: name.trim(), type, options: typeUsesOptions(type) ? parseOptionsInput(optionsText) : undefined })
  }

  return (
    <div className="w-64 space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-gray-500">Column name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-gray-500">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DbPropertyType)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {typeUsesOptions(type) && (
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-500">Options (comma-separated)</span>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </label>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={disabled || !name.trim()}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-800">
          Cancel
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            disabled={disabled || !canDelete}
            title={canDelete ? 'Delete column' : 'The title column cannot be deleted'}
            className="ml-auto text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// A header cell with a popover ColumnEditor for rename/retype/delete.
function ColumnHeader({
  property,
  disabled,
  onSave,
  onDelete,
}: {
  property: DbProperty
  disabled: boolean
  onSave: (input: { name: string; type: DbPropertyType; options?: DbSelectOption[] }) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLTableCellElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <th ref={ref} className="relative px-4 py-2 text-left font-semibold whitespace-nowrap">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:text-gray-800"
      >
        {property.is_title && <span className="text-gray-400">★</span>}
        {property.name}
        <span className="text-gray-300">⌄</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 normal-case tracking-normal">
          <ColumnEditor
            initial={{ name: property.name, type: property.type, options: property.config.options }}
            canDelete={!property.is_title}
            disabled={disabled}
            onSave={(input) => {
              setOpen(false)
              onSave(input)
            }}
            onDelete={() => {
              setOpen(false)
              onDelete()
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </th>
  )
}

// ── Editable records table ─────────────────────────────────────────────────────
function EditableRecordsTable({
  detail,
  disabled,
  onCellCommit,
  onDeleteRow,
  onSaveColumn,
  onDeleteColumn,
  onAddColumn,
}: {
  detail: DatabaseDetail
  disabled: boolean
  onCellCommit: (record: DbRecord, property: DbProperty, raw: unknown) => void
  onDeleteRow: (record: DbRecord) => void
  onSaveColumn: (property: DbProperty, input: { name: string; type: DbPropertyType; options?: DbSelectOption[] }) => void
  onDeleteColumn: (property: DbProperty) => void
  onAddColumn: (input: { name: string; type: DbPropertyType; options?: DbSelectOption[] }) => void
}) {
  const cols = orderedProperties(detail.properties)
  const [adding, setAdding] = useState(false)

  if (cols.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center">
        <p className="text-sm text-gray-500">This database has no columns yet.</p>
        {adding ? (
          <div className="mt-3 inline-block">
            <ColumnEditor
              canDelete={false}
              disabled={disabled}
              onSave={(input) => {
                setAdding(false)
                onAddColumn(input)
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            + Add column
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            {cols.map((p) => (
              <ColumnHeader
                key={p.id}
                property={p}
                disabled={disabled}
                onSave={(input) => onSaveColumn(p, input)}
                onDelete={() => onDeleteColumn(p)}
              />
            ))}
            <th className="relative px-3 py-2 text-left font-semibold">
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                title="Add column"
                className="text-gray-400 hover:text-gray-700"
              >
                +
              </button>
              {adding && (
                <div className="absolute right-0 top-full z-20 mt-1 normal-case tracking-normal">
                  <ColumnEditor
                    canDelete={false}
                    disabled={disabled}
                    onSave={(input) => {
                      setAdding(false)
                      onAddColumn(input)
                    }}
                    onCancel={() => setAdding(false)}
                  />
                </div>
              )}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {detail.records.map((rec) => (
            <tr key={rec.id} className="group align-top hover:bg-gray-50">
              {cols.map((p) => (
                <td key={p.id} className="px-4 py-2.5">
                  <EditableCell
                    property={p}
                    record={rec}
                    disabled={disabled}
                    onCommit={(raw) => onCellCommit(rec, p, raw)}
                    resolve={relationResolverFor(detail, p.id)}
                  />
                </td>
              ))}
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDeleteRow(rec)}
                  title="Delete row"
                  className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600 disabled:opacity-30"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {detail.records.length === 0 && (
            <tr>
              <td colSpan={cols.length + 1} className="px-4 py-6 text-center text-sm text-gray-500">
                No records yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Notion import panel (unchanged from B2) ────────────────────────────────────
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
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
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

/** Detail-view panel: re-fetch the source Notion database to recover each row's
 *  page id (so relation columns pointing here resolve to titles). For databases
 *  imported before page ids were captured. */
function BackfillPanel({ databaseId, onDone, onClose }: { databaseId: string; onDone: () => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BackfillPageIdsReport | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const report = await backfillNotionPageIds({ databaseId, url, token })
        setToken('')
        setResult(report)
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Backfill failed.')
      }
    })
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Recover Notion page ids</h3>
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Re-fetches this database from Notion and matches each row to its source page by title, so
        relation columns elsewhere can show titles instead of raw ids. Rows are matched by title.
      </p>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Source Notion database URL</span>
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
            <span className="font-normal text-gray-400"> — used once, not stored</span>
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
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {result && (
          <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            Matched {result.matched} of {result.total} rows.
            {result.unmatched > 0 && (
              <span className="text-green-700">
                {' '}{result.unmatched} unmatched
                {result.unmatchedTitles.length > 0 && `: ${result.unmatchedTitles.slice(0, 5).join(', ')}${result.unmatchedTitles.length > 5 ? '…' : ''}`}
              </span>
            )}
          </div>
        )}
        <button
          onClick={submit}
          disabled={pending || !url.trim() || !token.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? 'Recovering…' : 'Recover page ids'}
        </button>
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

export function DatabasesView({
  databases,
  openDatabaseId,
}: {
  databases: HqDatabase[]
  openDatabaseId?: string | null
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<DatabaseDetail | null>(null)
  const [report, setReport] = useState<ImportNotionReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showBackfill, setShowBackfill] = useState(false)
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

  // Run a mutating server action, fold the returned fresh detail back into
  // state, and surface any error. The list view sort can drift after edits, so
  // refresh the server list too (cheap, keeps record counts / order honest).
  function mutate(fn: () => Promise<DatabaseDetail>) {
    setError(null)
    startTransition(async () => {
      try {
        const d = await fn()
        setDetail(d)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Update failed.')
      }
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
        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-500 hover:text-red-800">
              ✕
            </button>
          </div>
        )}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            {db.icon && <span className="text-xl">{db.icon}</span>}
            <h2 className="text-lg font-semibold text-gray-900">{db.title}</h2>
            <EntityChips entities={db.entities} />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowBackfill((v) => !v)}
                title="Recover Notion page ids so relations to this database resolve to titles"
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                ↻ Backfill page ids
              </button>
              <button
                onClick={() =>
                  downloadText(safeDownloadName(db.title, 'csv'), databaseToCsv(detail), 'text/csv')
                }
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                ⤓ Download CSV
              </button>
            </div>
          </div>
          {showBackfill && (
            <div className="mt-3">
              <BackfillPanel databaseId={db.id} onDone={() => open(db.id)} onClose={() => setShowBackfill(false)} />
            </div>
          )}
          {db.description && <p className="mt-1 text-sm text-gray-500">{db.description}</p>}
          <p className="mt-1 text-xs text-gray-400">
            {detail.records.length} {detail.records.length === 1 ? 'record' : 'records'} ·{' '}
            {detail.properties.length} {detail.properties.length === 1 ? 'column' : 'columns'}
          </p>
        </div>
        <div className={pending ? 'opacity-60' : ''}>
          <EditableRecordsTable
            detail={detail}
            disabled={pending}
            onCellCommit={(rec, p, raw) => mutate(() => updateCell(db.id, rec.id, p, raw))}
            onDeleteRow={(rec) => mutate(() => deleteRecord(db.id, rec.id))}
            onSaveColumn={(p, input) => mutate(() => updateProperty(db.id, p.id, input))}
            onDeleteColumn={(p) => mutate(() => deleteProperty(db.id, p.id))}
            onAddColumn={(input) => mutate(() => addProperty(db.id, input))}
          />
          {detail.properties.length > 0 && (
            <button
              onClick={() => mutate(() => addRecord(db.id))}
              disabled={pending}
              className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              + Add row
            </button>
          )}
        </div>
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
              <tr key={db.id} onClick={() => open(db.id)} className="cursor-pointer hover:bg-gray-50">
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
