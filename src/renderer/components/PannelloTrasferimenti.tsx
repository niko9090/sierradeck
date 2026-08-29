import React, { useEffect, useState } from 'react'
import type { DestinazioneVista, ElencoVista, VoceVista } from '../../preload'

/**
 * I file del progetto, di qua e di là.
 *
 * È il «FileZilla» dentro SierraDeck, e sta dentro invece che accanto per una
 * ragione sola: **le destinazioni appartengono al progetto**. Un elenco globale
 * di venti connessioni rimette addosso proprio il lavoro che si voleva togliere
 * — ricordarsi quale riga va con quale cartella. Qui apri la chat di un
 * progetto e vedi i suoi server, e nessun altro.
 *
 * A sinistra il disco di questo computer, a destra il server. In mezzo le due
 * frecce, che sono tutto quello che serve nel novanta per cento dei casi.
 *
 * ## Prima connessione
 *
 * La prima volta non si collega: mostra l'impronta della chiave del server e
 * chiede se è lui. Sembra un intoppo, ed è l'unica cosa che rende il
 * collegamento davvero sicuro invece che solo cifrato — chi si mette in mezzo
 * presenta una chiave sua, e senza questa domanda la connessione riuscirebbe lo
 * stesso, con la password consegnata a lui.
 */

type Avanzamento = { cosa: string; fatti: number; totale: number; errore?: string }

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
  const [avanza, setAvanza] = useState<Avanzamento | undefined>(undefined)
  const [modifica, setModifica] = useState<Partial<DestinazioneVista> | undefined>(undefined)
  const [password, setPassword] = useState('')

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  useEffect(() => window.gestore.trasferimenti.suAvanzamento((e) => {
    if (e.finito === true) {
      setAvanza(undefined)
      if (e.errore !== undefined) setErrore(e.errore)
      else { ricaricaLocale(locale?.percorso); ricaricaRemoto(remoto?.percorso) }
      return
    }
    setAvanza({ cosa: e.cosa, fatti: e.fatti, totale: e.totale })
  }), [locale?.percorso, remoto?.percorso])

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
    window.gestore.trasferimenti.locale(percorso).then(setLocale).catch(() => undefined)
  }
  useEffect(() => ricaricaLocale(), [cwd])

  const ricaricaRemoto = (dove?: string): void => {
    if (scelta === undefined || !collegato) return
    window.gestore.trasferimenti.remoto(scelta, dove ?? '')
      .then((e) => { setRemoto(e); setErrore(undefined) })
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
              className="tasto tasto--fantasma"
              onClick={() => {
                void window.gestore.trasferimenti.scollega(dest.id)
                setCollegato(false); setRemoto(undefined)
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
        {avanza !== undefined ? (
          <div className="negozio__ok">
            {avanza.cosa} — {misura(avanza.fatti)}
            {avanza.totale > 0 ? ` di ${misura(avanza.totale)}` : ''}
          </div>
        ) : null}
      </div>

      <div className="trasf">
        <Colonna
          titolo="Su questo computer"
          elenco={locale}
          onVai={(p) => ricaricaLocale(p)}
          azione={{
            etichetta: '→  Carica',
            attiva: collegato && remoto !== undefined,
            fai: (v) => {
              if (scelta === undefined || remoto === undefined || v.cartella) return
              void window.gestore.trasferimenti.carica(scelta, v.percorso, remoto.percorso)
            }
          }}
        />
        <Colonna
          titolo={dest === undefined ? 'Nessun server' : `${dest.utente}@${dest.host}`}
          elenco={collegato ? remoto : undefined}
          vuoto={
            dest === undefined
              ? 'Aggiungi un server con «+ Server».'
              : collegato ? 'Cartella vuota.' : 'Premi «Collega».'
          }
          onVai={(p) => ricaricaRemoto(p)}
          azione={{
            etichetta: '←  Scarica',
            attiva: collegato && locale !== undefined,
            fai: (v) => {
              if (scelta === undefined || locale === undefined || v.cartella) return
              void window.gestore.trasferimenti.scarica(scelta, v.percorso, locale.percorso)
            }
          }}
        />
      </div>

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

/** Una delle due colonne. Identiche di proposito: è lo stesso gesto da due lati. */
function Colonna(
  { titolo, elenco, vuoto, onVai, azione }: {
    titolo: string
    elenco?: ElencoVista
    vuoto?: string
    onVai: (percorso: string) => void
    azione: { etichetta: string; attiva: boolean; fai: (v: VoceVista) => void }
  }
): React.JSX.Element {
  return (
    <div className="trasf__lato">
      <div className="trasf__testa">
        <span className="serigrafia">{titolo}</span>
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
          <div key={v.percorso} className="negozio__voce">
            <div
              className="negozio__info"
              onDoubleClick={() => { if (v.cartella) onVai(v.percorso) }}
            >
              <div className="negozio__nome">
                {v.cartella ? '📁 ' : ''}{v.nome}
              </div>
              <div className="negozio__desc">
                {v.cartella ? 'cartella' : misura(v.dimensione)}
                {v.permessi !== undefined ? ` · ${v.permessi}` : ''}
              </div>
            </div>
            <div className="negozio__azioni">
              {v.cartella ? (
                <button className="tasto tasto--fantasma" onClick={() => onVai(v.percorso)}>Apri</button>
              ) : (
                <button
                  className="tasto tasto--fantasma"
                  disabled={!azione.attiva}
                  onClick={() => azione.fai(v)}
                >
                  {azione.etichetta}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
