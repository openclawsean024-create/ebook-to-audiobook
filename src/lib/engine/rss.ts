/**
 * Podcast RSS feed generator (SPEC §3 FR-004 / AC-FR-004).
 * Produces RSS 2.0 with iTunes namespace, private token auth, chapter items.
 */

export interface RssEpisode {
  chapterNumber: number
  title: string
  description: string
  audioUrl: string
  durationSeconds: number
  pubDate: Date
  fileSizeBytes: number
}

export interface RssChannel {
  title: string
  author: string
  description: string
  language: string
  imageUrl: string | null
  /** RSS feed's "home" URL (where users manage their podcast). */
  link: string
  /** Token-protected audio base URL. */
  audioBaseUrl: string
  /** Private RSS token; embed as query param so token rotation is trivial. */
  token: string
  episodes: RssEpisode[]
}

const FEED_VERSION = '2.0'

/** Escape special XML chars. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function fmtRfc2822(d: Date): string {
  return d.toUTCString()
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * Build a fully-spec-compliant RSS 2.0 + iTunes podcast XML.
 * SPEC FR-004: standard RSS + iTunes namespace, private token auth, chapter items.
 */
export function buildRssXml(channel: RssChannel): string {
  const items = channel.episodes
    .map((ep) => {
      const audioUrlWithToken = appendToken(ep.audioUrl, channel.token)
      return [
        '    <item>',
        `      <title>${esc(ep.title)}</title>`,
        `      <description>${esc(ep.description)}</description>`,
        `      <pubDate>${fmtRfc2822(ep.pubDate)}</pubDate>`,
        `      <guid isPermaLink="false">chapter-${ep.chapterNumber}-${channel.token.slice(0, 8)}</guid>`,
        `      <enclosure url="${esc(audioUrlWithToken)}" length="${ep.fileSizeBytes}" type="audio/mpeg" />`,
        `      <itunes:duration>${fmtDuration(ep.durationSeconds)}</itunes:duration>`,
        `      <itunes:episode>${ep.chapterNumber}</itunes:episode>`,
        `      <itunes:episodeType>full</itunes:episodeType>`,
        `      <itunes:explicit>false</itunes:explicit>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  const image = channel.imageUrl
    ? `<itunes:image href="${esc(channel.imageUrl)}" />`
    : '<itunes:image />'

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="${FEED_VERSION}" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(channel.title)}</title>
    <link>${esc(channel.link)}</link>
    <language>${esc(channel.language)}</language>
    <description>${esc(channel.description)}</description>
    <atom:link href="${esc(channel.link)}?token=${esc(channel.token)}" rel="self" type="application/rss+xml" />
    ${image}
    <itunes:author>${esc(channel.author)}</itunes:author>
    <itunes:summary>${esc(channel.description)}</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:owner>
      <itunes:name>${esc(channel.author)}</itunes:name>
    </itunes:owner>
${items}
  </channel>
</rss>
`
}

/**
 * Append the RSS token to an audio URL as a query parameter.
 * The token may be rotated independently of the audio URL.
 */
export function appendToken(audioUrl: string, token: string): string {
  if (!token) return audioUrl
  const sep = audioUrl.includes('?') ? '&' : '?'
  return `${audioUrl}${sep}token=${encodeURIComponent(token)}`
}

/**
 * SPEC §2.3 / ADR-005: regenerate a fresh RSS token (UUIDv4-ish).
 * Uses crypto.randomUUID() when available; falls back to a v4-like hex string.
 */
export function regenerateRssToken(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // 32-char hex fallback
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}
