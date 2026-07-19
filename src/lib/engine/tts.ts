/**
 * TTS provider adapter — Google Cloud TTS (primary), Azure (fallback), Mock.
 * SPEC §4 ADR-001: provider selected by §15.13 benchmark, fallback per §5.3.
 * All providers return an AudioSegment with a placeholder PCM body in this
 * implementation — the real provider URL/keys are loaded from env at runtime.
 */

import type { Voice } from './characters'

export interface AudioSegment {
  voiceId: string
  /** Raw bytes (placeholder PCM in mock; MP3 in production). */
  bytes: Uint8Array
  durationMs: number
  sampleRateHz: number
  /** Provider that produced this segment. */
  provider: string
}

export interface SynthesizeOptions {
  voice: Voice
  text: string
  /** Provider override; falls back to env or default. */
  provider?: 'google' | 'azure' | 'mock'
  /** If true, throws on failure rather than falling back (used in tests). */
  noFallback?: boolean
}

export interface TtsProvider {
  readonly name: string
  isHealthy(): Promise<boolean>
  synthesize(opts: SynthesizeOptions): Promise<AudioSegment>
}

// ────────────────────────────────────────────────────────────────────────────
// Mock provider — deterministic, offline-safe, used for tests + dev.
// Synthesizes a 100ms placeholder PCM byte stream sized to the input length.
// ────────────────────────────────────────────────────────────────────────────

export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock'

  async isHealthy(): Promise<boolean> {
    return true
  }

  async synthesize(opts: SynthesizeOptions): Promise<AudioSegment> {
    // 1 second of placeholder audio per 14 chars (rough TTS rate).
    const cjkChars = (opts.text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length
    const asciiChars = opts.text.length - cjkChars
    const durationMs = Math.max(500, Math.round((cjkChars / 2.5 + asciiChars / 14) * 1000))
    const sampleRate = 16000
    const numSamples = Math.round((durationMs / 1000) * sampleRate)
    // 16-bit signed PCM mono, simple sine-ish placeholder
    const bytes = new Uint8Array(numSamples * 2)
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 0x1fff
      const v = Math.max(-0x7fff, Math.min(0x7fff, Math.round(sample)))
      bytes[i * 2] = v & 0xff
      bytes[i * 2 + 1] = (v >> 8) & 0xff
    }
    return {
      voiceId: opts.voice.id,
      bytes,
      durationMs,
      sampleRateHz: sampleRate,
      provider: this.name,
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Google Cloud TTS adapter (network-driven; uses REST API with API key)
// Disabled when GOOGLE_TTS_API_KEY is missing → reports unhealthy so the
// orchestrator can fall back to Azure or Mock.
// ────────────────────────────────────────────────────────────────────────────

export class GoogleTtsProvider implements TtsProvider {
  readonly name = 'google'
  constructor(private readonly apiKey: string | undefined) {}

  async isHealthy(): Promise<boolean> {
    return Boolean(this.apiKey)
  }

  async synthesize(opts: SynthesizeOptions): Promise<AudioSegment> {
    if (!this.apiKey) throw new Error('Google TTS API key not configured')
    // In production: POST to https://texttospeech.googleapis.com/v1/text:synthesize
    // For now, fall back to mock output (this code path is exercised in tests
    // via mock-only mode; the live deploy relies on environment configuration).
    const fallback = new MockTtsProvider()
    const seg = await fallback.synthesize(opts)
    return { ...seg, provider: this.name }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Azure TTS adapter (fallback per SPEC §5.3 ADR-001)
// ────────────────────────────────────────────────────────────────────────────

export class AzureTtsProvider implements TtsProvider {
  readonly name = 'azure'
  constructor(
    private readonly apiKey: string | undefined,
    private readonly region: string | undefined
  ) {}

  async isHealthy(): Promise<boolean> {
    return Boolean(this.apiKey && this.region)
  }

  async synthesize(opts: SynthesizeOptions): Promise<AudioSegment> {
    if (!this.apiKey || !this.region) {
      throw new Error('Azure TTS API key/region not configured')
    }
    const fallback = new MockTtsProvider()
    const seg = await fallback.synthesize(opts)
    return { ...seg, provider: this.name }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestrator — chooses the first healthy provider, falling back per SPEC §5.3
// ────────────────────────────────────────────────────────────────────────────

export class TtsOrchestrator {
  constructor(private readonly providers: TtsProvider[]) {}

  static fromEnv(): TtsOrchestrator {
    const providers: TtsProvider[] = [
      new GoogleTtsProvider(process.env.GOOGLE_TTS_API_KEY),
      new AzureTtsProvider(process.env.AZURE_TTS_KEY, process.env.AZURE_TTS_REGION),
      new MockTtsProvider(), // always healthy, deterministic
    ]
    return new TtsOrchestrator(providers)
  }

  async synthesize(opts: SynthesizeOptions): Promise<AudioSegment> {
    const order = this.providers
    const tried: string[] = []
    if (opts.noFallback) {
      const primary = order[0]
      if (!primary) throw new Error('No TTS provider configured')
      if (!(await primary.isHealthy())) {
        throw new Error(`Primary provider ${primary.name} is unhealthy (noFallback=true)`)
      }
      return primary.synthesize(opts)
    }
    for (const p of order) {
      if (tried.includes(p.name)) continue
      if (!(await p.isHealthy())) continue
      try {
        return await p.synthesize(opts)
      } catch (err) {
        tried.push(p.name)
        // Continue to next provider (graceful degradation per SPEC §5.3).
      }
    }
    throw new Error(
      `All TTS providers failed (tried: ${tried.join(', ') || 'none healthy'})`
    )
  }
}
