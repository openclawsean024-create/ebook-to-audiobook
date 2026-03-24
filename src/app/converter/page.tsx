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

const VOICES = [
  { id: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2 (Recommended)' },
  { id: 'eleven_english_v2', label: 'Eleven English v2' },
  { id: 'eleven_monolingual_v2', label: 'Eleven Monolingual v2' },
]

export default function ConverterPage() {
  const supabase = createClient()
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [voice, setVoice] = useState('eleven_multilingual_v2')
  const [rate, setRate] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [conversion, setConversion] = useState<ConversionStatus | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [apiKeyNeeded, setApiKeyNeeded] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<string>('free')
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('plan, elevenlabs_api_key').eq('id', data.user.id).single().then(({ data: profile }) => {
          if (profile) {
            setPlan(profile.plan || 'free')
            if (!profile.elevenlabs_api_key && profile.plan !== 'free') {
              setApiKeyNeeded(true)
            }
          }
        })
      }
    })
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

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
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleConvert = async () => {
    if (!file || !user) return
    setError('')
    setConversion(null)
    setConverting(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('voice', voice)
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
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return

    const { data: profile } = await supabase.from('profiles').select('elevenlabs_api_key').eq('id', u.id).single()
    const key = profile?.elevenlabs_api_key

    if (!key) {
      // Use Web Speech API
      const utterance = new SpeechSynthesisUtterance(previewText)
      utterance.lang = 'en-US'
      window.speechSynthesis.speak(utterance)
      setPreviewing(false)
      return
    }

    // Use ElevenLabs
    const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: previewText, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { setPreviewing(false); URL.revokeObjectURL(url) }
      audio.play()
    } else {
      setPreviewing(false)
    }
  }

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
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
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
          </div>

          {/* Voice & Settings */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">2. Voice & Settings</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">AI Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="input-field"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
                {plan === 'free' && (
                  <p className="text-xs text-zinc-500 mt-1.5">Free tier uses browser TTS</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Speed: +{rate}%</label>
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
                  <span>Faster</span>
                </div>
              </div>
            </div>

            {/* Preview */}
            {plan === 'free' && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Preview (Browser TTS)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Type something to hear..."
                    className="input-field flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                  />
                  <button onClick={handlePreview} disabled={previewing || !previewText} className="btn-secondary">
                    {previewing ? '...' : 'Play'}
                  </button>
                </div>
              </div>
            )}
          </div>

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
              disabled={!file || converting}
              className="btn-primary w-full justify-center py-3 text-base mb-6"
            >
              {converting ? 'Starting conversion...' : 'Convert to Audiobook'}
            </button>
          )}

          {/* Progress */}
          {conversion && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Conversion Progress</h2>
                <span className={`badge ${conversion.status === 'completed' ? 'badge-pro' : conversion.status === 'failed' ? 'bg-red-900/50 text-red-300 border border-red-700/50' : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'}`}>
                  {conversion.status}
                </span>
              </div>

              <div className="progress-bar mb-3">
                <div className="progress-bar-fill" style={{ width: `${conversion.progress}%` }}></div>
              </div>

              <p className="text-sm text-zinc-400 mb-4">{conversion.message}</p>

              {conversion.status === 'failed' && conversion.error && (
                <p className="text-sm text-red-400 mb-4">Error: {conversion.error}</p>
              )}

              {conversion.status === 'completed' && (
                <div className="space-y-4">
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

                  {conversion.audio_url && (
                    <div className="flex gap-3">
                      <a href={conversion.audio_url} className="btn-primary text-sm">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" x2="12" y1="15" y2="3"/>
                        </svg>
                        Download Full Audiobook
                      </a>
                    </div>
                  )}

                  {conversion.chapter_audios && conversion.chapter_audios.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-3">Individual Chapters</p>
                      <div className="space-y-2">
                        {conversion.chapter_audios.map((ch) => (
                          <div key={ch.index} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                            <span className="text-sm">{ch.title}</span>
                            <a href={ch.url} className="btn-secondary text-xs py-1.5 px-3">
                              Download
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
