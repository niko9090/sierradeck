import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import type { Autopilota } from '@shared/autopilota'

/**
 * **I conti dei guasti ripartono con la versione nuova** (30/10).
 *
 * «Il supervisore non ha risposto (518 di fila)»: il conto delle risposte
 * mancate sta sulla chat, su disco, e sopravviveva agli aggiornamenti. Ma il
 * guasto che contava era quasi sempre della versione di prima (un argomento
 * sbagliato, un prompt troppo lungo), e la versione nuova partiva già «muta da
 * 518 giri»: interrogata un giro ogni tre, con la riga per Nicholas già data.
 * Quando il servizio parte con una versione diversa dall'ultima vista, i conti
 * tornano a zero. Le ultime istruzioni valide restano.
 */

/** Il file in cui il servizio ricorda con quale versione ha azzerato i conti l'ultima volta. */
export function fileVersioneContatori(cartellaArchivio: string): string {
  return join(cartellaArchivio, 'servizio', 'versione-contatori.json')
}

export function leggiVersioneContatori(file: string): string | undefined {
  try {
    const v = (JSON.parse(readFileSync(file, 'utf8')) as { versione?: unknown }).versione
    return typeof v === 'string' && v !== '' ? v : undefined
  } catch {
    return undefined
  }
}

export function scriviVersioneContatori(file: string, versione: string): boolean {
  try { mkdirSync(dirname(file), { recursive: true }) } catch { /* lo dirà la scrittura */ }
  return scriviAtomico(file, JSON.stringify({ versione }), 'autopilota')
}

/** L'autopilota senza i conti dei guasti del supervisore, o `undefined` se non ne aveva. Pura. */
export function senzaContatoriSupervisore(a: Autopilota): Autopilota | undefined {
  const conti = (x: { supervisoreMancato?: number }): boolean => (x.supervisoreMancato ?? 0) > 0
  if (!conti(a) && !a.chats.some(conti)) return undefined
  const { supervisoreMancato: _a, ...resto } = a
  return {
    ...resto,
    chats: a.chats.map((c) => {
      if (!conti(c)) return c
      const { supervisoreMancato: _c, ...senza } = c
      return senza
    })
  }
}

/**
 * Alla partenza del servizio: se la versione è cambiata dall'ultima volta,
 * toglie i conti a tutti e ricorda la versione. Torna quanti autopiloti ha
 * toccato. Senza versione (avviato a mano) non fa niente.
 */
export function azzeraContatoriSeNuovaVersione(p: {
  versione: string | undefined
  file: string
  autopiloti: Autopilota[]
  salva: (a: Autopilota) => void
}): number {
  if (p.versione === undefined || p.versione === '') return 0
  if (leggiVersioneContatori(p.file) === p.versione) return 0
  let n = 0
  for (const a of p.autopiloti) {
    const pulito = senzaContatoriSupervisore(a)
    if (pulito === undefined) continue
    p.salva(pulito)
    n += 1
  }
  scriviVersioneContatori(p.file, p.versione)
  return n
}
