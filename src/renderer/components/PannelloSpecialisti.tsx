import { useCallback, useEffect, useState } from 'react'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { daQuanto, nomeWorkspace, postiTesto, prioritaTesto, quantoManca } from '@shared/attesa-vista'
import { Aiuto } from './Aiuto'

/** Ogni quanto si rilegge la lista, in millisecondi. */
export const RILETTURA_MS = 4000

export type MossaFila = 'su' | 'giu' | 'cima'

/**
 * **Specialisti** (k-49, 06/11): chi lavora adesso e chi è in fila per un
 * posto, con le mosse per cambiare l'ordine. Nicholas: «voglio vedere la lista
 * degli specialisti che hanno chiesto uno slot per operare, così vedo sempre
 * cosa c'è in lista e volendo posso anche cambiare la priorità».
 *
 * La lista vive nel servizio (`attesa-specialisti.ts`); qui si legge e si
 * muove. `ListaSpecialisti` è solo disegno (niente stato): la provano i test.
 */

type Props = {
  /** `undefined` = non ancora letta; `'vecchio'` = il servizio non sa rispondere. */
  vista: VistaAttesa | 'vecchio' | undefined
  adesso: number
  /** La voce di cui «Togli» aspetta la conferma. */
  daTogliere?: string
  onMossa: (id: string, mossa: MossaFila) => void
  onTogli: (id: string) => void
  onAnnullaTogli: () => void
  onConfermaTogli: (id: string) => void
}

export function ListaSpecialisti({ vista, adesso, daTogliere, onMossa, onTogli, onAnnullaTogli, onConfermaTogli }: Props): React.JSX.Element {
  if (vista === undefined) return <div className="progetti__vuoto">Leggo la lista…</div>
  if (vista === 'vecchio') return <div className="progetti__vuoto spec__vecchio">Serve la versione nuova del servizio</div>
  const { posti, alLavoro, inFila } = vista
  return (
    <div className="spec">
      <div className="spec__posti">
        <b>{postiTesto(posti.usati, posti.tetto)}</b>
        <Aiuto di="posti e fila">Ogni specialista che lavora occupa un posto, e i posti di questo PC sono pochi. Quando sono tutti pieni, chi ne chiede uno resta in fila qui. Appena un posto si libera, il primo della fila lo ha prenotato per qualche minuto e il suo autopilota viene svegliato. Se non lo usa, passa al successivo. Con ↑, ↓ e «In cima» cambi l’ordine; «Togli» fa uscire la richiesta dalla fila.</Aiuto>
      </div>

      <div className="spec__sezione">
        <span className="serigrafia">Al lavoro adesso</span>
        {alLavoro.length === 0 ? <div className="spec__vuoto">Nessuno al lavoro</div> : (
          <ul className="spec__elenco" aria-label="Al lavoro adesso">
            {alLavoro.map((v) => (
              <li key={v.id} className="spec__riga">
                <span className="spec__posto" title="Il posto occupato">Posto {v.posto}</span>
                <span className="spec__corpo">
                  <span className="spec__titolo">{v.compito !== undefined ? <b>{v.compito} </b> : null}{v.descrizione}</span>
                  <span className="spec__sotto">{nomeWorkspace(v.workspace)} · {v.tipo} · lavora da {daQuanto(v.dal, adesso)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="spec__sezione">
        <span className="serigrafia">In fila</span>
        {inFila.length === 0 ? <div className="spec__vuoto">Nessuno in fila</div> : (
          <ul className="spec__elenco" aria-label="In fila">
            {inFila.map((v, i) => {
              const manca = v.prenotata ? quantoManca(v.prenotataFino, adesso) : ''
              return (
                <li key={v.id} className={`spec__riga${v.prenotata ? ' spec__riga--tocca' : ''}`}>
                  <span className="spec__posto" title="Il posto in fila">{v.posizione}°</span>
                  <span className="spec__corpo">
                    <span className="spec__titolo">{v.compito !== undefined ? <b>{v.compito} </b> : null}{v.descrizione}</span>
                    <span className="spec__sotto">
                      {nomeWorkspace(v.workspace)} · {v.tipo} · aspetta da {daQuanto(v.dal, adesso)} · priorità {prioritaTesto(v.priorita)}
                      {v.prenotata ? <span className="spec__tocca"> · tocca a lui{manca !== '' ? ` (${manca === 'scaduta' ? 'scaduta' : `ancora ${manca}`})` : ''}</span> : null}
                    </span>
                  </span>
                  <span className="spec__tasti">
                    {daTogliere === v.id ? (
                      <>
                        <span className="spec__chiede">Toglierla dalla fila?</span>
                        <button className="tasto tasto--mini" onClick={() => onConfermaTogli(v.id)}>Sì, togli</button>
                        <button className="tasto tasto--mini" onClick={onAnnullaTogli}>No</button>
                      </>
                    ) : (
                      <>
                        <button className="tasto tasto--mini" aria-label="Sposta più in alto" title="Più in alto" disabled={i === 0} onClick={() => onMossa(v.id, 'su')}>↑</button>
                        <button className="tasto tasto--mini" aria-label="Sposta più in basso" title="Più in basso" disabled={i === inFila.length - 1} onClick={() => onMossa(v.id, 'giu')}>↓</button>
                        <button className="tasto tasto--mini" title="Passa davanti a tutti" disabled={i === 0} onClick={() => onMossa(v.id, 'cima')}>In cima</button>
                        <button className="tasto tasto--mini" title="Toglie la richiesta dalla fila" onClick={() => onTogli(v.id)}>Togli</button>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Legge la lista ogni pochi secondi. Si ridisegna solo se qualcosa è cambiato
 * (niente sfarfallio), e un errore di lettura lascia quello che si vedeva.
 */
export function useAttesaSpecialisti(attiva: boolean): { vista: VistaAttesa | 'vecchio' | undefined; rileggi: () => void; metti: (v: VistaAttesa | undefined) => void } {
  const [vista, setVista] = useState<VistaAttesa | 'vecchio' | undefined>(undefined)
  const metti = useCallback((v: VistaAttesa | undefined): void => {
    const nuova = v ?? 'vecchio'
    setVista((prima) => (JSON.stringify(prima) === JSON.stringify(nuova) ? prima : nuova))
  }, [])
  const rileggi = useCallback((): void => {
    window.gestore.autopilota.attesaSpecialisti().then(metti).catch(() => undefined)
  }, [metti])
  useEffect(() => {
    if (!attiva) return
    rileggi()
    const t = setInterval(rileggi, RILETTURA_MS)
    return () => clearInterval(t)
  }, [attiva, rileggi])
  return { vista, rileggi, metti }
}

export function PannelloSpecialisti({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const { vista, rileggi, metti } = useAttesaSpecialisti(true)
  const [adesso, setAdesso] = useState(() => Date.now())
  const [daTogliere, setDaTogliere] = useState<string | undefined>(undefined)
  const [nota, setNota] = useState<string | undefined>(undefined)
  // Il tempo che passa si aggiorna con la lettura, e da solo ogni 15 secondi.
  useEffect(() => { setAdesso(Date.now()) }, [vista])
  useEffect(() => {
    const t = setInterval(() => setAdesso(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const dopo = (r: VistaAttesa | undefined): void => {
    if (r === undefined) { setNota('Non è andata: il servizio non ha risposto. Riprova tra poco.'); rileggi() } else { setNota(undefined); metti(r) }
  }
  const mossa = (id: string, m: MossaFila): void => { void window.gestore.autopilota.prioritaAttesa(id, m).then(dopo).catch(() => dopo(undefined)) }
  const togli = (id: string): void => { setDaTogliere(undefined); void window.gestore.autopilota.togliAttesa(id).then(dopo).catch(() => dopo(undefined)) }
  const inFila = typeof vista === 'object' ? vista.inFila.length : 0
  return (
    <div className="progetti salute" role="dialog" aria-label="Specialisti">
      <div className="progetti__testa">
        <span className="progetti__titolo">☰ Specialisti{inFila > 0 ? ` · ${inFila} in fila` : ''}</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={rileggi}>Aggiorna</button>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {nota !== undefined ? <div className="progetti__striscia">⚠ {nota}</div> : null}
      <div className="progetti__corpo">
        <div className="progetti__tabella">
          <ListaSpecialisti vista={vista} adesso={adesso} {...(daTogliere !== undefined ? { daTogliere } : {})} onMossa={mossa} onTogli={setDaTogliere} onAnnullaTogli={() => setDaTogliere(undefined)} onConfermaTogli={togli} />
        </div>
      </div>
    </div>
  )
}
