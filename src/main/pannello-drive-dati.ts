import { sessioneDiPercorso, type CaseChat } from '@shared/una-casa'
import { costruisciPannello, type ChatIngresso, type Pannello, type PcNoto, type ProgettoIngresso } from '@shared/pannello-drive'
import type { PianoAllineamento } from '@shared/allineamento'
import { cartellaDaSlug } from './cassaforte/catalogo'
import { gruppoDiCartella, raggruppaProgetti, type GruppoProgetti } from '@shared/progetti-unificati'
import type { Manifesto } from './cassaforte/incrementale'

/**
 * Le fonti del pannello delle chat del Drive (0.58.0), messe insieme. Niente
 * regole qui: quelle sono in `@shared/pannello-drive`. Si leggono le stesse
 * fonti che usano «una chat, una casa», il catalogo e i battiti:
 * - le copie di questo PC dall'indice delle chat (`chatLocaliDaIndice`);
 * - le copie degli altri dal manifesto del Drive (`chat/<slug>/<uuid>.jsonl`,
 *   con il PC che l'ha caricata);
 * - le chat aperte adesso dai battiti e dalle chat aperte qui;
 * - i titoli dall'indice, dai workspace e dai battiti.
 */
export function datiPannello(p: {
  io: PcNoto
  pc: (PcNoto & { chat?: { sessione?: string; titolo?: string; cwd?: string }[]; locali?: unknown })[]
  case: CaseChat
  locali: { sessione: string; titolo: string; cwd?: string; mtime?: number }[]
  manifesto: Manifesto | undefined
  aperteQui: string[]
  titoliNoti: { sessione: string; titolo: string; cwd?: string }[]
  progetti: ProgettoIngresso[]
  adesso: number
  piano?: PianoAllineamento
  /** I nomi dei workspace di questo PC (0.60.0). */
  workspaceQui?: string[]
  /** Se una cartella esiste qui: per le cartelle trovate per nome (0.60.0). */
  esiste?: (percorso: string) => boolean
}): Pannello {
  const chat = new Map<string, ChatIngresso>()
  const prendi = (s: string): ChatIngresso => {
    let c = chat.get(s)
    if (c === undefined) { c = { sessione: s, titolo: '', copie: [] }; chat.set(s, c) }
    return c
  }
  for (const l of p.locali) {
    const c = prendi(l.sessione)
    c.titolo = l.titolo
    if (l.cwd !== undefined) c.cwd = l.cwd
    c.copie.push({ pc: p.io.id, dove: 'qui', ...(l.mtime !== undefined ? { mtime: l.mtime } : {}) })
  }
  // Le copie sul disco degli altri PC, come le dice il loro battito (0.58.0).
  for (const b of p.pc) {
    for (const x of localiDi(b.locali)?.chat ?? []) {
      const c = prendi(x.sessione)
      if (c.cwd === undefined && x.cwd !== undefined) c.cwd = x.cwd
      c.copie.push({ pc: b.id, dove: 'disco', ...(x.mtime !== undefined ? { mtime: x.mtime } : {}) })
    }
  }
  for (const [percorso, v] of Object.entries(p.manifesto?.file ?? {})) {
    if (!percorso.startsWith('chat/') || !percorso.endsWith('.jsonl') || percorso.split('/').length !== 3) continue
    const c = prendi(sessioneDiPercorso(percorso))
    c.copie.push({ pc: v.pc ?? '', dove: 'drive', mtime: v.mtime })
    if (c.cwd === undefined) c.cwd = cartellaDaSlug(percorso.split('/')[1] ?? '')
  }
  // Una chat caricata dallo stesso PC sotto due slug conta una volta, la più recente.
  for (const c of chat.values()) {
    const uniche = new Map<string, (typeof c.copie)[number]>()
    for (const x of c.copie) {
      const k = `${x.pc}|${x.dove}`
      const prima = uniche.get(k)
      if (prima === undefined || (x.mtime ?? 0) > (prima.mtime ?? 0)) uniche.set(k, x)
    }
    c.copie = [...uniche.values()].filter((x) => x.pc !== '' || x.dove === 'qui')
  }
  const titoli = [...p.titoliNoti, ...p.pc.flatMap((b) => (b.chat ?? []).filter((x) => x.sessione !== undefined) as { sessione: string; titolo?: string; cwd?: string }[])]
  for (const t of titoli) {
    const c = chat.get(t.sessione)
    if (c === undefined) continue
    if (c.titolo === '' && t.titolo !== undefined && t.titolo !== '') c.titolo = t.titolo
    if (c.cwd === undefined && t.cwd !== undefined) c.cwd = t.cwd
  }
  for (const b of p.pc) {
    for (const x of b.chat ?? []) {
      if (x.sessione === undefined || !chat.has(x.sessione)) continue
      const c = prendi(x.sessione)
      c.aperta = [...new Set([...(c.aperta ?? []), b.id])]
    }
  }
  for (const s of p.aperteQui) {
    if (!chat.has(s)) continue
    const c = prendi(s)
    c.aperta = [...new Set([...(c.aperta ?? []), p.io.id])]
  }
  const gruppi = raggruppaProgetti(p.progetti, p.case)
  for (const c of chat.values()) {
    if (c.titolo === '') c.titolo = `chat ${c.sessione.slice(0, 8)}`
    // Il progetto (0.60.0): la cartella della chat dentro una cartella del
    // progetto, su qualunque PC; o una cartella con il suo nome. Così anche
    // le chat senza nome restano attaccate al loro progetto.
    if (c.cwd !== undefined) {
      const g = gruppoDiCartella(c.cwd, gruppi)
      if (g !== undefined) c.progetto = g.gruppo.id
    }
  }
  const cartelleTrovate = primaTrovata(cartelleTrovateQui(gruppi, p.io.id, p.locali, p.esiste))
  const altreQui = Object.fromEntries(Object.entries(cartelleTrovateQui(gruppi, p.io.id, p.locali, p.esiste, true)).map(([id, v]) => [id, v.length]))
  const pannello = costruisciPannello({
    io: p.io, pc: p.pc.map(({ chat: _c, locali, ...x }) => ({ ...x, diceLocali: localiDi(locali) !== undefined })),
    case: p.case, chat: [...chat.values()], progetti: p.progetti, adesso: p.adesso,
    ...(p.workspaceQui !== undefined ? { workspaceQui: p.workspaceQui } : {}),
    cartelleTrovate,
    altreCartelleQui: altreQui
  })
  return p.piano === undefined ? pannello : { ...pannello, piano: p.piano }
}

/**
 * Le cartelle di questo PC con il nome di un progetto, non registrate
 * (0.60.0): dove lavorano le chat di qui. Per ogni gruppo, dalla chat più
 * recente. Senza `anche`, solo per i gruppi che qui non hanno nessuna
 * cartella registrata (il pannello dice «qui sul disco: sì», il piano non
 * riporta giù accanto); con `anche`, pure quelle accanto a una registrata:
 * «Rendi residente qui» le unisce tutte.
 */
export function cartelleTrovateQui(
  gruppi: GruppoProgetti[],
  io: string,
  locali: { cwd?: string; mtime?: number }[],
  esiste?: (percorso: string) => boolean,
  anche = false
): Record<string, string[]> {
  const trovate = new Map<string, Map<string, { radice: string; mtime: number }>>()
  for (const l of locali) {
    if (l.cwd === undefined) continue
    const g = gruppoDiCartella(l.cwd, gruppi)
    if (g === undefined || !g.perNome) continue
    const registrate = g.gruppo.percorsi.filter((x) => x.pc === io)
    if (!anche && registrate.length > 0) continue
    const k = g.radice.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
    if (registrate.some((x) => x.percorso.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() === k)) continue
    if (esiste !== undefined && !esiste(g.radice)) continue
    const m = trovate.get(g.gruppo.id) ?? new Map<string, { radice: string; mtime: number }>()
    const prima = m.get(k)
    if (prima === undefined || (l.mtime ?? 0) > prima.mtime) m.set(k, { radice: g.radice, mtime: l.mtime ?? 0 })
    trovate.set(g.gruppo.id, m)
  }
  return Object.fromEntries([...trovate].map(([id, m]) => [id, [...m.values()].sort((a, b) => b.mtime - a.mtime).map((x) => x.radice)]))
}

/** La prima (la più usata di recente) per ogni gruppo. */
export function primaTrovata(t: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(t).flatMap(([id, v]) => (v[0] === undefined ? [] : [[id, v[0]]])))
}

/** Il campo `locali` di un battito, letto con prudenza: arriva da un altro PC. */
function localiDi(x: unknown): { chat: { sessione: string; cwd?: string; mtime?: number }[] } | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const chat = (x as { chat?: unknown }).chat
  if (!Array.isArray(chat)) return undefined
  return {
    chat: chat.flatMap((c) => {
      if (typeof c !== 'object' || c === null) return []
      const o = c as Record<string, unknown>
      if (typeof o.sessione !== 'string' || o.sessione === '') return []
      return [{ sessione: o.sessione, ...(typeof o.cwd === 'string' ? { cwd: o.cwd } : {}), ...(typeof o.mtime === 'number' ? { mtime: o.mtime } : {}) }]
    })
  }
}
