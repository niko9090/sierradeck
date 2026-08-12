import { useEffect, useState } from 'react'
import type { StatoAccesso } from '../../main/accesso'

/**
 * Cosa fare quando manca l'accesso a Claude Code.
 *
 * Il gestore **non può fare il login al posto tuo**: l'accesso avviene in un
 * terminale, con un browser che si apre, ed è una cosa che deve fare la persona.
 * Quello che può fare è dire esattamente cosa serve, invece di lasciare sei
 * riquadri fermi su una schermata che nessuno sta guardando.
 */
export function ModaleAccesso({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [accesso, setAccesso] = useState<StatoAccesso | undefined>(undefined)
  const [controllo, setControllo] = useState(false)

  const controlla = (): void => {
    setControllo(true)
    window.gestore.accesso
      .stato()
      .then(setAccesso)
      .catch(() => setAccesso(undefined))
      .finally(() => setControllo(false))
  }

  useEffect(controlla, [])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className={`led ${accesso?.autenticato === true ? 'led--lavoro' : 'led--fermo'}`} />
          <span className="serigrafia">Accesso a Claude Code</span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>

        {accesso?.autenticato === true ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            L’accesso c’è.{' '}
            {accesso.email !== undefined ? <>Account <b>{accesso.email}</b>.</> : null}{' '}
            {accesso.piano !== undefined ? <>Piano {accesso.piano}.</> : null}
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
              {accesso?.motivo ?? 'Non riesco a leggere lo stato dell’accesso.'}
            </p>
            <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, lineHeight: 1.9, color: 'var(--testo-quieto)' }}>
              <li>Apri un terminale — PowerShell o il Prompt dei comandi.</li>
              <li>
                Scrivi <code className="misura" style={{ color: 'var(--testo)' }}>claude</code> e premi Invio.
              </li>
              <li>Segui il login nel browser che si apre, poi torna qui.</li>
            </ol>
            <p className="misura" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
              Il gestore non può fare il login al posto tuo: avviene in un terminale, con un
              browser, e resta una cosa che devi fare tu una volta sola.
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="tasto tasto--primario" onClick={controlla} disabled={controllo}>
            {controllo ? 'Controllo…' : 'Ricontrolla'}
          </button>
        </div>
      </div>
    </div>
  )
}
