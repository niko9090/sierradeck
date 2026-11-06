import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  avvisoCarico, FRASE_LIMITE_PROCESSO, leggiCampoPosti, origineCorta, passoPosti, POSTI_SCELTI_MAX, POSTI_SCELTI_MIN, spiegaPosti,
  type PostiChat as Posti
} from '@shared/posti-chat'
import { Aiuto } from './Aiuto'

/**
 * «N di M chat»: la finestra per cambiare il massimo (k-57). M è il limite delle
 * chat degli autopiloti **su questo PC**, per tutti i workspace insieme: di serie
 * lo decide il carico, qui lo si può fissare a mano. Si salva nelle preferenze del PC.
 */
export function ModalePostiChat({ posti, onChiudi, onCambiato }: { posti: Posti; onChiudi: () => void; onCambiato: () => void }): React.JSX.Element {
  const [testo, setTesto] = useState(String(posti.scelti ?? posti.posti))
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [salvato, setSalvato] = useState(false)

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const salva = (scelti: number | undefined): void => {
    setErrore(undefined)
    void window.gestore.preferenze.leggi()
      .then((p) => window.gestore.preferenze.imposta({ ...p, postiScelti: scelti }))
      .then(() => { setSalvato(true); onCambiato() })
      .catch((e: unknown) => setErrore(`Non riesco a salvare: ${e instanceof Error ? e.message : String(e)}`))
  }
  const imposta = (n: number): void => { setTesto(String(n)); salva(n) }
  const valido = leggiCampoPosti(testo) !== undefined
  const corrente = leggiCampoPosti(testo) ?? posti.scelti ?? posti.posti
  const avviso = avvisoCarico(posti)

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo" role="dialog" aria-label="Quante chat insieme" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Quante chat insieme</span>
          <Aiuto di="Quante chat insieme">
            <span style={{ whiteSpace: 'pre-line' }}>{spiegaPosti(posti)}</span>
            {'\n'}
            <span style={{ display: 'block', marginTop: 6 }}>È il massimo di chat degli autopiloti su questo PC, per tutti i workspace insieme. Scrivi un numero da {POSTI_SCELTI_MIN} a {POSTI_SCELTI_MAX} o usa − e +: vale subito, anche se il PC è carico. «Automatico» torna a decidere il PC. {FRASE_LIMITE_PROCESSO}</span>
          </Aiuto>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>
        <div className="posti-modale">
          <div className="posti-modale__valore">Adesso: <strong>{posti.posti}</strong> chat · {origineCorta(posti)}</div>
          <div className="posti-modale__controlli">
            <button className="tasto" aria-label="Meno chat" disabled={corrente <= POSTI_SCELTI_MIN} onClick={() => imposta(passoPosti(corrente, -1))}>−</button>
            <input
              className="campo posti-modale__campo"
              inputMode="numeric"
              aria-label="Numero massimo di chat"
              value={testo}
              onChange={(e) => { setTesto(e.target.value); setSalvato(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && valido) imposta(corrente) }}
            />
            <button className="tasto" aria-label="Più chat" disabled={corrente >= POSTI_SCELTI_MAX} onClick={() => imposta(passoPosti(corrente, 1))}>+</button>
            <button className="tasto tasto--acceso" disabled={!valido} onClick={() => imposta(corrente)}>Imposta</button>
            <button className="tasto" disabled={posti.scelti === undefined} onClick={() => { setTesto(String(posti.posti)); salva(undefined) }}>Automatico</button>
          </div>
          {!valido ? <div className="gc-errore">Scrivi un numero intero da {POSTI_SCELTI_MIN} a {POSTI_SCELTI_MAX}.</div> : null}
          {avviso !== undefined ? <div className="posti-modale__avviso">⚠ {avviso}</div> : null}
          {errore !== undefined ? <div className="gc-errore">⚠ {errore}</div> : null}
          {salvato ? <div className="riga__stato">salvato · {FRASE_LIMITE_PROCESSO}</div> : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
