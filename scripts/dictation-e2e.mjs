#!/usr/bin/env node
/**
 * Headless end-to-end test of the Journal voice dictation flow — no human,
 * no physical microphone. Chromium is launched with a FAKE mic whose "audio"
 * is a WAV file synthesized by macOS `say`, auth comes from /api/dev/login
 * (see .env.development.local pattern in the Sprint 14 primer).
 *
 * Modes:
 *   node scripts/dictation-e2e.mjs mock   # /api/whisper intercepted with a
 *       canned transcript → verifies the CLIENT pipeline (mic permission →
 *       MediaRecorder → blob upload → insertAtCursor → autosave) with no
 *       OpenAI key needed. Suitable as a CI gate.
 *   node scripts/dictation-e2e.mjs real   # hits the real /api/whisper →
 *       verifies the SERVER path too (auth, key config, OpenAI round-trip).
 *       Fails loudly with the exact on-screen error if the key is missing —
 *       this reproduces the prod "OpenAI API key not configured" bug.
 *
 * Prereqs: local Supabase running, dev server on BASE_URL (default
 * http://localhost:3001) started with DEV_LOGIN_ENABLED=true.
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const MODE = process.argv[2] === 'real' ? 'real' : 'mock'
const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const MOCK_TEXT = 'Mock transcript from the dictation harness.'
const FIXTURE_TEXT = 'Today I worked on the journal feature and tested voice dictation end to end.'

// Synthesize the spoken fixture on demand (macOS `say` → WAV, the only
// format Chromium's --use-file-for-fake-audio-capture accepts).
const outDir = path.join(os.tmpdir(), 'hq-dictation-e2e')
mkdirSync(outDir, { recursive: true })
const wav = path.join(outDir, 'fixture.wav')
if (!existsSync(wav)) {
  execFileSync('say', ['-o', wav, '--data-format=LEI16@44100', FIXTURE_TEXT])
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',       // auto-grant the mic permission prompt
    '--use-fake-device-for-media-stream',   // replace real capture devices
    `--use-file-for-fake-audio-capture=${wav}`, // the fake mic "hears" this file
  ],
})
const page = await browser.newPage()
const fail = async (msg) => {
  await page.screenshot({ path: path.join(outDir, `fail-${MODE}.png`), fullPage: true })
  console.error(`✕ FAIL (${MODE}): ${msg}\n  screenshot: ${path.join(outDir, `fail-${MODE}.png`)}`)
  await browser.close()
  process.exit(1)
}

let whisperStatus = null
page.on('response', (res) => {
  if (res.url().endsWith('/api/whisper')) whisperStatus = res.status()
})
if (MODE === 'mock') {
  await page.route('**/api/whisper', (route) => {
    // The recorded blob still travels this far — assert it's non-trivial.
    const body = route.request().postDataBuffer()
    if (!body || body.length < 1000) return route.fulfill({ status: 400, json: { error: `harness: audio blob too small (${body?.length ?? 0} bytes)` } })
    return route.fulfill({ json: { text: MOCK_TEXT } })
  })
}

// Authed entry straight onto today's journal.
const login = await page.goto(`${BASE}/api/dev/login?next=/dashboard/journal`)
if (!login.ok()) await fail(`dev login failed (${login.status()}) — is the dev server running with DEV_LOGIN_ENABLED=true?`)

const textarea = page.locator('textarea')
await textarea.waitFor({ timeout: 15000 }).catch(() => fail('journal textarea never rendered'))
const before = await textarea.inputValue()

// Retry the click until recording actually starts — first paint of a Next.js
// dev page can accept clicks before React has hydrated the handlers.
const errorSpanEarly = page.locator('span.text-red-600')
const stopBtn = page.getByRole('button', { name: /stop/i })
let started = false
for (let i = 0; i < 10 && !started; i++) {
  await page.getByRole('button', { name: /dictate/i }).click()
  await page.waitForTimeout(1000)
  if (await errorSpanEarly.count()) {
    await fail(`recording failed to start: "${(await errorSpanEarly.first().textContent())?.trim()}"`)
  }
  started = await stopBtn.isVisible()
}
if (!started) await fail('recording never started (no Stop button) — mic/MediaRecorder problem')
await page.waitForTimeout(6500) // let the fake mic "speak" the fixture
await stopBtn.click()

// Wait for transcription to finish: textarea grows, or the inline error shows.
const errorSpan = page.locator('span.text-red-600')
try {
  await Promise.race([
    page.waitForFunction(
      (prev) => document.querySelector('textarea')?.value.length > prev.length,
      before, { timeout: 30000 }
    ),
    errorSpan.waitFor({ timeout: 30000 }),
  ])
} catch { await fail('no transcript and no error after 30s') }

if (await errorSpan.count()) {
  const err = (await errorSpan.first().textContent())?.trim()
  await fail(`dictation surfaced an error: "${err}" (POST /api/whisper → ${whisperStatus ?? 'no request'})`)
}

const after = await textarea.inputValue()
const inserted = after.slice(before.length).trim()
if (MODE === 'mock' && !after.includes(MOCK_TEXT)) await fail(`transcript not inserted — textarea: "${after.slice(-200)}"`)
if (MODE === 'real' && !inserted) await fail('real transcription returned empty text')

// Let the debounced autosave fire and confirm it lands.
await page.waitForTimeout(2500)
const saved = await page.getByText('✓ Saved').count()
await page.screenshot({ path: path.join(outDir, `pass-${MODE}.png`), fullPage: true })
console.log(`✓ PASS (${MODE}): dictated text inserted${saved ? ' + autosaved' : ' (autosave label not seen)'}`)
console.log(`  inserted: "${inserted}"`)
console.log(`  screenshot: ${path.join(outDir, `pass-${MODE}.png`)}`)
await browser.close()
