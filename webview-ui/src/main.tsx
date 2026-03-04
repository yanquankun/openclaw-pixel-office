import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

// Support being hosted under a subpath (e.g. /opc-pixel/)
const BASENAME = (() => {
  const p = window.location.pathname
  // strip known leaf routes
  const cleaned = p.replace(/\/config\/?$/, '/').replace(/\/+$/, '/')
  // if path like /opc-pixel/ -> basename is /opc-pixel
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length === 0) return ''
  return '/' + parts[0]
})()
import './index.css'
import App from './App.tsx'
import { ConfigPage } from './pages/ConfigPage.tsx'
import { connectWebSocket } from './wsClient.ts'

// 在 React 渲染前建立 WebSocket 连接
connectWebSocket()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/config" element={<ConfigPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
