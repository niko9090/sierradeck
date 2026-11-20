import { useCallback, useEffect, useState } from 'react'
import { voceMenu } from '@shared/menu-principale'
import { dividiCorrezioni } from '@shared/correzioni'
import { PAROLA_STATO_CODA, type VistaCoda } from '@shared/coda-richieste'
import { oraBreve } from '@shared/storico-errori'
import { SORGENTE_LOCALE } from '../sorgente-autopilota'
import { Aiuto } from './Aiuto'

/**
 * **Correzioni** (k-166m2): gli errori arrivati dagli altri PC, il lavoro in
 * corso per correggerli e le correzioni già fatte, in un posto solo. Testi
 * corti; la spiegazione lunga sta dietro il «?».
 */
type Arrivi = Awaited<ReturnType<typeof window.gestore.errori.correzioni>>

const RILETTURA_MS = 15_000
const PRIME = 8

export function PannelloCorrezioni({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [arrivi, setArrivi] = useState<Arrivi | undefined>(undefined)
  const [coda, setCoda] = useState<VistaCoda | undefined>(undefined)
  const [problema, setProblema] = useState<string | undefined>(undefined)
  const [tutti, setTutti] = useState(false)
  const [fatteAperte, setFatteAperte] = useState(false)

  const leggi = useCallback((): void => {
    void window.gestore.errori.correzioni()
      .then((a) => {
        setArrivi(a)
        setProblema(undefined)
        if (a.workspace !== undefined) void SORGENTE_LOCALE.coda(a.workspace).then(setCoda).catch(() => setCoda(undefined))
      })
      .catch(() => setProblema('Non riesco a leggere gli errori adesso: riprovo tra poco.'))
  }, [])
  useEffect(() => {
    leggi()
    const t = setInterval(leggi, RILETTURA_MS)
    return () => clearInterval(t)
  }, [leggi])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const gruppi = arrivi?.gruppi ?? []
  const mostrati = tutti ? gruppi : gruppi.slice(0, PRIME)
  const { inCorso, fatte } = dividiCorrezioni(coda?.richieste ?? [])
  const senzaSviluppo = arrivi !== undefined && arrivi.workspace === undefined

  return (
    <div className="progetti salute" role="dialog" aria-label="Correzioni">
      <div className="progetti__testa">
        <span className="progetti__titolo">{voceMenu('correzioni').icona} Correzioni</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi}>Aggiorna</button>
        <Aiuto di="Correzioni">Qui trovi gli errori che gli altri PC ti hanno mandato, raggruppati: lo stesso errore ripetuto è una riga sola, con le volte. Poi il lavoro che l’autopilota «Errori arrivati» sta facendo per correggerli, e le correzioni già fatte, con la versione. Gli errori di questo PC e i computer stanno in Salute e in Computer. Compare tutto solo sul PC di sviluppo, dove gli errori arrivano.</Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {problema !== undefined ? <div className="progetti__striscia">⚠ {problema}</div> : null}
      <div className="progetti__corpo">
        <div className="progetti__dcorpo" style={{ padding: '8px 16px', overflow: 'auto' }}>
          {senzaSviluppo ? <div className="progetti__vuoto">Su questo PC non arrivano errori dagli altri: la pagina si riempie sul PC di sviluppo.</div> : null}

          <div className="progetti__sezione">
            <span className="serigrafia con-aiuto">
              Errori arrivati{arrivi !== undefined ? ` · ${gruppi.length}` : ''}
              <Aiuto di="Errori arrivati">Gli errori mandati dagli altri PC e non ancora passati all’autopilota. Dopo qualche minuto di quiete diventano un lavoro e escono da questa lista. Se uno si ripresenta dopo una correzione, lo segno.</Aiuto>
            </span>
            {arrivi === undefined ? <div className="progetti__quieto">Leggo…</div> : null}
            {arrivi !== undefined && gruppi.length === 0 ? <div className="progetti__quieto">Nessun errore in attesa.</div> : null}
            {arrivi?.attesa !== undefined ? <div className="progetti__quieto">{arrivi.attesa}</div> : null}
            <ul className="errori__elenco">
              {mostrati.map((g) => (
                <li key={g.chiave} className="errori__voce" title={`Da: ${g.da.join(', ')}`}>
                  <span className="errori__quando">{oraBreve(g.ultima)}{g.volte > 1 ? ` · ${g.volte} volte` : ''}{g.da.length > 1 ? ` · ${g.da.length} PC` : ''}{g.ritorna ? ' · si ripresenta' : ''}</span>
                  <span className="errori__messaggio">{g.messaggio}</span>
                </li>
              ))}
            </ul>
            {gruppi.length > PRIME ? <button className="tasto tasto--mini" onClick={() => setTutti(!tutti)}>{tutti ? 'Mostra meno' : `Mostra tutti (${gruppi.length})`}</button> : null}
          </div>

          <div className="progetti__sezione">
            <span className="serigrafia con-aiuto">
              Lavoro in corso{coda !== undefined ? ` · ${inCorso.length}` : ''}
              <Aiuto di="Lavoro in corso">Le richieste «Errori arrivati» della coda dell’autopilota che non sono ancora chiuse: l’autopilota prima analizza, poi corregge con i test e la revisione.</Aiuto>
            </span>
            {coda === undefined && !senzaSviluppo ? <div className="progetti__quieto">La coda non c’è ancora o si sta leggendo.</div> : null}
            {coda !== undefined && inCorso.length === 0 ? <div className="progetti__quieto">Niente in corso.</div> : null}
            {inCorso.map((r) => (
              <div key={r.id} className="coda-ws__richiesta">
                <div className="coda-ws__testa">
                  <span className="coda-ws__quieto">{r.id}</span>
                  <span>{PAROLA_STATO_CODA[r.stato]}</span>
                  <b>{r.percento}%</b>
                  <span className="coda-ws__titolo">{r.titolo}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="progetti__sezione">
            <span className="serigrafia con-aiuto">
              Correzioni fatte{coda !== undefined ? ` · ${fatte.length}` : ''}
              <Aiuto di="Correzioni fatte">Le richieste «Errori arrivati» già chiuse, con la versione in cui la correzione è uscita, quando c’è. Le più recenti sono in cima.</Aiuto>
            </span>
            {coda !== undefined && fatte.length === 0 ? <div className="progetti__quieto">Ancora nessuna.</div> : null}
            {fatte.length > 0 ? <button className="tasto tasto--mini" aria-expanded={fatteAperte} onClick={() => setFatteAperte(!fatteAperte)}>{fatteAperte ? 'Nascondi' : 'Mostra'}</button> : null}
            {fatteAperte ? fatte.map((r) => (
              <div key={r.id} className="coda-ws__richiesta">
                <div className="coda-ws__testa">
                  <span className="coda-ws__quieto">{r.id}</span>
                  <span style={{ color: 'var(--verde, #3fb950)' }}>{r.chiusa !== undefined ? 'chiusa' : 'fatta'}{r.versione !== undefined ? ` nella ${r.versione}` : ''}</span>
                  <span className="coda-ws__titolo">{r.titolo}</span>
                </div>
              </div>
            )) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
