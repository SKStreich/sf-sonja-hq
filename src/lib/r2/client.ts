/**
 * Cloudflare R2 client — S3-compatible PUT / HEAD / GET / DELETE via aws4fetch.
 *
 * R2 speaks S3 protocol with SigV4 auth; aws4fetch is ~10KB vs the full AWS
 * SDK's ~5MB, and we only need a handful of object ops, so it's worth the
 * smaller cold-start.
 *
 * Env vars (set in Vercel production scope):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *
 * isR2Configured() lets callers check up front and 503 gracefully if not.
 */
import { AwsClient } from 'aws4fetch'

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  )
}

interface R2Config {
  accountId: string
  bucket: string
  client: AwsClient
}

function getConfig(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 env vars not configured')
  }
  return {
    accountId,
    bucket,
    // R2 expects region 'auto' and the S3 service signature
    client: new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' }),
  }
}

function endpoint({ accountId, bucket }: R2Config, key: string): string {
  const safeKey = key.split('/').map(encodeURIComponent).join('/')
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${safeKey}`
}

/**
 * Returns true if the object exists in R2 (200 from HEAD), false if absent
 * (404). Any other response (auth failure, region mismatch, etc.) throws so
 * the caller doesn't silently treat misconfig as "object missing → upload."
 */
export async function r2Head(key: string): Promise<{ exists: boolean; size?: number }> {
  const cfg = getConfig()
  const res = await cfg.client.fetch(endpoint(cfg, key), { method: 'HEAD' })
  if (res.status === 200) {
    const len = res.headers.get('content-length')
    return { exists: true, size: len ? Number(len) : undefined }
  }
  if (res.status === 404) return { exists: false }
  const body = await res.text().catch(() => '')
  throw new Error(`R2 HEAD ${key} → ${res.status} ${body.slice(0, 200)}`)
}

/**
 * Uploads `body` (Buffer or stream) to R2 at `key`. Stores the original
 * Supabase content-type (so restored objects look identical).
 */
export async function r2Put(
  key: string,
  body: Buffer | Uint8Array,
  options: { contentType?: string; metadata?: Record<string, string> } = {},
): Promise<void> {
  const cfg = getConfig()
  const headers: Record<string, string> = {
    'content-length': String(body.byteLength),
  }
  if (options.contentType) headers['content-type'] = options.contentType
  for (const [k, v] of Object.entries(options.metadata ?? {})) {
    headers[`x-amz-meta-${k.toLowerCase()}`] = v
  }
  const res = await cfg.client.fetch(endpoint(cfg, key), {
    method: 'PUT',
    body,
    headers,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`R2 PUT ${key} → ${res.status} ${text.slice(0, 200)}`)
  }
}

/**
 * Downloads an object from R2. Throws on 404 or auth failure. For the restore
 * runbook + future restore script; the daily cron only writes.
 */
export async function r2Get(key: string): Promise<{ body: Buffer; contentType: string | null }> {
  const cfg = getConfig()
  const res = await cfg.client.fetch(endpoint(cfg, key), { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`R2 GET ${key} → ${res.status} ${text.slice(0, 200)}`)
  }
  const arr = new Uint8Array(await res.arrayBuffer())
  return {
    body: Buffer.from(arr),
    contentType: res.headers.get('content-type'),
  }
}
