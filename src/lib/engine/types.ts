/**
 * Book parser: EPUB / PDF / TXT → structured book with chapters.
 * Spec §3 FR-001 + AC-FR-001.
 */

export interface Chapter {
  number: number
  title: string
  text: string
  charCount: number
}

export interface ParsedBook {
  title: string
  author: string | null
  fileType: 'epub' | 'pdf' | 'txt'
  totalChars: number
  chapters: Chapter[]
  warnings: string[]
  /** True if the file is a scanned PDF needing OCR (P1 feature). */
  needsOcr: boolean
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB per SPEC §3.1 FR-001
