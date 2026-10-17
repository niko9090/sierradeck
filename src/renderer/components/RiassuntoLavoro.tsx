import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { daQuanto } from '@shared/panoramica'
import { righeLavoro, testoRigaLavoro, TESTI_RIASSUNTO, type RigaLavoro } from '@shared/riassunto-lavoro'
import type { Segnale } from '@shared/segnali-chat'
import { Aiuto } from './Aiuto'

const COLORE: Record<string, string> = { blu: 'var(--blu)', viola: 'var(--viola, #a78bfa)', verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', quieto: 'var(--testo-quieto)' }

/** Ogni quanto si rileggono i segnali delle chat, oltre che a ogni segnale nuovo. */
const OGNI_MS = 5000

/**
 * Il riassunto della dashboard dell'autopilota (0.79.0): una riga per ogni
 * chat al lavoro — specialista, cosa fa adesso in parole semplici, da quanto,
 * ◆ se aspetta te. Si aggiorna da solo: i segnali delle chat si rileggono a
 * ogni segnale nuovo e ogni 5 secondi; il registro arriva con l'autopilota.
 * Regole in `@shared/riassunto-lavoro`, le stesse della pagina e dell'app.
 */
export function RiassuntoLavoro({ autopilota, paneDiSessione, onApri }: {
  autopilota: Autopilota
  paneDiSessione: (sessione: string) => string | undefined
  onApri: (paneId: string) => void
}): React.JSX.Element {
  const [segnali, setSegnali] = useState<Record<string, Segnale[]>>({})
  const [ora, setOra] = useState(() => Date.now())
  const sessioni = [
    ...(autopilota.sessionId !== undefined ? [autopilota.sessionId] : []),
    ...autopilota.chats.filter((c) => c.stato !== 'finita').flatMap((c) => (c.sessionId !== undefined ? [c.sessionId] : [])),
    ...(autopilota.adottate ?? []).map((x) => x.sessionId)
  ]
  const chiave = sessioni.join('|')
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      setOra(Date.now())
      if (sessioni.length === 0) return
      window.gestore.segnali.di(sessioni).then((s) => { if (vivo) setSegnali(s) }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, OGNI_MS)
    let toglie: (() => void) | undefined
    try { toglie = window.gestore.segnali.suStato((f) => { if (sessioni.includes(f.sessione)) leggi() }) } catch { /* finestra senza segnali */ }
    return () => { vivo = false; clearInterval(t); toglie?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave])
  const righe = righeLavoro(autopilota, (s) => segnali[s] ?? [])
  return (
    <div className="pan2-sezione riassunto-lavoro" aria-label={TESTI_RIASSUNTO.titolo}>
      <div className="serigrafia" aria-live="polite">
        {TESTI_RIASSUNTO.titolo} · {righe.length}
        <Aiuto di={TESTI_RIASSUNTO.titolo}>{TESTI_RIASSUNTO.aiuto}</Aiuto>
      </div>
      {righe.length === 0 ? <p className="pan2-vuoto">{TESTI_RIASSUNTO.vuoto}</p> : (
        <div className="riassunto-lavoro__righe" role="list">
          {righe.map((r) => <Riga key={r.id} r={r} ora={ora} pane={r.sessione !== undefined ? paneDiSessione(r.sessione) : undefined} onApri={onApri} />)}
        </div>
      )}
    </div>
  )
}

function Riga({ r, ora, pane, onApri }: { r: RigaLavoro; ora: number; pane?: string; onApri: (p: string) => void }): React.JSX.Element {
  const quanto = daQuanto(r.dal !== undefined ? Date.parse(r.dal) : undefined, ora)
  const dentro = (
    <>
      <span className="riassunto-lavoro__segno" aria-hidden style={{ color: r.aspettaTe ? 'var(--ambra)' : 'var(--verde)' }}>{r.aspettaTe ? '◆' : '●'}</span>
      <span className="riassunto-lavoro__chi" style={{ color: COLORE[r.colore] }}>{r.nomeRuolo}</span>
      <span className="riassunto-lavoro__cosa">{r.cosa}</span>
      <span className="riassunto-lavoro__compito">{r.compito}</span>
      <span className="riassunto-lavoro__quanto">{quanto}</span>
      {r.aspettaTe ? <span className="riassunto-lavoro__te">{TESTI_RIASSUNTO.aspettaTe}</span> : null}
    </>
  )
  const classe = `riassunto-lavoro__riga${r.aspettaTe ? ' riassunto-lavoro__riga--te' : ''}`
  const titolo = `${testoRigaLavoro(r, quanto)}\n${r.compito}`
  return pane !== undefined
    ? <button role="listitem" className={classe} title={titolo} onClick={() => onApri(pane)}>{dentro}</button>
    : <div role="listitem" className={classe} title={titolo}>{dentro}</div>
}
