'use client'
import { useState, useTransition } from 'react'
import type { VaultEntry } from '@/app/api/knowledge/vault'

const ENTITIES = ['personal', 'tm', 'sf', 'sfe'] as const
type Entity = typeof ENTITIES[number]

interface Props {
  entries: VaultEntry[]
  onDownload: (id: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onUpload: (fd: FormData) => void | Promise<void>
}

export function VaultView({ entries, onDownload, onDelete, onUpload }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [entity, setEntity] = useState<Entity>('personal')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [busy, startUpload] = useTransition()

  const submit = () => {
    if (!file) return
    setError('')
    const fd = new FormData()
    fd.set('file', file)
    fd.set('entity', entity)
    fd.set('note', note)
    fd.set('tags', tags)
    startUpload(async () => {
      try {
        await onUpload(fd)
        setFile(null); setNote(''); setTags('')
      } catch (e: any) {
        setError(e.message ?? 'Upload failed')
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-900">🔒 Tier 2 — Vault</p>
        <p className="mt-1 text-sm text-amber-900">
          Files here are <strong>never</strong> read by Claude or indexed for search. Only you (and
          anyone you explicitly grant access) can download them.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Upload file</h3>
        <div className="space-y-3">
          <input
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700"
          />
          <div className="flex flex-wrap items-center gap-3">
            <select value={entity} onChange={e => setEntity(e.target.value as Entity)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
              {ENTITIES.map(x => <option key={x} value={x}>{x.toUpperCase()}</option>)}
            </select>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="tags (comma separated)"
              className="flex-1 min-w-[160px] rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
            />
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Private note about this file (optional)"
            rows={2}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
          />
          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={busy || !file}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40">
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
          Vault is empty.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">File</th>
                <th className="px-3 py-2 text-left font-semibold">Entity</th>
                <th className="px-3 py-2 text-left font-semibold">Size</th>
                <th className="px-3 py-2 text-left font-semibold">Uploaded</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(e => (
                <tr key={e.id} className="group hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900 line-clamp-1">{e.title ?? '(unnamed)'}</p>
                    {e.summary && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{e.summary}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-xs uppercase tracking-wide text-gray-600">{e.entity}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">{formatBytes(e.size_bytes)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => onDownload(e.id)} className="mr-3 text-xs text-indigo-600 hover:text-indigo-500">Download</button>
                    <button
                      onClick={() => { if (confirm('Delete this file? This cannot be undone.')) onDelete(e.id) }}
                      className="text-xs text-gray-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number | null): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
