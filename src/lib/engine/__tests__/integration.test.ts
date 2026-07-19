import { describe, it, expect } from 'vitest'
import { parsePlainText } from '../parser'
import { detectCharactersFromText, autoAssignVoices, applyPersistentMapping } from '../characters'
import { MockTtsProvider } from '../tts'
import { assembleChapterAudio } from '../audio'
import { buildRssXml, appendToken } from '../rss'
import { buildCues, buildSrt } from '../subtitles'

/**
 * End-to-end smoke test for the v3.0 pipeline:
 *   parse → detect characters → assign voices → synthesize → assemble → RSS.
 * Mirrors the SPEC §2.1 user flow with a synthetic 20-chapter novel.
 */

const PILOT_BOOK = `
第一章 開始
從前從前，有一個程式設計師叫小瑜，她在台北上班，每天通勤一個半小時。

「小瑜」說：「今天我想聽書。」

第二章 通勤
她打開了 ebook-to-audiobook 應用程式。

「小瑜」說：「把這本 EPUB 轉成有聲書吧。」
「阿志」回答：「好啊，我來幫你。」

第三章 上傳
她選擇了「冒險之旅」這本書，按下上傳按鈕。
`.repeat(3) // Triple it to make multiple chapters feel realistic

describe('integration — full pipeline (parse → TTS → audio → RSS)', () => {
  it('processes a 3-chapter book and produces per-chapter audio + RSS', async () => {
    // 1. Parse
    const chapters = parsePlainText(PILOT_BOOK, '冒險之旅')
    expect(chapters.length).toBeGreaterThanOrEqual(3)

    // 2. Detect characters from first chapter
    const detected = detectCharactersFromText(chapters[0].text)
    expect(detected.length).toBeGreaterThanOrEqual(2) // narrator + 小瑜
    expect(detected.find((c) => c.isNarrator)).toBeDefined()

    // 3. Auto-assign voices
    const assigned = autoAssignVoices(detected)
    for (const c of assigned) {
      expect(c.voiceId).not.toBeNull()
    }

    // 4. Synthesize per-chapter using mock TTS
    const tts = new MockTtsProvider()
    const chapterAudios = []
    for (const chapter of chapters.slice(0, 3)) {
      // Re-detect (in real flow this is per-chapter) + apply persistent mapping
      const chapterChars = detectCharactersFromText(chapter.text)
      const chars = applyPersistentMapping(
        autoAssignVoices(chapterChars),
        assigned.map((c) => ({ characterId: c.id, voiceId: c.voiceId || '' }))
      )

      const segmentTexts = chapter.text.split(/(?<=[。！？])/).filter((s) => s.trim())
      const segments = []
      for (let i = 0; i < segmentTexts.length; i++) {
        const character = chars[i % chars.length]
        if (!character.voiceId) continue
        const voice = { id: character.voiceId, name: character.displayName, gender: 'neutral', locale: 'zh-TW', type: 'builtin', provider: 'mock' } as const
        const seg = await tts.synthesize({
          voice,
          text: segmentTexts[i],
        })
        segments.push({ character, segment: seg })
      }

      const audio = assembleChapterAudio({
        bookTitle: '冒險之旅',
        bookSlug: 'adventure',
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        author: '小說家 Sean',
        segments,
      })

      expect(audio.durationMs).toBeGreaterThan(0)
      expect(audio.markers.length).toBe(segments.length)
      expect(audio.wavBytes.length).toBeGreaterThan(44) // header + content
      expect(audio.fileName).toBe(`adventure-chapter-${String(chapter.number).padStart(2, '0')}.mp3`)

      chapterAudios.push(audio)
    }

    // 5. Build the RSS feed (one item per chapter)
    const rss = buildRssXml({
      title: '冒險之旅',
      author: '小說家 Sean',
      description: '一個繁中小說有聲書',
      language: 'zh-TW',
      imageUrl: null,
      link: 'https://ebook-to-audiobook.app',
      audioBaseUrl: 'https://ebook-to-audiobook.app/api/audio',
      token: 'pilot-token-xyz',
      episodes: chapterAudios.map((a) => ({
        chapterNumber: a.chapterNumber,
        title: a.chapterTitle,
        description: a.chapterTitle,
        audioUrl: `https://ebook-to-audiobook.app/api/audio/${a.fileName}`,
        durationSeconds: Math.ceil(a.durationMs / 1000),
        pubDate: new Date(),
        fileSizeBytes: a.wavBytes.length,
      })),
    })

    expect(rss).toContain('<rss version="2.0"')
    const itemCount = (rss.match(/<item>/g) || []).length
    expect(itemCount).toBe(chapterAudios.length)
    expect(rss).toContain('token=pilot-token-xyz')

    // 6. Build SRT subtitles for chapter 1
    const cues = buildCues(chapterAudios[0].markers, ['segment text 1', 'segment text 2'])
    const srt = buildSrt(cues)
    expect(srt.startsWith('1\n')).toBe(true)

    // 7. Token rotation works
    const oldUrl = 'https://example.com/audio.mp3'
    const oldWith = appendToken(oldUrl, 'old-token')
    const newWith = appendToken(oldUrl, 'new-token')
    expect(oldWith).not.toBe(newWith)
  })
})
