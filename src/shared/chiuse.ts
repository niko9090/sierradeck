/**
 * **Le chat chiuse da te sul PC di casa** (0.60.9).
 *
 * Nicholas (11/10): «nel PC residente ho chiuso una chat e qui continua a
 * cercarla; se la chiudo sul residente deve chiudersi anche sul client». Il
 * client vedeva solo «la chat non è aperta là» e restava su «Riapri là»: non
 * poteva distinguere una chiusura voluta da un riavvio, un aggiornamento o un
 * guasto, dopo i quali la chat va davvero ripresa.
 *
 * Qui le regole, uguali per il Core (che scrive), il riquadro remoto del PC,
 * la pagina e l'app (che leggono `chiuse` da `/api/stato`):
 * - solo la chiusura voluta (la × del riquadro, «Chiudi» dal telefono o da un
 *   altro PC) scrive «chiusa», con l'ora; riavvii e guasti non passano di qui;
 * - riaprirla o scriverle da qualunque PC la toglie (si riaccende il suo pty);
 * - vale l'ultima azione: un riquadro aperto qui **dopo** la chiusura resta.
 */
export type ChiusaDaTe = { sessione: string; il: string }

/** Quanto si ricorda una chiusura: oltre, un riquadro rimasto aperto altrove non ha più niente da sapere. */
export const CHIUSE_GIORNI = 30
/** Al massimo tante voci: `/api/stato` si chiede ogni due secondi. */
export const CHIUSE_MAX = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Le voci valide di un elenco venuto da disco o dalla rete: il resto si scarta. */
export function leggiChiuse(raw: unknown): ChiusaDaTe[] {
  const voci = Array.isArray(raw) ? raw : typeof raw === 'object' && raw !== null && Array.isArray((raw as { chiuse?: unknown }).chiuse) ? (raw as { chiuse: unknown[] }).chiuse : []
  const fuori: ChiusaDaTe[] = []
  for (const v of voci) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.sessione !== 'string' || !UUID.test(o.sessione)) continue
    if (typeof o.il !== 'string' || Number.isNaN(Date.parse(o.il))) continue
    fuori.push({ sessione: o.sessione, il: o.il })
  }
  return fuori
}

/** Segna una chiusura voluta (la più recente vince), tolte le vecchie. */
export function segnaChiusa(elenco: readonly ChiusaDaTe[], sessione: string, il: string): ChiusaDaTe[] {
  if (!UUID.test(sessione)) return [...elenco]
  return pota([{ sessione, il }, ...elenco.filter((c) => c.sessione !== sessione)], Date.parse(il))
}

/** La chat si è riaperta (o le si è scritto): non è più chiusa. */
export function togliChiusa(elenco: readonly ChiusaDaTe[], sessione: string): ChiusaDaTe[] {
  return elenco.filter((c) => c.sessione !== sessione)
}

/** Via le chiusure più vecchie di trenta giorni, e oltre le duecento più recenti. */
export function pota(elenco: readonly ChiusaDaTe[], adesso: number): ChiusaDaTe[] {
  const limite = adesso - CHIUSE_GIORNI * 86_400_000
  return [...elenco]
    .filter((c) => Date.parse(c.il) >= limite)
    .sort((a, b) => Date.parse(b.il) - Date.parse(a.il))
    .slice(0, CHIUSE_MAX)
}

/**
 * Il riquadro che guarda quella conversazione da un altro PC si deve chiudere?
 * Sì se il PC di casa dice che l'hai chiusa **dopo** che il riquadro è stato
 * aperto (`dal`); un riquadro senza `dal` (salvato prima della 0.60.9) vale
 * come aperto da sempre. Restituisce la chiusura, o niente.
 */
export function chiusaDopo(chiuse: readonly ChiusaDaTe[] | undefined, sessione: string | undefined, dal: string | undefined): ChiusaDaTe | undefined {
  if (chiuse === undefined || sessione === undefined) return undefined
  const c = chiuse.find((x) => x.sessione === sessione)
  if (c === undefined) return undefined
  const aperto = dal === undefined ? Number.NEGATIVE_INFINITY : Date.parse(dal)
  return Number.isNaN(aperto) || Date.parse(c.il) > aperto ? c : undefined
}

/** La riga del registro (e l'avviso) del client che chiude il suo riquadro. */
export function rigaChiusaACasa(nomePc: string, il: string): string {
  const d = new Date(il)
  const ora = Number.isNaN(d.getTime()) ? '' : ` alle ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
  return `chiusa sul PC di casa (${nomePc}${ora}): chiudo anche qui — la conversazione resta in «Riprendi una conversazione» e nel pannello «Progetti»`
}
