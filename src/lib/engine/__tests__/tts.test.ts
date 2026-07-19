import { describe, it, expect } from 'vitest'
import {
  MockTtsProvider,
  GoogleTtsProvider,
  AzureTtsProvider,
  TtsOrchestrator,
  type SynthesizeOptions,
} from '../tts'
import { BUILTIN_VOICES } from '../characters'

const baseVoice = BUILTIN_VOICES[0]
const baseOpts: SynthesizeOptions = {
  voice: baseVoice,
  text: '小瑜決定出門走走。',
}

describe('tts module — SPEC §4 ADR-001, §5.3 degradation', () => {
  describe('MockTtsProvider', () => {
    it('reports healthy in offline environments', async () => {
      const mock = new MockTtsProvider()
      expect(await mock.isHealthy()).toBe(true)
    })

    it('produces PCM audio bytes scaled to text length', async () => {
      const mock = new MockTtsProvider()
      const seg = await mock.synthesize(baseOpts)
      expect(seg.bytes.length).toBeGreaterThan(0)
      expect(seg.sampleRateHz).toBe(16000)
      expect(seg.provider).toBe('mock')
      expect(seg.voiceId).toBe(baseVoice.id)
    })

    it('produces audio whose duration scales with input length', async () => {
      const mock = new MockTtsProvider()
      const short = await mock.synthesize({ ...baseOpts, text: '你好' })
      const long = await mock.synthesize({
        ...baseOpts,
        text: '從前從前有一個故事很長很長很長很長很長很長。'.repeat(20),
      })
      expect(long.durationMs).toBeGreaterThan(short.durationMs)
    })

    it('produces at least 500ms of audio even for empty text', async () => {
      const mock = new MockTtsProvider()
      const seg = await mock.synthesize({ ...baseOpts, text: '' })
      expect(seg.durationMs).toBeGreaterThanOrEqual(500)
    })
  })

  describe('GoogleTtsProvider', () => {
    it('reports unhealthy when no API key is configured', async () => {
      const g = new GoogleTtsProvider(undefined)
      expect(await g.isHealthy()).toBe(false)
    })

    it('reports healthy when API key is provided', async () => {
      const g = new GoogleTtsProvider('fake-key-for-test')
      expect(await g.isHealthy()).toBe(true)
    })

    it('throws a clear error when synthesizing without a key', async () => {
      const g = new GoogleTtsProvider(undefined)
      await expect(g.synthesize(baseOpts)).rejects.toThrow(/api key/i)
    })
  })

  describe('AzureTtsProvider', () => {
    it('reports unhealthy when key or region is missing', async () => {
      expect(await new AzureTtsProvider(undefined, undefined).isHealthy()).toBe(false)
      expect(await new AzureTtsProvider('k', undefined).isHealthy()).toBe(false)
      expect(await new AzureTtsProvider(undefined, 'eastasia').isHealthy()).toBe(false)
    })

    it('reports healthy when both are provided', async () => {
      expect(await new AzureTtsProvider('k', 'eastasia').isHealthy()).toBe(true)
    })
  })

  describe('TtsOrchestrator (graceful degradation per SPEC §5.3)', () => {
    it('uses Google when configured and skips fallback', async () => {
      const orch = new TtsOrchestrator([
        new GoogleTtsProvider('fake-key'),
        new MockTtsProvider(),
      ])
      const seg = await orch.synthesize(baseOpts)
      expect(seg.provider).toBe('google')
    })

    it('falls back to Mock when Google has no API key', async () => {
      const orch = new TtsOrchestrator([
        new GoogleTtsProvider(undefined),
        new MockTtsProvider(),
      ])
      const seg = await orch.synthesize(baseOpts)
      expect(seg.provider).toBe('mock')
    })

    it('falls back to Azure when Google is unhealthy', async () => {
      const orch = new TtsOrchestrator([
        new GoogleTtsProvider(undefined),
        new AzureTtsProvider('fake-key', 'eastasia'),
        new MockTtsProvider(),
      ])
      const seg = await orch.synthesize(baseOpts)
      expect(seg.provider).toBe('azure')
    })

    it('falls back to Mock when both Google and Azure are unhealthy', async () => {
      const orch = new TtsOrchestrator([
        new GoogleTtsProvider(undefined),
        new AzureTtsProvider(undefined, undefined),
        new MockTtsProvider(),
      ])
      const seg = await orch.synthesize(baseOpts)
      expect(seg.provider).toBe('mock')
    })

    it('throws when noFallback=true and the first provider fails', async () => {
      const orch = new TtsOrchestrator([
        new GoogleTtsProvider(undefined),
        new MockTtsProvider(),
      ])
      await expect(
        orch.synthesize({ ...baseOpts, noFallback: true })
      ).rejects.toThrow()
    })

    it('throws when every provider is exhausted', async () => {
      const orch = new TtsOrchestrator([
        new GoogleTtsProvider(undefined),
        new AzureTtsProvider(undefined, undefined),
      ])
      await expect(orch.synthesize(baseOpts)).rejects.toThrow(/all tts providers/i)
    })

    it('fromEnv() always includes Mock as last-resort fallback', async () => {
      // Force the env to be empty
      const prevGoogle = process.env.GOOGLE_TTS_API_KEY
      const prevAzure = process.env.AZURE_TTS_KEY
      delete process.env.GOOGLE_TTS_API_KEY
      delete process.env.AZURE_TTS_KEY
      try {
        const orch = TtsOrchestrator.fromEnv()
        const seg = await orch.synthesize(baseOpts)
        expect(seg.provider).toBe('mock')
      } finally {
        if (prevGoogle) process.env.GOOGLE_TTS_API_KEY = prevGoogle
        if (prevAzure) process.env.AZURE_TTS_KEY = prevAzure
      }
    })
  })
})
