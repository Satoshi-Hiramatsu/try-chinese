import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// beforeinstallprompt は描画前に飛んでくることがあるので、最初に読み込んで捕まえておく
import './services/installPrompt'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
