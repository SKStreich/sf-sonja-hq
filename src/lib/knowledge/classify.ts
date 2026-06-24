/**
 * Shared knowledge classifier (Sprint 13 T2).
 *
 * Extracted from api/knowledge/actions.ts so every low-friction creation path
 * (manual Composer, Siri, capture API, the HQ agent) classifies the same way.
 * Pure parsing (`parseClassification`) is split from the Anthropic call so it's
 * unit-tested without a network mock.
 *
 * D6: the classifier now also guesses an ENTITY. For quick captures that guess
 * is carried as `suggested_entity` and PRE-SELECTED in the triage UI — never
 * auto-applied (the human confirms or corrects it when filing).
 */
import Anthropic from '@anthropic-ai/sdk'
import { ENTITY_SLUGS, entityLabel } from '@/lib/entities/config'

const TYPE_HINTS = ['decision', 'strategy', 'primer', 'brand', 'marketing', 'business', 'idea'] as const

export interface Classification {
  title: string
  type_hint: string
  tags: string[]
  confidence: number
  summary: string | null
  /** Best-guess entity slug, or null. A suggestion only — never auto-applied. */
  suggested_entity: string | null
}

export function fallbackClassification(body: string): Classification {
  return {
    title: body.split('\n')[0].slice(0, 120),
    type_hint: 'strategy',
    tags: [],
    confidence: 0.3,
    summary: null,
    suggested_entity: null,
  }
}

/** Parse the model's JSON reply into a validated Classification. PURE. Unknown
 *  type_hints fall back to 'strategy'; an entity that isn't a known slug → null. */
export function parseClassification(text: string, body: string): Classification {
  const fallback = fallbackClassification(body)
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  try {
    const p = JSON.parse(jsonStr)
    const type_hint = (TYPE_HINTS as readonly string[]).includes(p.type_hint) ? p.type_hint : 'strategy'
    const guess = typeof p.suggested_entity === 'string' ? p.suggested_entity.trim().toLowerCase() : null
    const suggested_entity = guess && (ENTITY_SLUGS as readonly string[]).includes(guess) ? guess : null
    return {
      title: String(p.title ?? '').slice(0, 120) || fallback.title,
      type_hint,
      tags: Array.isArray(p.tags) ? p.tags.map((t: unknown) => String(t).toLowerCase()).slice(0, 8) : [],
      confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      summary: typeof p.summary === 'string' ? p.summary.slice(0, 200) : null,
      suggested_entity,
    }
  } catch {
    return fallback
  }
}

/** Classify a note's body. Returns the fallback when no apiKey or on any error
 *  (so creation never blocks on classification). `entityHint` biases the guess. */
export async function classifyEntry(
  body: string,
  opts: { apiKey?: string | null; entityHint?: string } = {},
): Promise<Classification> {
  const apiKey = opts.apiKey
  if (!apiKey) return fallbackClassification(body)

  const entityMenu = ENTITY_SLUGS.map(s => `"${s}" (${entityLabel(s)})`).join(', ')
  try {
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Classify this note into JSON with schema:
{
  "title": "short title (max 80 chars)",
  "type_hint": one of ["decision","strategy","primer","brand","marketing","business","idea"],
  "tags": ["lowercase","short","topical"],
  "confidence": 0.0 to 1.0,
  "summary": "one-sentence preview (max 160 chars)",
  "suggested_entity": best-guess business/entity slug or null, one of [${entityMenu}]
}

${opts.entityHint ? `Entity context hint: ${opts.entityHint}` : 'No entity context — infer the most likely one, or null if unclear.'}
Content:
${body.slice(0, 4000)}`,
      }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
    return parseClassification(text, body)
  } catch (err) {
    console.error('[classifyEntry] Anthropic call failed; using fallback metadata:', err)
    return fallbackClassification(body)
  }
}
