# VoxChapter — EPUB to Audiobook

**🚀 Live:** https://ebook-to-audiobook.vercel.app

Convert ebooks (EPUB, TXT) to AI-narrated audiobooks with chapter segmentation.

## Features

- EPUB & TXT parsing
- AI voices via ElevenLabs
- Chapter-segmented MP3 output
- User authentication
- Usage dashboard
- Free / Pro / Business pricing

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Supabase

Create a Supabase project and run the schema:

```bash
# supabase/schema.sql — run in Supabase SQL Editor
```

### 3. Environment variables

```bash
cp .env.local.example .env.local
# Fill in your Supabase URL and anon key
```

### 4. Run locally

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
vercel deploy
```

## Architecture

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Next.js API routes
- **Auth**: Supabase Auth
- **Database**: Supabase (profiles, conversions)
- **Storage**: Supabase Storage (audio files)
- **TTS**: ElevenLabs API (user-provided key)

## Pricing

| Tier | Price | Characters |
|------|-------|-----------|
| Free | $0 | 10,000/mo (browser TTS) |
| Pro | $9/mo | 100,000/mo |
| Business | $29/mo | 500,000/mo |

