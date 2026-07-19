/**
 * Map a recorded audio blob's MIME type to a filename whose extension OpenAI's
 * transcription endpoint understands. Whisper infers the container format from
 * the file extension, so sending Safari's audio/mp4 as "audio.webm" gets
 * rejected — the browsers genuinely differ here (Chromium records audio/webm,
 * Safari audio/mp4).
 */
const EXT_BY_SUBTYPE: Record<string, string> = {
  webm: 'webm',
  mp4: 'mp4',
  'x-m4a': 'm4a',
  m4a: 'm4a',
  aac: 'aac',
  mpeg: 'mp3',
  mp3: 'mp3',
  ogg: 'ogg',
  wav: 'wav',
  wave: 'wav',
  'x-wav': 'wav',
  flac: 'flac',
}

/** "audio/mp4;codecs=mp4a.40.2" → "audio.mp4"; unknown/empty types fall back to .webm */
export function audioFileName(mimeType: string | null | undefined, base = 'audio'): string {
  const subtype = (mimeType ?? '').split(';')[0].trim().toLowerCase().split('/')[1] ?? ''
  return `${base}.${EXT_BY_SUBTYPE[subtype] ?? 'webm'}`
}
