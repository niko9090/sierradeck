import { chatAlLavoro, type Autopilota } from './autopilota'
import { statoAutopilotaDalVivo } from './stato-dal-vivo'
import { stato, trova, type StatoVista } from './stato-vista'

/**
 * Gli autopiloti riprogettati (0.70.0), come Progetti: una tabella con lo stato
 * in una parola, i gruppi, un solo verbo per riga. Le regole stanno qui e le
 * applica il PC; la pagina e l'app disegnano `vista`.
 *
 * Prima la riga diceva tre stati insieme («al lavoro — 0 interventi», «al
 * lavoro · da 2 min», «programma: guasto…») e il verde contraddiceva il guasto.
 */

export type GruppoAp = 'lavoro' | 'aspettano' | 'fermi' | 'finiti' | 'tutti'
export type AzioneAp = 'rispondi' | 'riprendi' | 'ferma' | 'nessuna'

export type VistaAutopilota = {
  stato: StatoVista
  gruppi: Exclude<GruppoAp, 'tutti'>[]
  criteri: { fatti: number; totali: number; testo: string }
  chat: { totali: number; alLavoro: number; testo: string }
  ultima: string
  da: string
  azione: AzioneAp
}

export const GRUPPI_AP: { id: GruppoAp; testo: string }[] = [
  { id: 'aspettano', testo: 'Aspettano te' },
  { id: 'lavoro', testo: 'Al lavoro' },
  { id: 'fermi', testo: 'Fermi' },
  { id: 'finiti', testo: 'Finiti' },
  { id: 'tutti', testo: 'Tutti' }
]

/** Dal più importante. */
const RANGO: Record<string, number> = { guasto: 0, aspetta: 1, 'senza-segni': 2, 'al-lavoro': 3, prepara: 4, pronto: 5, fermo: 6, finito: 7 }

/**
 * Lo stato in una parola. Vince il primo che vale: guasto (fallito) › aspetta
 * te › senza segni › al lavoro › si prepara › pronto › fermo › finito.
 */
export function vistaAutopilota(a: Autopilota & { domanda?: unknown }, ora: number, ultimoSegno?: number): VistaAutopilota {
  const dv = statoAutopilotaDalVivo(a, ora, ultimoSegno)
  const motivo = a.motivoSospensione
  let s: StatoVista
  if (a.stato === 'fallito') s = stato('guasto', 'guasto', 'rosso', motivo)
  else if (dv.etichetta === 'aspetta te' || (a.stato === 'intervista' && motivo !== undefined)) s = stato('aspetta', 'aspetta te', 'ambra', motivo)
  else if (dv.senzaSegni !== undefined) s = stato('senza-segni', 'senza segni', 'ambra', dv.senzaSegni)
  else if (a.stato === 'lavoro') s = stato('al-lavoro', 'al lavoro', 'verde')
  else if (a.stato === 'intervista') s = stato('prepara', 'si prepara', 'blu', 'guarda il progetto e prepara i criteri')
  else if (a.stato === 'pronto') s = stato('pronto', 'pronto', 'blu', 'aspetta il tuo «Vai»')
  else if (a.stato === 'finito') s = stato('finito', 'finito', 'verde')
  // Rosso come il LED e la pagina/app (0.80.0): prima qui era grigio.
  else s = stato('fermo', 'fermo', 'rosso', motivo)

  const gruppi: Exclude<GruppoAp, 'tutti'>[] = []
  if (s.id === 'guasto' || s.id === 'aspetta' || s.id === 'senza-segni' || s.id === 'pronto') gruppi.push('aspettano')
  if (s.id === 'al-lavoro' || s.id === 'senza-segni' || s.id === 'prepara') gruppi.push('lavoro')
  if (s.id === 'fermo' || s.id === 'guasto') gruppi.push('fermi')
  if (s.id === 'finito') gruppi.push('finiti')

  const fatti = a.criteri.filter((c) => c.soddisfatto).length
  const totali = a.criteri.length
  const alLavoro = a.chats.filter((c) => chatAlLavoro(a, c)).length
  const azione: AzioneAp = s.id === 'aspetta' ? 'rispondi'
    : s.id === 'al-lavoro' || s.id === 'senza-segni' || s.id === 'prepara' ? 'ferma'
      : 'riprendi'
  return {
    stato: s,
    gruppi,
    criteri: { fatti, totali, testo: totali === 0 ? '—' : `${fatti}/${totali}` },
    chat: { totali: a.chats.length, alLavoro, testo: a.chats.length === 0 ? '—' : alLavoro > 0 ? `${a.chats.length} · ${alLavoro} al lavoro` : String(a.chats.length) },
    ultima: dv.ultimaAzione !== '' ? dv.ultimaAzione : (motivo ?? '').replace(/\s+/g, ' ').slice(0, 140),
    da: dv.da,
    azione
  }
}

export function contaGruppiAp(v: VistaAutopilota[]): Record<GruppoAp, number> {
  const n: Record<GruppoAp, number> = { lavoro: 0, aspettano: 0, fermi: 0, finiti: 0, tutti: v.length }
  for (const x of v) for (const g of x.gruppi) n[g] += 1
  return n
}

export function nelGruppoAp(v: VistaAutopilota, g: GruppoAp): boolean {
  return g === 'tutti' || v.gruppi.includes(g)
}

/** Per stato (importanza), poi il più recente. Stabile. */
export function ordinaAutopiloti<T extends { vista: VistaAutopilota; ultimoEvento?: string }>(righe: T[]): T[] {
  return righe.map((r, i) => ({ r, i })).sort((a, b) =>
    (RANGO[a.r.vista.stato.id] ?? 9) - (RANGO[b.r.vista.stato.id] ?? 9) ||
    (b.r.ultimoEvento ?? '').localeCompare(a.r.ultimoEvento ?? '') ||
    a.i - b.i
  ).map((x) => x.r)
}

export function cercaAutopiloti<T extends { nome: string; obiettivo: string; cwd: string }>(righe: T[], q: string): T[] {
  if (q.trim() === '') return righe
  return righe.filter((a) => trova(`${a.nome} ${a.obiettivo} ${a.cwd}`, q))
}

/** Un PC che non risponde è una riga sola, «non risponde», con la spiegazione dietro il «?». */
export function rigaPcMuto(errore: string): StatoVista {
  return stato('muto', 'non risponde', 'ambra', errore)
}
