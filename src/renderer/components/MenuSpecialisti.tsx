import { useCallback, useEffect, useRef, useState } from 'react'
import type { MossaAttesa, VistaAttesa } from '@shared/attesa-specialisti'
import { menuSpecialisti, type RigaMenuSpecialisti } from '@shared/menu-specialisti'
import { Aiuto } from './Aiuto'

/** Ogni quanto si rilegge con il menu aperto, e con il menu chiuso (solo per il tasto). */
export const RILETTURA_APERTO_MS = 4000
export const RILETTURA_CHIUSO_MS = 20000

type Props = {
  vista: VistaAttesa | undefined
  /** I modi in cui questa chat chiama il suo workspace: chi lo ha è «in evidenza». */
  riferimenti: string[]
  /** La voce di cui «Ferma» aspetta la conferma. */
  daFermare?: string
  onMossa: (id: string, mossa: MossaAttesa) => void
  onFerma: (id: string) => void
  onAnnullaFerma: () => void
  onApriSezione: () => void
  /** k-60: la lista di un altro PC si guarda e basta: niente precedenza, niente «Ferma», niente «Apri». */
  soloLettura?: boolean
}

/**
 * Il contenuto del menu (k-54): chi lavora, chi è in fila, il totale. Solo
 * disegno, senza stato: lo provano i test.
 */
export function ElencoMenuSpecialisti({ vista, riferimenti, daFermare, onMossa, onFerma, onAnnullaFerma, onApriSezione, soloLettura = false }: Props): React.JSX.Element {
  if (vista === undefined) return <div className="menuspec__vuoto">Leggo la lista…</div>
  const m = menuSpecialisti(vista, riferimenti)
  const riga = (r: RigaMenuSpecialisti, lavora: boolean): React.JSX.Element => (
    <li key={r.id} className={`menuspec__riga${r.corrente ? ' menuspec__riga--mia' : ''}`}>
      <span className="menuspec__titolo">
        {r.posizione !== undefined ? <b>{r.posizione}° </b> : null}{r.titolo}
        {r.altroWorkspace !== '' ? <span className="menuspec__ws"> · {r.altroWorkspace}</span> : null}
      </span>
      {lavora && r.percentuale !== undefined ? (
        <span className="menuspec__misura">
          <span className="barra" role="progressbar" aria-valuenow={r.percentuale} aria-valuemin={0} aria-valuemax={100}>
            <span className="barra__pieno menuspec__pieno" style={{ width: `${r.percentuale}%` }} />
          </span>
          <b>{r.percentuale}%</b>
        </span>
      ) : null}
      {r.cosaFa !== '' ? <span className="menuspec__cosa">{r.cosaFa}</span> : null}
      <span className="menuspec__sotto">
        {r.manca}
        {r.inRitardo ? <span className="menuspec__ritardo"> · in ritardo</span> : null}
        {r.prenotata ? <span className="menuspec__ritardo"> · tocca a lui</span> : null}
        {r.parcheggiata ? ' · fermato, riparte per primo' : ''}
        {r.fermaRichiesta ? <span className="menuspec__ritardo"> · fermata chiesta…</span> : null}
      </span>
      {soloLettura ? null : <span className="menuspec__tasti">
        {daFermare === r.id ? (
          <>
            <span className="menuspec__chiede">Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato.</span>
            <button className="tasto tasto--mini" onClick={() => onMossa(r.id, 'ferma')}>Sì, ferma</button>
            <button className="tasto tasto--mini" onClick={onAnnullaFerma}>No</button>
          </>
        ) : (
          <>
            <button className="tasto tasto--mini" title="Passa davanti a chi aspetta" disabled={!lavora && r.posizione === 1} onClick={() => onMossa(r.id, 'cima')}>↑ Precedenza</button>
            {lavora && !r.fermaRichiesta ? <button className="tasto tasto--mini" title="Lo ferma e lo mette in cima alla fila" onClick={() => onFerma(r.id)}>Ferma</button> : null}
          </>
        )}
      </span>}
    </li>
  )
  return (
    <div className="menuspec__corpo">
      <div className="menuspec__intesta">
        <span className="serigrafia">Al lavoro adesso</span>
        <Aiuto di="precedenza">{soloLettura ? 'Questa è la lista di un altro PC, letta da là ogni pochi secondi. Qui si guarda soltanto: per cambiare la fila o fermare qualcuno si lavora su quel PC. La percentuale è una stima, non arriva mai a 100 prima della fine.' : '«↑ Precedenza» porta uno specialista in cima alla fila: prende il prossimo posto libero prima degli altri. Non ferma mai chi sta già lavorando: cambia solo l’ordine di chi aspetta. «Ferma» invece interrompe chi lavora, lo mette in cima alla fila e il suo lavoro resta salvato sul suo ramo; riparte per primo quando si libera un posto. La percentuale è una stima, non arriva mai a 100 prima della fine.'}</Aiuto>
      </div>
      {m.lavorano.length === 0 ? <div className="menuspec__vuoto">Nessuno al lavoro</div> : <ul className="menuspec__elenco" aria-label="Al lavoro adesso">{m.lavorano.map((r) => riga(r, true))}</ul>}
      <span className="serigrafia">In fila</span>
      {m.inFila.length === 0 ? <div className="menuspec__vuoto">Nessuno in fila</div> : <ul className="menuspec__elenco" aria-label="In fila">{m.inFila.map((r) => riga(r, false))}</ul>}
      <div className="menuspec__piede">
        <span>{m.totale}</span>
        {soloLettura ? null : <button className="tasto tasto--mini" onClick={onApriSezione}>Apri Specialisti</button>}
      </div>
    </div>
  )
}

/**
 * Il tasto in testa alla chat dell'autopilota e la tendina (k-54). Legge la
 * lista ogni pochi secondi solo mentre è aperta; chiusa, ogni tanto, per il
 * testo del tasto.
 */
export function MenuSpecialisti({ riferimenti }: { riferimenti: string[] }): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const [vista, setVista] = useState<VistaAttesa | undefined>(undefined)
  const [daFermare, setDaFermare] = useState<string | undefined>(undefined)
  const radice = useRef<HTMLDivElement | null>(null)
  const metti = useCallback((v: VistaAttesa | undefined): void => {
    if (v === undefined) return
    setVista((prima) => (JSON.stringify(prima) === JSON.stringify(v) ? prima : v))
  }, [])
  const rileggi = useCallback((): void => {
    window.gestore.autopilota.attesaSpecialisti().then(metti).catch(() => undefined)
  }, [metti])
  useEffect(() => {
    rileggi()
    const t = setInterval(rileggi, aperto ? RILETTURA_APERTO_MS : RILETTURA_CHIUSO_MS)
    const spinta = window.gestore.autopilota.suSpecialistiCambiati?.(rileggi)
    return () => { clearInterval(t); spinta?.() }
  }, [aperto, rileggi])
  useEffect(() => {
    if (!aperto) return
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') setAperto(false) }
    const suClic = (e: MouseEvent): void => { if (radice.current !== null && !radice.current.contains(e.target as Node)) setAperto(false) }
    window.addEventListener('keydown', suTasto)
    window.addEventListener('mousedown', suClic)
    return () => { window.removeEventListener('keydown', suTasto); window.removeEventListener('mousedown', suClic) }
  }, [aperto])
  const etichetta = vista === undefined ? 'Specialisti' : menuSpecialisti(vista, riferimenti).etichetta
  const mossa = (id: string, m: MossaAttesa): void => {
    setDaFermare(undefined)
    void window.gestore.autopilota.prioritaAttesa(id, m).then((v) => { if (v === undefined) rileggi(); else metti(v) }).catch(() => rileggi())
  }
  return (
    <div className="menuspec" ref={radice}>
      <button className="tasto tasto--mini menuspec__tasto" aria-haspopup="true" aria-expanded={aperto} title="Gli specialisti: chi lavora e chi aspetta" onClick={() => { setAperto((a) => !a); setDaFermare(undefined) }}>
        {etichetta} {aperto ? '▴' : '▾'}
      </button>
      {aperto ? (
        <div className="menuspec__tendina" role="dialog" aria-label="Specialisti">
          <ElencoMenuSpecialisti
            vista={vista}
            riferimenti={riferimenti}
            {...(daFermare !== undefined ? { daFermare } : {})}
            onMossa={mossa}
            onFerma={setDaFermare}
            onAnnullaFerma={() => setDaFermare(undefined)}
            onApriSezione={() => { setAperto(false); window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'specialisti' })) }}
          />
        </div>
      ) : null}
    </div>
  )
}
