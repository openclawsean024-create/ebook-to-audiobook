import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// POST /api/conversions/[id]/share — generate or retrieve a share link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the conversion belongs to this user
    const { data: conversion, error } = await supabase
      .from('conversions')
      .select('id, title, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !conversion) {
      return NextResponse.json({ error: 'Conversion not found' }, { status: 404 })
    }

    // Use the conversion ID as the share token — simple, unique, no extra column needed
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ebook-to-audiobook-seans-projects-7dc76219.vercel.app'
    return NextResponse.json({ share_url: `${baseUrl}/share/${id}` })
  } catch (err) {
    console.error('Share error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
