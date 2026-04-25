import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Dev-only auto-login. Disabled in production.
 *
 * GET /api/dev/login?email=you@example.com[&next=/dashboard]
 *
 * Generates a magic-link OTP for the given email via admin, then verifies it
 * server-side so the session cookies are set on the response. Redirects to
 * `next` (default /dashboard).
 *
 * If `email` is omitted, falls back to DEV_LOGIN_EMAIL env var.
 *
 * Gate: refuses unless NODE_ENV !== 'production' AND DEV_LOGIN_ENABLED=true.
 * The env flag is a second safety net so accidentally leaving NODE_ENV
 * unset in a deployed preview doesn't open a back door.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.DEV_LOGIN_ENABLED !== 'true') {
    return NextResponse.json({ error: 'dev login disabled' }, { status: 403 })
  }

  const { searchParams, origin } = new URL(request.url)
  const email = searchParams.get('email') ?? process.env.DEV_LOGIN_EMAIL
  const next = searchParams.get('next') ?? '/dashboard'

  if (!email) {
    return NextResponse.json({ error: 'email required (query param or DEV_LOGIN_EMAIL)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.email_otp) {
    return NextResponse.json({ error: error?.message ?? 'failed to generate link' }, { status: 500 })
  }

  const supabase = createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: 'magiclink',
  })
  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 })
  }

  return NextResponse.redirect(`${origin}${next}`)
}
