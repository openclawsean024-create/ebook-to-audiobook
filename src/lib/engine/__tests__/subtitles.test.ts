import { describe, it, expect } from 'vitest'
import { buildCues, buildSrt, buildVtt } from '../subtitles'
import type { ChapterMarker } from '../audio'

const markers: ChapterMarker[] = [
  { index: 0, label: 'Narrator', startMs: 0, endMs: 1500, voiceId: 'v1' },
  { index: 1, label: '小瑜', startMs: 1500, endMs: 3200, voiceId: 'v2' },
  { index: 2, label: '阿志', startMs: 3200, endMs: 5000, voiceId: 'v3' },
]

const texts = ['故事開始。', '我們出發吧！', '好啊，走吧！']

describe('subtitles module — 字幕輸出', () => {
  describe('buildCues', () => {
    it('creates one cue per marker with text from segmentTexts', () => {
      const cues = buildCues(markers, texts)
      expect(cues).toHaveLength(3)
      expect(cues[0]).toMatchObject({
        index: 1,
        startMs: 0,
        endMs: 1500,
        speaker: 'Narrator',
        text: '故事開始。',
      })
    })

    it('handles missing segment text by using empty string', () => {
      const cues = buildCues(markers, ['only one'])
      expect(cues[1].text).toBe('')
      expect(cues[2].text).toBe('')
    })

    it('handles empty markers', () => {
      expect(buildCues([], [])).toEqual([])
    })
  })

  describe('buildSrt', () => {
    it('starts each cue block with a 1-based index', () => {
      const cues = buildCues(markers, texts)
      const srt = buildSrt(cues)
      expect(srt.startsWith('1\n')).toBe(true)
    })

    it('uses HH:MM:SS,mmm time format', () => {
      const cues = buildCues(markers, texts)
      const srt = buildSrt(cues)
      expect(srt).toContain('00:00:00,000 --> 00:00:01,500')
      expect(srt).toContain('00:00:01,500 --> 00:00:03,200')
    })

    it('prefixes cue text with speaker label', () => {
      const cues = buildCues(markers, texts)
      const srt = buildSrt(cues)
      expect(srt).toContain('Narrator: 故事開始。')
      expect(srt).toContain('小瑜: 我們出發吧！')
    })
  })

  describe('buildVtt', () => {
    it('starts with the WEBVTT magic header', () => {
      const cues = buildCues(markers, texts)
      const vtt = buildVtt(cues)
      expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    })

    it('uses HH:MM:SS.mmm time format', () => {
      const cues = buildCues(markers, texts)
      const vtt = buildVtt(cues)
      expect(vtt).toContain('00:00:00.000 --> 00:00:01.500')
    })

    it('uses <v Speaker>...</v> voice tags', () => {
      const cues = buildCues(markers, texts)
      const vtt = buildVtt(cues)
      expect(vtt).toContain('<v Narrator>故事開始。</v>')
      expect(vtt).toContain('<v 小瑜>我們出發吧！</v>')
    })
  })
})
