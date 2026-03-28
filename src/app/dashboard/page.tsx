'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

const PLAN_LIMITS: Record<string, number> = { free: 10000, pro: 100000, business: 500000 }

type Conversion = {
  id: string
  title: string
  status: string
  file_type: string
  character_count: number
  chapter_count: number
  created_at: string
  audio_url?: string
  chapter_audios?: Array<{ title: string; url: string; index: number }>
  voice?: string
  progress?: number
  message?: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<{ plan?: string; characters_used?: number } | null>(null)
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (!user) { setLoading(false); return }

      const [{ data: profileData }, { data: conversionsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('conversions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])

      setProfile(profileData)
      setConversions((conversionsData as Conversion[]) || [])
      setLoading(false)
    }
    loadData()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this conversion? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/conversions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConversions(prev => prev.filter(c => c.id !== id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  const planLimit = PLAN_LIMITS[profile?.plan || 'free']
  const usagePercent = profile ? Math.min(100, Math.round((profile.characters_used || 0) / planLimit * 100)) : 0

  const statusColors: Record<string, string> = {
    queued: 'text-yellow-400',
    processing: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  }

  const completedCount = conversions.filter(c => c.status === 'completed').length
  const failedCount = conversions.filter(c => c.status === 'failed').length

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <div className="pt-24 pb-16 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-32 bg-zinc-800 rounded" />
              <div className="h-24 bg-zinc-900 rounded-xl" />
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map(i => <div key={i} className="h-20 bg-zinc-900 rounded-xl" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <div className="pt-24 pb-16 px-6 flex items-center justify-center">
          <div className="text-center">
            <p className="text-zinc-400 mb-4">Please sign in to view your dashboard.</p>
            <Link href="/login" className="btn-primary">Sign In</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
            <p className="text-zinc-400 text-sm">{user.email}</p>
          </div>

          {/* Usage Card */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Monthly Usage</h2>
                <p className="text-sm text-zinc-400">
                  {profile ? `${(profile.characters_used || 0).toLocaleString()} / ${planLimit.toLocaleString()} characters` : 'Loading...'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${
                  profile?.plan === 'business' ? 'badge-business' :
                  profile?.plan === 'pro' ? 'badge-pro' : 'badge-free'
                }`}>
                  {(profile?.plan || 'free').toUpperCase()}
                </span>
                <Link href="/pricing" className="text-xs text-violet-400 hover:text-violet-300">
                  {profile?.plan === 'free' ? 'Upgrade →' : 'Change plan →'}
                </Link>
              </div>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-bar-fill ${usagePercent >= 80 ? 'bg-amber-500' : ''}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            {usagePercent >= 80 && (
              <p className="text-xs text-amber-400 mt-2">
                ⚠️ You've used {usagePercent}% of your monthly limit.{' '}
                <Link href="/pricing" className="underline">Upgrade plan →</Link>
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Total</p>
              <p className="text-3xl font-bold">{conversions.length}</p>
            </div>
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-400">{completedCount}</p>
            </div>
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Failed</p>
              <p className="text-3xl font-bold text-red-400">{failedCount}</p>
            </div>
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Characters Used</p>
              <p className="text-3xl font-bold">{(profile?.characters_used || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-4 mb-8">
            <Link href="/converter" className="btn-primary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" x2="12" y1="3" y2="15"/>
              </svg>
              New Conversion
            </Link>
            <Link href="/settings" className="btn-secondary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </Link>
          </div>

          {/* Recent Conversions */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Conversions</h2>
              {conversions.length > 0 && (
                <span className="text-xs text-zinc-500">{conversions.length} total</span>
              )}
            </div>

            {conversions.length === 0 ? (
              <div className="card text-center py-12">
                <svg className="w-12 h-12 text-zinc-700 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" x2="12" y1="3" y2="15"/>
                </svg>
                <p className="text-zinc-500 mb-4">No conversions yet</p>
                <Link href="/converter" className="btn-primary">
                  Start your first conversion
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {conversions.map((conv) => (
                  <div key={conv.id} className="card py-0">
                    {/* Row header */}
                    <div className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-mono uppercase flex-shrink-0">
                          {conv.file_type || 'FILE'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{conv.title || 'Untitled'}</p>
                          <p className="text-xs text-zinc-500">
                            {new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' · '}{(conv.character_count || 0).toLocaleString()} chars
                            {' · '}{conv.chapter_count || 0} chapters
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-sm font-medium ${statusColors[conv.status] || 'text-zinc-400'}`}>
                          {conv.status}
                        </span>

                        {/* Inline audio expand toggle */}
                        {conv.status === 'completed' && conv.audio_url && (
                          <button
                            onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                            className="btn-ghost text-xs py-1 px-2"
                          >
                            {expandedId === conv.id ? '▲ Hide' : '▶ Play'}
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(conv.id)}
                          disabled={deletingId === conv.id}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                          title="Delete conversion"
                        >
                          {deletingId === conv.id ? (
                            <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin inline-block" />
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded player */}
                    {expandedId === conv.id && conv.audio_url && (
                      <div className="border-t border-zinc-800 pt-4 pb-2 space-y-3">
                        <audio controls className="w-full h-10" src={conv.audio_url}>
                          Your browser does not support audio.
                        </audio>
                        <div className="flex gap-3">
                          <a href={conv.audio_url} download className="btn-primary text-xs py-1.5">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" x2="12" y1="15" y2="3"/>
                            </svg>
                            Download
                          </a>
                          <Link href={`/player/${conv.id}`} className="btn-secondary text-xs py-1.5">
                            Full Player
                          </Link>
                        </div>

                        {/* Chapter list */}
                        {conv.chapter_audios && conv.chapter_audios.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider">Chapters</p>
                            {conv.chapter_audios.map((ch) => (
                              <div key={ch.index} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/30">
                                <span className="text-xs text-zinc-600 font-mono w-5">{ch.index}</span>
                                <span className="text-xs flex-1 truncate">{ch.title}</span>
                                <audio
                                  controls
                                  className="h-6 w-32"
                                  src={ch.url}
                                />
                                <a href={ch.url} download className="text-zinc-500 hover:text-violet-400">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" x2="12" y1="15" y2="3"/>
                                  </svg>
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Processing indicator */}
                    {conv.status === 'processing' && typeof conv.progress === 'number' && (
                      <div className="border-t border-zinc-800 pt-3 pb-1">
                        <div className="flex justify-between text-xs text-zinc-500 mb-1">
                          <span>{conv.message || 'Processing...'}</span>
                          <span>{conv.progress}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-bar-fill" style={{ width: `${conv.progress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
