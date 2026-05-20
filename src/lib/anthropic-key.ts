/**
 * Centralized Anthropic API key resolution.
 *
 * Convention adopted 2026-05-20 after a prod incident where the single
 * `ANTHROPIC_API_KEY` env var was rotated/invalidated and the agent went
 * offline. Splitting into prod/dev keys lets us rotate one without
 * affecting the other, and matches the rest of the env-var naming pattern
 * Sonja uses in Vercel.
 *
 *   ANTHROPIC_PROD_API_KEY  — used when NODE_ENV === 'production'
 *                              (Vercel sets this for both Production AND
 *                               Preview deployments — preview shares the
 *                               prod key intentionally)
 *   ANTHROPIC_DEV_API_KEY   — used otherwise (local dev, test runners)
 *
 * Legacy fallback: if neither env-specific key is set, fall back to the
 * un-suffixed `ANTHROPIC_API_KEY`. This keeps existing tests passing and
 * gives us a safe migration window if any env scope is misconfigured.
 */

export function getAnthropicApiKey(): string | undefined {
  const isProd = process.env.NODE_ENV === 'production'
  const envSpecific = isProd
    ? process.env.ANTHROPIC_PROD_API_KEY
    : process.env.ANTHROPIC_DEV_API_KEY
  return envSpecific ?? process.env.ANTHROPIC_API_KEY
}

export function isAnthropicConfigured(): boolean {
  return !!getAnthropicApiKey()
}

/**
 * Name of the env var the current runtime is reading from. Useful for
 * error messages that tell the user exactly which var to set.
 */
export function anthropicKeyEnvName(): string {
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && process.env.ANTHROPIC_PROD_API_KEY) return 'ANTHROPIC_PROD_API_KEY'
  if (!isProd && process.env.ANTHROPIC_DEV_API_KEY) return 'ANTHROPIC_DEV_API_KEY'
  if (process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY'
  return isProd ? 'ANTHROPIC_PROD_API_KEY' : 'ANTHROPIC_DEV_API_KEY'
}
