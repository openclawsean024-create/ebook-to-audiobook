import { describe, it, expect } from 'vitest'
import { GET as rssDemo } from '../../../app/api/rss/demo/route'
import { GET as previewGet, POST as previewPost } from '../../../app/api/engine/preview/route'

/**
 * Smoke tests for the public demo API routes.
 * Exercises SPEC §3 FR-001, FR-002, FR-004 through the new engine module.
 */

describe('API: /api/rss/demo (SPEC §3 FR-004)', () => {
  it('returns a valid RSS XML with token-protected audio URLs', async () => {
    const req = new Request('http://localhost/api/rss/demo?token=test-tok')
    const res = await rssDemo(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/rss\+xml/)
    const body = await res.text()
    expect(body).toContain('<rss version="2.0"')
    expect(body).toContain('xmlns:itunes=')
    expect(body).toContain('token=test-tok')
    expect(body.match(/<item>/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('auto-generates a token if none provided', async () => {
    const req = new Request('http://localhost/api/rss/demo')
    const res = await rssDemo(req)
    const body = await res.text()
    expect(body).toMatch(/token=[a-f0-9-]+/)
  })
})

describe('API: /api/engine/preview (SPEC §3 FR-001/002)', () => {
  it('GET returns engine metadata + builtin voice list', async () => {
    const res = await previewGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.engine).toBe('v3.0')
    expect(body.builtinVoices).toBe(5)
    expect(body.voices).toHaveLength(5)
    expect(body.sampleParse.chapterCount).toBeGreaterThanOrEqual(1)
  })

  it('POST parses text, detects characters, returns timing estimate', async () => {
    const req = new Request('http://localhost/api/engine/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookTitle: '冒險之旅',
        text: [
          '第一章 開始',
          '「小瑜」說：「我們走吧。」',
          '「阿志」回答：「好啊。」',
          '第二章 旅途',
          '他們一起出發。',
        ].join('\n'),
      }),
    })
    const res = await previewPost(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.chapterCount).toBe(2)
    expect(body.characters.length).toBeGreaterThanOrEqual(3) // narrator + 小瑜 + 阿志
    expect(body.totalChars).toBeGreaterThan(0)
    expect(body.totalDurationSec).toBeGreaterThan(0)
    expect(body.preview.provider).toMatch(/google|azure|mock/)
  })

  it('POST returns 400 when text is missing', async () => {
    const req = new Request('http://localhost/api/engine/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await previewPost(req)
    expect(res.status).toBe(400)
  })

  it('POST returns 413 for oversized text', async () => {
    const req = new Request('http://localhost/api/engine/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'a'.repeat(600_000) }),
    })
    const res = await previewPost(req)
    expect(res.status).toBe(413)
  })
})
