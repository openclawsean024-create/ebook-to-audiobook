import Link from 'next/link'
import NavbarLanding from '@/components/NavbarLanding'
import { PLANS, FAQ } from '@/data/plans'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <NavbarLanding />
      <div className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              Start free. Upgrade when you need more. Bring your own ElevenLabs key for TTS.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-20">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`card relative ${plan.popular ? 'border-violet-600 shadow-lg shadow-violet-950/30' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-violet-600 text-white">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <span className={`badge ${plan.badge} mb-3`}>{plan.name}</span>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-zinc-500 mb-1">{plan.period}</span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-2">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      {f.included ? (
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" x2="6" y1="6" y2="18"/>
                          <line x1="6" x2="18" y1="6" y2="18"/>
                        </svg>
                      )}
                      <span className={f.included ? 'text-zinc-300' : 'text-zinc-600'}>{f.text}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={plan.popular ? 'btn-primary w-full justify-center' : 'btn-secondary w-full justify-center'}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div>
            <h2 className="text-2xl font-bold text-center mb-10">Frequently asked questions</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {FAQ.map((item, i) => (
                <div key={i} className="card">
                  <h3 className="font-medium mb-2">{item.q}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
