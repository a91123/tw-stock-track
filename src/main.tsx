import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// autoUpdate 模式：發現新版會自動套用並重整頁面。
// PWA 常駐不關的情況下，每 30 分鐘主動檢查一次有沒有新部署。
registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (registration) setInterval(() => registration.update(), 30 * 60 * 1000)
  },
})

// 設定 Vercel 環境變數 VITE_SENTRY_DSN 後啟用錯誤追蹤；未設定時完全不作用
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn })
}
console.info(`[Sentry] ${sentryDsn ? '錯誤追蹤已啟用' : '未設定 VITE_SENTRY_DSN，錯誤追蹤停用'}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
