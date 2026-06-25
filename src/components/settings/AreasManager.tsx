'use client'
/**
 * Settings → Areas (Sprint 13 A1). The one place the area catalogue is edited:
 * per-entity lists with add / rename / reorder / delete. Areas are the middle
 * tier between entity and tags; item-assignment + filtering land in A2/A3.
 */
import { useEffect, useState, useTransition } from 'react'
import {
  listAreas, createArea, renameArea, reorderAreas, deleteArea, countAreaUsage,
} from '@/app/api/areas/actions'
import { groupAreasByEntity, type Area } from '@/lib/areas/areas'
import { ENTITY_SLUGS, ENTITY_META, ENTITY_BADGE_CLASS, type EntitySlug } from '@/lib/entities/config'

export function AreasManager() {
  const [areas, setAreas] = useState<Area[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [, startMutate] = useTransition()

  const reload = () => listAreas().then(a => { setAreas(a); setLoaded(true) }).catch(() => setLoaded(true))
  useEffect(() => { reload() }, [])

  const run = (fn: () => Promise<unknown>) => {
    setErr('')
    startMutate(async () => {
      try { await fn(); await reload() } catch (e: any) { setErr(e?.message ?? 'Something went wrong') }
    })
  }

  const grouped = groupAreasByEntity(areas)

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Areas</h2>
      <p className="text-sm text-gray-500 mb-4">
        A middle tier between entity and tags — group knowledge, projects, and tasks into named buckets
        within each entity. Add, rename, reorder, or remove areas here; you&rsquo;ll file items under them next.
      </p>
      {err && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!loaded ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          {ENTITY_SLUGS.map(entity => (
            <EntityAreas
              key={entity}
              entity={entity}
              areas={grouped[entity] ?? []}
              onAdd={name => run(() => createArea(entity, name))}
              onRename={(id, name) => run(() => renameArea(id, name))}
              onReorder={ids => run(() => reorderAreas(entity, ids))}
              onDelete={id => run(() => deleteArea(id))}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function EntityAreas({
  entity, areas, onAdd, onRename, onReorder, onDelete,
}: {
  entity: EntitySlug
  areas: Area[]
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onReorder: (orderedIds: string[]) => void
  onDelete: (id: string) => void
}) {
  const [adding, setAdding] = useState('')

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= areas.length) return
    const ids = areas.map(a => a.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    onReorder(ids)
  }
  const submitAdd = () => {
    const name = adding.trim()
    if (!name) return
    onAdd(name)
    setAdding('')
  }
  const remove = async (a: Area) => {
    const n = await countAreaUsage(a.id)
    const msg = n > 0
      ? `Delete "${a.name}"? ${n} item${n === 1 ? '' : 's'} will lose this area (the items themselves stay).`
      : `Delete "${a.name}"?`
    if (confirm(msg)) onDelete(a.id)
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ENTITY_BADGE_CLASS[entity]}`}>
          {ENTITY_META[entity].label}
        </span>
        {areas.length === 0 && <span className="text-xs text-gray-400">no areas yet</span>}
      </div>
      <ul className="space-y-1">
        {areas.map((a, i) => (
          <li key={a.id} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-gray-100">
            <div className="flex flex-col leading-none">
              <button onClick={() => move(i, -1)} disabled={i === 0}
                aria-label="Move up" className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">▲</button>
              <button onClick={() => move(i, 1)} disabled={i === areas.length - 1}
                aria-label="Move down" className="text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">▼</button>
            </div>
            <AreaName name={a.name} onRename={name => onRename(a.id, name)} />
            <code className="text-[10px] text-gray-400">{a.slug}</code>
            <button onClick={() => remove(a)}
              className="ml-auto text-xs text-gray-400 hover:text-red-600">Delete</button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={adding}
          onChange={e => setAdding(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
          placeholder="Add an area…"
          className="w-48 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
        />
        <button onClick={submitAdd} disabled={!adding.trim()}
          className="rounded-md bg-indigo-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          + Add
        </button>
      </div>
    </div>
  )
}

/** Inline-editable area name: click to edit, Enter/blur to save, Esc to cancel. */
function AreaName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const save = () => {
    const v = value.trim()
    setEditing(false)
    if (v && v !== name) onRename(v)
    else setValue(name)
  }
  if (!editing) {
    return (
      <button onClick={() => { setValue(name); setEditing(true) }}
        className="text-sm font-medium text-gray-800 hover:text-indigo-700">{name}</button>
    )
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(name); setEditing(false) } }}
      className="w-40 rounded border border-indigo-300 px-1.5 py-0.5 text-sm text-gray-900 outline-none"
    />
  )
}
