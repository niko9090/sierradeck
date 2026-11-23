import { useEffect, useMemo, useState } from 'react'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { Aiuto } from './Aiuto'
import { useAttesaSpecialisti } from './PannelloSpecialisti'
import { daQuanto } from '@shared/attesa-vista'
import {
  SPIEGA_PANNELLO, SPIEGA_UNIONI, TESTO_FERMA, agentiAlLavoro, dopoFinito, esitiRecenti, filaUnioni, testoFile
} from '../pannello-agenti-vista'

const COLORE = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)' } as const

type Props = {
  vista: VistaAttesa | 'vecchio' | undefined
  /** I modi in cui l'autopilota scelto chiama il suo workspace (chiave, cartella). */
  riferimenti: string[]
  adesso: number
  /** L'agente di cui «Ferma» aspetta il «Sì». */
  daFermare?: string
  /** Il messaggio dell'ultima fermata. */
  nota?: string
  onFerma: (id: string) => void
  onConfermaFerma: (id: string) => void
  onAnnullaFerma: () => void
}

/**
 * **Il pannello degli agenti** (k-176a, richiesta r-176): solo chi lavora adesso,
 * con ruolo, compito, file, PC, durata e ultima azione, e «Ferma» per ognuno.
 * Poi le Unioni (la fila e gli esiti) e cosa è successo ai lavori finiti.
 * Solo disegno: la logica sta in `pannello-agenti-vista.ts`.
 */
export function ElencoAgenti({ vista, riferimenti, adesso, daFermare, nota, onFerma, onConfermaFerma, onAnnullaFerma }: Props): React.JSX.Element {
  if (vista === undefined) return <div className="progetti__vuoto">Leggo gli agenti…</div>
  if (vista === 'vecchio') return <div className="progetti__vuoto">Serve la versione nuova del servizio</div>
  const agenti = agentiAlLavoro(vista, riferimenti, adesso)
  const fila = filaUnioni(vista, riferimenti)
  const esiti = esitiRecenti(vista, riferimenti)
  const dopo = dopoFinito(vista, riferimenti)
  return (
    <div className="agenti">
      <div className="agenti__sezione">
        <span className="serigrafia con-aiuto">Al lavoro adesso<Aiuto di="gli agenti">{SPIEGA_PANNELLO}</Aiuto></span>
        {nota !== undefined ? <div className="progetti__quieto">{nota}</div> : null}
        {agenti.length === 0 ? <div className="spec__vuoto">Nessuno al lavoro</div> : (
          <ul className="agenti__elenco" aria-label="Al lavoro adesso">
            {agenti.map((a) => (
              <li key={a.id} className="agenti__scheda">
                <div className="agenti__testa">
                  <span className="agenti__ruolo">{a.ruolo}</span>
                  <span className="agenti__durata">da {a.durata}</span>
                  <span className="agenti__tasti">
                    {daFermare === a.id ? (
                      <>
                        <span className="spec__chiede">{TESTO_FERMA.domanda}</span>
                        <button className="tasto tasto--mini" onClick={() => onConfermaFerma(a.id)}>{TESTO_FERMA.si}</button>
                        <button className="tasto tasto--mini" onClick={onAnnullaFerma}>{TESTO_FERMA.no}</button>
                      </>
                    ) : a.fermaRichiesta ? <span className="spec__chiede">fermata chiesta…</span> : a.puoFermare ? (
                      <button className="tasto tasto--mini" title="Lo ferma: il lavoro fatto resta salvato" onClick={() => onFerma(a.id)}>{TESTO_FERMA.tasto}</button>
                    ) : null}
                  </span>
                </div>
                <div className="agenti__titolo">{a.compito !== undefined ? <b>{a.compito} </b> : null}{a.titolo}</div>
                <div className="agenti__dati">
                  <span title="Il PC su cui lavora">{a.pc}</span>
                  {a.file.length > 0 ? <span title={a.file.join('\n')}>{testoFile(a.file, a.fileAltri)}</span> : <span>nessun file toccato</span>}
                  {a.invio ? <span className="agenti__ambra">invio dati…</span> : null}
                </div>
                {a.adesso !== '' ? <div className="agenti__adesso" title={a.adesso}>{a.adesso}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="agenti__sezione">
        <span className="serigrafia con-aiuto">Unioni<Aiuto di="le unioni">{SPIEGA_UNIONI}</Aiuto></span>
        {fila.length === 0 && esiti.length === 0 ? <div className="spec__vuoto">Nessuna unione</div> : null}
        {fila.length > 0 ? (
          <ul className="agenti__elenco" aria-label="Fila delle unioni">
            {fila.map((u) => (
              <li key={u.id} className="agenti__riga">
                <span className="agenti__num">{u.posizione}°</span>
                <span className="agenti__corpo">{u.titolo}</span>
                <span className="agenti__stato" style={{ color: u.inCorso ? COLORE.verde : COLORE.ambra }}>{u.parole}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {esiti.length > 0 ? (
          <ul className="agenti__elenco" aria-label="Esiti recenti">
            {esiti.map((e) => (
              <li key={e.id} className="agenti__riga" title={e.comando}>
                <span className="agenti__pallino" style={{ background: e.verde ? COLORE.verde : COLORE.rosso }} aria-hidden="true" />
                <span className="agenti__corpo">{e.titolo}</span>
                <span className="agenti__stato" style={{ color: e.verde ? COLORE.verde : COLORE.rosso }}>{e.parole} · {daQuanto(e.quando, adesso)} fa</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {dopo.length > 0 ? (
        <div className="agenti__sezione">
          <span className="serigrafia">Dopo «finito»</span>
          <ul className="agenti__elenco" aria-label="Dopo finito">
            {dopo.map((d) => (
              <li key={d.id} className="agenti__riga">
                <span className="agenti__corpo">{d.titolo}</span>
                {d.durata !== '' ? <span className="agenti__durata">{d.durata}</span> : null}
                <span className="agenti__stato" style={{ color: COLORE[d.colore] }}>{d.parole}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Il pannello vivo: legge la lista ogni pochi secondi e ferma davvero con `fermaSpecialista`. */
export function PannelloAgenti({ riferimenti }: { riferimenti: string[] }): React.JSX.Element {
  const { vista, rileggi } = useAttesaSpecialisti(true)
  const [adesso, setAdesso] = useState(() => Date.now())
  const [daFermare, setDaFermare] = useState<string | undefined>(undefined)
  const [nota, setNota] = useState<string | undefined>(undefined)
  useEffect(() => { setAdesso(Date.now()) }, [vista])
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 15_000); return () => clearInterval(t) }, [])
  const rif = useMemo(() => riferimenti, [riferimenti.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const ferma = (id: string): void => {
    setDaFermare(undefined)
    void window.gestore.autopilota.fermaSpecialista(id)
      .then((r) => { setNota(r.messaggio); rileggi() })
      .catch(() => { setNota('Non è andata: il servizio non ha risposto. Riprova tra poco.'); rileggi() })
  }
  return (
    <ElencoAgenti
      vista={vista} riferimenti={rif} adesso={adesso}
      {...(daFermare !== undefined ? { daFermare } : {})}
      {...(nota !== undefined ? { nota } : {})}
      onFerma={setDaFermare} onConfermaFerma={ferma} onAnnullaFerma={() => setDaFermare(undefined)}
    />
  )
}
