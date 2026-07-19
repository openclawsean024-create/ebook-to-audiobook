/**
 * Character detection & voice mapping.
 * SPEC §3 FR-002 / AC-FR-002: narrator + ≥3 characters, voice mapping
 * consistent across chapters, user can manually override.
 */

export type VoiceType = 'builtin' | 'cloned'

export interface Voice {
  id: string
  name: string
  /** Voice gender tag (informational, not enforced). */
  gender: 'male' | 'female' | 'neutral'
  /** Locale code, e.g. zh-TW, en-US. */
  locale: string
  type: VoiceType
  /** Provider: google, azure, elevenlabs, mock. */
  provider: string
}

export interface Character {
  /** Unique id within a book. */
  id: string
  /** Display name as it appears in dialogue, e.g. "小瑜", "Narrator". */
  displayName: string
  /** True if this is the narrator (always present). */
  isNarrator: boolean
  /** Resolved voice (null until user assigns). */
  voiceId: string | null
  /** Detection confidence in 0..1. Below 0.5 needs user confirmation per SPEC §5.3. */
  confidence: number
}

export interface VoiceAssignment {
  characterId: string
  voiceId: string
}

// ────────────────────────────────────────────────────────────────────────────
// Built-in voice library (SPEC §3 FR-002: 5 voices — 2 male, 2 female, 1 neutral)
// ────────────────────────────────────────────────────────────────────────────

export const BUILTIN_VOICES: Voice[] = [
  { id: 'zh-TW-female-1', name: '曉瑜 (女聲 1)', gender: 'female', locale: 'zh-TW', type: 'builtin', provider: 'google' },
  { id: 'zh-TW-female-2', name: '思婷 (女聲 2)', gender: 'female', locale: 'zh-TW', type: 'builtin', provider: 'google' },
  { id: 'zh-TW-male-1', name: '俊宏 (男聲 1)', gender: 'male', locale: 'zh-TW', type: 'builtin', provider: 'google' },
  { id: 'zh-TW-male-2', name: '家銘 (男聲 2)', gender: 'male', locale: 'zh-TW', type: 'builtin', provider: 'google' },
  { id: 'zh-TW-neutral-1', name: '中性旁白', gender: 'neutral', locale: 'zh-TW', type: 'builtin', provider: 'google' },
]

export function listBuiltinVoices(): Voice[] {
  return [...BUILTIN_VOICES]
}

export function getVoiceById(id: string): Voice | null {
  return BUILTIN_VOICES.find((v) => v.id === id) ?? null
}

// ────────────────────────────────────────────────────────────────────────────
// Character detection (regex-based heuristic)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract distinct character names from chapter text.
 * Detects lines like:
 *   「小瑜」說：「我們走吧。」
 *   小瑜：「好啊。」
 *   "Tom said, 'hello'"
 */
export function detectCharactersFromText(text: string): Character[] {
  const narrator: Character = {
    id: 'narrator',
    displayName: 'Narrator',
    isNarrator: true,
    voiceId: null,
    confidence: 1,
  }
  const seen = new Map<string, number>()

  // Pattern 1: 「Name」 (closing quote followed by a verb)
  const pattern1 = /[「『"']([^「『"'"]{1,12})[」』"'"]\s*(?:說|回答|問|喊|笑道|低聲|道|問道|喊道|說道|叫|呼喊)/g
  // Pattern 2: Name：「dialogue」 (no closing verb)
  const pattern2 = /^([\p{Script=Han}\p{L}]{1,12})\s*[：:]\s*[「『"']/gum
  // Pattern 3: Name said/asked/replied (English)
  const pattern3 = /\b([A-Z][a-z]{1,15})\s+(?:said|asked|replied|shouted|whispered|cried|exclaimed)\b/g

  for (const re of [pattern1, pattern2, pattern3]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = (m[1] || '').trim()
      if (!name || name.length < 1) continue
      if (/^(我|你|他|她|它|我们|你們|他們|她們)$/.test(name)) continue
      seen.set(name, (seen.get(name) || 0) + 1)
    }
  }

  const characters: Character[] = [narrator]
  for (const [name, count] of seen.entries()) {
    // Skip narrator & extremely common words
    if (name === 'Narrator' || name === 'narrator') continue
    // Confidence = occurrences capped at 1.0
    const confidence = Math.min(1, count / 3)
    characters.push({
      id: slugifyCharId(name),
      displayName: name,
      isNarrator: false,
      voiceId: null,
      confidence,
    })
  }
  return characters
}

function slugifyCharId(name: string): string {
  return `char-${name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, '_')}`
}

/**
 * Resolve every character's voice. If a character has no voice, assign the
 * next unused builtin voice (cycling if exhausted).
 */
export function autoAssignVoices(
  characters: Character[],
  availableVoices: Voice[] = BUILTIN_VOICES
): Character[] {
  let voiceIdx = 0
  return characters.map((c) => {
    if (c.voiceId) return c
    if (c.isNarrator) {
      // Narrator gets the neutral voice by convention.
      const narratorVoice =
        availableVoices.find((v) => v.gender === 'neutral') || availableVoices[0]
      return { ...c, voiceId: narratorVoice?.id ?? null }
    }
    const v = availableVoices[voiceIdx % availableVoices.length]
    voiceIdx++
    return { ...c, voiceId: v.id }
  })
}

/**
 * AC-FR-002: a character's voice must be the same across all chapters.
 * This applies an existing assignment to a new chapter's character list.
 */
export function applyPersistentMapping(
  characters: Character[],
  existingAssignments: VoiceAssignment[]
): Character[] {
  const map = new Map(existingAssignments.map((a) => [a.characterId, a.voiceId]))
  return characters.map((c) => ({
    ...c,
    voiceId: c.voiceId ?? map.get(c.id) ?? null,
  }))
}

/**
 * Detect characters needing user confirmation (confidence < 0.5 per SPEC §5.3).
 */
export function needsUserConfirmation(characters: Character[]): Character[] {
  return characters.filter((c) => !c.isNarrator && c.confidence < 0.5)
}
