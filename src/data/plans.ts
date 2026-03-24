export const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try it out with browser TTS. No API key needed.',
    badge: 'badge-free',
    features: [
      { text: '10,000 characters/month', included: true },
      { text: 'Browser TTS only (Web Speech API)', included: true },
      { text: 'EPUB, PDF, TXT support', included: true },
      { text: 'Chapter segmentation', included: true },
      { text: 'No MP3 download', included: false },
      { text: 'Priority processing', included: false },
      { text: 'API access', included: false },
    ],
    cta: 'Start Free',
    href: '/register',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'Full MP3 downloads with AI voices for serious readers.',
    badge: 'badge-pro',
    features: [
      { text: '100,000 characters/month', included: true },
      { text: 'ElevenLabs AI voices', included: true },
      { text: 'EPUB, PDF, TXT support', included: true },
      { text: 'Chapter segmentation', included: true },
      { text: 'MP3 download', included: true },
      { text: 'Priority processing', included: true },
      { text: 'API access', included: false },
    ],
    cta: 'Get Pro',
    href: '/register?plan=pro',
    popular: true,
  },
  {
    name: 'Business',
    price: '$29',
    period: '/month',
    description: 'For teams and power users with high-volume needs.',
    badge: 'badge-business',
    features: [
      { text: '500,000 characters/month', included: true },
      { text: 'ElevenLabs AI voices', included: true },
      { text: 'EPUB, PDF, TXT support', included: true },
      { text: 'Chapter segmentation', included: true },
      { text: 'MP3 download', included: true },
      { text: 'Priority processing', included: true },
      { text: 'API access', included: true },
    ],
    cta: 'Get Business',
    href: '/register?plan=business',
    popular: false,
  },
]

export const FAQ = [
  {
    q: 'How does the character limit work?',
    a: 'Each conversion counts the number of characters (text content) processed. Exported audio doesn\'t count — only the text input.',
  },
  {
    q: 'What happens when I hit my monthly limit?',
    a: 'You\'ll see a warning when you\'re at 80% usage. Once you hit the limit, conversions will pause until the next billing cycle or you upgrade.',
  },
  {
    q: 'Do I need an ElevenLabs API key?',
    a: 'For Free tier: No. We use the browser\'s built-in Web Speech API. For Pro/Business: Yes. You bring your own key and pay ElevenLabs directly for TTS credits.',
  },
  {
    q: 'Can I use my own ElevenLabs voice?',
    a: 'Yes! Pro and Business users can use any voice from their ElevenLabs library by entering their API key in Settings.',
  },
  {
    q: 'Are converted files stored permanently?',
    a: 'Files are stored for 30 days. After that, they\'re automatically deleted. Download your audiobooks promptly.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel any time from Settings. Your access continues until the end of the billing period.',
  },
]
