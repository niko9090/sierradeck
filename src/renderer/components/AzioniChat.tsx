import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TESTI_AZIONI_CHAT, type EsitoAzioni } from '@shared/gestione-chat'
import { confermaArchiviaChat, confermaChiudiChat, confermaEliminaChat, nomeScelte, rifiutiDi, type Conferma, type Rifiuto } from '@shared/gestione-chat-vista'
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
                <Aiuto di="anche dal Drive">Toglie anche la copia che questa chat ha sul Drive. Non sparisce subito: va nel recupero del Drive per 30 giorni, e torna con «Ripristina». Senza la spunta la copia sul Drive resta, e gli altri PC la vedono ancora.</Aiuto>
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
  const [scelta, setScelta] = useState<{ azione: AzioneVista; conferma: (ancheDalDrive: boolean) => Conferma } | undefined>(undefined)
  const dove = useRef<HTMLSpanElement>(null)
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
    window.gestore.chatGestione.selezione([sessione])
      .then((s) => setScelta({ azione, conferma: (d) => confermaEliminaChat(nome, byteLeggibili(s.byte), d) }))
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
          {(['chiudi', 'archivia', 'elimina'] as const).map((a) => (
            <span className="gc-menu__voce" key={a}>
              <button
                role="menuitem"
                className={a === 'elimina' ? 'tasto tasto--mini tasto--pericolo' : 'tasto tasto--mini'}
                disabled={a === 'chiudi' && aperta === false}
                onClick={() => chiedi(a)}
              >
                {TESTI_AZIONI_CHAT[a].etichetta}
              </button>
              <span className="misura gc-menu__breve">{TESTI_AZIONI_CHAT[a].breve}</span>
              <Aiuto di={TESTI_AZIONI_CHAT[a].etichetta}>{TESTI_AZIONI_CHAT[a].spiega}</Aiuto>
            </span>
          ))}
        </span>
      ) : null}
      {scelta !== undefined ? (
        <ConfermaAzioneChat azione={scelta.azione} conferma={scelta.conferma} onFai={(d) => fai(scelta.azione, d)} onChiudi={() => setScelta(undefined)} />
      ) : null}
    </span>
  )
}
