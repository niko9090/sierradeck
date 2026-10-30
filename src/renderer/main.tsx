import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ConfineErrori } from './components/ConfineErrori'
import './console.css'

// Gli errori che sfuggono a React — una Promise rifiutata senza `catch`, un
// errore in un gestore d'evento — non passano dal ConfineErrori: li si raccoglie
// qui e li si scrive nel registro, o resterebbero solo nella console del
// renderer, invisibili a chi non la tiene aperta.
window.addEventListener('error', (e) => {
  const d = e.error instanceof Error ? `${e.error.name}: ${e.error.message}\n${e.error.stack ?? ''}` : String(e.message)
  try { void window.gestore?.log?.errore?.(`[renderer] errore non gestito — ${d}`) } catch { /* la console resta */ }
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  const d = r instanceof Error ? `${r.name}: ${r.message}\n${r.stack ?? ''}` : String(r)
  try { void window.gestore?.log?.errore?.(`[renderer] promise rifiutata senza catch — ${d}`) } catch { /* la console resta */ }
})

/**
 * Un file lasciato cadere **fuori** da chi lo aspettava non porta via la pagina.
 *
 * È il comportamento predefinito del web: il browser apre il file al posto del
 * documento. Dentro un'applicazione vuol dire che SierraDeck sparisce e resta
 * un visualizzatore di file, senza un tasto indietro. Basta una mira sbagliata
 * di due centimetri mentre si trascina qualcosa nel pannello dei file.
 *
 * Chi vuole davvero un trascinamento chiama `preventDefault` per conto suo e
 * l'evento non arriva mai qui.
 */
for (const evento of ['dragover', 'drop']) {
  window.addEventListener(evento, (e) => e.preventDefault())
}

const el = document.getElementById('root')
if (!el) throw new Error('Elemento #root non trovato')
createRoot(el).render(
  <ConfineErrori>
    <App />
  </ConfineErrori>
)
