import { useEffect, useState } from 'react'
import type { Consumi } from '@shared/consumi'
import { formattaToken } from '@shared/consumi'
import type { StatoAccesso } from '../../main/accesso'

/**
 * Quanto si è consumato, e con quale account.
 *
 * Token e non denaro: con un abbonamento il costo di una chat non è una
 * moltiplicazione, e una cifra in euro sarebbe falsa con l'aria di essere vera.
 * I token sono ciò che si consuma davvero, e si confrontano fra un giorno e
 * l'altro — che è la domanda vera: «oggi sto andando più forte del solito?».
 */
export function PannelloConsumi({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [consumi, setConsumi] = useState<Consumi | undefined>(undefined)
  const [accesso, setAccesso] = useState<StatoAccesso | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)

  useEffect(() => {
    window.gestore.sessions.consumi().then(setConsumi).catch((e: unknown) => setErrore(String(e)))
    window.gestore.accesso.stato().then(setAccesso).catch(() => setAccesso(undefined))
  }, [])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const colonna = (titolo: string, q: Consumi['oggi'] | undefined): React.JSX.Element => (
    <div style={{ flex: '1 1 150px' }}>
      <div className="serigrafia" style={{ marginBottom: 6 }}>{titolo}</div>
      <div style={{ fontSize: 22, color: 'var(--testo)', fontFamily: "'Cascadia Mono', monospace" }}>
        {q === undefined ? '—' : formattaToken(q.ingresso + q.uscita)}
      </div>
      <div className="misura" style={{ marginTop: 4, lineHeight: 1.6 }}>
        {q === undefined ? '' : (
          <>
            {formattaToken(q.ingresso)} in entrata · {formattaToken(q.uscita)} in uscita<br />
            {formattaToken(q.cache)} dalla cache · {q.chat} chat
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">Consumi</span>
        {accesso?.email !== undefined ? (
          <span className="misura">
            {accesso.email}
            {accesso.piano !== undefined ? ` · ${accesso.piano}` : ''}
            {accesso.organizzazione !== undefined ? ` · ${accesso.organizzazione}` : ''}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 0 12px' }}>
        {colonna('Oggi', consumi?.oggi)}
        {colonna('Ultimi 7 giorni', consumi?.settimana)}
        {colonna('Da sempre', consumi?.totale)}
      </div>

      {consumi !== undefined && consumi.perProgetto.length > 0 ? (
        <div>
          <div className="serigrafia" style={{ marginBottom: 6 }}>Dove va il lavoro</div>
          {consumi.perProgetto.map((p) => {
            const massimo = consumi.perProgetto[0]?.token ?? 1
            return (
              <div key={p.progetto} className="riga" style={{ gap: 12 }}>
                <span className="riga__nome" style={{ minWidth: 140 }}>{p.progetto}</span>
                {/* La barra è la lettura a colpo d'occhio; il numero accanto è
                    per quando serve il dato preciso. */}
                <span className="barra" style={{ flex: 1 }}>
                  <span className="barra__pieno" style={{ width: `${Math.max(2, (p.token / massimo) * 100)}%` }} />
                </span>
                <span className="misura">{formattaToken(p.token)}</span>
              </div>
            )
          })}
        </div>
      ) : null}

      <p className="misura" style={{ marginTop: 10, lineHeight: 1.5 }}>
        Token letti dalle trascrizioni di Claude Code, non una stima di spesa: con un abbonamento il
        costo di una chat non è una moltiplicazione, e una cifra in euro sarebbe inventata.
      </p>
    </div>
  )
}
