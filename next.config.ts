import type { NextConfig } from 'next'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\/api\/tasks.*/,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-tasks', networkTimeoutSeconds: 10 },
    },
    {
      urlPattern: /\/api\/goals.*/,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-goals', networkTimeoutSeconds: 10 },
    },
  ],
})

const nextConfig: NextConfig = {
  // Server Actions are enabled by default in Next.js 15
}

export default withPWA(nextConfig)
