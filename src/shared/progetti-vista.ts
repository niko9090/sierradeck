import type { Pannello, RigaProgetto, TipoProblema } from './pannello-drive'
import { passoDi, PASSI_SPOSTA } from './sposta'
import { byteLeggibili } from './spazio-drive'

/**
 * La vista «Progetti» rifatta (0.69.0). Nicholas, 12/10: «rifai il menu
 * Progetti!! non si capisce nulla. Sfrutta la larghezza della pagina e
 * sistema tutto per bene». Una tabella: Progetto · Dove vive · Copie · Chat ·
 * Spazio Drive · Stato, con lo stato in UNA parola e un colore; i gruppi (Su
 * questo PC · Su altri PC · Da sistemare · Tutti), la ricerca e l'ordinamento.
 *
 * Le regole stanno qui e le applica il PC (`conVista`): la pagina del telefono
 * e l'app disegnano quello che arriva, senza rifare i conti. Vedi la scheda
 * `vista-progetti-0-69-0.md`.
 */

export type IdStato = 'spostamento' | 'da-sistemare' | 'al-lavoro' | 'a-posto'
export type Colore = 'blu' | 'ambra' | 'rosso' | 'verde'
export type Gruppo = 'questo-pc' | 'altri-pc' | 'da-sistemare' | 'tutti'
export type Colonna = 'nome' | 'dove' | 'copie' | 'chat' | 'spazio' | 'stato'
export type Verso = 'su' | 'giu'

export type StatoVista = { id: IdStato; parola: string; colore: Colore; ragione?: string }

export type VistaProgetto = {
  stato: StatoVista
  gruppi: Exclude<Gruppo, 'tutti'>[]
  /** «Questo PC», il nome scelto del residente, o «—». */
  dove: string
  doveQui: boolean
  /** «nessuna», «PC-Fisso», «2 PC»; i nomi per il suggerimento. */
  copie: { testo: string; nomi: string[] }
  chat: { testo: string; totali: number; alLavoro: number }
  spazio: { testo: string; byte?: number; avviso: boolean }
}

export const GRUPPI: { id: Gruppo; testo: string }[] = [
  { id: 'questo-pc', testo: 'Su questo PC' },
  { id: 'altri-pc', testo: 'Su altri PC' },
  { id: 'da-sistemare', testo: 'Da sistemare' },
  { id: 'tutti', testo: 'Tutti' }
]

export const COLONNE: { id: Colonna; testo: string }[] = [
  { id: 'nome', testo: 'Progetto' },
  { id: 'dove', testo: 'Dove vive' },
  { id: 'copie', testo: 'Copie' },
  { id: 'chat', testo: 'Chat' },
  { id: 'spazio', testo: 'Spazio Drive' },
  { id: 'stato', testo: 'Stato' }
]

const PAROLA: Record<IdStato, string> = { spostamento: 'spostamento in corso', 'da-sistemare': 'da sistemare', 'al-lavoro': 'al lavoro', 'a-posto': 'a posto' }
/** L'ordine per importanza: in cima quello che chiede attenzione. */
const RANGO: Record<IdStato, number> = { spostamento: 0, 'da-sistemare': 1, 'al-lavoro': 2, 'a-posto': 3 }

/** I problemi in ordine di gravità, con la loro ragione in due o tre parole. */
const RAGIONE: [TipoProblema, (n: string) => string][] = [
  ['casa-sconosciuta', () => 'PC sconosciuto'],
  ['progetto-senza-casa', () => 'senza proprietario'],
  ['casa-assente', () => 'PC assente da tempo']
]

/** La ragione breve del primo problema per gravità, con «+N» se ce ne sono altri. */
export function ragioneProblemi(problemi: { tipo: TipoProblema; titolo: string }[]): string | undefined {
  if (problemi.length === 0) return undefined
  const primo = RAGIONE.find(([t]) => problemi.some((p) => p.tipo === t))
  const p = primo === undefined ? problemi[0] : problemi.find((x) => x.tipo === primo[0])
  const testo = primo !== undefined && p !== undefined ? primo[1](p.titolo) : (p?.titolo ?? 'da guardare').toLowerCase()
  return problemi.length > 1 ? `${testo} +${problemi.length - 1}` : testo
}

/** Quello che sta succedendo attorno al progetto: «Sposta su questo PC» (0.88.0). */
export type Contesto = Pick<Pannello, 'sposta'> & { io?: string }

/**
 * Lo stato in una parola. Vince il primo che vale: spostamento in corso, da
 * sistemare, al lavoro, a posto. Uno spostamento fermo è «da sistemare».
 */
export function statoProgetto(r: RigaProgetto, ctx: Contesto = {}): StatoVista {
  const fa = (id: IdStato, colore: Colore, ragione?: string): StatoVista => ({ id, parola: PAROLA[id], colore, ...(ragione !== undefined ? { ragione } : {}) })
  const sp = ctx.sposta !== undefined && r.ids.includes(ctx.sposta.progetto) ? ctx.sposta : undefined
  if (sp !== undefined && sp.fase !== 'fatta' && sp.fase !== 'fallita') {
    return fa('spostamento', 'blu', sp.fase === 'attesa-proprietario' ? `aspetta ${sp.daNome}` : `passo ${passoDi(sp.fase)} di ${PASSI_SPOSTA.length}`)
  }
  if (sp?.fase === 'fallita') return fa('da-sistemare', 'ambra', 'spostamento fermo')
  const ragione = ragioneProblemi(r.problemi)
  if (ragione !== undefined) return fa('da-sistemare', r.problemi.some((p) => p.tipo === 'casa-sconosciuta') ? 'rosso' : 'ambra', ragione)
  const n = r.alLavoro ?? 0
  if (n > 0) return fa('al-lavoro', 'blu', n === 1 ? '1 chat' : `${n} chat`)
  return fa('a-posto', 'verde')
}

/** In quali gruppi sta (oltre a «Tutti»). Senza proprietario conta dove sta la cartella. */
export function gruppiDi(r: RigaProgetto, s: StatoVista): Exclude<Gruppo, 'tutti'>[] {
  const qui = r.residente !== undefined ? r.residente.qui : r.cartellaQui
  const g: Exclude<Gruppo, 'tutti'>[] = [qui ? 'questo-pc' : 'altri-pc']
  if (s.id === 'da-sistemare') g.push('da-sistemare')
  return g
}

/** Le copie: i PC con la cartella che non sono il proprietario (nessuna, dalla 0.88.0). */
export function copieDi(r: RigaProgetto, io?: string): { testo: string; nomi: string[] } {
  const nomi = [...new Set(r.cartelle.filter((c) => c.pc !== r.residente?.pc).map((c) => (c.pc === io ? 'questo PC' : c.nome)))]
  return { testo: nomi.length === 0 ? 'nessuna' : nomi.length === 1 ? (nomi[0] as string) : `${nomi.length} PC`, nomi }
}

/** «12», o «12 · 1 al lavoro». Le chat senza nome non contano. */
export function testoChat(r: RigaProgetto): { testo: string; totali: number; alLavoro: number } {
  const totali = Math.max(0, r.chat - r.chatSenzaNome)
  const alLavoro = r.alLavoro ?? 0
  return { testo: alLavoro > 0 ? `${totali} · ${alLavoro} al lavoro` : String(totali), totali, alLavoro }
}

export function testoSpazio(s: RigaProgetto['spazioDrive']): { testo: string; byte?: number; avviso: boolean } {
  if (s === undefined) return { testo: '—', avviso: false }
  return { testo: byteLeggibili(s.byte), byte: s.byte, avviso: s.grandi.length > 0 }
}

export function vistaDi(r: RigaProgetto, ctx: Contesto = {}): VistaProgetto {
  const stato = statoProgetto(r, ctx)
  return {
    stato,
    gruppi: gruppiDi(r, stato),
    dove: r.residente === undefined ? '—' : r.residente.qui ? 'Questo PC' : r.residente.nome,
    doveQui: r.residente?.qui === true,
    copie: copieDi(r, ctx.io),
    chat: testoChat(r),
    spazio: testoSpazio(r.spazioDrive)
  }
}

/** Il PC mette la vista su ogni riga: pagina e app la disegnano e basta. */
export function conVista<P extends Pick<Pannello, 'progetti'> & { io?: { id: string } }>(p: P, ctx: Contesto): P {
  const c = { ...(p.io !== undefined ? { io: p.io.id } : {}), ...ctx }
  return { ...p, progetti: p.progetti.map((r) => ({ ...r, vista: vistaDi(r, c) })) }
}

const vistaOCalcola = (r: RigaProgetto): VistaProgetto => r.vista ?? vistaDi(r)

export function nelGruppo(r: RigaProgetto, g: Gruppo): boolean {
  return g === 'tutti' || vistaOCalcola(r).gruppi.includes(g)
}

export function contaGruppi(righe: RigaProgetto[]): Record<Gruppo, number> {
  const n: Record<Gruppo, number> = { 'questo-pc': 0, 'altri-pc': 0, 'da-sistemare': 0, tutti: righe.length }
  for (const r of righe) for (const g of vistaOCalcola(r).gruppi) n[g] += 1
  return n
}

const piano = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Ogni parola cercata deve stare nel nome, nei PC o nelle cartelle. */
export function cercaProgetti(righe: RigaProgetto[], q: string): RigaProgetto[] {
  const parole = piano(q).split(/\s+/).filter((x) => x !== '')
  if (parole.length === 0) return righe
  return righe.filter((r) => {
    const v = vistaOCalcola(r)
    const testo = piano([r.nome, v.dove, ...v.copie.nomi, ...r.cartelle.map((c) => `${c.nome} ${c.percorso}`)].join(' '))
    return parole.every((p) => testo.includes(p))
  })
}

/**
 * L'ordine per colonna. Stabile; i «—» (nessun residente, spazio non misurato)
 * sempre in fondo, in tutti e due i versi. Per stato: per importanza, poi
 * l'ultimo uso più recente.
 */
export function ordinaProgetti(righe: RigaProgetto[], col: Colonna = 'stato', verso: Verso = 'su'): RigaProgetto[] {
  const segno = verso === 'su' ? 1 : -1
  const chiave = (r: RigaProgetto): number | string | undefined => {
    const v = vistaOCalcola(r)
    switch (col) {
      case 'nome': return piano(r.nome)
      case 'dove': return r.residente === undefined ? undefined : (v.doveQui ? '' : piano(v.dove))
      case 'copie': return v.copie.nomi.length
      case 'chat': return v.chat.totali
      case 'spazio': return v.spazio.byte
      case 'stato': return RANGO[v.stato.id]
    }
  }
  return righe
    .map((r, i) => ({ r, i, k: chiave(r) }))
    .sort((a, b) => {
      if (a.k === undefined || b.k === undefined) return a.k === b.k ? a.i - b.i : a.k === undefined ? 1 : -1
      const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'it')
      if (c !== 0) return c * segno
      // A parità di stato, il più usato di recente prima; poi l'ordine di prima.
      if (col === 'stato') { const u = (b.r.ultimoUso ?? '').localeCompare(a.r.ultimoUso ?? ''); if (u !== 0) return u }
      return a.i - b.i
    })
    .map((x) => x.r)
}

/** Le azioni divise: la principale (piena), le altre, quella pericolosa (a destra, con conferma). */
/**
 * La cartella del quaderno di un progetto su questo PC (0.71.1), o `undefined`
 * se qui il progetto non ha una cartella. Fino alla 0.71.0 «Quaderno del
 * progetto» apriva il Quaderno sulla chat davanti, non sul progetto: visto
 * provando la vista con i dati veri, il 13/10.
 */
export function cartellaDelQuaderno(r: Pick<RigaProgetto, 'cartelle' | 'cartellaTrovata'>, io: string): string | undefined {
  return r.cartelle.find((c) => c.pc === io)?.percorso ?? r.cartellaTrovata
}

export function azioniDivise<A extends { id: string }>(az: A[]): { primaria?: A; secondarie: A[]; pericolo?: A } {
  const pericolo = az.find((a) => a.id === 'sposta-qui')
  const resto = az.filter((a) => a !== pericolo)
  const primaria = resto.find((a) => a.id === 'apri') ?? resto[0]
  return { ...(primaria !== undefined ? { primaria } : {}), secondarie: resto.filter((a) => a !== primaria), ...(pericolo !== undefined ? { pericolo } : {}) }
}
