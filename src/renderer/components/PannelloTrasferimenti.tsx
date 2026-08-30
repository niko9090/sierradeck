import React, { useEffect, useRef, useState } from 'react'
import type {
  CodaVista, DestinazioneVista, ElencoVista, FileInModificaVista, RichiestaVista, VoceVista
} from '../../preload'
import { TerminaleRemoto } from './TerminaleRemoto'
import { confrontaElenchi, segnoDi, type Confronto } from '@shared/confronto-file'
import {
  aggiungiCampione, quantoManca, scriviQuantoManca, scriviVelocita, velocita, type Campione
} from '@shared/andatura'
import {
  avanti, cronologiaVuota, indietro, nuovaSelezione, ORDINE_PREDEFINITO, prendiTutto,
  prossimoOrdine, puoAvanti, puoIndietro, vaiA, vociVisibili, accantoA, unisciPercorso,
  leggiPermessi, permessiInLettere,
  type Cronologia, type Ordine, type PerCosa, type Selezione, type VoceSfogliabile
} from '@shared/sfoglia'

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
  // La selezione non e' solo l'elenco dei presi: si porta dietro l'ancora, il
  // punto fisso da cui un intervallo con Maiusc si allarga e si stringe.
  const [selLocale, setSelLocale] = useState<Selezione>({ presi: [] })
  const [selRemota, setSelRemota] = useState<Selezione>({ presi: [] })
  const [terminale, setTerminale] = useState(false)
  const [inModifica, setInModifica] = useState<FileInModificaVista[]>([])

  // I file aperti in modifica arrivano dal Core, che è l'unico a sapere quando
  // uno risale: la sorveglianza sta lì, e da qui non si vedrebbe niente.
  useEffect(() => {
    void window.gestore.trasferimenti.modificheAperte().then(setInModifica).catch(() => undefined)
    return window.gestore.trasferimenti.suModifiche(setInModifica)
  }, [])

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
      .then((e) => { setLocale(e); setSelLocale({ presi: [] }) })
      .catch(() => undefined)
  }
  useEffect(() => ricaricaLocale(), [cwd])

  const ricaricaRemoto = (dove?: string): void => {
    if (scelta === undefined || !collegato) return
    window.gestore.trasferimenti.remoto(scelta, dove ?? '')
      .then((e) => { setRemoto(e); setSelRemota({ presi: [] }); setErrore(undefined) })
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
          selezione={selLocale}
          setSelezione={setSelLocale}
          confronto={collegato && remoto !== undefined ? confrontoLocale : undefined}
          onVai={(p) => ricaricaLocale(p)}
          onAggiorna={() => ricaricaLocale(locale?.percorso)}
          operazioni={{
            nuovaCartella: (dentro, nome) =>
              window.gestore.trasferimenti.creaCartellaLocale(unisciPercorso(dentro, nome)),
            rinomina: (percorso, nome) =>
              window.gestore.trasferimenti.rinominaLocale(percorso, accantoA(percorso, nome)),
            // Uno per volta e in fila: `Promise.all` su venti cancellazioni
            // lascia, quando una fallisce, meta' lavoro fatto e nessun modo di
            // sapere quale meta'.
            elimina: async (voci) => {
              for (const v of voci) await window.gestore.trasferimenti.eliminaLocale(v.percorso)
            },
            mostra: (percorso) => { void window.gestore.trasferimenti.mostraNelSistema(percorso) }
          }}
          azione={{
            etichetta: `→  Carica${selLocale.presi.length > 1 ? ` (${selLocale.presi.length})` : ''}`,
            attiva: pronto && selLocale.presi.length > 0,
            fai: () => manda('su', scelteDi(locale, selLocale.presi))
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
          selezione={selRemota}
          setSelezione={setSelRemota}
          confronto={locale !== undefined ? confrontoRemoto : undefined}
          onVai={(p) => ricaricaRemoto(p)}
          onAggiorna={() => ricaricaRemoto(remoto?.percorso)}
          operazioni={pronto && scelta !== undefined ? {
            nuovaCartella: (dentro, nome) =>
              window.gestore.trasferimenti.creaCartella(scelta, unisciPercorso(dentro, nome)),
            rinomina: (percorso, nome) =>
              window.gestore.trasferimenti.rinominaRemoto(scelta, percorso, accantoA(percorso, nome)),
            elimina: async (voci) => {
              for (const v of voci) {
                await window.gestore.trasferimenti.eliminaRemoto(scelta, v.percorso, v.cartella)
              }
            },
            permessi: async (voci, modo) => {
              for (const v of voci) {
                await window.gestore.trasferimenti.permessiRemoti(scelta, v.percorso, modo)
              }
            },
            modificaFile: (v) => {
              setErrore(undefined)
              void window.gestore.trasferimenti.apriInModifica(scelta, v.percorso, v.nome)
                .catch((e: unknown) => setErrore(String(e)))
            }
          } : undefined}
          azione={{
            etichetta: `←  Scarica${selRemota.presi.length > 1 ? ` (${selRemota.presi.length})` : ''}`,
            attiva: pronto && selRemota.presi.length > 0,
            fai: () => manda('giu', scelteDi(remoto, selRemota.presi))
          }}
          onLascia={(voci) => manda('su', voci)}
          /**
           * Sul lato server si può lasciar cadere anche roba trascinata da
           * Esplora risorse: è il gesto per cui la gente apre FileZilla.
           */
          accettaDaFuori={pronto}
        />
      </div>

      <InModifica aperti={inModifica} />

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
  /**
   * I campioni di avanzamento, per lavoro.
   *
   * La velocita' si calcola qui e non nel motore per una ragione pratica: il
   * motore sa quanti byte sono passati, e questo lo dice gia'. Quanto ci ha
   * messo lo sa chi guarda arrivare le notifiche, ed e' questo pannello.
   *
   * In un `ref` e non in uno stato: un campione in piu' non deve ridisegnare
   * niente da solo — il ridisegno arriva comunque con la notifica successiva —
   * e metterlo in uno stato vorrebbe dire un giro di React per ogni pacchetto.
   */
  const campioni = useRef(new Map<string, Campione[]>())
  const adesso = Date.now()
  for (const l of lavori) {
    if (l.stato !== 'corso') { campioni.current.delete(l.id); continue }
    campioni.current.set(
      l.id,
      aggiungiCampione(campioni.current.get(l.id) ?? [], { fatti: l.fatti, quando: adesso })
    )
  }
  // I lavori finiti non lasciano campioni dietro: la mappa vivrebbe quanto il
  // pannello, e una coda da cinquecento file la riempirebbe tutta.
  for (const id of [...campioni.current.keys()]) {
    if (!lavori.some((l) => l.id === id && l.stato === 'corso')) campioni.current.delete(id)
  }
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
              <>
                <span className="trasf__barra">
                  <span
                    className="trasf__barra-dentro"
                    style={{ width: `${l.dimensione > 0 ? Math.min(100, (l.fatti / l.dimensione) * 100) : 30}%` }}
                  />
                </span>
                {/*
                  Una barra dice che qualcosa succede; non dice se ci vogliono
                  quaranta secondi o quaranta minuti — che e' la sola cosa che
                  serve per decidere se restare a guardare o andare a fare altro.
                */}
                {(() => {
                  const v = velocita(campioni.current.get(l.id) ?? [], adesso)
                  const manca = quantoManca(l.fatti, l.dimensione, v)
                  if (v === undefined) return null
                  return (
                    <span className="misura trasf__andatura">
                      {scriviVelocita(v)}{manca !== undefined ? ` · ${scriviQuantoManca(manca)}` : ''}
                    </span>
                  )
                })()}
              </>
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

/**
 * Le operazioni che si possono fare su un lato.
 *
 * Assenti quando il lato non è pronto — il server non è collegato — e allora i
 * tasti non ci sono invece di esserci e fallire. Un tasto che si preme e dà un
 * errore è peggio di un tasto che non c'è: il primo lo provi, il secondo lo
 * capisci.
 */
export type Operazioni = {
  nuovaCartella: (dentro: string, nome: string) => Promise<void>
  rinomina: (percorso: string, nome: string) => Promise<void>
  elimina: (voci: { percorso: string; cartella: boolean }[]) => Promise<void>
  /** Solo di qua: aprire la cartella nel gestore di file del sistema. */
  mostra?: (percorso: string) => void
  /**
   * Solo di là: aprire un file del server nel programma con cui lo apriresti
   * qui, e da quel momento ogni salvataggio risale.
   */
  modificaFile?: (v: VoceVista) => void
  /**
   * Solo di là: cambiare i permessi.
   *
   * È la metà che mancava di una cosa già mostrata. Un file arrivato senza il
   * bit di esecuzione è uno script che non parte; uno caricato leggibile da
   * tutti dentro una cartella web è un segreto pubblicato. Senza questo, metà
   * delle volte si apre una shell subito dopo aver caricato.
   */
  permessi?: (voci: { percorso: string }[], modo: number) => Promise<void>
}

/** La data come si legge di sfuggita: giorno e ora, niente secondi. */
function quandoBreve(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  const due = (n: number): string => String(n).padStart(2, '0')
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${due(d.getHours())}:${due(d.getMinutes())}`
}

/** Una delle due colonne. Identiche di proposito: è lo stesso gesto da due lati. */
function Colonna(
  {
    titolo, elenco, vuoto, selezione, setSelezione, onVai, onAggiorna, azione, onLascia,
    accettaDaFuori, confronto, operazioni
  }: {
    titolo: string
    elenco?: ElencoVista
    vuoto?: string
    selezione: Selezione
    /** Com'è messo ogni file rispetto all'altro lato. Assente: non si sa ancora. */
    confronto?: Map<string, Confronto>
    setSelezione: (s: Selezione) => void
    onVai: (percorso: string) => void
    onAggiorna: () => void
    azione: { etichetta: string; attiva: boolean; fai: () => void }
    onLascia: (voci: { percorso: string; cartella: boolean }[]) => void
    accettaDaFuori: boolean
    operazioni?: Operazioni
  }
): React.JSX.Element {
  const [sopra, setSopra] = useState(false)
  const [ordine, setOrdine] = useState<Ordine>(ORDINE_PREDEFINITO)
  const [cerca, setCerca] = useState('')
  const [nascosti, setNascosti] = useState(false)
  const [storia, setStoria] = useState<Cronologia>(cronologiaVuota())
  const [scritto, setScritto] = useState<string | undefined>(undefined)
  const [chiedo, setChiedo] = useState<{ cosa: 'cartella' | 'rinomina'; nome: string } | undefined>(undefined)
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [chiedoPermessi, setChiedoPermessi] = useState<string | undefined>(undefined)
  const [guasto, setGuasto] = useState<string | undefined>(undefined)

  const presi = selezione.presi
  const tutte = elenco?.voci ?? []
  const visibili = vociVisibili(tutte as VoceSfogliabile[], ordine, { testo: cerca, nascosti }) as VoceVista[]
  const scelte = tutte.filter((v) => presi.includes(v.percorso))

  /**
   * La cronologia segue il percorso, invece di essere alimentata dai clic.
   *
   * Alimentandola dai clic resterebbero fuori tutti gli altri modi di cambiare
   * cartella — il doppio clic, la scrittura nella barra, il ritorno dopo una
   * copia — e «indietro» porterebbe in un posto che non è quello da cui vieni.
   */
  const dove = elenco?.percorso
  useEffect(() => {
    if (dove === undefined) return
    setStoria((s) => (s.voci[s.indice] === dove ? s : vaiA(s, dove)))
    // Il filtro si svuota cambiando cartella: uno rimasto acceso mostra
    // «niente» dentro una cartella piena, e la prima reazione è credere che
    // sia vuota.
    setCerca('')
    setScritto(undefined)
  }, [dove])

  const vaiIndietro = (): void => {
    const r = indietro(storia)
    if (r.percorso === undefined) return
    setStoria(r.storia)
    onVai(r.percorso)
  }
  const vaiAvanti = (): void => {
    const r = avanti(storia)
    if (r.percorso === undefined) return
    setStoria(r.storia)
    onVai(r.percorso)
  }

  const fai = (cosa: Promise<void>): void => {
    setGuasto(undefined)
    cosa
      .then(() => {
        setChiedo(undefined)
        setConfermaElimina(false)
        setChiedoPermessi(undefined)
        onAggiorna()
      })
      .catch((e: unknown) => setGuasto(String(e)))
  }

  const confermaChiedo = (): void => {
    if (chiedo === undefined || operazioni === undefined || chiedo.nome.trim() === '') return
    fai(chiedo.cosa === 'cartella'
      ? operazioni.nuovaCartella(elenco?.percorso ?? '', chiedo.nome.trim())
      : operazioni.rinomina(scelte[0]?.percorso ?? '', chiedo.nome.trim()))
  }

  const clic = (v: VoceVista, e: React.MouseEvent): void => {
    setSelezione(nuovaSelezione(
      visibili, selezione, v.percorso, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }
    ))
  }

  const daTastiera = (e: React.KeyboardEvent): void => {
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); setSelezione(prendiTutto(visibili)); return
    }
    if (e.key === 'Backspace' && elenco?.su !== undefined) { e.preventDefault(); onVai(elenco.su); return }
    if (e.key === 'F5') { e.preventDefault(); onAggiorna(); return }
    const primo = scelte[0]
    if (primo === undefined) return
    if (e.key === 'Enter' && primo.cartella) { e.preventDefault(); onVai(primo.percorso); return }
    if (e.key === 'F2' && operazioni !== undefined) {
      e.preventDefault(); setChiedo({ cosa: 'rinomina', nome: primo.nome }); return
    }
    if (e.key === 'Delete' && operazioni !== undefined) { e.preventDefault(); setConfermaElimina(true) }
  }

  const iniziaTrascinamento = (v: VoceVista, e: React.DragEvent): void => {
    // Trascinando una riga che non era scelta si porta quella e solo quella:
    // altrimenti partirebbe una selezione che chi guarda ha già dimenticato.
    const voci = presi.includes(v.percorso) ? scelte : [v]
    if (!presi.includes(v.percorso)) setSelezione({ presi: [v.percorso], ancora: v.percorso })
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
    const fuori = [...e.dataTransfer.files]
      .map((f) => window.gestore.trasferimenti.percorsoDelFile(f))
      .filter((p) => p !== '')
    // Se sia cartella o file lo si **chiede al disco**: indovinarlo dal punto
    // nel nome sbaglia su `.git` e su `archivio.2026`, e sbagliarlo vuol dire
    // accodare una cartella come file — che fallisce e basta.
    void Promise.all(
      fuori.map(async (p) => ({ percorso: p, cartella: await window.gestore.sistema.cartellaEsiste(p) }))
    ).then(onLascia)
  }

  const intestazione = (per: PerCosa, testo: string, classe: string): React.JSX.Element => (
    <button
      className={`trasf__col ${classe}${ordine.per === per ? ' trasf__col--attiva' : ''}`}
      onClick={() => setOrdine(prossimoOrdine(ordine, per))}
      title={`Ordina per ${testo.toLowerCase()}`}
    >
      {testo}{ordine.per === per ? (ordine.verso === 'su' ? ' ▲' : ' ▼') : ''}
    </button>
  )

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
        <button
          className="tasto tasto--fantasma"
          disabled={!puoIndietro(storia)}
          onClick={vaiIndietro}
          title="Indietro"
        >←</button>
        <button
          className="tasto tasto--fantasma"
          disabled={!puoAvanti(storia)}
          onClick={vaiAvanti}
          title="Avanti"
        >→</button>
        <button
          className="tasto tasto--fantasma"
          disabled={elenco?.su === undefined}
          onClick={() => { if (elenco?.su !== undefined) onVai(elenco.su) }}
          title="Cartella superiore (Backspace)"
        >↑</button>
        {/*
          La barra si può scrivere. Senza, per arrivare in una cartella profonda
          si risale e si ridiscende un pezzo per volta — e su un server con
          percorsi lunghi è la cosa che stanca prima. Si conferma con Invio, ed
          Esc rimette quello che c'era: una barra che cambia cartella mentre
          scrivi non si potrebbe usare.
        */}
        <input
          className="campo trasf__barra-percorso"
          value={scritto ?? elenco?.percorso ?? ''}
          placeholder="percorso"
          onChange={(e) => setScritto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && scritto !== undefined && scritto.trim() !== '') {
              onVai(scritto.trim())
              setScritto(undefined)
            }
            if (e.key === 'Escape') { e.stopPropagation(); setScritto(undefined) }
          }}
        />
        <button className="tasto tasto--fantasma" onClick={onAggiorna} title="Aggiorna (F5)">⟳</button>
      </div>

      <div className="trasf__strumenti">
        <input
          className="campo trasf__cerca"
          value={cerca}
          placeholder="filtra…"
          onChange={(e) => setCerca(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setCerca('') } }}
        />
        <button
          className={`tasto tasto--fantasma${nascosti ? ' tasto--acceso' : ''}`}
          onClick={() => setNascosti(!nascosti)}
          title="Mostra anche i file che cominciano per punto"
        >nascosti</button>
        {operazioni !== undefined ? (
          <>
            <button
              className="tasto tasto--fantasma"
              onClick={() => setChiedo({ cosa: 'cartella', nome: '' })}
            >+ Cartella</button>
            <button
              className="tasto tasto--fantasma"
              disabled={scelte.length !== 1}
              onClick={() => { if (scelte[0] !== undefined) setChiedo({ cosa: 'rinomina', nome: scelte[0].nome }) }}
              title="Rinomina (F2)"
            >Rinomina</button>
            <button
              className="tasto tasto--fantasma"
              disabled={scelte.length === 0}
              onClick={() => setConfermaElimina(true)}
              title="Elimina (Canc)"
            >Elimina</button>
          </>
        ) : null}
        {operazioni?.permessi !== undefined ? (
          <button
            className="tasto tasto--fantasma"
            disabled={scelte.length === 0}
            onClick={() => setChiedoPermessi(scelte[0]?.permessi ?? '644')}
          >Permessi</button>
        ) : null}
        {operazioni?.modificaFile !== undefined ? (
          <button
            className="tasto tasto--fantasma"
            disabled={scelte.length !== 1 || scelte[0]?.cartella === true}
            onClick={() => { if (scelte[0] !== undefined) operazioni.modificaFile?.(scelte[0]) }}
            title="Apri qui e rimanda su a ogni salvataggio (doppio clic)"
          >Modifica</button>
        ) : null}
        {operazioni?.mostra !== undefined ? (
          <button
            className="tasto tasto--fantasma"
            onClick={() => { if (elenco?.percorso !== undefined) operazioni.mostra?.(elenco.percorso) }}
            title="Apri questa cartella nel gestore di file"
          >Apri fuori</button>
        ) : null}
      </div>

      <div className="trasf__intestazioni">
        {intestazione('nome', 'Nome', 'trasf__col--nome')}
        {intestazione('dimensione', 'Dim.', 'trasf__col--dim')}
        {intestazione('quando', 'Data', 'trasf__col--data')}
      </div>

      {guasto !== undefined ? <div className="avviso">⚠ {guasto}</div> : null}

      <div className="trasf__elenco" tabIndex={0} onKeyDown={daTastiera}>
        {elenco === undefined ? (
          <div className="misura">{vuoto ?? 'Carico…'}</div>
        ) : visibili.length === 0 ? (
          <div className="misura">
            {tutte.length === 0 ? (vuoto ?? 'Cartella vuota.') : 'Niente che corrisponda al filtro.'}
          </div>
        ) : visibili.map((voce) => {
          const c = voce.cartella ? undefined : confronto?.get(voce.nome)
          return (
            <div
              key={voce.percorso}
              className={`trasf__riga${presi.includes(voce.percorso) ? ' trasf__voce--presa' : ''}`}
              draggable
              onDragStart={(e) => iniziaTrascinamento(voce, e)}
              onClick={(e) => clic(voce, e)}
              onDoubleClick={() => {
                // Il doppio clic fa la cosa ovvia: una cartella si apre, un
                // file si apre. Su un file del server «aprire» vuol dire
                // scaricarlo, aprirlo nel programma giusto, e da lì in poi
                // rimandarlo su a ogni salvataggio.
                if (voce.cartella) { onVai(voce.percorso); return }
                operazioni?.modificaFile?.(voce)
              }}
            >
              <span className="trasf__col--nome trasf__nome" title={voce.percorso}>
                {voce.cartella ? '📁 ' : ''}{voce.nome}
                {c !== undefined && c !== 'uguale' ? (
                  <span className={`trasf__segno trasf__segno--${c}`}> · {segnoDi(c)}</span>
                ) : null}
              </span>
              <span className="trasf__col--dim misura">
                {voce.cartella ? '—' : misura(voce.dimensione)}
              </span>
              <span className="trasf__col--data misura" title={voce.permessi ?? ''}>
                {quandoBreve(voce.quando)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="trasf__piede misura">
        {visibili.length} element{visibili.length === 1 ? 'o' : 'i'}
        {visibili.length !== tutte.length ? ` (di ${tutte.length})` : ''}
        {presi.length > 0 ? ` · ${presi.length} scelt${presi.length === 1 ? 'o' : 'i'}` : ''}
      </div>

      {chiedo !== undefined && operazioni !== undefined ? (
        <div className="velo" onMouseDown={() => setChiedo(undefined)}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa">
              <span className="serigrafia">
                {chiedo.cosa === 'cartella' ? 'Nuova cartella' : 'Rinomina'}
              </span>
            </div>
            <div className="dialogo__corpo">
              <input
                className="campo"
                autoFocus
                value={chiedo.nome}
                onChange={(e) => setChiedo({ ...chiedo, nome: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') confermaChiedo() }}
              />
            </div>
            <div className="dialogo__piede">
              <button className="tasto" onClick={() => setChiedo(undefined)}>Annulla</button>
              <button
                className="tasto tasto--primario"
                disabled={chiedo.nome.trim() === ''}
                onClick={confermaChiedo}
              >
                {chiedo.cosa === 'cartella' ? 'Crea' : 'Rinomina'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chiedoPermessi !== undefined && operazioni?.permessi !== undefined ? (
        <div className="velo" onMouseDown={() => setChiedoPermessi(undefined)}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">Permessi</span></div>
            <div className="dialogo__corpo">
              <div className="misura">
                {scelte.length === 1 ? scelte[0]?.nome : `${scelte.length} elementi`}
              </div>
              <input
                className="campo"
                autoFocus
                value={chiedoPermessi}
                onChange={(e) => setChiedoPermessi(e.target.value)}
                onKeyDown={(e) => {
                  const modo = leggiPermessi(chiedoPermessi)
                  if (e.key === 'Enter' && modo !== undefined) {
                    fai(operazioni.permessi?.(scelte.map((v) => ({ percorso: v.percorso })), modo)
                      ?? Promise.resolve())
                  }
                }}
              />
              {/*
                Le lettere accanto al numero, non al posto suo. Il numero è
                quello che si digita e quello che sta scritto nelle istruzioni
                («mettilo a 755»); le lettere sono come ci si accorge di aver
                scritto 655 — un numero plausibile che toglie l'esecuzione al
                proprietario.
              */}
              <div className="misura">
                {leggiPermessi(chiedoPermessi) !== undefined
                  ? permessiInLettere(leggiPermessi(chiedoPermessi) as number)
                  : 'tre o quattro cifre da 0 a 7'}
              </div>
              <div className="riga">
                {['644', '755', '600', '777'].map((n) => (
                  <button key={n} className="tasto tasto--fantasma" onClick={() => setChiedoPermessi(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="dialogo__piede">
              <button className="tasto" onClick={() => setChiedoPermessi(undefined)}>Annulla</button>
              <button
                className="tasto tasto--primario"
                disabled={leggiPermessi(chiedoPermessi) === undefined}
                onClick={() => {
                  const modo = leggiPermessi(chiedoPermessi)
                  if (modo === undefined) return
                  fai(operazioni.permessi?.(scelte.map((v) => ({ percorso: v.percorso })), modo)
                    ?? Promise.resolve())
                }}
              >Applica</button>
            </div>
          </div>
        </div>
      ) : null}

      {confermaElimina && operazioni !== undefined ? (
        <div className="velo" onMouseDown={() => setConfermaElimina(false)}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">Eliminare?</span></div>
            <div className="dialogo__corpo">
              {/*
                I nomi, non il conteggio. «3 elementi» non è quello che serve
                sapere un istante prima di cancellare: serve *quali*.
              */}
              <div className="misura">
                {scelte.slice(0, 8).map((v) => v.nome).join(', ')}
                {scelte.length > 8 ? ` …e altri ${scelte.length - 8}` : ''}
              </div>
              {scelte.some((v) => v.cartella) ? (
                <div className="avviso">⚠ Fra questi c’è una cartella, con dentro tutto quello che contiene.</div>
              ) : null}
            </div>
            <div className="dialogo__piede">
              <button className="tasto" onClick={() => setConfermaElimina(false)}>Annulla</button>
              <button
                className="tasto tasto--pericolo"
                onClick={() => fai(operazioni.elimina(
                  scelte.map((v) => ({ percorso: v.percorso, cartella: v.cartella }))
                ))}
              >Elimina</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * I file del server che stai modificando adesso.
 *
 * Serve a rendere visibile un meccanismo che altrimenti è invisibile: salvi
 * nell'editor e non succede niente sullo schermo, quindi non sai se è risalito.
 * Il dubbio si toglie ricaricando a mano — cioè rifacendo esattamente il lavoro
 * che questa funzione doveva togliere. Il conto delle risalite e l'ora
 * dell'ultima sono la prova che il collegamento è vivo.
 */
function InModifica({ aperti }: { aperti: FileInModificaVista[] }): React.JSX.Element | null {
  if (aperti.length === 0) return null
  const ora = (ms?: number): string => {
    if (ms === undefined) return 'non ancora'
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return (
    <div className="trasf__modifiche">
      <div className="trasf__coda-testa">
        <span className="serigrafia">Aperti in modifica</span>
        <span className="misura">salva nell’editor e risalgono da soli</span>
      </div>
      <div className="trasf__coda-righe">
        {aperti.map((f) => (
          <div key={`${f.destinazione}::${f.remoto}`} className="trasf__lavoro">
            <span className="trasf__lavoro-verso">✎</span>
            <span className="trasf__lavoro-nome" title={f.remoto}>{f.nome}</span>
            {f.errore !== undefined ? (
              <span className="trasf__lavoro-errore">{f.errore}</span>
            ) : (
              <span className="misura">
                {f.risalite === 0
                  ? 'in attesa del primo salvataggio'
                  : `risalito ${f.risalite} volt${f.risalite === 1 ? 'a' : 'e'} · ${ora(f.ultimaRisalita)}`}
              </span>
            )}
            <button
              className="tasto tasto--fantasma"
              onClick={() => {
                void window.gestore.trasferimenti.chiudiModifica(f.destinazione, f.remoto)
              }}
              title="Smetti di rimandare su questo file"
            >
              Stacca
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
