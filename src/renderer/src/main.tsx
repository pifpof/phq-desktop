import '@fontsource-variable/inter'
import './styles/globals.css'
import { createRoot } from 'react-dom/client'
import App from './App'

// StrictMode is off on purpose: its double-mounted effects would send the verify call twice.
createRoot(document.getElementById('root')!).render(<App />)
