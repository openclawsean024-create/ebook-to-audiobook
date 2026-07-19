/**
 * Book parser — EPUB / PDF / TXT.
 * SPEC §3 FR-001 / AC-FR-001.
 *
 * Pure functions are exported so they can be unit-tested with synthetic inputs
 * (real EPUB/PDF parsing is tested in parser-integration.test.ts).
 */

import type { Chapter, ParsedBook } from './types'
import { MAX_FILE_BYTES } from './types'

// ───────────────────────────────────────────────────────────────────────────
// Public helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Splits a block of plain text into chapters using common heading markers.
 * Used after EPUB/PDF extraction strips HTML to give a uniform interface.
 */
export function parsePlainText(text: string, _bookTitle: string): Chapter[] {
  const cleaned = sanitizeChapterText(text)
  if (!cleaned) return []

  // Recognised heading patterns (case-insensitive):
  //   第N章 / 第N回
  //   Chapter N / CHAPTER N
  // NOTE: \b doesn't work around CJK chars (they're non-word), so we use
  // a non-capturing lookahead for whitespace, punctuation, or end-of-line.
  const headingRe =
    /^\s*(?:第[一二三四五六七八九十百千零〇\d]+(?:章|回|节|節)|chapter\s+\d+|chapter\s+[ivx]+)(?=\s|:|$)/im

  const lines = cleaned.split(/\n+/)
  const chapters: Chapter[] = []
  let buffer: string[] = []
  let currentTitle = 'Chapter 1'

  const flush = () => {
    const body = buffer.join(' ').replace(/\s+/g, ' ').trim()
    if (body.length === 0) return
    chapters.push({
      number: chapters.length + 1,
      title: currentTitle,
      text: body,
      charCount: body.length,
    })
    buffer = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (headingRe.test(line)) {
      flush()
      currentTitle = line
    } else {
      buffer.push(line)
    }
  }
  flush()

  if (chapters.length === 0) {
    // No headings found — single-chapter fallback.
    return [
      {
        number: 1,
        title: 'Chapter 1',
        text: cleaned,
        charCount: cleaned.length,
      },
    ]
  }
  return chapters
}

/**
 * Parse a TXT buffer (UTF-8 text) into a one-chapter ParsedBook.
 */
export function parseTxt(buffer: Buffer): ParsedBook {
  const text = buffer.toString('utf-8').trim()
  const chapters = parsePlainText(text, 'Untitled')
  const warnings: string[] = []
  if (chapters.length === 0 || chapters[0].charCount === 0) {
    warnings.push('File appears to be empty or contains only whitespace.')
  }
  return {
    title: 'Untitled',
    author: null,
    fileType: 'txt',
    totalChars: chapters.reduce((s, c) => s + c.charCount, 0),
    chapters,
    warnings,
    needsOcr: false,
  }
}

/**
 * Validate the size of an uploaded file (SPEC FR-001: max 50MB).
 */
export function validateBookSize(bytes: number): void {
  if (bytes <= 0) throw new Error('File is empty.')
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(
      `File exceeds 50MB limit (got ${(bytes / 1024 / 1024).toFixed(1)}MB). Please compress first.`
    )
  }
}

/**
 * Sanitize extracted text by stripping HTML tags, scripts, and excess whitespace.
 */
export function sanitizeChapterText(input: string): string {
  if (!input) return ''
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

/**
 * Convert a free-form title to a URL-safe slug for filenames.
 */
export function slugify(input: string): string {
  const trimmed = (input || '').trim()
  if (!trimmed) return 'untitled'
  // Lowercase ASCII, replace unsafe chars with '-'
  const lowered = trimmed.toLowerCase()
  const ascii = lowered
    .replace(/[^\w\s\-\u4e00-\u9fff\u3040-\u30ff]/g, '-')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii || 'untitled'
}

/**
 * Detect file type from magic bytes + filename.
 */
export function detectFileType(
  buffer: Buffer,
  filename: string
): 'epub' | 'pdf' | 'txt' {
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return 'epub'
  }
  const head = buffer.slice(0, 5).toString('ascii')
  if (head.startsWith('%PDF-')) return 'pdf'
  const lower = filename.toLowerCase()
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.epub')) {
    // Looks like an EPUB by extension but signature is wrong.
    if (buffer.length === 0) throw new Error('Unsupported file: empty buffer')
    throw new Error('Unsupported file: EPUB signature missing or corrupt')
  }
  if (lower.endsWith('.pdf')) throw new Error('Unsupported file: PDF signature missing')
  throw new Error(`Unsupported file type: ${filename}`)
}

/**
 * Estimate audio duration in seconds for a chunk of text.
 * TTS Chinese is roughly 2.5 chars/second (slow narration).
 */
export function estimateReadingTimeSeconds(text: string): number {
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length
  const asciiChars = text.length - cjkChars
  // CJK ~ 2.5 chars/sec; English ~ 14 chars/sec.
  return Math.ceil(cjkChars / 2.5 + asciiChars / 14)
}

export function totalCharCount(chapters: Chapter[]): number {
  return chapters.reduce((sum, c) => sum + c.charCount, 0)
}
