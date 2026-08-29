import React, { useEffect, useRef, useState } from 'react'
import type { CodaVista, DestinazioneVista, ElencoVista, RichiestaVista, VoceVista } from '../../preload'
import { TerminaleRemoto } from './TerminaleRemoto'
import { confrontaElenchi, segnoDi, type Confronto } from '@shared/confronto-file'

/**
 * I file del progetto, di qua e di là.
 *
 * È il «FileZilla» dentro SierraDeck, e sta dentro invece che accanto per una
 * ragione sola: **le destinazioni appartengono al progetto**. Un elenco globale
 * di venti connessioni rimette addosso proprio il lavoro che si voleva togliere
 * — ricordarsi quale riga va con quale cartella. Qui apri la chat di un
 * progetto e vedi i suoi server, e nessun altro.
 *
 * A sinistra il disco di questo computer, a destra il server. Si sceglie con un
 * clic (con Ctrl e Maiusc come in qualunque elenco), si trascina da una parte
 * all'altra, e in fondo la coda dice cosa sta passando e quanto manca.
 *
 * ## Prima connessione
 *
 * La prima volta non si collega: mostra l'impronta della chiave del server e
 * chiede se è lui. Sembra un intoppo, ed è l'unica cosa che rende il
 * collegamento davvero sicuro invece che solo cifrato — chi si mette in mezzo
 * presenta una chiave sua, e senza questa domanda la connessione riuscirebbe lo
 * stesso, con la password consegnata a lui.
 */

/** Il tipo di dato che viaggia in un trascinamento fra le due colonne. */
const TIPO_VOCI = 'application/x-sierradeck-voci'

function misura(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} kB`
  if (byte < 1024 * 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`
  return `${(byte / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function PannelloTrasferimenti(
  { cwd, onChiudi }: { cwd?: string; onChiudi: () => void }
): React.JSX.Element {
  const [destinazioni, setDestinazioni] = useState<DestinazioneVista[] | undefined>(undefined)
  const [scelta, setScelta] = useState<string | undefined>(undefined)
  const [locale, setLocale] = useState<ElencoVista | undefined>(undefined)
  const [remoto, setRemoto] = useState<ElencoVista | undefined>(undefined)
  const [collegato, setCollegato] = useState(false)
  const [chiede, setChiede] = useState<{ impronta: string; cambiata: boolean } | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [coda, setCoda] = useState<CodaVista>({ lavori: [], contando: 0 })
  const [modifica, setModifica] = useState<Partial<DestinazioneVista> | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [presiLocali, setPresiLocali] = useState<string[]>([])
  const [presiRemoti, setPresiRemoti] = useState<string[]>([])
  const [terminale, setTerminale] = useState(false)

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  /**
   * I due elenchi si ricaricano quando la coda si svuota.
   *
   * Ricaricarli a ogni file finito farebbe saltare la cartella sotto le mani
   * proprio mentre si sceglie il prossimo pezzo da mandare; a coda ferma invece
   * è il momento in cui si vuole vedere cos'è arrivato.
   */
  const eraOccupata = useRef(false)
  useEffect(() => window.gestore.trasferimenti.suCoda((s) => {
    const occupata = s.contando > 0 || s.lavori.some((l) => l.stato === 'corso' || l.stato === 'attesa')
    if (eraOccupata.current && !occupata) {
      ricaricaLocale(locale?.percorso)
      ricaricaRemoto(remoto?.percorso)
    }
    eraOccupata.current = occupata
    setCoda(s)
  }), [locale?.percorso, remoto?.percorso, scelta, collegato])

  const caricaDestinazioni = (): void => {
    if (cwd === undefined || cwd === '') { setDestinazioni([]); return }
    window.gestore.trasferimenti.destinazioni(cwd)
      .then((d) => {
        setDestinazioni(d)
        if (scelta === undefined && d[0] !== undefined) setScelta(d[0].id)
      })
      .catch((e: unknown) => { setDestinazioni([]); setErrore(String(e)) })
  }
  useEffect(caricaDestinazioni, [cwd])

  const ricaricaLocale = (dove?: string): void => {
    const percorso = dove ?? cwd
    if (percorso === undefined || percorso === '') return
    window.gestore.trasferimenti.locale(percorso)
      .then((e) => { setLocale(e); setPresiLocali([]) })
      .catch(() => undefined)
  }
  useEffect(() => ricaricaLocale(), [cwd])

  const ricaricaRemoto = (dove?: string): void => {
    if (scelta === undefined || !collegato) return
    window.gestore.trasferimenti.remoto(scelta, dove ?? '')
      .then((e) => { setRemoto(e); setPresiRemoti([]); setErrore(undefined) })
      .catch((e: unknown) => setErrore(String(e)))
  }

  const collega = (): void => {
    if (scelta === undefined) return
    setErrore(undefined)
    window.gestore.trasferimenti.collega(scelta).then((r) => {
      if (r.ok) { setCollegato(true); ricaricaRemoto(''); return }
      if (r.impronta !== undefined) { setChiede({ impronta: r.impronta, cambiata: r.cambiata === true }); return }
      setErrore(r.errore ?? 'non riesco a collegarmi')
    }).catch((e: unknown) => setErrore(String(e)))
  }

  // Il ricarico del lato remoto va fatto **dopo** che `collegato` è vero, o
  // parte con la sessione ancora chiusa e non mostra niente senza dire perché.
  useEffect(() => { if (collegato) ricaricaRemoto('') }, [collegato])

  const dest = destinazioni?.find((d) => d.id === scelta)
  const pronto = collegato && scelta !== undefined && locale !== undefined && remoto !== undefined

  /** Manda in coda: è l'unica strada, sia per un file che per mezzo disco. */
  const manda = (verso: 'giu' | 'su', voci: { percorso: string; cartella: boolean }[]): void => {
    if (!pronto || voci.length === 0) return
    const arrivo = verso === 'giu' ? (locale as ElencoVista).percorso : (remoto as ElencoVista).percorso
    const richieste: RichiestaVista[] = voci.map((v) => ({
      destinazione: scelta as string,
      verso,
      origine: v.percorso,
      arrivo,
      cartella: v.cartella
    }))
    void window.gestore.trasferimenti.accoda(richieste).catch((e: unknown) => setErrore(String(e)))
  }

  /**
   * Cosa e' piu' nuovo di qua e cosa di la'.
   *
   * E' la ragione per cui si riapre un client SFTP la seconda volta: la prima
   * si manda tutto, dalla seconda la domanda e' sempre «questo l'ho gia'
   * mandato?». Senza risposta si ricarica tutto per sicurezza, ed e' cosi' che
   * si sovrascrive una correzione fatta direttamente sul server.
   */
  const confrontoLocale = confrontaElenchi(locale?.voci ?? [], remoto?.voci ?? [])
  const confrontoRemoto = confrontaElenchi(remoto?.voci ?? [], locale?.voci ?? [])

  const scelteDi = (elenco: ElencoVista | undefined, presi: string[]): VoceVista[] =>
    (elenco?.voci ?? []).filter((v) => presi.includes(v.percorso))

  return (
    <div className="pannello pannello--negozio">
      <div className="negozio__testa">
        <div className="negozio__testa-riga">
          <span className="serigrafia">File</span>
          <span className="misura">
            {cwd !== undefined && cwd !== '' ? cwd : 'nessun progetto davanti'}
          </span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>
        <div className="negozio__tabs">
          {(destinazioni ?? []).map((d) => (
            <button
              key={d.id}
              className={`tasto ${d.id === scelta ? 'tasto--primario' : 'tasto--fantasma'}`}
              onClick={() => { setScelta(d.id); setCollegato(false); setRemoto(undefined) }}
            >
              {d.nome}
            </button>
          ))}
          <button
            className="tasto tasto--fantasma"
            onClick={() => { setModifica({ cwd, porta: 22, metodo: 'password' }); setPassword('') }}
          >
            + Server
          </button>
          {dest !== undefined && !collegato ? (
            <button className="tasto tasto--primario" onClick={collega}>Collega</button>
          ) : null}
          {dest !== undefined && collegato ? (
            <button
              className={`tasto ${terminale ? 'tasto--primario' : 'tasto--fantasma'}`}
              onClick={() => setTerminale(!terminale)}
            >
              {'>_ Terminale'}
            </button>
          ) : null}
          {dest !== undefined && collegato ? (
            <button
              className="tasto tasto--fantasma"
              onClick={() => {
                void window.gestore.trasferimenti.scollega(dest.id)
                setCollegato(false); setRemoto(undefined); setTerminale(false)
              }}
            >
              Scollega
            </button>
          ) : null}
          {dest !== undefined ? (
            <button
              className="tasto tasto--fantasma"
              onClick={() => { setModifica(dest); setPassword('') }}
            >
              Modifica
            </button>
          ) : null}
        </div>
        {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      </div>

      <div className="trasf">
        <Colonna
          titolo="Su questo computer"
          elenco={locale}
          presi={presiLocali}
          setPresi={setPresiLocali}
          confronto={collegato && remoto !== undefined ? confrontoLocale : undefined}
          onVai={(p) => ricaricaLocale(p)}
          azione={{
            etichetta: `→  Carica${presiLocali.length > 1 ? ` (${presiLocali.length})` : ''}`,
            attiva: pronto && presiLocali.length > 0,
            fai: () => manda('su', scelteDi(locale, presiLocali))
          }}
          onLascia={(voci) => manda('giu', voci)}
          accettaDaFuori={false}
        />
        <Colonna
          titolo={dest === undefined ? 'Nessun server' : `${dest.utente}@${dest.host}`}
          elenco={collegato ? remoto : undefined}
          vuoto={
            dest === undefined
              ? 'Aggiungi un server con «+ Server».'
              : collegato ? 'Cartella vuota.' : 'Premi «Collega».'
          }
          presi={presiRemoti}
          setPresi={setPresiRemoti}
          confronto={locale !== undefined ? confrontoRemoto : undefined}
          onVai={(p) => ricaricaRemoto(p)}
          azione={{
            etichetta: `←  Scarica${presiRemoti.length > 1 ? ` (${presiRemoti.length})` : ''}`,
            attiva: pronto && presiRemoti.length > 0,
            fai: () => manda('giu', scelteDi(remoto, presiRemoti))
          }}
          onLascia={(voci) => manda('su', voci)}
          /**
           * Sul lato server si può lasciar cadere anche roba trascinata da
           * Esplora risorse: è il gesto per cui la gente apre FileZilla.
           */
          accettaDaFuori={pronto}
        />
      </div>

      {terminale && collegato && scelta !== undefined ? (
        <TerminaleRemoto destinazione={scelta} onErrore={setErrore} />
      ) : null}

      <Coda coda={coda} />

      {chiede !== undefined && dest !== undefined ? (
        <div className="velo" onMouseDown={() => setChiede(undefined)}>
          <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa">
              <span className="serigrafia">
                {chiede.cambiata ? 'La chiave del server è CAMBIATA' : 'Prima volta con questo server'}
              </span>
            </div>
            <div style={{ padding: 'var(--s3)' }}>
              <p>
                {chiede.cambiata
                  ? 'Il server presenta una chiave diversa da quella che avevi accettato. Può essere una reinstallazione — oppure qualcuno che si è messo in mezzo. Non accettarla se non sai perché è cambiata.'
                  : 'Questa è l’impronta della chiave del server. Accettandola, da adesso in poi un’impronta diversa sarà un allarme.'}
              </p>
              <p className="negozio__desc negozio__desc--mono">{chiede.impronta}</p>
              <div className="negozio__azioni">
                <button className="tasto" onClick={() => setChiede(undefined)}>Annulla</button>
                <button
                  className="tasto tasto--primario"
                  onClick={() => {
                    void window.gestore.trasferimenti.fidati(dest.id, chiede.impronta)
                      .then(() => { setChiede(undefined); collega() })
                  }}
                >
                  È lui, fidati
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modifica !== undefined ? (
        <div className="velo" onMouseDown={() => setModifica(undefined)}>
          <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">Server del progetto</span></div>
            <div style={{ padding: 'var(--s3)', display: 'grid', gap: 'var(--s2)' }}>
              <label className="impostazioni__riga">
                <span>Nome</span>
                <input className="campo" value={modifica.nome ?? ''}
                  onChange={(e) => setModifica({ ...modifica, nome: e.target.value })} />
              </label>
              <label className="impostazioni__riga">
                <span>Host</span>
                <input className="campo" value={modifica.host ?? ''}
                  onChange={(e) => setModifica({ ...modifica, host: e.target.value })} />
              </label>
              <label className="impostazioni__riga">
                <span>Porta</span>
                <input className="campo" type="number" value={modifica.porta ?? 22}
                  onChange={(e) => setModifica({ ...modifica, porta: Number(e.target.value) })} />
              </label>
              <label className="impostazioni__riga">
                <span>Utente</span>
                <input className="campo" value={modifica.utente ?? ''}
                  onChange={(e) => setModifica({ ...modifica, utente: e.target.value })} />
              </label>
              <label className="impostazioni__riga">
                <span>Come entra</span>
                <select
                  value={modifica.metodo ?? 'password'}
                  onChange={(e) => setModifica({ ...modifica, metodo: e.target.value as DestinazioneVista['metodo'] })}
                >
                  <option value="password">Password</option>
                  <option value="chiave">Chiave privata</option>
                  <option value="agente">Agente di sistema</option>
                </select>
              </label>
              {modifica.metodo === 'chiave' ? (
                <label className="impostazioni__riga">
                  <span>File della chiave</span>
                  <input className="campo" value={modifica.chiaveFile ?? ''}
                    onChange={(e) => setModifica({ ...modifica, chiaveFile: e.target.value })} />
                </label>
              ) : null}
              {modifica.metodo !== 'agente' ? (
                <label className="impostazioni__riga">
                  <span>{modifica.metodo === 'chiave' ? 'Passphrase' : 'Password'}</span>
                  <input className="campo" type="password" value={password}
                    placeholder={modifica.id !== undefined ? '— lasciala vuota per non cambiarla —' : ''}
                    onChange={(e) => setPassword(e.target.value)} />
                </label>
              ) : null}
              <div className="impostazioni__nota">
                La password va al portachiavi di Windows, legato a questo account: copiata su un altro
                computer non vale niente. Nel file delle destinazioni resta solo il suo segno cifrato.
              </div>
              <div className="negozio__azioni">
                {modifica.id !== undefined ? (
                  <button
                    className="tasto tasto--fantasma"
                    onClick={() => {
                      void window.gestore.trasferimenti.elimina(modifica.id as string).then(() => {
                        setModifica(undefined); setScelta(undefined); setCollegato(false)
                        setRemoto(undefined); caricaDestinazioni()
                      })
                    }}
                  >
                    Elimina
                  </button>
                ) : null}
                <span style={{ flex: 1 }} />
                <button className="tasto" onClick={() => setModifica(undefined)}>Annulla</button>
                <button
                  className="tasto tasto--primario"
                  onClick={() => {
                    const segreto = password === ''
                      ? undefined
                      : (modifica.metodo === 'chiave' ? { passphrase: password } : { password })
                    void window.gestore.trasferimenti
                      .salva({ ...modifica, cwd }, segreto)
                      .then((d) => {
                        setModifica(undefined); setPassword('')
                        setScelta(d.id); setCollegato(false); setRemoto(undefined)
                        caricaDestinazioni()
                      })
                      .catch((e: unknown) => setErrore(String(e)))
                  }}
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * La coda, in fondo al pannello.
 *
 * Mostra le prime righe e conta il resto: una lista di cinquecento file è
 * un'informazione che nessuno legge, «212 in attesa» sì.
 */
function Coda({ coda }: { coda: CodaVista }): React.JSX.Element | null {
  const { lavori, contando } = coda
  if (lavori.length === 0 && contando === 0) return null
  const inCorso = lavori.filter((l) => l.stato === 'corso')
  const attesa = lavori.filter((l) => l.stato === 'attesa')
  const errori = lavori.filter((l) => l.stato === 'errore')
  const fatti = lavori.filter((l) => l.stato === 'fatto').length
  const daMostrare = [...inCorso, ...errori, ...attesa].slice(0, 6)

  return (
    <div className="trasf__coda">
      <div className="trasf__coda-testa">
        <span className="serigrafia">Coda</span>
        <span className="misura">
          {contando > 0 ? 'sto contando le cartelle… · ' : ''}
          {inCorso.length} in corso · {attesa.length} in attesa · {fatti} fatti
          {errori.length > 0 ? ` · ${errori.length} non riusciti` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {attesa.length > 0 ? (
          <button
            className="tasto tasto--fantasma"
            onClick={() => void window.gestore.trasferimenti.annullaCoda()}
          >
            Ferma la fila
          </button>
        ) : null}
        <button
          className="tasto tasto--fantasma"
          onClick={() => void window.gestore.trasferimenti.pulisciCoda(errori.length === 0)}
        >
          {errori.length === 0 ? 'Pulisci' : 'Pulisci i finiti'}
        </button>
      </div>
      <div className="trasf__coda-righe">
        {daMostrare.map((l) => (
          <div key={l.id} className="trasf__lavoro">
            <span className="trasf__lavoro-verso">{l.verso === 'giu' ? '↓' : '↑'}</span>
            <span className="trasf__lavoro-nome" title={l.verso === 'giu' ? l.remoto : l.locale}>
              {l.nome}
            </span>
            {l.stato === 'errore' ? (
              <>
                <span className="trasf__lavoro-errore">{l.errore}</span>
                <button
                  className="tasto tasto--fantasma"
                  onClick={() => void window.gestore.trasferimenti.riprovaLavoro(l.id)}
                >
                  Riprova
                </button>
              </>
            ) : l.stato === 'corso' ? (
              <span className="trasf__barra">
                <span
                  className="trasf__barra-dentro"
                  style={{ width: `${l.dimensione > 0 ? Math.min(100, (l.fatti / l.dimensione) * 100) : 30}%` }}
                />
              </span>
            ) : (
              <>
                <span className="misura">{misura(l.dimensione)}</span>
                <button
                  className="tasto tasto--fantasma"
                  onClick={() => void window.gestore.trasferimenti.annullaLavoro(l.id)}
                >
                  Togli
                </button>
              </>
            )}
          </div>
        ))}
        {lavori.length > daMostrare.length ? (
          <div className="misura">…e altri {lavori.length - daMostrare.length}.</div>
        ) : null}
      </div>
    </div>
  )
}

/** Una delle due colonne. Identiche di proposito: è lo stesso gesto da due lati. */
function Colonna(
  { titolo, elenco, vuoto, presi, setPresi, onVai, azione, onLascia, accettaDaFuori, confronto }: {
    titolo: string
    elenco?: ElencoVista
    vuoto?: string
    presi: string[]
    /** Com'e' messo ogni file rispetto all'altro lato. Assente: non si sa ancora. */
    confronto?: Map<string, Confronto>
    setPresi: (p: string[]) => void
    onVai: (percorso: string) => void
    azione: { etichetta: string; attiva: boolean; fai: () => void }
    onLascia: (voci: { percorso: string; cartella: boolean }[]) => void
    accettaDaFuori: boolean
  }
): React.JSX.Element {
  const [sopra, setSopra] = useState(false)

  /**
   * La scelta con Ctrl e Maiusc, come in qualunque elenco di file.
   *
   * Non è vezzo: chi apre questo pannello ha già le dita abituate, e un elenco
   * che si comporta diversamente costringe a scoprire da capo una cosa che
   * sapeva già fare.
   */
  const clic = (v: VoceVista, e: React.MouseEvent): void => {
    const tutte = (elenco?.voci ?? []).map((x) => x.percorso)
    if (e.shiftKey && presi.length > 0) {
      const ultimo = tutte.indexOf(presi[presi.length - 1] as string)
      const adesso = tutte.indexOf(v.percorso)
      if (ultimo >= 0 && adesso >= 0) {
        const [a, b] = ultimo < adesso ? [ultimo, adesso] : [adesso, ultimo]
        setPresi(tutte.slice(a, b + 1))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setPresi(presi.includes(v.percorso) ? presi.filter((p) => p !== v.percorso) : [...presi, v.percorso])
      return
    }
    setPresi([v.percorso])
  }

  const iniziaTrascinamento = (v: VoceVista, e: React.DragEvent): void => {
    // Trascinare una riga non scelta trascina quella, non la selezione di
    // prima: è quello che si aspetta chiunque abbia mai spostato un file.
    const voci = presi.includes(v.percorso)
      ? (elenco?.voci ?? []).filter((x) => presi.includes(x.percorso))
      : [v]
    if (!presi.includes(v.percorso)) setPresi([v.percorso])
    e.dataTransfer.setData(
      TIPO_VOCI,
      JSON.stringify(voci.map((x) => ({ percorso: x.percorso, cartella: x.cartella })))
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  const lascia = (e: React.DragEvent): void => {
    e.preventDefault()
    setSopra(false)
    const dentro = e.dataTransfer.getData(TIPO_VOCI)
    if (dentro !== '') {
      try {
        onLascia(JSON.parse(dentro) as { percorso: string; cartella: boolean }[])
      } catch {
        // Un trascinamento illeggibile non merita un errore in faccia.
      }
      return
    }
    if (!accettaDaFuori) return
    // Roba arrivata da Esplora risorse. Il percorso lo dà il ponte: da Electron
    // 32 una pagina non può più leggerlo da sola, e va bene così.
    const fuori = [...e.dataTransfer.files].map((f) => window.gestore.trasferimenti.percorsoDelFile(f))
      .filter((p) => p !== '')
    // Se sia cartella o file lo si **chiede al disco**: indovinarlo dal punto
    // nel nome sbaglia su `.git` e su `archivio.2026`, e sbagliarlo vuol dire
    // accodare una cartella come file — che fallisce e basta.
    void Promise.all(
      fuori.map(async (p) => ({ percorso: p, cartella: await window.gestore.sistema.cartellaEsiste(p) }))
    ).then(onLascia)
  }

  return (
    <div
      className={`trasf__lato${sopra ? ' trasf__lato--sopra' : ''}`}
      onDragOver={(e) => {
        const suo = e.dataTransfer.types.includes(TIPO_VOCI)
        if (!suo && !accettaDaFuori) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setSopra(true)
      }}
      onDragLeave={() => setSopra(false)}
      onDrop={lascia}
    >
      <div className="trasf__testa">
        <span className="serigrafia">{titolo}</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--fantasma" disabled={!azione.attiva} onClick={azione.fai}>
          {azione.etichetta}
        </button>
      </div>
      <div className="trasf__percorso">
        {elenco?.su !== undefined ? (
          <button className="tasto tasto--fantasma" onClick={() => onVai(elenco.su as string)}>↑ Su</button>
        ) : null}
        <span className="misura">{elenco?.percorso ?? ''}</span>
      </div>
      <div className="trasf__elenco">
        {elenco === undefined ? (
          <div className="misura">{vuoto ?? 'Carico…'}</div>
        ) : elenco.voci.length === 0 ? (
          <div className="misura">{vuoto ?? 'Cartella vuota.'}</div>
        ) : elenco.voci.map((v) => (
          <div
            key={v.percorso}
            className={`negozio__voce${presi.includes(v.percorso) ? ' trasf__voce--presa' : ''}`}
            draggable
            onDragStart={(e) => iniziaTrascinamento(v, e)}
            onClick={(e) => clic(v, e)}
            onDoubleClick={() => { if (v.cartella) onVai(v.percorso) }}
          >
            <div className="negozio__info">
              <div className="negozio__nome">
                {v.cartella ? '📁 ' : ''}{v.nome}
              </div>
              <div className="negozio__desc">
                {v.cartella ? 'cartella' : misura(v.dimensione)}
                {v.permessi !== undefined ? ` · ${v.permessi}` : ''}
                {(() => {
                  const c = v.cartella ? undefined : confronto?.get(v.nome)
                  if (c === undefined || c === 'uguale') return null
                  return <span className={`trasf__segno trasf__segno--${c}`}> · {segnoDi(c)}</span>
                })()}
              </div>
            </div>
            {v.cartella ? (
              <div className="negozio__azioni">
                <button
                  className="tasto tasto--fantasma"
                  onClick={(e) => { e.stopPropagation(); onVai(v.percorso) }}
                >
                  Apri
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
