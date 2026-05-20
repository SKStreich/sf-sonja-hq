import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getAnthropicApiKey,
  isAnthropicConfigured,
  anthropicKeyEnvName,
} from '@/lib/anthropic-key'

function clearAllKeys() {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_PROD_API_KEY
  delete process.env.ANTHROPIC_DEV_API_KEY
}

describe('getAnthropicApiKey', () => {
  beforeEach(() => clearAllKeys())
  afterEach(() => {
    clearAllKeys()
    vi.unstubAllEnvs()
  })

  it('returns undefined when no key is set', () => {
    expect(getAnthropicApiKey()).toBeUndefined()
    expect(isAnthropicConfigured()).toBe(false)
  })

  it('reads ANTHROPIC_PROD_API_KEY in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.ANTHROPIC_PROD_API_KEY = 'prod-key'
    process.env.ANTHROPIC_DEV_API_KEY = 'dev-key'
    expect(getAnthropicApiKey()).toBe('prod-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_PROD_API_KEY')
  })

  it('reads ANTHROPIC_DEV_API_KEY outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    process.env.ANTHROPIC_PROD_API_KEY = 'prod-key'
    process.env.ANTHROPIC_DEV_API_KEY = 'dev-key'
    expect(getAnthropicApiKey()).toBe('dev-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_DEV_API_KEY')
  })

  it('falls back to legacy ANTHROPIC_API_KEY when env-specific is unset (prod)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.ANTHROPIC_API_KEY = 'legacy-key'
    expect(getAnthropicApiKey()).toBe('legacy-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_API_KEY')
  })

  it('falls back to legacy ANTHROPIC_API_KEY when env-specific is unset (dev)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    process.env.ANTHROPIC_API_KEY = 'legacy-key'
    expect(getAnthropicApiKey()).toBe('legacy-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_API_KEY')
  })

  it('env-specific key wins over legacy', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.ANTHROPIC_PROD_API_KEY = 'prod-key'
    process.env.ANTHROPIC_API_KEY = 'legacy-key'
    expect(getAnthropicApiKey()).toBe('prod-key')
  })

  it('anthropicKeyEnvName names the current target when nothing is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_PROD_API_KEY')
    vi.stubEnv('NODE_ENV', 'development')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_DEV_API_KEY')
  })
})
