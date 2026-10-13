import { TendinaMenu } from './TendinaMenu'
import { useCallback, useEffect, useState } from 'react'
import { MappaPc } from './MappaPc'
import type { AzioneSalute, Salute, VoceSalute } from '@shared/salute'
import { inCorso, type AvanzamentoInstallaLa } from '@shared/installa-la'
import type { NoteAggiornamento } from '@shared/note-aggiornamento'
import { ModaleNote } from './ModaleNote'
import { AltriComputer } from './PannelloAccount'
import { PannelloConsumi } from './PannelloConsumi'
import { voceMenu } from '@shared/menu-principale'
import { Aiuto } from './Aiuto'
import { breve, contaGruppiSalute, GRUPPI_SALUTE, gruppoIniziale, nelGruppoSalute, statoVoce, type GruppoSalute } from '@shared/salute-vista'
import type { Colore, StatoVista } from '@shared/stato-vista'

const COLORE_SALUTE: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

/**
 * «Salute del sistema» (0.44.0): com'è messo SierraDeck, in un posto solo.
 *
 * Il Drive (collegato o no, perché, da quando), gli altri PC (ultimo
 * battito, la strada con cui si raggiungono, la versione), l'aggiornamento
 * non riuscito, gli errori delle ultime ore dal registro, le istruzioni degli
 * autopiloti non partite. Ogni voce spiega cosa guarda e cosa fare, e ha il
 * tasto che lo fa quando si può. Le regole stanno in `src/shared/salute.ts`
 * (uguali per il telefono).
 */

type Props = {
  onChiudi: () => void
  onApriDrive: () => void
  onInstalla: () => void
  onApriAutopiloti: () => void
  /** Apre o chiude la colonna «Consumi e limiti» accanto alle chat (0.61.0: il suo tasto è qui). */
  onConsumi?: () => void
  consumiAperti?: boolean
}


export function PannelloSalute({ onChiudi, onApriDrive, onInstalla, onApriAutopiloti, onConsumi, consumiAperti = false }: Props): React.JSX.Element {
  /** Le parti in fondo (0.61.0): gli altri computer e i consumi, aperte a richiesta. */
  const [parte, setParte] = useState<'altri-pc' | 'consumi' | undefined>(undefined)
  const [mappa, setMappa] = useState(false)
  const [salute, setSalute] = useState<Salute | undefined>(undefined)
  const [leggo, setLeggo] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const leggi = useCallback((): void => {
    setLeggo(true)
    window.gestore.salute.leggi().then((s) => { setSalute(s); setErrore(undefined) })
      .catch((e: unknown) => setErrore(String(e))).finally(() => setLeggo(false))
  }, [])
  useEffect(() => {
    leggi()
    const t = setInterval(leggi, 60_000)
    return () => clearInterval(t)
  }, [leggi])

  // «Installa là» (0.46.0): l'avanzamento di ogni PC che si sta aggiornando da qui.
  const [installazioni, setInstallazioni] = useState<Record<string, AvanzamentoInstallaLa>>({})
  const [conferma, setConferma] = useState<{ pc: string; nome: string; versione: string; note?: NoteAggiornamento } | undefined>(undefined)
  useEffect(() => {
    void window.gestore.salute.installaLaStato().then((l) => setInstallazioni(Object.fromEntries(l.map((a) => [a.pcId, a]))))
    return window.gestore.salute.suInstallaLa((a) => {
      setInstallazioni((p) => ({ ...p, [a.pcId]: a }))
      if (a.fase === 'fatto') leggi()
    })
  }, [leggi])
  const chiediConferma = (pc: string, versione: string): void => {
    const nome = salute?.voci.find((v) => v.chiave === `pc:${pc}`)?.titolo.split(' · ')[0] ?? pc
    setConferma({ pc, nome, versione })
    window.gestore.salute.noteInstallaLa(pc)
      .then((note) => setConferma((c) => (c?.pc === pc ? { ...c, note } : c)))
      .catch((e: unknown) => setConferma((c) => (c?.pc === pc ? { ...c, note: { versione, installata: '', note: [], fonte: 'nessuna', dove: 'https://github.com/niko9090/sierradeck/releases', avviso: `Non sono riuscito a leggere le note (${String(e)}): le trovi nella pagina delle versioni, https://github.com/niko9090/sierradeck/releases. Puoi installare lo stesso.` } } : c)))
  }

  const esegui = (a: AzioneSalute): void => {
    switch (a.id) {
      case 'apri-drive': onApriDrive(); break
      case 'apri-registro': void window.gestore.log.apri(); break
      case 'installa': onInstalla(); break
      case 'scarica-a-mano': void window.gestore.sistema.apriEsterno(a.url); break
      case 'apri-autopilota': onApriAutopiloti(); break
      case 'riprova-pc': leggi(); break
      case 'installa-la': chiediConferma(a.pc, a.versione); break
    }
  }

  // ── La vista (0.70.0): gruppi, una riga per voce con la sua parola, il dettaglio a destra ──
  const voci = (salute?.voci ?? []) as Array<VoceSalute & { stato?: StatoVista; breve?: string }>
  const conti = contaGruppiSalute(voci)
  const [gruppoScelto, setGruppoScelto] = useState<GruppoSalute | undefined>(undefined)
  const gruppo = gruppoScelto ?? gruppoIniziale(salute)
  const visibili = voci.filter((v) => nelGruppoSalute(v, gruppo))
  const [scelta, setScelta] = useState<string | undefined>(undefined)
  const [menu, setMenu] = useState(false)
  const sel = voci.find((v) => v.chiave === scelta)
  // Il riquadro di destra: una voce, oppure uno strumento (altri computer, consumi, mappa).
  const destra = parte !== undefined || sel !== undefined || mappa
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || conferma !== undefined) return
      if (menu) setMenu(false)
      else if (parte !== undefined || mappa) { setParte(undefined); setMappa(false) }
      else if (scelta !== undefined) setScelta(undefined)
      else onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  })
  const azioniDi = (v: VoceSalute): React.JSX.Element | null => v.azioni.length === 0 ? null : (
    <>
      {v.azioni.map((a) => {
        const occupato = a.id === 'installa-la' && inCorso(installazioni[a.pc])
        return <button key={a.id + a.testo} className="tasto tasto--mini" disabled={occupato} onClick={(e) => { e.stopPropagation(); esegui(a) }}>{occupato ? 'Installazione in corso…' : a.testo}</button>
      })}
    </>
  )

  return (
    <div className="progetti salute" role="dialog" aria-label="Salute">
      <div className="progetti__testa">
        <span className="progetti__titolo">{voceMenu('salute').icona} Salute</span>
        {salute !== undefined ? <span className={`salute__tono salute__tono--${salute.tono}`}>{salute.riassunto}</span> : null}
        <div className="progetti__gruppi" role="tablist">
          {GRUPPI_SALUTE.map((g) => (
            <button key={g.id} role="tab" aria-selected={gruppo === g.id} className={`progetti__gruppo${gruppo === g.id ? ' progetti__gruppo--acceso' : ''}${g.id === 'sistemare' && conti.sistemare > 0 ? ' progetti__gruppo--ambra' : ''}`} onClick={() => { setGruppoScelto(g.id); setScelta(undefined) }}>
              {g.testo} <span className="progetti__conto">{conti[g.id]}</span>
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={leggo}>{leggo ? 'Guardo…' : 'Aggiorna'}</button>
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini" aria-expanded={menu} onClick={() => setMenu(!menu)}>Strumenti ▾</button>
          {menu ? (
            <TendinaMenu onChiudi={() => setMenu(false)}>
              <button className="progetti__voce" title="I PC che usano lo stesso Drive: acceso o spento, versione, le chat che hanno aperte (da guardare dal vivo) e la cassetta" onClick={() => { setMenu(false); setScelta(undefined); setMappa(false); setParte('altri-pc') }}>Gli altri computer</button>
              <button className="progetti__voce" title="La mappa dei PC, con la strada di ognuno" onClick={() => { setMenu(false); setScelta(undefined); setParte(undefined); setMappa(true) }}>Mappa dei PC</button>
              <button className="progetti__voce" title="I token per giorno e per chat, i limiti del piano e le regole del freno" onClick={() => { setMenu(false); setScelta(undefined); setMappa(false); setParte('consumi') }}>Consumi per esteso</button>
              <button className="progetti__voce" title="La colonna «Consumi e limiti» accanto alle chat, che resta aperta mentre lavori" onClick={() => { setMenu(false); onConsumi?.(); if (consumiAperti !== true) onChiudi() }}>{consumiAperti ? 'Chiudi la colonna dei consumi' : 'Consumi e limiti (colonna)'}</button>
              <button className="progetti__voce" onClick={() => { setMenu(false); void window.gestore.log.apri() }}>Apri la cartella del registro</button>
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Salute">Com’è messo SierraDeck, in un posto solo: il Drive, gli altri PC (ultimo segno, strada, versione, quanto lavorano), un aggiornamento non installato, gli errori delle ultime ore, le istruzioni degli autopiloti non partite. Clic su una voce: il perché e cosa fare. Si rilegge da sola ogni minuto; «Aggiorna» bussa di nuovo agli altri PC adesso.</Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {errore !== undefined ? <div className="progetti__striscia">⚠ Non riesco a leggere lo stato: {errore}</div> : null}

      <div className={`progetti__corpo${destra ? ' progetti__corpo--destra' : ''}`}>
        <div className="progetti__tabella" role="grid">
          <div className="progetti__riga progetti__riga--testa" role="row">
            <span className="progetti__cella">Stato</span>
            <span className="progetti__cella">Cosa</span>
            <span className="progetti__cella" />
          </div>
          {salute === undefined && errore === undefined ? <div className="progetti__vuoto">Guardo il Drive, busso agli altri PC e leggo il registro…</div> : null}
          {salute !== undefined && visibili.length === 0 ? <div className="progetti__vuoto">{gruppo === 'sistemare' ? <span style={{ color: 'var(--verde)' }}>Tutto a posto</span> : 'Niente in questo gruppo.'}</div> : null}
          {visibili.map((v) => {
            const st = v.stato ?? statoVoce(v)
            const acceso = v.chiave === scelta
            const inst = v.chiave.startsWith('pc:') ? installazioni[v.chiave.slice(3)] : undefined
            return (
              <div key={v.chiave} role="row" tabIndex={0} aria-selected={acceso}
                className={`progetti__riga${acceso ? ' progetti__riga--scelta' : ''}`}
                onClick={() => { setScelta(acceso ? undefined : v.chiave); setParte(undefined); setMappa(false) }}>
                <span className="progetti__cella"><span style={{ color: COLORE_SALUTE[st.colore] }}>● {inst !== undefined && inCorso(inst) ? 'installa' : st.parola}</span></span>
                <span className="progetti__cella" title={v.titolo}>{v.breve ?? breve(v.titolo)}</span>
                <span className="progetti__cella" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>{azioniDi(v)}</span>
              </div>
            )
          })}
        </div>

        {parte === 'altri-pc' ? (
          <div className="progetti__dettaglio salute__largo">
            <div className="progetti__dtesta"><span className="progetti__dtitolo">Gli altri computer</span><button className="tasto tasto--mini" onClick={() => setParte(undefined)} aria-label="Chiudi">×</button></div>
            <div className="progetti__dcorpo"><AltriComputer /></div>
          </div>
        ) : parte === 'consumi' ? (
          <div className="progetti__dettaglio salute__largo">
            <div className="progetti__dtesta"><span className="progetti__dtitolo">Consumi</span><button className="tasto tasto--mini" onClick={() => setParte(undefined)} aria-label="Chiudi">×</button></div>
            <div className="progetti__dcorpo"><PannelloConsumi incorporato /></div>
          </div>
        ) : mappa ? (
          <div className="progetti__dettaglio">
            <div className="progetti__dtesta"><span className="progetti__dtitolo">Mappa dei PC</span><button className="tasto tasto--mini" onClick={() => setMappa(false)} aria-label="Chiudi">×</button></div>
            <div className="progetti__dcorpo">{salute?.mappa !== undefined ? <MappaPc mappa={salute.mappa} /> : <div className="progetti__quieto">Nessun altro PC.</div>}</div>
          </div>
        ) : sel !== undefined ? (
          <div className="progetti__dettaglio">
            <div className="progetti__dtesta">
              <span className="progetti__dtitolo" title={sel.titolo}>{sel.breve ?? breve(sel.titolo, 60)}</span>
              <button className="tasto tasto--mini" onClick={() => setScelta(undefined)} aria-label="Chiudi il dettaglio">×</button>
            </div>
            <div style={{ padding: '0 16px 4px' }}>
              {(() => { const st = sel.stato ?? statoVoce(sel); return <span className="progetti__pillola" style={{ color: COLORE_SALUTE[st.colore], borderColor: COLORE_SALUTE[st.colore] }}>{st.parola}</span> })()}
            </div>
            {sel.azioni.length > 0 ? <div className="progetti__azioni">{azioniDi(sel)}</div> : null}
            <div className="progetti__dcorpo">
              <div className="progetti__voceelenco" style={{ alignItems: 'flex-start' }}>{sel.titolo}</div>
              <div className="progetti__sezione">
                <span className="serigrafia">Perché</span>
                <div className="progetti__quieto" style={{ whiteSpace: 'pre-wrap' }}>{sel.spiegazione}</div>
              </div>
              {sel.cosaFare !== undefined ? (
                <div className="progetti__sezione">
                  <span className="serigrafia">Cosa fare</span>
                  <div>{sel.cosaFare}</div>
                </div>
              ) : null}
              {(() => {
                const inst = sel.chiave.startsWith('pc:') ? installazioni[sel.chiave.slice(3)] : undefined
                if (inst === undefined) return null
                const tono = inst.fase === 'fatto' ? 'ok' : inCorso(inst) ? 'attenzione' : 'guasto'
                return (
                  <div className={`salute__voce salute__voce--${tono}`}>
                    <div className="salute__titolo">Installa là{inst.a !== undefined ? ` la ${inst.a}` : ''}: {inst.fase === 'fatto' ? 'fatto' : inst.fase === 'fallito' ? 'non riuscita' : inst.fase === 'errore' ? 'fermata' : 'in corso'}</div>
                    <div className="salute__testo">{inst.messaggio}</div>
                    {inst.cosaFare !== undefined ? <div className="salute__testo"><b>Cosa fare:</b> {inst.cosaFare}</div> : null}
                    {inst.pagina !== undefined ? <div className="salute__azioni"><button className="tasto tasto--mini" onClick={() => { void window.gestore.sistema.apriEsterno(inst.pagina as string) }}>Pagina della versione</button></div> : null}
                  </div>
                )
              })()}
            </div>
          </div>
        ) : null}
      </div>
      {conferma !== undefined ? (
        <ModaleNote
          titolo={`Installa là: ${conferma.nome} alla ${conferma.note?.versione !== undefined && conferma.note.versione !== '' ? conferma.note.versione : conferma.versione}`}
          {...(conferma.note !== undefined && conferma.note.installata !== '' ? { sotto: `${conferma.nome} adesso ha la ${conferma.note.installata}` } : {})}
          note={conferma.note?.note}
          etichetta={(n, i) => (i === 0 ? `La ${n.versione} (quella che si installa)` : `Saltata: ${n.versione}`)}
          {...(conferma.note?.avviso !== undefined ? { avviso: conferma.note.avviso } : {})}
          spiegazione={<>Premendo «Installa su {conferma.nome}», {conferma.nome} scarica la versione (se non l’ha già), poi <b>aspetta che le sue chat finiscano il turno</b> e il lavoro con il Drive, si chiude, installa e riparte; le chat là riprendono da sole. Qui sotto la sua voce vedi ogni passo e com’è finita, anche se l’installazione non riesce. Su {conferma.nome} non devi fare niente; se c’è qualcuno davanti, vedrà l’aggiornamento in corso.</>}
          tasti={<>
            <button className="tasto" onClick={() => setConferma(undefined)}>Non ora</button>
            <button className="tasto tasto--primario" autoFocus onClick={() => {
              const pc = conferma.pc
              setConferma(undefined)
              void window.gestore.salute.installaLa(pc).then((a) => setInstallazioni((p) => ({ ...p, [a.pcId]: a })))
            }}>Installa su {conferma.nome}</button>
          </>}
          onChiudi={() => setConferma(undefined)}
        />
      ) : null}
    </div>
  )
}
