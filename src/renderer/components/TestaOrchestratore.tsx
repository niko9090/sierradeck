import { useEffect, useMemo, useState } from 'react'
import { fraseStatoOrchestratore, type VistaOrchestratore } from '@shared/piano-orchestratore'
import { creaSondaggio, useSondaggio, type Sondaggio } from '../state/sondaggio'
import { Aiuto } from './Aiuto'

/**
 * **L'autopilota del workspace, in testa alla sua chat** (P3; dal 30/10 l'unico, sempre acceso): la percentuale del
 * workspace (calcolata dal programma sul piano), il perché quando scende, gli
 * specialisti al lavoro e le due impostazioni (modello, quanti specialisti
 * insieme). Una lettura condivisa per workspace, ogni 10 s a finestra davanti.
 */

const RILETTURA_MS = 10_000
const sondaggi = new Map<string, Sondaggio<VistaOrchestratore | undefined>>()
export function sondaggioOrchestratore(ws: string): Sondaggio<VistaOrchestratore | undefined> {
  let s = sondaggi.get(ws)
  if (s === undefined) {
    s = creaSondaggio(() => window.gestore.autopilota.orchestratore(ws), RILETTURA_MS, Infinity)
    sondaggi.set(ws, s)
  }
  return s
}

const PAROLA_STATO: Record<string, string> = { avviato: 'parte', lavoro: 'al lavoro', finito: 'ha finito', fallito: 'non riuscito', fermato: 'fermato', attesa: 'aspetta' }

const AIUTO_UNICO = 'Un autopilota solo per il workspace: gli parli qui, mette ogni richiesta in coda (unendo quelle sulla stessa cosa, senza perdere punti), fa il piano, lancia gli specialisti (sviluppatore, verificatore, revisore, esploratore…) ognuno nella sua copia del progetto, unisce i loro rami e ti chiede solo quello che deve decidere tu. Ogni specialista al lavoro compare come una chat sulla destra, da guardare dal vivo (la guida l’autopilota); la riga sotto la percentuale dice chi è al lavoro adesso, o perché è tutto fermo. La percentuale la calcola il programma solo sul lavoro aperto: un compito da fare vale 0, in corso 20-60%, in revisione 80%, unito con il criterio verde 100%. Una domanda o un «sì» non la fanno scendere: l’autopilota risponde e la chiude; un messaggio nuovo conta solo quando diventa piano.'

/**
 * 0.95.3 (Nicholas, 06/11): in vista solo la barra con la percentuale e la
 * riga di cosa succede adesso; il resto (numeri, specialisti, dal vivo,
 * impostazioni e quello che passa in `children`) nella tendina ▾.
 */
export function TestaOrchestratore({ workspace, children }: { workspace: string; children?: React.ReactNode }): React.JSX.Element | null {
  const s = useMemo(() => sondaggioOrchestratore(workspace), [workspace])
  const v = useSondaggio(s)
  // Spinta a evento: la barra si aggiorna appena uno specialista cambia, senza aspettare il giro.
  useEffect(() => window.gestore.autopilota.suSpecialistiCambiati?.(() => s.rileggi()), [s])
  const [impostazioni, setImpostazioni] = useState(false)
  const [registro, setRegistro] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [finitiAperti, setFinitiAperti] = useState(false)
  const [tendina, setTendina] = useState(false)
  // Un servizio di prima, senza l'orchestratore: il resto si vede com'era.
  if (v === undefined) return <>{children}</>
  // 0.89.2: una frase su cosa succede adesso; i numeri solo del lavoro aperto.
  const ora = fraseStatoOrchestratore(v)
  const aperte = v.richieste?.aperte ?? 0
  const daPianificare = v.richieste?.daPianificare ?? 0
  const attivi = v.specialisti.filter((c) => c.stato === 'lavoro' || c.stato === 'avviato')
  const finiti = v.specialisti.filter((c) => c.stato !== 'lavoro' && c.stato !== 'avviato')
  const cambia = (p: { modello?: 'sonnet' | 'opus'; tettoSpecialisti?: number }): void => {
    setErrore(undefined)
    window.gestore.autopilota.impostaOrchestratore(workspace, p)
      .then(() => s.rileggi())
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
  }
  return (
    <div className="coda-ws coda-ws--compatta" aria-label="Avanzamento del workspace">
      <div className="coda-ws__riga">
        {v.percento !== undefined ? (
          <div className="punto-ap__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.percento} aria-label="Avanzamento del workspace">
            <span style={{ width: `${v.percento}%` }} />
          </div>
        ) : <span className="coda-ws__vuota" />}
        <b title="Quanto è fatto del lavoro aperto adesso">{v.percento !== undefined ? `${v.percento}%` : '—'}</b>
        <button className="tasto tasto--mini" aria-expanded={tendina} onClick={() => setTendina((x) => !x)} title="Richieste, specialisti, coda e impostazioni">{tendina ? '▴' : '▾'}</button>
      </div>
      <div className={`coda-ws__ora coda-ws__ora--${ora.tono}`} role="status" title={ora.testo}>{ora.tono === 'lavora' ? '● ' : ora.tono === 'riposo' ? '✓ ' : '⏸ '}{ora.testo}</div>
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      {tendina ? (
      <div className="coda-ws__tendina">
      <div className="coda-ws__testa con-aiuto">
        <b title="Quanto è fatto del lavoro aperto adesso">{v.percento !== undefined ? `${v.percento}%` : '—'}</b>
        <span className="coda-ws__quieto">
          {aperte === 0 ? 'nessuna richiesta in lavoro' : `${aperte === 1 ? '1 richiesta' : `${aperte} richieste`} in lavoro`}
          {v.piano.totale > 0 ? ` · compiti ${v.piano.uniti} fatti su ${v.piano.totale}` : ''}
          {daPianificare > 0 ? ` · ${daPianificare === 1 ? '1 messaggio' : `${daPianificare} messaggi`} da pianificare` : ''}
        </span>
        <Aiuto di="l’autopilota del workspace">{AIUTO_UNICO}</Aiuto>
        <button className="tasto tasto--mini" aria-expanded={impostazioni} onClick={() => setImpostazioni((x) => !x)}>Impostazioni</button>
      </div>
      {v.calo !== undefined ? <div className="coda-ws__quieto">scesa da {v.calo.da}% a {v.calo.a}%: {v.calo.perche}</div> : null}
      {[...attivi, ...(finitiAperti ? finiti : [])].map((c) => (
        <div key={c.id} className="coda-ws__quieto" title={c.compito}>
          <b>{c.ruolo ?? 'specialista'}</b>{c.compitoId !== undefined ? ` · ${c.compitoId}` : ''}{c.adottata === true ? ' · chat adottata' : ''} · {PAROLA_STATO[c.stato] ?? c.stato}{c.durata !== undefined && c.durata !== '' ? ` da ${c.durata}` : ''}: {c.compito.length > 100 ? `${c.compito.slice(0, 99)}…` : c.compito}
          {c.attivita !== undefined && (c.stato === 'lavoro' || c.stato === 'avviato') ? <div>↳ {c.attivita}</div> : null}
        </div>
      ))}
      {finiti.length > 0 ? (
        <button className="pan2-riga-apri" aria-expanded={finitiAperti} onClick={() => setFinitiAperti((x) => !x)}>
          {finitiAperti ? '▾' : '▸'} {finiti.length === 1 ? '1 specialista finito' : `${finiti.length} specialisti finiti`} nell’ultima ora
        </button>
      ) : null}
      {v.registro.length > 0 ? (
        <>
          <button className="pan2-riga-apri" aria-expanded={registro} onClick={() => setRegistro((x) => !x)}>
            {registro ? '▾' : '▸'} Dal vivo · {v.vivo ? 'acceso' : 'a riposo'} · oggi {v.costo.turniOggi} turni, {v.costo.oggiUsd.toFixed(2)} $
          </button>
          {registro ? [...v.registro].reverse().map((r, i) => <div key={`${r.quando}-${i}`} className="coda-ws__quieto">{r.quando.slice(11, 16)} · {r.testo}</div>) : null}
        </>
      ) : null}
      {impostazioni ? (
        <div className="coda-ws__corpo">
          <label>
            Modello{' '}
            <select value={v.modello} onChange={(e) => cambia({ modello: e.target.value === 'opus' ? 'opus' : 'sonnet' })}>
              <option value="opus">Opus (il migliore, consigliato per chi coordina)</option>
              <option value="sonnet">Sonnet (consuma meno, meno preciso nel coordinare)</option>
            </select>
          </label>{' '}
          <label>
            Specialisti insieme{' '}
            <select value={v.tettoSpecialisti} onChange={(e) => cambia({ tettoSpecialisti: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      {children}
      </div>
      ) : null}
    </div>
  )
}
