import { useMemo, useState } from 'react'
import { PAROLA_STATO_CODA, unite, type Richiesta, type StatoCoda, type VistaCoda } from '@shared/coda-richieste'
import { giornoDi } from '@shared/coda-richieste'
import { creaSondaggio, useSondaggio, type Sondaggio } from '../state/sondaggio'
import { Aiuto } from './Aiuto'

/**
 * **La coda del workspace** (P1): ogni richiesta con il suo stato, la sua
 * percentuale, e il badge «unisce r-12, r-14» che si apre sugli originali
 * parola per parola e sul perché; «Separa» disfa l'unione. In cima la
 * percentuale del workspace.
 *
 * Leggera: si legge solo con la sezione aperta e la finestra davanti (una
 * lettura condivisa per workspace, `creaSondaggio`), mai a finestra nascosta.
 */

/** Ogni quanto si rilegge, con la sezione aperta. */
const RILETTURA_MS = 10_000

const sondaggi = new Map<string, Sondaggio<VistaCoda | undefined>>()
function sondaggioDi(ws: string): Sondaggio<VistaCoda | undefined> {
  let s = sondaggi.get(ws)
  if (s === undefined) {
    // `Infinity`: a finestra nascosta non si rilegge affatto; torna davanti, rilegge subito.
    s = creaSondaggio(() => window.gestore.autopilota.coda(ws), RILETTURA_MS, Infinity)
    sondaggi.set(ws, s)
  }
  return s
}

const COLORE: Record<StatoCoda, string> = {
  'in-coda': 'var(--ambra, #d29922)',
  pianificata: 'var(--ambra, #d29922)',
  'in-corso': 'var(--blu, #4aa3ff)',
  'in-verifica': 'var(--blu, #4aa3ff)',
  fatta: 'var(--verde, #3fb950)'
}

const AIUTO_CODA = 'Ogni cosa che chiedi entra qui, con le tue parole intere: tutto va fatto. Se una richiesta nuova parla della stessa cosa di una già in coda, l’autopilota le unisce in una sola, riformulata: nessun punto si perde (il programma rifiuta un’unione che ne lascia fuori uno), e un punto contraddetto resta visibile, barrato, col perché. «Separa» disfa l’unione. La percentuale la calcola il programma dai compiti: da fare 0, in corso 20-60%, in revisione 80%, unito 100%.'

export function CodaWorkspace({ workspace }: { workspace: string }): React.JSX.Element {
  const [aperta, setAperta] = useState(false)
  return (
    <div className="coda-ws" aria-label="Coda delle richieste">
      <button className="pan2-riga-apri" aria-expanded={aperta} onClick={() => setAperta((v) => !v)}>
        {aperta ? '▾' : '▸'} Coda del workspace
      </button>
      {aperta ? <CodaAperta workspace={workspace} /> : null}
    </div>
  )
}

function CodaAperta({ workspace }: { workspace: string }): React.JSX.Element {
  const s = useMemo(() => sondaggioDi(workspace), [workspace])
  const vista = useSondaggio(s)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [fatteAperte, setFatteAperte] = useState(false)
  if (vista === undefined) return <div className="coda-ws__corpo coda-ws__quieto">La coda non c’è ancora (il servizio degli autopiloti è di una versione di prima, o si sta leggendo).</div>
  const aperte = vista.richieste.filter((r) => r.stato !== 'fatta')
  const fatte = vista.richieste.filter((r) => r.stato === 'fatta')
  const separa = (id: string): void => {
    setErrore(undefined)
    window.gestore.autopilota.codaSepara(workspace, id)
      .then(() => s.rileggi())
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
  }
  return (
    <div className="coda-ws__corpo">
      <div className="coda-ws__testa con-aiuto">
        <b>{vista.totale !== undefined ? `${vista.totale}%` : '—'}</b>
        <span className="coda-ws__quieto">
          {aperte.length === 1 ? '1 richiesta aperta' : `${aperte.length} richieste aperte`}
          {fatte.length > 0 ? ` · ${fatte.length} fatte` : ''}
          {vista.compattate.length > 0 ? ` · ${vista.compattate.length} vecchie compattate` : ''}
        </span>
        <Aiuto di="la coda">{AIUTO_CODA}</Aiuto>
      </div>
      {vista.totale !== undefined ? (
        <div className="punto-ap__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={vista.totale} aria-label="Avanzamento del workspace">
          <span style={{ width: `${vista.totale}%` }} />
        </div>
      ) : null}
      {/* P3: quando la percentuale scende (punti o richieste nuove), il perché. */}
      {vista.calo !== undefined ? <div className="coda-ws__quieto">scesa da {vista.calo.da}% a {vista.calo.a}%: {vista.calo.perche}</div> : null}
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      {aperte.length === 0 ? <div className="coda-ws__quieto">Niente in coda.</div> : null}
      {aperte.map((r) => <RigaCoda key={r.id} r={r} onSepara={separa} />)}
      {fatte.length > 0 ? (
        <>
          <button className="pan2-riga-apri" aria-expanded={fatteAperte} onClick={() => setFatteAperte((v) => !v)}>
            {fatteAperte ? '▾' : '▸'} Fatte · {fatte.length}
          </button>
          {fatteAperte ? [...fatte].reverse().map((r) => <RigaCoda key={r.id} r={r} onSepara={separa} />) : null}
        </>
      ) : null}
    </div>
  )
}

function RigaCoda({ r, onSepara }: { r: Richiesta & { percento: number }; onSepara: (id: string) => void }): React.JSX.Element {
  const [dettaglio, setDettaglio] = useState(false)
  const insieme = unite(r)
  const ultima = r.unioni[r.unioni.length - 1]
  return (
    <div className="coda-ws__richiesta">
      <div className="coda-ws__testa">
        <span className="coda-ws__quieto">{r.id}</span>
        <span style={{ color: COLORE[r.stato] }}>{PAROLA_STATO_CODA[r.stato]}{r.stato === 'fatta' && r.versione !== undefined ? ` nella ${r.versione}` : ''}</span>
        <b>{r.percento}%</b>
        <span className="coda-ws__titolo">{r.titolo}</span>
        {insieme.length > 0 ? (
          <button className="coda-ws__badge" aria-expanded={dettaglio} onClick={() => setDettaglio((v) => !v)} title="Gli originali, parola per parola, e il perché">
            unisce {insieme.join(', ')}
          </button>
        ) : (
          <button className="coda-ws__badge" aria-expanded={dettaglio} onClick={() => setDettaglio((v) => !v)} title="Le tue parole, intere">
            {dettaglio ? 'chiudi' : 'parole'}
          </button>
        )}
        {ultima !== undefined && r.stato !== 'fatta' ? (
          <button className="tasto tasto--mini" onClick={() => onSepara(r.id)} title={`Disfa l’unione di ${ultima.fonti.join(', ')}: tornano richieste separate`}>Separa</button>
        ) : null}
      </div>
      {r.segue !== undefined ? <div className="coda-ws__quieto">segue {r.segue}, già fatta</div> : null}
      {(r.candidati ?? []).length > 0 ? <div className="coda-ws__quieto">forse la stessa di {r.candidati!.join(', ')}: restano separate finché l’autopilota non decide</div> : null}
      {dettaglio ? (
        <>
          {r.unioni.map((u, i) => <div key={i} className="coda-ws__quieto">{giornoDi(u.il)} · unite {u.fonti.join(', ')}: {u.perche}</div>)}
          {r.punti.map((p) => (
            <div key={p.id} className={p.stato === 'superato' ? 'coda-ws__superato' : undefined} title={p.perche}>
              {p.stato === 'fatto' ? '✓' : p.stato === 'superato' ? '✗' : '•'} {p.testo}{p.stato === 'superato' && p.perche !== undefined ? ` (superato: ${p.perche})` : ''}
            </div>
          ))}
          {r.originali.map((o, i) => (
            <div key={`${o.id}-${i}`} className="coda-ws__originale">
              <span className="coda-ws__quieto">{o.id} · {giornoDi(o.quando)}</span>{'\n'}{o.testo}
            </div>
          ))}
        </>
      ) : null}
    </div>
  )
}
