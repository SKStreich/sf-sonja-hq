import { notFound } from 'next/navigation'
import { getEntry } from '@/app/api/knowledge/actions'
import { listVersions, listRelated } from '@/app/api/knowledge/detail'
import { EntryDetail } from './EntryDetail'

export default async function EntryDetailPage({ params }: { params: { id: string } }) {
  const entry = await getEntry(params.id)
  if (!entry) notFound()

  const [versions, critiques, notes] = await Promise.all([
    listVersions(params.id),
    listRelated(params.id, 'critique_of'),
    listRelated(params.id, 'note_on'),
  ])

  return (
    <EntryDetail
      entry={entry}
      versions={versions}
      critiques={critiques}
      followUpNotes={notes}
    />
  )
}
