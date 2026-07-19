/**
 * Subtitle generators — SRT and WebVTT.
 * Uses chapter markers to produce per-segment cues with character attribution.
 */

import type { ChapterMarker } from './audio'

export interface SubtitleCue {
  index: number
  startMs: number
  endMs: number
  /** Speaker label, e.g. "Narrator" or "小瑜". */
  speaker: string
  /** Cue text. */
  text: string
}

function fmtSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const t = ms % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(t, 3)}`
}

function fmtVttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const t = ms % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(t, 3)}`
}

/**
 * Build per-segment cues from chapter markers + per-segment text.
 */
export function buildCues(
  markers: ChapterMarker[],
  segmentTexts: string[]
): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]
    const text = segmentTexts[i] ?? ''
    cues.push({
      index: i + 1,
      startMs: m.startMs,
      endMs: m.endMs,
      speaker: m.label,
      text,
    })
  }
  return cues
}

/**
 * SRT (SubRip) subtitle format.
 */
export function buildSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (c) =>
        `${c.index}\n${fmtSrtTime(c.startMs)} --> ${fmtSrtTime(c.endMs)}\n${c.speaker}: ${c.text}\n`
    )
    .join('\n')
}

/**
 * WebVTT subtitle format.
 */
export function buildVtt(cues: SubtitleCue[]): string {
  const header = 'WEBVTT\n\n'
  const body = cues
    .map(
      (c) =>
        `${c.index}\n${fmtVttTime(c.startMs)} --> ${fmtVttTime(c.endMs)}\n<v ${c.speaker}>${c.text}</v>\n`
    )
    .join('\n')
  return header + body
}
