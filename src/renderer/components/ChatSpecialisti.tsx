import { useEffect, useMemo, useRef, useState } from 'react'
import type { RigaSpecialista, VistaOrchestratore } from '@shared/piano-orchestratore'
import { useSondaggio } from '../state/sondaggio'
import { sondaggioOrchestratore } from './TestaOrchestratore'

/**
 * Le chat degli specialisti, da guardare (0.90.0).
 *
 * Nicholas, 02/11: «non vedo chat sulla destra attive, sono tutte dentro
 * all'autopilota. non avevo chiesto questo»; e «se l'autopilota è fatto bene
 * non mi dovrebbe servire scrivere all'interno». Ogni specialista al lavoro è
 * una chat sulla destra che mostra dal vivo cosa fa (le sue parole, i comandi,
 * gli esiti), senza campo per scrivere: la guida l'autopilota. Quando finisce
 * resta in vista ancora un poco, poi si toglie da sola.
 */

/** Ogni quanto si rilegge la conversazione di uno specialista al lavoro. */
const RILEGGI_MS = 3_000
/** Quanto resta in vista uno specialista che ha finito. */
const RESTA_DOPO_MS = 3 * 60_000

type Specialista = VistaOrchestratore['specialisti'][number]

const PAROLA: Record<string, string> = { avviato: 'parte', lavoro: 'al lavoro', finito: 'ha finito', fallito: 'non riuscito', fermato: 'fermato', attesa: 'aspetta' }

const alLavoro = (s: Specialista): boolean => s.stato === 'lavoro' || s.stato === 'avviato'

/** Pura: gli specialisti da mostrare (al lavoro, o finiti da poco), non le chat adottate. */
export function specialistiInVista(v: VistaOrchestratore | undefined, ora: number): Specialista[] {
  if (v === undefined) return []
  return v.specialisti.filter((s) => s.adottata !== true && (alLavoro(s) || (s.fine !== undefined && ora - Date.parse(s.fine) < RESTA_DOPO_MS)))
}

function Riga({ r }: { r: RigaSpecialista }): React.JSX.Element {
  if (r.tipo === 'strumento') return <div className="chat-spec__strumento">› {r.testo}</div>
  if (r.tipo === 'esito') return <div className={r.errore === true ? 'chat-spec__esito chat-spec__esito--errore' : 'chat-spec__esito'}>{r.testo}</div>
  if (r.tipo === 'compito') return <div className="chat-spec__compito">{r.testo}</div>
  return <div className="chat-spec__testo">{r.testo}</div>
}

function ChatSpecialista({ workspace, s }: { workspace: string; s: Specialista }): React.JSX.Element {
  const [righe, setRighe] = useState<RigaSpecialista[] | undefined>(undefined)
  const corpo = useRef<HTMLDivElement>(null)
  const inFondo = useRef(true)
  const alLavoroOra = alLavoro(s)
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      void window.gestore.autopilota.specialista(workspace, s.id)
        .then((t) => { if (vivo && t !== undefined) setRighe(t.righe) })
        .catch(() => undefined)
    }
    leggi()
    if (!alLavoroOra) return () => { vivo = false }
    const t = setInterval(() => { if (document.visibilityState === 'visible') leggi() }, RILEGGI_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [workspace, s.id, alLavoroOra])
  // Segue il fondo, come una chat: se scorri su a rileggere, non ti riporta giù.
  useEffect(() => {
    const el = corpo.current
    if (el !== null && inFondo.current) el.scrollTop = el.scrollHeight
  }, [righe])
  return (
    <section className={alLavoroOra ? 'chat-spec' : 'chat-spec chat-spec--finita'} aria-label={`Chat di ${s.ruolo ?? 'specialista'}: ${s.compito}`}>
      <header className="chat-spec__testata" title={s.compito}>
        <span className={alLavoroOra ? 'chat-spec__battito' : 'chat-spec__fermo'} aria-hidden="true" />
        <span className="chat-spec__chi">{s.ruolo ?? 'Specialista'}</span>
        <span className="chat-spec__cosa">{s.compito}</span>
        <span className="chat-spec__stato">{PAROLA[s.stato] ?? s.stato}{s.durata !== undefined ? ` · ${s.durata}` : ''}</span>
      </header>
      <div
        ref={corpo}
        className="chat-spec__corpo"
        onScroll={(e) => { const el = e.currentTarget; inFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}
      >
        {righe === undefined ? <div className="chat-spec__vuota">Leggo la sua conversazione…</div>
          : righe.length === 0 ? <div className="chat-spec__vuota">{alLavoroOra ? 'Sta partendo: le sue prime parole arrivano qui.' : 'Nessuna conversazione da mostrare.'}</div>
            : righe.map((r, i) => <Riga key={i} r={r} />)}
      </div>
      <footer className="chat-spec__piede">Da guardare: la guida l’autopilota{s.compitoId !== undefined ? ` · compito ${s.compitoId}` : ''}</footer>
    </section>
  )
}

/** Le chat degli specialisti del workspace; niente se non ce n'è nessuno in vista. */
/** `pieno`: nel workspace non ci sono altre chat, e gli specialisti prendono tutto lo spazio (non una colonna accanto al vuoto). */
export function ChatSpecialisti({ workspace, colonna = false, pieno = false }: { workspace: string; colonna?: boolean; pieno?: boolean }): React.JSX.Element | null {
  const sond = useMemo(() => sondaggioOrchestratore(workspace), [workspace])
  const v = useSondaggio(sond)
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setOra(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const lista = specialistiInVista(v, ora)
  if (lista.length === 0) return null
  return (
    <aside className={colonna ? (pieno ? 'chat-specialisti chat-specialisti--pieno' : 'chat-specialisti chat-specialisti--colonna') : 'chat-specialisti'} aria-label="Le chat degli specialisti">
      {lista.map((s) => <ChatSpecialista key={s.id} workspace={workspace} s={s} />)}
    </aside>
  )
}
