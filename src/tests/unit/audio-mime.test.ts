import { describe, it, expect } from 'vitest'
import { audioFileName } from '@/lib/audio/mime'

describe('audioFileName', () => {
  it('maps Chromium recordings (webm, with codecs suffix)', () => {
    expect(audioFileName('audio/webm')).toBe('audio.webm')
    expect(audioFileName('audio/webm;codecs=opus')).toBe('audio.webm')
  })

  it('maps Safari recordings (mp4/m4a/aac)', () => {
    expect(audioFileName('audio/mp4')).toBe('audio.mp4')
    expect(audioFileName('audio/mp4;codecs=mp4a.40.2')).toBe('audio.mp4')
    expect(audioFileName('audio/x-m4a')).toBe('audio.m4a')
    expect(audioFileName('audio/aac')).toBe('audio.aac')
  })

  it('maps other whisper-supported containers', () => {
    expect(audioFileName('audio/ogg;codecs=opus')).toBe('audio.ogg')
    expect(audioFileName('audio/wav')).toBe('audio.wav')
    expect(audioFileName('audio/x-wav')).toBe('audio.wav')
    expect(audioFileName('audio/mpeg')).toBe('audio.mp3')
    expect(audioFileName('audio/flac')).toBe('audio.flac')
  })

  it('falls back to webm for unknown or missing types', () => {
    expect(audioFileName('')).toBe('audio.webm')
    expect(audioFileName(null)).toBe('audio.webm')
    expect(audioFileName(undefined)).toBe('audio.webm')
    expect(audioFileName('application/octet-stream')).toBe('audio.webm')
  })

  it('is case-insensitive and honours a custom base name', () => {
    expect(audioFileName('Audio/MP4')).toBe('audio.mp4')
    expect(audioFileName('audio/webm', 'dictation')).toBe('dictation.webm')
  })
})
