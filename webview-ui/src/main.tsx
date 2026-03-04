import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ConfigPage } from './pages/ConfigPage.tsx'
import { connectWebSocket } from './wsClient.ts'

// 在 React 渲染前建立 WebSocket 连接
connectWebSocket()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/config" element={<ConfigPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
