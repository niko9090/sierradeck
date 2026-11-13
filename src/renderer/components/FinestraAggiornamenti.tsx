import { useEffect, useMemo, useState } from 'react'
import type { StatoAggiornamento } from '../../main/aggiornamenti'
import { tavolozza, type Preferenze } from '@shared/preferenze'
import { NOVITA } from '@shared/novita'
import { analizzaRiga, PAGINA_VERSIONI, type NoteAggiornamento } from '@shared/note-aggiornamento'
import { conVersioneNuova, testaNovita, type VistaNovita } from '@shared/finestra-novita'
import {
  aperteAllInizio, dataBreve, etichettaRuolo, etichettaTipo, registroAggiornamento, registroInstallata, riassuntoRegistro,
  testoScaricamento, type VersioneRegistro
} from '@shared/registro-versioni'
import { Pezzi } from './ModaleNote'
import { Aiuto } from './Aiuto'

/**
 * **La finestra degli aggiornamenti** (13/11, rifatta): in basso a destra dello
 * schermo, come l'aggiornatore di un programma per PC.
 *
 * - In testa: il simbolo, la frase dello stato («Nuova versione 0.106.2
 *   pronta», «Sto scaricando… 45%», «Sei aggiornato») e le versioni.
 * - Sotto: lo stato, con la barra, MB/s e il tempo che manca.
 * - Sempre: il registro delle versioni. Con un aggiornamento, la nuova e
 *   tutte quelle saltate; senza, la installata e le ultime prima.
 * - In fondo: i tasti. Installa **solo** «Installa e riavvia», premuto da chi
 *   la usa; mai da sola.
 */
export function FinestraAggiornamenti(): React.JSX.Element {
  const [vista, setVista] = useState<VistaNovita>({ tipo: 'aggiornamento' })
  const [agg, setAgg] = useState<StatoAggiornamento>({ fase: 'fermo' })
  const [scaricaAuto, setScaricaAuto] = useState(true)
  const [versione, setVersione] = useState('')
  const note = useNoteAggiornamento(agg)

  useEffect(() => {
    const applica = (p: Preferenze): void => {
      for (const [nome, valore] of Object.entries(tavolozza(p))) document.documentElement.style.setProperty(nome, valore)
      setScaricaAuto(p.scaricaAggiornamentiAutomatico)
    }
    window.gestore.preferenze.leggi().then(applica).catch(() => undefined)
    const via1 = window.gestore.preferenze.suCambio(applica)
    window.gestore.aggiornamenti.stato().then(setAgg).catch(() => undefined)
    const via2 = window.gestore.aggiornamenti.suStato(setAgg)
    window.gestore.finestraNovita?.vista().then(setVista).catch(() => undefined)
    const via3 = window.gestore.finestraNovita?.suVista(setVista)
    window.gestore.sistema.versione().then(setVersione).catch(() => undefined)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') void window.gestore.finestraNovita?.nascondi() }
    window.addEventListener('keydown', suTasto)
    document.title = 'SierraDeck · Aggiornamenti'
    return () => { via1(); via2(); via3?.(); window.removeEventListener('keydown', suTasto) }
  }, [])

  return (
    <div onPointerDown={() => { void window.gestore.finestraNovita?.letto() }} style={{ display: 'contents' }}>
      <VistaAggiornamenti
        agg={agg}
        vista={vista}
        versione={versione}
        scaricaAuto={scaricaAuto}
        note={note}
        azioni={{
          chiudi: () => { void window.gestore.finestraNovita?.nascondi() },
          installa: () => { void window.gestore.aggiornamenti.installa() },
          aggiornaAdesso: () => { void window.gestore.aggiornamenti.aggiornaAdesso() },
          scarica: () => { void window.gestore.aggiornamenti.scarica() },
          cerca: () => { void window.gestore.aggiornamenti.cerca() },
          apri: (url) => { void window.gestore.sistema.apriEsterno(url) }
        }}
      />
    </div>
  )
}

/** Le note dell'aggiornamento in arrivo, chieste una volta per versione. `undefined` mentre si leggono. */
function useNoteAggiornamento(agg: StatoAggiornamento): NoteAggiornamento | undefined {
  const nuova = conVersioneNuova(agg) ? agg.versione ?? '' : ''
  const [dati, setDati] = useState<{ per: string; note: NoteAggiornamento } | undefined>(undefined)
  useEffect(() => {
    if (nuova === '') return
    let vivo = true
    const riserva = (avviso: string): NoteAggiornamento => ({ versione: nuova, installata: '', note: [], fonte: 'nessuna', dove: PAGINA_VERSIONI, avviso })
    window.gestore.aggiornamenti.note()
      .then((d) => { if (vivo) setDati({ per: nuova, note: d ?? riserva('Gli aggiornamenti non sono attivi qui: le note sono nella pagina delle versioni.') }) })
      .catch(() => { if (vivo) setDati({ per: nuova, note: riserva('Non sono riuscito a leggere le note: sono nella pagina delle versioni. Puoi installare lo stesso.') }) })
    return () => { vivo = false }
  }, [nuova])
  return dati !== undefined && dati.per === nuova ? dati.note : undefined
}

export type AzioniAggiornamenti = {
  chiudi: () => void
  installa: () => void
  aggiornaAdesso: () => void
  scarica: () => void
  cerca: () => void
  apri: (url: string) => void
}

/** Il simbolo di SierraDeck, lo stesso dell'icona e della schermata d'avvio. */
function Segno(): React.JSX.Element {
  return (
    <svg className="fnov__segno" viewBox="80 80 360 360" aria-hidden="true">
      <path d="M268 92 L392 306 L268 306 Z" fill="#dfe3e7" />
      <path d="M268 92 L132 306 L268 306 Z" fill="#7d858d" />
      <path d="M132 306 L268 306 L200 412 Z" fill="#525a62" />
      <path d="M268 306 L392 306 L326 412 Z" fill="#363d44" />
      <path d="M200 412 L326 412 L268 306 Z" fill="#252b31" />
      <path d="M268 92 L312 168 L268 168 Z" fill="#54c07a" />
    </svg>
  )
}

/**
 * Tutta la finestra, senza chiamate: lo stato e le note arrivano da fuori, i
 * tasti chiamano `azioni`. Così si prova con `renderToStaticMarkup`.
 */
export function VistaAggiornamenti({ agg, vista, versione, scaricaAuto, note, azioni }: {
  agg: StatoAggiornamento
  vista: VistaNovita
  versione: string
  scaricaAuto: boolean
  note: NoteAggiornamento | undefined
  azioni: AzioniAggiornamenti
}): React.JSX.Element {
  const [fallitoChiuso, setFallitoChiuso] = useState(false)
  const nuova = conVersioneNuova(agg) ? agg.versione ?? '' : ''
  const installata = versione !== '' ? versione : note?.installata ?? ''
  const fallito = agg.tentativoFallito !== undefined && !fallitoChiuso && agg.fase !== 'installo' && agg.fase !== 'attendo' ? agg.tentativoFallito : undefined
  const testa = testaNovita(agg, installata, vista)
  const titolo = fallito !== undefined && (agg.fase === 'fermo' || agg.fase === 'aggiornato') ? fallito.titolo : testa.titolo

  // Il registro: con un aggiornamento la nuova e le saltate (dalle note), senza la installata e le prima (da novita.ts).
  const registro = useMemo<VersioneRegistro[] | undefined>(() => {
    if (nuova !== '') return note !== undefined ? registroAggiornamento(note.note, note.installata !== '' ? note.installata : installata, nuova) : undefined
    return installata !== '' ? registroInstallata(NOVITA, installata, analizzaRiga) : []
  }, [nuova, note, installata])
  const dove = note?.dove ?? PAGINA_VERSIONI
  const avviso = nuova !== '' ? note?.avviso : undefined

  const pronto = agg.fase === 'pronto'
  const primario = pronto
    ? <button className="tasto tasto--primario" autoFocus onClick={azioni.installa}>{fallito !== undefined ? 'Riprova a installare' : 'Installa e riavvia'}</button>
    : agg.fase === 'disponibile' && !scaricaAuto
      ? <button className="tasto tasto--primario" autoFocus onClick={azioni.scarica}>Scarica</button>
      : agg.fase === 'errore'
        ? <button className="tasto tasto--primario" autoFocus onClick={azioni.cerca}>Riprova</button>
        : undefined
  const occupato = agg.fase === 'cerco' || agg.fase === 'scarico' || agg.fase === 'attendo' || agg.fase === 'installo'

  return (
    <div className="fnov">
      <header className="fnov__testa">
        <Segno />
        <div className="fnov__intesta">
          <span className="fnov__app">SierraDeck{agg.daTelefono === true ? ' · chiesto dal telefono' : ''}</span>
          <h1 className="fnov__titolo" aria-live="polite">{titolo}</h1>
          {testa.versioni !== '' ? <span className="fnov__versioni">{testa.versioni}</span> : null}
        </div>
        <button className="fnov__chiudi" onClick={azioni.chiudi} title="Chiudi (Esc). Si riapre dal numero di versione in alto" aria-label="Chiudi">×</button>
      </header>

      <Stato agg={agg} scaricaAuto={scaricaAuto} fallito={fallito} onNascondiFallito={() => setFallitoChiuso(true)} azioni={azioni} />

      <Registro registro={registro} installata={installata} avviso={avviso} />

      <footer className="fnov__piede">
        <button className="fnov__link" onClick={() => azioni.apri(dove)} title="Tutte le versioni su GitHub, con le note e gli installer">Tutte le versioni ▸</button>
        <span className="fnov__tasti">
          {pronto ? (
            <Aiuto di="Installa e riavvia">
              Aspetto che le chat finiscano quello che hanno in mano (e il lavoro con il Drive, se c’è), le avviso, chiudo
              SierraDeck, installo e riparto da solo; al ritorno chat e autopiloti riprendono da dove erano. «Più tardi»:
              non installo niente; si installa solo quando lo premi tu.
            </Aiuto>
          ) : null}
          {agg.fase === 'attendo' && agg.subito !== true ? (
            <button className="tasto" onClick={azioni.aggiornaAdesso} title="Non aspetto la fine dei turni: salvo il lavoro delle chat sul loro ramo, le metto in pausa e installo adesso. Dopo il riavvio riprendono da sole.">Aggiorna adesso</button>
          ) : null}
          {nuova === '' && agg.fase !== 'errore' ? (
            <button className="tasto" onClick={azioni.cerca} disabled={occupato} autoFocus={primario === undefined}>⟳ Cerca aggiornamenti</button>
          ) : null}
          {agg.fase !== 'installo' ? (
            <button className="tasto" onClick={azioni.chiudi}>{pronto || agg.fase === 'disponibile' ? 'Più tardi' : 'Chiudi'}</button>
          ) : null}
          {primario ?? null}
        </span>
      </footer>
    </div>
  )
}

/** Lo stato: una frase, la barra con le misure, e gli avvisi. Le frasi lunghe dietro il «?». */
export function Stato({ agg, scaricaAuto, fallito, onNascondiFallito, azioni }: {
  agg: StatoAggiornamento
  scaricaAuto: boolean
  fallito: StatoAggiornamento['tentativoFallito']
  onNascondiFallito: () => void
  azioni: AzioniAggiornamenti
}): React.JSX.Element {
  const v = agg.versione ?? 'versione nuova'
  const misure = agg.fase === 'scarico' ? testoScaricamento(agg) : ''
  const tono = agg.fase === 'errore' || fallito !== undefined ? 'errore'
    : agg.fase === 'pronto' ? 'pronto'
      : agg.fase === 'scarico' || agg.fase === 'disponibile' || agg.fase === 'attendo' || agg.fase === 'installo' || agg.fase === 'cerco' ? 'lavoro'
        : 'calmo'
  return (
    <section className={`fnov__stato fnov__stato--${tono}`} aria-live="polite">
      {fallito !== undefined ? (
        <div className="fnov__fallito" role="alert">
          <p><b>{fallito.titolo}</b> {fallito.motivo}</p>
          <p className="fnov__piccolo">Cosa puoi fare: {fallito.strade.map((x, i) => <span key={i}>{i + 1}. {x} </span>)}</p>
          <span className="fnov__tasti">
            <button className="tasto tasto--mini" onClick={() => azioni.apri(fallito.pagina)} title={fallito.pagina}>Scarica a mano</button>
            <button className="tasto tasto--mini" onClick={onNascondiFallito} title="Nascondi fino al prossimo avvio">Nascondi</button>
          </span>
        </div>
      ) : null}

      {agg.fase === 'aggiornato' ? <p>Hai già l’ultima versione.</p> : null}
      {agg.fase === 'fermo' && fallito === undefined ? <p>Nessun aggiornamento in corso. Ogni tanto guardo da solo.</p> : null}
      {agg.fase === 'cerco' ? <p>Guardo se c’è una versione nuova…</p> : null}
      {agg.fase === 'errore' ? <p>{agg.errore ?? 'Motivo sconosciuto.'}</p> : null}
      {agg.fase === 'disponibile' ? <p>{scaricaAuto ? `La ${v} sta arrivando: la scarico in sottofondo.` : `C’è la ${v}. Si scarica quando premi «Scarica».`}</p> : null}
      {agg.fase === 'scarico' ? (
        <>
          <div className="fnov__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={agg.percento ?? 0}>
            <span className="fnov__pieno" style={{ width: `${agg.percento ?? 0}%` }} />
          </div>
          <p className="fnov__misure">{misure !== '' ? misure : `${agg.percento ?? 0}%`}</p>
        </>
      ) : null}
      {agg.fase === 'pronto' ? (
        <p>
          {agg.errore !== undefined ? <><b>{agg.errore}</b>{' '}</> : null}
          Scaricata. Si installa solo quando premi «Installa e riavvia».
        </p>
      ) : null}
      {agg.fase === 'attendo' ? (
        <p>
          {agg.subito === true ? 'Salvo il lavoro delle chat e installo subito…'
            : agg.attesaChat !== undefined && agg.attesa === undefined ? `${agg.attesaChat.charAt(0).toUpperCase()}${agg.attesaChat.slice(1)}.`
              : agg.attesa !== undefined ? `Aspetto che finisca ${agg.attesa}.`
                : `Aspetto che ${agg.chatOccupate === 1 ? 'una chat finisca' : `${agg.chatOccupate ?? 0} chat finiscano`} il turno.`}
          {' '}
          <Aiuto di="l’attesa prima di installare">
            Le chat e gli autopiloti finiscono il turno e si fermano: al massimo 5 minuti, poi salvo il loro lavoro con un commit
            sul loro ramo e installo lo stesso. Dopo il riavvio riprendono da sole. Non chiudere le chat a mano: l’installazione
            parte da sola. «Aggiorna adesso» non aspetta la fine dei turni.
          </Aiuto>
        </p>
      ) : null}
      {agg.fase === 'installo' ? <p>SierraDeck si chiude e riparte da solo con la {v}: non serve fare niente.</p> : null}
      {(agg.fase === 'attendo' || agg.fase === 'installo') && agg.fasiTesto !== undefined && agg.fasiTesto !== '' ? <p className="fnov__piccolo">{agg.fasiTesto}.</p> : null}
    </section>
  )
}

/** Il registro delle versioni: una scheda per versione, la prima aperta, le altre si aprono col clic. */
export function Registro({ registro, installata, avviso }: { registro: VersioneRegistro[] | undefined; installata: string; avviso?: string }): React.JSX.Element {
  const chiave = (registro ?? []).map((v) => v.versione).join(',')
  const [aperte, setAperte] = useState<Set<string>>(() => aperteAllInizio(registro ?? []))
  useEffect(() => { setAperte(aperteAllInizio(registro ?? [])) }, [chiave]) // eslint-disable-line react-hooks/exhaustive-deps
  const tutte = registro !== undefined && registro.length > 1 && registro.every((v) => aperte.has(v.versione))
  const cambia = (versione: string): void => setAperte((a) => {
    const n = new Set(a)
    if (n.has(versione)) n.delete(versione)
    else n.add(versione)
    return n
  })
  return (
    <section className="fnov__registro" aria-label="Cosa cambia">
      <div className="fnov__registro-testa">
        <span className="fnov__sezione">Cosa cambia</span>
        {registro !== undefined && registro.length > 0 ? <span className="fnov__piccolo fnov__riassunto">{riassuntoRegistro(registro, installata)}</span> : null}
        {registro !== undefined && registro.length > 1 ? (
          <button className="fnov__link" onClick={() => setAperte(tutte ? new Set(registro.slice(0, 1).map((v) => v.versione)) : new Set(registro.map((v) => v.versione)))}>
            {tutte ? 'Chiudi le altre' : 'Apri tutte'}
          </button>
        ) : null}
      </div>
      <div className="fnov__schede">
        {avviso !== undefined ? <p className="fnov__avviso"><Pezzi pezzi={analizzaRiga(avviso)} /></p> : null}
        {registro === undefined ? <p className="fnov__piccolo">Leggo le note delle versioni…</p> : null}
        {registro !== undefined && registro.length === 0 && avviso === undefined ? <p className="fnov__piccolo">Per questa versione non ci sono note.</p> : null}
        {(registro ?? []).map((v) => <SchedaVersione key={v.versione} v={v} aperta={aperte.has(v.versione)} onCambia={() => cambia(v.versione)} />)}
      </div>
    </section>
  )
}

/** Una versione: numero, tipo, data e le sue voci, ognuna con il titolo in grassetto. */
export function SchedaVersione({ v, aperta, onCambia }: { v: VersioneRegistro; aperta: boolean; onCambia: () => void }): React.JSX.Element {
  const data = dataBreve(v.data)
  const ruolo = etichettaRuolo(v.ruolo)
  return (
    <article className={`fnov-ver fnov-ver--${v.ruolo}${aperta ? ' fnov-ver--aperta' : ''}`}>
      <h2 className="fnov-ver__h">
        <button className="fnov-ver__testa" aria-expanded={aperta} onClick={onCambia}>
          <span className="fnov-ver__freccia" aria-hidden="true">›</span>
          <span className="fnov-ver__numero">{v.versione}</span>
          <span className={`fnov-ver__tipo fnov-ver__tipo--${v.tipo}`}>{etichettaTipo(v.tipo)}</span>
          {ruolo !== '' ? <span className={`fnov-ver__ruolo fnov-ver__ruolo--${v.ruolo}`}>{ruolo}</span> : null}
          <span className="fnov-ver__spazio" />
          {!aperta && v.voci.length > 0 ? <span className="fnov-ver__conta">{v.voci.length === 1 ? '1 voce' : `${v.voci.length} voci`}</span> : null}
          {data !== undefined ? <time className="fnov-ver__data" dateTime={v.data}>{data}</time> : null}
        </button>
      </h2>
      {aperta ? (
        v.voci.length > 0 ? (
          <ul className="fnov-ver__voci">
            {v.voci.map((x, i) => (
              <li key={i} className="fnov-voce">
                {x.titolo !== undefined ? <span className="fnov-voce__titolo">{x.titolo}</span> : null}
                {x.testo.length > 0 ? <span className="fnov-voce__testo"><Pezzi pezzi={x.testo} /></span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="fnov__piccolo fnov-ver__vuota">Nessuna nota scritta per questa versione.</p>
      ) : null}
    </article>
  )
}
