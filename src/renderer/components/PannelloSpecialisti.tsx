import { useCallback, useEffect, useState } from 'react'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { SPIEGA_STIME, daQuanto, minutiTesto, nomeWorkspace, postiTesto, prioritaTesto, quantoManca, totaleTesto } from '@shared/attesa-vista'
import { MISURE, larghezzaEffettiva, larghezzaTrascinata, limita, massimoColonna, passoFreccia, suggerimentoBarra } from '@shared/misure-pannelli'
import { useLarghezzaFinestra } from '../larghezza-finestra'
import { Aiuto } from './Aiuto'

/** Ogni quanto si rilegge la lista, in millisecondi. */
export const RILETTURA_MS = 4000

export type MossaFila = 'su' | 'giu' | 'cima' | 'ferma'

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
  /** Chi lavora e aspetta la conferma di «Ferma». */
  daFermare?: string
  onMossa: (id: string, mossa: MossaFila) => void
  onFerma?: (id: string) => void
  onAnnullaFerma?: () => void
  onTogli: (id: string) => void
  onAnnullaTogli: () => void
  onConfermaTogli: (id: string) => void
}

export function ListaSpecialisti({ vista, adesso, daTogliere, daFermare, onMossa, onFerma, onAnnullaFerma, onTogli, onAnnullaTogli, onConfermaTogli }: Props): React.JSX.Element {
  if (vista === undefined) return <div className="progetti__vuoto">Leggo la lista…</div>
  if (vista === 'vecchio') return <div className="progetti__vuoto spec__vecchio">Serve la versione nuova del servizio</div>
  const { posti, alLavoro, inFila, totale } = vista
  return (
    <div className="spec">
      <div className="spec__posti">
        <b>{postiTesto(posti.usati, posti.tetto)}</b>
        <Aiuto di="posti e fila">Ogni specialista che lavora occupa un posto, e i posti di questo PC sono pochi. Quando sono tutti pieni, chi ne chiede uno resta in fila qui. Appena un posto si libera, il primo della fila lo ha prenotato per qualche minuto e il suo autopilota viene svegliato. Se non lo usa, passa al successivo. Con ↑, ↓ e «In cima» cambi l’ordine; «Togli» fa uscire la richiesta dalla fila.</Aiuto>
        {totale !== undefined ? <span className="spec__totale">{totaleTesto(totale.minuti, totale.compiti)}</span> : null}
        <Aiuto di="le stime">{SPIEGA_STIME}</Aiuto>
      </div>

      <div className="spec__sezione">
        <span className="serigrafia">Al lavoro adesso</span>
        {alLavoro.length === 0 ? <div className="spec__vuoto">Nessuno al lavoro</div> : (
          <ul className="spec__elenco" aria-label="Al lavoro adesso">
            {alLavoro.map((v) => (
              <li key={v.id} className="spec__riga">
                <span className="spec__posto" title="Il posto occupato">Posto {v.posto}</span>
                <span className="spec__corpo">
                  <span className="spec__ws">{v.workspaceNome ?? nomeWorkspace(v.workspace)}</span>
                  <span className="spec__titolo">{v.compito !== undefined ? <b>{v.compito} </b> : null}{v.titolo ?? v.descrizione}</span>
                  {v.cosaFa !== undefined && v.cosaFa !== '' ? <span className="spec__cosa" title={v.cosaFa}>{v.cosaFa}</span> : null}
                  {v.percentuale !== undefined ? (
                    <span className="spec__barra">
                      <progress max={100} value={v.percentuale} aria-label="Avanzamento" />
                      <span>{v.percentuale}%</span>
                      {v.minutiStimati !== undefined ? <span>mancano circa {minutiTesto(v.minutiStimati)}</span> : null}
                      {v.inRitardo === true ? <span className="spec__ritardo">in ritardo</span> : null}
                    </span>
                  ) : null}
                  <span className="spec__sotto">{v.tipo} · lavora da {daQuanto(v.dal, adesso)}{v.precedenza !== undefined && v.precedenza > 0 ? ` · precedenza ${v.precedenza}` : ''}</span>
                </span>
                <span className="spec__tasti">
                  {v.fermaRichiesta === true ? <span className="spec__chiede">fermata chiesta…</span> : daFermare === v.id ? (
                    <>
                      <span className="spec__chiede">Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato</span>
                      <button className="tasto tasto--mini" onClick={() => onMossa(v.id, 'ferma')}>Sì, ferma</button>
                      <button className="tasto tasto--mini" onClick={onAnnullaFerma}>No</button>
                    </>
                  ) : (
                    <>
                      <button className="tasto tasto--mini" title="Passa davanti agli altri al prossimo posto libero, senza fermare nessuno" onClick={() => onMossa(v.id, 'cima')}>↑ Precedenza</button>
                      <button className="tasto tasto--mini" title="Lo ferma e lo mette in cima alla fila" onClick={() => onFerma?.(v.id)}>Ferma</button>
                    </>
                  )}
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
                    <span className="spec__ws">{v.workspaceNome ?? nomeWorkspace(v.workspace)}{v.parcheggiata === true ? <span className="spec__parcheggiato"> · parcheggiato</span> : null}</span>
                    <span className="spec__titolo">{v.compito !== undefined ? <b>{v.compito} </b> : null}{v.titolo ?? v.descrizione}</span>
                    <span className="spec__sotto">
                      {v.tipo} · aspetta da {daQuanto(v.dal, adesso)}{v.minutiStimati !== undefined ? ` · circa ${minutiTesto(v.minutiStimati)} per finire` : ''} · priorità {prioritaTesto(v.priorita)}
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
    const spinta = window.gestore.autopilota.suSpecialistiCambiati?.(rileggi)
    return () => { clearInterval(t); spinta?.() }
  }, [attiva, rileggi])
  return { vista, rileggi, metti }
}

/**
 * k-160: Specialisti sta a destra, accanto al workspace (come le Domande): il
 * mosaico si restringe invece di essere coperto. Larghezza trascinabile dal
 * bordo, ricordata fra un avvio e l'altro.
 */
export function PannelloSpecialisti({ onChiudi, larghezza, onLarghezza, altreColonne = 0 }: {
  onChiudi: () => void
  larghezza: number
  onLarghezza: (px: number) => void
  /** Quanto prendono le altre colonne a destra già aperte. */
  altreColonne?: number
}): React.JSX.Element {
  const [larga, setLarga] = useState(larghezza)
  useEffect(() => setLarga(larghezza), [larghezza])
  const finestra = useLarghezzaFinestra()
  const trascina = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const bersaglio = e.currentTarget
    bersaglio.setPointerCapture(e.pointerId)
    const partenza = e.clientX
    const iniziale = larga
    let ultima = iniziale
    const muovi = (ev: PointerEvent): void => {
      ultima = larghezzaTrascinata({ sezione: 'specialisti', iniziale, partenzaX: partenza, x: ev.clientX, finestra: window.innerWidth, altreColonne })
      setLarga(ultima)
    }
    const molla = (): void => {
      bersaglio.removeEventListener('pointermove', muovi)
      bersaglio.removeEventListener('pointerup', molla)
      onLarghezza(ultima)
    }
    bersaglio.addEventListener('pointermove', muovi)
    bersaglio.addEventListener('pointerup', molla)
  }
  const tasti = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const passo = passoFreccia('specialisti', e.key)
    if (passo === 0) return
    e.preventDefault()
    const nuova = Math.min(limita('specialisti', larga + passo), massimoColonna('specialisti', window.innerWidth, altreColonne))
    setLarga(nuova)
    onLarghezza(nuova)
  }
  const iniziale = (): void => { setLarga(MISURE.specialisti.predefinita); onLarghezza(MISURE.specialisti.predefinita) }
  const { vista, rileggi, metti } = useAttesaSpecialisti(true)
  const [adesso, setAdesso] = useState(() => Date.now())
  const [daTogliere, setDaTogliere] = useState<string | undefined>(undefined)
  const [daFermare, setDaFermare] = useState<string | undefined>(undefined)
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
  const mossa = (id: string, m: MossaFila): void => { setDaFermare(undefined); void window.gestore.autopilota.prioritaAttesa(id, m).then(dopo).catch(() => dopo(undefined)) }
  const togli = (id: string): void => { setDaTogliere(undefined); void window.gestore.autopilota.togliAttesa(id).then(dopo).catch(() => dopo(undefined)) }
  const inFila = typeof vista === 'object' ? vista.inFila.length : 0
  return (
    <aside className="domande-lato specialisti-lato" style={{ width: larghezzaEffettiva('specialisti', larga, finestra, altreColonne) }} aria-label="Specialisti">
      <div
        className="domande-lato__maniglia"
        role="separator"
        aria-orientation="vertical"
        aria-label="Larghezza della colonna degli Specialisti"
        tabIndex={0}
        title={suggerimentoBarra('specialisti')}
        onPointerDown={trascina}
        onDoubleClick={iniziale}
        onKeyDown={tasti}
      />
      <div className="progetti__testa">
        <span className="progetti__titolo">☰ Specialisti{inFila > 0 ? ` · ${inFila} in fila` : ''}</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={rileggi}>Aggiorna</button>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {nota !== undefined ? <div className="progetti__striscia">⚠ {nota}</div> : null}
      <div className="progetti__corpo">
        <div className="progetti__tabella">
          <ListaSpecialisti vista={vista} adesso={adesso} {...(daTogliere !== undefined ? { daTogliere } : {})} {...(daFermare !== undefined ? { daFermare } : {})} onMossa={mossa} onFerma={setDaFermare} onAnnullaFerma={() => setDaFermare(undefined)} onTogli={setDaTogliere} onAnnullaTogli={() => setDaTogliere(undefined)} onConfermaTogli={togli} />
        </div>
      </div>
    </aside>
  )
}
