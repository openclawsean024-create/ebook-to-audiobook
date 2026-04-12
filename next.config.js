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
    // pdf-parse ESM has no default export — force CJS version
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdf-parse': 'pdf-parse/dist/pdf-parse/cjs/index.cjs',
    }
    return config
  },
}

module.exports = nextConfig
