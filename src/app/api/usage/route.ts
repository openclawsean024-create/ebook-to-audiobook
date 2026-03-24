import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PLAN_LIMITS: Record<string, number> = {
  free: 10000,
  pro: 100000,
  business: 500000,
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, characters_used')
      .eq('id', user.id)
      .single()

    const plan = profile?.plan || 'free'
    const limit = PLAN_LIMITS[plan] || 10000
    const used = profile?.characters_used || 0

    return NextResponse.json({
      plan,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      percent: Math.round((used / limit) * 100),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
