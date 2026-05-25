'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Sign in with email + password. Generic error on failure to prevent
 * email enumeration. Existing-user-without-password recovery is offered
 * via the "Forgot or never set password?" CTA → requestPasswordReset.
 */
export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email and password are required'))
  }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=' + encodeURIComponent('Invalid email or password'))
  }

  redirect('/dashboard')
}

/**
 * Send a magic link that lands the user on /auth/set-password. Used for:
 *   - Forgot-password recovery
 *   - First-time password setup for an existing magic-link-only user
 *   - Invite acceptance (when wired up later)
 *
 * Always returns the same notice regardless of whether the email exists,
 * to prevent enumeration.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) {
    redirect('/login?error=' + encodeURIComponent('Email is required'))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hq.streichforce.com'
  const supabase = createClient()

  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=/auth/set-password`,
      shouldCreateUser: false,
    },
  })

  redirect('/login?notice=check-email')
}

/**
 * Authenticated handler: set or update the current user's password.
 * Called from /auth/set-password. Requires an active session — the
 * magic-link callback establishes that before redirect.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password.length < 8) {
    redirect('/auth/set-password?error=' + encodeURIComponent('Password must be at least 8 characters'))
  }
  if (password !== confirm) {
    redirect('/auth/set-password?error=' + encodeURIComponent('Passwords do not match'))
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Session expired — request a new link to continue'))
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/auth/set-password?error=' + encodeURIComponent(error.message))
  }

  redirect('/dashboard')
}
