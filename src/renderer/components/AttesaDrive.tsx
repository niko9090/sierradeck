import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import type { ProgressoCatalogo } from '../../shared/catalogo-progresso'
import { descriviCatalogo, passiDelCatalogo } from '../../shared/catalogo-progresso'
import { durataBreve } from '../progresso-sync'

type Props = {
  /** Assente finche' il computer non ha detto la prima fase. */
  progresso: ProgressoCatalogo | undefined
  /** Adesso, per il tempo trascorso: lo passa chi disegna, cosi' si ridisegna ogni secondo. */
  adesso: number
  /** Quando la lettura e' partita, se il progresso non lo dice ancora. */
  avviato: number
  onChiudi: () => void
}

/**
 * La finestra che aspetta il Drive.
 *
 * Nicholas (2026-09-13): «quando premo Drive voglio vedere un caricamento con
 * una finestra sua, non le scritte senza nulla finché non carica». Leggere il
 * Drive prende qualche secondo (le chiavi, l'indice, i file di qui, le
 * impronte): prima la scheda stava con la sola spiegazione e sembrava ferma.
 * Qui c'e' la barra, la fase in corso con cosa sta facendo, le sei fasi con
 * lo stato di ciascuna, e da quanto va. Si chiude da sola quando il catalogo
 * arriva; «Chiudi la scheda» abbandona la scheda Drive (la lettura finisce
 * da sola e non tocca niente).
 */
export function AttesaDrive({ progresso, adesso, avviato, onChiudi }: Props): React.JSX.Element {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const d = descriviCatalogo(progresso)
  const passi = passiDelCatalogo(progresso)
  const partenza = progresso !== undefined ? new Date(progresso.avviato).getTime() : avviato
  const trascorso = Number.isNaN(partenza) ? 0 : Math.max(0, adesso - partenza)

  // Sul body, non dentro chi lo apre: un pannello con `transform` fa da
  // contenitore a `position: fixed`, e il modale resterebbe dentro e tagliato.
  return createPortal(
    <div className="velo" role="dialog" aria-modal="true" aria-labelledby="attesa-drive-titolo">
      <div className="dialogo dialogo--attesa dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="led led--lavoro" />
          <span className="serigrafia" id="attesa-drive-titolo">Leggo il Drive…</span>
          <span style={{ flex: 1 }} />
          <span className="avanzamento__tempo">{trascorso > 0 ? `da ${durataBreve(trascorso)}` : ''}</span>
        </div>

        <div className="avanzamento__barra" role="progressbar" aria-valuenow={d.perc} aria-valuemin={0} aria-valuemax={100}>
          <span className="avanzamento__pieno" style={{ width: `${d.perc}%` }} />
          <span className="avanzamento__perc">{d.perc}%</span>
        </div>

        <div className="attesa-drive__fase">
          <strong>Fase {d.numero} di {d.di} · {d.nome}</strong>
          {d.conteggio !== undefined ? <span className="drive__sotto"> · {d.conteggio}</span> : null}
          <span className="attesa-drive__cosa">{d.spiegazione}</span>
        </div>

        <ul className="avanzamento__passi">
          {passi.map((p) => (
            <li key={p.nome} className={`avanzamento__passo avanzamento__passo--${p.stato}`}>
              <span className="avanzamento__segno">{p.stato === 'fatto' ? '✓' : p.stato === 'corso' ? '▶' : '○'}</span>
              <span>
                <span className="avanzamento__passo-nome">{p.nome}</span>
                <span className="avanzamento__passo-sotto">{p.spiegazione}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="account__nota" style={{ marginTop: 10 }}>
          Leggere il Drive non tocca niente: non scarica, non carica, non cancella. Quando ha finito questa finestra si chiude da sola e vedi il catalogo: progetti, workspace e chat, ognuno con il suo stato rispetto a questo PC. Se il Drive è lento o la rete va e viene la lettura può prendere di più: la barra dice in che fase sta.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="tasto" onClick={onChiudi} title="Torna alla console: la lettura finisce da sola e non cambia niente">Chiudi la scheda</button>
        </div>
      </div>
    </div>
  , document.body)
}
