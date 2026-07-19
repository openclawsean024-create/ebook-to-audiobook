import { describe, it, expect } from 'vitest'
import {
  parsePlainText,
  parseTxt,
  validateBookSize,
  sanitizeChapterText,
  slugify,
  detectFileType,
  estimateReadingTimeSeconds,
  totalCharCount,
} from '../parser'
import type { Chapter } from '../types'

describe('parser module — SPEC §3 FR-001', () => {
  describe('parsePlainText', () => {
    it('splits a single block into one chapter when no headings are present', () => {
      const chapters = parsePlainText('Hello world from a one-paragraph text.', 'Test Book')
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('Chapter 1')
      expect(chapters[0].text).toContain('Hello world')
      expect(chapters[0].charCount).toBeGreaterThan(0)
    })

    it('splits on common Chinese/English chapter headings', () => {
      const text = [
        '第一章 開始',
        '從前從前有一個故事開始的地方。',
        '',
        '第二章 旅途',
        '小瑜決定出門走走。',
      ].join('\n')
      const chapters = parsePlainText(text, 'Book')
      expect(chapters.length).toBe(2)
      expect(chapters[0].title).toContain('第一章')
      expect(chapters[1].title).toContain('第二章')
      expect(chapters[1].text).toContain('小瑜')
    })

    it('handles English "Chapter N" headings case-insensitively', () => {
      const text = 'Chapter 1: The beginning\nOnce upon a time.\n\nCHAPTER 2: The road\nShe walked away.'
      const chapters = parsePlainText(text, 'Book')
      expect(chapters).toHaveLength(2)
      expect(chapters[0].title.toLowerCase()).toContain('chapter 1')
      expect(chapters[1].title.toLowerCase()).toContain('chapter 2')
    })

    it('assigns sequential chapter numbers starting from 1', () => {
      const chapters = parsePlainText(
        '第一章 開始\n這是第一章的內容。\n\n第二章 旅途\n這是第二章的內容。\n\n第三章 結局\n這是第三章的內容。',
        'Book'
      )
      expect(chapters.map((c) => c.number)).toEqual([1, 2, 3])
    })

    it('returns empty array on empty input', () => {
      expect(parsePlainText('', 'Book')).toEqual([])
    })

    it('falls back to a single "Chapter 1" when no heading markers found', () => {
      const text = '一段沒有任何章節標記的文字'.repeat(20)
      const chapters = parsePlainText(text, 'Book')
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('Chapter 1')
      expect(chapters[0].text.length).toBeGreaterThan(50)
    })
  })

  describe('parseTxt', () => {
    it('decodes a UTF-8 buffer and wraps content in one chapter', () => {
      const buf = Buffer.from('第一行\n第二行\n第三行', 'utf-8')
      const book = parseTxt(buf)
      expect(book.fileType).toBe('txt')
      expect(book.title).toBe('Untitled')
      expect(book.chapters).toHaveLength(1)
      expect(book.totalChars).toBeGreaterThan(0)
      expect(book.needsOcr).toBe(false)
    })

    it('handles Traditional Chinese characters correctly', () => {
      const buf = Buffer.from('繁體中文測試：電子書轉有聲書系統', 'utf-8')
      const book = parseTxt(buf)
      expect(book.chapters[0].text).toContain('繁體中文')
      expect(book.chapters[0].text).toContain('電子書')
    })

    it('marks empty buffer with warning', () => {
      const book = parseTxt(Buffer.from('   \n  \n', 'utf-8'))
      expect(book.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('validateBookSize', () => {
    it('accepts a 50MB file (boundary)', () => {
      expect(() => validateBookSize(50 * 1024 * 1024)).not.toThrow()
    })

    it('rejects a 51MB file with a friendly error', () => {
      expect(() => validateBookSize(51 * 1024 * 1024)).toThrow(/50 ?MB/i)
    })

    it('rejects zero-byte file', () => {
      expect(() => validateBookSize(0)).toThrow(/empty/i)
    })
  })

  describe('sanitizeChapterText', () => {
    it('strips HTML tags', () => {
      const cleaned = sanitizeChapterText('<p>Hello <b>world</b></p>')
      expect(cleaned).not.toContain('<')
      expect(cleaned).toContain('Hello')
      expect(cleaned).toContain('world')
    })

    it('decodes HTML entities', () => {
      const cleaned = sanitizeChapterText('Tom &amp; Jerry &lt;3 &nbsp;fun')
      expect(cleaned).toContain('&')
      expect(cleaned).toContain('<3')
      expect(cleaned).not.toContain('&amp;')
    })

    it('collapses excess whitespace', () => {
      const cleaned = sanitizeChapterText('a    b\n\n\n\nc\t\td')
      expect(cleaned).not.toMatch(/  +/)
      expect(cleaned.split(' ').length).toBeLessThan(10)
    })

    it('removes script and style content entirely', () => {
      const cleaned = sanitizeChapterText(
        '<script>alert("xss")</script>visible<script>more()</script>'
      )
      expect(cleaned).not.toContain('alert')
      expect(cleaned).not.toContain('more()')
      expect(cleaned).toContain('visible')
    })
  })

  describe('slugify', () => {
    it('converts title to kebab-case ASCII', () => {
      expect(slugify('Hello World!')).toBe('hello-world')
    })

    it('handles Traditional Chinese by leaving CJK characters intact', () => {
      const slug = slugify('小說：冒險之旅 第一章')
      expect(slug.length).toBeGreaterThan(0)
      expect(slug).not.toContain(' ')
      expect(slug).not.toContain(':')
    })

    it('strips unsafe URL chars', () => {
      const slug = slugify('a/b\\c?d#e')
      expect(slug).not.toContain('/')
      expect(slug).not.toContain('\\')
      expect(slug).not.toContain('?')
      expect(slug).not.toContain('#')
    })

    it('falls back to "untitled" when input is empty', () => {
      expect(slugify('')).toBe('untitled')
      expect(slugify('   ')).toBe('untitled')
    })
  })

  describe('detectFileType', () => {
    it('detects EPUB by ZIP signature 0x50 0x4B 0x03 0x04', () => {
      const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
      expect(detectFileType(buf, 'test.epub')).toBe('epub')
    })

    it('detects PDF by %PDF- signature', () => {
      const buf = Buffer.from('%PDF-1.7\nstuff')
      expect(detectFileType(buf, 'test.pdf')).toBe('pdf')
    })

    it('detects TXT by MIME/extension fallback', () => {
      const buf = Buffer.from('plain text content', 'utf-8')
      expect(detectFileType(buf, 'novel.txt')).toBe('txt')
    })

    it('rejects unsupported file types', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0x03])
      expect(() => detectFileType(buf, 'test.exe')).toThrow(/unsupported/i)
    })
  })

  describe('estimateReadingTimeSeconds', () => {
    it('estimates ~2.5 chars/sec for Chinese (slow reading)', () => {
      const text = '繁體'.repeat(500) // 1000 chars
      const seconds = estimateReadingTimeSeconds(text)
      // Allow a wide range — TTS Chinese is typically slower than English
      expect(seconds).toBeGreaterThan(200)
      expect(seconds).toBeLessThan(1000)
    })
  })

  describe('totalCharCount', () => {
    it('sums character counts across chapters', () => {
      const chapters: Chapter[] = [
        { number: 1, title: 'A', text: 'hello', charCount: 5 },
        { number: 2, title: 'B', text: 'world!', charCount: 6 },
      ]
      expect(totalCharCount(chapters)).toBe(11)
    })

    it('handles empty chapter list', () => {
      expect(totalCharCount([])).toBe(0)
    })
  })
})
