import { describe, it, expect } from 'vitest'
import { buildRssXml, appendToken, regenerateRssToken } from '../rss'
import type { RssChannel } from '../rss'

const sampleChannel: RssChannel = {
  title: '冒險之旅',
  author: '小說家 Sean',
  description: '一個關於冒險的繁中小說',
  language: 'zh-TW',
  imageUrl: 'https://example.com/cover.jpg',
  link: 'https://ebook-to-audiobook.app',
  audioBaseUrl: 'https://ebook-to-audiobook.app/api/audio',
  token: 'fixed-token-1234',
  episodes: [
    {
      chapterNumber: 1,
      title: '第一章 開始',
      description: '故事開始的地方',
      audioUrl: 'https://ebook-to-audiobook.app/api/audio/abc',
      durationSeconds: 600,
      pubDate: new Date('2026-07-19T00:00:00Z'),
      fileSizeBytes: 1234567,
    },
    {
      chapterNumber: 2,
      title: '第二章 旅途',
      description: '踏上旅途',
      audioUrl: 'https://ebook-to-audiobook.app/api/audio/def',
      durationSeconds: 720,
      pubDate: new Date('2026-07-19T00:01:00Z'),
      fileSizeBytes: 1500000,
    },
  ],
}

describe('rss module — SPEC §3 FR-004 / AC-FR-004', () => {
  describe('buildRssXml', () => {
    it('starts with the XML declaration and RSS 2.0', () => {
      const xml = buildRssXml(sampleChannel)
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
      expect(xml).toContain('<rss version="2.0"')
    })

    it('includes the iTunes podcast namespace', () => {
      const xml = buildRssXml(sampleChannel)
      expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"')
    })

    it('embeds channel metadata (title, author, language)', () => {
      const xml = buildRssXml(sampleChannel)
      expect(xml).toContain('<title>冒險之旅</title>')
      expect(xml).toContain('<itunes:author>小說家 Sean</itunes:author>')
      expect(xml).toContain('<language>zh-TW</language>')
    })

    it('emits one <item> per episode with token-protected audio URLs (AC-FR-004)', () => {
      const xml = buildRssXml(sampleChannel)
      const itemMatches = xml.match(/<item>/g) || []
      expect(itemMatches).toHaveLength(2)
      expect(xml).toContain('enclosure url="https://ebook-to-audiobook.app/api/audio/abc?token=fixed-token-1234"')
      expect(xml).toContain('enclosure url="https://ebook-to-audiobook.app/api/audio/def?token=fixed-token-1234"')
    })

    it('includes itunes:duration in HH:MM:SS or MM:SS format', () => {
      const xml = buildRssXml(sampleChannel)
      expect(xml).toContain('<itunes:duration>10:00</itunes:duration>') // 600s
      expect(xml).toContain('<itunes:duration>12:00</itunes:duration>') // 720s
    })

    it('emits itunes:episode number per chapter', () => {
      const xml = buildRssXml(sampleChannel)
      expect(xml).toContain('<itunes:episode>1</itunes:episode>')
      expect(xml).toContain('<itunes:episode>2</itunes:episode>')
    })

    it('handles 20 chapters (pilot benchmark)', () => {
      const eps = Array.from({ length: 20 }, (_, i) => ({
        chapterNumber: i + 1,
        title: `Chapter ${i + 1}`,
        description: `Chapter ${i + 1} description`,
        audioUrl: `https://example.com/audio/${i + 1}.mp3`,
        durationSeconds: 600 + i * 10,
        pubDate: new Date(2026, 6, 19, 0, i, 0),
        fileSizeBytes: 1000000 + i * 1000,
      }))
      const xml = buildRssXml({ ...sampleChannel, episodes: eps })
      const itemMatches = xml.match(/<item>/g) || []
      expect(itemMatches).toHaveLength(20)
    })

    it('escapes XML special characters in titles', () => {
      const xml = buildRssXml({
        ...sampleChannel,
        episodes: [
          {
            ...sampleChannel.episodes[0],
            title: 'A & B <c> "test"',
          },
        ],
      })
      expect(xml).toContain('A &amp; B &lt;c&gt; &quot;test&quot;')
    })

    it('includes the atom:link self-reference with token (RSS best practice)', () => {
      const xml = buildRssXml(sampleChannel)
      expect(xml).toMatch(/<atom:link href="[^"]+token=fixed-token-1234"[^>]*rel="self"/)
    })

    it('handles empty episode list gracefully', () => {
      const xml = buildRssXml({ ...sampleChannel, episodes: [] })
      expect(xml).toContain('<rss version="2.0"')
      expect(xml).not.toContain('<item>')
    })
  })

  describe('appendToken', () => {
    it('appends token with ? when URL has no query string', () => {
      expect(appendToken('https://a.com/x', 'tok')).toBe('https://a.com/x?token=tok')
    })

    it('appends token with & when URL already has a query string', () => {
      expect(appendToken('https://a.com/x?y=1', 'tok')).toBe('https://a.com/x?y=1&token=tok')
    })

    it('URL-encodes tokens that contain special characters', () => {
      expect(appendToken('https://a.com/x', 'tok/en+1=')).toBe('https://a.com/x?token=tok%2Fen%2B1%3D')
    })

    it('returns the original URL when token is empty', () => {
      expect(appendToken('https://a.com/x', '')).toBe('https://a.com/x')
    })
  })

  describe('regenerateRssToken', () => {
    it('returns a non-empty string', () => {
      const token = regenerateRssToken()
      expect(token.length).toBeGreaterThan(0)
    })

    it('returns a different token on each call', () => {
      const a = regenerateRssToken()
      const b = regenerateRssToken()
      expect(a).not.toBe(b)
    })
  })
})
