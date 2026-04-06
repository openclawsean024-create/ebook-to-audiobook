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
  const [rate, setRate] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [conversion, setConversion] = useState<ConversionStatus | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [apiKeyNeeded, setApiKeyNeeded] = useState(false)
  const [error, setError] = useState('')
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setDragging(false)
    dropHappenedRef.current = true
    setTimeout(() => { dropHappenedRef.current = false }, 300)
    const items = e.dataTransfer.items
    if (items && items.length > 0) {
      const item = items[0]
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) setFile(f)
      }
    } else {
      const f = e.dataTransfer.files[0]
      if (f) setFile(f)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const remainingChars = planLimit - charactersUsed
  const willExceed = estimatedChars > remainingChars

  const handleConvert = async () => {
    if (!file || !user) return
    setError('')
    setConversion(null)
    setConverting(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('voice', voice)
    formData.append('voice_gender', voiceGender)
    formData.append('tts_engine', ttsEngine)
    formData.append('rate', `+${rate}%`)

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
    utterance.rate = 1 + rate / 100
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    utterance.onend = () => setPreviewing(false)
    utterance.onerror = () => setPreviewing(false)
  }

  const selectedVoiceLabel = VOICES.find(v => v.id === voice)?.label || voice
  const genderLabel = voiceGender === 'any' ? '' : voiceGender === 'male' ? 'Male' : 'Female'
  const engineLabel = TTS_ENGINES.find(e => e.id === ttsEngine)?.label || 'ElevenLabs'

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">

          {/* API Key Warning */}
          {apiKeyNeeded && (
            <div className="mb-6 p-4 rounded-xl bg-amber-950/30 border border-amber-800/30 text-amber-300 text-sm flex items-start gap-3">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <strong>API key required for Pro/Business</strong>
                <p className="mt-1 text-amber-400/80">Add your ElevenLabs API key in{' '}
                  <Link href="/settings" className="underline">Settings</Link> to enable MP3 downloads.
                  Free tier uses browser TTS (preview only).
                </p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Converter</h1>
            <p className="text-zinc-400 text-sm">Upload your ebook and convert to audiobook</p>
          </div>

          {/* File Upload */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">1. Upload Ebook</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; setDragging(true) }}
              onDragLeave={(e) => { e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false) }}
              onDrop={handleDrop}
              onClick={() => {
                // Prevent file picker from opening after a file drop (spurious click on some browsers)
                if (dropHappenedRef.current) return
                fileInputRef.current?.click()
              }}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragging ? 'border-violet-500 bg-violet-950/20' : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/30'}`}
            >
              <input ref={fileInputRef} type="file" accept=".epub,.txt" onChange={handleFileChange} className="hidden" />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-8 h-8 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setEstimatedChars(0) }}
                    className="ml-4 text-zinc-500 hover:text-red-400 transition-colors"
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
                  <p className="text-zinc-500 mb-1">Drop EPUB or TXT here</p>
                  <p className="text-xs text-zinc-600">or click to browse</p>
                </>
              )}
            </div>

            {/* Character estimate */}
            {file && estimatedChars > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <div>
                  <span className="text-zinc-400">Estimated characters: </span>
                  <span className={`font-medium ${willExceed ? 'text-red-400' : 'text-zinc-200'}`}>
                    {estimatedChars.toLocaleString()}
                  </span>
                  {willExceed && (
                    <span className="ml-2 text-red-400 text-xs">
                      Exceeds remaining quota ({remainingChars.toLocaleString()} left)
                    </span>
                  )}
                </div>
                <div className="text-zinc-500 text-xs">
                  {charactersUsed.toLocaleString()} / {planLimit.toLocaleString()} used this month
                </div>
              </div>
            )}
            {file && estimatedChars > 0 && !willExceed && (
              <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-600 rounded-full"
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
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Voice Gender</label>
                <div className="flex gap-2">
                  {VOICE_GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setVoiceGender(g.id)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                        voiceGender === g.id
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TTS Engine */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">TTS Engine</label>
                <select
                  value={ttsEngine}
                  onChange={(e) => setTtsEngine(e.target.value)}
                  className="input-field"
                >
                  {TTS_ENGINES.map((e) => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1.5">
                  {TTS_ENGINES.find(e => e.id === ttsEngine)?.desc}
                </p>
              </div>

              {/* Speed */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Speed: {rate >= 0 ? '+' : ''}{rate}%</label>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full accent-violet-600"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>Slower</span>
                  <span>Normal</span>
                  <span>Faster</span>
                </div>
              </div>
            </div>

            {/* Voice Select */}
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">AI Voice</label>
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
                  <p className="text-xs text-zinc-500 mt-1.5">Free tier: browser TTS preview only</p>
                )}
                {plan !== 'free' && (
                  <p className="text-xs text-zinc-500 mt-1.5">
                    {clonedVoices.some(v => v.elevenlabs_voice_id === voice)
                      ? 'Using your cloned voice'
                      : `${engineLabel} · ${genderLabel || 'Any gender'}`}
                  </p>
                )}
                {plan !== 'free' && (
                  <button
                    onClick={() => setVoiceLabOpen(o => !o)}
                    className="mt-2 text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
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
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
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
            <div className="card mb-6 border-violet-800/30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                  Voice Lab — Create Your Clone
                </h2>
                <button onClick={() => setVoiceLabOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <p className="text-sm text-zinc-400 mb-4">
                Upload an audio sample (30s–5min) to clone your voice. Works best with clear, single-speaker audio.
              </p>

              {/* Clone Form */}
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Audio Sample</label>
                  <div
                    onClick={() => audioInputRef.current?.click()}
                    className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${cloneAudio ? 'border-violet-500 bg-violet-950/20' : 'border-zinc-700 hover:border-zinc-600'}`}
                  >
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/m4a"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) { setCloneAudio(f); setCloneError('') }
                      }}
                      className="hidden"
                    />
                    {cloneAudio ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                        </svg>
                        <span className="text-sm text-zinc-300">{cloneAudio.name}</span>
                        <span className="text-xs text-zinc-500">({(cloneAudio.size / 1024 / 1024).toFixed(2)} MB)</span>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500">Click to upload · MP3, WAV, M4A</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Voice Name</label>
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
                {cloneError && <p className="text-xs text-red-400">{cloneError}</p>}
                {cloneSuccess && <p className="text-xs text-green-400">{cloneSuccess}</p>}
              </div>

              {/* Cloned Voices List */}
              {clonedVoices.length > 0 && (
                <div className="border-t border-zinc-800 pt-4">
                  <p className="text-xs font-medium text-zinc-400 mb-3">My Cloned Voices ({clonedVoices.length})</p>
                  <div className="space-y-2">
                    {clonedVoices.map((v) => (
                      <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-zinc-500 font-mono">CLONE</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{v.name}</p>
                            <p className="text-xs text-zinc-500">
                              {new Date(v.created_at).toLocaleDateString()}
                              {v.audio_sample_url && (
                                <a href={v.audio_sample_url} target="_blank" rel="noreferrer" className="ml-2 text-violet-400 hover:underline">Play sample</a>
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
                          className="text-zinc-500 hover:text-red-400 ml-2 flex-shrink-0"
                          title="Delete voice"
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
            <div className="mb-6 p-4 rounded-xl bg-red-950/30 border border-red-800/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Convert Button */}
          {!conversion && (
            <button
              onClick={handleConvert}
              disabled={!file || converting || willExceed}
              className="btn-primary w-full justify-center py-3 text-base mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                }`}>
                  {conversion.status}
                </span>
              </div>

              {conversion.status !== 'completed' && conversion.status !== 'failed' && (
                <>
                  <div className="progress-bar mb-3">
                    <div className="progress-bar-fill" style={{ width: `${conversion.progress}%` }}></div>
                  </div>
                  <p className="text-sm text-zinc-400">{conversion.message}</p>
                </>
              )}

              {conversion.status === 'failed' && (
                <div>
                  <p className="text-sm text-red-400 mb-3">
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
                    <div className="flex-1 p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">Title</p>
                      <p className="font-medium text-sm">{conversion.title}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">Characters</p>
                      <p className="font-medium text-sm">{conversion.character_count?.toLocaleString()}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">Chapters</p>
                      <p className="font-medium text-sm">{conversion.chapter_count}</p>
                    </div>
                  </div>

                  {/* Audio Player */}
                  {conversion.audio_url ? (
                    <div>
                      <p className="text-sm font-medium mb-3">Full Audiobook</p>
                      <audio
                        controls
                        className="w-full h-10 rounded-lg"
                        src={conversion.audio_url}
                      >
                        Your browser does not support audio playback.
                      </audio>
                      <div className="flex gap-3 mt-3">
                        <a href={conversion.audio_url} download className="btn-primary text-sm">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" x2="12" y1="15" y2="3"/>
                          </svg>
                          Download Full Audiobook
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-800/30">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <div>
                          <p className="text-amber-300 font-medium text-sm">No audio generated</p>
                          <p className="text-amber-400/70 text-xs mt-1">
                            {plan === 'free'
                              ? 'Free tier records conversions but does not generate audio. Upgrade to Pro/Business and add your ElevenLabs API key to get MP3 downloads.'
                              : 'Add your ElevenLabs API key in Settings to enable audio generation.'}
                          </p>
                          {plan === 'free' && (
                            <Link href="/pricing" className="inline-flex items-center gap-1 mt-2 text-xs text-violet-400 hover:text-violet-300">
                              View plans →
                            </Link>
                          )}
                          {plan !== 'free' && (
                            <Link href="/settings" className="inline-flex items-center gap-1 mt-2 text-xs text-violet-400 hover:text-violet-300">
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
                          <div key={ch.index} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
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
                              <a href={ch.url} download className="btn-secondary text-xs py-1.5 px-3">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
