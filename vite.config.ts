import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 本機開發時模擬 Vercel 函式代理（api/twse.ts、api/tpex.ts），直接轉發到官方 API
  server: {
    proxy: {
      '/api/twse': {
        target: 'https://www.twse.com.tw',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api\/twse/, '/rwd/zh/afterTrading/STOCK_DAY'),
      },
      '/api/tpex': {
        target: 'https://www.tpex.org.tw',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api\/tpex/, '/www/zh-tw/afterTrading/tradingStock'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '台股損益追蹤器',
        short_name: '台股',
        description: '記錄台灣股票買賣，追蹤投資組合損益',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
