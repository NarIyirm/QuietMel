import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { HelpLibrary } from './components/HelpLibrary'
import './styles/global.css'

const path = window.location.pathname.replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/help' ? <HelpLibrary /> : <App />}
  </StrictMode>,
)
