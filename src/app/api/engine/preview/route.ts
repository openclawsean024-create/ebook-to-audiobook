import { NextResponse } from 'next/server'
import {
  parsePlainText,
  parseTxt,
  validateBookSize,
  detectFileType,
  slugify,
  estimateReadingTimeSeconds,
  totalCharCount,
} from '@/lib/engine/parser'
import {
  detectCharactersFromText,
  autoAssignVoices,
  BUILTIN_VOICES,
} from '@/lib/engine/characters'
import { TtsOrchestrator } from '@/lib/engine/tts'

/**
 * POST /api/engine/preview
 *
 * Body: { text: string, bookTitle?: string }
 *
 * Demonstrates the parse → detect characters → assign voices → TTS preview
 * pipeline without requiring file upload. Used by the homepage demo.
 */
export const runtime = 'nodejs'

interface PreviewRequest {
  text?: string
  bookTitle?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PreviewRequest
    const text = (body.text || '').trim()
    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    if (text.length > 500_000) {
      return NextResponse.json(
        { error: 'text too large (max 500KB for preview)' },
        { status: 413 }
      )
    }
    const bookTitle = (body.bookTitle || 'Demo Book').trim()

    // 1. Parse
    const chapters = parsePlainText(text, bookTitle)
    // 2. Character detection
    const detected = detectCharactersFromText(chapters.map((c) => c.text).join('\n'))
    const assigned = autoAssignVoices(detected)
    // 3. Duration estimate
    const totalChars = totalCharCount(chapters)
    const totalDurationSec = chapters.reduce(
      (s, c) => s + estimateReadingTimeSeconds(c.text),
      0
    )
    // 4. Tiny TTS preview of first 80 chars
    const orchestrator = TtsOrchestrator.fromEnv()
    const voice = BUILTIN_VOICES[0]
    const previewText = text.slice(0, 80)
    let previewSynthMs = 0
    let provider = 'mock'
    try {
      const t0 = Date.now()
      const seg = await orchestrator.synthesize({ voice, text: previewText })
      previewSynthMs = Date.now() - t0
      provider = seg.provider
    } catch (err) {
      return NextResponse.json(
        { error: `TTS failed: ${(err as Error).message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      bookTitle,
      slug: slugify(bookTitle),
      chapterCount: chapters.length,
      totalChars,
      totalDurationSec,
      characters: assigned.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        isNarrator: c.isNarrator,
        voiceId: c.voiceId,
        confidence: Math.round(c.confidence * 100) / 100,
      })),
      voicesAvailable: BUILTIN_VOICES.length,
      preview: {
        provider,
        textLength: previewText.length,
        synthMs: previewSynthMs,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Sanity check for the engine — no auth needed
  const voice = BUILTIN_VOICES[0]
  const sample = parseTxt(Buffer.from('第一章 開始\n「小瑜」說：「我們走吧。」'))
  return NextResponse.json({
    engine: 'v3.0',
    builtinVoices: BUILTIN_VOICES.length,
    sampleParse: {
      title: sample.title,
      chapterCount: sample.chapters.length,
    },
    parserHelpers: {
      validateBookSize: typeof validateBookSize,
      detectFileType: typeof detectFileType,
      estimateReadingTimeSeconds: typeof estimateReadingTimeSeconds,
    },
    voices: BUILTIN_VOICES.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      locale: v.locale,
    })),
    voice,
  })
}
