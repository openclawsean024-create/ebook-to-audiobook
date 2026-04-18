'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

type ConversionStatus = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  title: string
  chapter_count: number
  character_count: number
  audio_url?: string
  chapter_audios?: Array<{ title: string; url: string; index: number }>
  error?: string
}

type ClonedVoice = {
  id: string
  elevenlabs_voice_id: string
  name: string
  audio_sample_url: string
  created_at: string
}

const VOICES = [
  { id: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2 (Recommended)', gender: 'any' },
  { id: 'eleven_english_v2', label: 'Eleven English v2', gender: 'any' },
  { id: 'eleven_monolingual_v2', label: 'Eleven Monolingual v2', gender: 'any' },
]

const VOICE_GENDER_OPTIONS = [
  { id: 'any', label: 'Any' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
]

const TTS_ENGINES = [
  { id: 'elevenlabs', label: 'ElevenLabs', desc: 'High quality, multilingual' },
  { id: 'openai', label: 'OpenAI TTS', desc: 'Natural, expressive voices' },
  { id: 'kokoro', label: 'Kokoro TTS', desc: 'Fast, lightweight' },
]

// Estimate character count from file
async function estimateChars(file: File): Promise<number> {
  const text = await file.text()
  return text.length
}

export default function ConverterPage() {
  const supabase = createClient()
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [estimatedChars, setEstimatedChars] = useState<number>(0)
  const [voice, setVoice] = useState('eleven_multilingual_v2')
  const [voiceGender, setVoiceGender] = useState('any')
  const [ttsEngine, setTtsEngine] = useState('elevenlabs')
  const [rate, setRate] = useState(1) // playback speed multiplier: 0.5, 1, 1.5, 2
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [conversion, setConversion] = useState<ConversionStatus | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [apiKeyNeeded, setApiKeyNeeded] = useState(false)
  const [error, setError] = useState('')
  const [formatError, setFormatError] = useState('')
  const [sizeError, setSizeError] = useState('')
  const [plan, setPlan] = useState<string>('free')
  const [planLimit, setPlanLimit] = useState(10000)
  const [charactersUsed, setCharactersUsed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [voiceLabOpen, setVoiceLabOpen] = useState(false)
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([])
  const [cloneAudio, setCloneAudio] = useState<File | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [cloneSuccess, setCloneSuccess] = useState('')
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropHappenedRef = useRef(false)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('plan, elevenlabs_api_key, characters_used').eq('id', data.user.id).single().then(({ data: profile }) => {
          if (profile) {
            const limits: Record<string, number> = { free: 10000, pro: 100000, business: 500000 }
            setPlan(profile.plan || 'free')
            setPlanLimit(limits[profile.plan || 'free'] || 10000)
            setCharactersUsed(profile.characters_used || 0)
            if (!profile.elevenlabs_api_key && profile.plan !== 'free') {
              setApiKeyNeeded(true)
            }
          }
        })
      }
    })
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Load cloned voices when Voice Lab opens
  useEffect(() => {
    if (!voiceLabOpen || !user) return
    fetch('/api/voices')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setClonedVoices(data) })
      .catch(() => {})
  }, [voiceLabOpen, user])

  // Estimate chars when file changes
  useEffect(() => {
    if (!file) { setEstimatedChars(0); return }
    estimateChars(file).then(setEstimatedChars).catch(() => setEstimatedChars(0))
  }, [file])

  const pollConversion = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/conversions/${jobId}`)
    if (!res.ok) return
    const data: ConversionStatus = await res.json()
    setConversion(data)
    if (data.status === 'completed' || data.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current)
      setConverting(false)
    }
  }, [])

  const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB
  const ALLOWED_EXTENSIONS = ['.pdf', '.epub', '.txt']
  const ALLOWED_MIME_TYPES = ['application/pdf', 'application/epub+zip', 'text/plain']

  function validateFile(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return `不支援的格式「${ext}」，目前支援：PDF、EPUB、TXT`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `檔案太大（${(file.size / 1024 / 1024).toFixed(2)} MB），最大限制 4MB`
    }
    return null
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormatError('')
    setSizeError('')
    const f = e.target.files?.[0]
    if (f) {
      const validationError = validateFile(f)
      if (validationError) {
        if (validationError.includes('格式')) setFormatError(validationError)
        else setSizeError(validationError)
        setFile(null)
        setEstimatedChars(0)
        return
      }
      setFile(f)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setDragging(false)
    setFormatError('')
    setSizeError('')
    dropHappenedRef.current = true
    setTimeout(() => { dropHappenedRef.current = false }, 300)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const f = files[0]
      const validationError = validateFile(f)
      if (validationError) {
        if (validationError.includes('格式')) setFormatError(validationError)
        else setSizeError(validationError)
        setFile(null)
        setEstimatedChars(0)
        return
      }
      setFile(f)
    }
  }

  const remainingChars = planLimit - charactersUsed
  const willExceed = estimatedChars > remainingChars

  const handleConvert = async () => {
    if (!file || !user) return
    setError('')
    setFormatError('')
    setSizeError('')
    setConversion(null)
    setConverting(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('voice', voice)
    formData.append('voice_gender', voiceGender)
    formData.append('tts_engine', ttsEngine)
    formData.append('rate', String(rate))

    try {
      const res = await fetch('/api/conversions', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Conversion failed')

      setConversion({ ...data, status: 'queued', progress: 3, message: 'Queued...' })
      pollRef.current = setInterval(() => pollConversion(data.id), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Conversion failed')
      setConverting(false)
    }
  }

  const handlePreview = async () => {
    if (!previewText || previewing) return
    setPreviewing(true)
    // Use Web Speech API (works for all tiers)
    const utterance = new SpeechSynthesisUtterance(previewText)
    utterance.lang = voice.includes('english') ? 'en-US' : voice.includes('multilingual') ? 'zh-CN' : 'en-US'
    utterance.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    utterance.onend = () => setPreviewing(false)
    utterance.onerror = () => setPreviewing(false)
  }

  const selectedVoiceLabel = VOICES.find(v => v.id === voice)?.label || voice
  const genderLabel = voiceGender === 'any' ? '' : voiceGender === 'male' ? 'Male' : 'Female'
  const engineLabel = TTS_ENGINES.find(e => e.id === ttsEngine)?.label || 'ElevenLabs'

  return (
    <div className="min-h-screen bg-amber-50">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">

          {/* API Key Warning */}
          {apiKeyNeeded && (
            <div className="mb-6 p-4 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 text-sm flex items-start gap-3">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <strong>API key required for Pro/Business</strong>
                <p className="mt-1 text-amber-700">Add your ElevenLabs API key in{' '}
                  <Link href="/settings" className="underline">Settings</Link> to enable MP3 downloads.
                  Free tier uses browser TTS (preview only).
                </p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Converter</h1>
            <p className="text-stone-500 text-sm">Upload your ebook and convert to audiobook</p>
          </div>

          {/* File Upload */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">1. Upload Ebook</h2>
            <div
              role="button"
              tabIndex={0}
              aria-label="拖放或點擊上傳檔案"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; setDragging(true) }}
              onDragLeave={(e) => { e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false) }}
              onDrop={handleDrop}
              onClick={() => {
                if (dropHappenedRef.current) return
                setFormatError(''); setSizeError('')
                fileInputRef.current?.click()
              }}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragging ? 'border-amber-500 bg-amber-100' : 'border-amber-400 hover:border-amber-500 hover:bg-amber-50'}`}
            >
              <label htmlFor="ebook-file-input" className="cursor-pointer absolute inset-0" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }} />
              <input
                ref={fileInputRef}
                id="ebook-file-input"
                type="file"
                accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
                onChange={handleFileChange}
                aria-label="Upload ebook file"
                className="opacity-0 w-px h-px pointer-events-none"
                onClick={(e) => e.stopPropagation()}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div className="text-left">
                    <p className="font-medium animate-upload-success">{file.name}</p>
                    <p className="text-sm text-stone-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setEstimatedChars(0) }}
                    className="ml-4 text-stone-500 hover:text-red-600 transition-colors"
                    aria-label="移除檔案"
                    title="Remove file"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" x2="12" y1="3" y2="15"/>
                  </svg>
                  <p className="text-stone-500 mb-1">Drop EPUB, PDF, or TXT here</p>
                  <p className="text-xs text-zinc-600">or click to browse</p>
                </>
              )}
            </div>

            {/* Format Error */}
            {formatError && (
              <div className="mt-3 p-3 rounded-lg bg-red-950/30 border border-red-800/30 text-red-600 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {formatError}
              </div>
            )}

            {/* Size Error */}
            {sizeError && (
              <div className="mt-3 p-3 rounded-lg bg-red-950/30 border border-red-800/30 text-red-600 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {sizeError}
              </div>
            )}

            {/* Character estimate */}
            {file && estimatedChars > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <div>
                  <span className="text-stone-500">Estimated characters: </span>
                  <span className={`font-medium ${willExceed ? 'text-red-600' : 'text-stone-800'}`}>
                    {estimatedChars.toLocaleString()}
                  </span>
                  {willExceed && (
                    <span className="ml-2 text-red-600 text-xs">
                      Exceeds remaining quota ({remainingChars.toLocaleString()} left)
                    </span>
                  )}
                </div>
                <div className="text-stone-500 text-xs">
                  {charactersUsed.toLocaleString()} / {planLimit.toLocaleString()} used this month
                </div>
              </div>
            )}
            {file && estimatedChars > 0 && !willExceed && (
              <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${Math.min(100, (estimatedChars / planLimit) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Voice & Settings */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">2. Voice & Settings</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {/* Voice Gender */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Voice Gender</label>
                <div className="flex gap-2">
                  {VOICE_GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setVoiceGender(g.id)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                        voiceGender === g.id
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TTS Engine */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">TTS Engine</label>
                <select
                  value={ttsEngine}
                  onChange={(e) => setTtsEngine(e.target.value)}
                  className="input-field"
                >
                  {TTS_ENGINES.map((e) => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
                <p className="text-xs text-stone-500 mt-1.5">
                  {TTS_ENGINES.find(e => e.id === ttsEngine)?.desc}
                </p>
              </div>

              {/* Speed Segmented Control */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Speed</label>
                <div className="flex rounded-lg border border-stone-300 overflow-hidden" role="group" aria-label="播放速度">
                  {[0.5, 1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setRate(speed)}
                      aria-label={`播放速度 ${speed}x`}
                      aria-pressed={rate === speed}
                      className={`flex-1 py-2 px-2 text-xs font-medium border-r last:border-r-0 border-stone-300 transition-all ${
                        rate === speed
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Select */}
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">AI Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="input-field"
                >
                  <optgroup label="ElevenLabs Built-in">
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </optgroup>
                  {clonedVoices.length > 0 && (
                    <optgroup label="My Cloned Voices">
                      {clonedVoices.map((v) => (
                        <option key={v.elevenlabs_voice_id} value={v.elevenlabs_voice_id}>{v.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {plan === 'free' && (
                  <p className="text-xs text-stone-500 mt-1.5">Free tier: browser TTS preview only</p>
                )}
                {plan !== 'free' && (
                  <p className="text-xs text-stone-500 mt-1.5">
                    {clonedVoices.some(v => v.elevenlabs_voice_id === voice)
                      ? 'Using your cloned voice'
                      : `${engineLabel} · ${genderLabel || 'Any gender'}`}
                  </p>
                )}
                {plan !== 'free' && (
                  <button
                    onClick={() => setVoiceLabOpen(o => !o)}
                    className="mt-2 text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                    {voiceLabOpen ? 'Hide' : 'Create'} Voice Clone
                  </button>
                )}
              </div>
            </div>

            {/* Preview — works for all tiers */}
            <div className="mt-4 pt-4 border-t border-stone-300">
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Preview with selected voice (Browser TTS)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Type something to hear..."
                  className="input-field flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePreview() }}
                />
                <button
                  onClick={handlePreview}
                  disabled={previewing || !previewText.trim()}
                  className="btn-secondary whitespace-nowrap"
                  aria-label={previewing ? '播放中' : '播放預覽'}
                >
                  {previewing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      Playing
                    </span>
                  ) : 'Play'}
                </button>
              </div>
              <p className="text-xs text-zinc-600 mt-1.5">
                {engineLabel} · {genderLabel || 'Any'} · Speed: {rate >= 0 ? '+' : ''}{rate}%
              </p>
            </div>
          </div>

          {/* Voice Lab */}
          {voiceLabOpen && plan !== 'free' && (
            <div className="card mb-6 border-amber-300">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                  Voice Lab — Create Your Clone
                </h2>
                <button onClick={() => setVoiceLabOpen(false)} className="text-stone-500 hover:text-stone-700">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <p className="text-sm text-stone-500 mb-4">
                Upload an audio sample (30s–5min) to clone your voice. Works best with clear, single-speaker audio.
              </p>

              {/* Clone Form */}
              <div className="space-y-3 mb-4">
                <div>
                  <label htmlFor="audio-sample-input" className="block text-xs font-medium text-stone-700 mb-1">Audio Sample</label>
                  <div
                    onClick={() => audioInputRef.current?.click()}
                    className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${cloneAudio ? 'border-amber-500 bg-amber-950/20' : 'border-stone-300 hover:border-stone-300'}`}
                  >
                    <label htmlFor="audio-sample-input" className="absolute inset-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); audioInputRef.current?.click() }}>
                    <input
                      id="audio-sample-input"
                      ref={audioInputRef}
                      type="file"
                      accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/m4a"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) { setCloneAudio(f); setCloneError('') }
                      }}
                      className="opacity-0 w-px h-px pointer-events-none"
                    />
                    </label>
                    {cloneAudio ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                        </svg>
                        <span className="text-sm text-stone-700">{cloneAudio.name}</span>
                        <span className="text-xs text-stone-500">({(cloneAudio.size / 1024 / 1024).toFixed(2)} MB)</span>
                      </div>
                    ) : (
                      <p className="text-sm text-stone-500">Click to upload · MP3, WAV, M4A</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Voice Name</label>
                  <input
                    type="text"
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    placeholder="e.g. My Voice, Dad's Voice"
                    maxLength={100}
                    className="input-field w-full"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!cloneAudio) { setCloneError('Please select an audio file'); return }
                    if (!cloneName.trim()) { setCloneError('Please enter a voice name'); return }
                    setCloneError(''); setCloneSuccess(''); setCloning(true)
                    const fd = new FormData()
                    fd.append('audio', cloneAudio)
                    fd.append('name', cloneName.trim())
                    try {
                      const res = await fetch('/api/voices/clone', { method: 'POST', body: fd })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || 'Clone failed')
                      setCloneSuccess(`Voice "${cloneName}" cloned successfully!`)
                      setCloneAudio(null); setCloneName('')
                      // Reload voices
                      const vr = await fetch('/api/voices')
                      const vd = await vr.json()
                      if (Array.isArray(vd)) { setClonedVoices(vd); setVoice(vd[0]?.elevenlabs_voice_id || voice) }
                    } catch (err: unknown) {
                      setCloneError(err instanceof Error ? err.message : 'Clone failed')
                    } finally { setCloning(false) }
                  }}
                  disabled={cloning || !cloneAudio || !cloneName.trim()}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {cloning ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating clone...
                    </span>
                  ) : 'Clone My Voice'}
                </button>
                {cloneError && <p className="text-xs text-red-600">{cloneError}</p>}
                {cloneSuccess && <p className="text-xs text-green-400">{cloneSuccess}</p>}
              </div>

              {/* Cloned Voices List */}
              {clonedVoices.length > 0 && (
                <div className="border-t border-stone-300 pt-4">
                  <p className="text-xs font-medium text-stone-500 mb-3">My Cloned Voices ({clonedVoices.length})</p>
                  <div className="space-y-2">
                    {clonedVoices.map((v) => (
                      <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-stone-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-stone-500 font-mono">CLONE</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{v.name}</p>
                            <p className="text-xs text-stone-500">
                              {new Date(v.created_at).toLocaleDateString()}
                              {v.audio_sample_url && (
                                <a href={v.audio_sample_url} target="_blank" rel="noreferrer" className="ml-2 text-amber-400 hover:underline" aria-label={`播放${v.name}範例`}>Play sample</a>
                              )}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${v.name}"? This cannot be undone.`)) return
                            try {
                              await fetch(`/api/voices/${v.id}`, { method: 'DELETE' })
                              setClonedVoices(prev => prev.filter(x => x.id !== v.id))
                              if (voice === v.elevenlabs_voice_id) setVoice('eleven_multilingual_v2')
                            } catch { alert('Delete failed') }
                          }}
                          className="text-stone-500 hover:text-red-600 ml-2 flex-shrink-0"
                          title="Delete voice"
                          aria-label={`刪除語音克隆${v.name}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/30 border border-red-800/30 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Convert Button */}
          {!conversion && (
            <button
              onClick={handleConvert}
              disabled={!file || converting || willExceed}
              className="btn-primary w-full justify-center py-3 text-base mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Convert to audiobook"
            >
              {converting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting conversion...
                </span>
              ) : !file ? (
                'Select a file to convert'
              ) : willExceed ? (
                'Character limit exceeded'
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" x2="12" y1="3" y2="15"/>
                  </svg>
                  Convert to Audiobook
                </span>
              )}
            </button>
          )}

          {/* Progress */}
          {conversion && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Conversion Progress</h2>
                <span className={`badge ${
                  conversion.status === 'completed' ? 'badge-pro' :
                  conversion.status === 'failed' ? 'bg-red-900/50 text-red-300 border border-red-700/50' :
                  'bg-blue-100 text-blue-700 border border-blue-200'
                }`}>
                  {conversion.status}
                </span>
              </div>

              {conversion.status !== 'completed' && conversion.status !== 'failed' && (
                <>
                  {/* SVG Progress Ring + Progress Bar */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="relative w-12 h-12 flex-shrink-0">
                      <svg className="w-12 h-12 progress-ring-spin" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="#E7E5E4" strokeWidth="4"/>
                        <circle
                          cx="24" cy="24" r="20" fill="none"
                          stroke="#F59E0B" strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray="125.6"
                          strokeDashoffset={125.6 * (1 - conversion.progress / 100)}
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-stone-700">
                        {conversion.progress}%
                      </span>
                    </div>
                    <div className="flex-1">
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-label="轉換進度"
                        aria-valuenow={conversion.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="progress-bar-fill" style={{ width: `${conversion.progress}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-stone-600">
                    {conversion.message?.includes('片段')
                      ? conversion.message
                      : conversion.message?.includes('章節') || conversion.message?.includes('Chapter')
                        ? conversion.message
                        : `${conversion.progress}%`}
                  </p>
                  {/* Fragment N/M display */}
                  {conversion.message && (() => {
                    const match = conversion.message.match(/第\s*(\d+)\s*\/\s*(\d+)\s*片段|片段\s*(\d+)\s*\/\s*(\d+)|chunk\s*(\d+)\s*\/\s*(\d+)/i)
                    if (match) {
                      const current = match[1] || match[3] || match[5]
                      const total = match[2] || match[4] || match[6]
                      return <p className="text-xs text-amber-600 font-medium mt-1">第 {current} / {total} 片段</p>
                    }
                    return null
                  })()}
                </>
              )}

              {conversion.status === 'failed' && (
                <div>
                  <p className="text-sm text-red-600 mb-3">
                    {conversion.error || 'Conversion failed. Please try again.'}
                  </p>
                  <button
                    onClick={() => setConversion(null)}
                    className="btn-secondary text-sm"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {conversion.status === 'completed' && (
                <div className="space-y-5">
                  {/* Summary */}
                  <div className="flex gap-4">
                    <div className="flex-1 p-3 rounded-lg bg-stone-100">
                      <p className="text-xs text-stone-500">Title</p>
                      <p className="font-medium text-sm">{conversion.title}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-stone-100">
                      <p className="text-xs text-stone-500">Characters</p>
                      <p className="font-medium text-sm">{conversion.character_count?.toLocaleString()}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-stone-100">
                      <p className="text-xs text-stone-500">Chapters</p>
                      <p className="font-medium text-sm">{conversion.chapter_count}</p>
                    </div>
                  </div>

                  {/* Audio Player */}
                  {conversion.audio_url ? (
                    <div role="region" aria-label="音訊播放器">
                      <p className="text-sm font-medium mb-3">Full Audiobook</p>
                      <audio
                        controls
                        className="w-full h-10 rounded-lg"
                        src={conversion.audio_url}
                        aria-label="有聲書播放器"
                      >
                        Your browser does not support audio playback.
                      </audio>
                      <div className="flex gap-3 mt-3">
                        <a href={conversion.audio_url} download className="btn-primary text-sm" aria-label="下載完整有聲書">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" x2="12" y1="15" y2="3"/>
                          </svg>
                          Download Full Audiobook
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <div>
                          <p className="text-amber-700 font-medium text-sm">No audio generated</p>
                          <p className="text-amber-600 text-xs mt-1">
                            {plan === 'free'
                              ? 'Free tier records conversions but does not generate audio. Upgrade to Pro/Business and add your ElevenLabs API key to get MP3 downloads.'
                              : 'Add your ElevenLabs API key in Settings to enable audio generation.'}
                          </p>
                          {plan === 'free' && (
                            <Link href="/pricing" className="inline-flex items-center gap-1 mt-2 text-xs text-amber-600 hover:text-amber-700">
                              View plans →
                            </Link>
                          )}
                          {plan !== 'free' && (
                            <Link href="/settings" className="inline-flex items-center gap-1 mt-2 text-xs text-amber-600 hover:text-amber-700">
                              Add API key in Settings →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chapter Audios */}
                  {conversion.chapter_audios && conversion.chapter_audios.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-3">
                        Individual Chapters ({conversion.chapter_audios.length})
                      </p>
                      <div className="space-y-2">
                        {conversion.chapter_audios.map((ch) => (
                          <div key={ch.index} className="flex items-center justify-between p-3 rounded-lg bg-stone-100">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs text-zinc-600 font-mono w-6 flex-shrink-0">{ch.index}</span>
                              <span className="text-sm truncate">{ch.title}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <audio
                                controls
                                className="h-8 w-48"
                                src={ch.url}
                              >
                                <source src={ch.url} type="audio/mpeg" />
                              </audio>
                              <a href={ch.url} download className="btn-secondary text-xs py-1.5 px-3" aria-label={`下載第${ch.index}章`}>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="7 10 12 15 17 10"/>
                                  <line x1="12" x2="12" y1="15" y2="3"/>
                                </svg>
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New conversion */}
                  <button
                    onClick={() => setConversion(null)}
                    className="btn-secondary text-sm w-full justify-center"
                    aria-label="轉換另一本書"
                  >
                    Convert Another Book
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
