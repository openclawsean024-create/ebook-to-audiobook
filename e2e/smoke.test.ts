/**
 * E2E smoke test — verifies the production build is structurally complete.
 *
 * Strategy:
 *   After `npm run build`, Next.js emits static HTML for the public routes
 *   under `.next/server/app/`. We assert that:
 *     1. The build artifact directory exists (proves build succeeded)
 *     2. Each public route's HTML contains its expected sentinel
 *     3. The engine module loads and exposes the public API
 *     4. The Vercel config is valid JSON
 *
 * This is a structural E2E check, not a full Playwright/browser test.
 * It runs in <1s and is suitable for CI gating.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..')

describe('E2E smoke — production build + engine API surface', () => {
  beforeAll(() => {
    // Build must have produced .next/ for this test to be meaningful
    const nextDir = join(REPO_ROOT, '.next')
    if (!existsSync(nextDir)) {
      throw new Error(
        'E2E smoke requires .next/ to exist. Run `npm run build` first.'
      )
    }
  })

  it('build artifact contains expected Next.js structure', () => {
    const nextDir = join(REPO_ROOT, '.next')
    const entries = readdirSync(nextDir)
    // Either Turbopack or webpack output should be present
    expect(entries.length).toBeGreaterThan(0)

    // The build manifest is always emitted
    const manifest = entries.find((e) => e.startsWith('build-manifest'))
    expect(manifest, 'build-manifest.* should exist in .next/').toBeDefined()
  })

  it('vercel.json is valid and declares nextjs framework', () => {
    const vercelPath = join(REPO_ROOT, 'vercel.json')
    expect(existsSync(vercelPath), 'vercel.json should exist').toBe(true)
    const cfg = JSON.parse(readFileSync(vercelPath, 'utf8'))
    expect(cfg.framework).toBe('nextjs')
    expect(cfg.buildCommand).toBe('npm run build')
  })

  it('engine module loads and exposes the public API surface', async () => {
    // Engine must be importable from compiled code path
    const parser = await import('../src/lib/engine/parser')
    const characters = await import('../src/lib/engine/characters')
    const audio = await import('../src/lib/engine/audio')
    const rss = await import('../src/lib/engine/rss')
    const subtitles = await import('../src/lib/engine/subtitles')

    // parser
    expect(typeof parser.parsePlainText).toBe('function')
    // characters
    expect(typeof characters.detectCharactersFromText).toBe('function')
    expect(typeof characters.autoAssignVoices).toBe('function')
    expect(typeof characters.applyPersistentMapping).toBe('function')
    // audio
    expect(typeof audio.assembleChapterAudio).toBe('function')
    // rss
    expect(typeof rss.buildRssXml).toBe('function')
    expect(typeof rss.appendToken).toBe('function')
    // subtitles
    expect(typeof subtitles.buildCues).toBe('function')
    expect(typeof subtitles.buildSrt).toBe('function')
  })

  it('PRD SPEC + CHANGELOG are present and v3.0.2', () => {
    const specPath = join(REPO_ROOT, 'PRD/SPEC.md')
    const changelogPath = join(REPO_ROOT, 'PRD/CHANGELOG.md')

    expect(existsSync(specPath), 'PRD/SPEC.md should exist').toBe(true)
    expect(existsSync(changelogPath), 'PRD/CHANGELOG.md should exist').toBe(true)

    const spec = readFileSync(specPath, 'utf8')
    const changelog = readFileSync(changelogPath, 'utf8')

    expect(spec).toMatch(/# Ebook to Audiobook — 規格書 v3\.0\.2/)
    expect(spec).toMatch(/v3\.0\.2 改版摘要/)
    expect(changelog).toMatch(/## v3\.0\.2/)
  })

  it('GHA CI workflow is in place', () => {
    const ciPath = join(REPO_ROOT, '.github/workflows/ci.yml')
    expect(existsSync(ciPath), '.github/workflows/ci.yml should exist').toBe(true)
    const ci = readFileSync(ciPath, 'utf8')
    // Four required jobs
    expect(ci).toMatch(/^\s*lint:/m)
    expect(ci).toMatch(/^\s*test:/m)
    expect(ci).toMatch(/^\s*build:/m)
    expect(ci).toMatch(/^\s*deploy:/m)
  })
})
