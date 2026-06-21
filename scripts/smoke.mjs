#!/usr/bin/env node
/**
 * Sonja HQ — foundation smoke test (no auth required).
 *
 * Boots against a running app (SMOKE_BASE_URL) and asserts HTTP-level health
 * that a unit test + `next build` can't catch:
 *   • public pages RENDER (no 5xx, no error-boundary markers in the body)
 *   • protected pages REDIRECT to /login (auth wall intact, not a 500)
 *
 * This is the FOUNDATION tier. It does NOT log in (HQ uses magic-link /
 * password auth), so it can't catch a crash that only happens while rendering
 * an authenticated page with real data. That coverage needs a dev-Supabase
 * test project + a seeded session (Playwright) — a later slice. See the
 * build-verification-gate skill.
 *
 * HQ auth model (middleware.ts): only `/dashboard/:path*` is protected and
 * redirects unauthenticated callers to `/login` (with a `redirectTo` param).
 * `/login` and `/auth/*` are public. The root `/` is handled by page.tsx,
 * which redirects to `/login` when signed out.
 *
 * Exit 0 = all checks passed. Exit 1 = at least one failed.
 */

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')

// Substrings that mean the page blew up rather than rendered. App Router can
// stream a thrown RSC error with a 200 status, so we scan the body too.
const ERROR_MARKERS = [
  'Application error',
  'Internal Server Error',
  "This page couldn",      // Next's client error page ("This page couldn't load")
  'Unhandled Runtime Error',
  'digest:',
]

let failures = 0
const pass = (n) => console.log(`  ✓ ${n}`)
const fail = (n, detail) => { failures++; console.error(`  ✗ ${n}\n      ${detail}`) }

const get = (path) =>
  fetch(BASE + path, { redirect: 'manual', headers: { 'user-agent': 'sonja-hq-smoke' } })

async function expectRenders(path) {
  try {
    const r = await get(path)
    if (r.status >= 500) return fail(`${path} renders`, `status ${r.status}`)
    const body = await r.text()
    const hit = ERROR_MARKERS.find((m) => body.includes(m))
    if (hit) return fail(`${path} renders`, `error marker in body: "${hit}" (status ${r.status})`)
    pass(`${path} renders (status ${r.status})`)
  } catch (e) {
    fail(`${path} renders`, e.message)
  }
}

async function expectRedirectToLogin(path) {
  try {
    const r = await get(path)
    const loc = r.headers.get('location') || ''
    if (r.status >= 300 && r.status < 400 && loc.includes('/login')) {
      return pass(`${path} → redirects to /login`)
    }
    fail(`${path} protected`, `expected 3xx → /login, got status ${r.status} location="${loc}"`)
  } catch (e) {
    fail(`${path} protected`, e.message)
  }
}

console.log(`Sonja HQ smoke → ${BASE}\n`)

// Public pages (the only routes the auth middleware lets through
// unauthenticated: /login and /auth/*) must render.
await expectRenders('/login')

// Protected pages must bounce unauthenticated callers to /login (not 500).
// Root `/` redirects via page.tsx; the rest via middleware.
await expectRedirectToLogin('/')
await expectRedirectToLogin('/dashboard')
await expectRedirectToLogin('/dashboard/tasks')
await expectRedirectToLogin('/dashboard/projects')
await expectRedirectToLogin('/dashboard/knowledge')

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`)
  process.exit(1)
}
console.log('\nAll smoke checks passed.')
process.exit(0)
