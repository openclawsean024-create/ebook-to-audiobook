import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'

const PLAN_LIMITS = { free: 10000, pro: 100000, business: 500000 }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch recent conversions
  const { data: conversions } = await supabase
    .from('conversions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const planLimit = PLAN_LIMITS[(profile?.plan as keyof typeof PLAN_LIMITS) || 'free']
  const usagePercent = profile ? Math.min(100, Math.round((profile.characters_used / planLimit) * 100)) : 0

  const statusColors: Record<string, string> = {
    queued: 'text-yellow-400',
    processing: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
            <p className="text-zinc-400">{user.email}</p>
          </div>

          {/* Usage Card */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Monthly Usage</h2>
                <p className="text-sm text-zinc-400">
                  {profile ? `${profile.characters_used.toLocaleString()} / ${planLimit.toLocaleString()} characters` : 'Loading...'}
                </p>
              </div>
              <span className={`badge ${profile?.plan === 'business' ? 'badge-business' : profile?.plan === 'pro' ? 'badge-pro' : 'badge-free'}`}>
                {(profile?.plan || 'free').toUpperCase()}
              </span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${usagePercent}%` }}></div>
            </div>
            {usagePercent >= 80 && (
              <p className="text-xs text-yellow-400 mt-2">
                ⚠️ You&apos;ve used {usagePercent}% of your monthly limit.{' '}
                <Link href="/pricing" className="underline">Upgrade plan →</Link>
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Total Conversions</p>
              <p className="text-3xl font-bold">{conversions?.length || 0}</p>
            </div>
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-400">
                {conversions?.filter(c => c.status === 'completed').length || 0}
              </p>
            </div>
            <div className="card">
              <p className="text-zinc-400 text-sm mb-1">Characters Used</p>
              <p className="text-3xl font-bold">{profile?.characters_used?.toLocaleString() || 0}</p>
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
            <h2 className="font-semibold mb-4">Recent Conversions</h2>
            {(!conversions || conversions.length === 0) ? (
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
                  <div key={conv.id} className="card flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-mono uppercase">
                        {conv.file_type}
                      </div>
                      <div>
                        <p className="font-medium">{conv.title || 'Untitled'}</p>
                        <p className="text-xs text-zinc-500">
                          {new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' · '}{conv.character_count?.toLocaleString() || 0} chars
                          {' · '}{conv.chapter_count || 0} chapters
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-medium ${statusColors[conv.status] || 'text-zinc-400'}`}>
                        {conv.status}
                      </span>
                      {conv.status === 'completed' && conv.audio_url && (
                        <a
                          href={conv.audio_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm py-1.5 px-3"
                        >
                          Download
                        </a>
                      )}
                    </div>
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
