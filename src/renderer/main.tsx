import { createRoot } from 'react-dom/client'
import { App } from './App'
import './console.css'

const el = document.getElementById('root')
if (!el) throw new Error('Elemento #root non trovato')
createRoot(el).render(<App />)
