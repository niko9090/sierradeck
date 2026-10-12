import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { filtraChat, filtraProgetti, testiCambioResidente, type AzioneProgetto, type FiltroPannello, type Pannello, type RigaChat, type RigaProgetto } from '@shared/pannello-drive'
import { ModaleSposta } from './ModaleSposta'
import { ModaleRiordina } from './ModaleRiordina'
import { ContenutoDrive } from './ContenutoDrive'
import { SalvataggioDrive } from './PannelloAccount'
import { Aiuto } from './Aiuto'
import { SpazioDrive } from './SpazioDrive'
import { TraslocoAvanzamento } from './TraslocoAvanzamento'
import { voceMenu } from '@shared/menu-principale'
import { chiaveProgetto, eChiaveProgetto } from '@shared/allineamento'
import type { CartellaInRecupero, StatoRimozione } from '@shared/rimozione-sicura'

/**
 * Il pannello delle chat e dei progetti del Drive (0.58.0, tappa 1).
 *
 * Una riga per chat e per progetto con il PC residente, le copie, l'ultimo uso
 * e lo stato; le assegnazioni sbagliate in evidenza, ognuna spiegata; il cambio
 * del residente con una conferma che dice cosa succede, cosa no e cosa fare se
 * qualcosa non torna. Il cambio passa da `casa.scegli` (la stessa strada di
 * «Ospitata da» e «Porta qui»); spostare anche i file di un progetto è
 * «Sposta progetto», che si apre da qui. Le regole: `@shared/pannello-drive`.
 *
 * Dalla 0.61.0 è **la prima voce del menu principale**, la casa di tutto
 * quello che riguarda progetti e Drive: in cima le azioni frequenti (Sposta,
 * Riordina, Dove vive ogni chat, il Quaderno), in fondo quello che era del
 * vecchio pannello «☁ Drive» e di Impostazioni → Account: «Salvataggio e
 * arrivo» (Salva ora, Ripristina, salvataggio automatico, Fondi, i progetti
 * sul Drive) e «Il contenuto del Drive» (il catalogo per progetto e per
 * workspace), che si apre solo quando serve perché leggere il Drive è lento.
 */

const STATO: Record<RigaChat['stato'], { testo: string; colore: string; spiega: string }> = {
  residente: { testo: 'residente', colore: 'var(--verde)', spiega: 'ha una casa, e il PC residente ne ha la copia' },
  'solo-cloud': { testo: 'solo cloud', colore: 'var(--testo-quieto, #8a94a0)', spiega: 'il PC residente non ne ha una copia, oppure non ha una casa: c’è sul Drive' },
  conflitto: { testo: 'in conflitto', colore: 'var(--ambra)', spiega: 'lavora (o ha lavorato) fuori dalla sua casa: vedi il problema sotto' }
}
const FILTRI: { id: FiltroPannello; testo: string }[] = [
  { id: 'tutti', testo: 'Tutti' }, { id: 'sbagliati', testo: 'Sbagliati' }, { id: 'questo-pc', testo: 'Di questo PC' }, { id: 'solo-cloud', testo: 'Solo cloud' }
]
const quando = (iso: string | undefined): string => (iso === undefined ? 'mai' : new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))
const PASSO = 150

type Cambio = { cosa: 'chat' | 'progetto'; nome: string; sessioni: string[]; da?: { pc: string; nome: string }; verso: { pc: string; nome: string }; cartellaLa?: boolean }

export function ModalePannelloDrive({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [d, setD] = useState<Pannello | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  // Si lavora per progetti e workspace (0.60.0): il pannello si apre sui progetti.
  const [vista, setVista] = useState<'chat' | 'progetti'>('progetti')
  const [senzaNome, setSenzaNome] = useState(false)
  const [filtro, setFiltro] = useState<FiltroPannello>('tutti')
  const [q, setQ] = useState('')
  const [quante, setQuante] = useState(PASSO)
  const [cambio, setCambio] = useState<Cambio | undefined>(undefined)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const [sposta, setSposta] = useState<string | undefined>(undefined)
  const [riordina, setRiordina] = useState(false)
  /** Le due sezioni in fondo (0.61.0): chiuse finché non le apri. */
  const [inFondo, setInFondo] = useState<{ salvataggio: boolean; drive: boolean }>({ salvataggio: false, drive: false })
  const [azioneDa, setAzioneDa] = useState<{ progetto: string; nome: string; a: AzioneProgetto } | undefined>(undefined)
  const faiAzione = (progetto: string, a: AzioneProgetto): void => {
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.azione({ azione: a.id, progetto }).then((r) => { setMsg(r.messaggio); setAzioneDa(undefined); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  const [rim, setRim] = useState<{ stati: StatoRimozione[]; inRecupero: CartellaInRecupero[] }>({ stati: [], inRecupero: [] })
  const leggi = useCallback((): void => {
    void window.gestore.casa.pannello().then((p) => { setD(p); setErrore(undefined) }).catch((e: unknown) => setErrore(`Non riesco a leggere le chat e le case: ${String(e)}`))
    void window.gestore.casa.rimozione.stati().then(setRim).catch(() => undefined)
  }, [])
  /** La rimozione sicura (tappa 3): confronto, recupero, riassunto; poi conferma o annulla. */
  const rimuovi = (azione: 'avvia' | 'conferma' | 'annulla', id: string): void => {
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.rimozione[azione](id).then((s) => { setMsg(s.messaggio); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  const recupero = (azione: 'ripristina' | 'cestina', id: string): void => {
    setOccupato(true)
    void window.gestore.casa.rimozione[azione](id).then((r) => { setMsg(r.messaggio); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  useEffect(() => {
    leggi()
    const via = window.gestore.casa.suCambiate(leggi)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape' && cambio === undefined && sposta === undefined && !riordina) onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => { via(); window.removeEventListener('keydown', suTasto) }
  }, [leggi, onChiudi, cambio, sposta, riordina])
  useEffect(() => { setQuante(PASSO) }, [vista, filtro, q])

  const pc = useMemo(() => (d === undefined ? [] : [d.io, ...d.pc]), [d])
  const chat = useMemo(() => (d === undefined ? [] : filtraChat(d.chat, filtro, q, senzaNome)), [d, filtro, q, senzaNome])
  const nascoste = d === undefined ? 0 : d.chat.filter((c) => c.senzaNome === true).length
  /** «Rendi residente» (0.60.0): conferma, annulla, annulla l'unione. */
  const residenza = (azione: 'conferma-residenza' | 'annulla-residenza' | 'annulla-unione', progetto: string, id?: string): void => {
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.azione({ azione, progetto, ...(id !== undefined ? { id } : {}) }).then((r) => { setMsg(r.messaggio); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  // Mentre un'analisi o un'unione lavora, il pannello si rilegge da solo.
  const lavora = d?.residenza?.some((s) => s.fase === 'analisi' || s.fase === 'unisco') === true ||
    (d?.traslochi ?? []).some((t) => t.finitoIl === undefined && t.annullatoIl === undefined && t.fermo === undefined)
  useEffect(() => {
    if (!lavora) return
    const t = setInterval(leggi, 2000)
    return () => clearInterval(t)
  }, [lavora, leggi])
  // La prima misura del Drive arriva dopo il pannello (0.65.0): si rilegge finché c'è.
  const senzaSpazio = d !== undefined && d.spazio === undefined
  useEffect(() => {
    if (!senzaSpazio) return
    const t = setTimeout(leggi, 4000)
    return () => clearTimeout(t)
  }, [senzaSpazio, d, leggi])
  const progetti = useMemo(() => (d === undefined ? [] : filtraProgetti(d.progetti, filtro, q)), [d, filtro, q])
  const sbagliati = d === undefined ? 0 : (vista === 'chat' ? d.chat : d.progetti).filter((r) => r.problemi.length > 0).length

  const conferma = (): void => {
    if (cambio === undefined) return
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.scegli({ sessioni: cambio.sessioni, pc: { id: cambio.verso.pc, nome: cambio.verso.nome } })
      .then((r) => { setMsg(r.messaggio); setCambio(undefined); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`))
      .finally(() => setOccupato(false))
  }
  const sceltaPc = (valore: string, fa: (verso: { pc: string; nome: string }) => void): void => {
    const p = pc.find((x) => x.id === valore)
    if (p !== undefined) fa({ pc: p.id, nome: p.nome })
  }

  const problemi = (r: RigaChat | RigaProgetto): React.JSX.Element | null => r.problemi.length === 0 ? null : (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {r.problemi.map((x) => (
        <div key={x.tipo} className="account__nota" style={{ borderLeft: '3px solid var(--ambra)', paddingLeft: 6 }}>
          <b style={{ color: 'var(--ambra)' }}>{x.titolo}.</b> {x.spiega} <i>Cosa fare:</i> {x.cosaFare}
        </div>
      ))}
    </div>
  )
  const pallino = (s: RigaChat['stato']): React.JSX.Element => (
    <span className="account__nota" title={STATO[s].spiega} style={{ color: STATO[s].colore, whiteSpace: 'nowrap' }}>● {STATO[s].testo}</span>
  )

  const testi = cambio === undefined || d === undefined ? undefined
    : testiCambioResidente({ cosa: cambio.cosa, nome: cambio.nome, ...(cambio.da !== undefined ? { da: cambio.da } : {}), verso: cambio.verso, io: d.io.id, chat: cambio.sessioni.filter((s) => !eChiaveProgetto(s)).length, ...(cambio.cartellaLa !== undefined ? { cartellaLa: cambio.cartellaLa } : {}) })

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && cambio === undefined) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialogo__testa">
          <span className="serigrafia">{voceMenu('progetti').icona} Progetti · chat e progetti dei tuoi PC</span>
          <Aiuto di="Progetti">
          Ogni chat ha un <b>PC residente</b>: è lì che gira il suo claude.exe, e sugli altri PC si apre solo dal vivo, guardando quello.
          Qui vedi tutte le chat e tutti i progetti che stanno sul Drive o su questo PC: chi è il residente, quali PC ne hanno una
          copia (qui sul disco, oppure caricata sul Drive da un PC), quando sono state usate l’ultima volta e lo stato:
          <b> residente</b> (il PC residente ne ha la copia), <b>solo cloud</b> (c’è sul Drive, ma il residente non ne ha la copia, o non ha una casa),
          <b> in conflitto</b> (lavora fuori dalla sua casa). In ambra le <b>assegnazioni sbagliate</b>, ognuna con il perché e cosa fare.
          Cambiare il residente chiede sempre una conferma, e non cancella mai niente: le copie tolte vanno nella cartella di recupero.
          Delle copie degli altri PC si sa quello che hanno caricato sul Drive: una copia mai salvata là, da qui non si vede.
          </Aiuto>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" onClick={leggi} disabled={occupato} title="Rileggi le case, le copie e il Drive">Aggiorna</button>
          <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        {/* Le azioni frequenti, in vista in cima (0.61.0). */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
          <button className="tasto" disabled={occupato} onClick={() => setSposta('')} title="Porta un progetto con le sue chat e i suoi file da questo PC a un altro: controlla, trasferisce, verifica, cambia il residente e mette da parte le copie di qui, senza cancellare niente">Sposta progetto…</button>
          <button className="tasto" disabled={occupato} onClick={() => setRiordina(true)} title="Le chat che stanno qui ma hanno casa su un altro PC, con il perché: le metti da parte quando confermi (non si cancellano), e ogni riordino si annulla">Riordina le chat…</button>
          <button className="tasto" onClick={() => window.dispatchEvent(new Event('sierradeck:dove-vive'))} title="Le chat dei workspace con il PC che le ospita: lo scegli chat per chat o per un workspace intero. Sugli altri PC quella chat non parte mai, si guarda dal vivo">Dove vive ogni chat…</button>
          <button className="tasto" onClick={() => { onChiudi(); window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'quaderno' })) }} title="Il quaderno del progetto della chat che hai davanti: le schede con le decisioni, i vincoli e gli errori risolti, da leggere e modificare">Quaderno del progetto</button>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={() => setInFondo({ salvataggio: true, drive: inFondo.drive })} title="Salva ora, Ripristina, il salvataggio automatico, «Fondi con il Drive» e i progetti sul Drive: in fondo a questo pannello">Salvataggio e arrivo ↓</button>
          <button className="tasto" onClick={() => setInFondo({ salvataggio: inFondo.salvataggio, drive: true })} title="Il catalogo di tutto quello che sta sul Drive, per progetto e per workspace: in fondo a questo pannello">Il contenuto del Drive ↓</button>
        </div>
        {errore !== undefined ? <div className="riga__stato" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}
        {d !== undefined && d.pcDaAggiornare.length > 0 ? (
          <div className="riga__stato" style={{ color: 'var(--ambra)', marginBottom: 6 }}>
            {d.pcDaAggiornare.join(', ')} non {d.pcDaAggiornare.length === 1 ? 'dice' : 'dicono'} ancora quali chat e progetti {d.pcDaAggiornare.length === 1 ? 'ha' : 'hanno'} sul disco: {d.pcDaAggiornare.length === 1 ? 'va aggiornato' : 'vanno aggiornati'} alla 0.58. Fino ad allora, di {d.pcDaAggiornare.length === 1 ? 'quel PC' : 'quei PC'} si vedono solo le copie caricate sul Drive.
          </div>
        ) : null}
        {d?.piano !== undefined && d.piano.azioni.length > 0 ? (
          <div className="riordina__gruppo" style={{ marginBottom: 8 }}>
            <span className="con-aiuto"><span className="serigrafia">Piano di allineamento di questo PC</span><Aiuto>
              Cosa serve perché questo PC rispetti le scelte: i progetti di cui è residente devono esserci, gli altri restano solo cloud.
              «Porta qui» parte da solo solo quando la cartella qui non c’è affatto, quindi non sovrascrive niente; negli altri casi
              aspetta te. Rendere solo cloud un progetto non toglie niente da solo: «Confronta e togli» chiede al PC residente
              di confrontare i file e le chat di qui con i suoi, copia là (nella sua cartella <code>.sierradeck/recuperati</code>,
              mai sopra i suoi file) quello che c’è solo qui o è più nuovo, e ti mostra il riassunto. Solo con la tua conferma
              la cartella di qui va nella cartella di recupero di SierraDeck, per 30 giorni, ripristinabile. Se non c’è
              nessuna differenza la conferma è automatica. Se il residente non si raggiunge, non si toglie niente.
            </Aiuto></span>
            {d.piano.azioni.map((a) => {
              const st = rim.stati.find((s) => s.progetto === a.progetto)
              return (
                <div key={`${a.tipo}:${a.progetto}`} className="account__nota" style={{ borderLeft: `3px solid ${a.tipo === 'porta-qui' ? 'var(--verde)' : 'var(--ambra)'}`, paddingLeft: 6, marginTop: 3 }}>
                  <b>{a.tipo === 'porta-qui' ? (a.automatica ? 'Porto qui' : 'Da portare qui (decidi tu)') : 'Da rendere solo cloud'}: {a.nome}.</b> {a.perche}
                  {a.tipo === 'solo-cloud' ? (
                    <div style={{ marginTop: 4 }}>
                      {st !== undefined ? <div style={{ marginBottom: 4 }}><i>{st.fase === 'attesa-conferma' ? 'Riassunto' : 'Stato'}:</i> {st.messaggio}</div> : null}
                      {st?.riassunto !== undefined && st.riassunto.recuperati.length > 0
                        ? <div style={{ marginBottom: 4 }}>Recuperati: {st.riassunto.recuperati.slice(0, 10).map((x) => x.dove).join('; ')}{st.riassunto.recuperati.length > 10 ? ` e altri ${st.riassunto.recuperati.length - 10}` : ''}</div> : null}
                      {st?.fase === 'attesa-conferma' || st?.fase === 'in-uso' ? (
                        <>
                          <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => rimuovi('conferma', a.progetto)}>Conferma e togli da questo PC</button>{' '}
                          <button className="tasto tasto--mini" disabled={occupato} onClick={() => rimuovi('annulla', a.progetto)}>Annulla</button>
                        </>
                      ) : st?.fase === 'analisi' || st?.fase === 'recupero' ? null : (
                        <button className="tasto tasto--mini" disabled={occupato} onClick={() => rimuovi('avvia', a.progetto)}>Confronta con {a.residente} e togli…</button>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
        {msg !== undefined ? <div className="riga__stato" style={{ marginBottom: 6 }}>{msg}</div> : null}
        {(d?.traslochi ?? []).map((t) => (
          <TraslocoAvanzamento
            key={t.id}
            t={t}
            occupato={occupato}
            onAzione={(azione, id) => {
              setOccupato(true); setMsg(undefined)
              void window.gestore.casa.azione({ azione, id }).then((r) => { setMsg(r.messaggio); leggi() })
                .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
            }}
          />
        ))}
        {d !== undefined ? (
          <SpazioDrive
            spazio={d.spazio}
            occupato={occupato}
            onAzione={(corpo) => {
              setOccupato(true); setMsg(undefined)
              void window.gestore.casa.azione(corpo).then((r) => { setMsg(r.messaggio); leggi() })
                .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
            }}
          />
        ) : null}
        {d !== undefined && (d.unioni ?? []).length > 0 ? (
          <div className="riordina__gruppo" style={{ marginBottom: 8 }}>
            <span className="con-aiuto"><span className="serigrafia">Unioni fatte</span><Aiuto>
              I progetti uniti con «Rendi residente qui» negli ultimi 30 giorni. «Annulla l’unione» rimette com’erano le cartelle
              doppie (dalla cartella di recupero), i file sostituiti, le trascrizioni delle chat, i workspace e il registro; i file
              entrati con l’unione escono e vanno nei recuperati, non si cancellano. La casa delle chat resta su questo PC: se vuoi,
              scegline un’altra.
            </Aiuto></span>
            {(d.unioni ?? []).map((u) => (
              <div key={u.id} className="dove__riga" title={u.destinazione}>
                <span className="riordina__testo" style={{ flex: 1 }}>
                  <b>{u.nome}</b> <span className="account__nota">· unito il {quando(u.quando)} in {u.destinazione} · annullabile fino al {quando(u.scadeIl)}</span>
                </span>
                <button className="tasto tasto--mini" disabled={occupato} onClick={() => residenza('annulla-unione', u.progetto, u.id)}>Annulla l’unione</button>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <button className={`tasto tasto--mini${vista === 'chat' ? ' tasto--acceso' : ''}`} onClick={() => setVista('chat')}>Chat{d !== undefined ? ` (${d.chat.length})` : ''}</button>
          <button className={`tasto tasto--mini${vista === 'progetti' ? ' tasto--acceso' : ''}`} onClick={() => setVista('progetti')}>Progetti{d !== undefined ? ` (${d.progetti.length})` : ''}</button>
          <span style={{ width: 12 }} />
          {FILTRI.map((f) => (
            <button key={f.id} className={`tasto tasto--mini${filtro === f.id ? ' tasto--acceso' : ''}`} onClick={() => setFiltro(f.id)}>
              {f.testo}{f.id === 'sbagliati' && sbagliati > 0 ? ` (${sbagliati})` : ''}
            </button>
          ))}
          <input className="campo campo--mini" placeholder="Cerca titolo, cartella o PC" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          {vista === 'chat' && nascoste > 0 ? (
            <label className="account__nota" title="Le chat senza un titolo non stanno negli elenchi: si lavora per progetti e workspace. Non sono cancellate, e restano contate nel loro progetto.">
              <input type="checkbox" checked={senzaNome} onChange={(e) => setSenzaNome(e.target.checked)} /> mostra anche le senza nome ({nascoste})
            </label>
          ) : null}
        </div>

        {rim.inRecupero.filter((c) => c.ripristinataIl === undefined).length > 0 ? (
          <div className="riordina__gruppo" style={{ marginBottom: 8 }}>
            <span className="con-aiuto"><span className="serigrafia">Cartelle in recupero</span><Aiuto>
              Le cartelle dei progetti tolte da questo PC: non sono cancellate, sono spostate qui sotto per 30 giorni.
              «Ripristina» le rimette dov’erano. Alla scadenza ti chiedo nelle Domande se metterle nel Cestino di Windows:
              da sole non spariscono mai.
            </Aiuto></span>
            {rim.inRecupero.filter((c) => c.ripristinataIl === undefined).map((c) => (
              <div key={c.id} className="dove__riga" title={c.dove}>
                <span className="riordina__testo" style={{ flex: 1 }}>
                  <b>{c.nome}</b> <span className="account__nota">· tolta il {quando(c.quando)} da {c.percorsoOriginale} · resta fino al {quando(c.scadeIl)} · {c.motivo}</span>
                </span>
                <button className="tasto tasto--mini" disabled={occupato} onClick={() => recupero('ripristina', c.id)}>Ripristina</button>
                {Date.parse(c.scadeIl) <= Date.now() ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => recupero('cestina', c.id)}>Nel Cestino</button> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
          {d === undefined && errore === undefined ? <p className="account__nota">Leggo le case, le copie di questo PC e il manifesto del Drive…</p> : null}
          {d !== undefined && vista === 'chat' && chat.length === 0 ? <p className="account__nota">Nessuna chat con questo filtro.</p> : null}
          {d !== undefined && vista === 'progetti' && progetti.length === 0 ? <p className="account__nota">Nessun progetto con questo filtro.</p> : null}
          {d !== undefined && vista === 'chat' ? chat.slice(0, quante).map((r) => (
            <div key={r.sessione} className="dove__riga" style={{ alignItems: 'flex-start', ...(r.problemi.length > 0 ? { background: 'rgba(255,170,0,0.06)' } : {}) }} title={r.cwd}>
              <span className="riordina__testo" style={{ flex: 1 }}>
                <b>{r.titolo}</b> {pallino(r.stato)}
                <span className="account__nota" style={{ display: 'block' }}>
                  Residente: {r.residente === undefined ? <i>nessuno</i> : <b>{r.residente.nome}{r.residente.qui ? ' (questo PC)' : ''}</b>}
                  {' · '}copie: {r.copie.length === 0 ? 'nessuna' : r.copie.map((c) => `${c.nome}${c.dove === 'qui' ? ' (qui sul disco)' : c.dove === 'disco' ? ' (sul suo disco)' : ' (caricata sul Drive)'}`).join(', ')}
                  {' · '}ultimo uso: {quando(r.ultimoUso)}
                  {r.cwd !== undefined ? <> · <span>{r.cwd}</span></> : null}
                </span>
                {problemi(r)}
              </span>
              <select className="campo campo--mini" value="" disabled={occupato} title="Cambia il PC residente di questa chat"
                onChange={(e) => sceltaPc(e.target.value, (verso) => setCambio({ cosa: 'chat', nome: r.titolo, sessioni: [r.sessione], ...(r.residente !== undefined ? { da: { pc: r.residente.pc, nome: r.residente.nome } } : {}), verso }))}>
                <option value="">Rendi residente…</option>
                {pc.map((p) => <option key={p.id} value={p.id} disabled={p.id === r.residente?.pc}>{p.nome}{p.id === d.io.id ? ' (questo PC)' : ''}</option>)}
              </select>
            </div>
          )) : null}
          {d !== undefined && vista === 'progetti' ? progetti.slice(0, quante).map((r) => {
            const sessioni = d.chat.filter((c) => c.progetto === r.id).map((c) => c.sessione)
            const qui = r.cartelle.find((c) => c.pc === d.io.id)
            return (
              <div key={r.id} className="dove__riga" style={{ alignItems: 'flex-start', ...(r.problemi.length > 0 ? { background: 'rgba(255,170,0,0.06)' } : {}) }}>
                <span className="riordina__testo" style={{ flex: 1 }}>
                  <b>{r.nome}</b> {pallino(r.stato)}
                  <span className="account__nota" style={{ display: 'block' }}>
                    Residente: {r.residente === undefined ? <i>nessuno</i> : <b>{r.residente.nome}{r.residente.qui ? ' (questo PC)' : ''}</b>}
                    {r.residente !== undefined ? (r.voluto ? ' (scelto per il progetto: gli altri PC lo tengono solo cloud)' : ' (dalla maggior parte delle sue chat: non ancora scelto)') : null}
                    {' · '}{r.chat} chat{r.chatSenzaNome > 0 ? ` (di cui ${r.chatSenzaNome} senza nome)` : ''} · cartella su: {r.cartelle.length === 0 ? 'nessun PC' : [...new Set(r.cartelle.map((c) => c.nome))].join(', ')}
                    {' · '}qui sul disco: {r.cartellaQui ? (r.cartellaTrovata !== undefined ? `sì, ${r.cartellaTrovata} (trovata per nome, non ancora registrata)` : 'sì') : 'no'}{' · '}ultimo uso: {quando(r.ultimoUso)}
                    {r.ids.length > 1 || r.workspace.length > 1 ? (
                      <span style={{ display: 'block' }}>
                        Stesso nome, stesso progetto: {r.ids.length > 1 ? `${r.ids.length} voci nel registro del Drive` : 'una voce nel registro'}
                        {r.cartelle.filter((c) => c.pc === d.io.id).length > 1 ? `, ${r.cartelle.filter((c) => c.pc === d.io.id).length} cartelle qui (${r.cartelle.filter((c) => c.pc === d.io.id).map((c) => c.percorso).join(', ')})` : ''}
                        {r.workspace.length > 1 ? `, workspace ${r.workspace.map((w) => `«${w}»`).join(', ')}` : ''}: qui li vedi come uno solo; «{r.residente?.qui === true ? 'Unisci qui le copie' : 'Rendi residente qui'}» li unisce davvero, dopo il riassunto.
                      </span>
                    ) : null}
                  </span>
                  {problemi(r)}
                  {(() => {
                    const st = d.residenza?.find((x) => x.progetto === r.id)
                    if (st === undefined || st.fase === 'annullata') return null
                    return (
                      <div className="account__nota" style={{ borderLeft: '3px solid var(--verde)', paddingLeft: 6, marginTop: 4 }}>
                        <b>{st.fase === 'analisi' ? 'Raccolgo e confronto le copie…' : st.fase === 'unisco' ? 'Unisco…' : st.fase === 'attesa-conferma' ? 'Riassunto: cosa unisco, cosa tengo, cosa va in recupero' : st.fase === 'fatta' ? 'Unito' : st.fase === 'in-uso' ? 'In attesa' : 'Non riuscito'}</b>
                        {st.riassunto !== undefined && st.fase === 'attesa-conferma'
                          ? <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{st.riassunto.righe.map((x) => <li key={x}>{x}</li>)}</ul>
                          : <div>{st.messaggio}</div>}
                        {st.fase === 'attesa-conferma' || st.fase === 'in-uso' ? (
                          <div style={{ marginTop: 4 }}>
                            <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => residenza('conferma-residenza', r.id)}>Conferma e unisci</button>{' '}
                            <button className="tasto tasto--mini" disabled={occupato} onClick={() => residenza('annulla-residenza', r.id)}>Annulla</button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                  {(() => {
                    const st = rim.stati.find((x) => x.progetto === r.id)
                    if (st === undefined) return null
                    return (
                      <div className="account__nota" style={{ borderLeft: '3px solid var(--accento, #4aa3ff)', paddingLeft: 6, marginTop: 4 }}>
                        <i>Togliere da questo PC:</i> {st.messaggio}
                        {st.fase === 'attesa-conferma' || st.fase === 'in-uso' ? (
                          <div style={{ marginTop: 4 }}>
                            <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => rimuovi('conferma', r.id)}>Conferma e togli da questo PC</button>{' '}
                            <button className="tasto tasto--mini" disabled={occupato} onClick={() => rimuovi('annulla', r.id)}>Annulla</button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <select className="campo campo--mini" value="" disabled={occupato} title="Scegli il PC residente del progetto: le sue chat vivono lì, gli altri PC lo tengono solo cloud"
                    onChange={(e) => sceltaPc(e.target.value, (verso) => {
                      // Questo PC (0.60.0): prima l'analisi delle copie e il riassunto, poi l'unione con la conferma.
                      const qui = r.azioni.find((a) => a.id === 'residente-qui')
                      if (verso.pc === d.io.id && qui !== undefined) { setAzioneDa({ progetto: r.id, nome: r.nome, a: qui }); return }
                      setCambio({
                      // Anche lo stato voluto del progetto (0.58.0): residente là, solo cloud sugli altri.
                      cosa: 'progetto', nome: r.nome, sessioni: [...sessioni, chiaveProgetto(r.id)],
                      ...(r.residente !== undefined ? { da: { pc: r.residente.pc, nome: r.residente.nome } } : {}),
                      verso, cartellaLa: r.cartelle.some((c) => c.pc === verso.pc)
                    })
                    })}>
                    <option value="">Rendi residente…</option>
                    {pc.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === d.io.id ? ' (questo PC)' : ''}</option>)}
                  </select>
                  {qui !== undefined ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => setSposta(qui.percorso)} title="Sposta anche i file del progetto su un altro PC, con i controlli e la verifica">Sposta con i file…</button> : null}
                  {r.azioni.map((a) => (
                    <button key={a.id} className="tasto tasto--mini" disabled={occupato} title={a.testo}
                      onClick={() => (a.conferma === undefined ? faiAzione(r.id, a) : setAzioneDa({ progetto: r.id, nome: r.nome, a }))}>{a.titolo}</button>
                  ))}
                </span>
              </div>
            )
          }) : null}
          {d !== undefined && (vista === 'chat' ? chat.length : progetti.length) > quante
            ? <button className="tasto" onClick={() => setQuante(quante + PASSO)}>Mostra altre {Math.min(PASSO, (vista === 'chat' ? chat.length : progetti.length) - quante)}</button>
            : null}

          {/* In fondo, le cose rare (0.61.0): erano il vecchio «☁ Drive» e Impostazioni → Account. */}
          <div className="riordina__gruppo" style={{ marginTop: 12 }}>
            <span className="con-aiuto"><button className="account__link" aria-expanded={inFondo.salvataggio} onClick={() => setInFondo({ ...inFondo, salvataggio: !inFondo.salvataggio })} style={{ textAlign: 'left' }}>
              <span className="serigrafia">{inFondo.salvataggio ? '▾' : '▸'} Salvataggio e arrivo</span>
            </button><Aiuto>
              Ogni PC salva sul Drive, cifrate, le sue chat e le cartelle dei progetti che viaggiano: qui vedi quando è stato l’ultimo salvataggio, lo fai subito con «Salva ora», riporti qui quello che c’è sul Drive con «Ripristina», accendi o spegni il salvataggio automatico, e con «Fondi con il Drive» scegli voce per voce cosa portare su e cosa giù. Più sotto, i progetti la cui cartella viaggia sul Drive, con la loro coda e chi li ha in mano. Collegare l’account Google e la passphrase della cassaforte stanno in Impostazioni → Account.
            </Aiuto></span>
            {inFondo.salvataggio ? <SalvataggioDrive /> : null}
          </div>
          <div className="riordina__gruppo" style={{ marginTop: 8 }}>
            <span className="con-aiuto"><button className="account__link" aria-expanded={inFondo.drive} onClick={() => setInFondo({ ...inFondo, drive: !inFondo.drive })} style={{ textAlign: 'left' }}>
              <span className="serigrafia">{inFondo.drive ? '▾' : '▸'} Il contenuto del Drive</span>
            </button><Aiuto>
              Tutto quello che sta sul Drive, per progetto (la cartella) e per workspace, con lo stato di ogni chat rispetto a questo PC: già qui, solo sul Drive, più avanti qui o là. Da qui «Apri» una chat, togli dal Drive la cartella di un progetto o un workspace (e li rimetti). Leggere il Drive richiede qualche secondo: si legge quando apri questa parte.
            </Aiuto></span>
            {inFondo.drive ? <ContenutoDrive onChiudi={onChiudi} /> : null}
          </div>
        </div>
      </div>

      {cambio !== undefined && testi !== undefined ? (
        <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) setCambio(undefined) }}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">{testi.titolo}</span></div>
            <p className="account__nota"><b>{cambio.cosa === 'chat' ? `Chat «${cambio.nome}»` : `Progetto «${cambio.nome}», ${cambio.sessioni.filter((s) => !eChiaveProgetto(s)).length} chat`}</b>: residente adesso {cambio.da === undefined ? 'nessuno' : cambio.da.nome}, dopo {cambio.verso.nome}.</p>
            <div className="account__nota con-aiuto">Non si cancella niente: le copie tolte vanno nella cartella di recupero.
              <Aiuto di="cambio del residente">
                <b>Cosa succede</b>
                <ul>{testi.succede.map((t) => <li key={t}>{t}</li>)}</ul>
                <b>Cosa non succede</b>
                <ul>{testi.nonSuccede.map((t) => <li key={t}>{t}</li>)}</ul>
                <b>Se qualcosa non torna</b>
                <ul>{testi.seNonTorna.map((t) => <li key={t}>{t}</li>)}</ul>
              </Aiuto>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" disabled={occupato} onClick={() => setCambio(undefined)}>Annulla</button>
              <button className="tasto tasto--acceso" disabled={occupato} onClick={conferma}>{occupato ? 'Cambio…' : 'Conferma'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {azioneDa !== undefined ? (
        <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) setAzioneDa(undefined) }}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">{azioneDa.a.titolo}: {azioneDa.nome}</span></div>
            <p className="account__nota">{azioneDa.a.testo}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" disabled={occupato} onClick={() => setAzioneDa(undefined)}>Annulla</button>
              <button className="tasto tasto--acceso" disabled={occupato} onClick={() => faiAzione(azioneDa.progetto, azioneDa.a)}>{occupato ? 'Un momento…' : azioneDa.a.conferma}</button>
            </div>
          </div>
        </div>
      ) : null}
      {sposta !== undefined ? <ModaleSposta {...(sposta !== '' ? { cwdIniziale: sposta } : {})} onChiudi={() => { setSposta(undefined); leggi() }} /> : null}
      {riordina ? <ModaleRiordina onChiudi={() => { setRiordina(false); leggi() }} /> : null}
    </div>,
    document.body
  )
}
