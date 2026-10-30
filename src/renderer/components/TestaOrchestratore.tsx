import { useMemo, useState } from 'react'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
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

const AIUTO_UNICO = 'Un autopilota solo per il workspace: gli parli qui, mette ogni richiesta in coda (unendo quelle sulla stessa cosa, senza perdere punti), fa il piano, lancia gli specialisti (sviluppatore, verificatore, revisore, esploratore…) ognuno nella sua copia del progetto, unisce i loro rami e ti chiede solo quello che deve decidere tu. La percentuale la calcola il programma dal piano: un compito da fare vale 0, in corso 20-60%, in revisione 80%, unito con il criterio verde 100%. Quando aggiungi richieste o punti può scendere: qui sotto c’è il perché.'

export function TestaOrchestratore({ workspace }: { workspace: string }): React.JSX.Element | null {
  const s = useMemo(() => sondaggioOrchestratore(workspace), [workspace])
  const v = useSondaggio(s)
  const [impostazioni, setImpostazioni] = useState(false)
  const [registro, setRegistro] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  if (v === undefined) return null
  const alLavoro = v.specialisti.filter((c) => c.stato === 'lavoro' || c.stato === 'avviato').length
  const cambia = (p: { modello?: 'sonnet' | 'opus'; tettoSpecialisti?: number }): void => {
    setErrore(undefined)
    window.gestore.autopilota.impostaOrchestratore(workspace, p)
      .then(() => s.rileggi())
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
  }
  return (
    <div className="coda-ws" aria-label="Avanzamento del workspace">
      <div className="coda-ws__testa con-aiuto">
        <b>{v.percento !== undefined ? `${v.percento}%` : '—'}</b>
        <span className="coda-ws__quieto">
          {v.piano.totale > 0 ? `${v.piano.uniti} di ${v.piano.totale} compiti uniti` : 'nessun piano ancora'}
          {` · ${alLavoro === 1 ? '1 specialista' : `${alLavoro} specialisti`} al lavoro`}
          {v.pensa ? ' · sta pensando…' : ''}
        </span>
        <Aiuto di="l’autopilota del workspace">{AIUTO_UNICO}</Aiuto>
        <button className="tasto tasto--mini" aria-expanded={impostazioni} onClick={() => setImpostazioni((x) => !x)}>Impostazioni</button>
      </div>
      {v.percento !== undefined ? (
        <div className="punto-ap__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.percento} aria-label="Avanzamento del workspace">
          <span style={{ width: `${v.percento}%` }} />
        </div>
      ) : null}
      {v.calo !== undefined ? <div className="coda-ws__quieto">scesa da {v.calo.da}% a {v.calo.a}%: {v.calo.perche}</div> : null}
      {v.specialisti.map((c) => (
        <div key={c.id} className="coda-ws__quieto" title={c.compito}>
          <b>{c.ruolo ?? 'specialista'}</b>{c.compitoId !== undefined ? ` · ${c.compitoId}` : ''}{c.adottata === true ? ' · chat adottata' : ''} · {PAROLA_STATO[c.stato] ?? c.stato}{c.durata !== undefined && c.durata !== '' ? ` da ${c.durata}` : ''}: {c.compito.length > 100 ? `${c.compito.slice(0, 99)}…` : c.compito}
          {c.attivita !== undefined && (c.stato === 'lavoro' || c.stato === 'avviato') ? <div>↳ {c.attivita}</div> : null}
        </div>
      ))}
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
              <option value="sonnet">Sonnet (normale)</option>
              <option value="opus">Opus (più attento, consuma di più)</option>
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
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
    </div>
  )
}
