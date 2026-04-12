/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['adm-zip', 'pdfjs-dist', 'pdf-parse'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle server-only packages on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
