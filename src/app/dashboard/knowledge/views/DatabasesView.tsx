'use client'
/**
 * Databases tab — Phase B1 (READ-ONLY).
 *
 * Master/detail inside the Knowledge hub: a list of the org's databases →
 * click one → its records rendered as a typed table. No editing, no creation,
 * no inline-page embeds yet (those are B2/B3). The cell rendering is driven by
 * the pure `cellModel` helper so this component stays presentational.
 */
import { useState, useTransition } from 'react'
import { getDatabaseDetail } from '@/app/api/knowledge/databases'
import { EntityChips } from '@/components/shared/EntityChips'
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

export function DatabasesView({ databases }: { databases: HqDatabase[] }) {
  const [detail, setDetail] = useState<DatabaseDetail | null>(null)
  const [pending, startTransition] = useTransition()

  function open(id: string) {
    startTransition(async () => {
      const d = await getDatabaseDetail(id)
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
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-gray-700">No databases yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Databases are typed, tabular collections (Notion-style). Importing from Notion arrives in the next slice.
        </p>
      </div>
    )
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${pending ? 'opacity-60' : ''}`}>
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
  )
}
