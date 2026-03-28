import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// Delete a cloned voice
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    // Get the voice record
    const { data: voice, error: fetchError } = await supabase
      .from('cloned_voices')
      .select('id, elevenlabs_voice_id, user_id')
      .eq('id', id)
      .single()

    if (fetchError || !voice) return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    if (voice.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Delete from ElevenLabs
    const { data: profile } = await supabase.from('profiles').select('elevenlabs_api_key').eq('id', user.id).single()
    if (profile?.elevenlabs_api_key) {
      try {
        await fetch(`https://api.elevenlabs.io/v1/voices/${voice.elevenlabs_voice_id}`, {
          method: 'DELETE',
          headers: { 'xi-api-key': profile.elevenlabs_api_key },
        })
      } catch (e) {
        console.warn('ElevenLabs voice deletion failed (non-critical):', e)
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase.from('cloned_voices').delete().eq('id', id)
    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
