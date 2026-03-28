import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// Create a voice clone from audio sample
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, elevenlabs_api_key')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.plan === 'free') return NextResponse.json({ error: 'Voice cloning requires Pro or Business plan' }, { status: 403 })
    if (!profile.elevenlabs_api_key) return NextResponse.json({ error: 'ElevenLabs API key required. Add it in Settings.' }, { status: 402 })

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const name = (formData.get('name') as string)?.trim()

    if (!audioFile) return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Voice name is required' }, { status: 400 })
    if (name.length > 100) return NextResponse.json({ error: 'Voice name too long (max 100 chars)' }, { status: 400 })

    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg']
    if (!allowedTypes.includes(audioFile.type)) {
      return NextResponse.json({ error: 'Unsupported audio format. Use MP3, WAV, or M4A.' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    // Upload sample to Supabase storage
    const sampleFileName = `${user.id}/${Date.now()}-${audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { error: uploadError } = await supabase.storage
      .from('voice-samples')
      .upload(sampleFileName, audioBuffer, { contentType: audioFile.type, upsert: false })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: urlData } = supabase.storage.from('voice-samples').getPublicUrl(sampleFileName)
    const sampleUrl = urlData.publicUrl

    // Call ElevenLabs Voice Clone API
    const elevenLabsForm = new FormData()
    elevenLabsForm.append('name', name)
    elevenLabsForm.append('audio', new Blob([audioBuffer], { type: audioFile.type }), audioFile.name)

    const cloneResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': profile.elevenlabs_api_key },
      body: elevenLabsForm,
    })

    if (!cloneResponse.ok) {
      const err = await cloneResponse.text()
      console.error('ElevenLabs clone error:', err)
      return NextResponse.json({ error: 'Voice cloning failed. Check your audio sample.' }, { status: 502 })
    }

    const cloneData = await cloneResponse.json()
    const voiceId = cloneData.voice_id

    // Save to database
    const { data: saved, error: dbError } = await supabase
      .from('cloned_voices')
      .insert({
        user_id: user.id,
        elevenlabs_voice_id: voiceId,
        name,
        audio_sample_url: sampleUrl,
      })
      .select()
      .single()

    if (dbError) throw new Error(`Database error: ${dbError.message}`)

    return NextResponse.json({
      id: saved.id,
      voice_id: voiceId,
      name: saved.name,
      audio_sample_url: sampleUrl,
      created_at: saved.created_at,
    })
  } catch (err) {
    console.error('Voice clone error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
