import { sessioneDiPercorso, type CaseChat } from '@shared/una-casa'
import { costruisciPannello, type ChatIngresso, type Pannello, type PcNoto, type ProgettoIngresso } from '@shared/pannello-drive'
import { cartellaDaSlug } from './cassaforte/catalogo'
import { staDentro } from './progetti/registro'
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
  pc: (PcNoto & { chat?: { sessione?: string; titolo?: string; cwd?: string }[] })[]
  case: CaseChat
  locali: { sessione: string; titolo: string; cwd?: string; mtime?: number }[]
  manifesto: Manifesto | undefined
  aperteQui: string[]
  titoliNoti: { sessione: string; titolo: string; cwd?: string }[]
  progetti: ProgettoIngresso[]
  adesso: number
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
  for (const c of chat.values()) {
    if (c.titolo === '') c.titolo = `chat ${c.sessione.slice(0, 8)}`
    // Il progetto: la cartella della chat dentro una delle cartelle del progetto, su qualunque PC.
    if (c.cwd !== undefined) {
      const g = p.progetti.find((x) => Object.values(x.percorsi).some((r) => staDentro(c.cwd as string, r)))
      if (g !== undefined) c.progetto = g.id
    }
  }
  return costruisciPannello({
    io: p.io, pc: p.pc.map(({ chat: _c, ...x }) => x), case: p.case, chat: [...chat.values()], progetti: p.progetti, adesso: p.adesso
  })
}
