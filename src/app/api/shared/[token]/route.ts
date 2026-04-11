import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/shared/[token] — fetch a shared conversion without auth
// The token IS the conversion UUID

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createClient()

    // Look up conversion by ID (token = conversion ID for shared links)
    const { data: conversion, error } = await supabase
      .from('conversions')
      .select('id, title, status, audio_url, chapter_audios, character_count, chapter_count, voice, created_at')
      .eq('id', token)
      .single()

    if (error || !conversion) {
      return NextResponse.json({ error: 'Audiobook not found or link is invalid.' }, { status: 404 })
    }

    // Only return completed conversions with audio
    if (conversion.status !== 'completed') {
      return NextResponse.json({ error: 'This audiobook is not ready yet.' }, { status: 404 })
    }

    return NextResponse.json(conversion)
  } catch (err) {
    console.error('Shared fetch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
