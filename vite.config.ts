import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE is the URL path the app is served from. GitHub Pages project sites live at /<repo>/.
// Override with `BASE=/ npm run build` for root-hosted deploys (Netlify, Cloudflare Pages).
const base = process.env.BASE ?? '/';

export default defineConfig({
  base,
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.png', 'favicon.png'],
      manifest: {
        name: 'Sensory Town',
        short_name: 'Sensory Town',
        description: 'A cozy 3D toy town: dress up, drive, build, squish, stretch and crack.',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#fbe9f1',
        theme_color: '#f7c6d9',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,webmanifest,woff2,mp3,wav,ogg,glb}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
