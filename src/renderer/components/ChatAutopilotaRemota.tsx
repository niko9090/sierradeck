import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conversazione, haDomandaAperta, staPensando } from '@shared/chat-autopilota'
import { autopilotaDelPcRemoto, letturaSpecialisti, rigaPcNonRisponde, type EsitoAzione, type LetturaSpecialisti } from '@shared/autopilota-remoto'
import { chiaveWorkspace } from '@shared/coda-richieste'
import { Aiuto } from './Aiuto'
import { CampoChatAutopilota } from './CampoChatAutopilota'
import { FlussoChat } from './ChatAutopilota'
import { RigaDalVivo } from './DalVivoAutopilota'
import { ElencoMenuSpecialisti } from './MenuSpecialisti'

/**
 * **La chat dell'autopilota di un workspace che sta su un altro PC** (k-60,
 * Nicholas 06/11: «nella chat remota io devo avere la chat dell'autopilota
 * remotata e sul fianco una lista di agenti in lavorazione così mi rendo
 * conto della situazione»).
 *
 * Come quella di qui, ma i dati sono del PC dove gira: la conversazione, le
 * domande e lo stato arrivano dalle sue rotte, e quello che scrivi o
 * rispondi va a lui. In una colonna accanto, chi lavora là e chi aspetta.
 * Se quel PC è spento o non risponde, una riga lo dice e resta l'ultima cosa
 * vista.
 */

/** Ogni quanto si rilegge la conversazione e la lista (come la chat di qui, un poco più calmo: passa dalla rete). */
export const RILEGGI_CHAT_MS = 3000
export const RILEGGI_LISTA_MS = 4000

type Azione = (percorso: string, corpo: Record<string, unknown>) => Promise<EsitoAzione>

/** L'azione sul PC remoto, con la riga «non risponde» se la chiamata stessa cade. */
function azioneSu(pcId: string): Azione {
  return (percorso, corpo) =>
    window.gestore.autopilotiAltri.azione(pcId, percorso, corpo).catch((e: unknown): EsitoAzione => ({ ok: false, stato: 502, messaggio: e instanceof Error ? e.message : String(e) }))
}

/** La riga che dice che quel PC non risponde (una sola, chiara). */
export function RigaPcGiu({ pcNome }: { pcNome: string }): React.JSX.Element {
  return <div className="chatap__pensa chatap__pensa--giu" role="status">● {rigaPcNonRisponde(pcNome)}</div>
}

export type Stato = {
  autopilota?: Autopilota
  /** Il PC risponde ma il workspace non ha ancora un autopilota. */
  nessuno?: boolean
  giu: boolean
}

/** Legge dal PC remoto l'autopilota del workspace, ogni pochi secondi, finché il componente c'è. */
export function useAutopilotaRemoto(pcId: string | undefined, workspace: string): { stato: Stato; rileggi: () => void } {
  const [stato, setStato] = useState<Stato>({ giu: false })
  const id = useRef<string | undefined>(undefined)
  const vivo = useRef(true)
  const inViaggio = useRef(false)
  const leggi = useCallback(async (): Promise<void> => {
    if (inViaggio.current || pcId === undefined) return
    inViaggio.current = true
    try {
      if (id.current === undefined) {
        const r = await window.gestore.autopilotiAltri.diPc(pcId)
        if (!vivo.current) return
        if (r.errore !== undefined) { setStato((s) => ({ ...s, giu: true })); return }
        const riga = autopilotaDelPcRemoto(r.autopiloti, workspace)
        if (riga === undefined) { setStato({ nessuno: true, giu: false }); return }
        id.current = riga.id
      }
      const e = await azioneSu(pcId)('/api/autopilota', { autopilota: id.current })
      if (!vivo.current) return
      if (!e.ok) {
        // 404: là non c'è più; si rilegge l'elenco al giro dopo. Il resto: non risponde.
        if (e.stato === 404) id.current = undefined
        setStato((s) => ({ ...s, giu: e.stato !== 404 }))
        return
      }
      setStato({ autopilota: e.dati as Autopilota, giu: false })
    } catch {
      if (vivo.current) setStato((s) => ({ ...s, giu: true }))
    } finally {
      inViaggio.current = false
    }
  }, [pcId, workspace])
  useEffect(() => {
    vivo.current = true
    id.current = undefined
    setStato({ giu: false })
    if (pcId === undefined) return () => { vivo.current = false }
    void leggi()
    const t = setInterval(() => { void leggi() }, RILEGGI_CHAT_MS)
    return () => { vivo.current = false; clearInterval(t) }
  }, [leggi, pcId])
  return { stato, rileggi: () => { void leggi() } }
}

/** La chat con l'autopilota che gira su un altro PC. */
export function ChatAutopilotaRemota({ pcId, pcNome, stato, rileggi }: { pcId: string; pcNome: string; stato: Stato; rileggi: () => void }): React.JSX.Element {
  const autopilota = stato.autopilota
  const flusso = useRef<HTMLDivElement | null>(null)
  const battute = useMemo(() => {
    if (autopilota === undefined) return []
    return conversazione(autopilota).filter((b) => b.tono !== 'traguardo')
  }, [autopilota])
  const pensa = autopilota !== undefined && staPensando(autopilota)
  const domanda = autopilota !== undefined && haDomandaAperta(autopilota)
  useEffect(() => {
    const el = flusso.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [battute.length, pensa])
  const sul = azioneSu(pcId)
  const rispondi = async (idDomanda: string, risposta: string): Promise<void> => {
    const e = await sul('/api/rispondi', { domanda: idDomanda, risposta })
    if (!e.ok) throw new Error(e.messaggio)
  }
  const invia = async (testo: string): Promise<void> => {
    if (autopilota === undefined) return
    const e = await sul('/api/autopilota/dialogo', { autopilota: autopilota.id, testo })
    if (!e.ok) throw new Error(e.messaggio)
  }
  return (
    <section className="chatap chatap--remota" aria-label={`Chat con l’autopilota su ${pcNome}`}>
      <div className="chatap__testa">
        <span className="serigrafia">Autopilota · su {pcNome}</span>
        <Aiuto di="autopilota su un altro PC">Questo è l’autopilota del workspace, che lavora su {pcNome}. La conversazione, le domande e lo stato arrivano da là ogni pochi secondi; quello che scrivi o rispondi va a lui. Se {pcNome} è spento o non risponde, qui resta l’ultima cosa vista e il messaggio non parte: riprova quando torna. Gli specialisti al lavoro sono nella colonna accanto.</Aiuto>
      </div>
      {stato.giu ? <RigaPcGiu pcNome={pcNome} /> : null}
      {autopilota === undefined ? (
        <div className="chatap__flusso" ref={flusso}>
          <p className="chatap__pensa">
            {stato.giu ? '' : stato.nessuno === true ? `● Su ${pcNome} questo workspace non ha ancora un autopilota.` : `● Leggo l’autopilota su ${pcNome}…`}
          </p>
        </div>
      ) : (
        <>
          <RigaDalVivo autopilota={autopilota} senzaStato />
          <FlussoChat
            battute={battute}
            nome={autopilota.nome}
            pensa={pensa}
            domanda={domanda}
            onCambiato={rileggi}
            flusso={flusso}
            rispondi={rispondi}
            doveLeDomande="rispondi con i tasti qui sopra, o scrivi qui sotto"
          />
          <CampoChatAutopilota autopilotaId={`${pcId}:${autopilota.id}`} onCambiato={rileggi} campoPronto={false} invia={invia} />
        </>
      )}
    </section>
  )
}

/** La colonna di fianco: chi lavora su quel PC (con percentuale, cosa fa, quanto manca) e chi è in fila. */
export function ColonnaSpecialistiRemoti({ pcId, pcNome, riferimenti }: { pcId: string; pcNome: string; riferimenti?: string[] }): React.JSX.Element {
  const [lettura, setLettura] = useState<LetturaSpecialisti | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    let inViaggio = false
    const leggi = (): void => {
      if (inViaggio) return
      inViaggio = true
      azioneSu(pcId)('/api/specialisti/attesa', {})
        .then((e) => { if (vivo) setLettura((prima) => { const n = letturaSpecialisti(e, pcNome); return prima !== undefined && JSON.stringify(prima) === JSON.stringify(n) ? prima : n }) })
        .finally(() => { inViaggio = false })
    }
    setLettura(undefined)
    leggi()
    const t = setInterval(leggi, RILEGGI_LISTA_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [pcId, pcNome])
  const nulla = (): void => undefined
  return (
    <aside className="colspec-remota" aria-label={`Specialisti su ${pcNome}`}>
      <div className="chatap__testa">
        <span className="serigrafia">Specialisti · su {pcNome}</span>
      </div>
      {lettura === undefined ? <div className="menuspec__vuoto">Leggo la lista…</div> : null}
      {lettura !== undefined && lettura.tipo !== 'lista' ? <div className="chatap__pensa chatap__pensa--giu" role="status">● {lettura.avviso}</div> : null}
      {lettura !== undefined && lettura.tipo === 'lista' ? (
        <ElencoMenuSpecialisti vista={lettura.vista} riferimenti={riferimenti ?? []} soloLettura onMossa={nulla} onFerma={nulla} onAnnullaFerma={nulla} onApriSezione={nulla} />
      ) : null}
    </aside>
  )
}

/** Le due cose insieme, per un workspace aperto da un altro PC: la chat dell'autopilota e, di fianco, gli specialisti. */
export function AutopilotaRemoto({ pcId, pcNome, workspace }: { pcId: string; pcNome: string; workspace: string }): React.JSX.Element {
  const { stato, rileggi } = useAutopilotaRemoto(pcId, workspace)
  const a = stato.autopilota
  // I modi in cui quel PC chiama questo workspace: chi lavora lì sta in testa, in evidenza.
  const riferimenti = a === undefined ? [workspace] : [chiaveWorkspace(a), a.cwd, a.workspace ?? workspace]
  return (
    <>
      <aside className="pan-colonna pan-colonna--remota" aria-label={`L’autopilota su ${pcNome}`}>
        <ChatAutopilotaRemota pcId={pcId} pcNome={pcNome} stato={stato} rileggi={rileggi} />
      </aside>
      <ColonnaSpecialistiRemoti pcId={pcId} pcNome={pcNome} riferimenti={riferimenti} />
    </>
  )
}
