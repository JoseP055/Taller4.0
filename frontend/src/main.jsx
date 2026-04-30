import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'

const storedTheme = localStorage.getItem('climatisa_theme')
if (storedTheme === 'dark' || storedTheme === 'light') {
  document.documentElement.dataset.theme = storedTheme
} else {
  const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

globalThis.setTimeout(() => {
  const splash = document.getElementById('splash')
  if (splash) splash.remove()
}, 0)
