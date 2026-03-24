# ebook-to-audiobook Product Specification

## 1. Concept & Vision

A polished web app that converts ebooks (EPUB, PDF, TXT) into high-quality audiobooks using ElevenLabs AI voices. Users bring their own ElevenLabs API key, pay only for what they use, and get professional-grade audio output with chapter segmentation.

**Personality:** Clean, developer-friendly, no-nonsense. Like Stripe meets Notion — functional but beautiful.

## 2. Design Language

- **Aesthetic:** Dark-mode-first, minimal luxury. Inspired by Vercel, Linear, Raycast.
- **Colors:**
  - Background: `#09090b` (zinc-950)
  - Surface: `#18181b` (zinc-900)
  - Border: `#27272a` (zinc-800)
  - Text primary: `#fafafa` (zinc-50)
  - Text muted: `#a1a1aa` (zinc-400)
  - Accent: `#7c3aed` (violet-600)
  - Accent hover: `#6d28d9` (violet-700)
  - Success: `#22c55e`
  - Warning: `#f59e0b`
  - Error: `#ef4444`
- **Typography:** Inter (Google Fonts), JetBrains Mono for code/keys
- **Spacing:** 4px base grid, generous padding (24px-48px sections)
- **Motion:** Subtle fade-ins, smooth transitions (200-300ms ease)
- **Icons:** Lucide React

## 3. Pricing Tiers

| Tier | Price | Characters/month | Features |
|------|-------|-----------------|----------|
| Free | $0 | 10,000 (via Web Speech API) | Browser TTS only, no download |
| Pro | $9/mo | 100,000 (ElevenLabs) | Full MP3 download, chapters, priority |
| Business | $29/mo | 500,000 (ElevenLabs) | + Batch processing, team seats, API access |

## 4. User Flow

1. **Landing** → Sign up / Login
2. **Dashboard** → See usage stats, past conversions, manage API key
3. **Converter** → Upload ebook, select voice, convert, download MP3
4. **Settings** → Add/manage ElevenLabs API key, update plan

## 5. Pages

### `/` — Landing Page
- Hero with animated headline
- Feature highlights (3 cards)
- Pricing preview
- CTA buttons (Get Started / Try Free)

### `/pricing` — Pricing Page
- 3-column pricing cards
- Feature comparison table
- FAQ section

### `/converter` — Converter (protected)
- File upload (drag & drop)
- Voice selection dropdown
- Rate/speed control
- Progress bar during conversion
- Chapter list with individual downloads
- Full audiobook download

### `/dashboard` — Dashboard (protected)
- Usage stats (characters used, conversions count)
- Recent conversions list
- Quick actions

### `/settings` — Settings (protected)
- ElevenLabs API key management
- Account info

### `/login` & `/register` — Auth pages

## 6. API Design

### Auth Endpoints
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user

### Conversion Endpoints
- `POST /api/conversions` — Create conversion job
- `GET /api/conversions` — List user's conversions
- `GET /api/conversions/[id]` — Get conversion status/result
- `DELETE /api/conversions/[id]` — Cancel/delete

### API Key Endpoints
- `GET /api/keys` — Get user's ElevenLabs key status
- `POST /api/keys` — Save/update ElevenLabs API key

### Usage Endpoints
- `GET /api/usage` — Get current usage stats

## 7. Data Model (Supabase)

### `users` (managed by Supabase Auth)
- id (uuid, primary key)
- email
- created_at

### `profiles`
- id (uuid, references auth.users)
- plan (enum: free, pro, business)
- elevenlabs_api_key (encrypted, nullable)
- characters_used (int, monthly reset)
- billing_cycle_start (timestamp)
- created_at, updated_at

### `conversions`
- id (uuid, primary key)
- user_id (uuid, references profiles)
- title (text)
- file_type (enum: epub, pdf, txt)
- voice (text)
- status (enum: queued, processing, completed, failed)
- progress (int 0-100)
- chapter_count (int)
- character_count (int)
- audio_url (text, nullable)
- chapter_audios (jsonb)
- error (text, nullable)
- created_at, updated_at

## 8. Technical Notes

- Auth: Supabase Auth with email/password, sessions via HTTP-only cookies
- File upload: client → Supabase Storage → server processes
- TTS: ElevenLabs Text-to-Speech API (server-side, user provides key)
- Conversion: async job with polling (client polls GET endpoint)
- Storage: Supabase Storage for uploaded files and output audio
- Deployment: Vercel (Next.js detected automatically)
