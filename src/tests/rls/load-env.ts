// Auto-load .env.test for local RLS runs so `cp .env.test.example .env.test`
// then `npm run test:rls` just works. CI sets SUPABASE_TEST_* directly (the
// integration job exports them from `supabase status`), so this no-ops there.
// Dependency-free on purpose — a 10-line parser, not a dotenv dep.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

if (!process.env.SUPABASE_TEST_URL) {
  const path = resolve(process.cwd(), '.env.test')
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
      }
    }
  }
}
