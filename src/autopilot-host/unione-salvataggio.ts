import type { Autopilota, ChatGovernata } from '@shared/autopilota'

/**
 * **Il salvataggio che non perde quello degli altri** (30/10).
 *
 * La fermata di una chat legge l'autopilota una volta, poi aspetta minuti
 * (git, criteri, supervisore) e salva copie derivate da quella lettura. Nel
 * frattempo la fermata di una chat sorella ha salvato la sua: la seconda a
 * salvare riscriveva la prima con la propria fotografia vecchia, e la chat
 * sorella tornava com'era (il suo segnale, i suoi cicli, il suo stato).
 *
 * Qui si salva **a tre vie**: `base` è quello da cui chi salva è partito,
 * `nostro` quello che vuole scrivere, `disco` quello che c'è adesso. Di ogni
 * campo vince il nostro solo se l'abbiamo cambiato rispetto alla base;
 * altrimenti resta quello del disco. Le chat si uniscono una per una (per id);
 * il diario e il dialogo sono a sole aggiunte: quelle del disco più le nostre
 * nuove. Pura.
 */
export function unisciAlSalvataggio(
  base: Autopilota,
  nostro: Autopilota,
  disco: Autopilota,
  /** I campi che `nostro` ha già unito al disco da sé (la coda dei messaggi, `codaDalDisco`): si prendono come sono. */
  giaUniti: readonly string[] = []
): Autopilota {
  const b = base as unknown as Record<string, unknown>
  const n = nostro as unknown as Record<string, unknown>
  const fuori: Record<string, unknown> = { ...(disco as unknown as Record<string, unknown>) }
  for (const k of giaUniti) {
    if (n[k] === undefined) delete fuori[k]
    else fuori[k] = n[k]
  }
  for (const k of new Set([...Object.keys(b), ...Object.keys(n)])) {
    if (giaUniti.includes(k) || uguale(b[k], n[k])) continue
    if (k === 'chats') { fuori.chats = unisciChat(base.chats, nostro.chats, disco.chats); continue }
    if (k === 'decisioni' || k === 'dialogo') {
      fuori[k] = conLeNostre(arr(b[k]), arr(n[k]), arr(fuori[k]))
      continue
    }
    if (n[k] === undefined) delete fuori[k]
    else fuori[k] = n[k]
  }
  return fuori as unknown as Autopilota
}

/** Le chat, una per una: la nostra se l'abbiamo cambiata, quella del disco se no; le nostre nuove in coda. */
export function unisciChat(base: ChatGovernata[], nostre: ChatGovernata[], disco: ChatGovernata[]): ChatGovernata[] {
  const diBase = new Map(base.map((c) => [c.id, c]))
  const mie = new Map(nostre.map((c) => [c.id, c]))
  const fuori: ChatGovernata[] = []
  for (const d of disco) {
    const mia = mie.get(d.id)
    const prima = diBase.get(d.id)
    // Tolta da noi (c'era nella base, nella nostra non più): via anche dal disco.
    if (mia === undefined) { if (prima === undefined) fuori.push(d); continue }
    fuori.push(uguale(mia, prima) ? d : mia)
  }
  const sulDisco = new Set(disco.map((c) => c.id))
  for (const c of nostre) if (!sulDisco.has(c.id) && !diBase.has(c.id)) fuori.push(c)
  return fuori
}

function conLeNostre(base: unknown[], nostre: unknown[], disco: unknown[]): unknown[] {
  const chiave = (x: unknown): string => JSON.stringify(x)
  const viste = new Set([...base, ...disco].map(chiave))
  return [...disco, ...nostre.filter((x) => !viste.has(chiave(x)))]
}

function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

function uguale(x: unknown, y: unknown): boolean {
  if (x === y) return true
  if (x === undefined || y === undefined) return false
  return JSON.stringify(x) === JSON.stringify(y)
}
