'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

export default function SettingsPage() {
  const supabase = createClient()
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    supabase.from('profiles').select('elevenlabs_api_key, plan').then(({ data }) => {
      if (data?.[0]?.elevenlabs_api_key) {
        setHasKey(true)
      }
    })
  }, [])

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      elevenlabs_api_key: apiKey,
    })

    if (error) {
      setError('Failed to save API key: ' + error.message)
    } else {
      setSaved(true)
      setHasKey(true)
      setApiKey('')
    }
    setLoading(false)
  }

  const handleDeleteKey = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({ elevenlabs_api_key: null }).eq('id', user.id)
    setHasKey(false)
    setSaved(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-flex items-center gap-1">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>

          {/* Account Info */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">Account</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Email</span>
                <span className="font-mono">{user?.email || '...'}</span>
              </div>
            </div>
          </div>

          {/* ElevenLabs API Key */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">ElevenLabs API Key</h2>
              {hasKey && (
                <span className="badge badge-pro">Configured</span>
              )}
            </div>

            <p className="text-sm text-zinc-400 mb-4">
              Bring your own ElevenLabs key for Pro/Business tier audio quality.
              Your key is encrypted and stored securely.{' '}
              <a href="https://elevenlabs.io/api" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">
                Get an API key →
              </a>
            </p>

            {hasKey ? (
              <div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-950/30 border border-green-800/30 text-green-400 text-sm mb-4">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  API key is configured and active
                </div>
                <button onClick={handleDeleteKey} className="btn-secondary text-sm">
                  Remove API Key
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveKey} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/50 text-red-400 text-sm">{error}</div>
                )}
                {saved && (
                  <div className="p-3 rounded-lg bg-green-950/50 border border-green-800/50 text-green-400 text-sm">
                    API key saved successfully!
                  </div>
                )}
                <div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="input-field font-mono text-sm"
                  />
                </div>
                <button type="submit" disabled={loading || !apiKey} className="btn-primary">
                  {loading ? 'Saving...' : 'Save API Key'}
                </button>
              </form>
            )}
          </div>

          {/* Plan Info */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Current Plan</h2>
              <Link href="/pricing" className="text-sm text-violet-400 hover:text-violet-300">
                Change plan →
              </Link>
            </div>
            <p className="text-zinc-400 text-sm">
              Manage your subscription and billing through the pricing page.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
