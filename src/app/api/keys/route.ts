import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('elevenlabs_api_key')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      has_key: !!profile?.elevenlabs_api_key,
      // Don't return the actual key
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { api_key } = body

    if (!api_key || typeof api_key !== 'string') {
      return NextResponse.json({ error: 'API key required' }, { status: 400 })
    }

    // Validate by attempting a test call
    const testRes = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': api_key },
    })

    if (!testRes.ok) {
      return NextResponse.json({ error: 'Invalid ElevenLabs API key' }, { status: 400 })
    }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      elevenlabs_api_key: api_key,
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error saving API key:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await supabase.from('profiles').update({ elevenlabs_api_key: null }).eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
