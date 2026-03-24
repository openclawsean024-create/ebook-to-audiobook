import Link from 'next/link'
import NavbarLanding from '@/components/NavbarLanding'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavbarLanding />

      {/* Hero */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-800/50 text-violet-300 text-sm mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
            Now in public beta
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 animate-fade-in animate-fade-in-delay-1">
            Turn any ebook into an{' '}
            <span className="bg-gradient-to-r from-violet-400 to-violet-600 bg-clip-text text-transparent">
              audiobook
            </span>
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 animate-fade-in animate-fade-in-delay-2">
            Upload EPUB, PDF, or TXT. Get a chapter-segmented MP3 with AI voices.
            No account needed to try — bring your own ElevenLabs key for MP3 export.
          </p>

          <div className="flex items-center justify-center gap-4 animate-fade-in animate-fade-in-delay-3">
            <Link href="/register" className="btn-primary px-8 py-3 text-base">
              Start Converting Free
            </Link>
            <Link href="/pricing" className="btn-secondary px-8 py-3 text-base">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Demo Preview */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-2xl shadow-violet-950/20">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              <span className="ml-3 text-xs text-zinc-500 font-mono">voxchapter.app/converter</span>
            </div>
            <div className="p-8 bg-gradient-to-b from-zinc-900 to-zinc-950">
              <div className="flex gap-6">
                <div className="flex-1 space-y-4">
                  <div className="border border-zinc-700 border-dashed rounded-xl p-6 text-center">
                    <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" x2="12" y1="3" y2="15"/>
                    </svg>
                    <p className="text-sm text-zinc-500">Drop your EPUB, PDF, or TXT here</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['zh-CN-Xiaoxiao', 'en-US-Jenny', 'ja-JP-Nanami'].map((v) => (
                      <div key={v} className="text-xs bg-zinc-800 rounded-lg p-2 text-zinc-400 font-mono">{v}</div>
                    ))}
                  </div>
                </div>
                <div className="w-48 space-y-3">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Progress</div>
                  <div className="space-y-2">
                    {[60, 85, 100].map((p) => (
                      <div key={p}>
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                          <span>Chapter {p === 60 ? 1 : p === 85 ? 2 : 3}</span>
                          <span>{p}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-600 rounded-full" style={{ width: `${p}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Everything you need</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" x2="8" y1="13" y2="13"/>
                    <line x1="16" x2="8" y1="17" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                ),
                title: 'All ebook formats',
                desc: 'EPUB, PDF, TXT — we parse them all and extract clean text with chapter structure.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                  </svg>
                ),
                title: 'Chapter-segmented audio',
                desc: 'Not one giant file. Get individual chapter MP3s + a merged full audiobook.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                ),
                title: 'AI voices via ElevenLabs',
                desc: 'Bring your own ElevenLabs API key. Pay them directly. Professional quality, fair price.',
              },
            ].map((f, i) => (
              <div key={i} className={`card animate-fade-in animate-fade-in-delay-${i + 1}`}>
                <div className="w-10 h-10 rounded-lg bg-violet-950/50 border border-violet-800/50 flex items-center justify-center text-violet-400 mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-32">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl bg-gradient-to-r from-violet-950/50 to-zinc-900 border border-violet-800/30 p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to listen to your books?</h2>
            <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
              Free tier lets you try with browser TTS. No credit card, no API key needed.
            </p>
            <Link href="/register" className="btn-primary px-8 py-3 text-base">
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-violet-600 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            VoxChapter
          </div>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link href="/converter" className="hover:text-zinc-300 transition-colors">Converter</Link>
            <Link href="/dashboard" className="hover:text-zinc-300 transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
