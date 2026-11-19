import { TendinaMenu } from './TendinaMenu'
import { useCallback, useEffect, useState } from 'react'
import type { AzioneSalute, Salute, VoceSalute } from '@shared/salute'
import { CHIAVE_SALUTE_COMPUTER, saluteSenzaPc } from '@shared/computer-vista'
import { PannelloConsumi } from './PannelloConsumi'
import { voceMenu } from '@shared/menu-principale'
import { Aiuto } from './Aiuto'
import { LiberaSpazioDrive } from './LiberaSpazioDrive'
import { breve, contaGruppiSalute, GRUPPI_SALUTE, gruppoIniziale, nelGruppoSalute, statoVoce, type GruppoSalute } from '@shared/salute-vista'
import type { Colore, StatoVista } from '@shared/stato-vista'

const COLORE_SALUTE: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

/**
 * «Salute del sistema» (0.44.0): com'è messo SierraDeck, in un posto solo.
 *
 * Il Drive (collegato o no, perché, da quando), l'aggiornamento non
 * riuscito, gli errori delle ultime ore dal registro, le istruzioni degli
 * autopiloti non partite, i consumi. Ogni voce spiega cosa guarda e cosa
 * fare, e ha il tasto che lo fa quando si può. Le regole stanno in
 * `src/shared/salute.ts` (uguali per il telefono).
 *
 * I computer (elenco, mappa, aggiornarli, dismetterli) stanno nella pagina
 * Computer (k-u5): qui resta solo una voce che dice quanti guardare e vi rimanda.
 */

/** Il segnale che apre la pagina Computer (lo ascolta chi disegna le pagine). */
export const EVENTO_APRI_COMPUTER = 'sierradeck:rete-pc'

type Props = {
  onChiudi: () => void
  onApriDrive: () => void
  onInstalla: () => void
  onApriAutopiloti: () => void
  /** Si apre già sui consumi (dall'avviso dei limiti). */
  suiConsumi?: boolean
}


export function PannelloSalute({ onChiudi, onApriDrive, onInstalla, onApriAutopiloti, suiConsumi = false }: Props): React.JSX.Element {
  /** I consumi in fondo, aperti a richiesta. */
  const [parte, setParte] = useState<'consumi' | undefined>(suiConsumi ? 'consumi' : undefined)
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

  const apriComputer = (): void => { window.dispatchEvent(new Event(EVENTO_APRI_COMPUTER)) }

  const [libera, setLibera] = useState(false)
  const esegui = (a: AzioneSalute): void => {
    switch (a.id) {
      case 'apri-drive': onApriDrive(); break
      case 'apri-registro': void window.gestore.log.apri(); break
      case 'libera-spazio': setLibera(true); break
      case 'installa': onInstalla(); break
      case 'scarica-a-mano': void window.gestore.sistema.apriEsterno(a.url); break
      case 'apri-autopilota': onApriAutopiloti(); break
    }
  }

  // ── La vista (0.70.0): gruppi, una riga per voce con la sua parola, il dettaglio a destra ──
  // k-u5: senza l'elenco dei PC (sta in Computer) e senza la scheda «Computer».
  const { voci: vociSenzaPc } = saluteSenzaPc(salute?.voci ?? [])
  const voci = vociSenzaPc as Array<VoceSalute & { stato?: StatoVista; breve?: string }>
  const gruppiVisti = GRUPPI_SALUTE.filter((g) => g.id !== 'computer')
  const conti = contaGruppiSalute(voci)
  const [gruppoScelto, setGruppoScelto] = useState<GruppoSalute | undefined>(undefined)
  const iniziale = gruppoIniziale(salute)
  const gruppo = gruppoScelto ?? (iniziale === 'computer' ? 'sistemare' : iniziale)
  const visibili = voci.filter((v) => nelGruppoSalute(v, gruppo))
  const [scelta, setScelta] = useState<string | undefined>(undefined)
  const [menu, setMenu] = useState(false)
  const sel = voci.find((v) => v.chiave === scelta)
  // Il riquadro di destra: una voce, oppure i consumi.
  const destra = parte !== undefined || sel !== undefined
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(false)
      else if (parte !== undefined) setParte(undefined)
      else if (scelta !== undefined) setScelta(undefined)
      else onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  })
  const azioniDi = (v: VoceSalute): React.JSX.Element | null => v.chiave === CHIAVE_SALUTE_COMPUTER
    ? <button className="tasto tasto--mini" onClick={(e) => { e.stopPropagation(); apriComputer() }}>Apri Computer</button>
    : v.azioni.length === 0 ? null : (
      <>
        {v.azioni.map((a) => <button key={a.id + a.testo} className="tasto tasto--mini" onClick={(e) => { e.stopPropagation(); esegui(a) }}>{a.testo}</button>)}
      </>
    )

  return (
    <div className="progetti salute" role="dialog" aria-label="Salute">
      <div className="progetti__testa">
        <span className="progetti__titolo">{voceMenu('salute').icona} Salute</span>
        {salute !== undefined ? <span className={`salute__tono salute__tono--${salute.tono}`}>{salute.riassunto}</span> : null}
        <div className="progetti__gruppi" role="tablist">
          {gruppiVisti.map((g) => (
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
              <button className="progetti__voce" title="Tutti i computer: albero, elenco e mappa" onClick={() => { setMenu(false); apriComputer() }}>Computer</button>
              <button className="progetti__voce" title="I token per giorno e per chat, i limiti del piano e le regole del freno" onClick={() => { setMenu(false); setScelta(undefined); setParte('consumi') }}>Consumi per esteso</button>
              <button className="progetti__voce" onClick={() => { setMenu(false); void window.gestore.log.apri() }}>Apri la cartella del registro</button>
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Salute">Com’è messo SierraDeck: il Drive, un aggiornamento non installato, gli errori delle ultime ore, le istruzioni degli autopiloti non partite, i consumi. Clic su una voce: il perché e cosa fare. I computer (stato, versione, chat, aggiornarli) stanno nella pagina Computer: qui compare solo una voce se ce n’è uno da guardare. Si rilegge da sola ogni minuto.</Aiuto>
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
            return (
              <div key={v.chiave} role="row" tabIndex={0} aria-selected={acceso}
                className={`progetti__riga${acceso ? ' progetti__riga--scelta' : ''}`}
                onClick={() => { setScelta(acceso ? undefined : v.chiave); setParte(undefined) }}>
                <span className="progetti__cella"><span style={{ color: COLORE_SALUTE[st.colore] }}>● {st.parola}</span></span>
                <span className="progetti__cella" title={v.titolo}>{v.breve ?? breve(v.titolo)}</span>
                <span className="progetti__cella" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>{azioniDi(v)}</span>
              </div>
            )
          })}
        </div>

        {parte === 'consumi' ? (
          <div className="progetti__dettaglio salute__largo">
            <div className="progetti__dtesta"><span className="progetti__dtitolo">Consumi</span><button className="tasto tasto--mini" onClick={() => setParte(undefined)} aria-label="Chiudi">×</button></div>
            <div className="progetti__dcorpo"><PannelloConsumi incorporato /></div>
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
            {azioniDi(sel) !== null ? <div className="progetti__azioni">{azioniDi(sel)}</div> : null}
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
            </div>
          </div>
        ) : null}
      </div>
      {libera ? <LiberaSpazioDrive drivePieno onChiudi={() => { setLibera(false); leggi() }} /> : null}
    </div>
  )
}
