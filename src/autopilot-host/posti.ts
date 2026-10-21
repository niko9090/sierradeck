import { chatAlLavoro, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * Le regole del servizio sui posti delle chat (0.82.0): quante lavorano su
 * questo PC, quante ne può aprire ancora un autopilota, quali chat finite si
 * chiudono da sole. Il numero dei posti lo calcola `@shared/posti-chat`.
 */

/**
 * Le chat degli autopiloti al lavoro su questo PC, tutti insieme.
 *
 * Come `chiatteAttive`: chi aspetta una risposta (`bloccata`) o è in pausa per
 * i limiti del piano non occupa un posto. Un autopilota con una chat sola (senza
 * flotta) al lavoro ne occupa uno.
 */
export function chatAlLavoroSulPc(autopiloti: Autopilota[]): number {
  let n = 0
  for (const a of autopiloti) {
    if (a.archiviato === true) continue
    if (a.chats.length === 0) {
      // Con la sua sessione: una flotta che deve ancora aprire le chat non ne ha.
      if (a.stato === 'lavoro' && a.sessionId !== undefined) n += 1
      continue
    }
    n += a.chats.filter((c) => chatAlLavoro(a, c)).length
  }
  return n
}

/**
 * Il tetto di un autopilota dentro i posti del PC: le sue chat al lavoro più i
 * posti ancora liberi. Le altre restano in coda («in fila»).
 */
export function tettoNeiPosti(tetto: number, attiveQui: number, attiveSulPc: number, posti: number): number {
  return Math.min(tetto, attiveQui + Math.max(0, posti - attiveSulPc))
}

/** Una chat finita resta aperta così, poi si chiude: il tempo di leggere l'ultima risposta. */
export const FINITA_SI_CHIUDE_MS = 5 * 60_000
/**
 * Le chat di un autopilota finito o fermato, senza domande aperte, si chiudono
 * dopo questo silenzio: chi lo ha fermato ha avuto il tempo di guardarle.
 */
export const FERMO_SI_CHIUDE_MS = 30 * 60_000

/** Una chat chiusa da sola e ancora accesa dopo questo (consegna persa, riaperta) si richiude. */
export const RICHIUDI_DOPO_MS = 10 * 60_000

/** `alRecupero` (0.84.0): l'agente ha finito e il suo ramo è chiuso; la conversazione va nel recupero di 30 giorni. */
export type DaChiudere = { autopilotaId: string; chatId?: string; sessionId: string; motivo: string; alRecupero?: true }

/**
 * **Agente finito** (0.84.0): la chat ha fatto il suo compito e il suo ramo
 * è chiuso: unito nel principale, o tolto. Per una Revisione vale il ramo che
 * rivedeva: finché l'autore può essere rimandato indietro, la Revisione riusa
 * la sua conversazione e non si tocca.
 */
export function agenteFinito(a: Autopilota, c: ChatGovernata): boolean {
  if (c.sessionId === undefined || c.nelRecupero !== undefined) return false
  // A lavoro finito tutto (T6) l'ultima chat resta «lavoro» nell'archivio: conta il ramo unito.
  if (c.stato !== 'finita' && !(a.stato === 'finito' && c.stato === 'lavoro' && c.conclusa !== undefined)) return false
  if (c.sessionId === a.sessionId) return false
  if ((a.adottate ?? []).some((x) => x.sessionId === c.sessionId)) return false
  const chiuso = (x: ChatGovernata): boolean => x.conclusa !== undefined || x.approvata === true
  if (c.ruolo === 'revisione') {
    const autore = a.chats.find((x) => x.id === c.revisioneDi)
    return autore !== undefined && chiuso(autore)
  }
  return chiuso(c)
}

/**
 * Le chat da chiudere da sole: **mai una chat al lavoro**, mai una chat
 * adottata (non è nostra), mai chi aspetta una risposta di Nicholas.
 *
 * - una chat della flotta `finita` da `FINITA_SI_CHIUDE_MS`, se il suo
 *   claude.exe è ancora acceso (quella che chiude il suo turno con «il mio
 *   pezzo è fatto» resta ferma al prompt, e pesa 300 MB);
 * - le chat accese di un autopilota `finito` o `fermato` da
 *   `FERMO_SI_CHIUDE_MS`, senza domande aperte.
 *
 * `accese` sono le chat aperte su questo PC come le vede il programma, con la
 * loro sessione: si chiude solo una chat accesa **e ferma al prompt**
 * (`ferma`), cioè che non sta facendo niente.
 */
export function daChiudereDaSole(p: {
  autopiloti: Autopilota[]
  accese: { sessione: string; ferma: boolean }[]
  ora: number
  domandeAperte: (autopilotaId: string) => number
}): DaChiudere[] {
  const ferme = new Set(p.accese.filter((c) => c.ferma).map((c) => c.sessione))
  const alLavoro = new Set(p.accese.filter((c) => !c.ferma).map((c) => c.sessione))
  const fuori: DaChiudere[] = []
  const da = (iso: string | undefined): number => {
    const t = iso === undefined ? NaN : Date.parse(iso)
    return Number.isNaN(t) ? 0 : p.ora - t
  }
  for (const a of p.autopiloti) {
    const adottate = new Set((a.adottate ?? []).map((x) => x.sessionId))
    // Fermo da Nicholas (`sospeso` senza pausa per i limiti), finito o fallito.
    const fermo = a.stato === 'finito' || a.stato === 'fallito' || (a.stato === 'sospeso' && a.pausaLimitiFinoA === undefined) || a.archiviato === true
    const fermoDa = da(a.fermatoIl ?? a.ultimoEvento)
    const fermoDaChiudere = fermo && fermoDa >= FERMO_SI_CHIUDE_MS && p.domandeAperte(a.id) === 0
    if (a.chats.length === 0) {
      if (fermoDaChiudere && a.sessionId !== undefined && ferme.has(a.sessionId) && !adottate.has(a.sessionId)) {
        fuori.push({ autopilotaId: a.id, sessionId: a.sessionId, motivo: `l'autopilota è ${a.stato === 'finito' ? 'finito' : 'fermo'} da ${Math.round(fermoDa / 60_000)} minuti` })
      }
      continue
    }
    for (const c of a.chats) {
      if (c.sessionId === undefined || adottate.has(c.sessionId)) continue
      // L'agente finito (0.84.0): chiusa e nel recupero, anche se è già spenta
      // (resterebbe nell'elenco per sempre). Mai mentre lavora.
      if (agenteFinito(a, c) && !alLavoro.has(c.sessionId) && da(c.dal ?? a.ultimoEvento) >= FINITA_SI_CHIUDE_MS) {
        fuori.push({ autopilotaId: a.id, chatId: c.id, sessionId: c.sessionId, motivo: `ha finito e il suo ramo è ${c.conclusa?.come === 'tolto' ? 'chiuso' : 'unito'}`, alRecupero: true })
        continue
      }
      if (!ferme.has(c.sessionId)) continue
      // Senza `dal` (chat nate prima della 0.81.0) vale l'ultimo evento dell'autopilota.
      const finitaDa = da(c.dal ?? a.ultimoEvento)
      if (c.stato === 'finita' && finitaDa >= FINITA_SI_CHIUDE_MS) {
        fuori.push({ autopilotaId: a.id, chatId: c.id, sessionId: c.sessionId, motivo: `ha finito da ${Math.round(finitaDa / 60_000)} minuti` })
      } else if (fermoDaChiudere && c.stato !== 'bloccata') {
        fuori.push({ autopilotaId: a.id, chatId: c.id, sessionId: c.sessionId, motivo: `l'autopilota è ${a.stato === 'finito' ? 'finito' : 'fermo'} da ${Math.round(fermoDa / 60_000)} minuti` })
      }
    }
  }
  return fuori
}
