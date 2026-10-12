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

/**
 * **Il workspace rispecchia il PC di casa** (0.64.2, Nicholas il 12/10:
 * «continuo a vedere due chat nel workspace MT5 quando nel portatile ne ho
 * chiusa una e ne rimane aperta solo una»).
 *
 * La 0.60.9 toglieva il riquadro solo se il PC di casa aveva **registrato**
 * la chiusura. Una chat chiusa prima di allora, o in un modo che non scrive
 * «chiusa», restava qui per sempre con «Riapri là». Ora conta quello che il
 * PC di casa ha aperto adesso: se là la chat non c'è, né fra quelle vive (in
 * un riquadro o in sottofondo) né fra quelle salvate in un suo workspace, il
 * riquadro qui si toglie da solo.
 *
 * Resta invece:
 * - se il PC di casa non risponde (questa funzione non si chiama: si vede
 *   «non raggiungibile»);
 * - se quel PC non manda le chat dei suoi workspace (un PC vecchio): non si
 *   sa, non si toglie;
 * - per qualche minuto dopo che il riquadro è stato aperto o ha scritto da
 *   qui, e finché un testo da qui aspetta di partire là.
 */
export const GRAZIA_RIQUADRO_REMOTO_MS = 3 * 60_000

export type GiudizioRiquadro = 'mostra' | 'chiusa' | 'togli' | 'aspetta'

export function giudicaRiquadroRemoto(p: {
  /** La chat c'è fra quelle vive di là (riquadro o sottofondo). */
  trovata: boolean
  sessione: string | undefined
  /** La chiusura registrata là dopo l'apertura di qui (`chiusaDopo`). */
  chiusaRegistrata: boolean
  /** Le conversazioni salvate nei workspace di là; `undefined` = quel PC non lo dice. */
  salvateLa: readonly string[] | undefined
  /** Quando il riquadro è stato aperto qui (`dal`), in ms. */
  apertoIl: number | undefined
  /** L'ultima volta che da qui si è scritto o avviato qualcosa, in ms. */
  ultimaAzioneIl: number | undefined
  /** Un testo o un avvio in sottofondo da qui non ancora partito. */
  inAttesa: boolean
  adesso: number
  /**
   * Il PC che il riquadro guarda è **certamente** la casa della chat (0.67.0):
   * la casa memorizzata è proprio lui. Se non lo è, o non si sa, la chat può
   * vivere altrove e non si toglie niente. Visto il 12/10 sul secondo PC fisso:
   * riquadri spariti di chat la cui casa non era il PC guardato.
   */
  casaCerta?: boolean
}): GiudizioRiquadro {
  if (p.trovata) return 'mostra'
  if (p.chiusaRegistrata) return 'chiusa'
  if (p.sessione === undefined || p.inAttesa || p.salvateLa === undefined) return 'aspetta'
  if (p.salvateLa.includes(p.sessione)) return 'aspetta'
  const recente = Math.max(p.apertoIl ?? Number.NEGATIVE_INFINITY, p.ultimaAzioneIl ?? Number.NEGATIVE_INFINITY)
  if (p.adesso - recente < GRAZIA_RIQUADRO_REMOTO_MS) return 'aspetta'
  if (p.casaCerta !== true) return 'aspetta'
  return 'togli'
}

/** La riga del registro del client che toglie il riquadro di una chat che là non è aperta. */
export function rigaNonApertaACasa(nomePc: string): string {
  return `non aperta sul PC di casa (${nomePc}: né a schermo, né in sottofondo, né in un suo workspace): tolgo il riquadro — la conversazione resta in «Riprendi una conversazione» e nel pannello «Progetti»`
}
