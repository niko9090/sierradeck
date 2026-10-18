import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatArchiviata, ChatInRecupero, VistaSpazio } from '@shared/gestione-chat'
import { FRASE_SVUOTA, totaleSelezione } from '@shared/gestione-chat'
import {
  commutaScelta, confermaArchiviaChat, confermaChiediSvuota, confermaEliminaChat, fraseSvuotaGiusta, nomeScelte, ordinaVoci,
  ORDINI_SPAZIO, rifiutiDi, riepilogoSelezione, riepilogoSpazio, rigaArchiviata, rigaRecupero, rigaVoce, scegliTutte, scelteValide, SPIEGA_SVUOTA_DRIVE,
  type Conferma, type OrdineSpazio, type Rifiuto
} from '@shared/gestione-chat-vista'
import { byteLeggibili } from '@shared/spazio-drive'
import { Aiuto } from './Aiuto'
import { ConfermaAzioneChat, Rifiuti } from './AzioniChat'

export type SchedaGestione = 'spazio' | 'archiviate' | 'recupero'

/**
 * **Spazio delle chat** (0.79.0): le chat di questo PC dalla più grande (o
 * dalla meno usata), da scegliere a più d'una con il totale, per archiviarle o
 * eliminarle dal PC; le «Archiviate» e il «Recupero (30 giorni)» con
 * «Ripristina»; «Svuota il recupero adesso» in due passi (il PC dà la
 * conferma, poi si scrive SVUOTA). Le regole le decide il PC: qui si mostra.
 */
export function ModaleGestioneChat({ scheda: iniziale = 'spazio', onChiudi }: { scheda?: SchedaGestione; onChiudi: () => void }): React.JSX.Element {
  const [scheda, setScheda] = useState<SchedaGestione>(iniziale)
  const [vista, setVista] = useState<VistaSpazio | undefined>(undefined)
  const [archiviate, setArchiviate] = useState<ChatArchiviata[] | undefined>(undefined)
  const [recupero, setRecupero] = useState<{ chat: ChatInRecupero[]; byte: number } | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [nota, setNota] = useState<{ messaggio: string; rifiuti: Rifiuto[] } | undefined>(undefined)
  const [ordine, setOrdine] = useState<OrdineSpazio>('spazio')
  const [scelte, setScelte] = useState<string[]>([])
  const [conferma, setConferma] = useState<{ azione: 'archivia' | 'elimina'; conferma: (d: boolean) => Conferma; sessioni: string[] } | undefined>(undefined)
  const [svuota, setSvuota] = useState<{ passo: 'chiedi' } | { passo: 'scrivi'; gettone: string; messaggio: string; frase: string } | undefined>(undefined)
  const [svuotaDrive, setSvuotaDrive] = useState(false)
  const [inCorso, setInCorso] = useState(false)

  // Solo l'ultima lettura conta: una risposta vecchia che arriva dopo una nuova non la copre.
  const lettura = useRef(0)
  const leggi = useCallback((): void => {
    setErrore(undefined)
    const g = window.gestore.chatGestione
    const n = ++lettura.current
    const se = <T,>(f: (x: T) => void) => (x: T): void => { if (n === lettura.current) f(x) }
    void Promise.all([
      g.spazio().then(se(setVista)),
      g.archiviate().then(se(setArchiviate)),
      g.recupero().then(se(setRecupero))
    ]).catch((err: unknown) => se(setErrore)(`Non riesco a leggere le chat: ${err instanceof Error ? err.message : String(err)}`))
  }, [])
  useEffect(() => { leggi(); return window.gestore.chatGestione.onCambiata(leggi) }, [leggi])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape' && conferma === undefined && svuota === undefined) onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi, conferma, svuota])

  const voci = useMemo(() => (vista === undefined ? [] : ordinaVoci(vista.chat, ordine)), [vista, ordine])
  const valide = useMemo(() => scelteValide(scelte, voci), [scelte, voci])
  const selezione = useMemo(() => totaleSelezione(voci, valide), [voci, valide])
  const titoloDi = (s: string): string | undefined => voci.find((v) => v.sessione === s)?.titolo ?? archiviate?.find((a) => a.sessione === s)?.titolo

  const chiediAzione = (azione: 'archivia' | 'elimina'): void => {
    const titoli = valide.map((s) => titoloDi(s) ?? s.slice(0, 8))
    const nome = nomeScelte(titoli)
    setConferma(azione === 'archivia'
      ? { azione, sessioni: valide, conferma: () => confermaArchiviaChat(nome, valide.length) }
      : { azione, sessioni: valide, conferma: (d) => confermaEliminaChat(nome, byteLeggibili(selezione.byteEliminabili), d, selezione.eliminabili) })
  }

  const ripristinaArchiviata = (a: ChatArchiviata): void => {
    setInCorso(true)
    window.gestore.chatGestione.azione({ azione: 'ripristina', sessioni: [a.sessione] })
      .then((e) => setNota({ messaggio: e.messaggio, rifiuti: rifiutiDi(e, titoloDi) }))
      .catch((err: unknown) => setNota({ messaggio: `Non è andata: ${String(err)}`, rifiuti: [] }))
      .finally(() => { setInCorso(false); leggi() })
  }
  const ripristinaRecupero = (c: ChatInRecupero): void => {
    setInCorso(true)
    window.gestore.chatGestione.ripristina(c.id)
      .then((e) => setNota({ messaggio: e.messaggio, rifiuti: [] }))
      .catch((err: unknown) => setNota({ messaggio: `Non è andata: ${String(err)}`, rifiuti: [] }))
      .finally(() => { setInCorso(false); leggi() })
  }
  const chiediSvuota = (): void => {
    setInCorso(true)
    window.gestore.chatGestione.chiediSvuota(svuotaDrive)
      .then((r) => {
        // Annullato mentre il PC rispondeva: «Scrivi SVUOTA» non deve comparire lo stesso.
        if (r.ok && r.gettone !== undefined) { const g = r.gettone; setSvuota((prima) => prima?.passo === 'chiedi' ? { passo: 'scrivi', gettone: g, messaggio: r.messaggio, frase: '' } : prima) }
        else { setSvuota(undefined); setNota({ messaggio: r.messaggio, rifiuti: [] }) }
      })
      .catch((err: unknown) => { setSvuota(undefined); setNota({ messaggio: `Non è andata: ${String(err)}`, rifiuti: [] }) })
      .finally(() => setInCorso(false))
  }
  const svuotaDavvero = (gettone: string, frase: string): void => {
    setInCorso(true)
    window.gestore.chatGestione.svuota({ gettone, frase, ancheDalDrive: svuotaDrive })
      .then((r) => setNota({ messaggio: r.messaggio, rifiuti: [] }))
      .catch((err: unknown) => setNota({ messaggio: `Non è andata: ${String(err)}`, rifiuti: [] }))
      .finally(() => { setInCorso(false); setSvuota(undefined); leggi() })
  }

  const linguetta = (id: SchedaGestione, nome: string, conto?: number): React.JSX.Element => (
    <button role="tab" aria-selected={scheda === id} className={`gc-linguetta${scheda === id ? ' gc-linguetta--qui' : ''}`} onClick={() => { setScheda(id); setNota(undefined) }}>
      {nome}{conto !== undefined && conto > 0 ? ` (${conto})` : ''}
    </button>
  )
  const adesso = Date.now()

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Spazio delle chat</span>
          <Aiuto di="Spazio delle chat">Le chat di questo PC con lo spazio che occupano. Scegline una o più e premi Archivia (escono dagli elenchi, non si cancella niente) o Elimina dal PC (liberi spazio; per 30 giorni restano nel recupero). Le chat al lavoro, che aspettano una tua risposta, guidate da un autopilota attivo o che vivono su un altro PC non si toccano: lo dice la riga sotto il nome.</Aiuto>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>
        <div className="gc-linguette" role="tablist">
          {linguetta('spazio', 'Spazio')}
          {linguetta('archiviate', 'Archiviate', archiviate?.length)}
          {linguetta('recupero', 'Recupero', recupero?.chat.length)}
        </div>
        {errore !== undefined ? <div className="gc-errore">⚠ {errore}</div> : null}
        {nota !== undefined ? (
          <div className="gc-nota" role="status">
            <span>{nota.messaggio}</span>
            <Rifiuti rifiuti={nota.rifiuti} />
            <button className="collegamento" onClick={() => setNota(undefined)}>ok</button>
          </div>
        ) : null}

        {scheda === 'spazio' ? (
          vista === undefined ? <div className="vuoto">Misuro le chat…</div> : (
            <>
              <div className="gc-barra">
                <span className="misura">{riepilogoSpazio(vista)}</span>
                <span style={{ flex: 1 }} />
                <select className="campo" value={ordine} onChange={(e) => setOrdine(e.target.value as OrdineSpazio)} aria-label="Ordine">
                  {ORDINI_SPAZIO.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
              <div className="gc-barra">
                <button className="tasto tasto--mini" onClick={() => setScelte(valide.length > 0 ? [] : scegliTutte(voci))}>{valide.length > 0 ? 'Nessuna' : 'Scegli tutte'}</button>
                <span className="misura" aria-live="polite">{riepilogoSelezione(selezione)}</span>
                <span style={{ flex: 1 }} />
                <button className="tasto" disabled={valide.length === 0 || inCorso} onClick={() => chiediAzione('archivia')}>Archivia</button>
                <button className="tasto tasto--pericolo" disabled={selezione.eliminabili === 0 || inCorso} onClick={() => chiediAzione('elimina')}>Elimina dal PC</button>
              </div>
              <div className="elenco-chat">
                {voci.length === 0 ? <div className="vuoto">Nessuna chat su questo PC.</div> : voci.map((v) => (
                  <label key={v.sessione} className={`gc-voce${valide.includes(v.sessione) ? ' gc-voce--scelta' : ''}`}>
                    <input type="checkbox" checked={valide.includes(v.sessione)} onChange={() => setScelte((s) => commutaScelta(scelteValide(s, voci), v.sessione))} />
                    <span className="gc-voce__testo">
                      <span className="gc-voce__titolo">{v.titolo}</span>
                      <span className="misura">{rigaVoce(v, adesso, false)}{v.cwd !== undefined ? ` · ${v.cwd}` : ''}</span>
                      {v.nonEliminabile !== undefined ? <span className="gc-voce__no">{v.nonEliminabile}</span> : null}
                    </span>
                    <span className="gc-voce__byte">{byteLeggibili(v.byte)}</span>
                  </label>
                ))}
              </div>
            </>
          )
        ) : null}

        {scheda === 'archiviate' ? (
          archiviate === undefined ? <div className="vuoto">Leggo…</div> : archiviate.length === 0 ? <div className="vuoto">Nessuna chat archiviata.</div> : (
            <div className="elenco-chat">
              {archiviate.map((a) => (
                <div key={a.sessione} className="gc-voce">
                  <span className="gc-voce__testo">
                    <span className="gc-voce__titolo">{a.titolo ?? a.sessione.slice(0, 8)}</span>
                    <span className="misura">{rigaArchiviata(a)}</span>
                  </span>
                  <button className="tasto tasto--mini" disabled={inCorso} onClick={() => ripristinaArchiviata(a)}>Ripristina</button>
                </div>
              ))}
            </div>
          )
        ) : null}

        {scheda === 'recupero' ? (
          recupero === undefined ? <div className="vuoto">Leggo…</div> : (
            <>
              <div className="gc-barra">
                <span className="misura">{recupero.chat.length === 0 ? 'Il recupero è vuoto.' : `${recupero.chat.length === 1 ? '1 chat' : `${recupero.chat.length} chat`} · ${byteLeggibili(recupero.byte)} · si svuota da solo dopo 30 giorni`}</span>
                <Aiuto di="il recupero">Le chat eliminate dal PC restano qui 30 giorni, poi si cancellano da sole. «Ripristina» rimette la chat al suo posto con il suo nome. Lo spazio sul disco si libera davvero quando il recupero si svuota: da solo, o con «Svuota il recupero adesso», che chiede una conferma forte.</Aiuto>
                <span style={{ flex: 1 }} />
                <button className="tasto tasto--pericolo" disabled={recupero.chat.length === 0 || inCorso} onClick={() => setSvuota({ passo: 'chiedi' })}>Svuota il recupero adesso</button>
              </div>
              <div className="elenco-chat">
                {recupero.chat.map((c) => (
                  <div key={c.id} className="gc-voce">
                    <span className="gc-voce__testo">
                      <span className="gc-voce__titolo">{c.titolo}</span>
                      <span className="misura">{rigaRecupero(c, adesso)}</span>
                    </span>
                    <button className="tasto tasto--mini" disabled={inCorso} onClick={() => ripristinaRecupero(c)}>Ripristina</button>
                  </div>
                ))}
              </div>
            </>
          )
        ) : null}
      </div>

      {conferma !== undefined ? (
        <ConfermaAzioneChat
          azione={conferma.azione}
          conferma={conferma.conferma}
          onFai={(d) => window.gestore.chatGestione.azione({ azione: conferma.azione, sessioni: conferma.sessioni, ancheDalDrive: d })}
          onChiudi={() => { setConferma(undefined); setScelte([]); leggi() }}
        />
      ) : null}

      {svuota !== undefined ? (
        <div className="velo" onMouseDown={(e) => e.stopPropagation()}>
          <div className="dialogo dialogo--medio" role="dialog" aria-label="Svuota il recupero">
            {svuota.passo === 'chiedi' ? (() => {
              const c = confermaChiediSvuota(svuotaDrive)
              return (
                <>
                  <div className="dialogo__testa"><span className="serigrafia">{c.titolo}</span></div>
                  <p style={{ lineHeight: 1.5 }}>{c.testo}</p>
                  <label className="misura gc-spunta"><input type="checkbox" checked={svuotaDrive} onChange={(e) => setSvuotaDrive(e.target.checked)} /> anche dal Drive <Aiuto di="anche dal Drive">{SPIEGA_SVUOTA_DRIVE}</Aiuto></label>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="tasto" autoFocus onClick={() => setSvuota(undefined)}>Annulla</button>
                    <button className="tasto tasto--pericolo" disabled={inCorso} onClick={chiediSvuota}>{c.azione}</button>
                  </div>
                </>
              )
            })() : (
              <>
                <div className="dialogo__testa"><span className="serigrafia">Scrivi {FRASE_SVUOTA} per confermare</span></div>
                <p style={{ lineHeight: 1.5 }}>{svuota.messaggio}</p>
                <input
                  autoFocus
                  className="campo"
                  aria-label={`Scrivi ${FRASE_SVUOTA}`}
                  placeholder={FRASE_SVUOTA}
                  value={svuota.frase}
                  onChange={(e) => setSvuota({ ...svuota, frase: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !inCorso && fraseSvuotaGiusta(svuota.frase)) svuotaDavvero(svuota.gettone, svuota.frase) }}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="tasto" disabled={inCorso} onClick={() => setSvuota(undefined)}>Annulla</button>
                  <button className="tasto tasto--pericolo" disabled={!fraseSvuotaGiusta(svuota.frase) || inCorso} onClick={() => svuotaDavvero(svuota.gettone, svuota.frase)}>Svuota per sempre</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  , document.body)
}
