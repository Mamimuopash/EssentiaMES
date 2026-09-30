import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Build autosufficiente per Docker (BUILD_STANDALONE=1, vedi Dockerfile). In locale si usa `npm start`.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // Pacchetti Node-only che non devono essere impacchettati dal bundler.
  serverExternalPackages: ['mssql', 'tedious', 'exceljs', 'nodemailer'],
  // Il template Excel dei lotti viene letto a runtime: lo includiamo nel bundle standalone.
  outputFileTracingIncludes: {
    '/api/lotti/[id]/excel': ['./templates/**/*'],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
