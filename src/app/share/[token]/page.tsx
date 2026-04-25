import { notFound } from 'next/navigation'
import { resolveShareToken } from '@/app/api/knowledge/shares'
import { ShareViewer } from './ShareViewer'

export const dynamic = 'force-dynamic'

export default async function SharePage({ params }: { params: { token: string } }) {
  const view = await resolveShareToken(params.token)
  if (!view) notFound()
  return <ShareViewer view={view} token={params.token} />
}
