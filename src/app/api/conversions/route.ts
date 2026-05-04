import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'
import AdmZip from 'adm-zip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_MIME = [
  'application/epub+zip',
  'application/pdf',
  'text/plain',
  'application/octet-stream',
]
const ALLOWED_EXT = ['epub', 'pdf', 'txt']

const ERRORS = {
  NO_FILE:            { code: 'NO_FILE',            zh: '請選擇要上傳的電子書檔案' },
  UNSUPPORTED_FORMAT: { code: 'UNSUPPORTED_FORMAT',  zh: '抱歉，目前不支援這個檔案格式，請上傳 EPUB、PDF 或 TXT' },
  FILE_TOO_LARGE:     { code: 'FILE_TOO_LARGE',      zh: '檔案大小不能超過 50MB' },
  PARSE_ERROR:        { code: 'PARSE_ERROR',         zh: '無法讀取這個檔案的內容，請確認檔案未加密或損壞' },
} as const

function errorResponse(err: { code: string; zh: string }, status: number) {
  return NextResponse.json({ code: err.code, error: err.zh }, { status })
}

async function parseEpub(buffer: Buffer): Promise<{ title: string; text: string }> {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()
  let title = 'Untitled'
  let text = ''

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
      if (clean.length > 100) text += clean + '\n\n'
    }
  }
  return { title, text: text.trim() }
}

async function parseTxt(buffer: Buffer): Promise<{ title: string; text: string }> {
  return { title: 'Untitled', text: buffer.toString('utf-8').trim() }
}

async function parsePdf(buffer: Buffer): Promise<{ title: string; text: string }> {
  const data = new Uint8Array(buffer)
  const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += (content.items as Array<{ str?: string }>).map(item => item.str || '').join(' ') + '\n\n'
  }
  return { title: 'Untitled', text: text.trim() }
}

async function summarizeWithClaude(text: string, bookTitle: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Truncate to ~600k chars (~120k words) to stay within context limits
  const MAX_INPUT_CHARS = 600_000
  const inputText = text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS) + '\n\n[文本已因篇幅過長而截斷]'
    : text

  const prompt = `你是一位專業的有聲書製作人。請將以下電子書內容濃縮成適合朗讀的有聲書摘要。

書名：${bookTitle}

要求：
1. 目標長度：約 3,000 字（適合 20 分鐘聆聽，以每分鐘約 150 字的朗讀速度計算）
2. 保留原文語言（若原文為中文則輸出中文，英文則輸出英文）
3. 保留書中最重要的核心概念、故事情節、關鍵論點與見解
4. 以流暢、適合朗讀的散文形式呈現（不要使用條列或標題）
5. 開頭簡短介紹書名與核心主題（2-3句），結尾提供簡短總結（2-3句）
6. 不要加入書中沒有的內容，不要評論或批評書的內容
7. 語調自然流暢，像一位說書人在娓娓道來

以下是電子書內容：

${inputText}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected Claude response type')
  return content.text
}

async function synthesizeText(text: string, apiKey: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`ElevenLabs API error: ${err}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function chunkText(text: string, maxChars = 4500): string[] {
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
      buffer = trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, elevenlabs_api_key, characters_used')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: '找不到用戶資料' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(ERRORS.NO_FILE, 400)
  }

  const file = formData.get('file') as File | null
  const voice = (formData.get('voice') as string) || 'eleven_multilingual_v2'

  if (!file) return errorResponse(ERRORS.NO_FILE, 400)

  if (file.size > MAX_BYTES) return errorResponse(ERRORS.FILE_TOO_LARGE, 400)

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
    return errorResponse(ERRORS.UNSUPPORTED_FORMAT, 400)
  }
  if (!ALLOWED_EXT.includes(ext)) return errorResponse(ERRORS.UNSUPPORTED_FORMAT, 400)

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsed: { title: string; text: string }

  try {
    if (ext === 'epub') parsed = await parseEpub(buffer)
    else if (ext === 'pdf') parsed = await parsePdf(buffer)
    else parsed = await parseTxt(buffer)
  } catch {
    return errorResponse(ERRORS.PARSE_ERROR, 422)
  }

  const { title, text } = parsed
  if (!text || text.length < 100) return errorResponse(ERRORS.PARSE_ERROR, 422)

  const conversionId = uuidv4()
  await supabase.from('conversions').insert({
    id: conversionId,
    user_id: user.id,
    title,
    file_type: ext.toUpperCase(),
    voice,
    status: 'processing',
    progress: 10,
    character_count: text.length,
    chapter_count: 1,
    message: '正在解析文件...',
  })

  // AI summarization
  await supabase.from('conversions').update({
    progress: 20,
    message: 'AI 正在濃縮內容（約 3,000 字）...',
  }).eq('id', conversionId)

  let summary: string
  try {
    summary = await summarizeWithClaude(text, title)
  } catch (err) {
    console.error('Claude summarization failed:', err)
    await supabase.from('conversions').update({ status: 'failed', message: 'AI 摘要失敗' }).eq('id', conversionId)
    return NextResponse.json({ code: 'SUMMARIZE_ERROR', error: 'AI 摘要失敗，請稍後重試' }, { status: 500 })
  }

  const summaryWordCount = summary.split(/\s+/).length

  await supabase.from('conversions').update({
    progress: 50,
    message: `摘要完成（${summaryWordCount} 字）。正在生成語音...`,
  }).eq('id', conversionId)

  // Free tier: return summary for browser TTS, skip ElevenLabs
  if (profile.plan === 'free') {
    await supabase.from('conversions').update({
      status: 'completed',
      progress: 100,
      message: '摘要完成（免費方案使用瀏覽器語音）',
      summary_text: summary,
    }).eq('id', conversionId)
    return NextResponse.json({
      id: conversionId, status: 'completed', progress: 100,
      title, summary, summary_word_count: summaryWordCount,
      message: '摘要完成（免費方案使用瀏覽器語音）',
    })
  }

  if (!profile.elevenlabs_api_key) {
    await supabase.from('conversions').update({ status: 'failed', message: '缺少 ElevenLabs API 金鑰' }).eq('id', conversionId)
    return NextResponse.json({ error: 'ElevenLabs API 金鑰為 Pro/Business 方案必填，請至設定頁新增。' }, { status: 402 })
  }

  // TTS: synthesize the summary in chunks (~3-4 chunks total)
  const summaryChunks = chunkText(summary, 4500)
  const audioBuffers: Buffer[] = []

  for (let i = 0; i < summaryChunks.length; i++) {
    await supabase.from('conversions').update({
      progress: 50 + Math.round(((i + 1) / summaryChunks.length) * 40),
      message: `正在生成語音片段 ${i + 1}/${summaryChunks.length}...`,
    }).eq('id', conversionId)

    try {
      const buf = await synthesizeText(summaryChunks[i], profile.elevenlabs_api_key, voice)
      audioBuffers.push(buf)
    } catch (err) {
      console.error(`TTS chunk ${i + 1} failed:`, err)
      await supabase.from('conversions').update({ status: 'failed', message: `語音生成失敗（片段 ${i + 1}）` }).eq('id', conversionId)
      return NextResponse.json({ error: `語音生成失敗，請確認 ElevenLabs API 金鑰有效。` }, { status: 500 })
    }
  }

  await supabase.from('conversions').update({ progress: 95, message: '上傳音訊中...' }).eq('id', conversionId)

  const fullAudioBuffer = Buffer.concat(audioBuffers)
  const fileName = `${conversionId}/audiobook.mp3`

  const { error: uploadError } = await supabase.storage
    .from('audiobooks')
    .upload(fileName, fullAudioBuffer, { contentType: 'audio/mpeg', upsert: true })
  if (uploadError) {
    console.error('Storage upload failed:', uploadError)
    await supabase.from('conversions').update({ status: 'failed', message: '音訊上傳失敗' }).eq('id', conversionId)
    return NextResponse.json({ error: '音訊上傳失敗' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('audiobooks').getPublicUrl(fileName)

  await supabase.from('conversions').update({
    status: 'completed',
    progress: 100,
    message: '轉換完成！約 20 分鐘有聲書已生成。',
    audio_url: urlData.publicUrl,
    chapter_audios: [{ index: 1, title: '完整有聲書', url: urlData.publicUrl }],
    summary_text: summary,
  }).eq('id', conversionId)

  await supabase.from('profiles').update({
    characters_used: (profile.characters_used || 0) + summary.length,
  }).eq('id', user.id)

  return NextResponse.json({
    id: conversionId,
    status: 'completed',
    progress: 100,
    title,
    summary_word_count: summaryWordCount,
    audio_url: urlData.publicUrl,
    message: '轉換完成！約 20 分鐘有聲書已生成。',
  })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: conversions, error } = await supabase
      .from('conversions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return NextResponse.json(conversions)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
