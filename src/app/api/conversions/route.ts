import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'
import AdmZip from 'adm-zip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export const runtime = 'nodejs'

// Parse EPUB text
async function parseEpub(buffer: Buffer): Promise<{ title: string; text: string; chapters: Array<{ title: string; text: string }> }> {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()
  let title = 'Untitled'
  let text = ''
  const chapters: Array<{ title: string; text: string }> = []

  for (const entry of entries) {
    const name = entry.entryName.toLowerCase()
    if (name.endsWith('.opf')) {
      const content = entry.getData().toString('utf-8')
      const titleMatch = content.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i)
      if (titleMatch) title = titleMatch[1]
    }
    if (name.endsWith('.xhtml') || name.endsWith('.html') || name.endsWith('.htm')) {
      const content = entry.getData().toString('utf-8')
      const clean = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ').trim()
      if (clean.length > 100) {
        chapters.push({ title: `Chapter ${chapters.length + 1}`, text: clean })
        text += clean + '\n\n'
      }
    }
  }
  return { title, text: text.trim(), chapters }
}

// Parse TXT text
async function parseTxt(buffer: Buffer): Promise<{ title: string; text: string; chapters: Array<{ title: string; text: string }> }> {
  const text = buffer.toString('utf-8').trim()
  return { title: 'Untitled', text, chapters: [{ title: 'Chapter 1', text }] }
}

// Parse PDF text using pdfjs-dist
async function parsePdf(buffer: Buffer): Promise<{ title: string; text: string; chapters: Array<{ title: string; text: string }> }> {
  const data = new Uint8Array(buffer)
  const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = (content.items as Array<{ str?: string }>)
      .map(item => item.str || '')
      .join(' ')
    text += pageText + '\n\n'
  }
  const fullText = text.trim()
  const sections = fullText.split(/\n\s*\n+/).filter(s => s.trim().length > 50)
  const chapters = sections.length > 0
    ? sections.map((s, i) => ({ title: `Part ${i + 1}`, text: s.trim() }))
    : [{ title: 'Chapter 1', text: fullText }]
  return { title: 'Untitled', text: fullText, chapters }
}

// Convert text to speech via ElevenLabs
async function synthesizeText(text: string, apiKey: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`ElevenLabs API error: ${err}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Chunk text for TTS
function chunkText(text: string, maxChars: number = 4500): string[] {
  const paragraphs = text.split(/\n\s*\n/)
  const chunks: string[] = []
  let buffer = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    if ((buffer + '\n\n' + trimmed).length <= maxChars) {
      buffer = buffer ? buffer + '\n\n' + trimmed : trimmed
    } else {
      if (buffer) chunks.push(buffer)
      buffer = trimmed
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks
}

// Merge MP3 buffers
function mergeMp3Buffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('plan, elevenlabs_api_key, characters_used').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const voice = (formData.get('voice') as string) || 'eleven_multilingual_v2'
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['epub', 'txt', 'pdf'].includes(ext || '')) {
      return NextResponse.json({ error: 'Unsupported file type. Use EPUB, PDF, or TXT.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let parsed: { title: string; text: string; chapters: Array<{ title: string; text: string }> }
    if (ext === 'epub') parsed = await parseEpub(buffer)
    else if (ext === 'pdf') parsed = await parsePdf(buffer)
    else parsed = await parseTxt(buffer)

    const { title, text, chapters } = parsed
    const charCount = text.length

    const limits: Record<string, number> = { free: 10000, pro: 100000, business: 500000 }
    const limit = limits[profile.plan || 'free']
    const used = profile.characters_used || 0

    if ((used + charCount) > limit) {
      return NextResponse.json({
        error: `Character limit exceeded. You have ${(limit - used).toLocaleString()} characters remaining.`,
      }, { status: 402 })
    }

    const conversionId = uuidv4()
    await supabase.from('conversions').insert({
      id: conversionId, user_id: user.id, title,
      file_type: ext?.toUpperCase(), voice,
      status: 'processing', progress: 5,
      character_count: charCount, chapter_count: chapters.length,
    })

    // Free tier: skip synthesis, just record
    if (profile.plan === 'free') {
      await supabase.from('conversions').update({ status: 'completed', progress: 100, message: 'Free tier - preview only' }).eq('id', conversionId)
      await supabase.from('profiles').update({ characters_used: used + charCount }).eq('id', user.id)
      return NextResponse.json({ id: conversionId, status: 'completed', progress: 100, message: 'Free tier completed', title, chapter_count: chapters.length, character_count: charCount })
    }

    if (!profile.elevenlabs_api_key) {
      return NextResponse.json({ error: 'ElevenLabs API key required for Pro/Business. Add it in Settings.' }, { status: 402 })
    }

    const audioUrls: Array<{ index: number; title: string; url: string }> = []
    let processedChars = 0

    // Pre-calculate total chunks for progress tracking
    let totalChunks = 0
    for (const chapter of chapters) {
      totalChunks += chunkText(chapter.text).length
    }
    let chunkIndex = 0

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const chapterChunks = chunkText(chapter.text)

      for (const chunk of chapterChunks) {
        chunkIndex++
        const progress = Math.round((chunkIndex / totalChunks) * 90)
        await supabase.from('conversions').update({
          progress,
          message: `第 ${chunkIndex} / ${totalChunks} 片段...`
        }).eq('id', conversionId)

        try {
          const audioBuffer = await synthesizeText(chunk, profile.elevenlabs_api_key!, voice)
          audioUrls.push({ index: chunkIndex, title: `片段 ${chunkIndex}`, url: '' })
          processedChars += chunk.length
        } catch (err) {
          console.error(`Chunk ${chunkIndex} failed:`, err)
        }
      }
    }

    // Re-synthesize and collect chapter buffers for final merge
    const chapterMp3Map: Array<{ index: number; buffer: Buffer }> = []
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      try {
        const chunks = chunkText(chapter.text)
        const audioBuffers: Buffer[] = []
        for (const chunk of chunks) {
          const audioBuffer = await synthesizeText(chunk, profile.elevenlabs_api_key!, voice)
          audioBuffers.push(audioBuffer)
        }
        const merged = mergeMp3Buffers(audioBuffers)
        chapterMp3Map.push({ index: i + 1, buffer: merged })
      } catch (err) {
        console.error(`Chapter ${i + 1} final merge failed:`, err)
      }
    }

    await supabase.from('conversions').update({ progress: 95, message: '合併中...' }).eq('id', conversionId)

    // Merge all chapters into single audiobook MP3
    const chapterBuffers = chapterMp3Map.sort((a, b) => a.index - b.index).map(c => c.buffer)
    const fullAudiobookBuffer = mergeMp3Buffers(chapterBuffers)

    // Upload full audiobook
    const fullFileName = `${conversionId}/full-audiobook.mp3`
    const { error: uploadError } = await supabase.storage.from('audiobooks').upload(fullFileName, fullAudiobookBuffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadError) throw uploadError
    const { data: urlData } = supabase.storage.from('audiobooks').getPublicUrl(fullFileName)
    const fullAudioUrl = urlData.publicUrl

    // Upload individual chapters
    const chapterAudios: Array<{ index: number; title: string; url: string }> = []
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const fileName = `${conversionId}/chapter-${String(i + 1).padStart(3, '0')}.mp3`
      const { error: chapterUploadError } = await supabase.storage.from('audiobooks').upload(fileName, chapterMp3Map[i]?.buffer || Buffer.alloc(0), { contentType: 'audio/mpeg', upsert: true })
      if (chapterUploadError) throw chapterUploadError
      const { data: chapterUrlData } = supabase.storage.from('audiobooks').getPublicUrl(fileName)
      chapterAudios.push({ index: i + 1, title: chapter.title, url: chapterUrlData.publicUrl })
    }

    await supabase.from('conversions').update({ status: 'completed', progress: 100, message: 'Conversion completed', audio_url: fullAudioUrl, chapter_audios: chapterAudios }).eq('id', conversionId)
    await supabase.from('profiles').update({ characters_used: used + processedChars }).eq('id', user.id)

    return NextResponse.json({ id: conversionId, status: 'completed', progress: 100, message: 'Conversion completed', title, chapter_count: chapters.length, character_count: processedChars, audio_url: fullAudioUrl, chapter_audios: chapterAudios })
  } catch (err) {
    console.error('Conversion error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: conversions, error } = await supabase.from('conversions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return NextResponse.json(conversions)
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
