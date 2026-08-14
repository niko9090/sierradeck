import { useState } from 'react'
import type { Autopilota, Criterio } from '@shared/autopilota'
import { diario } from '../diario-autopilota'

/**
 * La scheda di un autopilota: cosa deve ottenere, come lo misura, cosa farà —
 * e il posto dove dirgli di cambiare.
 *
 * Prima di questa scheda, di un autopilota si vedevano un LED, uno stato e
 * «3 criteri su 5». Chi guardava non sapeva **quali** fossero quei cinque, né
 * come venissero misurati, né come cambiarli: si poteva solo fermarlo,
 * eliminarlo e ricominciare da capo. La parola «criterio» restava un termine
 * tecnico senza contenuto.
 *
 * Qui non c'è nessuna definizione di «criterio». C'è la riga sotto ognuno —
 * il comando che lo misura, e com'è finita l'ultima volta — perché è vedendo
 * `npm test` accanto a «i test passano tutti» che si capisce cosa sia, molto
 * meglio che leggendone la spiegazione.
 */
export function SchedaAutopilota({
  autopilota,
  onCambiato
}: {
  autopilota: Autopilota
  /** Qualcosa è cambiato: chi ci sta sopra deve rileggere lo stato. */
  onCambiato: () => void
}): React.JSX.Element {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  /** Il criterio che si sta riscrivendo adesso, per indice. */
  const [scrivendo, setScrivendo] = useState<number | undefined>(undefined)
  const [bozza, setBozza] = useState<{ descrizione: string; comando: string }>({
    descrizione: '', comando: ''
  })
  const [compitoNuovo, setCompitoNuovo] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [risposta, setRisposta] = useState<{ applicato: boolean; capito: string } | undefined>()

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

  const parla = (): void => {
    const testo = messaggio.trim()
    if (testo === '') return
    setInCorso(true)
    setErrore(undefined)
    window.gestore.autopilota
      .parla(autopilota.id, testo)
      .then((r) => {
        setRisposta({ applicato: r.applicato, capito: r.capito })
        if (r.applicato) setMessaggio('')
        onCambiato()
      })
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
      .finally(() => setInCorso(false))
  }

  const ultima = autopilota.modifiche[autopilota.modifiche.length - 1]
  /**
   * Gli ultimi ragionamenti, dal piu' recente.
   *
   * Tre e non tutti: qui si risponde a «cosa sta pensando adesso», e la storia
   * intera sta nel diario sotto. Sono le voci che dicono **perche'** — la
   * decisione del supervisore e il cambio di strada — non quelle che dicono
   * cosa e' stato eseguito.
   */
  const ragionamenti = diario(autopilota)
    .filter((v) => v.tipo === 'decisione' || v.tipo === 'correzione')
    .slice(-3)
    .reverse()

  return (
    <div className="scheda">
      {autopilota.stato === 'pronto' ? (
        // Il cancello. Dieci secondi di lettura prima di ore di lavoro, e
        // soprattutto: il momento in cui si vede cosa ha deciso da solo.
        <div className="scheda__via">
          <span className="serigrafia">si è preparato — leggi e dai il via</span>
          <button
            className="tasto tasto--primario"
            disabled={inCorso}
            onClick={() => esegui(() => window.gestore.autopilota.vai(autopilota.id))}
          >
            Vai
          </button>
        </div>
      ) : null}

      {/* Quello che hai scritto tu, e quello che lui ne ha fatto. La
          preparazione riformula l'obiettivo con parole sue — piu' precise, e
          **sue** — e le tue sparivano: senza le due righe una accanto all'altra
          non c'e' modo di accorgersi che sta andando a fare un'altra cosa. */}
      {autopilota.obiettivoTuo !== undefined ? (
        <div className="scheda__capito-obiettivo">
          <div className="serigrafia scheda__titolo">Gli hai chiesto</div>
          <p className="scheda__tue-parole">{autopilota.obiettivoTuo}</p>
          {autopilota.obiettivo !== autopilota.obiettivoTuo ? (
            <>
              <div className="serigrafia scheda__titolo">Ha capito così</div>
              <p className="scheda__sue-parole">{autopilota.obiettivo}</p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Come ragiona davanti a un problema. E' la voce piu' preziosa che il
          servizio produce — l'unica che dice **perche'** invece di cosa — e
          viveva sepolta in una scheda che si apre solo se sai che esiste. */}
      {ragionamenti.length > 0 ? (
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
      ) : null}

      <div className="serigrafia scheda__titolo">Finisce quando</div>
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
                {/* Raggiunto **quando**: su un lavoro che dura una notte e' la
                    differenza fra «sta procedendo» e «e' fermo da stamattina». */}
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

      {autopilota.compitiDaFare.length > 0 || compitoNuovo !== '' ? (
        <>
          <div className="serigrafia scheda__titolo">Prima fa</div>
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
        </>
      ) : null}
      <div className="riga scheda__nuovo-compito">
        <input
          className="campo"
          value={compitoNuovo}
          placeholder="un altro compito…"
          aria-label="aggiungi un compito"
          onChange={(e) => setCompitoNuovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || compitoNuovo.trim() === '') return
            esegui(() =>
              window.gestore.autopilota.modifica(autopilota.id, {
                compitiDaFare: [...autopilota.compitiDaFare, compitoNuovo.trim()]
              })
            )
            setCompitoNuovo('')
          }}
        />
      </div>

      {/* Parlargli. Applica subito — un passaggio in meno vale più di una
          conferma — e per questo mostra sempre cosa ha capito, e si disfa. */}
      <div className="scheda__parla">
        <textarea
          className="campo"
          rows={2}
          value={messaggio}
          placeholder="digli cosa cambiare, a parole"
          aria-label="scrivi all autopilota"
          onChange={(e) => setMessaggio(e.target.value)}
        />
        <div className="riga">
          <button
            className="tasto tasto--primario"
            disabled={inCorso || messaggio.trim() === ''}
            onClick={parla}
          >
            {inCorso ? 'Sto capendo…' : 'Mandaglielo'}
          </button>
          {ultima !== undefined ? (
            <button
              className="tasto"
              disabled={inCorso}
              title={`Rimette com'era prima di: ${ultima.capito}`}
              onClick={() => {
                setRisposta(undefined)
                esegui(() => window.gestore.autopilota.disfa(autopilota.id))
              }}
            >
              Disfa
            </button>
          ) : null}
        </div>
        {risposta !== undefined ? (
          <p className={risposta.applicato ? 'scheda__capito' : 'scheda__capito scheda__capito--fermo'}>
            {risposta.applicato ? '● ho capito così, e l’ho fatto: ' : '● '}
            {risposta.capito}
            {risposta.applicato ? ' — vale dal prossimo intervento.' : ''}
          </p>
        ) : null}
      </div>

      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
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
