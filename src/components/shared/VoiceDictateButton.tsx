'use client'
import { useEffect, useRef, useState } from 'react'
import { audioFileName } from '@/lib/audio/mime'

interface VoiceDictateButtonProps {
  /** Called with the transcribed text after a successful recording. */
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Shared dictation button (Sprint 14 J1, spec D4): records via MediaRecorder,
 * transcribes through the existing authenticated /api/whisper route, and hands
 * the text to the caller (who decides where to insert it). First home is the
 * Daily Journal; designed to sit next to any HQ text field.
 */
export function VoiceDictateButton({ onTranscript, disabled, className }: VoiceDictateButtonProps) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Stop the mic if the component unmounts mid-recording.
  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stream.getTracks().forEach(t => t.stop())
      recorderRef.current.stop()
    }
  }, [])

  const start = async () => {
    setError(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording not supported in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size === 0) return
        setBusy(true)
        try {
          const form = new FormData()
          // Filename carries the container format (Safari records audio/mp4,
          // Chromium audio/webm) — Whisper parses by extension.
          form.append('audio', blob, audioFileName(blob.type))
          const res = await fetch('/api/whisper', { method: 'POST', body: form })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error ?? 'Transcription failed')
          const text = (json.text ?? '').trim()
          if (text) onTranscript(text)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Transcription failed')
        } finally {
          setBusy(false)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Microphone unavailable — check browser permissions')
    }
  }

  const stop = () => recorderRef.current?.stop()

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || busy}
        title={recording ? 'Stop recording and transcribe' : 'Dictate with your voice'}
        className={
          recording
            ? 'flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700 animate-pulse'
            : 'flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50'
        }
      >
        <span className="text-base leading-none">{recording ? '⏹' : '🎙'}</span>
        <span>{busy ? 'Transcribing…' : recording ? 'Stop' : 'Dictate'}</span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
