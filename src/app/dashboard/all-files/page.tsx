import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AllFilesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: files } = await (supabase as any)
    .from('project_files')
    .select('*, projects(id, name)')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">All Files</h1>
        <p className="mt-0.5 text-sm text-gray-500">{files?.length ?? 0} file{files?.length !== 1 ? 's' : ''} across all projects</p>
      </div>

      {files && files.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">File</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hidden md:table-cell">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hidden lg:table-cell">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hidden md:table-cell">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f: any, i: number) => (
                <tr
                  key={f.id}
                  className={`${i < files.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">📎</span>
                      <span className="text-gray-900 font-medium truncate max-w-xs">{f.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Link
                      href={`/dashboard/projects/${f.project_id}`}
                      className="text-indigo-600 hover:text-indigo-500 transition-colors"
                    >
                      {f.projects?.name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{formatBytes(f.file_size)}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{formatDate(f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 py-20 text-center bg-white">
          <p className="text-gray-500">No files uploaded yet</p>
        </div>
      )}
    </div>
  )
}
