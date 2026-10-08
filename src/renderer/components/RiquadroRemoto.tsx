import { useEffect, useRef, useState } from 'react'
import { useNomePc } from '../state/nomi-pc'
import { ansiInHtml } from '@shared/ansi-html'
import { pcVivo } from '@shared/posta'
import {
  trovaChatRemota, descriviIndirizzo, descriviSilenzio, RILEGGI_REMOTO_OGNI_MS, RIGHE_REMOTE,
  type ChatRemota, type ChatSuPc, type PcRemoto, type StoriaRemota
} from '@shared/pc-remoto'
import { etichettaStrada, type InfoStrada } from '@shared/strada-pc'
import {
  accoda, CAMBIO_VISIBILE_MS, consegnato, eOra, erroreDiStrada, inInvio, KEEPALIVE_SCADE_MS, LINEA_NUOVA, nonPartito, passo,
  prossimoDaMandare, type EventoLinea, type Linea, type VoceCoda
} from '@shared/collegamento'
import type { EsitoRemoto } from '@shared/pc-remoto'
import { CodaInvii, FasciaLinea, IndicatoreLinea, nuovoIdMessaggio, SchermoCollegamento, useAdesso } from './LineaRemota'
import { eventiDaLinea, passiCollegamento, passiDettagliati } from '@shared/collegamento'
import { ModalePosta } from './ModalePosta'
import { CoperturaPin } from './ChatConPin'
import { useLayoutStore } from '../state/layout'
import { pubblicaLinea } from '../linee-remote'
import { ConfermaPortaQui, useCasa } from './OspiteChat'
import { EtichettaOpzione } from './EtichettaOpzione'

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
  /** Il nome di adesso di quel PC (0.52.4): quello scelto, con l'hostname a parte. */
  const nomeVivo = useNomePc(remoto.pcId, remoto.pcNome)
  const nomePc = nomeVivo.nome
  const [pc, setPc] = useState<PcRemoto | undefined>(undefined)
  const [cassaforteAperta, setCassaforteAperta] = useState(true)
  const [driveCollegato, setDriveCollegato] = useState(true)
  const [fase, setFase] = useState<Fase>({ tipo: 'cerco' })
  const [storia, setStoria] = useState<StoriaRemota | undefined>(undefined)
  const [testo, setTesto] = useState('')
  const [invio, setInvio] = useState(false)
  const [avviso, setAvviso] = useState<string | undefined>(undefined)
  /** La chat là è protetta dal PIN e non è aperta per questo PC (0.49.0). */
  const [chiusaPin, setChiusaPin] = useState(false)
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
  /**
   * Il collegamento (0.51.0): la macchina degli stati di `@shared/collegamento`.
   * Ogni chiamata la fa avanzare (riuscita: ritardo e strada; caduta: il
   * prossimo tentativo con attesa crescente). Il giro chiede a quel PC ogni
   * due secondi anche solo per sapere che c'è (keepalive), con un tempo
   * massimo: oltre, la strada è caduta.
   */
  const [linea, setLinea] = useState<Linea>(LINEA_NUOVA)
  const lineaRef = useRef<Linea>(linea)
  const ultimaIl = useRef(0)
  /** Quello che scrivi, in coda finché non è arrivato (0.51.0): mai due volte. */
  const [coda, setCoda] = useState<VoceCoda[]>([])
  const avanza = (e: EventoLinea): void => { const n = passo(lineaRef.current, e); lineaRef.current = n; setLinea(n) }
  // La testata del riquadro mostra lo stesso indicatore, accanto a «SU <PC>» (0.52.0).
  useEffect(() => { pubblicaLinea(paneId, linea) }, [paneId, linea])
  useEffect(() => () => pubblicaLinea(paneId, undefined), [paneId])
  /**
   * L'ospite non risponde (0.52.0): la chat ha casa là, e qui non parte da
   * sola. «Porta qui la chat» cambia la casa, con la conferma, e il riquadro
   * torna una chat di qui.
   */
  const casa = useCasa(remoto.sessione)
  const nomeCasa = useNomePc(casa?.pc, casa?.pcNome ?? '').nome
  /**
   * «Mi collego a NOME-PC…» (0.52.1): al cambio di PC (un riquadro che
   * diventa remoto, un workspace con chat di altri PC) i tentativi si vedono
   * finché il primo collegamento non riesce, e per due secondi e mezzo dopo.
   */
  const inizioRef = useRef(Date.now())
  const vistaTent = passiCollegamento(nomePc, eventiDaLinea(linea, inizioRef.current))
  const [tentVisibili, setTentVisibili] = useState(true)
  /** «Annulla» chiude lo schermo pieno; torna da sé se la linea ricade prima del primo collegamento. */
  const [tentChiusi, setTentChiusi] = useState(false)
  const orologioTent = useAdesso(tentVisibili && !tentChiusi)
  useEffect(() => {
    if (vistaTent.fase !== 'collegato') { setTentVisibili(true); return }
    const t = setTimeout(() => setTentVisibili(false), 2500)
    return () => clearTimeout(t)
  }, [vistaTent.fase])
  const [portaQui, setPortaQui] = useState(false)
  const adesso = useAdesso(linea.fase === 'ricollego' || (linea.cambio !== undefined && Date.now() - linea.cambio.il < CAMBIO_VISIBILE_MS + 1000))
  /** Una chiamata a quel PC, misurata: fa avanzare il collegamento. */
  const chiedi = async <T,>(f: () => Promise<EsitoRemoto<T>>): Promise<EsitoRemoto<T>> => {
    const t0 = performance.now()
    // Via Drive le risposte arrivano in decine di secondi: lì il tempo massimo è lungo.
    const tetto = lineaRef.current.strada === 'drive' ? 90_000 : KEEPALIVE_SCADE_MS
    const r = await Promise.race([
      f(),
      new Promise<EsitoRemoto<T>>((ok) => setTimeout(() => ok({ ok: false, motivo: 'irraggiungibile', messaggio: `${nomePc} non ha risposto in ${Math.round(tetto / 1000)} secondi` }), tetto))
    ])
    const ritardoMs = performance.now() - t0
    if (r.ok) avanza({ tipo: 'ok', il: Date.now(), ritardoMs, ...(r.strada !== undefined ? { strada: r.strada.strada } : {}) })
    else if (erroreDiStrada(r.motivo)) avanza({ tipo: 'errore', il: Date.now(), motivo: r.motivo, messaggio: r.messaggio, ...(r.strada !== undefined ? { strada: r.strada.strada } : {}) })
    return r
  }

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
      ultimaIl.current = Date.now()
      try {
        const f = faseRef.current
        if (f.tipo !== 'viva') {
          const s = await chiedi(() => window.gestore.remoto.stato(remoto.pcId))
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
        // Lo schermo di adesso: al ritorno dopo una caduta è questo a rimetterlo al punto giusto.
        const r = await chiedi(() => window.gestore.remoto.storia(remoto.pcId, f.chat.id, -1, RIGHE_REMOTE))
        if (!vivo) return
        if (r.strada !== undefined) setStrada(r.strada)
        if (!r.ok) {
          // Protetta dal PIN là (0.49.0): niente schermo, la copertura con il lucchetto.
          if (r.motivo === 'pin') { setChiusaPin(true); setStoria(undefined); setSilenzio(undefined); return }
          // La chat e' stata chiusa la', o quel PC e' sparito: si ricomincia a cercare.
          if (r.motivo === 'chat') { setFase({ tipo: 'cerco' }); setStoria(undefined); return }
          // Quel PC ha smesso di rispondere a meta': si resta sulla chat, con
          // l'ultimo schermo arrivato, e al prossimo giro si riprova.
          taci(r.motivo, r.messaggio)
          return
        }
        setSilenzio(undefined)
        setChiusaPin(false)
        const el = schermo.current
        const inFondo = el === null || el.scrollTop + el.clientHeight >= el.scrollHeight - 12
        setStoria(r.dati)
        if (inFondo) requestAnimationFrame(() => { const e = schermo.current; if (e !== null) e.scrollTop = e.scrollHeight })
      } finally {
        inGiro.current = false
      }
    }
    void giro()
    // Il ritmo lo decide il collegamento: ogni due secondi da collegati, con le attese crescenti da caduti.
    const t = setInterval(() => { if (eOra(lineaRef.current, ultimaIl.current, Date.now())) void giro() }, 250)
    return () => { vivo = false; clearInterval(t) }
  }, [remoto.pcId, remoto.cwd, remoto.sessione])

  const chatId = fase.tipo === 'viva' ? fase.chat.id : undefined
  const vivo = pc !== undefined && (pc.stato?.stato === 'acceso' || pcVivo({ ...pc, chat: pc.chat, cartelle: pc.cartelle }, Date.now()))

  /**
   * Scrivere (0.51.0): il testo entra in coda con il suo id e parte appena la
   * linea è su — subito, se lo è già. Se cade a metà torna in attesa con lo
   * stesso id: quel PC lo riconosce e non lo scrive due volte.
   */
  const manda = (): void => {
    const t = testo.trim()
    if (t === '' || chatId === undefined) return
    setCoda((c) => accoda(c, { id: nuovoIdMessaggio(), testo: t, il: Date.now() }))
    setTesto('')
  }
  useEffect(() => {
    if (linea.fase !== 'collegato' || chatId === undefined) return
    const v = prossimoDaMandare(coda)
    if (v === undefined) return
    setCoda((c) => inInvio(c, v.id))
    void chiedi(() => window.gestore.remoto.scrivi(remoto.pcId, chatId, v.testo, v.id)).then((r) => {
      if (r.ok) {
        setCoda((c) => consegnato(c, v.id))
        setAvviso((r.dati as { viaDrive?: boolean } | undefined)?.viaDrive === true
          ? `Messaggio lasciato nella cassetta di ${nomePc} sul Drive: lo consegna lui a questa chat al suo prossimo giro (dieci-trenta secondi), appena la chat aspetta. Lo vedi comparire qui sopra con lo schermo successivo.`
          : undefined)
      } else if (erroreDiStrada(r.motivo)) {
        setCoda((c) => nonPartito(c, v.id))
      } else {
        // Un rifiuto vero (il PIN, la chat chiusa là): non si riprova, si dice.
        setCoda((c) => consegnato(c, v.id))
        if (r.motivo === 'pin') setChiusaPin(true)
        setTesto((x) => (x === '' ? v.testo : x))
        setAvviso(`Non mandato: ${r.messaggio}`)
      }
    }).catch(() => setCoda((c) => nonPartito(c, v.id)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea.fase, coda, chatId])
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
      if (r.ok) { setAvviso(`Chiesto a ${nomePc} di riaprire la chat: fra qualche secondo compare qui.`); setFase({ tipo: 'cerco' }) }
      else setAvviso(r.messaggio)
    }).catch((e: unknown) => setAvviso(String(e))).finally(() => setInvio(false))
  }
  const riprova = (): void => { setFase({ tipo: 'cerco' }); setAvviso(undefined); avanza({ tipo: 'riprova-adesso', il: Date.now() }) }
  const statoSilenzio = silenzio === undefined ? undefined : descriviSilenzio(silenzio.motivo, nomePc, silenzio.ora - silenzio.da)
  const guardaAltra = (c: ChatSuPc): void => {
    rendiRemoto(paneId, { pcId: remoto.pcId, pcNome: nomePc, cwd: c.cwd, ...(c.sessione !== undefined ? { sessione: c.sessione } : {}) })
    setFase({ tipo: 'cerco' })
    setStoria(undefined)
  }

  const html = storia === undefined ? '' : ansiInHtml(storia.grezze.join('\n'))
  const via = etichettaStrada(strada, nomePc)
  const lento = via?.lento === true
  // Via Drive le opzioni non si premono (0.40.0): si legge e si manda un messaggio.
  const scelte = lento ? undefined : storia?.scelte

  return (
    <div className="remoto">
      <div className="remoto__testa">
        <span className="remoto__pc">
          Dal vivo su <strong>{nomePc}</strong>
          {nomeVivo.host !== undefined ? <small className="nome-pc__host" title="Il nome tecnico della macchina (hostname)"> {nomeVivo.host}</small> : null}
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
        {/* La strada, la qualità e il ritardo; toccando, la storia (0.51.0). */}
        <IndicatoreLinea linea={linea} nomePc={nomePc} />
      </div>
      {/* Il collegamento a schermo pieno nel riquadro, passo per passo (0.52.3). */}
      {tentVisibili && !tentChiusi ? (
        <SchermoCollegamento
          nomePc={nomePc}
          passi={passiDettagliati({
            nomePc: nomePc, linea, inizio: inizioRef.current, adesso: orologioTent,
            ...(pc?.indirizzi !== undefined ? { indirizzi: pc.indirizzi } : {}),
            ...(pc?.strada?.indirizzo !== undefined ? { indirizzoBuono: pc.strada.indirizzo } : pc?.buono !== undefined ? { indirizzoBuono: pc.buono } : {})
          })}
          inizio={inizioRef.current}
          adesso={orologioTent}
          {...(pc?.versione !== undefined && pc.versione !== '' ? { versione: pc.versione } : {})}
          {...(pc?.battito !== undefined && pc.battito !== '' ? { ultimoSegno: `battito sul Drive ${quando(pc.battito)}` } : {})}
          onRiprova={riprova}
          onChiudi={() => setTentChiusi(true)}
        />
      ) : null}
      <FasciaLinea linea={linea} nomePc={nomePc} adesso={adesso} onRiprova={riprova} />
      {linea.fase === 'ricollego' && remoto.sessione !== undefined && casa !== undefined && !casa.qui ? (
        <div className="remoto__ospite" role="status">
          <span>
            Questa chat è <b>ospitata da {nomeCasa}</b>: qui non parte da sola, si guarda dal vivo. Adesso {nomePc} non
            risponde: non so se è acceso. Puoi aspettare (riprovo da solo) o portarla qui.
          </span>
          <button type="button" className="tasto tasto--mini" onClick={() => setPortaQui(true)} title="Cambia la casa della chat: diventa questo PC, dopo la conferma">Porta qui la chat</button>
        </div>
      ) : null}
      {portaQui && remoto.sessione !== undefined ? (
        <ConfermaPortaQui
          titolo={title}
          pcNome={nomePc}
          sessione={remoto.sessione}
          onAnnulla={() => setPortaQui(false)}
          onFatto={() => { setPortaQui(false); useLayoutStore.getState().rendiLocale(paneId) }}
        />
      ) : null}
      {lento ? (
        <div className="remoto__lento" role="status">
          <strong>Collegamento lento via Drive.</strong> {via?.testo}
          {storia?.scritto !== undefined ? ` Schermo scritto da ${nomePc} alle ${new Date(storia.scritto).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.` : ''}
          {' '}Appena una strada diretta torna a rispondere, il riquadro ci passa da solo.
        </div>
      ) : null}

      {chiusaPin && fase.tipo === 'viva' ? (
        <CoperturaPin
          titolo={fase.chat.titolo}
          onSblocca={async (p) => {
            const r = await window.gestore.remoto.pin(remoto.pcId, fase.chat.id, p)
            if (r.ok) { setChiusaPin(false); return { ok: true } }
            return { ok: false, errore: r.messaggio }
          }}
        />
      ) : null}

      {!chiusaPin && (fase.tipo === 'viva' || storia !== undefined) ? (
        <div className={linea.fase === 'ricollego' ? 'remoto__schermo remoto__schermo--giu' : 'remoto__schermo'} ref={schermo} dangerouslySetInnerHTML={{ __html: html === '' ? '<span class="remoto__vuoto">Leggo lo schermo di quella chat…</span>' : html }} />
      ) : null}

      {fase.tipo === 'cerco' && storia === undefined ? (
        <div className="remoto__attesa">Chiedo a {nomePc} quali chat ha aperte…</div>
      ) : null}

      {fase.tipo === 'non-aperta' ? (
        <div className="remoto__avviso">
          <div className="remoto__avviso-titolo">Su {nomePc} questa chat non è aperta adesso</div>
          <div className="remoto__avviso-testo">
            Quel PC risponde, ma fra le sue chat aperte non c’è {remoto.sessione !== undefined ? 'questa conversazione' : `nessuna chat nella cartella ${remoto.cwd}`}.
            {remoto.sessione !== undefined ? ' Puoi chiedergli di riaprirla: la riprende là, nella sua cartella, e da qui la vedi dal vivo.' : ''}
            {' '}Oppure lasciagli un’azione nella cassetta: la esegue lui, quando vuole.
          </div>
          <div className="remoto__azioni">
            {remoto.sessione !== undefined ? (
              <button className="tasto tasto--primario" disabled={invio} onClick={riprendiLa} title={`Dice a ${nomePc} di riaprire la conversazione con --resume, nella sua cartella`}>
                Riprendila là, su {nomePc}
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
            {statoSilenzio?.titolo ?? descriviSilenzio(fase.motivo, nomePc, 0).titolo}
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
            Il riquadro riprova da solo, con attese che crescono (1, 2, 5, 10, 30 secondi, poi ogni 30: non si arrende mai), in quest’ordine: la rete di casa, Tailscale (anche gli indirizzi che dà adesso), un collegamento diretto via Internet (WebRTC, aperto con uno scambio cifrato sul Drive) e infine il Drive, lento, solo per leggere e mandare un messaggio.
            {driveCollegato
              ? ' La conversazione la trovi anche nella copia sul Drive (Account → Drive), in sola lettura, aggiornata all’ultimo salvataggio di quel PC.'
              : ' Il Drive di questo PC è scollegato: niente copia da leggere e niente cassetta finché non lo ricolleghi (Account → Drive → Collega).'}
          </div>
        </div>
      ) : null}

      {avviso !== undefined ? <div className="remoto__esito">{avviso}</div> : null}

      {!chiusaPin && scelte !== undefined && chatId !== undefined ? (
        <div className="remoto__scelte">
          <div className="remoto__scelte-titolo">La chat aspetta una scelta: tocca l’opzione, la premo là per te.</div>
          {scelte.opzioni.map((o) => (
            <button key={`${o.numero}-${o.testo}`} className={o.scelta ? 'tasto tasto--primario' : 'tasto'} disabled={invio} title={o.descrizione}
              onClick={() => {
                // «Type something.» (0.52.5): la risposta si scrive nel campo qui sotto.
                if (o.libera === true) { setAvviso('Scrivi la risposta nel campo qui sotto e mandala: arriva a Claude come risposta libera.'); return }
                scegli(o.testo)
              }}>
              <EtichettaOpzione o={o} />
            </button>
          ))}
        </div>
      ) : null}

      <CodaInvii coda={coda} onTogli={(id) => setCoda((c) => consegnato(c, id))} />
      {/* Su quale PC si scrive, sempre sopra la casella (0.39.3). */}
      <div className="remoto__dove">Stai scrivendo su {nomePc}: quello che mandi arriva nel terminale di quel PC, non qui.</div>
      <div className="remoto__barra">
        <textarea
          className="campo remoto__campo"
          rows={2}
          value={testo}
          disabled={chatId === undefined || chiusaPin}
          placeholder={chatId === undefined ? `Quando la chat è viva su ${nomePc}, qui le scrivi.` : linea.fase === 'ricollego' ? 'Linea giù: quello che scrivi resta in coda e parte al ritorno, una volta sola — Invio mette in coda' : lento ? `Via Drive: il messaggio arriva a ${nomePc} al suo prossimo giro — Invio manda` : `Scrivi a questa chat su ${nomePc} — Invio manda, Maiusc+Invio va a capo`}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); manda() } }}
        />
        <button className="tasto tasto--primario" disabled={chatId === undefined || chiusaPin || testo.trim() === ''} onClick={manda} title="Manda il testo e Invio nel terminale di quella chat, su quel PC">
          Manda
        </button>
      </div>
      <div className="remoto__nota">
        Niente gira qui: la chat lavora su {nomePc}, con i suoi file. Quello che vedi è il suo terminale, riletto ogni {Math.round(RILEGGI_REMOTO_OGNI_MS / 1000)} secondi (è anche il controllo che la linea ci sia); quello che scrivi arriva là come se lo digitassi su quella tastiera. Chiudere questo riquadro non chiude la chat là.
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
          pc={{ pcId: remoto.pcId, nome: nomePc, versione: '', battito: '', cartelle: [remoto.cwd], chat: [] }}
          vivo={false}
          presel={{ cwd: remoto.cwd, ...(remoto.sessione !== undefined ? { sessione: remoto.sessione } : {}) }}
          onChiudi={() => setPostaAperta(false)}
        />
      ) : null}
      <span className="remoto__titolo-nascosto" hidden>{title}</span>
    </div>
  )
}
