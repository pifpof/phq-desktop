import '@fontsource-variable/inter'
import './styles/globals.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import { readPrintOptions } from '@shared/playbook'
import { PlaybookPrint } from './features/playbook/PlaybookPrint'

// The PDF export loads this page in a hidden window with #print=<options> (REQUIREMENTS-v4 8).
const print = readPrintOptions(window.location.hash)

// StrictMode is off on purpose: its double-mounted effects would send the verify call twice.
createRoot(document.getElementById('root')!).render(
  print ? <PlaybookPrint options={print} /> : <App />
)
