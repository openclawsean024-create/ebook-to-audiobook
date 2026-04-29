'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Navbar() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)

  useEffect(() => {
    const { data: { user } } = supabase.auth.getUser()
    setUser(user)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-amber-200 backdrop-blur-xl bg-amber-50/90">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </div>
          <span className="font-semibold text-lg">VoxChapter</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link href="/pricing" className="btn-ghost text-sm">
            Pricing
          </Link>
          {user ? (
            <>
              <Link href="/converter" className="btn-ghost text-sm">
                Converter
              </Link>
              <Link href="/dashboard" className="btn-ghost text-sm">
                Dashboard
              </Link>
              <button onClick={handleLogout} className="btn-ghost text-sm text-zinc-500 hover:text-zinc-300">
                Logout
              </button>
              <Link href="/converter" className="btn-primary text-sm ml-2">
                Start Converting
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost text-sm">
                Sign In
              </Link>
              <Link href="/register" className="btn-ghost text-sm">
                Register
              </Link>
              <Link href="/converter" className="btn-primary text-sm ml-2">
                Start Converting
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
