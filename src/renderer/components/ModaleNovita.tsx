import { useEffect } from 'react'
import type { Novita } from '@shared/novita'

type Props = {
  novita: Novita
  onChiudi: () => void
}

/**
 * Una riga delle novita', letta come si scrive in `novita.ts`: l'attacco in
 * grassetto fra `**`, poi il resto. Qui la si spezza in due, invece di far
 * comparire gli asterischi a schermo com'era prima.
 */
function spezza(riga: string): { attacco: string; resto: string } {
  const m = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(riga)
  if (m === null) return { attacco: '', resto: riga.replace(/\*\*/g, '') }
  return { attacco: m[1] ?? '', resto: (m[2] ?? '').replace(/\*\*/g, '') }
}

function Versione({ n, corrente }: { n: Novita; corrente: boolean }): React.JSX.Element {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span className="serigrafia" style={{ opacity: corrente ? 1 : 0.7 }}>{corrente ? 'Questa versione' : 'Versione'} {n.versione}</span>
        {corrente ? null : <span style={{ fontSize: 11, opacity: 0.55 }}>arrivata mentre non guardavi</span>}
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {n.righe.map((riga) => {
          const { attacco, resto } = spezza(riga)
          return (
            <li key={riga} style={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 8, fontSize: 13, lineHeight: 1.55 }}>
              <span aria-hidden style={{ marginTop: 8, width: 6, height: 6, borderRadius: 3, background: 'var(--accento, #4aa3ff)' }} />
              <span>
                {attacco !== '' ? <strong>{attacco}</strong> : null}
                {attacco !== '' && resto !== '' ? ' ' : ''}
                <span style={{ opacity: attacco !== '' ? 0.85 : 1 }}>{resto}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Cosa e' cambiato, in poche righe e una volta sola.
 *
 * Compare al centro perche' e' l'unica cosa che chiede attenzione in quel
 * momento, e se ne va al primo clic. Non torna: il segno di «letta» lo mette
 * il Core nell'istante in cui consegna il testo, quindi anche chiudendola
 * senza leggerla non ricomparira' — una finestra che si riapre a ogni avvio
 * diventa un ostacolo fra l'utente e la prima chat, ed e' cosi' che si smette
 * di leggere anche quella che conta.
 *
 * Se fra l'ultima versione vista e questa ce ne sono state altre — un PC
 * aggiornato dopo giorni — le si vede tutte, dalla piu' recente: quello che
 * e' cambiato «mentre non guardavi» conta quanto l'ultima riga.
 */
export function ModaleNovita({ novita, onChiudi }: Props): React.JSX.Element {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const altre = novita.altre ?? []
  const righeInTutto = novita.righe.length + altre.reduce((n, a) => n + a.righe.length, 0)

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialogo__testa" style={{ alignItems: 'baseline', gap: 10 }}>
          <span className="led led--lavoro" />
          <span className="serigrafia">Cosa c’è di nuovo</span>
          <span style={{ fontSize: 12, opacity: 0.65 }}>
            {altre.length === 0
              ? `versione ${novita.versione}`
              : `dalla ${altre[altre.length - 1]?.versione ?? '?'} alla ${novita.versione} · ${altre.length + 1} versioni, ${righeInTutto} cose`}
          </span>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: 6, margin: '4px 0 8px' }}>
          <Versione n={novita} corrente />
          {altre.map((a) => <Versione key={a.versione} n={a} corrente={false} />)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button
            className="account__link"
            onClick={() => { void window.gestore.sistema.apriEsterno('https://github.com/niko9090/sierradeck/releases') }}
            title="Tutte le versioni, con gli installer"
          >
            Tutte le versioni ▸
          </button>
          <button className="tasto tasto--primario" autoFocus onClick={onChiudi}>
            Ho capito
          </button>
        </div>
      </div>
    </div>
  )
}
