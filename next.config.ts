import path from 'node:path'
import type { NextConfig } from 'next'

// Radice del progetto fissa: se in una cartella superiore c'e' un'altra package-lock.json
// (capita sui server Windows) Next non sposta server.js in una sottocartella dello standalone.
const radice = path.resolve(__dirname)

const nextConfig: NextConfig = {
  // Build autosufficiente per Docker (BUILD_STANDALONE=1, vedi Dockerfile). In locale si usa `npm start`.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: radice,
  turbopack: { root: radice },
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
