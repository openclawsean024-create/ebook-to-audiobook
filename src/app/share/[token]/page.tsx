'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

type ChapterAudio = { title: string; url: string; index: number }

type SharedConversion = {
  id: string
  title: string
  status: string
  audio_url?: string
  chapter_audios?: ChapterAudio[]
  character_count?: number
  chapter_count?: number
  voice?: string
}

export default function SharePage() {
  const params = useParams()
  const token = params.token as string
  const supabase = createClient()

  const [conversion, setConversion] = useState<SharedConversion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentChapter, setCurrentChapter] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!token) return
    // Use public endpoint that doesn't require auth
    fetch(`/api/shared/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setConversion(data)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [token])

  const chapters: ChapterAudio[] = conversion?.chapter_audios || []
  const hasAudio = chapters.length > 0 || !!conversion?.audio_url
  const currentSrc = chapters[currentChapter]?.url || conversion?.audio_url || ''

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) { audio.pause(); setIsPlaying(false) }
    else { audio.play(); setIsPlaying(true) }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (audio) { setCurrentTime(audio.currentTime); setDuration(audio.duration || 0) }
  }

  const handleEnded = () => {
    if (currentChapter < chapters.length - 1) {
      setCurrentChapter(c => c + 1)
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
    setCurrentTime(audio.currentTime)
  }

  const skip = (secs: number) => {
    const audio = audioRef.current
    if (audio) { audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + secs)) }
  }

  const handleRateChange = (rate: number) => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = rate
    setPlaybackRate(rate)
  }

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !conversion) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-16 h-16 text-zinc-700 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <p className="text-red-400 mb-4">{error || 'Audiobook not found'}</p>
            <Link href="/" className="btn-secondary">Go to Homepage</Link>
          </div>
        </div>
      </div>
    )
  }

  if (conversion.status !== 'completed' || !hasAudio) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-16 h-16 text-zinc-700 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <p className="text-zinc-400 mb-2">This audiobook is not available yet.</p>
            <p className="text-zinc-600 text-sm mb-6">Status: {conversion.status}</p>
            <Link href="/" className="btn-secondary">Go to Homepage</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <audio
        ref={audioRef}
        src={currentSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { const a = audioRef.current; if (a) { setDuration(a.duration); setCurrentTime(a.currentTime) } }}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        key={currentSrc}
      />

      <div className="pt-24 pb-16 px-6">
        <div className="max-w-2xl mx-auto">

          {/* Shared badge */}
          <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
            <svg className="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Shared Audiobook · No sign-up required
          </div>

          {/* Header */}
          <div className="mb-2">
            <h1 className="text-2xl font-bold truncate">{conversion.title || 'Audiobook'}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {chapters.length > 0 ? `${chapters.length} chapters` : 'Full audiobook'}
              {conversion.character_count ? ` · ${conversion.character_count.toLocaleString()} characters` : ''}
            </p>
          </div>

          {/* Player Card */}
          <div className="card mt-6">
            {/* Chapter selector */}
            {chapters.length > 0 && (
              <div className="mb-4">
                <select
                  value={currentChapter}
                  onChange={(e) => {
                    const idx = Number(e.target.value)
                    setCurrentChapter(idx)
                    setIsPlaying(false)
                  }}
                  className="input-field text-sm"
                >
                  <option value={-1}>Full Audiobook</option>
                  {chapters.map((ch, i) => (
                    <option key={ch.index} value={i}>Chapter {ch.index}: {ch.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Progress */}
            <div className="mb-3">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full accent-violet-600 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <button onClick={() => skip(-10)} className="text-zinc-400 hover:text-white transition-colors p-2" title="-10s">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.87"/>
                  <text x="8" y="15" fontSize="6" fill="currentColor" stroke="none">10</text>
                </svg>
              </button>
              <button onClick={() => skip(-5)} className="text-zinc-400 hover:text-white transition-colors p-2" title="-5s">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>
                </svg>
              </button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 flex items-center justify-center transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-1" viewBox="0 0 24 24" fill="white">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                )}
              </button>
              <button onClick={() => skip(5)} className="text-zinc-400 hover:text-white transition-colors p-2" title="+5s">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>
                </svg>
              </button>
              <button onClick={() => skip(10)} className="text-zinc-400 hover:text-white transition-colors p-2" title="+10s">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.87"/>
                  <text x="14" y="15" fontSize="6" fill="currentColor" stroke="none">10</text>
                </svg>
              </button>
            </div>

            {/* Speed */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-xs text-zinc-500">Speed:</span>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    playbackRate === rate
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Download */}
            {conversion.audio_url && (
              <div className="border-t border-zinc-800 pt-4 flex gap-3">
                <a href={conversion.audio_url} download className="btn-primary text-sm flex-1 justify-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" x2="12" y1="15" y2="3"/>
                  </svg>
                  Download Audiobook
                </a>
                <Link href="/pricing" className="btn-secondary text-sm">
                  Create Your Own →
                </Link>
              </div>
            )}
          </div>

          {/* Chapter list */}
          {chapters.length > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold mb-3">All Chapters</h2>
              <div className="space-y-2">
                {chapters.map((ch, i) => (
                  <button
                    key={ch.index}
                    onClick={() => { setCurrentChapter(i); setIsPlaying(true) }}
                    className={`card w-full flex items-center gap-3 py-3 transition-colors text-left ${
                      currentChapter === i ? 'border-violet-700 bg-violet-950/20' : 'hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                      currentChapter === i ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {ch.index}
                    </div>
                    <span className="flex-1 text-sm truncate">{ch.title}</span>
                    {currentChapter === i && isPlaying && (
                      <span className="flex items-center gap-1 text-violet-400 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                        Playing
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-8 text-center">
            <p className="text-zinc-500 text-sm mb-3">Listen to any ebook as an audiobook</p>
            <Link href="/converter" className="btn-primary">
              Convert Your Own Ebook →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
