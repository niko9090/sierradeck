import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { adattaSePuoi } from '../adatta-terminale'
import { registraWebgl } from '../webgl-terminali'
import '@xterm/xterm/css/xterm.css'
import { RiceviFlusso } from '@shared/flusso-terminale'

type Props = {
  pcId: string
  chatId: string
  /** `true` appena arriva il primo pezzo; `false` se quel PC non manda il flusso (versione vecchia). */
  onStato: (vivo: boolean) => void
}

/** Pausa fra due richieste quando non c'è altro da leggere. */
const PAUSA_MS = 400
/** Pausa dopo un errore di rete: poi si riprende dal punto in cui si era. */
const PAUSA_ERRORE_MS = 2000

/**
 * L'uscita del terminale di un altro PC, mentre succede (23/11).
 *
 * Un terminale xterm di sola lettura (lo stesso dei terminali locali) che
 * riceve i pezzi di `/api/flusso` in ordine. Se la linea cade resta com'è e
 * riprende dall'ultima posizione, senza far ripartire niente là. I tasti
 * restano quelli del riquadro (`remoto.tasto`).
 */
export function TerminaleRemoto({ pcId, chatId, onStato }: Props): React.JSX.Element {
  const contenitore = useRef<HTMLDivElement>(null)
  const onStatoRef = useRef(onStato)
  onStatoRef.current = onStato

  useEffect(() => {
    const nodo = contenitore.current
    if (!nodo) return
    const term = new XTerm({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 12,
      disableStdin: true,
      convertEol: false,
      scrollback: 5000,
      theme: { background: '#1e1e1e', foreground: '#dddddd' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(nodo)
    const liberaWebgl = registraWebgl(term, nodo)
    adattaSePuoi(fit)
    const osservatore = new ResizeObserver(() => { adattaSePuoi(fit) })
    osservatore.observe(nodo)

    const flusso = new RiceviFlusso()
    let attivo = true
    let primo = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const giro = async (): Promise<void> => {
      if (!attivo) return
      let attesa = PAUSA_MS
      try {
        const r = await window.gestore.remoto.flusso(pcId, chatId, flusso.dopo)
        if (!attivo) return
        const passo = r.ok ? flusso.ricevi(r.dati) : flusso.errore(r.stato)
        if (passo.tipo === 'vecchio') { onStatoRef.current(false); return }
        if (passo.tipo === 'scrivi') {
          if (passo.ripulisci) term.reset()
          term.write(passo.testo)
          if (primo) { primo = false; onStatoRef.current(true) }
          if (passo.subito) attesa = 0
        } else if (!r.ok) attesa = PAUSA_ERRORE_MS
      } catch {
        attesa = PAUSA_ERRORE_MS
      }
      if (attivo) timer = setTimeout(() => { void giro() }, attesa)
    }
    void giro()

    return () => {
      attivo = false
      if (timer !== undefined) clearTimeout(timer)
      osservatore.disconnect()
      liberaWebgl()
      term.dispose()
    }
  }, [pcId, chatId])

  return <div ref={contenitore} className="remoto__terminale-vivo" />
}
