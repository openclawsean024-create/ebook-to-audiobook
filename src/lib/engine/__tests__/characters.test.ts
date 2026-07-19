import { describe, it, expect } from 'vitest'
import {
  BUILTIN_VOICES,
  listBuiltinVoices,
  getVoiceById,
  detectCharactersFromText,
  autoAssignVoices,
  applyPersistentMapping,
  needsUserConfirmation,
} from '../characters'

describe('characters module — SPEC §3 FR-002 / AC-FR-002', () => {
  describe('listBuiltinVoices', () => {
    it('exposes exactly 5 builtin voices (SPEC: 2 male + 2 female + 1 neutral)', () => {
      const voices = listBuiltinVoices()
      expect(voices).toHaveLength(5)
      const female = voices.filter((v) => v.gender === 'female').length
      const male = voices.filter((v) => v.gender === 'male').length
      const neutral = voices.filter((v) => v.gender === 'neutral').length
      expect(female).toBe(2)
      expect(male).toBe(2)
      expect(neutral).toBe(1)
    })

    it('returns a defensive copy, not the internal array', () => {
      const a = listBuiltinVoices()
      const b = listBuiltinVoices()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })

    it('all builtin voices have provider=google and locale=zh-TW', () => {
      for (const v of BUILTIN_VOICES) {
        expect(v.provider).toBe('google')
        expect(v.locale).toBe('zh-TW')
      }
    })
  })

  describe('getVoiceById', () => {
    it('returns the matching voice when found', () => {
      const v = getVoiceById(BUILTIN_VOICES[0].id)
      expect(v?.id).toBe(BUILTIN_VOICES[0].id)
    })

    it('returns null for an unknown id', () => {
      expect(getVoiceById('does-not-exist')).toBeNull()
    })
  })

  describe('detectCharactersFromText', () => {
    it('always includes a narrator character', () => {
      const chars = detectCharactersFromText('隨便一段文字沒有對話。')
      const narrator = chars.find((c) => c.isNarrator)
      expect(narrator).toBeDefined()
      expect(narrator?.displayName).toBe('Narrator')
    })

    it('detects a Chinese speaker in 「Name」 said：「dialogue」 form', () => {
      const text = '「小瑜」說：「我們走吧。」'
      const chars = detectCharactersFromText(text)
      expect(chars.find((c) => c.displayName === '小瑜')).toBeDefined()
    })

    it('detects multiple characters in mixed dialogue', () => {
      const text = [
        '「小瑜」說：「好啊。」',
        '「阿志」回答：「我來了。」',
        '「阿志」說道：「走吧。」',
      ].join('\n')
      const chars = detectCharactersFromText(text)
      const names = chars.map((c) => c.displayName)
      expect(names).toContain('小瑜')
      expect(names).toContain('阿志')
    })

    it('ignores first-person pronouns (我/你/他)', () => {
      const text = '「我」說：「好啊。」「他」說：「不行。」'
      const chars = detectCharactersFromText(text)
      const names = chars.map((c) => c.displayName)
      expect(names).not.toContain('我')
      expect(names).not.toContain('他')
    })

    it('detects English speakers (Tom said, Alice replied)', () => {
      const text = 'Tom said, "Hello!" Alice replied, "Hi!"'
      const chars = detectCharactersFromText(text)
      const names = chars.map((c) => c.displayName)
      expect(names).toContain('Tom')
      expect(names).toContain('Alice')
    })

    it('returns no characters when text has no dialogue', () => {
      const chars = detectCharactersFromText('這是一段完全沒有對話的敘述性文字。')
      // Only narrator
      expect(chars).toHaveLength(1)
      expect(chars[0].isNarrator).toBe(true)
    })

    it('assigns increasing confidence with more mentions', () => {
      const once = detectCharactersFromText('「小瑜」說：「一次」')
      const triple = detectCharactersFromText(
        '「小瑜」說：「一」。「小瑜」說：「二」。「小瑜」說：「三」。'
      )
      const onceChar = once.find((c) => c.displayName === '小瑜')!
      const tripleChar = triple.find((c) => c.displayName === '小瑜')!
      expect(tripleChar.confidence).toBeGreaterThanOrEqual(onceChar.confidence)
    })
  })

  describe('autoAssignVoices', () => {
    it('assigns the narrator the neutral voice', () => {
      const chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: null, confidence: 1 },
        { id: 'char-a', displayName: '小瑜', isNarrator: false, voiceId: null, confidence: 0.8 },
      ]
      const assigned = autoAssignVoices(chars)
      const narrator = assigned.find((c) => c.isNarrator)!
      const neutral = BUILTIN_VOICES.find((v) => v.gender === 'neutral')!
      expect(narrator.voiceId).toBe(neutral.id)
    })

    it('preserves already-assigned voices', () => {
      const chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: 'fixed', confidence: 1 },
      ]
      const assigned = autoAssignVoices(chars)
      expect(assigned[0].voiceId).toBe('fixed')
    })

    it('ensures every non-narrator character has a voice after auto-assign', () => {
      const chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: null, confidence: 1 },
        { id: 'a', displayName: '小瑜', isNarrator: false, voiceId: null, confidence: 0.9 },
        { id: 'b', displayName: '阿志', isNarrator: false, voiceId: null, confidence: 0.7 },
        { id: 'c', displayName: 'Mandy', isNarrator: false, voiceId: null, confidence: 0.6 },
      ]
      const assigned = autoAssignVoices(chars)
      for (const c of assigned) {
        expect(c.voiceId).not.toBeNull()
      }
    })
  })

  describe('applyPersistentMapping', () => {
    it('keeps existing voice mapping for known characters across chapters (AC-FR-002)', () => {
      const chapter2Chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: null, confidence: 1 },
        { id: 'char-xiaoyu', displayName: '小瑜', isNarrator: false, voiceId: null, confidence: 0.8 },
      ]
      const chapter1Assignments = [
        { characterId: 'narrator', voiceId: 'neutral-voice' },
        { characterId: 'char-xiaoyu', voiceId: 'voice-a' },
      ]
      const merged = applyPersistentMapping(chapter2Chars, chapter1Assignments)
      const xiaoyu = merged.find((c) => c.id === 'char-xiaoyu')!
      const narrator = merged.find((c) => c.isNarrator)!
      expect(xiaoyu.voiceId).toBe('voice-a')
      expect(narrator.voiceId).toBe('neutral-voice')
    })

    it('does not override an already-set voice in the new chapter', () => {
      const chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: 'manual-narrator', confidence: 1 },
      ]
      const result = applyPersistentMapping(chars, [{ characterId: 'narrator', voiceId: 'old-voice' }])
      expect(result[0].voiceId).toBe('manual-narrator')
    })
  })

  describe('needsUserConfirmation', () => {
    it('returns characters with confidence below 0.5 (SPEC §5.3)', () => {
      const chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: 'v', confidence: 1 },
        { id: 'a', displayName: 'X', isNarrator: false, voiceId: 'v', confidence: 0.3 },
        { id: 'b', displayName: 'Y', isNarrator: false, voiceId: 'v', confidence: 0.7 },
      ]
      const low = needsUserConfirmation(chars)
      expect(low).toHaveLength(1)
      expect(low[0].id).toBe('a')
    })

    it('excludes narrator even at low confidence', () => {
      const chars = [
        { id: 'narrator', displayName: 'Narrator', isNarrator: true, voiceId: 'v', confidence: 0.1 },
      ]
      expect(needsUserConfirmation(chars)).toEqual([])
    })
  })
})
