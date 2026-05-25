import { describe, it, expect, vi, beforeEach } from 'vitest'

// next/navigation.redirect throws a special NEXT_REDIRECT error. We capture
// the URL it was called with so each test can assert on the redirect target.
const redirectCalls: string[] = []
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    redirectCalls.push(url)
    throw new Error('NEXT_REDIRECT:' + url)
  }),
}))

const mockSignInWithPassword = vi.fn()
const mockSignInWithOtp = vi.fn()
const mockGetUser = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOtp: mockSignInWithOtp,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
  }),
}))

import { signIn, requestPasswordReset, updatePassword } from '@/app/auth/actions'

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  redirectCalls.length = 0
})

describe('signIn', () => {
  it('redirects to /dashboard on success', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    await expect(signIn(formData({ email: 'a@b.com', password: 'p@ssword1' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toBe('/dashboard')
  })

  it('redirects with generic error on invalid credentials (no enumeration)', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    await expect(signIn(formData({ email: 'a@b.com', password: 'wrong' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toMatch(/^\/login\?error=/)
    expect(redirectCalls.at(-1)).toContain('Invalid%20email%20or%20password')
  })

  it('rejects empty email or password', async () => {
    await expect(signIn(formData({ email: '', password: '' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toContain('Email%20and%20password%20are%20required')
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('normalizes email (trim + lowercase)', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    await expect(signIn(formData({ email: '  USER@Example.com  ', password: 'p@ssword1' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'p@ssword1' })
  })
})

describe('requestPasswordReset', () => {
  it('sends OTP with set-password redirect and shows check-email notice', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    await expect(requestPasswordReset(formData({ email: 'a@b.com' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'a@b.com',
      options: expect.objectContaining({
        emailRedirectTo: expect.stringContaining('/auth/callback?next=/auth/set-password'),
        shouldCreateUser: false,
      }),
    }))
    expect(redirectCalls.at(-1)).toBe('/login?notice=check-email')
  })

  it('does not reveal whether email exists (always check-email notice)', async () => {
    // OTP rejection scenarios shouldn't leak. Sim a non-throw rejection.
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'whatever' } })
    await expect(requestPasswordReset(formData({ email: 'unknown@x.com' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toBe('/login?notice=check-email')
  })

  it('rejects empty email', async () => {
    await expect(requestPasswordReset(formData({ email: '' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toContain('Email%20is%20required')
    expect(mockSignInWithOtp).not.toHaveBeenCalled()
  })
})

describe('updatePassword', () => {
  it('rejects passwords shorter than 8', async () => {
    await expect(updatePassword(formData({ password: 'short', confirm: 'short' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toContain('at%20least%208%20characters')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('rejects mismatched confirmation', async () => {
    await expect(updatePassword(formData({ password: 'p@ssword1', confirm: 'p@ssword2' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toContain('Passwords%20do%20not%20match')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('redirects to /login if no active session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(updatePassword(formData({ password: 'p@ssword1', confirm: 'p@ssword1' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toContain('/login?error=')
    expect(redirectCalls.at(-1)).toContain('Session%20expired')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('updates password and redirects to /dashboard on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
    mockUpdateUser.mockResolvedValue({ error: null })
    await expect(updatePassword(formData({ password: 'p@ssword1', confirm: 'p@ssword1' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'p@ssword1' })
    expect(redirectCalls.at(-1)).toBe('/dashboard')
  })

  it('redirects back to set-password with the error message on update failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpdateUser.mockResolvedValue({ error: { message: 'Password too weak' } })
    await expect(updatePassword(formData({ password: 'p@ssword1', confirm: 'p@ssword1' }))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectCalls.at(-1)).toMatch(/^\/auth\/set-password\?error=/)
    expect(redirectCalls.at(-1)).toContain('Password%20too%20weak')
  })
})
