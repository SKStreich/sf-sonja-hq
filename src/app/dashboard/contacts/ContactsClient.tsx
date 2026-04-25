'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  listContacts, createContact, updateContact, deleteContact,
  type Contact,
} from '@/app/api/contacts/actions'

export function ContactsClient({ initial }: { initial: Contact[] }) {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>(initial)
  const [query, setQuery] = useState('')
  const [pending, startPending] = useTransition()
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const refresh = (q?: string) => {
    startPending(async () => {
      try { setContacts(await listContacts(q ?? query)) }
      catch (e: any) { setErr(e.message ?? 'Load failed') }
    })
  }

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    refresh(query)
  }

  const remove = (id: string) => {
    if (!confirm('Delete this contact? Their share history is preserved.')) return
    startPending(async () => {
      try { await deleteContact(id); setContacts(c => c.filter(x => x.id !== id)) }
      catch (e: any) { setErr(e.message ?? 'Delete failed') }
    })
  }

  return (
    <div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mb-4 flex items-center gap-2">
        <form onSubmit={onSearch} className="flex flex-1 gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, or company"
            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
          />
          <button type="submit" disabled={pending}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            Search
          </button>
        </form>
        <button onClick={() => setAdding(true)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
          + New contact
        </button>
      </div>

      {adding && (
        <NewContactForm
          onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); refresh() }}
        />
      )}

      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          No contacts yet. Send a share or add one manually to seed your CRM.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {contacts.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{c.full_name}</span>
                  {c.consent_to_contact ? (
                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green-700">opted in</span>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">no consent</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {c.email}
                  {c.company && <> · {c.company}</>}
                  {c.role && <> · {c.role}</>}
                  {c.tags.length > 0 && <> · {c.tags.map(t => `#${t}`).join(' ')}</>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <ContactConsentToggle contact={c} onChanged={() => refresh()} />
                <button onClick={() => remove(c.id)} disabled={pending}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewContactForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [tags, setTags] = useState('')
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    startBusy(async () => {
      try {
        await createContact({
          full_name: name, email, company, role,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        })
        onCreated()
      } catch (e: any) { setErr(e.message ?? 'Create failed') }
    })
  }

  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3 text-sm">
      <input value={name} onChange={e => setName(e.target.value)} required placeholder="Full name"
        className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
      <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="Email"
        className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
      <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company (optional)"
        className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
      <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role (optional)"
        className="rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
      <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (comma-separated)"
        className="col-span-2 rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
      {err && <div className="col-span-2 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          {busy ? 'Saving…' : 'Add contact'}
        </button>
      </div>
    </form>
  )
}

function ContactConsentToggle({ contact, onChanged }: { contact: Contact; onChanged: () => void }) {
  const [busy, startBusy] = useTransition()
  const toggle = () => {
    startBusy(async () => {
      try { await updateContact(contact.id, { consent_to_contact: !contact.consent_to_contact }); onChanged() }
      catch {}
    })
  }
  return (
    <button onClick={toggle} disabled={busy}
      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
      {contact.consent_to_contact ? 'Revoke consent' : 'Mark opted in'}
    </button>
  )
}
