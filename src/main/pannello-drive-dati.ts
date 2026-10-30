import { costruisciPannello, progettoDellaChat, type ChatIngresso, type Pannello, type PcNoto, type ProgettoIngresso } from '@shared/pannello-drive'
import type { VistaSposta } from '@shared/sposta'
import { cartellaDaSlug } from './cassaforte/catalogo'
import type { Manifesto } from './cassaforte/incrementale'

/** La conversazione di un percorso del Drive (`chat/<slug>/<uuid>.jsonl`). */
export function sessioneDiPercorso(p: string): string {
  const nome = p.slice(p.lastIndexOf('/') + 1)
  return nome.endsWith('.jsonl') ? nome.slice(0, -'.jsonl'.length) : nome
}

/**
 * Le fonti del pannello delle chat del Drive (0.58.0), messe insieme. Niente
 * regole qui: quelle sono in `@shared/pannello-drive`. Si leggono le stesse
 * fonti del catalogo e dei battiti:
 * - le copie di questo PC dall'indice delle chat (`chatLocaliDaIndice`);
 * - le copie degli altri dal manifesto del Drive (`chat/<slug>/<uuid>.jsonl`,
 *   con il PC che l'ha caricata);
 * - le chat aperte adesso dai battiti e dalle chat aperte qui;
 * - i titoli dall'indice, dai workspace e dai battiti.
 */
export function datiPannello(p: {
  io: PcNoto
  pc: (PcNoto & { chat?: { sessione?: string; titolo?: string; cwd?: string; aspetta?: boolean }[]; locali?: unknown })[]
  locali: { sessione: string; titolo: string; cwd?: string; mtime?: number }[]
  manifesto: Manifesto | undefined
  aperteQui: string[]
  /** Le chat di qui che lavorano adesso (0.69.0). */
  alLavoroQui?: string[]
  titoliNoti: { sessione: string; titolo: string; cwd?: string }[]
  progetti: ProgettoIngresso[]
  adesso: number
  /** I nomi dei workspace di questo PC (0.60.0). */
  workspaceQui?: string[]
  /** «Sposta su questo PC» in corso (0.88.0). */
  sposta?: VistaSposta
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
      if (x.aspetta === false) c.alLavoro = [...new Set([...(c.alLavoro ?? []), b.id])]
    }
  }
  for (const s of p.aperteQui) {
    if (!chat.has(s)) continue
    const c = prendi(s)
    c.aperta = [...new Set([...(c.aperta ?? []), p.io.id])]
  }
  for (const s of p.alLavoroQui ?? []) {
    if (!chat.has(s)) continue
    const c = prendi(s)
    c.alLavoro = [...new Set([...(c.alLavoro ?? []), p.io.id])]
  }
  for (const c of chat.values()) {
    if (c.titolo === '') c.titolo = `chat ${c.sessione.slice(0, 8)}`
    // Il progetto: la cartella della chat dentro la cartella del progetto sul suo proprietario.
    const g = progettoDellaChat(c.cwd, p.progetti)
    if (g !== undefined) c.progetto = g.id
  }
  return costruisciPannello({
    io: p.io, pc: p.pc.map(({ chat: _c, locali, ...x }) => ({ ...x, diceLocali: localiDi(locali) !== undefined })),
    chat: [...chat.values()], progetti: p.progetti, adesso: p.adesso,
    ...(p.workspaceQui !== undefined ? { workspaceQui: p.workspaceQui } : {}),
    ...(p.sposta !== undefined ? { sposta: p.sposta } : {})
  })
}

/**
 * Gli altri PC come li vuole il pannello, dai loro battiti (0.71.1). Fino alla
 * 0.71.0 le copie locali (`locali`) restavano fuori: nella vista Progetti ogni
 * PC risultava «da aggiornare» e le chat sul disco degli altri PC non si
 * contavano. Visto provando la vista con i dati veri, il 13/10.
 */
export function pcPerPannello<B extends { pcId: string; battito: string; chat?: { sessione?: string; titolo?: string; cwd?: string; aspetta?: boolean }[]; locali?: unknown }>(
  battiti: B[], nomeDi: (b: B) => string
): (PcNoto & { chat?: { sessione?: string; titolo?: string; cwd?: string; aspetta?: boolean }[]; locali?: unknown })[] {
  return battiti.map((b) => ({ id: b.pcId, nome: nomeDi(b), battito: b.battito, ...(b.chat !== undefined ? { chat: b.chat } : {}), ...(b.locali !== undefined ? { locali: b.locali } : {}) }))
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
