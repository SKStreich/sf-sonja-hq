import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getAnthropicApiKey,
  isAnthropicConfigured,
  anthropicKeyEnvName,
} from '@/lib/anthropic-key'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

function clearAllKeys() {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_PROD_API_KEY
  delete process.env.ANTHROPIC_DEV_API_KEY
}

describe('getAnthropicApiKey', () => {
  beforeEach(() => clearAllKeys())
  afterEach(() => {
    clearAllKeys()
    Object.defineProperty(process.env, 'NODE_ENV', { value: ORIGINAL_NODE_ENV })
  })

  it('returns undefined when no key is set', () => {
    expect(getAnthropicApiKey()).toBeUndefined()
    expect(isAnthropicConfigured()).toBe(false)
  })

  it('reads ANTHROPIC_PROD_API_KEY in production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production' })
    process.env.ANTHROPIC_PROD_API_KEY = 'prod-key'
    process.env.ANTHROPIC_DEV_API_KEY = 'dev-key'
    expect(getAnthropicApiKey()).toBe('prod-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_PROD_API_KEY')
  })

  it('reads ANTHROPIC_DEV_API_KEY outside production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' })
    process.env.ANTHROPIC_PROD_API_KEY = 'prod-key'
    process.env.ANTHROPIC_DEV_API_KEY = 'dev-key'
    expect(getAnthropicApiKey()).toBe('dev-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_DEV_API_KEY')
  })

  it('falls back to legacy ANTHROPIC_API_KEY when env-specific is unset (prod)', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production' })
    process.env.ANTHROPIC_API_KEY = 'legacy-key'
    expect(getAnthropicApiKey()).toBe('legacy-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_API_KEY')
  })

  it('falls back to legacy ANTHROPIC_API_KEY when env-specific is unset (dev)', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' })
    process.env.ANTHROPIC_API_KEY = 'legacy-key'
    expect(getAnthropicApiKey()).toBe('legacy-key')
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_API_KEY')
  })

  it('env-specific key wins over legacy', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production' })
    process.env.ANTHROPIC_PROD_API_KEY = 'prod-key'
    process.env.ANTHROPIC_API_KEY = 'legacy-key'
    expect(getAnthropicApiKey()).toBe('prod-key')
  })

  it('anthropicKeyEnvName names the current target when nothing is set', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production' })
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_PROD_API_KEY')
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' })
    expect(anthropicKeyEnvName()).toBe('ANTHROPIC_DEV_API_KEY')
  })
})
