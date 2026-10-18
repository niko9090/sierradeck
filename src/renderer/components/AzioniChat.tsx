import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TESTI_AZIONI_CHAT, type EsitoAzioni } from '@shared/gestione-chat'
import { confermaArchiviaChat, confermaChiudiChat, confermaEliminaChat, motivoNonChiudeScelta, nomeScelte, rifiutiDi, SPIEGA_ELIMINA_DRIVE, type Conferma, type Rifiuto } from '@shared/gestione-chat-vista'
import { byteLeggibili } from '@shared/spazio-drive'
import { Aiuto } from './Aiuto'

type AzioneVista = 'chiudi' | 'archivia' | 'elimina'

/**
 * La conferma di un'azione sulle chat (0.79.0), con «anche dal Drive» per
 * Elimina e, dopo, com'è andata: il messaggio del PC e i rifiuti, ognuno con
 * la sua chat e il suo motivo. La usano le tre azioni di una chat e la vista
 * «Spazio delle chat».
 */
export function ConfermaAzioneChat({ azione, conferma, onFai, onChiudi }: {
  azione: AzioneVista
  /** Il testo della conferma: per Elimina cambia con «anche dal Drive». */
  conferma: (ancheDalDrive: boolean) => Conferma
  /** Esegue: riceve «anche dal Drive», risponde l'esito del PC. */
  onFai: (ancheDalDrive: boolean) => Promise<EsitoAzioni>
  onChiudi: () => void
}): React.JSX.Element {
  const [drive, setDrive] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<{ messaggio: string; rifiuti: Rifiuto[]; errore?: boolean; fatte?: number } | undefined>(undefined)
  useEffect(() => {
    // Esc chiude solo questa conferma, non la finestra sotto (es. «Riprendi una conversazione»): si ascolta
    // in cattura e non si lascia passare, anche mentre il PC lavora (lì non chiude niente).
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (!inCorso) onChiudi()
    }
    window.addEventListener('keydown', suTasto, true)
    return () => window.removeEventListener('keydown', suTasto, true)
  }, [onChiudi, inCorso])
  const fai = (): void => {
    setInCorso(true)
    onFai(drive)
      .then((e) => setEsito({ messaggio: e.messaggio, rifiuti: rifiutiDi(e, () => undefined), fatte: e.fatte }))
      .catch((err: unknown) => setEsito({ messaggio: `Non è andata: ${err instanceof Error ? err.message : String(err)}`, rifiuti: [], errore: true }))
      .finally(() => setInCorso(false))
  }
  const c = conferma(drive)
  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !inCorso) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={c.titolo}>
        <div className="dialogo__testa">
          <span className="serigrafia">{esito === undefined ? c.titolo : esito.errore === true || esito.fatte === 0 ? 'Non fatto' : 'Fatto'}</span>
        </div>
        {esito === undefined ? (
          <>
            <p style={{ margin: '4px 0 10px', lineHeight: 1.5 }}>{c.testo}</p>
            {azione === 'elimina' ? (
              <label className="misura gc-spunta">
                <input type="checkbox" checked={drive} onChange={(e) => setDrive(e.target.checked)} /> anche dal Drive
                <Aiuto di="anche dal Drive">{SPIEGA_ELIMINA_DRIVE}</Aiuto>
              </label>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="tasto" autoFocus onClick={onChiudi} disabled={inCorso}>Annulla</button>
              <button className={azione === 'elimina' ? 'tasto tasto--pericolo' : 'tasto tasto--primario'} onClick={fai} disabled={inCorso}>
                {inCorso ? 'Un momento…' : c.azione}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={esito.errore === true ? 'gc-errore' : undefined} style={{ margin: '4px 0 10px', lineHeight: 1.5 }}>{esito.messaggio}</p>
            <Rifiuti rifiuti={esito.rifiuti} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="tasto tasto--primario" autoFocus onClick={onChiudi}>Va bene</button>
            </div>
          </>
        )}
      </div>
    </div>
  , document.body)
}

/** I rifiuti: una riga per chat, con il motivo del PC. */
export function Rifiuti({ rifiuti }: { rifiuti: readonly Rifiuto[] }): React.JSX.Element | null {
  if (rifiuti.length === 0) return null
  return (
    <ul className="gc-rifiuti" aria-label="Chat non toccate">
      {rifiuti.map((r) => <li key={r.sessione}>{r.motivo}</li>)}
    </ul>
  )
}

type Richiesta = { chiave: number; azione: AzioneVista; conferma: (ancheDalDrive: boolean) => Conferma; fai: (ancheDalDrive: boolean) => Promise<EsitoAzioni> }
let mostraNellOspite: ((r: Richiesta) => void) | undefined
let chiavi = 0

/**
 * Dove si mostrano la conferma e l'esito delle tre azioni: uno solo, in `App`.
 * Dentro la riga sparivano con lei: eliminata o archiviata una chat da
 * «Riprendi una conversazione», l'elenco si rileggeva, la riga se ne andava e
 * l'esito («1 chat eliminata dal PC: … tolti») non si vedeva mai (giro con
 * clic veri del 18/10).
 */
export function OspiteAzioniChat(): React.JSX.Element | null {
  const [r, setR] = useState<Richiesta | undefined>(undefined)
  useEffect(() => { mostraNellOspite = setR; return () => { if (mostraNellOspite === setR) mostraNellOspite = undefined } }, [])
  if (r === undefined) return null
  return <ConfermaAzioneChat key={r.chiave} azione={r.azione} conferma={r.conferma} onFai={r.fai} onChiudi={() => setR(undefined)} />
}

/**
 * Le tre azioni di **una** chat (0.79.0): Chiudi, Archivia, Elimina dal PC,
 * ognuna con il suo «?» corto. Stanno dietro un tasto, perché il riquadro, le
 * schede della Panoramica e l'elenco hanno già poco posto.
 *
 * `onChiudi` è il gesto locale del riquadro (chiude il riquadro e il suo
 * claude.exe); senza, «Chiudi» lo chiede al PC come fanno la pagina e l'app.
 */
export function AzioniChat({ sessione, titolo, aperta, onChiudi, classe }: {
  sessione: string
  titolo: string
  /** La chat è aperta qui: «Chiudi» ha senso. Senza, si mostra spento. */
  aperta?: boolean
  onChiudi?: () => void
  classe?: string
}): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const [sceltaQui, setSceltaQui] = useState<{ azione: AzioneVista; conferma: (ancheDalDrive: boolean) => Conferma } | undefined>(undefined)
  const scelta = sceltaQui
  const setScelta = (s: { azione: AzioneVista; conferma: (ancheDalDrive: boolean) => Conferma }): void => {
    if (mostraNellOspite !== undefined) mostraNellOspite({ chiave: ++chiavi, ...s, fai: (d) => fai(s.azione, d) })
    else setSceltaQui(s)
  }
  const dove = useRef<HTMLSpanElement>(null)
  // Aperto il menu, si chiede al PC quanto libera e se si può eliminare: una chat che lavora, aspetta,
  // è guidata da un autopilota attivo o vive su un altro PC mostra «Elimina dal PC» spento con il motivo.
  // Anche «Chiudi» spento con il motivo, se qui non è aperta (salvo il riquadro, che si chiude da sé).
  const [misura, setMisura] = useState<{ byte: number; motivo?: string; chiusa?: string } | undefined>(undefined)
  useEffect(() => {
    if (!menu) return
    let vivo = true
    setMisura(undefined)
    window.gestore.chatGestione.selezione([sessione])
      .then((s) => { if (vivo) setMisura({ byte: s.byte, motivo: s.escluse[0]?.motivo, chiusa: onChiudi === undefined ? motivoNonChiudeScelta(s, sessione, titolo) : undefined }) })
      .catch(() => undefined)
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si misura all'apertura del menu, non a ogni cambio del titolo
  }, [menu, sessione])
  useEffect(() => {
    if (!menu) return
    const suClic = (e: MouseEvent): void => { if (dove.current !== null && !dove.current.contains(e.target as Node)) setMenu(false) }
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setMenu(false) } }
    window.addEventListener('mousedown', suClic, true)
    window.addEventListener('keydown', suTasto, true)
    return () => { window.removeEventListener('mousedown', suClic, true); window.removeEventListener('keydown', suTasto, true) }
  }, [menu])

  const nome = nomeScelte([titolo])
  const chiedi = (azione: AzioneVista): void => {
    setMenu(false)
    if (azione === 'chiudi') { setScelta({ azione, conferma: () => confermaChiudiChat(nome) }); return }
    if (azione === 'archivia') { setScelta({ azione, conferma: () => confermaArchiviaChat(nome) }); return }
    // Lo spazio che libera si chiede al PC: la stessa misura della vista «Spazio delle chat».
    if (misura !== undefined) { const b = byteLeggibili(misura.byte); setScelta({ azione, conferma: (d) => confermaEliminaChat(nome, b, d) }); return }
    window.gestore.chatGestione.selezione([sessione])
      .then((s) => {
        // Toccato prima che arrivasse il motivo: niente conferma, il menu torna con il tasto spento e il motivo.
        const motivo = s.escluse[0]?.motivo
        if (motivo !== undefined) { setMisura({ byte: s.byte, motivo, chiusa: onChiudi === undefined ? motivoNonChiudeScelta(s, sessione, titolo) : undefined }); setMenu(true); return }
        setScelta({ azione, conferma: (d) => confermaEliminaChat(nome, byteLeggibili(s.byte), d) })
      })
      .catch(() => setScelta({ azione, conferma: (d) => confermaEliminaChat(nome, 'lo spazio di questa chat', d) }))
  }
  const fai = async (azione: AzioneVista, ancheDalDrive: boolean): Promise<EsitoAzioni> => {
    if (azione === 'chiudi' && onChiudi !== undefined) {
      onChiudi()
      return { azione, esiti: [{ sessione, ok: true }], fatte: 1, rifiutate: 0, messaggio: '1 chat chiusa.' }
    }
    return window.gestore.chatGestione.azione({ azione, sessioni: [sessione], ancheDalDrive })
  }

  return (
    <span className={`gc-azioni${classe !== undefined ? ` ${classe}` : ''}`} ref={dove}>
      <button
        className="comando-riquadro"
        aria-expanded={menu}
        aria-label={`Chiudi, archivia o elimina ${titolo}`}
        title="Chiudi, Archivia, Elimina dal PC"
        onClick={(e) => { e.stopPropagation(); setMenu((m) => !m) }}
      >
        🗂
      </button>
      {menu ? (
        <span className="gc-menu" role="menu" onMouseDown={(e) => e.stopPropagation()}>
          {(['chiudi', 'archivia', 'elimina'] as const).map((a) => {
            const no = a === 'elimina' ? misura?.motivo : a === 'chiudi' ? misura?.chiusa : undefined
            return (
            <span className="gc-menu__voce" key={a}>
              <button
                role="menuitem"
                className={a === 'elimina' ? 'tasto tasto--mini tasto--pericolo' : 'tasto tasto--mini'}
                disabled={(a === 'chiudi' && aperta === false) || no !== undefined}
                onClick={() => chiedi(a)}
              >
                {TESTI_AZIONI_CHAT[a].etichetta}
              </button>
              <span className="misura gc-menu__breve">{no !== undefined ? <span className="gc-voce__no">{no}</span> : TESTI_AZIONI_CHAT[a].breve}</span>
              <Aiuto di={TESTI_AZIONI_CHAT[a].etichetta}>{TESTI_AZIONI_CHAT[a].spiega}</Aiuto>
            </span>
            )
          })}
        </span>
      ) : null}
      {scelta !== undefined ? (
        <ConfermaAzioneChat azione={scelta.azione} conferma={scelta.conferma} onFai={(d) => fai(scelta.azione, d)} onChiudi={() => setSceltaQui(undefined)} />
      ) : null}
    </span>
  )
}
