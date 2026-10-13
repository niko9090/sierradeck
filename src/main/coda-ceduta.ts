import { consegnaDaIdTesto } from './autopilota-consegne'

/**
 * I testi di un autopilota ancora in coda quando una chat esce dal sottofondo
 * e passa in un riquadro (0.71.0).
 *
 * Le strade sono due: una finestra apre il workspace e **adotta** la chat
 * (`pty:spawn`), oppure una finestra torna nel workspace che teneva acceso il
 * suo terminale e lo **riaggancia**. Fino alla 0.70.0 solo la prima rimandava i
 * testi alla finestra: con la seconda il registro scriveva «1 testi ancora in
 * coda: restano a te» e nessuno li scriveva più. Il 13/10 un'istruzione
 * dell'autopilota (c-14) è sparita così, con la coda del servizio vuota perché
 * la consegna risultava già presa.
 *
 * Qui la regola per tutte e due: ogni testo va alla finestra che ora mostra la
 * chat **con l'id della consegna del servizio** (non quello del testo), così il
 * «partita» scritto dalla finestra arriva al servizio e solo allora il messaggio
 * esce dalla coda. Se nessuna finestra la mostra entro un minuto torna nel
 * sottofondo; se nemmeno lì si può, torna nella coda dell'autopilota. Mai
 * segnato consegnato prima di «partita».
 */
export type CodaCeduta = {
  sessione: string
  cwd: string
  titolo: string
  coda: { id: string; testo: string }[]
  autopilota?: { id: string; chat: string }
  workspace?: string
}

export type ConsegnaDallaCoda = {
  id: string
  autopilotaId: string
  chatId: string
  cwd: string
  sessionId: string
  titolo: string
  cosa: 'scrivi'
  testo: string
  workspace?: string
}

export type DipCodaCeduta = {
  /** La finestra che mostra adesso quella conversazione, se c'è. */
  finestraCon: (sessione: string) => ((c: ConsegnaDallaCoda) => void) | undefined
  /** Di nuovo in sottofondo: `false` se non si è potuto. */
  rimettiInSottofondo: (c: CodaCeduta, t: { id: string; testo: string }) => boolean
  /** Alla coda dell'autopilota: la consegna non è arrivata. */
  nonConsegnata: (consegna: string, perche: string) => void
  log: (m: string) => void
  dopo: (ms: number, f: () => void) => void
}

/** Ogni quanto si cerca la finestra, e per quante volte (un minuto in tutto). */
export const ATTESA_FINESTRA_MS = 1500
export const TENTATIVI_FINESTRA = 40

/** La consegna per la finestra, con l'id del servizio (`c-14`) ricavato da quello del testo (`ap-c-14-…`). */
export function consegnaDallaCoda(c: CodaCeduta, t: { id: string; testo: string }): ConsegnaDallaCoda | undefined {
  if (c.autopilota === undefined) return undefined
  return {
    id: consegnaDaIdTesto(t.id) ?? t.id,
    autopilotaId: c.autopilota.id,
    chatId: c.autopilota.chat,
    cwd: c.cwd,
    sessionId: c.sessione,
    titolo: c.titolo,
    cosa: 'scrivi',
    testo: t.testo,
    ...(c.workspace !== undefined ? { workspace: c.workspace } : {})
  }
}

export function riconsegnaCodaCeduta(c: CodaCeduta, d: DipCodaCeduta, tentativo = 0): void {
  if (c.autopilota === undefined || c.coda.length === 0) return
  const manda = d.finestraCon(c.sessione)
  if (manda === undefined) {
    if (tentativo < TENTATIVI_FINESTRA) { d.dopo(ATTESA_FINESTRA_MS, () => riconsegnaCodaCeduta(c, d, tentativo + 1)); return }
    d.log(`[consegna] «${c.titolo}»: ${c.coda.length} istruzioni dell’autopilota erano in coda in sottofondo, ma nessuna finestra mostra la chat dopo 60 s: le rimetto in sottofondo`)
    for (const t of c.coda) {
      if (d.rimettiInSottofondo(c, t)) continue
      const id = consegnaDaIdTesto(t.id) ?? t.id
      d.log(`[consegna] consegna ${id}: non consegnata (né finestra né sottofondo): torna nella coda dell’autopilota`)
      d.nonConsegnata(id, 'la chat è uscita dal sottofondo e nessuna finestra l’ha presa')
    }
    return
  }
  for (const t of c.coda) {
    const consegna = consegnaDallaCoda(c, t)
    if (consegna === undefined) continue
    d.log(`[consegna] ${consegna.id} per «${c.titolo}»: la chat è passata in un riquadro, l’istruzione ancora in coda va lì (parte quando la chat è pronta, conferma «partita»)`)
    manda(consegna)
  }
}
