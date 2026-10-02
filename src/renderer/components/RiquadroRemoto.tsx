import { useEffect, useRef, useState } from 'react'
import { ansiInHtml } from '@shared/ansi-html'
import { pcVivo } from '@shared/posta'
import {
  trovaChatRemota, descriviIndirizzo, descriviSilenzio, RILEGGI_REMOTO_OGNI_MS, RIGHE_REMOTE,
  type ChatRemota, type ChatSuPc, type PcRemoto, type StoriaRemota
} from '@shared/pc-remoto'
import { etichettaStrada, type InfoStrada } from '@shared/strada-pc'
import { ModalePosta } from './ModalePosta'
import { useLayoutStore } from '../state/layout'

type Props = {
  paneId: string
  remoto: ChatRemota
  title: string
}

/**
 * Dove sta il riquadro adesso, verso quella chat:
 * - `cerco`: sto chiedendo a quel PC quali chat ha aperte;
 * - `viva`: la chat e' aperta la', e ne leggo lo schermo ogni due secondi;
 * - `non-aperta`: quel PC risponde, ma questa chat non e' fra le sue aperte;
 * - `errore`: quel PC non risponde, o rifiuta — con il perche'.
 */
type Fase =
  | { tipo: 'cerco' }
  | { tipo: 'viva'; chat: ChatSuPc }
  | { tipo: 'non-aperta'; altre: ChatSuPc[] }
  | { tipo: 'errore'; motivo: string; messaggio: string }

/** Ogni quanto si rilegge il battito di quel PC (acceso/spento, indirizzo buono). */
const RILEGGI_PC_OGNI_MS = 15_000

function quando(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Una chat di un altro PC, **dal vivo**.
 *
 * Nicholas (2026-09-22): «possiamo lavorare su chat di altri pc come se
 * fossimo in remoto a comandare quel computer». Il riquadro non apre nessun
 * claude.exe qui: bussa al Client di quel PC (la stessa porta e le stesse
 * rotte del telefono), legge lo schermo della chat, e quello che scrivi
 * arriva nel terminale la'. Se quel PC e' spento resta la cassetta: si scrive
 * un'azione e la esegue lui quando torna acceso.
 */
export function RiquadroRemoto({ paneId, remoto, title }: Props): React.JSX.Element {
  const [pc, setPc] = useState<PcRemoto | undefined>(undefined)
  const [cassaforteAperta, setCassaforteAperta] = useState(true)
  const [driveCollegato, setDriveCollegato] = useState(true)
  const [fase, setFase] = useState<Fase>({ tipo: 'cerco' })
  const [storia, setStoria] = useState<StoriaRemota | undefined>(undefined)
  const [testo, setTesto] = useState('')
  const [invio, setInvio] = useState(false)
  const [avviso, setAvviso] = useState<string | undefined>(undefined)
  const [postaAperta, setPostaAperta] = useState(false)
  /** La strada con cui arriva quel PC (0.40.0): rete di casa, Tailscale, WebRTC o Drive. */
  const [strada, setStrada] = useState<InfoStrada | undefined>(undefined)
  /**
   * Quel PC non risponde piu' (0.36.1): da quando, perche', e l'ultimo
   * tentativo. Il riquadro non cade in un errore secco: tiene l'ultimo schermo
   * arrivato, dice lo stato e riprova da solo a ogni giro.
   */
  const [silenzio, setSilenzio] = useState<{ da: number; ora: number; motivo: string; messaggio: string } | undefined>(undefined)
  const taci = (motivo: string, messaggio: string): void =>
    setSilenzio((s) => ({ da: s?.da ?? Date.now(), ora: Date.now(), motivo, messaggio }))
  const schermo = useRef<HTMLDivElement>(null)
  const inGiro = useRef(false)
  const faseRef = useRef<Fase>(fase)
  faseRef.current = fase
  const rendiRemoto = useLayoutStore((s) => s.rendiRemoto)

  // Il battito di quel PC: acceso o spento, e da quale indirizzo risponde.
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      // Con il suo id: il Core bussa anche direttamente a quel PC (0.39.3),
      // cosi' un battito vecchio non lo fa sembrare spento.
      void window.gestore.remoto.pc(remoto.pcId).then((r) => {
        if (!vivo) return
        setCassaforteAperta(r.cassaforteAperta)
        setDriveCollegato(r.driveCollegato !== false)
        const questo = r.pc.find((b) => b.pcId === remoto.pcId)
        setPc(questo)
        if (questo?.strada !== undefined) setStrada(questo.strada)
      }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, RILEGGI_PC_OGNI_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [remoto.pcId])

  // Il giro: trova la chat la', poi leggine lo schermo ogni due secondi.
  useEffect(() => {
    let vivo = true
    const giro = async (): Promise<void> => {
      if (inGiro.current) return
      inGiro.current = true
      try {
        const f = faseRef.current
        if (f.tipo !== 'viva') {
          const s = await window.gestore.remoto.stato(remoto.pcId)
          if (!vivo) return
          if (s.strada !== undefined) setStrada(s.strada)
          if (!s.ok) { taci(s.motivo, s.messaggio); setFase({ tipo: 'errore', motivo: s.motivo, messaggio: s.messaggio }); return }
          setSilenzio(undefined)
          const trovata = trovaChatRemota(s.dati.chat, remoto)
          if (trovata === undefined) { setFase({ tipo: 'non-aperta', altre: s.dati.chat }); return }
          setFase({ tipo: 'viva', chat: trovata })
          setAvviso(undefined)
          return
        }
        const r = await window.gestore.remoto.storia(remoto.pcId, f.chat.id, -1, RIGHE_REMOTE)
        if (!vivo) return
        if (r.strada !== undefined) setStrada(r.strada)
        if (!r.ok) {
          // La chat e' stata chiusa la', o quel PC e' sparito: si ricomincia a cercare.
          if (r.motivo === 'chat') { setFase({ tipo: 'cerco' }); setStoria(undefined); return }
          // Quel PC ha smesso di rispondere a meta': si resta sulla chat, con
          // l'ultimo schermo arrivato, e al prossimo giro si riprova.
          taci(r.motivo, r.messaggio)
          return
        }
        setSilenzio(undefined)
        const el = schermo.current
        const inFondo = el === null || el.scrollTop + el.clientHeight >= el.scrollHeight - 12
        setStoria(r.dati)
        if (inFondo) requestAnimationFrame(() => { const e = schermo.current; if (e !== null) e.scrollTop = e.scrollHeight })
      } finally {
        inGiro.current = false
      }
    }
    void giro()
    const t = setInterval(() => { void giro() }, RILEGGI_REMOTO_OGNI_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [remoto.pcId, remoto.cwd, remoto.sessione])

  const chatId = fase.tipo === 'viva' ? fase.chat.id : undefined
  const vivo = pc !== undefined && (pc.stato?.stato === 'acceso' || pcVivo({ ...pc, chat: pc.chat, cartelle: pc.cartelle }, Date.now()))

  const manda = (): void => {
    const t = testo.trim()
    if (t === '' || chatId === undefined || invio) return
    setInvio(true)
    void window.gestore.remoto.scrivi(remoto.pcId, chatId, t).then((r) => {
      if (r.ok && (r.dati as { viaDrive?: boolean } | undefined)?.viaDrive === true) {
        setTesto('')
        setAvviso(`Messaggio lasciato nella cassetta di ${remoto.pcNome} sul Drive: lo consegna lui a questa chat al suo prossimo giro (dieci-trenta secondi), appena la chat aspetta. Lo vedi comparire qui sopra con lo schermo successivo.`)
      } else if (r.ok) { setTesto(''); setAvviso(undefined) }
      else setAvviso(r.messaggio)
    }).catch((e: unknown) => setAvviso(String(e))).finally(() => setInvio(false))
  }
  const scegli = (opzione: string): void => {
    if (chatId === undefined || invio) return
    setInvio(true)
    void window.gestore.remoto.scegli(remoto.pcId, chatId, opzione).then((r) => {
      if (r.ok) setAvviso(undefined)
      else setAvviso(r.stato === 409 ? `Non l’ho premuta: ${r.messaggio}. Lo schermo qui sotto si aggiorna da solo, riguarda le opzioni.` : r.messaggio)
    }).catch((e: unknown) => setAvviso(String(e))).finally(() => setInvio(false))
  }
  const riprendiLa = (): void => {
    if (remoto.sessione === undefined) return
    setInvio(true)
    void window.gestore.remoto.riprendi(remoto.pcId, remoto.cwd, remoto.sessione).then((r) => {
      if (r.ok) { setAvviso(`Chiesto a ${remoto.pcNome} di riaprire la chat: fra qualche secondo compare qui.`); setFase({ tipo: 'cerco' }) }
      else setAvviso(r.messaggio)
    }).catch((e: unknown) => setAvviso(String(e))).finally(() => setInvio(false))
  }
  const riprova = (): void => { setFase({ tipo: 'cerco' }); setAvviso(undefined) }
  const statoSilenzio = silenzio === undefined ? undefined : descriviSilenzio(silenzio.motivo, remoto.pcNome, silenzio.ora - silenzio.da)
  const guardaAltra = (c: ChatSuPc): void => {
    rendiRemoto(paneId, { pcId: remoto.pcId, pcNome: remoto.pcNome, cwd: c.cwd, ...(c.sessione !== undefined ? { sessione: c.sessione } : {}) })
    setFase({ tipo: 'cerco' })
    setStoria(undefined)
  }

  const html = storia === undefined ? '' : ansiInHtml(storia.grezze.join('\n'))
  const via = etichettaStrada(strada, remoto.pcNome)
  const lento = via?.lento === true
  // Via Drive le opzioni non si premono (0.40.0): si legge e si manda un messaggio.
  const scelte = lento ? undefined : storia?.scelte

  return (
    <div className="remoto">
      <div className="remoto__testa">
        <span className="remoto__pc">
          Dal vivo su <strong>{remoto.pcNome}</strong>
          {fase.tipo === 'viva' ? <> · <span title={fase.chat.cwd}>{fase.chat.titolo}</span></> : null}
        </span>
        <span className="remoto__stato">
          {pc === undefined
            ? 'leggo il Drive…'
            : vivo || via !== undefined
              ? `acceso${via !== undefined ? '' : pc.buono !== undefined ? ` · risponde su ${descriviIndirizzo(pc.buono)}` : ''}`
              : pc.stato !== undefined
                ? pc.stato.titolo
                : `non so se è acceso · ultimo segno sul Drive ${quando(pc.battito)}`}
          {fase.tipo === 'viva' && fase.chat.aspetta === true ? <span className="remoto__aspetta"> · aspetta te</span> : null}
        </span>
        {/* La strada usata, sempre in vista (0.40.0). */}
        {via !== undefined ? (
          <span className={lento ? 'remoto__strada remoto__strada--lenta' : 'remoto__strada'} title={via.testo}>{via.breve}</span>
        ) : null}
      </div>
      {lento ? (
        <div className="remoto__lento" role="status">
          <strong>Collegamento lento via Drive.</strong> {via?.testo}
          {storia?.scritto !== undefined ? ` Schermo scritto da ${remoto.pcNome} alle ${new Date(storia.scritto).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.` : ''}
          {' '}Appena una strada diretta torna a rispondere, il riquadro ci passa da solo.
        </div>
      ) : null}

      {fase.tipo === 'viva' || storia !== undefined ? (
        <div className="remoto__schermo" ref={schermo} dangerouslySetInnerHTML={{ __html: html === '' ? '<span class="remoto__vuoto">Leggo lo schermo di quella chat…</span>' : html }} />
      ) : null}

      {fase.tipo === 'cerco' && storia === undefined ? (
        <div className="remoto__attesa">Chiedo a {remoto.pcNome} quali chat ha aperte…</div>
      ) : null}

      {fase.tipo === 'non-aperta' ? (
        <div className="remoto__avviso">
          <div className="remoto__avviso-titolo">Su {remoto.pcNome} questa chat non è aperta adesso</div>
          <div className="remoto__avviso-testo">
            Quel PC risponde, ma fra le sue chat aperte non c’è {remoto.sessione !== undefined ? 'questa conversazione' : `nessuna chat nella cartella ${remoto.cwd}`}.
            {remoto.sessione !== undefined ? ' Puoi chiedergli di riaprirla: la riprende là, nella sua cartella, e da qui la vedi dal vivo.' : ''}
            {' '}Oppure lasciagli un’azione nella cassetta: la esegue lui, quando vuole.
          </div>
          <div className="remoto__azioni">
            {remoto.sessione !== undefined ? (
              <button className="tasto tasto--primario" disabled={invio} onClick={riprendiLa} title={`Dice a ${remoto.pcNome} di riaprire la conversazione con --resume, nella sua cartella`}>
                Riprendila là, su {remoto.pcNome}
              </button>
            ) : null}
            <button className="tasto" onClick={() => setPostaAperta(true)} title="Scrive nella cassetta di quel PC: la esegue lui in una sua chat, quando è acceso">Scrivile nella cassetta</button>
            <button className="tasto" onClick={riprova}>Ricontrolla</button>
          </div>
          {fase.altre.length > 0 ? (
            <div className="remoto__altre">
              <div className="remoto__avviso-testo">Chat aperte là adesso: puoi guardarne un’altra da questo stesso riquadro.</div>
              <ul>
                {fase.altre.map((c) => (
                  <li key={c.id}>
                    <button className="tasto tasto--mini" onClick={() => guardaAltra(c)} title={c.cwd}>Guarda «{c.titolo}»{c.aspetta === true ? ' · aspetta' : ''}</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {fase.tipo === 'errore' ? (
        <div className="remoto__avviso">
          <div className="remoto__avviso-titolo">
            {statoSilenzio?.titolo ?? descriviSilenzio(fase.motivo, remoto.pcNome, 0).titolo}
          </div>
          <div className="remoto__avviso-testo">{fase.messaggio}</div>
          <div className="remoto__azioni">
            {driveCollegato && (fase.motivo === 'spento' || fase.motivo === 'non-so' || fase.motivo === 'irraggiungibile') ? (
              <button className="tasto tasto--primario" onClick={() => setPostaAperta(true)} title="Scrive nella cassetta di quel PC sul Drive: la esegue lui, in questa chat, quando torna acceso">
                Scrivile nella cassetta, la fa quando torna
              </button>
            ) : null}
            <button className="tasto" onClick={riprova}>Riprova adesso</button>
          </div>
          <div className="remoto__nota">
            Il riquadro riprova da solo ogni {Math.round(RILEGGI_REMOTO_OGNI_MS / 1000)} secondi, in quest’ordine: la rete di casa, Tailscale (anche gli indirizzi che dà adesso), un collegamento diretto via Internet (WebRTC, aperto con uno scambio cifrato sul Drive) e infine il Drive, lento, solo per leggere e mandare un messaggio.
            {driveCollegato
              ? ' La conversazione la trovi anche nella copia sul Drive (Account → Drive), in sola lettura, aggiornata all’ultimo salvataggio di quel PC.'
              : ' Il Drive di questo PC è scollegato: niente copia da leggere e niente cassetta finché non lo ricolleghi (Account → Drive → Collega).'}
          </div>
        </div>
      ) : null}

      {fase.tipo === 'viva' && statoSilenzio !== undefined ? (
        <div className="remoto__esito" role="status">
          <strong>{statoSilenzio.titolo}.</strong>{' '}
          {statoSilenzio.breve
            ? 'Può essere un attimo di rete o una sospensione breve.'
            : `${(silenzio?.messaggio ?? '').replace(/\.\s*$/, '')}.`}
          {' '}Quello che vedi qui sopra è l’ultimo schermo arrivato; ogni {Math.round(RILEGGI_REMOTO_OGNI_MS / 1000)} secondi
          ribusso e, appena {remoto.pcNome} risponde, riprende da solo. Intanto non si può scrivere: il testo non arriverebbe.
          La chat là non viene toccata.
        </div>
      ) : null}

      {avviso !== undefined ? <div className="remoto__esito">{avviso}</div> : null}

      {scelte !== undefined && chatId !== undefined ? (
        <div className="remoto__scelte">
          <div className="remoto__scelte-titolo">La chat aspetta una scelta: tocca l’opzione, la premo là per te.</div>
          {scelte.opzioni.map((o) => (
            <button key={`${o.numero}-${o.testo}`} className={o.scelta ? 'tasto tasto--primario' : 'tasto'} disabled={invio} onClick={() => scegli(o.testo)}>
              {o.numero}. {o.testo}
            </button>
          ))}
        </div>
      ) : null}

      {/* Su quale PC si scrive, sempre sopra la casella (0.39.3). */}
      <div className="remoto__dove">Stai scrivendo su {remoto.pcNome}: quello che mandi arriva nel terminale di quel PC, non qui.</div>
      <div className="remoto__barra">
        <textarea
          className="campo remoto__campo"
          rows={2}
          value={testo}
          disabled={chatId === undefined || silenzio !== undefined}
          placeholder={chatId === undefined ? `Quando la chat è viva su ${remoto.pcNome}, qui le scrivi.` : lento ? `Via Drive: il messaggio arriva a ${remoto.pcNome} al suo prossimo giro — Invio manda` : `Scrivi a questa chat su ${remoto.pcNome} — Invio manda, Maiusc+Invio va a capo`}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); manda() } }}
        />
        <button className="tasto tasto--primario" disabled={chatId === undefined || silenzio !== undefined || invio || testo.trim() === ''} onClick={manda} title="Manda il testo e Invio nel terminale di quella chat, su quel PC">
          Manda
        </button>
      </div>
      <div className="remoto__nota">
        Niente gira qui: la chat lavora su {remoto.pcNome}, con i suoi file. Quello che vedi è il suo terminale, riletto ogni {Math.round(RILEGGI_REMOTO_OGNI_MS / 1000)} secondi; quello che scrivi arriva là come se lo digitassi su quella tastiera. Chiudere questo riquadro non chiude la chat là.
        {!cassaforteAperta ? ' La cassaforte di qui è chiusa: senza, non ho la chiave per bussare a quel PC (Account → Cassaforte).' : ''}
      </div>
      {postaAperta && pc !== undefined ? (
        <ModalePosta
          pc={{ pcId: pc.pcId, nome: pc.nome, versione: pc.versione, battito: pc.battito, cartelle: pc.cartelle, chat: pc.chat }}
          vivo={vivo}
          presel={{ cwd: remoto.cwd, ...(remoto.sessione !== undefined ? { sessione: remoto.sessione } : {}) }}
          onChiudi={() => setPostaAperta(false)}
        />
      ) : null}
      {postaAperta && pc === undefined ? (
        <ModalePosta
          pc={{ pcId: remoto.pcId, nome: remoto.pcNome, versione: '', battito: '', cartelle: [remoto.cwd], chat: [] }}
          vivo={false}
          presel={{ cwd: remoto.cwd, ...(remoto.sessione !== undefined ? { sessione: remoto.sessione } : {}) }}
          onChiudi={() => setPostaAperta(false)}
        />
      ) : null}
      <span className="remoto__titolo-nascosto" hidden>{title}</span>
    </div>
  )
}
