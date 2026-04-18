'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { saveCapture } from '@/app/api/captures/actions'

type Tab = 'text' | 'voice'
type CaptureType = 'task' | 'idea'

interface Props {
  open: boolean
  onClose: () => void
}

export function CaptureModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('text')
  const [captureType, setCaptureType] = useState<CaptureType>('task')
  const [content, setContent] = useState('')
  const [entityContext, setEntityContext] = useState('')
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  // Voice state
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [voiceError, setVoiceError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setContent(''); setEntityContext(''); setSaved(false); setVoiceError('')
      setTimeout(() => textareaRef.current?.focus(), 60)
    } else {
      stopRecording()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const submit = () => {
    if (!content.trim()) return
    startTransition(async () => {
      await saveCapture(content.trim(), captureType, entityContext || undefined)
      setSaved(true)
      setTimeout(() => { setSaved(false); setContent(''); onClose() }, 900)
    })
  }

  const startRecording = async () => {
    setVoiceError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setTranscribing(true)
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const fd = new FormData()
          fd.append('audio', blob, 'audio.webm')
          const res = await fetch('/api/whisper', { method: 'POST', body: fd })
          const json = await res.json()
          if (json.text) { setContent(json.text); setTab('text') }
          else setVoiceError(json.error ?? 'Transcription failed')
        } catch { setVoiceError('Transcription failed') }
        setTranscribing(false)
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      setVoiceError('Microphone access denied')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl overflow-hidden">

        {/* Header tabs */}
        <div className="flex items-center border-b border-gray-800">
          <button
            onClick={() => setTab('text')}
            className={`px-5 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${tab === 'text' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-600 hover:text-gray-400'}`}
          >
            ✏ Text
          </button>
          <button
            onClick={() => setTab('voice')}
            className={`px-5 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${tab === 'voice' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-600 hover:text-gray-400'}`}
          >
            🎙 Voice
          </button>
          <button onClick={onClose} className="ml-auto px-4 text-gray-600 hover:text-gray-400 text-lg">×</button>
        </div>

        <div className="p-5">
          {tab === 'text' && (
            <div className="space-y-4">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
                placeholder="What's on your mind? (⌘↵ to save)"
                rows={4}
                className="w-full resize-none bg-gray-900 rounded-lg border border-gray-800 px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-gray-600 transition-colors"
              />
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg border border-gray-800 overflow-hidden">
                  {(['task', 'idea'] as CaptureType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setCaptureType(t)}
                      className={`px-4 py-1.5 text-xs font-medium capitalize transition-colors ${captureType === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      {t === 'task' ? '✓ Task' : '💡 Idea'}
                    </button>
                  ))}
                </div>
                <input
                  value={entityContext}
                  onChange={e => setEntityContext(e.target.value)}
                  placeholder="Context (optional)"
                  className="flex-1 rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 placeholder-gray-700 outline-none focus:border-gray-600"
                />
              </div>
            </div>
          )}

          {tab === 'voice' && (
            <div className="flex flex-col items-center py-6 gap-4">
              {transcribing ? (
                <div className="text-center">
                  <div className="text-4xl mb-3 animate-pulse">🎙</div>
                  <p className="text-sm text-gray-400">Transcribing…</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-lg ${
                      recording
                        ? 'bg-red-600 hover:bg-red-500 animate-pulse'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                    }`}
                  >
                    {recording ? '⏹' : '🎙'}
                  </button>
                  <p className="text-sm text-gray-500">
                    {recording
                      ? `Recording… ${recSeconds}s — tap to stop`
                      : 'Tap to record your capture'}
                  </p>
                  {voiceError && <p className="text-xs text-red-400">{voiceError}</p>}
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
            <button onClick={onClose} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Cancel</button>
            {saved ? (
              <span className="text-xs text-green-400">✓ Saved</span>
            ) : (
              <button
                onClick={submit}
                disabled={!content.trim() || pending}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {pending ? 'Saving…' : 'Save Capture'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
