import { useState } from 'react'
import type { Autopilota, Criterio } from '@shared/autopilota'
import { misuraPasso, passaggi } from '@shared/autopilota-vista'
import { diario } from '../diario-autopilota'

/**
 * Le linguette della sezione dell'autopilota: obiettivo, criteri, compiti.
 *
 * Erano una scheda sola, impilata sotto i passi e sopra il dialogo: per
 * arrivare a «Parla con lui» si scorreva tutto. Nicholas (18/09): «è davvero
 * caotica, mi interessa avere in alto la parte di chat e nelle varie tab le
 * altre info così vedo tutto senza scorrere come un matto». Ora la chat sta
 * in cima (`ChatAutopilota`) e questi sono i contenuti delle linguette, uno
 * per volta, ognuno con lo spazio che gli serve.
 *
 * Qui non c'è nessuna definizione di «criterio». C'è la riga sotto ognuno —
 * il comando che lo misura, e com'è finita l'ultima volta — perché è vedendo
 * `npm test` accanto a «i test passano tutti» che si capisce cosa sia, molto
 * meglio che leggendone la spiegazione.
 */

type Props = {
  autopilota: Autopilota
  /** Qualcosa è cambiato: chi ci sta sopra deve rileggere lo stato. */
  onCambiato: () => void
}

/** Cosa gli hai chiesto, cosa ha capito, a che punto è, e le sue chat. */
export function ObiettivoAutopilota({ autopilota }: { autopilota: Autopilota }): React.JSX.Element {
  const m = misuraPasso(autopilota)
  const qui = passaggi(autopilota).find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')
  const tue = autopilota.obiettivoTuo ?? autopilota.obiettivo
  return (
    <div className="scheda">
      {/* Quello che hai scritto tu, e quello che lui ne ha fatto. La
          preparazione riformula l'obiettivo con parole sue — piu' precise, e
          **sue** — e le tue sparivano: senza le due righe una accanto all'altra
          non c'e' modo di accorgersi che sta andando a fare un'altra cosa. */}
      <div className="serigrafia scheda__titolo">Gli hai chiesto</div>
      <p className="scheda__tue-parole">{tue}</p>
      {autopilota.obiettivo !== tue ? (
        <>
          <div className="serigrafia scheda__titolo">Ha capito così</div>
          <p className="scheda__sue-parole">{autopilota.obiettivo}</p>
        </>
      ) : null}

      <div className="serigrafia scheda__titolo">A che punto è</div>
      <p className="scheda__misura-riga">
        <span className={`scheda__percento scheda__percento--${m.tono}`}>{m.percento}%</span>
        {' '}{m.dettaglio} · {m.di}
      </p>
      {qui?.nota !== undefined ? <p className="scheda__spiega">{qui.nota}</p> : null}
      <p className="scheda__spiega">
        {autopilota.cicli} {autopilota.cicli === 1 ? 'intervento' : 'interventi'} del supervisore ·
        {' '}iniziato alle {orario(autopilota.iniziatoIl)} · ultimo segno alle {orario(autopilota.ultimoEvento)}
        {autopilota.strategia !== undefined ? ` · sta provando un'altra strada: ${autopilota.strategia}` : ''}
      </p>

      {/* Le chat che eseguono: una per compito. Con una sola chat la riga dice
          solo che c'è; con la flotta si vede chi fa cosa e chi è ferma. */}
      <div className="serigrafia scheda__titolo">
        {autopilota.chats.length > 1 ? `Le sue chat (${autopilota.chats.length})` : 'La sua chat'}
      </div>
      {autopilota.chats.length === 0 ? (
        <p className="scheda__spiega">
          {autopilota.stato === 'intervista' || autopilota.stato === 'pronto'
            ? 'Non è ancora partita: nasce quando dai il via.'
            : 'Nessuna chat aperta adesso.'}
        </p>
      ) : (
        <ul className="scheda__chats">
          {autopilota.chats.map((ch, i) => (
            <li key={ch.id} className={`scheda__chat scheda__chat--${ch.stato}`}>
              <span className="scheda__chat-stato">
                {ch.stato === 'lavoro' ? '●' : ch.stato === 'bloccata' ? '◐' : '○'}
              </span>
              <span>
                <span className="scheda__chat-nome">chat {i + 1} · {ch.stato === 'lavoro' ? 'al lavoro' : ch.stato === 'bloccata' ? 'ferma, aspetta una risposta' : 'finita'} · {ch.cicli} {ch.cicli === 1 ? 'giro' : 'giri'}</span>
                {autopilota.chats.length > 1 || ch.compito !== autopilota.obiettivo ? (
                  <span className="scheda__chat-compito">{ch.compito}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="scheda__spiega">
        La sua chat è nel mosaico, con il suo riquadro: qui a fianco. Il supervisore è lui, quello con
        cui parli nella chat qui sopra: guarda la chat che esegue a ogni fermata e le dice come proseguire.
      </p>
    </div>
  )
}

/** I criteri di fine, con il comando che li misura e com'è andata: si riscrivono qui. */
export function CriteriAutopilota({ autopilota, onCambiato }: Props): React.JSX.Element {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  /** Il criterio che si sta riscrivendo adesso, per indice. */
  const [scrivendo, setScrivendo] = useState<number | undefined>(undefined)
  const [bozza, setBozza] = useState<{ descrizione: string; comando: string }>({ descrizione: '', comando: '' })

  const esegui = (che: () => Promise<unknown>): void => {
    setInCorso(true)
    setErrore(undefined)
    che()
      .then(() => { onCambiato() })
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
      .finally(() => setInCorso(false))
  }

  /** I criteri come stanno adesso, pronti da rimandare indietro interi. */
  const criteriOra = (): { descrizione: string; comando?: string }[] =>
    autopilota.criteri.map((c) => ({
      descrizione: c.descrizione,
      ...(c.comando !== undefined ? { comando: c.comando } : {})
    }))

  const salvaCriteri = (criteri: { descrizione: string; comando?: string }[]): void => {
    esegui(() => window.gestore.autopilota.modifica(autopilota.id, { criteri }))
  }

  const apriCriterio = (i: number, c: Criterio): void => {
    setScrivendo(i)
    setBozza({ descrizione: c.descrizione, comando: c.comando ?? '' })
  }

  const confermaCriterio = (): void => {
    const descrizione = bozza.descrizione.trim()
    if (descrizione === '') return
    const comando = bozza.comando.trim()
    const criteri = criteriOra()
    const voce = { descrizione, ...(comando !== '' ? { comando } : {}) }
    if (scrivendo === criteri.length) criteri.push(voce)
    else if (scrivendo !== undefined) criteri[scrivendo] = voce
    setScrivendo(undefined)
    salvaCriteri(criteri)
  }

  const togliCriterio = (i: number): void => {
    const criteri = criteriOra().filter((_, k) => k !== i)
    // L'ultimo non si toglie: senza criteri l'autopilota non saprebbe quando ha
    // finito. Il servizio lo rifiuterebbe comunque — qui si evita solo di far
    // premere un tasto per ricevere un no.
    if (criteri.length === 0) {
      setErrore('Almeno un criterio deve restare: senza, non saprebbe quando ha finito.')
      return
    }
    salvaCriteri(criteri)
  }

  return (
    <div className="scheda">
      <div className="serigrafia scheda__titolo">Finisce quando</div>
      {autopilota.criteri.length === 0 ? (
        <p className="scheda__spiega">
          Ancora nessun criterio: li scrive lui alla fine della preparazione, dopo aver guardato il
          progetto. Poi qui li leggi e li correggi.
        </p>
      ) : null}
      <ul className="scheda__criteri">
        {autopilota.criteri.map((c, i) =>
          scrivendo === i ? (
            <li key={i} className="scheda__criterio scheda__criterio--aperto">
              <input
                className="campo"
                value={bozza.descrizione}
                autoFocus
                aria-label="cosa deve essere vero"
                placeholder="cosa deve essere vero"
                onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
              />
              <input
                className="campo scheda__comando"
                value={bozza.comando}
                aria-label="il comando che lo misura"
                placeholder="il comando che lo misura — vuoto: lo giudica lui"
                onChange={(e) => setBozza({ ...bozza, comando: e.target.value })}
              />
              <div className="riga">
                <button className="tasto tasto--primario" disabled={inCorso} onClick={confermaCriterio}>
                  Salva
                </button>
                <button className="tasto" onClick={() => setScrivendo(undefined)}>Lascia stare</button>
                <button className="tasto" disabled={inCorso} onClick={() => togliCriterio(i)}>
                  Togli
                </button>
              </div>
            </li>
          ) : (
            <li
              key={i}
              className={c.soddisfatto ? 'scheda__criterio scheda__criterio--fatto' : 'scheda__criterio'}
            >
              <button className="scheda__riga" onClick={() => apriCriterio(i, c)} disabled={inCorso}>
                <span aria-hidden="true">{c.soddisfatto ? '✓' : '○'}</span>
                <span>{c.descrizione}</span>
              </button>
              {/* La riga che insegna cosa sia un criterio: come si misura, e
                  com'è andata. Senza comando lo giudica il supervisore, e
                  tacerlo lasciava credere che ci fosse una misura anche lì. */}
              <div className="misura scheda__prova">
                {c.soddisfatto && c.raggiuntoIl !== undefined ? (
                  <span className="scheda__esito--verde">raggiunto alle {orario(c.raggiuntoIl)} · </span>
                ) : null}
                {c.comando ?? 'lo giudica lui, guardando il lavoro'}
                {c.ultimaVerifica !== undefined ? (
                  <span
                    className={c.ultimaVerifica.codice === 0 ? 'scheda__esito--verde' : 'scheda__esito--rosso'}
                    title={c.ultimaVerifica.uscita}
                  >
                    {' · '}
                    {quando(c.ultimaVerifica.quando)}
                    {c.ultimaVerifica.codice === 0
                      ? ', passato'
                      : `, ${primaRiga(c.ultimaVerifica.uscita) || 'non passato'}`}
                  </span>
                ) : (
                  <span> · mai misurato</span>
                )}
              </div>
            </li>
          )
        )}
        {scrivendo === autopilota.criteri.length ? null : (
          <li>
            <button
              className="tasto scheda__aggiungi"
              disabled={inCorso}
              onClick={() => {
                setScrivendo(autopilota.criteri.length)
                setBozza({ descrizione: '', comando: '' })
              }}
            >
              + un altro
            </button>
          </li>
        )}
      </ul>
      <p className="scheda__spiega">
        Clicca un criterio per riscriverlo. Il comando sotto è quello che lo misura a ogni fermata:
        codice 0 vuol dire passato. Senza comando lo giudica il supervisore leggendo il lavoro. Un
        cambio si applica subito e si disfa dalla chat con «Disfa».
      </p>
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
    </div>
  )
}

/** I pezzi di lavoro in coda, e il posto dove aggiungerne uno. */
export function CompitiAutopilota({ autopilota, onCambiato }: Props): React.JSX.Element {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [compitoNuovo, setCompitoNuovo] = useState('')

  const esegui = (che: () => Promise<unknown>): void => {
    setInCorso(true)
    setErrore(undefined)
    che()
      .then(() => { onCambiato() })
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
      .finally(() => setInCorso(false))
  }

  const aggiungi = (): void => {
    const testo = compitoNuovo.trim()
    if (testo === '') return
    esegui(() =>
      window.gestore.autopilota.modifica(autopilota.id, {
        compitiDaFare: [...autopilota.compitiDaFare, testo]
      })
    )
    setCompitoNuovo('')
  }

  return (
    <div className="scheda">
      <div className="serigrafia scheda__titolo">Prima fa</div>
      {autopilota.compitiDaFare.length === 0 ? (
        <p className="scheda__spiega">
          Niente in coda: lavora sull’obiettivo. Un compito scritto qui lo prende la prima chat che
          si libera, prima di tornare all’obiettivo.
        </p>
      ) : (
        <ol className="scheda__compiti">
          {autopilota.compitiDaFare.map((c, i) => (
            <li key={i} className="scheda__compito">
              <span>{c}</span>
              <button
                className="comando-riquadro"
                title="Toglie questo compito dalla coda"
                aria-label={`Togli: ${c}`}
                disabled={inCorso}
                onClick={() =>
                  esegui(() =>
                    window.gestore.autopilota.modifica(autopilota.id, {
                      compitiDaFare: autopilota.compitiDaFare.filter((_, k) => k !== i)
                    })
                  )
                }
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="riga scheda__nuovo-compito">
        <input
          className="campo"
          value={compitoNuovo}
          placeholder="un altro compito… (Invio aggiunge)"
          aria-label="aggiungi un compito"
          onChange={(e) => setCompitoNuovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aggiungi() }}
        />
        <button className="tasto" disabled={inCorso || compitoNuovo.trim() === ''} onClick={aggiungi}>
          Aggiungi
        </button>
      </div>
      {autopilota.tettoChat > 1 ? (
        <p className="scheda__spiega">
          Fino a {autopilota.tettoChat} chat insieme: ogni compito in coda apre o riusa una chat sua.
        </p>
      ) : null}
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
    </div>
  )
}

/** Gli ultimi ragionamenti, quelli che dicono **perché**: in cima a «Ha deciso». */
export function RagionamentiAutopilota({ autopilota }: { autopilota: Autopilota }): React.JSX.Element | null {
  const ragionamenti = diario(autopilota)
    .filter((v) => v.tipo === 'decisione' || v.tipo === 'correzione')
    .slice(0, 3)
  if (ragionamenti.length === 0) return null
  return (
    <div className="scheda__ragiona">
      <div className="serigrafia scheda__titolo">Sta ragionando così</div>
      {ragionamenti.map((r, i) => (
        <div key={i} className={i === 0 ? 'scheda__pensiero' : 'scheda__pensiero scheda__pensiero--vecchio'}>
          <span className="misura scheda__quando">{orario(r.quando)}</span>
          <div>
            <div className="scheda__pensiero-titolo">{r.titolo}</div>
            {r.dettaglio !== undefined ? <div className="scheda__pensiero-testo">{r.dettaglio}</div> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Solo l'ora: dentro una giornata di lavoro il giorno lo si sa. */
function orario(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** L'ora di una verifica, o la data se non è di oggi. */
function quando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  return stessoGiorno
    ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}

/**
 * La prima riga utile dell'uscita di un comando.
 *
 * Accanto al criterio ci sta una riga sola: il resto è nel titolo, sotto il
 * puntatore. Una suite che stampa duecento righe non deve spingere fuori
 * schermo il criterio successivo.
 */
function primaRiga(uscita: string): string {
  const riga = uscita.split('\n').map((r) => r.trim()).find((r) => r !== '') ?? ''
  return riga.length > 70 ? `${riga.slice(0, 70)}…` : riga
}
