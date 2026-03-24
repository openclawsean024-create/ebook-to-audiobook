import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VoxChapter — EPUB to Audiobook',
  description: 'Convert your ebooks to professional audiobooks with AI voices. Support EPUB, PDF, TXT to MP3 with chapter segmentation.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
        {children}
      </body>
    </html>
  )
}
